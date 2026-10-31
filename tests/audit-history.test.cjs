/* Thời gian cập nhật cuối + lịch sử chỉnh sửa (audit):
   - shared.js SavaSys.stampCollection: đóng dấu createdAt/updatedAt/updatedBy
     CHỈ khi entity thật sự đổi; createdAt bất biến; diff audit chỉ gồm trường
     đã đổi, trường tham chiếu kèm nhãn resolve; save không đổi -> không mục
     audit; xoá -> mục action=delete; tối đa 1 mục/entity/lần save.
   - index.html save(): điểm chạm duy nhất của kho CRM — đóng dấu + sinh
     audit tại đó; lỗi ghi audit KHÔNG phá lưu chính.
   - publishing.js write(): điểm chạm duy nhất của kho Publishing — chỉ cấp
     hồ sơ (revision chấm điểm không nhân đôi vào audit).
   - adapter: 3 trường hệ thống round-trip qua legacy_extra (không cột mới).
   - supabase-data SavaAudit: ghi insert thuần vào audit_log, đọc theo đối
     tượng; bảng chưa tồn tại -> nuốt êm (listFor = null, flush không throw).
   - audit-log.sql: RLS append-only (MKT chỉ game+request; INSERT khớp người
     gọi; KHÔNG policy UPDATE/DELETE). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const NOW = '2026-10-31T10:00:00.000Z', NOW2 = '2026-10-31T11:00:00.000Z';
const stateWith = over => Object.assign({ members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }], companies: [{ id: 'c1', name: 'Công ty Một' }], games: [{ id: 'g1', title: 'Game Một' }], deals: [], leads: [], tasks: [], activities: [] }, over || {});

/* ---------- 1) stampCollection thuần (shared.js) ---------- */

test('stamp: tạo mới đặt cả createdAt/updatedAt/updatedBy + 1 mục create', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = stateWith();
  const deal = { id: 'd1', title: 'Deal A', line: 'ai', stage: 'prospect', owner: 'linh', company: 'c1' };
  const entries = S.stampCollection(st, [deal], new Map(), 'deal', 'zac', NOW);
  assert.equal(deal.createdAt, NOW); assert.equal(deal.updatedAt, NOW); assert.equal(deal.updatedBy, 'zac');
  assert.equal(entries.length, 1); assert.equal(entries[0].action, 'create'); assert.equal(entries[0].entityType, 'deal');
  const titleCh = entries[0].changes.find(c => c.field === 'title');
  assert.equal(titleCh.label, 'Tiêu đề'); assert.equal(titleCh.from, ''); assert.equal(titleCh.to, 'Deal A');
  /* trường tham chiếu lưu KÈM nhãn resolve */
  const ownerCh = entries[0].changes.find(c => c.field === 'owner');
  assert.ok(ownerCh.to.includes('Linh'), 'owner phải kèm tên người: ' + ownerCh.to);
  const compCh = entries[0].changes.find(c => c.field === 'company');
  assert.ok(compCh.to.includes('Công ty Một'), 'company phải kèm tên công ty: ' + compCh.to);
});

test('stamp: sửa chỉ đổi updatedAt/updatedBy, createdAt bất biến, diff chỉ trường đổi', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = stateWith();
  const before = { id: 'd1', title: 'Deal A', line: 'ai', stage: 'prospect', owner: 'linh', createdAt: NOW, updatedAt: NOW, updatedBy: 'zac' };
  const after = JSON.parse(JSON.stringify(before)); after.stage = 'demo';
  const snap = new Map([['d1', S.cloneForDiff(before)]]);
  const entries = S.stampCollection(st, [after], snap, 'deal', 'linh', NOW2);
  assert.equal(after.createdAt, NOW, 'createdAt không được đổi');
  assert.equal(after.updatedAt, NOW2); assert.equal(after.updatedBy, 'linh');
  assert.equal(entries.length, 1); assert.equal(entries[0].action, 'update');
  assert.deepEqual([...entries[0].changes.map(c => c.field)], ['stage'], 'diff chỉ gồm trường stage đã đổi');
});

test('stamp: save không đổi dữ kiện -> không đóng dấu lại, không sinh audit', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = stateWith();
  const ent = { id: 'd1', title: 'Deal A', createdAt: NOW, updatedAt: NOW, updatedBy: 'zac' };
  const snap = new Map([['d1', S.cloneForDiff(ent)]]);
  const entries = S.stampCollection(st, [ent], snap, 'deal', 'linh', NOW2);
  assert.equal(entries.length, 0);
  assert.equal(ent.updatedAt, NOW, 'không đổi dữ kiện thì updatedAt giữ nguyên');
  assert.equal(ent.updatedBy, 'zac');
});

test('stamp: entity biến mất khỏi danh sách -> 1 mục delete; nhãn dự phòng cho member đã xoá', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = stateWith();
  const gone = { id: 'l1', name: 'Lead X', company: 'c1', createdAt: NOW, updatedAt: NOW, updatedBy: 'zac' };
  const snap = new Map([['l1', S.cloneForDiff(gone)]]);
  const entries = S.stampCollection(st, [], snap, 'lead', 'zac', NOW2);
  assert.equal(entries.length, 1); assert.equal(entries[0].action, 'delete'); assert.equal(entries[0].entityId, 'l1');
  assert.equal(S.updatedByLabel(st, { updatedBy: 'zac' }), 'Zac');
  assert.ok(S.updatedByLabel(st, { updatedBy: 'member-da-xoa-123' }).includes('thành viên đã xoá'), 'member đã xoá -> nhãn dự phòng');
  assert.equal(S.fmtSysTime(''), '—', 'entity cũ chưa có trường -> hiển thị —');
});

test('stamp: dung lượng 1 mục audit điển hình (đo từ dữ kiện thật)', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = stateWith();
  const before = { id: 'd1', title: 'Deal A', line: 'ai', stage: 'prospect', owner: 'linh', company: 'c1', amount: 100, createdAt: NOW, updatedAt: NOW, updatedBy: 'zac' };
  const after = JSON.parse(JSON.stringify(before)); after.stage = 'poc'; after.amount = 250;
  const entries = S.stampCollection(st, [after], new Map([['d1', S.cloneForDiff(before)]]), 'deal', 'zac', NOW2);
  const bytes = Buffer.byteLength(JSON.stringify(entries[0]), 'utf8');
  console.log('  [audit-size] 1 mục update 2 trường =', bytes, 'bytes');
  assert.ok(bytes > 100 && bytes < 1200, 'mục audit phải gọn (<1.2KB), thực tế: ' + bytes);
});

/* ---------- 2) Adapter round-trip qua legacy_extra ---------- */

test('adapter: createdAt/updatedAt/updatedBy của CRM + request Publishing round-trip qua legacy_extra', () => {
  const A = require('../supabase-adapter.js');
  const s = { members: [], companies: [], games: [], deals: [{ id: 'd1', line: 'ai', title: 'D', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, leads: [], createdAt: NOW, updatedAt: NOW2, updatedBy: 'linh' }], leads: [], tasks: [], activities: [], verticals: [] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.deals[0].legacy_extra.createdAt, NOW);
  assert.equal(rows.deals[0].legacy_extra.updatedBy, 'linh');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.deals[0].createdAt, NOW); assert.equal(back.deals[0].updatedAt, NOW2); assert.equal(back.deals[0].updatedBy, 'linh');
  const pub = { version: 1, requests: [{ id: 'REV-1', kind: 'game', entityId: 'g1', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: NOW, current: {}, revisions: [], revision: 0, createdAt: NOW, updatedAt: NOW2, updatedBy: 'zac' }], marketUpdates: [] };
  const prows = A.publishingStateToRows(pub, new Set());
  assert.equal(prows.publishing_requests[0].legacy_extra.createdAt, NOW);
  const pback = A.publishingRowsToState(JSON.parse(JSON.stringify(prows)));
  assert.equal(pback.requests[0].createdAt, NOW); assert.equal(pback.requests[0].updatedBy, 'zac');
});

/* ---------- 3) Harness index.html: save() thật ---------- */

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: '', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01' }],
    tasks: [], activities: [], verticals: [],
  };
}
function loadIndex(state) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(state || fixtureState()));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  const captured = [];
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'linh', role: 'bd' }) };
  ctx.SavaAudit = { recordBatch: entries => { captured.push(...entries); } };
  return { ctx, ls, getEl, captured, run: code => vm.runInContext(code, ctx) };
}

test('index save(): sửa 1 field -> chỉ entity đó được đóng dấu + đúng 1 mục audit diff field đó', () => {
  const { run, captured } = loadIndex();
  run(`S.deals.find(d=>d.id==='d1').title = 'Deal Đổi Tên'; save();`);
  const d = run(`S.deals.find(d=>d.id==='d1')`);
  assert.ok(d.updatedAt && d.createdAt, 'deal đổi phải có đủ thời gian hệ thống');
  assert.equal(d.updatedBy, 'linh', 'updatedBy = member đang đăng nhập');
  assert.equal(run(`S.companies.find(c=>c.id==='c1').updatedAt`), undefined, 'entity không đổi không bị đóng dấu');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].entityType, 'deal'); assert.equal(captured[0].action, 'update');
  assert.deepEqual([...captured[0].changes.map(c => c.field)], ['title']);
  assert.equal(captured[0].byMemberId, 'linh');
});

test('index save(): lưu không đổi gì -> không sinh audit, updatedAt giữ nguyên; tạo mới + xoá sinh đúng mục', () => {
  const { run, captured } = loadIndex();
  run(`S.deals.find(d=>d.id==='d1').stage = 'term'; save();`);
  const stampedAt = run(`S.deals.find(d=>d.id==='d1').updatedAt`);
  captured.length = 0;
  run(`save();`);
  assert.equal(captured.length, 0, 'save không đổi không được sinh audit');
  assert.equal(run(`S.deals.find(d=>d.id==='d1').updatedAt`), stampedAt);
  run(`S.companies.push({ id:'c9', name:'Công ty Chín', type:'Doanh nghiệp', roles:{}, last:'Vừa tạo' }); save();`);
  const c9 = run(`S.companies.find(c=>c.id==='c9')`);
  assert.ok(c9.createdAt && c9.updatedAt && c9.updatedBy === 'linh');
  assert.ok(captured.some(e => e.entityType === 'company' && e.entityId === 'c9' && e.action === 'create'));
  captured.length = 0;
  run(`S.leads = S.leads.filter(l=>l.id!=='l1'); S.deals.forEach(d=>{ d.leads = d.leads.filter(x=>x!=='l1'); }); save();`);
  assert.ok(captured.some(e => e.entityType === 'lead' && e.entityId === 'l1' && e.action === 'delete'), 'xoá lead phải sinh mục delete');
});

test('index save(): ghi audit NÉM LỖI -> dữ liệu chính vẫn lưu thành công', () => {
  const h = loadIndex();
  h.ctx.SavaAudit = { recordBatch() { throw new Error('audit_log chưa tồn tại'); } };
  h.run(`S.deals.find(d=>d.id==='d1').title = 'Vẫn Lưu Được'; save();`);
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.deals.find(d => d.id === 'd1').title, 'Vẫn Lưu Được', 'lưu chính không được hỏng vì audit');
  assert.ok(saved.deals.find(d => d.id === 'd1').updatedAt, 'đóng dấu vẫn diễn ra');
});

test('index drawer: hiện dòng thời gian + mục lịch sử; entity cũ hiện "—"', () => {
  const { run, getEl } = loadIndex();
  run(`openCompany('c1');`);
  const companyHtml = getEl('drawer').innerHTML;
  assert.ok(companyHtml.includes('Tạo: —'), 'entity cũ chưa có trường hệ thống -> hiện —');
  assert.ok(companyHtml.includes('🕘 Lịch sử chỉnh sửa'), 'drawer công ty thiếu mục lịch sử');
  run(`S.deals.find(d=>d.id==='d1').stage='term'; save(); openDeal('d1');`);
  const dealHtml = getEl('drawer').innerHTML;
  assert.ok(dealHtml.includes('Cập nhật lần cuối:') && dealHtml.includes('bởi Linh'), 'drawer deal phải hiện thời gian + người sửa: ' + dealHtml.slice(0, 400));
  assert.ok(dealHtml.includes('🕘 Lịch sử chỉnh sửa'));
  run(`openMember('zac');`);
  assert.ok(getEl('drawer').innerHTML.includes('🕘 Lịch sử chỉnh sửa'), 'drawer thành viên thiếu mục lịch sử');
  run(`editTask(null);`);
  assert.ok(!getEl('editBox').innerHTML.includes('createdAt'), 'form tạo việc KHÔNG được có ô nhập trường hệ thống');
});

/* ---------- 4) Harness publishing.js: write() thật qua submit/delete ---------- */

function loadPublishing() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const crmState = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }], companies: [{ id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '' }], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [], marketUpdates: [] }));
  const makeElement = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, reportValidity: () => true, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map();
  const handlers = {};
  const documentStub = { readyState: 'complete', body: Object.assign(makeElement(), { dataset: { role: 'bd' } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); } };
  class FakeFormData {
    constructor(form) { this.m = (form && form._fields) || new Map(); }
    get(k) { return this.m.has(k) ? this.m.get(k) : null; }
    getAll(k) { const v = this.m.get(k); return v === undefined ? [] : [v]; }
  }
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/publishing.html' },
    addEventListener() {}, URLSearchParams, URL, structuredClone, FormData: FakeFormData,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const captured = [];
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  ctx.SavaAudit = { recordBatch: entries => { captured.push(...entries); } };
  const dispatchSubmit = fields => { const ev = { target: { id: 'requestForm', _fields: new Map(Object.entries(fields)) }, preventDefault() {} }; (handlers.submit || []).forEach(fn => fn(ev)); };
  /* submitReview đọc FormData từ $('#reviewForm') (element thật), không phải
     e.target — gắn _fields vào đúng element stub đó. */
  const dispatchReviewSubmit = fields => { const m = new Map(Object.entries(fields)); const el = elements.get('#reviewForm') || (() => { const e2 = makeElement(); elements.set('#reviewForm', e2); return e2; })(); el._fields = m; const ev = { target: { id: 'reviewForm', _fields: m }, preventDefault() {} }; (handlers.submit || []).forEach(fn => fn(ev)); };
  const dispatchClick = btn => { const ev = { target: { closest: sel => (sel === 'button' ? btn : null) } }; (handlers.click || []).forEach(fn => fn(ev)); };
  return { ctx, ls, captured, dispatchSubmit, dispatchReviewSubmit, dispatchClick, elements };
}
const COMPANY_INTAKE_FIELDS = { teamSize: '', country: '', mainGenres: '', mainPlatforms: '', trackRecord: '', website: '' };

test('publishing write(): tạo request đóng dấu + audit create; sửa hồ sơ (build) audit update KHÔNG chứa revision; xoá audit delete', () => {
  const h = loadPublishing();
  h.dispatchSubmit({ kind: 'company', entityId: 'c1', requestedBy: 'zac', assignee: 'mai', due: '', build: '', source: '', requestNote: 'Hồ sơ test', ...COMPANY_INTAKE_FIELDS });
  let pub = JSON.parse(h.ls.getItem('sava_publishing_v1'));
  assert.equal(pub.requests.length, 1);
  const req = pub.requests[0];
  assert.ok(req.createdAt && req.updatedAt, 'request mới phải được đóng dấu');
  assert.equal(req.updatedBy, 'zac');
  assert.equal(h.captured.length, 1); assert.equal(h.captured[0].entityType, 'request'); assert.equal(h.captured[0].action, 'create');
  /* Mở dialog + lưu bổ sung BD đổi build -> update cấp hồ sơ */
  h.captured.length = 0;
  h.dispatchClick({ hasAttribute: () => false, dataset: { review: req.id } });
  const gateFields = {};
  for (const k of ['legal', 'ip', 'conflict', 'transparency', 'continuity', 'integrity']) { gateFields['g_' + k] = 'PENDING'; gateFields['gn_' + k] = ''; gateFields['gu_' + k] = ''; }
  h.dispatchReviewSubmit({ reviewer: 'zac', build: 'Build 2', source: '', assignee: 'mai', due: '', comment: '', s_deal: '', t_deal: 'Thiếu', n_deal: '', u_deal: '', s_legalEvidence: '', t_legalEvidence: 'Thiếu', n_legalEvidence: '', u_legalEvidence: '', ...COMPANY_INTAKE_FIELDS, ...gateFields });
  pub = JSON.parse(h.ls.getItem('sava_publishing_v1'));
  assert.equal(pub.requests[0].build, 'Build 2');
  assert.equal(pub.requests[0].createdAt, req.createdAt, 'createdAt bất biến khi sửa hồ sơ');
  assert.ok(pub.requests[0].updatedAt >= req.updatedAt);
  const upd = h.captured.filter(e => e.action === 'update');
  assert.equal(upd.length, 1, 'đúng 1 mục update cho request');
  assert.deepEqual([...upd[0].changes.map(c => c.field)], ['build'], 'audit chỉ ghi thay đổi cấp hồ sơ (build), không nhân đôi revision: ' + JSON.stringify(upd[0].changes));
  /* Xoá request -> mục delete */
  h.captured.length = 0;
  h.dispatchClick({ hasAttribute: () => false, dataset: { deleteRequest: req.id } });
  pub = JSON.parse(h.ls.getItem('sava_publishing_v1'));
  assert.equal(pub.requests.length, 0);
  assert.ok(h.captured.some(e => e.entityType === 'request' && e.entityId === req.id && e.action === 'delete'));
});

/* ---------- 5) supabase-data SavaAudit: ghi/đọc + nuốt lỗi ---------- */

function auditMockClient(fail) {
  const calls = [];
  return { calls, from(table) { return {
    insert(rows) { calls.push({ table, rows }); return Promise.resolve({ data: null, error: fail ? { message: 'relation "public.audit_log" does not exist' } : null }); },
    select() { const chain = { eq() { return chain; }, order() { return chain; }, limit() { return Promise.resolve({ data: fail ? null : [{ entity_type: 'deal', entity_id: 'd1', at: NOW, by_member_id: 'zac', action: 'create', changes: [] }], error: fail ? { message: 'no table' } : null }); } }; return chain; },
  }; } };
}
function loadDataLayer(client) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const el = () => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout,
    document: { getElementById: () => null, createElement: () => el(), body: el() } });
  ctx.window = ctx;
  vm.runInContext(read('supabase-adapter.js'), ctx, { filename: 'supabase-adapter.js' });
  vm.runInContext(read('supabase-data.js'), ctx, { filename: 'supabase-data.js' });
  ctx.window.SavaData.attach(client, 'bd'); ctx.window.SavaData.setEnabled(true);
  return ctx;
}

test('SavaAudit: recordBatch insert thuần vào audit_log; listFor đọc theo đối tượng', async () => {
  const client = auditMockClient(false);
  const ctx = loadDataLayer(client);
  ctx.window.SavaAudit.recordBatch([{ entityType: 'deal', entityId: 'd1', at: NOW, byMemberId: 'zac', action: 'create', changes: [{ field: 'title', label: 'Tiêu đề', from: '', to: 'X' }] }]);
  await ctx.window.SavaAudit._flush();
  assert.equal(client.calls.length, 1); assert.equal(client.calls[0].table, 'audit_log');
  assert.equal(client.calls[0].rows[0].entity_type, 'deal'); assert.equal(client.calls[0].rows[0].by_member_id, 'zac');
  const rows = await ctx.window.SavaAudit.listFor('deal', 'd1');
  assert.equal(rows.length, 1); assert.equal(rows[0].entityType, 'deal');
});

test('SavaAudit: bảng audit_log CHƯA tồn tại -> flush không throw, listFor = null (UI hiện "chưa khả dụng")', async () => {
  const client = auditMockClient(true);
  const ctx = loadDataLayer(client);
  ctx.window.SavaAudit.recordBatch([{ entityType: 'deal', entityId: 'd1', at: NOW, byMemberId: 'zac', action: 'update', changes: [] }]);
  await ctx.window.SavaAudit._flush(); /* không được throw */
  assert.equal(await ctx.window.SavaAudit.listFor('deal', 'd1'), null);
});

/* ---------- 6) audit.js UI + SQL + khẳng định tĩnh ---------- */

test('audit UI: dòng thời gian + mục lịch sử không có nút sửa/xoá; entity cũ hiện —', () => {
  const UI = require('../audit.js');
  const st = { members: [{ id: 'zac', name: 'Zac' }] };
  assert.ok(UI.metaLineHTML(st, {}).includes('Tạo: —'));
  const html = UI.entryHTML(st, { action: 'update', at: NOW, byMemberId: 'zac', changes: [{ field: 'stage', label: 'Giai đoạn', from: 'a', to: 'b' }] });
  assert.ok(html.includes('Đã cập nhật') && html.includes('Giai đoạn: a → b'));
  assert.ok(!html.includes('<button'), 'mục lịch sử TUYỆT ĐỐI không có nút sửa/xoá');
  assert.ok(UI.entryHTML(st, { action: 'create', at: NOW, byMemberId: 'nguoi-da-xoa', changes: [] }).includes('thành viên đã xoá'));
});

test('SQL audit-log: append-only — MKT chỉ game+request, INSERT khớp người gọi, KHÔNG policy UPDATE/DELETE', () => {
  const sql = read('supabase/audit-log.sql');
  assert.ok(sql.includes('create table if not exists public.audit_log'));
  assert.ok(sql.includes('(entity_type, entity_id, at desc)'), 'thiếu index theo đối tượng');
  assert.ok(sql.includes("entity_type in ('game', 'request')"), 'policy MKT phải giới hạn game + request');
  assert.ok(sql.includes('by_member_id = public.current_member_id()'), 'INSERT phải khớp member người gọi');
  assert.ok(!/create policy[^;]*for update/i.test(sql) && !/create policy[^;]*for delete/i.test(sql), 'không được có policy UPDATE/DELETE');
  assert.ok(!/^\s*grant[^;]*\bupdate\b/im.test(sql) && !/^\s*grant[^;]*\bdelete\b/im.test(sql), 'không được grant UPDATE/DELETE');
});

test('tĩnh: không form nào có ô nhập createdAt/updatedAt/updatedBy; điểm chạm đóng dấu nằm trong save()/write()', () => {
  const idx = read('index.html'), pub = read('publishing.js');
  assert.ok(!/txt\("e_[a-z_]*(createdAt|updatedAt|updatedBy)/.test(idx) && !/field\('(createdAt|updatedAt|updatedBy)'/.test(pub), 'trường hệ thống không được có ô nhập');
  const saveFn = idx.slice(idx.indexOf('function save()'), idx.indexOf('function save()') + 900);
  assert.ok(saveFn.includes('stampCrmAndAudit()'), 'save() phải đóng dấu trước storeState');
  assert.ok(pub.includes('function write(s) { stampPubAndAudit(s);'), 'write() của Publishing phải đóng dấu');
  for (const f of ['index.html', 'publishing.html', 'mkt.html']) assert.ok(read(f).includes('audit.js'), f + ' chưa nạp audit.js');
});
