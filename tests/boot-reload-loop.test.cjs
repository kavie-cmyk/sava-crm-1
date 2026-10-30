/* Sự cố vòng lặp reload vô hạn (30/10/2026) — hồi quy:
   User mở app thì kẹt ở "đã đăng nhập - đang kiểm tra quyền" -> "đang tải
   dữ liệu từ supabase" -> quay lại từ đầu, không bao giờ vào được app.
   Nguyên nhân gốc (đã tái hiện bằng harness này TRƯỚC khi sửa: cả 3 biến
   thể cache đều reload ở 6/6 chu kỳ, không mở khoá lần nào):
     1. supabase-adapter.crmRowsToState() trả state THIẾU khoá `verticals`
        trong khi shared.migrateState() bổ sung `verticals: []` mỗi lần
        loadState() và loadState() ghi lại cache vô điều kiện -> cache sau
        khi trang nạp không bao giờ trùng chuỗi JSON của máy chủ.
     2. supabase-data.loadAll() tính `changed` bằng SO CHUỖI JSON THÔ
        (priorCrm !== crmJson) -> changed = true ở MỌI lần nạp.
     3. supabase-auth.proceed() tải lại trang khi `changed || prevHash
        !== hash` -> changed=true là đủ để reload vô hạn.
   Harness này chạy CODE THẬT (supabase-adapter + supabase-data +
   supabase-auth + shared.js, đúng thứ tự nạp của index.html: script
   trang `let S = loadState()` chạy TRƯỚC DOMContentLoaded của auth) với
   mock Supabase đúng hình máy chủ hiện tại (members chỉ còn zac "Bự"
   Admin + hoangdaden BD; dữ liệu nghiệp vụ trống) cho 4 biến thể cache:
     (a) cache trống / trình duyệt mới;
     (b) cache chứa state cũ thời mẫu (members linh/tuan/mai + dữ liệu
         mẫu + khoá __pre_supabase_backup);
     (c) cache = đúng dữ kiện máy chủ hiện tại;
     (d) cache = dữ kiện máy chủ nhưng chuỗi JSON khác thứ tự khoá và có
         thêm siêu dữ liệu cục bộ _crmRev/_crmTab (hình cache thật sau
         khi app đã lưu ít nhất 1 lần).
   Khẳng định cho MỌI biến thể:
     (i)  app mở khoá được sau TỐI ĐA 1 lần reload tự động;
     (ii) 0 lần ghi lên mock server trong suốt quá trình boot VÀ ở lần
          save() đầu tiên sau khi vào app (mục đích gốc của dfbe2cd:
          dữ liệu mẫu/cache cũ không bao giờ bị đẩy ngược lên máy chủ);
     (iii) state trong bộ nhớ khi vào được app là dữ liệu máy chủ
          (members đúng [zac, hoangdaden], không còn bản ghi mẫu). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');
const CRM = 'sava_crm_shared_v1', PUB = 'sava_publishing_v1';

/* ---------- mock Supabase: đúng hình máy chủ hiện tại ---------- */
function serverTables() {
  const crm = {
    members: [
      { id: 'zac', name: 'Bự', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
    ],
    companies: [], games: [], deals: [], leads: [], tasks: [], activities: [],
  };
  const t = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(crm))) t[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows({ version: 1, requests: [], marketUpdates: [] }, new Set()))) {
    if (k !== 'materialized') t[k] = v;
  }
  t.profiles = [{ id: 'u-zac', member_id: 'zac', email: 'zac@savameta.com' }];
  return t;
}
function serverStates() {
  const t = serverTables();
  return {
    crm: A.crmRowsToState(t),
    pub: A.publishingRowsToState({ publishing_requests: [], publishing_revisions: [], publishing_revision_private: [], publishing_request_intake_private: [], market_observations: [], market_observation_audit: [] }),
  };
}
function makeClient(db, writes) {
  function builder(table) {
    const b = { table, eqF: null };
    b.select = () => b; b.order = () => b;
    b.eq = (c, v) => { b.eqF = { c, v }; return b; };
    b.maybeSingle = async () => {
      const rows = (db[table] || []).filter(r => !b.eqF || String(r[b.eqF.c]) === String(b.eqF.v));
      return { data: rows[0] || null, error: null };
    };
    b.upsert = rows => { writes.push({ op: 'upsert', table, rows: JSON.parse(JSON.stringify(rows)) }); return b; };
    b.insert = rows => { writes.push({ op: 'insert', table, rows: JSON.parse(JSON.stringify(rows)) }); return b; };
    b.delete = () => { writes.push({ op: 'delete', table }); return b; };
    b.update = () => { writes.push({ op: 'update', table }); return b; };
    b.in = () => b;
    b.then = (res, rej) => Promise.resolve().then(() => {
      let out = (db[table] || []).slice();
      if (b.eqF) out = out.filter(r => String(r[b.eqF.c]) === String(b.eqF.v));
      return { data: out.map(r => ({ ...r })), error: null };
    }).then(res, rej);
    return b;
  }
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u-zac', email: 'zac@savameta.com' } } } }),
      onAuthStateChange: () => {}, signOut: async () => {},
      signInWithPassword: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
    },
    from: t => builder(t),
  };
}

/* ---------- mock trình duyệt ---------- */
function makeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeEl(id) {
  const classes = new Set();
  return {
    id, style: {}, textContent: '', innerHTML: '', value: '', _l: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, f) => { f ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) },
    setAttribute() {}, appendChild() {}, addEventListener(ev, fn) { this._l[ev] = fn; }, remove() {}, focus() {},
  };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function bootCycle(storage, sessionStore, stats) {
  const client = makeClient(serverTables(), stats.writes);
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
    location: { pathname: '/index.html', href: 'http://localhost/index.html', search: '', hash: '', replace: () => {}, reload: () => { stats.reloads++; } },
    history: { replaceState() {} },
  };
  sandbox.window = sandbox;
  sandbox.window.savaSupabase = () => client;
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-adapter.js'), sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  vm.runInContext(read('supabase-auth.js'), sandbox);
  vm.runInContext(read('shared.js'), sandbox);
  /* Script thân trang của index.html: `let S = loadState();` — chạy TRƯỚC
     DOMContentLoaded, tức state trong bộ nhớ được parse từ cache CŨ. */
  vm.runInContext('globalThis.__S = loadState();', sandbox);
  if (dcl) dcl();
  await wait(80);
  return { sandbox, unlocked: !docClasses.has('sava-locked'), status: getEl('savaAuthStatus').textContent };
}

async function runVariant(initLS) {
  const storage = makeStorage(initLS);
  const sessionStore = makeStorage();
  const stats = { reloads: 0, writes: [] };
  let last = null;
  for (let i = 0; i < 5; i++) {
    const before = stats.reloads;
    last = await bootCycle(storage, sessionStore, stats);
    if (last.unlocked) break;
    assert.equal(stats.reloads - before, 1, 'chu kỳ chưa vào được app thì phải do đúng 1 lần reload tự động gây ra');
  }
  return { storage, stats, last };
}

const STALE = {
  members: [
    { id: 'zac', name: 'Zac', role: 'Admin', active: true },
    { id: 'linh', name: 'Linh', role: 'BD', active: true },
    { id: 'tuan', name: 'Tuấn', role: 'BD', active: true },
    { id: 'mai', name: 'Mai', role: 'MKT', active: true },
  ],
  companies: [{ id: 'c1', name: 'Hanbit (mẫu)', type: 'Publisher', roles: { game_studio: 'Publisher' }, contact: '', phone: '', last: '' }],
  games: [{ id: 'g1', title: 'Puzzle Cats (mẫu)', own: 'ours', genre: '', platform: '', stage: '', emoji: '', desc: '', bdNote: '' }],
  deals: [], leads: [], tasks: [], activities: [], verticals: [],
};
const STALE_PUB = { version: 1, requests: [{ id: 'REV-OLD', kind: 'game', entityId: 'g1', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', current: {}, revisions: [], revision: 0 }], marketUpdates: [] };

const VARIANTS = [
  ['(a) cache trống / trình duyệt mới', () => ({}), 1],
  ['(b) cache chứa state cũ thời mẫu (linh/tuan/mai + dữ liệu mẫu + backup)', () => ({ [CRM]: JSON.stringify(STALE), [PUB]: JSON.stringify(STALE_PUB), [CRM + '__pre_supabase_backup']: JSON.stringify(STALE) }), 1],
  ['(c) cache = đúng dữ kiện máy chủ hiện tại', () => { const s = serverStates(); return { [CRM]: JSON.stringify(s.crm), [PUB]: JSON.stringify(s.pub) }; }, 0],
  ['(d) cache = dữ kiện máy chủ nhưng khác thứ tự khoá + có _crmRev/_crmTab', () => {
    const s = serverStates();
    const shuffled = { _crmRev: 7, _crmTab: 'tab-test', activities: [], tasks: [], leads: [], deals: [], games: [], companies: [], members: s.crm.members, verticals: [] };
    return { [CRM]: JSON.stringify(shuffled), [PUB]: JSON.stringify(s.pub) };
  }, 0],
];

for (const [name, init, expectedReloads] of VARIANTS) {
  test('boot ' + name + ': vào được app sau tối đa 1 reload, 0 ghi ngược lên server', { timeout: 30000 }, async () => {
    const { storage, stats, last } = await runVariant(init());
    assert.equal(last.unlocked, true, 'app phải mở khoá được (trạng thái cuối: ' + last.status + ')');
    assert.equal(stats.reloads, expectedReloads, 'số lần reload tự động phải đúng kỳ vọng và ≤ 1');
    /* State trong bộ nhớ khi vào app = dữ liệu máy chủ, không còn mẫu. */
    const S = last.sandbox.__S;
    assert.deepEqual([...S.members.map(m => m.id)], ['zac', 'hoangdaden']);
    assert.equal(S.members[0].name, 'Bự');
    assert.equal(S.companies.length, 0);
    assert.equal(S.games.length, 0);
    /* Mô phỏng lần save() đầu tiên sau khi vào app (ghi lại đúng state
       trong bộ nhớ xuống cache) + chờ diff-sync chạy: vẫn 0 ghi lên
       server — dữ liệu mẫu/cache cũ không có đường đẩy ngược. */
    storage.setItem(CRM, JSON.stringify(S));
    storage.setItem(PUB, storage.getItem(PUB));
    await wait(1200);
    assert.equal(stats.writes.length, 0, 'không được có bất kỳ ghi nào lên máy chủ: ' + JSON.stringify(stats.writes));
  });
}

test('loadAll ổn định: nạp lần 2 sau khi app đã ghi lại cache (loadState) -> changed=false', { timeout: 30000 }, async () => {
  /* Tầng dữ liệu thuần (không auth): chu trình loadAll -> loadState ghi
     lại cache -> loadAll phải báo changed=false, nếu không mọi cơ chế
     chống lặp ở tầng auth cũng chỉ là che triệu chứng. */
  const storage = makeStorage({ [CRM]: JSON.stringify(STALE), [PUB]: JSON.stringify(STALE_PUB) });
  const writes = [];
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone, localStorage: storage,
    document: { getElementById: () => null, createElement: () => makeEl('x'), body: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('shared.js'), sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(makeClient(serverTables(), writes), 'bd');
  const first = await D.loadAll();
  assert.equal(first.changed, true, 'cache mẫu cũ khác máy chủ -> lần nạp đầu changed=true');
  sandbox.loadState(); /* trang tải lại: app parse + ghi lại cache từ dữ liệu máy chủ */
  const second = await D.loadAll();
  assert.equal(second.changed, false, 'dữ liệu máy chủ phải ỔN ĐỊNH qua các lần nạp liên tiếp (changed=false ở lần 2)');
  assert.equal(second.hash, first.hash, 'hash dữ liệu máy chủ phải ổn định qua các lần nạp');
  assert.equal(writes.length, 0);
});

test('adapter: crmRowsToState trả đủ hình dạng chuẩn của app (có khoá verticals)', () => {
  const st = A.crmRowsToState(serverTables());
  assert.deepEqual(Object.keys(st), ['members', 'companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'verticals']);
  assert.deepEqual([...st.verticals], []);
});
