/* Phân trang loadAll() (5/11/2026) — sửa lỗi client chỉ nạp 1.000 bản
   ghi CŨ NHẤT mỗi bảng (trần mặc định của PostgREST cho 1 select):
   Harness chạy supabase-data.js THẬT với stub client mô phỏng ĐÚNG
   trần đó: select KHÔNG có .range() bị cắt ở 1.000 dòng; .range(from,
   to) cắt đúng cửa sổ inclusive; .order() sắp xếp thật theo cột.
   1) companies 4.174 + leads 6.637 (đúng số đếm server lúc chẩn đoán)
      -> state nạp mới chứa ĐỦ; thứ tự created_at ASC giữ nguyên qua
      điểm nối trang; game ở cuối (mô phỏng Luna Mobile) resolve được
      company ở vị trí 4.173 (mô phỏng Soul Games) từ state nạp mới.
   2) Số dòng là bội số đúng của 1.000 (tasks 2.000): trang cuối rỗng
      kết thúc vòng lặp, không thiếu/không trùng dòng.
   3) qSafe lỗi ở trang 2+ -> cả bảng thành [] (không giữ nửa đầu đã
      nạp); q (không safe) lỗi ở trang 2+ -> loadAll ném lỗi, không
      trả dữ liệu dở.
   4) Hệ quả đồng bộ: client nạp mới với dữ liệu > 1.000 dòng/bảng ->
      vòng sync ĐẦU TIÊN thực hiện 0 lệnh ghi (không phantom
      insert/delete/upsert) và snapshot vẫn đủ số dòng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const PAGE = 1000;
const N_COMPANIES = 4174, N_LEADS = 6637; /* đúng số đếm server 5/11/2026 */
const ts = i => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();

function companyRow(i, total) {
  const last = i === total - 1;
  return {
    id: last ? 'c-soul' : 'c' + String(i).padStart(5, '0'),
    name: last ? 'Soul Games' : 'Company ' + i,
    type: 'Game studio', roles: {}, contact: '', phone: '', last_label: '',
    partner_eval_migrated: false,
    legacy_extra: { createdAt: ts(i), updatedAt: ts(i), updatedBy: 'zac' },
    created_at: ts(i), updated_at: ts(i),
  };
}
function leadRow(i) {
  return {
    id: 'l' + String(i).padStart(5, '0'), name: 'Lead ' + i,
    company_id: 'c00000', person: '', line: 'publishing', source: '',
    status: 'new', note: '', when_date: '2026-11-03', when_raw: '2026-11-03',
    legacy_extra: { createdAt: ts(i), updatedAt: ts(i), updatedBy: 'zac' },
    created_at: ts(i), updated_at: ts(i),
  };
}
function taskRow(i) {
  return {
    id: 't' + String(i).padStart(5, '0'), title: 'Việc ' + i,
    assignee_id: 'zac', deal_id: null, due_label: '', due_date: null,
    done: false, overdue_stored: false,
    legacy_extra: { createdAt: ts(i), updatedAt: ts(i), updatedBy: 'zac' },
    created_at: ts(i), updated_at: ts(i),
  };
}
function gameRow(id, title, companyId, i) {
  return {
    id, title, own: 'partner', company_id: companyId, genre: '', platform: '',
    stage: '', emoji: '', description: '', bd_note: '', build_url: '', trailer_url: '',
    scores_bd: null, bd_verdict: null, mkt_eval: null, legacy_extra: {},
    created_at: ts(i), updated_at: ts(i),
  };
}

function bigTables(opts = {}) {
  const companies = Array.from({ length: opts.nCompanies ?? N_COMPANIES }, (_, i) => companyRow(i, opts.nCompanies ?? N_COMPANIES));
  const leads = Array.from({ length: opts.nLeads ?? N_LEADS }, (_, i) => leadRow(i));
  const tasks = Array.from({ length: opts.nTasks ?? 4 }, (_, i) => taskRow(i));
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true, legacy_extra: {}, created_at: ts(0), updated_at: ts(0) }],
    companies, company_partner_eval_archive: [],
    games: [gameRow('g-first', 'Game Đầu', 'c00000', 0), gameRow('g-luna', 'Luna Mobile', companies[companies.length - 1].id, 1)],
    leads, deals: [], deal_terms: [], deal_contracts: [], deal_leads: [],
    tasks, activities: [], events: [], event_links: [],
    publishing_requests: [], publishing_revisions: [], publishing_revision_private: [],
    publishing_request_intake_private: [], market_observations: [], market_observation_audit: [],
  };
}

/* Stub client: mô phỏng trần 1.000 dòng/request của PostgREST. */
function makeCappedClient(seedTables, opts = {}) {
  const db = JSON.parse(JSON.stringify(seedTables));
  const selects = [];   /* {table, from, to, n} */
  const writes = [];    /* {op, table} — mọi lệnh ghi đều bị đếm */
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === 'select') {
      if (opts.failSelectAt && opts.failSelectAt.table === t && b.rangeFrom === opts.failSelectAt.from) {
        return { data: null, error: { message: 'boom-page-' + t } };
      }
      let out = rows.slice();
      if (b.inFilter) out = out.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col])));
      if (b.eqFilter) out = out.filter(r => String(r[b.eqFilter.col]) === String(b.eqFilter.val));
      if (b.orderCol) out.sort((x, y) => (String(x[b.orderCol] ?? '') < String(y[b.orderCol] ?? '') ? -1 : 1));
      if (b.rangeFrom !== null && b.rangeFrom !== undefined) out = out.slice(b.rangeFrom, b.rangeTo + 1);
      else out = out.slice(0, PAGE); /* trần PostgREST khi không phân trang */
      if (b.limitN) out = out.slice(0, b.limitN);
      selects.push({ table: t, from: b.rangeFrom ?? null, to: b.rangeTo ?? null, n: out.length });
      return { data: out.map(r => ({ ...r })), error: null };
    }
    writes.push({ op: b.op, table: t, n: Array.isArray(b.rows) ? b.rows.length : undefined });
    if (b.op === 'upsert' || b.op === 'insert') return { data: (b.rows || []).map(r => ({ ...r })), error: null };
    return { data: null, error: null };
  }
  function builder(table) {
    const b = { table, op: 'select', rows: null, opts: null, inFilter: null, eqFilter: null, orderCol: null, rangeFrom: null, rangeTo: null, limitN: null, patch: null };
    b.select = () => b;
    b.order = col => { b.orderCol = col; return b; };
    b.range = (from, to) => { b.rangeFrom = from; b.rangeTo = to; return b; };
    b.limit = n => { b.limitN = n; return b; };
    b.upsert = (rows, o) => { b.op = 'upsert'; b.rows = rows; b.opts = o; return b; };
    b.insert = rows => { b.op = 'insert'; b.rows = rows; return b; };
    b.delete = () => { b.op = 'delete'; return b; };
    b.update = patch => { b.op = 'update'; b.patch = patch; return b; };
    b.in = (col, values) => { b.inFilter = { col, values }; return b; };
    b.eq = (col, val) => { b.eqFilter = { col, val }; return b; };
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _db: db, _selects: selects, _writes: writes };
}

function makeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeEl() { return { style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }

async function setup(tables, clientOpts = {}) {
  const client = makeCappedClient(tables, clientOpts);
  const localStorage = makeLocalStorage();
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone, localStorage,
    document: { getElementById: () => null, createElement: () => makeEl(), body: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  return { client, localStorage, D };
}

test('page-1 (tĩnh): q() trong supabase-data.js phân trang bằng .range() với trang 1.000 dòng', () => {
  const src = read('supabase-data.js');
  assert.ok(src.includes('PAGE_SIZE = 1000'), 'trang phải đúng trần PostgREST 1.000');
  assert.ok(src.includes('.range(from, from + PAGE_SIZE - 1)'), 'phải lặp .range(from, from+999)');
});

test('page-2: trần 1.000/request — loadAll nạp ĐỦ 4.174 companies + 6.637 leads, giữ thứ tự created_at ASC qua điểm nối trang, game cuối resolve được company ở vị trí cuối', async () => {
  const { client, D } = await setup(bigTables());
  const { crmState } = await D.loadAll();
  assert.equal(crmState.companies.length, N_COMPANIES, 'companies phải đủ ' + N_COMPANIES + ' (trước vá chỉ 1.000)');
  assert.equal(crmState.leads.length, N_LEADS, 'leads phải đủ ' + N_LEADS + ' (trước vá chỉ 1.000)');
  /* Thứ tự: đầu, điểm nối trang 1->2, cuối */
  assert.equal(crmState.companies[0].id, 'c00000');
  assert.equal(crmState.companies[999].id, 'c00999');
  assert.equal(crmState.companies[1000].id, 'c01000', 'phần tử đầu trang 2 phải nối tiếp trang 1');
  assert.equal(crmState.companies[N_COMPANIES - 1].id, 'c-soul');
  assert.equal(crmState.leads[0].id, 'l00000');
  assert.equal(crmState.leads[1000].id, 'l01000');
  assert.equal(crmState.leads[N_LEADS - 1].id, 'l' + String(N_LEADS - 1).padStart(5, '0'));
  const created = crmState.companies.map(c => c.createdAt);
  assert.deepEqual(created, created.slice().sort(), 'createdAt của companies phải tăng dần toàn cục sau khi nối trang');
  /* Mô phỏng sự cố Luna Mobile: game trỏ tới company ở vị trí 4.173 */
  const luna = crmState.games.find(g => g.id === 'g-luna');
  assert.ok(luna, 'game Luna Mobile phải có trong state');
  const owner = crmState.companies.find(c => c.id === luna.company);
  assert.ok(owner, 'company của Luna Mobile phải resolve được từ state nạp mới (trước vá: undefined -> drawer báo đã bị xoá)');
  assert.equal(owner.name, 'Soul Games');
  /* Số request phân trang đúng kỳ vọng: ceil(n/1000) select cho mỗi bảng lớn */
  const compSelects = client._selects.filter(s => s.table === 'companies');
  const leadSelects = client._selects.filter(s => s.table === 'leads');
  assert.equal(compSelects.length, Math.ceil(N_COMPANIES / PAGE));
  assert.equal(leadSelects.length, Math.ceil(N_LEADS / PAGE));
  assert.deepEqual(compSelects.map(s => s.from), [0, 1000, 2000, 3000, 4000]);
  assert.equal(compSelects[compSelects.length - 1].n, N_COMPANIES % PAGE, 'trang cuối companies = phần dư');
});

test('page-3: số dòng là bội số đúng của 1.000 (tasks 2.000, đường qSafe) — vòng lặp dừng ở trang rỗng, đủ dòng, không trùng', async () => {
  const { client, D } = await setup(bigTables({ nCompanies: 3, nLeads: 5, nTasks: 2000 }));
  const { crmState } = await D.loadAll();
  assert.equal(crmState.tasks.length, 2000);
  assert.equal(new Set(crmState.tasks.map(t => t.id)).size, 2000, 'không được trùng dòng giữa các trang');
  assert.equal(crmState.tasks[1999].id, 't01999');
  const taskSelects = client._selects.filter(s => s.table === 'tasks');
  assert.deepEqual(taskSelects.map(s => s.n), [1000, 1000, 0], '2 trang đầy + 1 trang rỗng kết thúc');
});

test('page-4: qSafe lỗi ở trang 2 -> cả bảng thành [] (không giữ 1.000 dòng đầu); bảng khác nạp bình thường', async () => {
  const { D } = await setup(bigTables({ nCompanies: 3, nLeads: 5, nTasks: 1500 }), { failSelectAt: { table: 'tasks', from: 1000 } });
  const { crmState } = await D.loadAll(); /* qSafe nuốt lỗi: loadAll vẫn hoàn tất */
  assert.deepEqual(crmState.tasks, [], 'tasks lỗi ở trang 2 phải ra [] đúng ngữ nghĩa qSafe cũ, không phải 1.000 dòng dở');
  assert.equal(crmState.companies.length, 3);
  assert.equal(crmState.leads.length, 5);
});

test('page-5: q (không safe) lỗi ở trang 2 -> loadAll ném lỗi, không trả state dở', async () => {
  const { D } = await setup(bigTables({ nCompanies: 1500, nLeads: 5 }), { failSelectAt: { table: 'companies', from: 1000 } });
  await assert.rejects(() => D.loadAll(), /companies: boom-page-companies/);
});

test('page-6: client nạp mới (dữ liệu > 1.000 dòng/bảng) -> vòng sync ĐẦU TIÊN = 0 lệnh ghi, state vẫn đủ số dòng', async () => {
  const { client, localStorage, D } = await setup(bigTables());
  const { crmState } = await D.loadAll();
  D.setEnabled(true);
  assert.equal(crmState.companies.length, N_COMPANIES);
  assert.equal(crmState.leads.length, N_LEADS);
  client._writes.length = 0;
  /* Kích hoạt vòng sync đầu như app thật: ghi lại cache (nội dung không
     đổi) qua hook -> debounce được lên lịch -> flushSync chạy ngay. */
  localStorage.setItem('sava_crm_shared_v1', localStorage.getItem('sava_crm_shared_v1'));
  const ok = await D.flushSync();
  assert.equal(ok, true, 'vòng sync đầu của client nạp mới phải thành công');
  assert.equal(client._writes.length, 0, 'sync đầu phải có 0 lệnh ghi (không phantom insert/delete/upsert), thực tế: ' + JSON.stringify(client._writes.slice(0, 5)));
  /* Chiến lược cache 5/11/2026: localStorage chỉ còn bản NHẸ (0
     companies/leads); state đầy đủ sống ở bộ nhớ phiên. */
  const cache = JSON.parse(localStorage.getItem('sava_crm_shared_v1'));
  assert.equal(cache.companies.length, 0, 'cache localStorage là bản nhẹ');
  assert.equal(cache.leads.length, 0, 'cache localStorage là bản nhẹ');
  const full = D.readFullCrmState();
  assert.equal(full.companies.length, N_COMPANIES, 'state đầy đủ (bộ nhớ phiên) sau sync vẫn đủ companies');
  assert.equal(full.leads.length, N_LEADS, 'state đầy đủ (bộ nhớ phiên) sau sync vẫn đủ leads');
});
