/* Việc 2 — Hoàng (BD) bị bắt đăng nhập lại MỖI lần thoát trang vào lại.
   Tái hiện + hồi quy cho bất biến:
     "Phiên hợp lệ KHÔNG bao giờ bị đăng xuất vì lỗi mạng tạm thời hoặc
      phản hồi rỗng thoáng qua lúc kiểm chứng member ở kiểm chứng NGẦM
      của đường mở-nhanh (optimistic). Chỉ đăng xuất khi server xác nhận
      RÕ member bị ngừng hoạt động (dòng member tồn tại, active=false),
      hoặc khi phiên auth thật sự hết hiệu lực theo Supabase."

   Lỗi gốc (supabase-auth.js proceed(), trước sửa): ở đường MỞ-NHANH,
   MỌI kết quả kiểm chứng không-hoàn-hảo đều bị diễn giải thành thu hồi:
     - fetch profiles/members LỖI (mạng chập, throw, error trả về)
       -> forceSignOutToLogin() = signOut() THẬT (xoá phiên Supabase
          trong localStorage) + xoá boot cache;
     - fetch trả RỖNG (profile/member = null thoáng qua)
       -> cũng forceSignOutToLogin().
   Đường cổng đầy đủ (không mở-nhanh) KHÔNG signOut trong các trường
   hợp này (chỉ showBlocked) — nên người dùng chỉ trúng lỗi khi đã có
   đủ điều kiện mở-nhanh, và hễ lần vào lại nào kiểm chứng ngầm chập
   là mất phiên vĩnh viễn, lần sau phải đăng nhập lại từ đầu.

   Harness theo mẫu boot-fast-path.test.cjs (code thật adapter + data
   + auth + shared.js), mock client cho phép ép profiles/members trả
   lỗi / throw / rỗng / chập chờn (lỗi lần 1, thành công lần 2). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');
const CRM = 'sava_crm_shared_v1', PUB = 'sava_publishing_v1';
const SB_KEY = 'sb-vaegwvawlwpckfkmjzsj-auth-token';
const SYNCED = 'sava_cache_synced_v1', IDENTITY = 'sava_identity_cache_v1';

function serverTables({ hoangActive = true } = {}) {
  const crm = {
    members: [
      { id: 'zac', name: 'Bự', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: hoangActive },
    ],
    companies: [], games: [], deals: [], leads: [], tasks: [], activities: [],
  };
  const t = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(crm))) t[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows({ version: 1, requests: [], marketUpdates: [] }, new Set()))) {
    if (k !== 'materialized') t[k] = v;
  }
  t.profiles = [
    { id: 'u-zac', member_id: 'zac', email: 'zac@savameta.com' },
    { id: 'u-hoang', member_id: 'hoangdaden', email: 'hoangpc@savameta.com' },
  ];
  return t;
}
function serverStates(opts) {
  const t = serverTables(opts);
  return { crm: A.crmRowsToState(t), pub: A.publishingRowsToState({ publishing_requests: [], publishing_revisions: [], publishing_revision_private: [], publishing_request_intake_private: [], market_observations: [], market_observation_audit: [] }) };
}

/* identityMode ép hành vi của 2 truy vấn danh tính (profiles/members
   qua maybeSingle):
     ok           — trả dữ liệu thật từ db giả;
     error        — luôn trả { data:null, error:{message:'Failed to fetch'} };
     throw        — luôn ném ngoại lệ (mạng sập hẳn);
     empty        — profiles trả rỗng thành công (data null, không lỗi);
     empty-member — profile có nhưng members trả rỗng thành công;
     flaky        — profiles lỗi ở LẦN GỌI ĐẦU, từ lần 2 trả thật. */
function makeClient(db, stats, sessionUser, identityMode) {
  const idCalls = { profiles: 0, members: 0 };
  function builder(table) {
    const b = { table, eqF: null };
    b.select = () => b; b.order = () => b;
    b.eq = (c, v) => { b.eqF = { c, v }; return b; };
    b.maybeSingle = async () => {
      if (table === 'profiles' || table === 'members') {
        idCalls[table]++;
        const mode = identityMode || 'ok';
        if (mode === 'throw') throw new Error('Failed to fetch');
        if (mode === 'error') return { data: null, error: { message: 'Failed to fetch' } };
        if (mode === 'flaky' && table === 'profiles' && idCalls.profiles === 1) return { data: null, error: { message: 'Failed to fetch' } };
        if (mode === 'empty' && table === 'profiles') return { data: null, error: null };
        if (mode === 'empty-member' && table === 'members') return { data: null, error: null };
      }
      const rows = (db[table] || []).filter(r => !b.eqF || String(r[b.eqF.c]) === String(b.eqF.v));
      return { data: rows[0] || null, error: null };
    };
    b.upsert = () => { stats.writes.push({ op: 'upsert', table }); return b; };
    b.insert = () => { stats.writes.push({ op: 'insert', table }); return b; };
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
  const m = init instanceof Map ? init : new Map(Object.entries(init || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] || null, get length() { return m.size; }, _map: m,
  };
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

function hoangInit({ expiresIn = 3600, withToken = true } = {}) {
  const s = serverStates();
  const init = { [CRM]: JSON.stringify(s.crm), [PUB]: JSON.stringify(s.pub) };
  if (withToken) {
    init[SB_KEY] = JSON.stringify({ access_token: 'at-test', refresh_token: 'rt-test', expires_at: Math.floor(Date.now() / 1000) + expiresIn, token_type: 'bearer', user: { id: 'u-hoang', email: 'hoangpc@savameta.com' } });
    init[SYNCED] = JSON.stringify({ userId: 'u-hoang', hash: 'h-prev', at: '2026-11-02T00:00:00.000Z' });
    init[IDENTITY] = JSON.stringify({ userId: 'u-hoang', memberId: 'hoangdaden', name: 'Hoàng Daden', role: 'bd', memberRole: 'BD', email: 'hoangpc@savameta.com' });
  }
  return init;
}

async function boot({ serverOpts = {}, init = null, storage = null, identityMode = 'ok', waitMs = 2600 } = {}) {
  const store = storage || makeStorage(init || hoangInit());
  const sessionStore = makeStorage();
  const stats = { reloads: 0, writes: [], signOuts: 0, refreshCalls: 0 };
  const client = makeClient(serverTables(serverOpts), stats, { id: 'u-hoang', email: 'hoangpc@savameta.com' }, identityMode);
  const els = {}; const getEl = id => els[id] || (els[id] = makeEl(id));
  const docClasses = new Set(['sava-locked']);
  let dcl = null;
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone,
    localStorage: store, sessionStorage: sessionStore,
    document: {
      readyState: 'loading',
      documentElement: { classList: { add: c => docClasses.add(c), remove: c => docClasses.delete(c), contains: c => docClasses.has(c) } },
      getElementById: getEl, createElement: () => makeEl('dyn'), body: { appendChild() {} },
      addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') dcl = fn; },
      querySelector: () => null,
    },
    location: { pathname: '/index.html', href: 'http://localhost/index.html', search: '', hash: '', replace: () => {}, reload: () => { stats.reloads++; } },
    history: { replaceState() {} },
  };
  sandbox.window = sandbox;
  sandbox.window.savaSupabase = () => client;
  sandbox.window.SAVA_SUPABASE_URL = 'https://vaegwvawlwpckfkmjzsj.supabase.co';
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-adapter.js'), sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  vm.runInContext(read('supabase-auth.js'), sandbox);
  const unlockedAtScriptTime = !docClasses.has('sava-locked');
  vm.runInContext(read('shared.js'), sandbox);
  vm.runInContext('globalThis.__S = loadState();', sandbox);
  sandbox.window.__savaOnDataRefreshed = () => { stats.refreshCalls++; };
  if (dcl) dcl();
  await wait(waitMs);
  return { sandbox, storage: store, stats, docClasses, unlockedAtScriptTime, getEl };
}

test('mở-nhanh + kiểm chứng member LỖI MẠNG (error trả về): KHÔNG đăng xuất, phiên + boot cache còn nguyên, app vẫn mở từ cache', async () => {
  const r = await boot({ identityMode: 'error' });
  assert.equal(r.unlockedAtScriptTime, true, 'điều kiện mở-nhanh đủ -> mở khoá ngay khi nạp script');
  assert.equal(r.stats.signOuts, 0, 'lỗi mạng tạm thời ở kiểm chứng ngầm KHÔNG được signOut');
  assert.ok(r.storage.getItem(SB_KEY), 'phiên Supabase trong localStorage phải còn nguyên');
  assert.ok(r.storage.getItem(SYNCED), 'dấu đồng bộ mở-nhanh phải còn (lần vào sau vẫn mở-nhanh được)');
  assert.ok(r.storage.getItem(IDENTITY), 'danh tính đã lưu phải còn');
  assert.equal(r.docClasses.has('sava-locked'), false, 'app giữ mở từ cache như đường mất mạng của loadAll');
  assert.equal(r.sandbox.window.SavaData._ctx.enabled, false, 'chưa kiểm chứng + chưa nạp được dữ liệu -> đồng bộ ghi TẮT');
});

test('mở-nhanh + kiểm chứng member THROW (mạng sập): KHÔNG đăng xuất', async () => {
  const r = await boot({ identityMode: 'throw' });
  assert.equal(r.stats.signOuts, 0);
  assert.ok(r.storage.getItem(SB_KEY));
  assert.equal(r.docClasses.has('sava-locked'), false);
});

test('mở-nhanh + profiles trả RỖNG thoáng qua: KHÔNG đăng xuất (chặn xem, giữ phiên)', async () => {
  const r = await boot({ identityMode: 'empty' });
  assert.equal(r.stats.signOuts, 0, 'phản hồi rỗng KHÔNG phải bằng chứng thu hồi -> không signOut');
  assert.ok(r.storage.getItem(SB_KEY), 'phiên phải còn để lần vào sau tự hồi phục không cần đăng nhập lại');
  assert.equal(r.docClasses.has('sava-locked'), true, 'chưa xác nhận được danh tính thì app phải khoá lại (màn hình chặn), chỉ là không huỷ phiên');
  assert.equal(r.getEl('savaBlockedCard').classList.contains('sava-hidden'), false, 'hiện màn hình chặn có lý do');
  assert.equal(r.getEl('savaLoginCard').classList.contains('sava-hidden'), true, 'KHÔNG rơi về form đăng nhập');
});

test('mở-nhanh + members trả RỖNG thoáng qua: KHÔNG đăng xuất', async () => {
  const r = await boot({ identityMode: 'empty-member' });
  assert.equal(r.stats.signOuts, 0);
  assert.ok(r.storage.getItem(SB_KEY));
  assert.equal(r.getEl('savaLoginCard').classList.contains('sava-hidden'), true);
});

test('mở-nhanh + kiểm chứng CHẬP CHỜN (lỗi lần 1, được lần 2): tự thử lại và vào app bình thường, 0 đăng xuất, 0 reload', async () => {
  const r = await boot({ identityMode: 'flaky' });
  assert.equal(r.stats.signOuts, 0);
  assert.equal(r.stats.reloads, 0);
  assert.equal(r.docClasses.has('sava-locked'), false);
  assert.equal(r.sandbox.window.SavaData._ctx.enabled, true, 'kiểm chứng lại thành công -> quy trình thường: bật đồng bộ ghi sau loadAll');
  assert.match(r.getEl('savaUserInfo').textContent, /Hoàng Daden · BD/);
});

test('vào lại NHIỀU LẦN liên tiếp, lần nào kiểm chứng cũng lỗi mạng: vẫn 0 đăng xuất, phiên còn nguyên sau 3 lần', async () => {
  const shared = makeStorage(hoangInit());
  for (let i = 0; i < 3; i++) {
    const r = await boot({ storage: shared, identityMode: 'error' });
    assert.equal(r.stats.signOuts, 0, 'lần vào ' + (i + 1) + ': không được signOut');
    assert.equal(r.unlockedAtScriptTime, true, 'lần vào ' + (i + 1) + ': vẫn đủ điều kiện mở-nhanh (boot cache không bị xoá)');
  }
  assert.ok(shared.getItem(SB_KEY), 'sau 3 lần vào lại chập mạng, phiên vẫn còn trong localStorage');
});

test('đối chứng: server xác nhận RÕ member bị ngừng (active=false) ở kiểm chứng ngầm -> VẪN đăng xuất như cũ', async () => {
  const r = await boot({ serverOpts: { hoangActive: false }, waitMs: 600 });
  assert.ok(r.stats.signOuts >= 1, 'active=false là xác nhận rõ từ server -> signOut thật');
  assert.equal(r.docClasses.has('sava-locked'), true);
  assert.match(r.getEl('savaAuthStatus').textContent, /ngừng hoạt động/);
  assert.equal(r.storage.getItem(SYNCED), null);
  assert.equal(r.storage.getItem(IDENTITY), null);
});

test('cổng đầy đủ (token lưu đã hết hạn, getSession làm mới được) + kiểm chứng lỗi mạng: chặn xem, KHÔNG đăng xuất', async () => {
  const r = await boot({ init: hoangInit({ expiresIn: -60 }), identityMode: 'error' });
  assert.equal(r.unlockedAtScriptTime, false, 'token hết hạn -> không mở-nhanh, cổng đầy đủ chạy');
  assert.equal(r.stats.signOuts, 0);
  assert.equal(r.getEl('savaBlockedCard').classList.contains('sava-hidden'), false, 'hiện màn hình chặn như hành vi cũ của cổng đầy đủ');
});
