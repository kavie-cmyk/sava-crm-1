/* Hạng mục CHIẾN LƯỢC CACHE (5/11/2026) — bỏ mirror companies/leads
   khỏi localStorage, giữ trong bộ nhớ phiên; lỗi ghi cache phải HIỆN
   banner bền, không nuốt âm thầm. Harness chạy supabase-data.js THẬT
   (+ shared.js ở ca di trú) với mock client/ localStorage:
   (a) localStorage ném QuotaExceededError khi ghi kho CRM -> app vẫn
       boot/nạp/đồng bộ được (từ bộ nhớ phiên) và banner lỗi ghi cache
       HIỆN nhìn thấy được (#savaCacheBanner display:block + cờ lỗi).
   (b) State phình > 5MB (fixture đúng tỉ lệ thật 4.174 companies /
       6.637 leads, trần 1.000 dòng/bảng của PostgREST) -> nạp ĐỦ,
       cache localStorage sau nạp chỉ còn bản nhẹ << 5MB, game Luna
       Mobile resolve được "Studio sở hữu = Soul Games", vòng sync
       đầu = 0 lệnh ghi.
   (c) Di trú: seed cache ĐẦY định dạng cũ (mirror đầy đủ) -> boot sau
       nâng cấp vào được, dữ liệu đủ, loadAll lần 2 changed=false
       (không vòng lặp reload), cache chuyển sang bản nhẹ + cờ format.
   (d) Regression Hạng mục 1 + bảo toàn chưa-sync: sync LỖI -> nhật ký
       dirty được ghi; phiên MỚI (sandbox mới, cùng localStorage) áp
       lại nhật ký lên dữ liệu máy chủ, đẩy lên thành công và xoá
       nhật ký; tạo deal + flushBeforeNavigate trong cửa sổ debounce
       vẫn lên server trước khi điều hướng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const CRM_KEY = 'sava_crm_shared_v1', PUB_KEY = 'sava_publishing_v1';
const FORMAT_KEY = CRM_KEY + '__format', JOURNAL_KEY = CRM_KEY + '__dirty_journal';
const PK = { members: ['id'], companies: ['id'], company_partner_eval_archive: ['company_id'], games: ['id'], leads: ['id'], deals: ['id'], deal_terms: ['deal_id'], deal_contracts: ['deal_id'], deal_leads: ['deal_id', 'lead_id'], tasks: ['id'], activities: ['id'], events: ['id'], event_links: ['event_id', 'entity_type', 'entity_id'], publishing_requests: ['id'], publishing_revisions: ['request_id', 'revision_no'], publishing_revision_private: ['request_id', 'revision_no'], publishing_request_intake_private: ['request_id'], market_observations: ['id'], market_observation_audit: ['observation_id', 'seq'] };

function makeClient(seedTables, opts = {}) {
  const db = JSON.parse(JSON.stringify(seedTables));
  const writes = [];
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === 'select') {
      let out = rows.slice();
      if (b.inFilter) out = out.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col])));
      if (b.eqFilter) out = out.filter(r => String(r[b.eqFilter.col]) === String(b.eqFilter.val));
      if (b.orderCol) out.sort((x, y) => (String(x[b.orderCol] ?? '') < String(y[b.orderCol] ?? '') ? -1 : 1));
      if (b.rangeFrom !== null && b.rangeFrom !== undefined) out = out.slice(b.rangeFrom, b.rangeTo + 1);
      else if (opts.cap) out = out.slice(0, 1000);
      if (b.limitN) out = out.slice(0, b.limitN);
      return { data: out.map(r => ({ ...r })), error: null };
    }
    if (opts.failTables && opts.failTables.has(t)) { writes.push({ op: b.op, table: t, failed: true }); return { data: null, error: { message: 'fail-' + t } }; }
    writes.push({ op: b.op, table: t, n: Array.isArray(b.rows) ? b.rows.length : undefined });
    if (b.op === 'upsert' || b.op === 'insert') {
      const saved = [];
      for (const row of b.rows || []) {
        const rec = { ...row };
        if (t === 'publishing_requests') rec.entity_id = rec.game_id || rec.company_id;
        const pk = PK[t] || ['id'];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (idx >= 0) { rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      return { data: saved, error: null };
    }
    if (b.op === 'delete') {
      if (b.inFilter) db[t] = rows.filter(r => !b.inFilter.values.map(String).includes(String(r[b.inFilter.col])));
      return { data: null, error: null };
    }
    if (b.op === 'update') {
      rows.forEach(r => { if (b.eqFilter && String(r[b.eqFilter.col]) === String(b.eqFilter.val)) Object.assign(r, b.patch); });
      return { data: null, error: null };
    }
    return { data: [], error: null };
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
  return { from: t => builder(t), _db: db, _writes: writes };
}

function makeLocalStorage(opts = {}) {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (opts.throwOn && opts.throwOn.has(k)) { const e = new Error('QuotaExceededError: vượt trần localStorage'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: k => m.delete(k),
    _map: m,
  };
}
function makeDocument() {
  const byId = new Map();
  const doc = {
    visibilityState: 'visible',
    getElementById: id => byId.get(id) || null,
    createElement: () => {
      const el = { style: {}, textContent: '', innerHTML: '', id: '', setAttribute(n, v) { if (n === 'id') this.id = v; }, appendChild() {}, classList: { add() {}, remove() {} } };
      return el;
    },
    body: { appendChild(el) { if (el && el.id) byId.set(el.id, el); } },
    addEventListener() {},
  };
  return doc;
}
function makeLocation() {
  return { pathname: '/index.html', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/index.html', assigned: [], assign(url) { this.assigned.push(url); } };
}

function smallTables() {
  const crmState = {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c-soul', name: 'Soul Games', type: 'Publisher', roles: { publishing: 'Publisher' }, contact: '', phone: '', last: '' }],
    games: [{ id: 'g-luna', title: 'Luna Mobile', own: 'partner', company: 'c-soul', genre: '', platform: '', stage: '', emoji: '', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [], leads: [{ id: 'l-yeon', name: 'Yeonkyu Park', company: 'c-soul', person: 'Yeonkyu Park', line: 'publishing', source: '', status: 'contacted', note: '' }],
    tasks: [], activities: [], events: [], verticals: [],
  };
  const rows = A.crmStateToRows(crmState);
  const tables = {};
  for (const [k, v] of Object.entries(rows)) tables[k] = v;
  for (const t of ['publishing_requests', 'publishing_revisions', 'publishing_revision_private', 'publishing_request_intake_private', 'market_observations', 'market_observation_audit']) tables[t] = [];
  return { crmState, tables };
}

async function setupEnv({ tables, clientOpts = {}, lsOpts = {}, withShared = false, localStorage = null, client = null }) {
  const ls = localStorage || makeLocalStorage(lsOpts);
  const cl = client || makeClient(tables, clientOpts);
  const document = makeDocument();
  const location = makeLocation();
  const sandbox = { console, setTimeout, clearTimeout, structuredClone, localStorage: ls, document, location, URL, addEventListener() {} };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  if (withShared) vm.runInContext(read('shared.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(cl, 'bd');
  D.installHook();
  return { client: cl, localStorage: ls, D, sandbox, document, location };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('cache-a: QuotaExceededError khi ghi kho CRM -> banner lỗi ghi cache HIỆN bền, app vẫn nạp + đồng bộ được từ bộ nhớ phiên', async () => {
  const { tables } = smallTables();
  const lsOpts = { throwOn: new Set([CRM_KEY]) };
  const { client, localStorage, D, document, sandbox } = await setupEnv({ tables, lsOpts });
  const loaded = await D.loadAll();
  assert.equal(loaded.crmState.companies[0].name, 'Soul Games', 'loadAll vẫn trả đủ dữ liệu dù ghi cache lỗi');
  assert.equal(loaded.cacheWriteOk, false, 'loadAll phải báo ghi cache CRM không thành');
  const err = D._cacheWriteError();
  assert.ok(err && err.key === CRM_KEY && err.name === 'QuotaExceededError', 'phải ghi nhận lỗi ghi cache, thực tế: ' + JSON.stringify(err));
  assert.equal(sandbox.window.__savaCacheWriteError && sandbox.window.__savaCacheWriteError.name, 'QuotaExceededError');
  const banner = document.getElementById('savaCacheBanner');
  assert.ok(banner, 'phải có banner lỗi ghi cache trong DOM');
  assert.equal(banner.style.display, 'block', 'banner phải HIỆN (display:block)');
  assert.ok(String(banner.textContent).includes('Không ghi được'), 'banner phải nói rõ không ghi được cache');
  /* Sửa + đồng bộ vẫn chạy: nguồn sync là bộ nhớ phiên, không phụ thuộc ghi localStorage thành công */
  D.setEnabled(true);
  const st = D.readFullCrmState();
  st.companies[0].name = 'Soul Games Đổi Khi Hết Quota';
  D.writeFullCrmState(st);
  assert.equal(await D.flushSync(), true, 'flushSync vẫn đồng bộ được khi ghi cache lỗi');
  assert.equal(client._db.companies[0].name, 'Soul Games Đổi Khi Hết Quota', 'thay đổi phải lên DB');
  assert.ok(document.getElementById('savaCacheBanner').style.display === 'block', 'banner vẫn hiện chừng nào ghi cache còn lỗi');
});

test('cache-b: state > 5MB (4.174 companies / 6.637 leads, trần 1.000) -> nạp đủ, cache nhẹ << 5MB, Luna resolve Soul Games, sync đầu 0 ghi', async () => {
  const ts = i => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();
  const pad = 'x'.repeat(220);
  const companies = Array.from({ length: 4174 }, (_, i) => ({
    id: i === 4173 ? 'c-soul' : 'c' + String(i).padStart(5, '0'),
    name: i === 4173 ? 'Soul Games' : 'Company ' + i, type: 'Game studio', roles: {}, contact: '', phone: '', last_label: '',
    partner_eval_migrated: false, legacy_extra: { createdAt: ts(i), updatedAt: ts(i), updatedBy: 'zac', profilePad: pad },
    created_at: ts(i), updated_at: ts(i),
  }));
  const leads = Array.from({ length: 6637 }, (_, i) => ({
    id: 'l' + String(i).padStart(5, '0'), name: 'Lead ' + i, company_id: 'c00000', person: 'Person ' + i, line: 'publishing',
    source: '', status: 'new', note: pad, when_date: '2026-11-03', when_raw: '2026-11-03',
    legacy_extra: { createdAt: ts(i), updatedAt: ts(i), updatedBy: 'zac' }, created_at: ts(i), updated_at: ts(i),
  }));
  const tables = {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true, legacy_extra: {}, created_at: ts(0), updated_at: ts(0) }],
    companies, company_partner_eval_archive: [],
    games: [{ id: 'g-luna', title: 'Luna Mobile', own: 'partner', company_id: 'c-soul', genre: '', platform: '', stage: '', emoji: '', description: '', bd_note: '', build_url: '', trailer_url: '', scores_bd: null, bd_verdict: null, mkt_eval: null, legacy_extra: {}, created_at: ts(1), updated_at: ts(1) }],
    leads, deals: [], deal_terms: [], deal_contracts: [], deal_leads: [], tasks: [], activities: [], events: [], event_links: [],
    publishing_requests: [], publishing_revisions: [], publishing_revision_private: [], publishing_request_intake_private: [], market_observations: [], market_observation_audit: [],
  };
  const { client, localStorage, D } = await setupEnv({ tables, clientOpts: { cap: true } });
  const { crmState } = await D.loadAll();
  D.setEnabled(true);
  const fullBytes = JSON.stringify(crmState).length;
  assert.ok(fullBytes > 5_000_000, 'fixture state đầy đủ phải > 5MB, thực tế ' + fullBytes);
  assert.equal(crmState.companies.length, 4174, 'nạp đủ companies');
  assert.equal(crmState.leads.length, 6637, 'nạp đủ leads');
  const luna = crmState.games.find(g => g.id === 'g-luna');
  const owner = crmState.companies.find(c => c.id === luna.company);
  assert.equal(owner && owner.name, 'Soul Games', 'drawer Luna Mobile: Studio sở hữu = Soul Games');
  const lightRaw = localStorage.getItem(CRM_KEY);
  assert.ok(lightRaw.length < 200_000, 'cache localStorage sau tách phải << 5MB, thực tế ' + lightRaw.length + ' bytes');
  const light = JSON.parse(lightRaw);
  assert.deepEqual(light.companies, [], 'bản nhẹ không chứa companies');
  assert.deepEqual(light.leads, [], 'bản nhẹ không chứa leads');
  assert.equal(localStorage.getItem(FORMAT_KEY), 'split-heavy-v1');
  assert.equal(D.readFullCrmState().companies.length, 4174);
  client._writes.length = 0;
  localStorage.setItem(CRM_KEY, localStorage.getItem(CRM_KEY));
  assert.equal(await D.flushSync(), true);
  assert.equal(client._writes.length, 0, 'vòng sync đầu của client nạp mới phải = 0 lệnh ghi, thực tế: ' + JSON.stringify(client._writes.slice(0, 3)));
  D.setEnabled(false);
});

test('cache-c: di trú cache ĐẦY cũ -> boot được bằng shared.loadState, loadAll chuyển sang bản nhẹ, loadAll lần 2 changed=false (không vòng lặp), dữ liệu đủ', async () => {
  const { crmState, tables } = smallTables();
  const localStorage = makeLocalStorage();
  localStorage.setItem(CRM_KEY, JSON.stringify(crmState)); /* cache cũ: mirror ĐẦY */
  localStorage.setItem(PUB_KEY, JSON.stringify({ version: 1, requests: [], marketUpdates: [] }));
  const env1 = await setupEnv({ tables, withShared: true, localStorage });
  const bootState = env1.sandbox.loadState();
  assert.equal(bootState.companies[0].name, 'Soul Games', 'boot bằng cache đầy cũ phải thấy companies như trước');
  const loaded = await env1.D.loadAll();
  assert.equal(loaded.crmState.companies.length, 1);
  assert.equal(loaded.localDirty, false);
  assert.equal(localStorage.getItem(FORMAT_KEY), 'split-heavy-v1', 'sau loadAll cache phải chuyển định dạng split');
  assert.deepEqual(JSON.parse(localStorage.getItem(CRM_KEY)).companies, [], 'cache đã là bản nhẹ');
  const loaded2 = await env1.D.loadAll();
  assert.equal(loaded2.changed, false, 'loadAll lần 2 trên cùng dữ liệu phải changed=false — không có cơ sở cho vòng lặp reload');
  assert.equal(loaded2.localDirty, false);
  /* Phiên MỚI trên cùng localStorage (mô phỏng mở lại app): loadState
     tạm thiếu phần nặng cho tới khi loadAll chạy, sau đó phải đủ. */
  const env2 = await setupEnv({ tables, withShared: true, localStorage });
  const loaded3 = await env2.D.loadAll();
  assert.equal(loaded3.heavyNeedsRefresh, true, 'boot bằng cache nhẹ phải báo cần làm mới giao diện để nạp phần nặng');
  const after = env2.sandbox.loadState();
  assert.equal(after.companies[0].name, 'Soul Games', 'sau loadAll, loadState ghép được companies từ bộ nhớ phiên');
  assert.equal(after.leads[0].name, 'Yeonkyu Park', 'sau loadAll, loadState ghép được leads từ bộ nhớ phiên');
  const game = after.games.find(g => g.id === 'g-luna');
  assert.equal(after.companies.find(c => c.id === game.company).name, 'Soul Games');
});

test('cache-d: sync lỗi -> nhật ký dirty giữ phần chưa sync qua phiên mới; tạo deal + flushBeforeNavigate trong cửa sổ debounce vẫn lên server trước điều hướng', async () => {
  const { tables } = smallTables();
  const failTables = new Set(['companies']);
  const env = await setupEnv({ tables, clientOpts: { failTables } });
  await env.D.loadAll();
  env.D.setEnabled(true);
  const st = env.D.readFullCrmState();
  st.companies[0].name = 'Soul Games Chưa Sync';
  env.D.writeFullCrmState(st);
  assert.equal(await env.D.flushSync(), false, 'sync lỗi phải báo false');
  const journalRaw = env.localStorage.getItem(JOURNAL_KEY);
  assert.ok(journalRaw, 'sync lỗi phải ghi nhật ký dirty vào localStorage');
  const journal = JSON.parse(journalRaw);
  assert.ok(journal.cols.companies && journal.cols.companies.up.some(c => c.name === 'Soul Games Chưa Sync'), 'nhật ký phải chứa đúng bản ghi chưa sync');
  env.D.setEnabled(false); /* dừng vòng retry của phiên lỗi — từ đây chỉ phiên mới làm việc */
  /* Phiên mới: client mới với DB gốc (hết lỗi), CÙNG localStorage */
  const client2 = makeClient(tables);
  const env2 = await setupEnv({ tables, localStorage: env.localStorage, client: client2 });
  const loaded = await env2.D.loadAll();
  assert.equal(loaded.localDirty, true, 'phiên mới phải nhận diện dữ kiện chưa sync từ nhật ký');
  assert.equal(loaded.crmState.companies[0].name, 'Soul Games Chưa Sync', 'nhật ký được áp lên dữ liệu máy chủ');
  env2.D.setEnabled(true);
  env2.D.scheduleSync(0);
  await wait(300);
  assert.equal(client2._db.companies[0].name, 'Soul Games Chưa Sync', 'dữ kiện chưa sync phải được đẩy lên ở phiên mới');
  assert.equal(env.localStorage.getItem(JOURNAL_KEY), null, 'sync thành công phải xoá nhật ký');
  /* Regression Hạng mục 1 trong cùng harness: tạo deal -> flushBeforeNavigate ngay */
  const st2 = env2.D.readFullCrmState();
  st2.deals.push({ id: 'd-new', line: 'publishing', title: 'Deal Mới', company: 'c-soul', game: 'g-luna', stage: 'new', owner: 'zac', due: '', idle: 0, custom: {}, leads: ['l-yeon'] });
  env2.D.writeFullCrmState(st2);
  let dealOnDbAtNav = null;
  const origAssign = env2.location.assign.bind(env2.location);
  env2.location.assign = url => { dealOnDbAtNav = client2._db.deals.some(d => d.id === 'd-new'); origAssign(url); };
  const res = await env2.D.flushBeforeNavigate('publishing.html?tab=reviews&kind=game&id=g-luna');
  assert.equal(res.flushed, true);
  assert.equal(dealOnDbAtNav, true, 'deal phải lên server TRƯỚC khi điều hướng (Hạng mục 1 còn nguyên vẹn)');
  env2.D.setEnabled(false);
});
