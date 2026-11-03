/* Việc 1 (3/11/2026) — Lỗi FK deal_leads khi tạo deal / gắn lead từ drawer Game:
   toast «deal_leads: insert or update on table "deal_leads" violates foreign
   key constraint "deal_leads_deal_id_fkey"».

   Harness: mock Supabase client CÓ ÁP FK THẬT (như Postgres) trên các cặp
   cha–con mà tầng đồng bộ chạm tới + tiêm lỗi theo bảng. Khác mock ở
   supabase-data.test.cjs (không áp FK nên lỗi này không bao giờ lộ).

   Hành vi khoá ở đây:
   1. Deal MỚI + deal_leads sinh trong CÙNG một lần lưu -> con chỉ được insert
      SAU khi cha (deals) đã upsert trong cùng vòng đồng bộ.
   2. Mọi cặp cha–con khác sinh cùng lần lưu (lead mới gắn vào deal mới,
      deal_terms/deal_contracts/tasks/activities của deal mới, event_links
      của event mới) cũng không vi phạm FK.
   3. Cha lỗi (deals upsert bị tiêm lỗi) -> con KHÔNG được đẩy (không có
      attempt insert con, không lỗi FK), dữ liệu local còn nguyên; hết lỗi
      thì retry đẩy đủ cha trước con.
   4. Cha bị xoá trên server bởi phiên khác, local chỉ đổi bảng nối ->
      vòng đồng bộ tự upsert lại cha trước con, không lỗi FK. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const PK = { members: ['id'], companies: ['id'], company_partner_eval_archive: ['company_id'], games: ['id'], leads: ['id'], deals: ['id'], deal_terms: ['deal_id'], deal_contracts: ['deal_id'], deal_leads: ['deal_id', 'lead_id'], tasks: ['id'], activities: ['id'], events: ['id'], event_links: ['event_id', 'entity_type', 'entity_id'], publishing_requests: ['id'], publishing_revisions: ['request_id', 'revision_no'], publishing_revision_private: ['request_id', 'revision_no'], publishing_request_intake_private: ['request_id'], market_observations: ['id'], market_observation_audit: ['observation_id', 'seq'] };
const HAS_UPDATED_AT = new Set(['members', 'companies', 'games', 'leads', 'deals', 'deal_terms', 'deal_contracts', 'tasks', 'activities', 'events', 'publishing_requests', 'publishing_request_intake_private', 'publishing_revision_private', 'market_observations']);
/* FK đơn cột: bảng con -> [cột, bảng cha, tên constraint]. Cột nullable:
   NULL thì bỏ qua kiểm tra như Postgres. */
const FK1 = {
  company_partner_eval_archive: [['company_id', 'companies', 'company_partner_eval_archive_company_id_fkey']],
  games: [['company_id', 'companies', 'games_company_id_fkey']],
  leads: [['company_id', 'companies', 'leads_company_id_fkey']],
  deals: [['company_id', 'companies', 'deals_company_id_fkey'], ['game_id', 'games', 'deals_game_id_fkey']],
  deal_terms: [['deal_id', 'deals', 'deal_terms_deal_id_fkey']],
  deal_contracts: [['deal_id', 'deals', 'deal_contracts_deal_id_fkey']],
  deal_leads: [['deal_id', 'deals', 'deal_leads_deal_id_fkey'], ['lead_id', 'leads', 'deal_leads_lead_id_fkey']],
  tasks: [['deal_id', 'deals', 'tasks_deal_id_fkey']],
  activities: [['deal_id', 'deals', 'activities_deal_id_fkey']],
  event_links: [['event_id', 'events', 'event_links_event_id_fkey']],
  publishing_requests: [['game_id', 'games', 'publishing_requests_game_id_fkey'], ['company_id', 'companies', 'publishing_requests_company_id_fkey']],
  publishing_revisions: [['request_id', 'publishing_requests', 'publishing_revisions_request_id_fkey']],
  publishing_request_intake_private: [['request_id', 'publishing_requests', 'publishing_request_intake_private_request_id_fkey']],
  market_observation_audit: [['observation_id', 'market_observations', 'market_observation_audit_observation_id_fkey']],
};
/* Cascade khi xoá cha (chỉ các bảng harness quan tâm). */
const CASCADE = { deals: [['deal_leads', 'deal_id'], ['deal_terms', 'deal_id'], ['deal_contracts', 'deal_id'], ['activities', 'deal_id']], events: [['event_links', 'event_id']], leads: [['deal_leads', 'lead_id']], companies: [['company_partner_eval_archive', 'company_id']], publishing_requests: [['publishing_revisions', 'request_id'], ['publishing_revision_private', 'request_id'], ['publishing_request_intake_private', 'request_id']], market_observations: [['market_observation_audit', 'observation_id']] };

function makeMockClient(seedTables) {
  const db = JSON.parse(JSON.stringify(seedTables));
  const calls = [], errors = [];
  const failTables = new Set();
  function fkCheck(t, rec) {
    for (const [col, ref, name] of FK1[t] || []) {
      const v = rec[col];
      if (v === null || v === undefined) continue;
      if (!((db[ref] || []).some(r => String(r.id) === String(v)))) {
        return { message: `insert or update on table "${t}" violates foreign key constraint "${name}"` };
      }
    }
    if (t === 'publishing_revision_private') {
      const ok = (db.publishing_revisions || []).some(r => String(r.request_id) === String(rec.request_id) && Number(r.revision_no) === Number(rec.revision_no));
      if (!ok) return { message: 'insert or update on table "publishing_revision_private" violates foreign key constraint "publishing_revision_private_revision_fkey"' };
    }
    return null;
  }
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === 'select') {
      let out = rows.slice();
      if (b.inFilter) out = out.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col])));
      return { data: out.map(r => ({ ...r })), error: null };
    }
    if (b.op === 'upsert' || b.op === 'insert') {
      if (failTables.has(t)) { const e = { message: 'injected failure on ' + t }; errors.push({ table: t, ...e }); return { data: null, error: e }; }
      for (const row of b.rows) { const fe = fkCheck(t, row); if (fe) { errors.push({ table: t, ...fe }); return { data: null, error: fe }; } }
      const saved = [];
      for (const row of b.rows) {
        const rec = { ...row };
        if (t === 'publishing_requests') rec.entity_id = rec.game_id || rec.company_id;
        if (HAS_UPDATED_AT.has(t)) rec.updated_at = rec.updated_at || new Date().toISOString();
        const pk = PK[t];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (b.op === 'insert' && idx >= 0) return { data: null, error: { message: 'duplicate key' } };
        if (idx >= 0) { rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      calls.push({ op: b.op, table: t, n: b.rows.length });
      return { data: saved, error: null };
    }
    if (b.op === 'delete') {
      const removed = b.inFilter ? rows.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))) : rows.slice();
      db[t] = b.inFilter ? rows.filter(r => !b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))) : [];
      for (const rec of removed) for (const [child, col] of CASCADE[t] || []) db[child] = (db[child] || []).filter(r => String(r[col]) !== String(rec.id));
      calls.push({ op: 'delete', table: t });
      return { data: null, error: null };
    }
    if (b.op === 'update') {
      if (failTables.has(t)) { const e = { message: 'injected failure on ' + t }; errors.push({ table: t, ...e }); return { data: null, error: e }; }
      rows.forEach(r => { if (String(r[b.eqFilter.col]) === String(b.eqFilter.val)) Object.assign(r, b.patch); });
      calls.push({ op: 'update', table: t });
      return { data: null, error: null };
    }
    return { data: [], error: null };
  }
  function builder(table) {
    const b = { table, op: 'select', rows: null, opts: null, inFilter: null, eqFilter: null, patch: null };
    b.select = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.upsert = (rows, opts) => { b.op = 'upsert'; b.rows = rows; b.opts = opts; return b; };
    b.insert = rows => { b.op = 'insert'; b.rows = rows; return b; };
    b.delete = () => { b.op = 'delete'; return b; };
    b.update = patch => { b.op = 'update'; b.patch = patch; return b; };
    b.in = (col, values) => { b.inFilter = { col, values }; return b; };
    b.eq = (col, val) => { b.eqFilter = { col, val }; return b; };
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _db: db, _calls: calls, _errors: errors, _failTables: failTables };
}

function makeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeEl() { return { style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }

const BASE_CRM = () => ({
  members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
  companies: [{ id: 'c1', name: 'Studio A', type: 'Game studio', roles: {}, contact: '', phone: '', last: '' }],
  games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: '', platform: '', stage: '', emoji: '', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
  deals: [], leads: [{ id: 'l1', name: 'Lead Một', company: 'c1', person: '', line: '', source: '', status: 'new', note: '', when: '' }, { id: 'l2', name: 'Lead Hai', company: 'c1', person: '', line: '', source: '', status: 'new', note: '', when: '' }],
  tasks: [], activities: [], events: [],
});

async function setup(crmState) {
  const pubState = { version: 1, requests: [], marketUpdates: [] };
  const tables = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(crmState || BASE_CRM()))) tables[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows(pubState, new Set()))) if (k !== 'materialized') tables[k] = v;
  const client = makeMockClient(tables);
  const localStorage = makeLocalStorage();
  const sandbox = { console, setTimeout, clearTimeout, structuredClone, localStorage, document: { getElementById: () => null, createElement: () => makeEl(), body: { appendChild() {} } } };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  await D.loadAll();
  D.setEnabled(true);
  return { client, localStorage, D };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function flush(D) { D.syncNow(); await wait(120); }
function editCrm(localStorage, fn) {
  const crm = JSON.parse(localStorage.getItem('sava_crm_shared_v1'));
  fn(crm);
  localStorage.setItem('sava_crm_shared_v1', JSON.stringify(crm));
  return crm;
}
const fkErrors = client => client._errors.filter(e => /violates foreign key/.test(e.message || ''));
const NEW_DEAL = { id: 'd1', line: 'publishing', title: 'Deal từ Game', company: 'c1', game: 'g1', stage: 'new', owner: 'zac', due: '', idle: 0, amount: '', cur: '', custom: {}, leads: ['l1'] };

test('FK-1: tạo deal MỚI + gắn lead trong CÙNG một lần lưu -> deal + deal_leads lên DB, 0 lỗi FK', async (t) => {
  const { client, localStorage, D } = await setup();
  t.after(() => { try { D.setEnabled(false); } catch (e) {} });
  editCrm(localStorage, crm => { crm.deals.push(structuredClone(NEW_DEAL)); });
  await flush(D);
  assert.deepEqual(fkErrors(client), [], 'không được có lỗi FK: ' + JSON.stringify(client._errors));
  assert.equal(client._db.deals.filter(d => d.id === 'd1').length, 1, 'deal mới phải có trên DB');
  assert.deepEqual(client._db.deal_leads, [{ deal_id: 'd1', lead_id: 'l1' }], 'deal_leads phải được insert SAU deals');
});

test('FK-2: cùng lần lưu sinh lead MỚI + deal MỚI + term/contract/task/activity -> mọi con sau cha, 0 lỗi FK', async (t) => {
  const { client, localStorage, D } = await setup();
  t.after(() => { try { D.setEnabled(false); } catch (e) {} });
  editCrm(localStorage, crm => {
    crm.leads.push({ id: 'l9', name: 'Lead Mới', company: 'c1', person: '', line: '', source: '', status: 'new', note: '', when: '' });
    const d = structuredClone(NEW_DEAL); d.leads = ['l9'];
    d.term = { rev_share: 'Sava 50%', advance: '', territories: '', duration: '', exclusivity: '', marketing: '', payment: '' };
    d.contract = { status: 'draft', no: '', signed: '', url: '' };
    crm.deals.push(d);
    crm.tasks.push({ id: 't9', title: 'Việc của deal mới', assignee: 'zac', deal: 'd1', due: '', dueDate: '', done: false, overdue: false });
    crm.activities.push({ id: 'a9', deal: 'd1', type: 'Note', who: 'zac', when: '2026-11-03', text: 'ghi chú' });
  });
  await flush(D);
  assert.deepEqual(fkErrors(client), [], 'không được có lỗi FK: ' + JSON.stringify(client._errors));
  assert.deepEqual(client._db.deal_leads, [{ deal_id: 'd1', lead_id: 'l9' }]);
  assert.equal(client._db.deal_terms.filter(r => r.deal_id === 'd1').length, 1);
  assert.equal(client._db.deal_contracts.filter(r => r.deal_id === 'd1').length, 1);
  assert.equal(client._db.tasks.filter(r => r.id === 't9').length, 1);
  assert.equal(client._db.activities.filter(r => r.id === 'a9').length, 1);
});

test('FK-3: tạo event MỚI + links trong cùng lần lưu -> event_links sau events, 0 lỗi FK (khoá hồi quy)', async (t) => {
  const { client, localStorage, D } = await setup();
  t.after(() => { try { D.setEnabled(false); } catch (e) {} });
  editCrm(localStorage, crm => { crm.events.push({ id: 'e1', name: 'Sự kiện X', date: '2026-11-03', location: '', companies: ['c1'], leads: ['l1'], deals: [] }); });
  await flush(D);
  assert.deepEqual(fkErrors(client), []);
  assert.equal(client._db.events.filter(e => e.id === 'e1').length, 1);
  assert.equal(client._db.event_links.filter(r => r.event_id === 'e1').length, 2);
});

test('FK-4: cha (deals) lỗi -> con KHÔNG được đẩy + không attempt lỗi FK + local còn nguyên; hết lỗi -> retry đẩy đủ', async (t) => {
  const { client, localStorage, D } = await setup();
  t.after(() => { try { D.setEnabled(false); } catch (e) {} });
  client._failTables.add('deals');
  editCrm(localStorage, crm => {
    const d = structuredClone(NEW_DEAL);
    d.term = { rev_share: 'Sava 50%', advance: '', territories: '', duration: '', exclusivity: '', marketing: '', payment: '' };
    crm.deals.push(d);
  });
  await flush(D);
  assert.equal(client._db.deals.filter(d => d.id === 'd1').length, 0, 'deal chưa lên DB khi bị tiêm lỗi');
  assert.deepEqual(client._db.deal_leads, [], 'con deal_leads KHÔNG được đẩy khi cha lỗi');
  assert.deepEqual(client._db.deal_terms, [], 'con deal_terms KHÔNG được đẩy khi cha lỗi');
  assert.deepEqual(fkErrors(client), [], 'con không được attempt trước cha nên không phát sinh lỗi FK');
  const local = JSON.parse(localStorage.getItem('sava_crm_shared_v1'));
  assert.equal(local.deals.filter(d => d.id === 'd1').length, 1, 'dữ liệu local không được mất khi cha lỗi');
  client._failTables.delete('deals');
  await flush(D);
  assert.equal(client._db.deals.filter(d => d.id === 'd1').length, 1, 'retry phải đẩy được cha');
  assert.deepEqual(client._db.deal_leads, [{ deal_id: 'd1', lead_id: 'l1' }], 'retry phải đẩy con SAU cha');
  assert.equal(client._db.deal_terms.filter(r => r.deal_id === 'd1').length, 1);
});

test('FK-5: deal bị xoá trên server bởi phiên khác, local chỉ đổi deal_leads -> tự upsert lại cha trước con, 0 lỗi FK', async (t) => {
  const crm0 = BASE_CRM();
  crm0.deals.push({ ...structuredClone(NEW_DEAL), id: 'd0', leads: ['l1'] });
  const { client, localStorage, D } = await setup(crm0);
  t.after(() => { try { D.setEnabled(false); } catch (e) {} });
  assert.equal(client._db.deals.filter(d => d.id === 'd0').length, 1);
  /* Phiên khác xoá deal trên server (cascade dọn deal_leads). */
  client._db.deals = client._db.deals.filter(d => d.id !== 'd0');
  client._db.deal_leads = [];
  client._errors.length = 0;
  editCrm(localStorage, crm => { crm.deals.find(d => d.id === 'd0').leads = ['l1', 'l2']; });
  await flush(D);
  assert.deepEqual(fkErrors(client), [], 'không được có lỗi FK: ' + JSON.stringify(client._errors));
  assert.equal(client._db.deals.filter(d => d.id === 'd0').length, 1, 'cha phải được upsert lại trong cùng vòng');
  assert.deepEqual(client._db.deal_leads.map(r => r.lead_id).sort(), ['l1', 'l2']);
});

test('FK-6 (tĩnh): khối deal_leads trong syncCrm phải nằm SAU vòng upsert cha như event_links', () => {
  const src = read('supabase-data.js');
  const upsertLoop = src.indexOf('for (const [table] of order) {');
  assert.ok(upsertLoop > 0, 'không tìm thấy vòng upsert cha');
  assert.ok(src.indexOf("insertRows('deal_leads', ins)") > upsertLoop, 'insert deal_leads phải chạy SAU vòng upsert deals (trước đây chạy trước -> FK deal_leads_deal_id_fkey)');
  assert.ok(src.indexOf("insertRows('event_links', ins)") > upsertLoop, 'insert event_links phải chạy SAU vòng upsert events');
});
