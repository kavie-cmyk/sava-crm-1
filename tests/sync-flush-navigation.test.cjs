/* Vá lỗ hổng đồng bộ (5/11/2026) — flush khi rời trang + chờ sync trước
   khi chuyển trang đánh giá:
   Gốc lỗi: ghi cache chỉ debounce 700ms (scheduleSync); bấm link sang
   publishing.html trong cửa sổ đó -> trang đích loadAll() ghi đè cache
   bằng state máy chủ cũ -> bản ghi mới (deal của BD Hoàng) mất vĩnh viễn.
   Harness này chạy supabase-data.js THẬT với mock client:
   1) tạo bản ghi -> điều hướng qua ĐƯỜNG ĐÃ VÁ (flushBeforeNavigate và
      click-guard dùng chung) TRONG cửa sổ 700ms -> loadAll() trang đích
      -> bản ghi còn nguyên trên server + trong cache đích.
   2) pagehide / visibilitychange(hidden) có đăng ký và kích hoạt flush.
   3) sync kẹt -> vẫn điều hướng sau timeout, cache local không mất,
      và vòng sync thất bại KHÔNG bị flush nuốt retry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const PK = { members: ['id'], companies: ['id'], company_partner_eval_archive: ['company_id'], games: ['id'], leads: ['id'], deals: ['id'], deal_terms: ['deal_id'], deal_contracts: ['deal_id'], deal_leads: ['deal_id', 'lead_id'], tasks: ['id'], activities: ['id'], events: ['id'], event_links: ['event_id', 'entity_type', 'entity_id'], publishing_requests: ['id'], publishing_revisions: ['request_id', 'revision_no'], publishing_revision_private: ['request_id', 'revision_no'], publishing_request_intake_private: ['request_id'], market_observations: ['id'], market_observation_audit: ['observation_id', 'seq'] };
const HAS_UPDATED_AT = new Set(['members', 'companies', 'games', 'leads', 'deals', 'deal_terms', 'deal_contracts', 'tasks', 'activities', 'events', 'publishing_requests', 'publishing_request_intake_private', 'publishing_revision_private', 'market_observations']);

function makeMockClient(seedTables, opts = {}) {
  const db = JSON.parse(JSON.stringify(seedTables));
  const calls = [];
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (opts.hangTables && opts.hangTables.has(t) && (b.op === 'upsert' || b.op === 'insert')) return new Promise(() => {});
    if (b.op === 'select') {
      let out = rows.slice();
      if (b.inFilter) out = out.filter(r => b.inFilter.values.includes(r[b.inFilter.col]));
      return { data: out.map(r => ({ ...r })), error: null };
    }
    if (b.op === 'upsert' || b.op === 'insert') {
      if (opts.failTables && opts.failTables.has(t)) { calls.push({ op: b.op, table: t, n: b.rows.length, failed: true }); return { data: null, error: { message: 'boom-' + t } }; }
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
    b.limit = () => b;
    b.upsert = (rows, o) => { b.op = 'upsert'; b.rows = rows; b.opts = o; return b; };
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

const CRM_KEY = 'sava_crm_shared_v1', PUB_KEY = 'sava_publishing_v1';
const BASE_CRM = () => ({
  members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
  companies: [{ id: 'c1', name: 'Studio A', type: 'Game studio', roles: {}, contact: '', phone: '', last: '' }],
  games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: '', platform: '', stage: '', emoji: '', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
  deals: [], leads: [{ id: 'l1', name: 'Lead Một', company: 'c1', person: '', line: '', source: '', status: 'new', note: '', when: '' }],
  tasks: [], activities: [], events: [],
});
const BASE_PUB = () => ({ version: 1, requests: [{ id: 'REV-1', kind: 'game', entityId: 'g1', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: { mechanicId: 'MECH-1', expectations: '' }, status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', revision: 1, current: { entries: {}, strengths: '', risks: '', conditions: '', next: '', comment: 'c1', reviewer: 'zac', role: 'bd', status: 'Đang đánh giá', at: '2026-10-29T01:00:00.000Z', build: '' }, revisions: [] }], marketUpdates: [] });

async function setup(opts = {}) {
  const pubState = BASE_PUB();
  pubState.requests[0].revisions = [structuredClone(pubState.requests[0].current)];
  const tables = {};
  for (const [k, v] of Object.entries(A.crmStateToRows(BASE_CRM()))) tables[k] = v;
  for (const [k, v] of Object.entries(A.publishingStateToRows(pubState, new Set()))) if (k !== 'materialized') tables[k] = v;
  tables.publishing_requests.forEach(r => { r.entity_id = r.game_id || r.company_id; });
  const client = makeMockClient(tables, opts);
  const localStorage = makeLocalStorage();
  const winListeners = {}, docListeners = {};
  const document = {
    visibilityState: 'visible',
    getElementById: () => null, createElement: () => makeEl(), body: { appendChild() {} },
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  const location = {
    pathname: '/index.html', search: '', hash: '', origin: 'http://localhost', href: 'http://localhost/index.html',
    assigned: [], onAssign: null,
    assign(url) { this.assigned.push(url); if (this.onAssign) this.onAssign(url); },
  };
  const sandbox = {
    console, setTimeout, clearTimeout, structuredClone, localStorage, document, location, URL,
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
  };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [{ id: 'MECH-1' }] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'bd');
  D.installHook();
  await D.loadAll();
  D.setEnabled(true);
  return { client, localStorage, D, sandbox, winListeners, docListeners, document, location };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const NEW_DEAL = { id: 'd-flush', line: 'publishing', title: 'Deal Soul Games', company: 'c1', game: 'g1', stage: 'new', owner: 'zac', due: '', idle: 0, amount: '', cur: '', custom: {}, leads: ['l1'] };
function addDeal(localStorage) {
  const crm = JSON.parse(localStorage.getItem(CRM_KEY));
  crm.deals.push(structuredClone(NEW_DEAL));
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
}
function fire(listeners, type, ev) { (listeners[type] || []).slice().forEach(fn => fn(ev || {})); }

test('flush-1 (tĩnh): supabase-data đăng ký pagehide + visibilitychange + nav-guard + timeout 2500ms', () => {
  const src = read('supabase-data.js');
  assert.ok(src.includes("'pagehide'"), 'phải đăng ký pagehide');
  assert.ok(src.includes("'visibilitychange'"), 'phải đăng ký visibilitychange');
  assert.ok(src.includes("visibilityState === 'hidden'"), 'visibilitychange chỉ flush khi hidden');
  assert.ok(src.includes('NAV_FLUSH_TIMEOUT_MS = 2500'), 'timeout điều hướng mặc định 2500ms');
  assert.ok(src.includes('flushBeforeNavigate'), 'phải có helper flushBeforeNavigate');
  assert.ok(src.includes("'publishing.html'") && src.includes("'mkt.html'") && src.includes("'index.html'"), 'nav-guard phải phủ cả 3 trang');
});

test('flush-2: TÁI HIỆN bug cũ — tạo deal rồi flushBeforeNavigate NGAY trong cửa sổ 700ms -> deal lên server TRƯỚC khi điều hướng, loadAll trang đích còn nguyên deal', async () => {
  const { client, localStorage, D, location } = await setup();
  let dealOnDbAtNav = null;
  location.onAssign = () => { dealOnDbAtNav = client._db.deals.some(d => d.id === 'd-flush'); };
  addDeal(localStorage); /* debounce 700ms vừa được lên lịch, CHƯA chạy */
  assert.equal(client._db.deals.length, 0, 'trước flush deal chưa lên server (đúng cửa sổ lỗi cũ)');
  const res = await D.flushBeforeNavigate('publishing.html?tab=reviews&kind=game&id=g1');
  assert.equal(res.flushed, true);
  assert.equal(res.timedOut, false);
  assert.equal(res.navigated, true);
  assert.deepEqual(location.assigned, ['publishing.html?tab=reviews&kind=game&id=g1']);
  assert.equal(dealOnDbAtNav, true, 'deal phải lên server TRƯỚC thời điểm điều hướng');
  /* Trang đích loadAll(): cache bị ghi đè bằng state máy chủ — deal phải còn */
  const loaded = await D.loadAll();
  assert.equal(loaded.crmState.deals.some(d => d.id === 'd-flush'), true, 'deal còn nguyên sau loadAll ở trang đích');
  const cache = JSON.parse(localStorage.getItem(CRM_KEY));
  assert.equal(cache.deals.some(d => d.id === 'd-flush'), true);
});

test('flush-3: click-guard dùng chung — click link "Yêu cầu đánh giá" khi đang dirty bị chặn, chờ sync xong mới điều hướng; click link ngoài/khi sạch KHÔNG bị chặn', async () => {
  const { client, localStorage, D, docListeners, location } = await setup();
  addDeal(localStorage);
  let dealOnDbAtNav = null;
  location.onAssign = () => { dealOnDbAtNav = client._db.deals.some(d => d.id === 'd-flush'); };
  const href = 'publishing.html?tab=reviews&kind=game&id=g1';
  const a = { tagName: 'A', href, target: '', getAttribute: n => (n === 'href' ? href : null), hasAttribute: () => false };
  const ev = { target: a, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  fire(docListeners, 'click', ev);
  assert.equal(ev.defaultPrevented, true, 'click liên trang khi dirty phải bị chặn để chờ flush');
  await wait(150);
  assert.deepEqual(location.assigned, [href], 'sau flush phải tự điều hướng tới đúng deep-link');
  assert.equal(dealOnDbAtNav, true);
  /* Đã sạch (không dirty): click link liên trang đi thẳng, không chặn */
  const ev2 = { target: a, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  fire(docListeners, 'click', ev2);
  assert.equal(ev2.defaultPrevented, false, 'không dirty thì không được chặn click');
  /* Link ngoài app: không chặn kể cả khi dirty */
  const crm3 = JSON.parse(localStorage.getItem(CRM_KEY));
  crm3.companies[0].name = 'Studio A Dirty Lại';
  localStorage.setItem(CRM_KEY, JSON.stringify(crm3)); /* dirty lại để kiểm link ngoài */
  const ext = { tagName: 'A', href: 'https://example.com/x', target: '', getAttribute: n => (n === 'href' ? 'https://example.com/x' : null), hasAttribute: () => false };
  const ev3 = { target: ext, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  fire(docListeners, 'click', ev3);
  assert.equal(ev3.defaultPrevented, false, 'link ngoài app không thuộc nav-guard');
  await D.flushSync();
});

test('flush-4: pagehide + visibilitychange(hidden) kích hoạt flush — sửa xong rời trang trong cửa sổ debounce vẫn lên server', async () => {
  const { client, localStorage, winListeners, docListeners, document } = await setup();
  assert.ok((winListeners.pagehide || []).length >= 1, 'phải có handler pagehide trên window');
  assert.ok((winListeners.visibilitychange || []).length + (docListeners.visibilitychange || []).length >= 1, 'phải có handler visibilitychange');
  addDeal(localStorage);
  fire(winListeners, 'pagehide');
  await wait(150);
  assert.equal(client._db.deals.some(d => d.id === 'd-flush'), true, 'pagehide phải flush deal lên server');
  /* visibilitychange khi visible: KHÔNG flush; khi hidden: flush */
  const crm = JSON.parse(localStorage.getItem(CRM_KEY));
  crm.companies[0].name = 'Studio A Đổi Tên';
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
  document.visibilityState = 'visible';
  fire(docListeners, 'visibilitychange');
  await wait(60);
  assert.equal(client._db.companies[0].name, 'Studio A', 'visible thì chưa flush');
  document.visibilityState = 'hidden';
  fire(docListeners, 'visibilitychange');
  await wait(150);
  assert.equal(client._db.companies[0].name, 'Studio A Đổi Tên', 'hidden phải flush thay đổi lên server');
});

test('flush-5: sync KẸT quá timeout -> vẫn điều hướng, cache local giữ nguyên, dirty còn nguyên để retry xử lý tiếp', async () => {
  const hangTables = new Set(['companies']);
  const { client, localStorage, D, location } = await setup({ hangTables });
  const crm = JSON.parse(localStorage.getItem(CRM_KEY));
  crm.companies.push({ id: 'c-hang', name: 'Công ty Khi Sync Kẹt', type: 'Game studio', roles: {}, contact: '', phone: '', last: '' });
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
  const t0 = Date.now();
  const res = await D.flushBeforeNavigate('publishing.html', 300);
  const elapsed = Date.now() - t0;
  assert.equal(res.timedOut, true, 'phải báo timedOut khi sync kẹt');
  assert.equal(res.navigated, true, 'hết timeout vẫn phải điều hướng');
  assert.deepEqual(location.assigned, ['publishing.html']);
  assert.ok(elapsed >= 280 && elapsed < 3000, 'điều hướng quanh mốc timeout 300ms, thực tế ' + elapsed + 'ms');
  const cache = JSON.parse(localStorage.getItem(CRM_KEY));
  assert.equal(cache.companies.some(c => c.id === 'c-hang'), true, 'cache local KHÔNG được mất khi timeout');
  assert.equal(D._syncState().dirty, true, 'dirty phải còn nguyên sau timeout (chưa đồng bộ xong)');
});

test('flush-6: sync LỖI -> flushSync trả false, dirty giữ nguyên và retry tự chạy lại (flush không nuốt retry); sửa bình thường vẫn đi đường debounce, flush khi sạch = 0 request thừa', async () => {
  const failTables = new Set(['companies']);
  const { client, localStorage, D } = await setup({ failTables });
  const crm = JSON.parse(localStorage.getItem(CRM_KEY));
  crm.companies[0].name = 'Tên Sẽ Lỗi Sync';
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
  const ok = await D.flushSync();
  assert.equal(ok, false, 'flush phải báo false khi sync lỗi');
  assert.equal(D._syncState().dirty, true, 'dirty giữ nguyên sau flush lỗi');
  const attemptsAfterFlush = client._calls.filter(c => c.table === 'companies' && c.failed).length;
  assert.ok(attemptsAfterFlush >= 1);
  await wait(1600); /* finally của runSync đã đặt scheduleSync(900) -> retry tự chạy */
  const attemptsLater = client._calls.filter(c => c.table === 'companies' && c.failed).length;
  assert.ok(attemptsLater > attemptsAfterFlush, 'retry phải tự chạy lại sau khi flush lỗi (không bị nuốt)');
  /* Dọn dẹp: hết lỗi tiêm -> flush thành công, dirty sạch, vòng retry dừng */
  failTables.delete('companies');
  assert.equal(await D.flushSync(), true, 'hết lỗi thì flush lại phải thành công');
  assert.equal(client._db.companies[0].name, 'Tên Sẽ Lỗi Sync');
  assert.equal(D._syncState().dirty, false);
  D.setEnabled(false);
});

test('flush-7: thao tác sửa bình thường — debounce là đường chính (không sync ngay), flushSync khi sạch không sinh request; cả hai kho CRM + Publishing cùng được flush trong một vòng', async () => {
  const { client, localStorage, D } = await setup();
  const crm = JSON.parse(localStorage.getItem(CRM_KEY));
  crm.companies[0].name = 'Studio A V2';
  localStorage.setItem(CRM_KEY, JSON.stringify(crm));
  const pub = JSON.parse(localStorage.getItem(PUB_KEY));
  pub.requests[0].due = '2026-11-06';
  localStorage.setItem(PUB_KEY, JSON.stringify(pub));
  await wait(120);
  assert.equal(client._db.companies[0].name, 'Studio A', 'trong cửa sổ debounce chưa được sync ngay (đường thường ngày không đổi)');
  const ok = await D.flushSync();
  assert.equal(ok, true);
  assert.equal(client._db.companies[0].name, 'Studio A V2', 'kho CRM đã flush');
  assert.equal(client._db.publishing_requests[0].due_date, '2026-11-06', 'kho Publishing cùng được flush trong cùng vòng runSync (due -> due_date qua adapter)');
  const callsBefore = client._calls.length;
  assert.equal(await D.flushSync(), true, 'flush khi sạch trả true ngay');
  assert.equal(client._calls.length, callsBefore, 'flush khi sạch = 0 request thừa');
  assert.equal(await D.syncNow(), true, 'syncNow nay là flush thật và chờ được');
});
