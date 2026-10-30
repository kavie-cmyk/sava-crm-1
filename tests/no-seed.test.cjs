/* Dọn dữ liệu test phía app (30/10/2026) — app KHÔNG còn seed dữ liệu mẫu:
   - shared.js: seed()/loadState() không còn trả dữ liệu mẫu nghiệp vụ;
     kho rỗng/hỏng -> trạng thái TRỐNG.
   - Đường hồi sinh qua save() + diff-sync bị chặn ở cổng auth: loadAll()
     báo `changed` khi cache cũ khác dữ liệu máy chủ và supabase-auth.js
     bắt buộc tải lại trang trước khi bật đồng bộ ghi.
   - import.html: đường upsert dữ liệu local lên máy chủ đã gỡ hẳn.
   Harness này dùng shared.js + supabase-data.js THẬT với Supabase client
   MOCK (không mạng) cho 2 tình huống bắt buộc:
     A. localStorage trống -> boot + đăng nhập (loadAll) -> CRM trống sạch,
        diff-sync không ghi gì lên "DB".
     B. localStorage chứa dữ liệu MẪU CŨ -> sau đăng nhập hiển thị theo máy
        chủ (trống) và KHÔNG có upsert nào chứa bản ghi mẫu.
   (Lớp auth đầy đủ với DOM được kiểm ở supabase-auth-gate.test.cjs; ở đây
   khẳng định tĩnh điều kiện tải lại `changed || prevHash !== hash`.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const CRM_KEY = 'sava_crm_shared_v1', PUB_KEY = 'sava_publishing_v1';
const PK = { members: ['id'], companies: ['id'], company_partner_eval_archive: ['company_id'], games: ['id'], leads: ['id'], deals: ['id'], deal_terms: ['deal_id'], deal_contracts: ['deal_id'], deal_leads: ['deal_id', 'lead_id'], tasks: ['id'], activities: ['id'], publishing_requests: ['id'], publishing_revisions: ['request_id', 'revision_no'], publishing_revision_private: ['request_id', 'revision_no'], publishing_request_intake_private: ['request_id'], market_observations: ['id'], market_observation_audit: ['observation_id', 'seq'] };

function makeMockClient(seedTables) {
  const db = JSON.parse(JSON.stringify(seedTables));
  const calls = [];
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === 'select') {
      let out = rows.slice();
      if (b.inFilter) out = out.filter(r => b.inFilter.values.includes(r[b.inFilter.col]));
      return { data: out.map(r => ({ ...r })), error: null };
    }
    if (b.op === 'upsert' || b.op === 'insert') {
      calls.push({ op: b.op, table: t, rows: JSON.parse(JSON.stringify(b.rows)) });
      const saved = [];
      for (const row of b.rows) {
        const rec = { ...row };
        const pk = PK[t];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (idx >= 0) { rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      return { data: saved, error: null };
    }
    if (b.op === 'delete') {
      calls.push({ op: 'delete', table: t });
      db[t] = rows.filter(r => !(b.inFilter && b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))));
      return { data: null, error: null };
    }
    if (b.op === 'update') {
      calls.push({ op: 'update', table: t });
      rows.forEach(r => { if (String(r[b.eqFilter.col]) === String(b.eqFilter.val)) Object.assign(r, b.patch); });
      return { data: null, error: null };
    }
    return { data: [], error: null };
  }
  function builder(table) {
    const b = { table, op: 'select', rows: null, opts: null, inFilter: null, eqFilter: null, patch: null };
    b.select = () => b;
    b.order = () => b;
    b.upsert = (rows, opts) => { b.op = 'upsert'; b.rows = rows; b.opts = opts; return b; };
    b.insert = rows => { b.op = 'insert'; b.rows = rows; return b; };
    b.delete = () => { b.op = 'delete'; return b; };
    b.update = patch => { b.op = 'update'; b.patch = patch; return b; };
    b.in = (col, values) => { b.inFilter = { col, values }; return b; };
    b.eq = (col, val) => { b.eqFilter = { col, val }; return b; };
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _db: db, _calls: calls };
}

function makeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeEl() { return { style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }

/* Máy chủ (mock): CHỈ có 4 members thật + 0 dữ liệu nghiệp vụ — đúng trạng
   thái Supabase sau khi dọn sạch ngày 30/10/2026. */
function serverTables() {
  const crmState = {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
      { id: 'tuan', name: 'Tuấn', role: 'BD', active: true },
      { id: 'mai', name: 'Mai', role: 'MKT', active: true },
    ],
    companies: [], games: [], deals: [], leads: [], tasks: [], activities: [],
  };
  const tables = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(crmState))) tables[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows({ version: 1, requests: [], marketUpdates: [] }, new Set()))) {
    if (k !== 'materialized') tables[k] = v;
  }
  return tables;
}

function boot(localStorage) {
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone, localStorage,
    document: { getElementById: () => null, createElement: () => makeEl(), body: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('shared.js'), sandbox, { filename: 'shared.js' });
  vm.runInContext(read('supabase-data.js'), sandbox, { filename: 'supabase-data.js' });
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const bizLens = st => ['companies', 'games', 'deals', 'leads', 'tasks', 'activities'].map(k => (st[k] || []).length);

/* Dữ liệu mẫu CŨ tiêu biểu (đúng hình seed production trước 30/10) dùng làm
   cache cũ của tình huống B — chỉ nằm trong test này, không ở production. */
const STALE_SAMPLE = {
  members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
  companies: [{ id: 'c1', name: 'Hanbit Publishing (mẫu)', type: 'Publisher', roles: { game_studio: 'Publisher' }, contact: 'Ms. Yoon', phone: '', last: 'Hôm qua' }],
  games: [{ id: 'g1', title: 'Puzzle Cats Adventure', own: 'ours', genre: 'Puzzle', platform: 'Android', stage: 'Beta', emoji: '', desc: '', bdNote: '' }],
  deals: [{ id: 'd1', line: 'game_studio', title: 'Puzzle Cats — chào Hanbit', company: 'c1', game: 'g1', stage: 'evaluating', owner: 'linh', due: '', idle: 1, custom: {} }],
  leads: [{ id: 'l1', name: 'Nguyễn Tuấn Minh (mẫu)', company: 'c1', person: 'Anh Minh', line: 'publishing', source: '', status: 'new', note: '', when: 'Hôm nay' }],
  tasks: [{ id: 't1', title: 'Việc mẫu', assignee: 'linh', due: 'Hôm nay', deal: 'd1', done: false, overdue: false }],
  activities: [{ id: 'a1', deal: 'd1', type: 'Note', who: 'linh', when: 'Hôm qua', text: 'Hoạt động mẫu' }],
};
const STALE_PUB = { version: 1, requests: [{ id: 'REV-OLD', kind: 'game', entityId: 'g1', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', current: {}, revisions: [], revision: 0 }], marketUpdates: [] };

test('tĩnh: production không còn seed mẫu / nút reset / đường import upsert', () => {
  const shared = read('shared.js');
  for (const needle of ['Hanbit', 'Puzzle Cats', 'FreshMart', 'PlayNest']) {
    assert.ok(!shared.includes(needle), 'shared.js còn dữ liệu mẫu: ' + needle);
  }
  const html = read('index.html');
  assert.ok(!html.includes('resetDemo'), 'index.html còn resetDemo');
  assert.ok(!html.includes('Đặt lại dữ liệu mẫu'), 'index.html còn nút đặt lại dữ liệu mẫu');
  const imp = read('import.html');
  assert.ok(imp.includes('ĐÃ NGỪNG HOẠT ĐỘNG'), 'import.html chưa ghi rõ đã ngừng hoạt động');
  assert.ok(!/\.upsert\(/.test(imp), 'import.html còn lời gọi upsert');
  assert.ok(!imp.includes('async function chunked'), 'import.html còn khối thực thi nạp');
  const auth = read('supabase-auth.js');
  assert.ok(auth.includes('changed || prevHash !== hash'), 'auth chưa bắt buộc tải lại khi cache bị loadAll thay đổi');
});

test('seed()/emptyState()/loadState() với kho rỗng -> trạng thái TRỐNG, không bản ghi mẫu', () => {
  const ls = makeLocalStorage();
  const ctx = boot(ls);
  /* Mảng sinh từ realm vm -> so độ dài thay cho deepStrictEqual trực tiếp. */
  assert.equal(ctx.seed().companies.length, 0);
  assert.equal(ctx.emptyState().deals.length, 0);
  const st = ctx.loadState();
  assert.deepEqual(bizLens(st), [0, 0, 0, 0, 0, 0], 'loadState kho rỗng phải trống nghiệp vụ');
  const ls2 = makeLocalStorage();
  ls2.setItem(CRM_KEY, '{json hỏng');
  const ctx2 = boot(ls2);
  const st2 = ctx2.loadState();
  assert.deepEqual(bizLens(st2), [0, 0, 0, 0, 0, 0], 'loadState kho hỏng phải về trống, không về dữ liệu mẫu');
});

test('A: localStorage trống -> loadAll (đăng nhập) -> CRM trống sạch + diff-sync không ghi gì', async () => {
  const ls = makeLocalStorage();
  const ctx = boot(ls);
  const client = makeMockClient(serverTables());
  const D = ctx.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  const loaded = await D.loadAll();
  assert.equal(loaded.changed, true, 'cache rỗng -> loadAll thay cache nên auth phải tải lại trang');
  assert.deepEqual(bizLens(loaded.crmState), [0, 0, 0, 0, 0, 0]);
  assert.equal(loaded.crmState.members.length, 4, 'members lấy từ máy chủ');
  /* Mô phỏng lần tải lại trang sau đăng nhập: state parse từ cache máy chủ */
  const st = ctx.loadState();
  assert.deepEqual(bizLens(st), [0, 0, 0, 0, 0, 0]);
  D.setEnabled(true);
  ls.setItem(CRM_KEY, JSON.stringify(st));
  ls.setItem(PUB_KEY, JSON.stringify(loaded.pubState));
  await wait(1000);
  assert.equal(client._calls.length, 0, 'không được có ghi nào lên máy chủ khi chưa có thay đổi thật: ' + JSON.stringify(client._calls));
  assert.equal((client._db.companies || []).length, 0);
  assert.equal((client._db.deals || []).length, 0);
});

test('B: cache chứa dữ liệu mẫu cũ -> sau đăng nhập hiện theo máy chủ (trống), KHÔNG upsert bản ghi mẫu nào', async () => {
  const ls = makeLocalStorage();
  ls.setItem(CRM_KEY, JSON.stringify(STALE_SAMPLE));
  ls.setItem(PUB_KEY, JSON.stringify(STALE_PUB));
  const ctx = boot(ls);
  /* Trước đăng nhập, trang parse cache cũ vào bộ nhớ (đây là state nguy hiểm
     mà cơ chế tải-lại-khi-changed phải loại bỏ trước khi bật đồng bộ). */
  const staleInMemory = ctx.loadState();
  assert.equal(staleInMemory.companies[0].id, 'c1');
  const client = makeMockClient(serverTables());
  const D = ctx.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  const loaded = await D.loadAll();
  assert.equal(loaded.changed, true, 'cache mẫu cũ khác dữ liệu máy chủ -> changed=true để auth tải lại trang, loại state cũ khỏi bộ nhớ');
  /* Bản gốc cũ vẫn được giữ ở khóa sao lưu (không mất dấu vết) nhưng không
     còn ở cache đang dùng và không được hiển thị/đồng bộ. */
  const backup = JSON.parse(ls.getItem(CRM_KEY + '__pre_supabase_backup'));
  assert.equal(backup.companies[0].id, 'c1');
  /* Mô phỏng trang tải lại: state hiển thị = máy chủ (trống) */
  const st = ctx.loadState();
  assert.deepEqual(bizLens(st), [0, 0, 0, 0, 0, 0], 'sau đăng nhập phải hiển thị theo máy chủ (trống)');
  assert.equal(st.members.length, 4);
  D.setEnabled(true);
  ls.setItem(CRM_KEY, JSON.stringify(st));
  ls.setItem(PUB_KEY, JSON.stringify(loaded.pubState));
  await wait(1000);
  assert.equal(client._calls.length, 0, 'tuyệt đối không đẩy dữ liệu mẫu ngược lên máy chủ: ' + JSON.stringify(client._calls));
  for (const t of ['companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'publishing_requests']) {
    assert.equal((client._db[t] || []).length, 0, 'bảng ' + t + ' phải vẫn trống');
  }
});
