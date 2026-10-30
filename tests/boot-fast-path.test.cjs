/* Boot MỞ-NHANH (optimistic unlock) — sửa trải nghiệm khởi động sau
   9a68dad: vòng lặp reload đã hết nhưng MỌI lần Back/F5/chuyển trang
   vẫn qua cổng chặn toàn màn hình "đang kiểm tra quyền" -> "đang tải
   dữ liệu từ Supabase" vì proceed() luôn khoá chờ loadAll().

   Hành vi đích được khẳng định ở đây (harness chạy CODE THẬT
   supabase-adapter + supabase-data + supabase-auth + shared.js):
   (1) Phiên còn hạn lưu trong localStorage (khoá sb-<ref>-auth-token)
       + cache đã từng đồng bộ cho đúng user (sava_cache_synced_v1) +
       danh tính đã kiểm chứng (sava_identity_cache_v1) khớp vai–trang
       => app MỞ KHOÁ ĐỒNG BỘ ngay khi supabase-auth.js được nạp (trước
       DOMContentLoaded, tức trước khung hình đầu tiên), 0 cổng, 0 reload.
   (2) Kiểm chứng ngầm: dữ liệu server KHÔNG đổi -> không re-render,
       không reload, đồng bộ ghi được bật, 0 ghi ngược trong lúc boot.
   (3) Dữ liệu server CÓ đổi -> cache được cập nhật + hook
       __savaOnDataRefreshed của trang được gọi đúng 1 lần để render
       lại TẠI CHỖ (state trong bộ nhớ thành dữ liệu mới), vẫn 0 reload.
   (4) Member bị ngừng hoạt động phát hiện ở kiểm chứng ngầm -> ĐĂNG
       XUẤT thật (signOut) + xoá dấu vết mở-nhanh + khoá về màn hình
       đăng nhập kèm lý do; đồng bộ ghi không bao giờ được bật.
   (5) Thiếu phiên / token hết hạn / dấu đồng bộ của user khác -> KHÔNG
       mở-nhanh: trang vẫn khoá tại thời điểm nạp script (cổng cũ chạy).
   (6) Tầng dữ liệu: người dùng sửa cache TRONG lúc loadAll ngầm đang
       chạy (localDirty) -> loadAll không ghi đè bản sửa, báo
       localDirty để auth bật đồng bộ đẩy diff thay vì reload/render đè.

   Ghi chú về boot-reload-loop.test.cjs: harness đó KHÔNG có token
   phiên trong localStorage nên đường mở-nhanh không kích hoạt và các
   khẳng định cũ (tối đa 1 reload ở cổng đầy đủ, 0 ghi ngược) giữ
   nguyên không đổi — đường reload-1-lần chỉ còn cho lần mở đầu khi
   cache chưa mang hình máy chủ, đúng điều kiện cũ của 9a68dad. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');
const CRM = 'sava_crm_shared_v1', PUB = 'sava_publishing_v1';
const SB_KEY = 'sb-vaegwvawlwpckfkmjzsj-auth-token';
const SYNCED = 'sava_cache_synced_v1', IDENTITY = 'sava_identity_cache_v1';

function serverTables({ extraCompany = null, zacActive = true } = {}) {
  const crm = {
    members: [
      { id: 'zac', name: 'Bự', role: 'Admin', active: zacActive },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'mai', name: 'Mai', role: 'MKT', active: true },
    ],
    companies: extraCompany ? [extraCompany] : [], games: [], deals: [], leads: [], tasks: [], activities: [],
  };
  const t = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(crm))) t[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows({ version: 1, requests: [], marketUpdates: [] }, new Set()))) {
    if (k !== 'materialized') t[k] = v;
  }
  t.profiles = [
    { id: 'u-zac', member_id: 'zac', email: 'zac@savameta.com' },
    { id: 'u-mai', member_id: 'mai', email: 'mai@savameta.com' },
  ];
  return t;
}
function serverStates(opts) {
  const t = serverTables(opts);
  return { crm: A.crmRowsToState(t), pub: A.publishingRowsToState({ publishing_requests: [], publishing_revisions: [], publishing_revision_private: [], publishing_request_intake_private: [], market_observations: [], market_observation_audit: [] }) };
}
function makeClient(db, stats, sessionUser) {
  function builder(table) {
    const b = { table, eqF: null };
    b.select = () => b; b.order = () => b;
    b.eq = (c, v) => { b.eqF = { c, v }; return b; };
    b.maybeSingle = async () => {
      const rows = (db[table] || []).filter(r => !b.eqF || String(r[b.eqF.c]) === String(b.eqF.v));
      return { data: rows[0] || null, error: null };
    };
    b.upsert = rows => { stats.writes.push({ op: 'upsert', table }); return b; };
    b.insert = rows => { stats.writes.push({ op: 'insert', table }); return b; };
    b.delete = () => { stats.writes.push({ op: 'delete', table }); return b; };
    b.update = () => { stats.writes.push({ op: 'update', table }); return b; };
    b.in = () => b;
    b.then = (res, rej) => Promise.resolve().then(() => {
      let out = (db[table] || []).slice();
      if (b.eqF) out = out.filter(r => String(r[b.eqF.c]) === String(b.eqF.v));
      return { data: out.map(r => ({ ...r })), error: null };
    }).then(res, rej);
    return b;
  }
  const client = {
    _cb: null,
    auth: {
      getSession: async () => ({ data: { session: { user: sessionUser, access_token: 'at-test' } } }),
      onAuthStateChange: cb => { client._cb = cb; },
      signOut: async () => { stats.signOuts++; if (client._cb) client._cb('SIGNED_OUT', null); },
      signInWithPassword: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
    },
    from: t => builder(t),
  };
  return client;
}
function makeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeEl(id) {
  const classes = new Set(id === 'savaBlockedCard' || id === 'savaUserBar' || id === 'savaSetPasswordCard' ? ['sava-hidden'] : []);
  return {
    id, style: {}, textContent: '', innerHTML: '', value: '', _l: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, f) => { f ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) },
    setAttribute() {}, appendChild() {}, addEventListener(ev, fn) { this._l[ev] = fn; }, remove() {}, focus() {},
  };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function fastInit({ userId = 'u-zac', email = 'zac@savameta.com', memberId = 'zac', name = 'Bự', role = 'admin', memberRole = 'Admin', expiresIn = 3600, withToken = true, syncedUserId = null } = {}) {
  const s = serverStates();
  const init = { [CRM]: JSON.stringify(s.crm), [PUB]: JSON.stringify(s.pub) };
  if (withToken) {
    init[SB_KEY] = JSON.stringify({ access_token: 'at-test', refresh_token: 'rt-test', expires_at: Math.floor(Date.now() / 1000) + expiresIn, token_type: 'bearer', user: { id: userId, email } });
    init[SYNCED] = JSON.stringify({ userId: syncedUserId || userId, hash: 'h-prev', at: '2026-10-30T00:00:00.000Z' });
    init[IDENTITY] = JSON.stringify({ userId, memberId, name, role, memberRole, email });
  }
  return init;
}

async function bootFast({ serverOpts = {}, init = null, pathname = '/index.html', sessionUser = { id: 'u-zac', email: 'zac@savameta.com' } } = {}) {
  const storage = makeStorage(init || fastInit());
  const sessionStore = makeStorage();
  const stats = { reloads: 0, writes: [], signOuts: 0, refreshCalls: 0 };
  const client = makeClient(serverTables(serverOpts), stats, sessionUser);
  const els = {}; const getEl = id => els[id] || (els[id] = makeEl(id));
  const docClasses = new Set(['sava-locked']);
  let dcl = null;
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone,
    localStorage: storage, sessionStorage: sessionStore,
    document: {
      readyState: 'loading',
      documentElement: { classList: { add: c => docClasses.add(c), remove: c => docClasses.delete(c), contains: c => docClasses.has(c) } },
      getElementById: getEl, createElement: () => makeEl('dyn'), body: { appendChild() {} },
      addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') dcl = fn; },
      querySelector: () => null,
    },
    location: { pathname, href: 'http://localhost' + pathname, search: '', hash: '', replace: () => {}, reload: () => { stats.reloads++; } },
    history: { replaceState() {} },
  };
  sandbox.window = sandbox;
  sandbox.window.savaSupabase = () => client;
  sandbox.window.SAVA_SUPABASE_URL = 'https://vaegwvawlwpckfkmjzsj.supabase.co';
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-adapter.js'), sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  vm.runInContext(read('supabase-auth.js'), sandbox);
  /* NGAY SAU KHI SCRIPT AUTH NẠP (chưa DOMContentLoaded = chưa khung
     hình đầu tiên): đây là khẳng định chống "cổng thoáng qua". */
  const unlockedAtScriptTime = !docClasses.has('sava-locked');
  const optimisticAtScriptTime = docClasses.has('sava-optimistic');
  vm.runInContext(read('shared.js'), sandbox);
  vm.runInContext('globalThis.__S = loadState();', sandbox);
  /* Hook của trang (index.html/publishing.js gắn ngoài đời thật): nạp
     lại state trong bộ nhớ từ cache + đếm số lần được gọi. */
  sandbox.window.__savaOnDataRefreshed = () => { stats.refreshCalls++; sandbox.__S = sandbox.loadState(); };
  if (dcl) dcl();
  await wait(100);
  return { sandbox, storage, stats, docClasses, unlockedAtScriptTime, optimisticAtScriptTime, getEl };
}

test('fast boot: phiên hợp lệ + cache đã đồng bộ -> mở khoá ngay khi nạp script, 0 cổng, 0 reload, không đổi dữ liệu thì không re-render', async () => {
  const r = await bootFast();
  assert.equal(r.unlockedAtScriptTime, true, 'app phải mở khoá ĐỒNG BỘ ngay khi supabase-auth.js nạp xong');
  assert.equal(r.optimisticAtScriptTime, true, 'phải gắn class sava-optimistic để auth.css giấu thẻ đăng nhập');
  assert.equal(r.docClasses.has('sava-locked'), false, 'sau kiểm chứng ngầm app vẫn mở');
  assert.equal(r.stats.reloads, 0, 'đường phổ biến: 0 reload');
  assert.equal(r.stats.refreshCalls, 0, 'dữ liệu server không đổi -> không re-render gây giật');
  assert.equal(r.stats.writes.length, 0, '0 ghi ngược lên server trong lúc boot');
  assert.equal(r.sandbox.window.SavaData._ctx.enabled, true, 'đồng bộ ghi chỉ bật SAU khi loadAll ngầm xong');
  assert.match(r.getEl('savaUserInfo').textContent, /Bự · Admin/);
  assert.deepEqual([...r.sandbox.__S.members.map(m => m.id)], ['zac', 'hoangdaden', 'mai']);
});

test('fast boot: server có dữ liệu mới -> cập nhật tại chỗ qua hook, vẫn 0 reload, 0 cổng', async () => {
  const extra = { id: 'c-new', name: 'NewCo Studio', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: '', phone: '', last: '' };
  const r = await bootFast({ serverOpts: { extraCompany: extra } });
  assert.equal(r.unlockedAtScriptTime, true);
  assert.equal(r.stats.reloads, 0);
  assert.equal(r.stats.refreshCalls, 1, 'dữ liệu đổi -> hook render-tại-chỗ được gọi đúng 1 lần');
  assert.equal(r.sandbox.__S.companies.length, 1, 'state trong bộ nhớ đã là dữ liệu mới');
  assert.equal(r.sandbox.__S.companies[0].name, 'NewCo Studio');
  assert.equal(JSON.parse(r.storage.getItem(CRM)).companies[0].name, 'NewCo Studio');
  assert.equal(r.docClasses.has('sava-locked'), false);
  assert.equal(r.stats.writes.length, 0);
});

test('fast boot: member bị ngừng hoạt động phát hiện ở kiểm chứng ngầm -> đăng xuất + về màn hình đăng nhập', async () => {
  const r = await bootFast({ serverOpts: { zacActive: false } });
  assert.equal(r.unlockedAtScriptTime, true, 'vẫn mở-nhanh trước khi kiểm chứng ngầm trả về');
  assert.equal(r.docClasses.has('sava-locked'), true, 'phát hiện thu hồi -> khoá lại');
  assert.equal(r.getEl('savaLoginCard').classList.contains('sava-hidden'), false, 'hiện form đăng nhập');
  assert.match(r.getEl('savaAuthStatus').textContent, /ngừng hoạt động/);
  assert.ok(r.stats.signOuts >= 1, 'phải signOut thật');
  assert.equal(r.storage.getItem(SYNCED), null, 'xoá dấu đồng bộ mở-nhanh');
  assert.equal(r.storage.getItem(IDENTITY), null, 'xoá danh tính đã lưu');
  assert.equal(r.sandbox.window.SavaData._ctx.enabled, false, 'đồng bộ ghi không bao giờ được bật');
  assert.equal(r.stats.reloads, 0);
});

test('fast boot: MKT ở mkt.html cũng mở-nhanh đúng vai', async () => {
  const init = fastInit({ userId: 'u-mai', email: 'mai@savameta.com', memberId: 'mai', name: 'Mai', role: 'mkt', memberRole: 'MKT' });
  const r = await bootFast({ init, pathname: '/mkt.html', sessionUser: { id: 'u-mai', email: 'mai@savameta.com' } });
  assert.equal(r.unlockedAtScriptTime, true);
  assert.equal(r.docClasses.has('sava-locked'), false);
  assert.equal(r.stats.reloads, 0);
  assert.match(r.getEl('savaUserInfo').textContent, /Mai · MKT/);
});

test('fast boot: thiếu token phiên -> KHÔNG mở-nhanh, cổng cũ giữ nguyên', async () => {
  const r = await bootFast({ init: fastInit({ withToken: false }) });
  assert.equal(r.unlockedAtScriptTime, false, 'không có phiên lưu -> trang vẫn khoá tại thời điểm nạp script');
  assert.equal(r.optimisticAtScriptTime, false);
});

test('fast boot: token hết hạn -> KHÔNG mở-nhanh', async () => {
  const r = await bootFast({ init: fastInit({ expiresIn: -60 }) });
  assert.equal(r.unlockedAtScriptTime, false);
  assert.equal(r.optimisticAtScriptTime, false);
});

test('fast boot: dấu đồng bộ là của user khác -> KHÔNG mở-nhanh', async () => {
  const r = await bootFast({ init: fastInit({ syncedUserId: 'u-ai-khac' }) });
  assert.equal(r.unlockedAtScriptTime, false);
  assert.equal(r.optimisticAtScriptTime, false);
});

test('data localDirty: sửa cache trong lúc loadAll đang chạy -> không bị ghi đè, báo localDirty', async () => {
  const db = serverTables();
  const writes = [];
  const client = makeClient(db, { writes, signOuts: 0 }, { id: 'u-zac' });
  const s0 = serverStates();
  const storage = makeStorage({ [CRM]: JSON.stringify(s0.crm), [PUB]: JSON.stringify(s0.pub) });
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone, localStorage: storage,
    document: { getElementById: () => null, createElement: () => makeEl('x'), body: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'admin');
  const p = D.loadAll();
  /* Người dùng sửa NGAY trong cửa sổ nạp ngầm (cùng tick, trước khi
     các fetch của loadAll kịp resolve). */
  const edited = JSON.parse(storage.getItem(CRM));
  edited.companies.push({ id: 'c-local', name: 'Công ty vừa sửa', type: '', roles: {}, contact: '', phone: '', last: '' });
  storage.setItem(CRM, JSON.stringify(edited));
  const res = await p;
  assert.equal(res.localDirty, true);
  assert.equal(res.changed, true);
  const after = JSON.parse(storage.getItem(CRM));
  assert.equal(after.companies.some(c => c.id === 'c-local'), true, 'bản sửa trong lúc nạp KHÔNG được bị dữ liệu máy chủ ghi đè mất');
  /* Đối chứng: không sửa gì trong lúc nạp -> localDirty=false, cache
     được ghi đè bằng dữ liệu máy chủ như cũ. */
  const res2 = await D.loadAll();
  assert.equal(res2.localDirty, false);
});

test('tĩnh: cả 3 trang dùng chung cơ chế mở-nhanh (hook tại chỗ + css chống thoáng cổng + khoá dấu đồng bộ)', () => {
  assert.ok(read('index.html').includes('__savaOnDataRefreshed'), 'index.html phải gắn hook render tại chỗ');
  assert.ok(read('publishing.js').includes('__savaOnDataRefreshed'), 'publishing.js (dùng cho publishing.html + mkt.html) phải gắn hook render tại chỗ');
  assert.ok(read('auth.css').includes('sava-optimistic'), 'auth.css phải giấu thẻ auth ở chế độ mở-nhanh');
  assert.ok(read('supabase-auth.js').includes('sava_cache_synced_v1'));
  for (const f of ['index.html', 'publishing.html', 'mkt.html']) {
    assert.ok(read(f).includes('supabase-auth.js'), f + ' nạp supabase-auth.js (nơi quyết định mở-nhanh)');
  }
});
