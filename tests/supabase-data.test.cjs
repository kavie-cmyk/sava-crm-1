/* Giai đoạn 2b — tầng dữ liệu Supabase với client MOCK (không mạng thật):
   loadAll() nạp rows -> state cũ -> cache localStorage; sửa cache ->
   đồng bộ diff lên "DB" (upsert/xoá theo id, revision chỉ insert,
   con trỏ current_revision_no cập nhật sau revision). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const PK = { members: ['id'], companies: ['id'], company_partner_eval_archive: ['company_id'], games: ['id'], leads: ['id'], deals: ['id'], deal_terms: ['deal_id'], deal_contracts: ['deal_id'], deal_leads: ['deal_id', 'lead_id'], tasks: ['id'], activities: ['id'], publishing_requests: ['id'], publishing_revisions: ['request_id', 'revision_no'], publishing_revision_private: ['request_id', 'revision_no'], publishing_request_intake_private: ['request_id'], market_observations: ['id'], market_observation_audit: ['observation_id', 'seq'] };
const HAS_UPDATED_AT = new Set(['members', 'companies', 'games', 'leads', 'deals', 'deal_terms', 'deal_contracts', 'tasks', 'activities', 'publishing_requests', 'publishing_request_intake_private', 'publishing_revision_private', 'market_observations']);

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
      const saved = [];
      for (const row of b.rows) {
        const rec = { ...row };
        if (t === 'publishing_requests') rec.entity_id = rec.game_id || rec.company_id;
        if (HAS_UPDATED_AT.has(t)) rec.updated_at = rec.updated_at || new Date().toISOString();
        const pk = PK[t];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (b.op === 'insert' && idx >= 0) return { data: null, error: { message: 'duplicate key' } };
        if (idx >= 0) { if (!(b.opts && b.opts.ignoreDuplicates)) rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      calls.push({ op: b.op, table: t, n: b.rows.length });
      return { data: saved, error: null };
    }
    if (b.op === 'delete') {
      db[t] = rows.filter(r => !(b.inFilter && b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))));
      calls.push({ op: 'delete', table: t });
      return { data: null, error: null };
    }
    if (b.op === 'update') {
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
function makeEl() {
  return { style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } };
}

async function setup() {
  const crmState = {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c3', name: 'Pixel Ant', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: '', phone: '', last: '' }],
    games: [{ id: 'g3', title: 'Tiny Farm', own: 'partner', company: 'c3', genre: 'Farm', platform: '', stage: '', emoji: '', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [], leads: [], tasks: [{ id: 't1', title: 'Việc', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false }], activities: [],
  };
  const pubState = { version: 1, requests: [{ id: 'REV-1', kind: 'game', entityId: 'g3', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: { mechanicId: 'MECH-1', expectations: 'kỳ vọng bí mật' }, status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', revision: 1, current: { entries: {}, strengths: '', risks: '', conditions: '', next: '', comment: 'c1', reviewer: 'zac', role: 'bd', status: 'Đang đánh giá', at: '2026-10-29T01:00:00.000Z', build: '' }, revisions: [] }], marketUpdates: [] };
  pubState.requests[0].revisions = [structuredClone(pubState.requests[0].current)];
  const crmRows = A.crmStateToRows(crmState);
  const pubRows = A.publishingStateToRows(pubState, new Set());
  const tables = {};
  for (const [k, v] of Object.entries(crmRows)) tables[k] = v;
  for (const [k, v] of Object.entries(pubRows)) if (k !== 'materialized') tables[k] = v;
  tables.publishing_requests.forEach(r => { r.entity_id = r.game_id || r.company_id; });
  const client = makeMockClient(tables);
  const localStorage = makeLocalStorage();
  localStorage.setItem('sava_crm_shared_v1', JSON.stringify({ duLieuCuThat: true }));
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone,
    localStorage,
    document: { getElementById: () => null, createElement: () => makeEl(), body: { appendChild() {} } },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [{ id: 'MECH-1' }] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  const loaded = await D.loadAll();
  D.setEnabled(true);
  return { client, localStorage, D, loaded, sandbox };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('data: loadAll nạp DB -> state cũ (ghép private) + sao lưu bản gốc + ghi cache', async () => {
  const { localStorage, loaded } = await setup();
  assert.equal(loaded.crmState.companies[0].name, 'Pixel Ant');
  const req = loaded.pubState.requests[0];
  assert.equal(req.intake.expectations, 'kỳ vọng bí mật');
  assert.equal(req.current.comment, 'c1');
  const backup = JSON.parse(localStorage.getItem('sava_crm_shared_v1__pre_supabase_backup'));
  assert.equal(backup.duLieuCuThat, true);
  const cache = JSON.parse(localStorage.getItem('sava_crm_shared_v1'));
  assert.equal(cache.companies[0].id, 'c3');
});

test('data: sửa cache -> diff upsert lên DB; xoá entity -> delete; revision mới -> chỉ insert + cập nhật pointer', async () => {
  const { client, localStorage } = await setup();
  const crm = JSON.parse(localStorage.getItem('sava_crm_shared_v1'));
  crm.companies[0].name = 'Pixel Ant Đổi Tên';
  crm.tasks = [];
  localStorage.setItem('sava_crm_shared_v1', JSON.stringify(crm));
  await wait(1000);
  assert.equal(client._db.companies[0].name, 'Pixel Ant Đổi Tên');
  assert.equal(client._db.tasks.length, 0);

  const pub = JSON.parse(localStorage.getItem('sava_publishing_v1'));
  const rev2 = { ...structuredClone(pub.requests[0].current), comment: 'c2', at: '2026-10-30T01:00:00.000Z' };
  pub.requests[0].revisions.push(rev2);
  pub.requests[0].current = structuredClone(rev2);
  pub.requests[0].revision = 2;
  localStorage.setItem('sava_publishing_v1', JSON.stringify(pub));
  await wait(1000);
  assert.equal(client._db.publishing_revisions.filter(r => r.request_id === 'REV-1').length, 2);
  assert.equal(client._db.publishing_requests[0].current_revision_no, 2);
  const revInserts = client._calls.filter(c => c.op === 'insert' && c.table === 'publishing_revisions');
  assert.equal(revInserts.length, 1);
  assert.equal(revInserts[0].n, 1);
});
