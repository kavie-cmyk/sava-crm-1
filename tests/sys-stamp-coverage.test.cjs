/* Việc 4 — Đóng dấu thời gian + lịch sử ở MỌI đường thay đổi dữ liệu:
   - Publishing: nộp revision MÀ KHÔNG đổi trường cấp hồ sơ nào (status giữ
     nguyên, chỉ thêm phiên bản đánh giá mới) vẫn phải đóng dấu
     updatedAt/updatedBy = người vừa nộp + sinh đúng 1 mục audit update
     (change "revision": số phiên bản cũ -> mới, KHÔNG chép nội dung
     revision vào audit). Trước sửa: stampPubAndAudit loại hẳn
     current/revisions/revision khỏi diff nên lần nộp này im lặng hoàn
     toàn — updatedAt đứng yên ở mốc cũ, updatedBy vẫn là người trước.
   - CRM Import: Gỡ lô (impRemoveBatch) phải dọn liên kết của lead/công ty
     bị xoá ở MỌI entity tham chiếu như đường xoá tay (deleteLead /
     deleteCompany): sự kiện (event.companies/leads) + việc (task.lead /
     task.company) — các entity bị dọn đó được đóng dấu + ghi lịch sử
     trong CÙNG lần save(). Trước sửa: chỉ dọn ev.leads + deal.leads;
     ev.companies giữ id công ty đã xoá (liên kết mồ côi, sự kiện không
     được đóng dấu phần companies), task.lead giữ id lead đã xoá (việc
     không được đóng dấu).
   - Khoá hành vi vốn đã đúng (chống hồi quy): kéo-thả Lead/Deal, gắn
     event, radio đầu mối chính — mọi phía bị ảnh hưởng đều qua save(). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Harness index.html (mẫu audit-history.test.cjs) ---------- */
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c9', name: 'Công ty Lô', type: 'Doanh nghiệp', roles: {}, last: 'Vừa tạo', importBatch: 'B1' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: '', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'converted', note: '', when: '2026-10-01', mainContact: true },
      { id: 'l2', name: 'Người Hai', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-01', mainContact: false },
      { id: 'l9', name: 'Lead Lô', company: 'c9', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-01', mainContact: false, importBatch: 'B1' }],
    tasks: [{ id: 't1', title: 'Việc Một', assignee: 'linh', deal: 'd1', due: '', dueDate: '', done: false },
      { id: 't9', title: 'Việc gắn lead lô', assignee: 'linh', lead: 'l9', due: '', dueDate: '', done: false }],
    activities: [{ id: 'a1', deal: 'd1', type: 'Note', who: 'linh', when: '2026-10-01', text: 'hi', url: '' }],
    events: [{ id: 'ev1', name: 'Sự kiện Một', date: '2026-11-01', location: 'HN', attendees: ['zac'], note: '', companies: ['c1', 'c9'], leads: ['l9'], deals: [] }],
    verticals: [],
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

test('Việc 4 / gỡ lô: sự kiện mất cả liên kết công ty của lô + được đóng dấu/ghi lịch sử phần companies', () => {
  const { run, captured } = loadIndex();
  run(`impBatchList = SavaImport.listBatches(S); impRemoveBatch(impBatchList.findIndex(b => b.batch === 'B1'));`);
  const ev = run(`S.events.find(e => e.id === 'ev1')`);
  assert.ok(!ev.companies.includes('c9'), 'event.companies còn giữ id công ty đã xoá của lô: ' + JSON.stringify(ev.companies));
  assert.ok(!ev.leads.includes('l9'), 'event.leads còn giữ id lead đã xoá của lô');
  assert.ok(ev.updatedAt && ev.updatedBy === 'linh', 'sự kiện bị dọn liên kết phải được đóng dấu bởi người gỡ lô');
  const evEntries = captured.filter(e => e.entityType === 'event' && e.entityId === 'ev1' && e.action === 'update');
  assert.equal(evEntries.length, 1, 'đúng 1 mục audit cho sự kiện trong lần gỡ lô');
  assert.ok(evEntries[0].changes.some(c => c.field === 'companies'), 'audit sự kiện phải ghi thay đổi companies: ' + JSON.stringify(evEntries[0].changes));
  assert.ok(evEntries[0].changes.some(c => c.field === 'leads'), 'audit sự kiện phải ghi thay đổi leads');
  assert.ok(captured.some(e => e.entityType === 'lead' && e.entityId === 'l9' && e.action === 'delete'), 'lead của lô phải có mục delete');
  assert.ok(captured.some(e => e.entityType === 'company' && e.entityId === 'c9' && e.action === 'delete'), 'công ty của lô phải có mục delete');
});

test('Việc 4 / gỡ lô: việc gắn lead của lô được gỡ liên kết + đóng dấu/ghi lịch sử như xoá lead tay', () => {
  const { run, captured } = loadIndex();
  run(`impBatchList = SavaImport.listBatches(S); impRemoveBatch(impBatchList.findIndex(b => b.batch === 'B1'));`);
  const t9 = run(`S.tasks.find(t => t.id === 't9')`);
  assert.ok(t9, 'việc vẫn còn sau khi gỡ lô (chỉ gỡ liên kết)');
  assert.equal(t9.lead, undefined, 'task.lead còn giữ id lead đã xoá của lô');
  assert.ok(t9.updatedAt && t9.updatedBy === 'linh', 'việc bị gỡ liên kết phải được đóng dấu bởi người gỡ lô');
  const tEntries = captured.filter(e => e.entityType === 'task' && e.entityId === 't9' && e.action === 'update');
  assert.equal(tEntries.length, 1, 'đúng 1 mục audit cho việc bị gỡ liên kết');
  assert.ok(tEntries[0].changes.some(c => c.field === 'lead'), 'audit việc phải ghi thay đổi lead: ' + JSON.stringify(tEntries[0].changes));
});

test('Việc 4 / khoá hành vi: kéo-thả lead + deal, gắn sự kiện, radio đầu mối chính — mọi phía đều đóng dấu qua save()', () => {
  const h1 = loadIndex();
  h1.run(`leadDragId = 'l2'; dropLead({ preventDefault() {} }, 'qualified');`);
  const l2 = h1.run(`S.leads.find(l => l.id === 'l2')`);
  assert.ok(l2.updatedAt && l2.updatedBy === 'linh' && l2.status === 'qualified', 'kéo-thả lead phải đóng dấu lead');
  assert.ok(h1.captured.some(e => e.entityType === 'lead' && e.entityId === 'l2' && e.action === 'update'));

  const h2 = loadIndex();
  h2.run(`dragId = 'd1'; drop({ preventDefault() {} }, 'publishing', 'term');`);
  const d1 = h2.run(`S.deals.find(d => d.id === 'd1')`);
  assert.ok(d1.updatedAt && d1.updatedBy === 'linh' && d1.stage === 'term', 'kéo-thả deal phải đóng dấu deal');
  assert.ok(h2.captured.some(e => e.entityType === 'deal' && e.entityId === 'd1' && e.action === 'update'));

  const h3 = loadIndex();
  h3.run(`attachEventLink('ev1', 'lead', 'l2');`);
  const ev = h3.run(`S.events.find(e => e.id === 'ev1')`);
  assert.ok(ev.updatedAt && ev.updatedBy === 'linh', 'gắn liên kết sự kiện phải đóng dấu sự kiện');
  assert.ok(h3.captured.some(e => e.entityType === 'event' && e.entityId === 'ev1' && e.changes.some(c => c.field === 'leads')));

  const h4 = loadIndex();
  h4.run(`detachLeadFromDeal('l1', 'd1');`);
  const dl = h4.run(`S.deals.find(d => d.id === 'd1')`), ll = h4.run(`S.leads.find(l => l.id === 'l1')`);
  assert.ok(dl.updatedBy === 'linh' && ll.updatedBy === 'linh' && ll.status === 'qualified', 'gỡ lead khỏi deal phải đóng dấu CẢ deal lẫn lead (P2)');
  assert.ok(h4.captured.some(e => e.entityType === 'deal' && e.entityId === 'd1') && h4.captured.some(e => e.entityType === 'lead' && e.entityId === 'l1'));
});

test('Việc 4 bổ sung / lịch sử chỉ ghi đúng field đổi: sửa 1 field -> 1 mục chỉ chứa field đó; lưu không đổi -> không mục mới, dấu không đổi', () => {
  const h = loadIndex();
  h.run(`save();`);
  assert.equal(h.captured.length, 0, 'lưu mà không đổi gì (fixture vừa nạp) không được sinh mục lịch sử nào');
  h.run(`S.leads.find(l => l.id === 'l2').note = 'Ghi chú mới'; save();`);
  const l2Entries = h.captured.filter(e => e.entityType === 'lead' && e.entityId === 'l2');
  assert.equal(h.captured.length, 1, 'sửa 1 field của 1 lead -> toàn lần lưu chỉ sinh đúng 1 mục');
  assert.equal(l2Entries.length, 1);
  assert.deepEqual([...l2Entries[0].changes.map(c => c.field)], ["note"], 'mục lịch sử chỉ chứa đúng field note vừa sửa');
  const stampAfterEdit = h.run(`S.leads.find(l => l.id === 'l2').updatedAt`);
  assert.ok(stampAfterEdit, 'lead vừa sửa phải có updatedAt');
  h.run(`save();`);
  assert.equal(h.captured.length, 1, 'lưu lại mà không đổi gì -> không thêm mục lịch sử');
  assert.equal(h.run(`S.leads.find(l => l.id === 'l2').updatedAt`), stampAfterEdit, 'lưu không đổi -> updatedAt giữ nguyên');
});

test('Việc 4 bổ sung / lịch sử chỉ ghi đúng field đổi: kéo-thả chỉ ghi trạng thái; gắn lead<->deal mỗi phía chỉ ghi thay đổi của phía đó', () => {
  const h1 = loadIndex();
  h1.run(`leadDragId = 'l2'; dropLead({ preventDefault() {} }, 'qualified');`);
  const dragEntries = h1.captured.filter(e => e.entityType === 'lead' && e.entityId === 'l2' && e.action === 'update');
  assert.equal(dragEntries.length, 1, 'kéo-thả lead sinh đúng 1 mục');
  assert.deepEqual([...dragEntries[0].changes.map(c => c.field)], ["status"], 'kéo-thả lead chỉ ghi field status');

  const h2 = loadIndex();
  h2.run(`attachLeadToDeal('l2', 'd1');`);
  const dealEntries = h2.captured.filter(e => e.entityType === 'deal' && e.entityId === 'd1' && e.action === 'update');
  assert.equal(dealEntries.length, 1, 'gắn lead: deal sinh đúng 1 mục');
  assert.deepEqual([...dealEntries[0].changes.map(c => c.field)], ["leads"], 'phía deal chỉ ghi thay đổi liên kết leads');
  const leadEntries = h2.captured.filter(e => e.entityType === 'lead' && e.entityId === 'l2' && e.action === 'update');
  assert.equal(leadEntries.length, 1, 'gắn lead: lead sinh đúng 1 mục');
  assert.deepEqual([...leadEntries[0].changes.map(c => c.field)], ["status"], 'phía lead chỉ ghi chuyển trạng thái tự động (P2)');
  assert.equal(leadEntries[0].changes[0].to, 'Đã chuyển đổi', 'giá trị đích được resolve thành nhãn trạng thái như thiết kế diff có nhãn');
});

test('Việc 4 bổ sung / hiển thị: mọi danh sách CRM có chỉ dấu Cập nhật cuối từ updatedAt — cùng nguồn, cùng định dạng; chưa có dấu hiện "—" (bảng) / không hiện (thẻ)', () => {
  const ISO = '2026-11-02T03:00:00.000Z';
  const st = fixtureState();
  /* Lead l1 đóng vai lead IMPORT: có dấu hệ thống nhưng when (field
     nghiệp vụ trong file) rỗng — đúng ca Zac chụp màn hình 3/11: cột
     thời gian ở danh sách phải hiện ngày cập nhật chứ không trống. */
  st.leads[0].updatedAt = ISO; st.leads[0].when = '';
  st.companies[0].updatedAt = ISO; st.tasks[0].updatedAt = ISO;
  st.games[0].updatedAt = ISO; st.events[0].updatedAt = ISO;
  st.members[1].updatedAt = ISO; st.deals[0].updatedAt = ISO;
  const h = loadIndex(st);
  const dstr = h.run(`sysShortDate('${ISO}')`);
  assert.ok(dstr, 'sysShortDate phải định dạng được ISO');

  const row = h.run(`leadRowHTML(S.leads[0])`);
  assert.ok(row.includes('🕘 ' + dstr), 'hàng lead dạng Block hiện 🕘 + ngày updatedAt dù when rỗng: ' + row);
  const rowNo = h.run(`leadRowHTML(S.leads[1])`);
  assert.ok(rowNo.includes('<td>—</td>'), 'lead chưa có dấu: ô Cập nhật cuối hiện "—": ' + rowNo);
  assert.ok(!rowNo.includes('01/10/2026'), 'ô Cập nhật cuối KHÔNG được lấy field when (01/10/2026) lấp vào: ' + rowNo);
  assert.ok(h.run(`leadCardHTML(S.leads[0])`).includes('🕘 ' + dstr), 'thẻ lead trên pipeline hiện chỉ dấu');
  assert.ok(!h.run(`leadCardHTML(S.leads[1])`).includes('🕘'), 'thẻ lead chưa có dấu: không hiện chỉ dấu');

  const TH_UPDATED = /<th[^>]*>(?:<button[^>]*>)?Cập nhật cuối/; /* Việc 6: tiêu đề cột thành nút sort trong th — vẫn là cột Cập nhật cuối */
  const TH_WHEN = /<th[^>]*>(?:<button[^>]*>)?Thời gian</;
  h.run(`vLeads();`);
  assert.ok(TH_UPDATED.test(h.getEl('view').innerHTML), 'bảng Lead có cột Cập nhật cuối');
  assert.ok(!TH_WHEN.test(h.getEl('view').innerHTML), 'không còn cột "Thời gian" đọc when ở bảng Lead');
  h.run(`vCompanies();`);
  assert.ok(TH_UPDATED.test(h.getEl('view').innerHTML) && h.getEl('view').innerHTML.includes('🕘 ' + dstr), 'bảng Công ty có cột Cập nhật cuối + số thật');
  h.run(`vEvents();`);
  assert.ok(TH_UPDATED.test(h.getEl('view').innerHTML) && h.getEl('view').innerHTML.includes('🕘 ' + dstr), 'bảng Sự kiện có cột Cập nhật cuối + số thật');
  h.run(`vMembers();`);
  assert.ok(TH_UPDATED.test(h.getEl('view').innerHTML) && h.getEl('view').innerHTML.includes('🕘 ' + dstr), 'bảng Thành viên có cột Cập nhật cuối + số thật');
  h.run(`vGames();`);
  assert.ok(h.getEl('view').innerHTML.includes('🕘 ' + dstr), 'thẻ Game hiện chỉ dấu cập nhật');
  assert.ok(h.run(`taskRow(S.tasks[0])`).includes('🕘 ' + dstr), 'dòng Việc hiện chỉ dấu cập nhật');
  assert.ok(!h.run(`taskRow(S.tasks[1])`).includes('🕘'), 'việc chưa có dấu: không hiện chỉ dấu');
  assert.ok(h.run(`dealMini(S.deals[0])`).includes('🕘 ' + dstr), 'thẻ deal gọn (dealMini) hiện chỉ dấu');
  h.run(`curLine = 'publishing'; vBoard();`);
  assert.ok(h.getEl('view').innerHTML.includes('🕘 ' + dstr), 'thẻ deal pipeline vẫn hiện chỉ dấu (giữ nguyên hành vi cũ)');
});

/* ---------- Harness publishing.js (mẫu audit-history + seed request) ---------- */
const SEED_AT = '2026-11-01T00:00:00.000Z';
function seedRequest(status) {
  return { id: 'REV-1', kind: 'company', entityId: 'c1', requestedBy: 'linh', assignee: 'mai', due: '', requestNote: 'note', source: '', build: 'B1',
    intake: { teamSize: '', country: '', mainGenres: '', mainPlatforms: '', trackRecord: '', website: '' },
    status, requestedAt: SEED_AT, current: null, revisions: [], revision: 0,
    createdAt: SEED_AT, updatedAt: SEED_AT, updatedBy: 'zac' };
}
function loadPublishing(role, member, seedReq) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const crmState = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }], companies: [{ id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '' }], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: seedReq ? [seedReq] : [], marketUpdates: [] }));
  const makeElement = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, reportValidity: () => true, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map();
  const handlers = {};
  const documentStub = { readyState: 'complete', body: Object.assign(makeElement(), { dataset: { role } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); }, getElementById: () => null };
  class FakeFormData {
    constructor(form) { this.m = (form && form._fields) || new Map(); }
    get(k) { return this.m.has(k) ? this.m.get(k) : null; }
    getAll(k) { const v = this.m.get(k); return v === undefined ? [] : [v]; }
  }
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/publishing.html' },
    history: { replaceState() {} },
    addEventListener() {}, URLSearchParams, URL, structuredClone, FormData: FakeFormData,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const captured = [];
  ctx.SavaAuth = { currentUser: () => member };
  ctx.SavaAudit = { recordBatch: entries => { captured.push(...entries); } };
  const setReviewFields = fields => {
    const m = new Map(Object.entries(fields));
    const el = elements.get('#reviewForm') || (() => { const e2 = makeElement(); elements.set('#reviewForm', e2); return e2; })();
    el._fields = m;
    return { target: { id: 'reviewForm', _fields: m }, preventDefault() {} };
  };
  const dispatchReviewSubmit = fields => { const ev = setReviewFields(fields); (handlers.submit || []).forEach(fn => fn(ev)); };
  const dispatchClick = btn => { const ev = { target: { closest: sel => (sel === 'button' ? btn : null) } }; (handlers.click || []).forEach(fn => fn(ev)); };
  return { ctx, ls, captured, dispatchReviewSubmit, dispatchClick, setReviewFields, run: code => vm.runInContext(code, ctx) };
}
const COMPANY_INTAKE_FIELDS = { teamSize: '', country: '', mainGenres: '', mainPlatforms: '', trackRecord: '', website: '' };
const GATE_FIELDS = {};
for (const k of ['legal', 'ip', 'conflict', 'transparency', 'continuity', 'integrity']) { GATE_FIELDS['g_' + k] = 'PENDING'; GATE_FIELDS['gn_' + k] = ''; GATE_FIELDS['gu_' + k] = ''; }

test('Việc 4 / Publishing: MKT nộp revision GIỮ NGUYÊN status -> request vẫn đóng dấu người nộp + 1 mục audit revision', () => {
  const h = loadPublishing('mkt', { memberId: 'mai', role: 'mkt' }, seedRequest('Đang đánh giá'));
  h.dispatchClick({ hasAttribute: () => false, dataset: { review: 'REV-1' } });
  const fields = { reviewer: 'mai', status: 'Đang đánh giá', build: 'B1', comment: 'MKT nhận xét', strengths: '', risks: '', conditions: 'cần thêm', next: '' };
  for (const k of ['track', 'team', 'capacity', 'cadence', 'milestone', 'liveops', 'data', 'collaboration', 'strategy', 'pipeline', 'history']) { fields['s_' + k] = ''; fields['t_' + k] = 'Thiếu'; fields['n_' + k] = ''; fields['u_' + k] = ''; }
  h.dispatchReviewSubmit(fields);
  const req = JSON.parse(h.ls.getItem('sava_publishing_v1')).requests[0];
  assert.equal(req.revisions.length, 1, 'revision mới phải được lưu');
  assert.notEqual(req.updatedAt, SEED_AT, 'nộp revision là một lần cập nhật hồ sơ — updatedAt không được đứng yên ở mốc cũ');
  assert.equal(req.updatedBy, 'mai', 'updatedBy phải là MKT vừa nộp revision, không phải người cũ');
  assert.equal(req.createdAt, SEED_AT, 'createdAt bất biến');
  const upd = h.captured.filter(e => e.entityType === 'request' && e.entityId === 'REV-1' && e.action === 'update');
  assert.equal(upd.length, 1, 'đúng 1 mục audit update cho lần nộp revision: ' + JSON.stringify(h.captured));
  assert.equal(upd[0].byMemberId, 'mai');
  assert.deepEqual([...upd[0].changes.map(c => c.field)], ['revision'], 'audit chỉ ghi mốc phiên bản, không chép nội dung revision: ' + JSON.stringify(upd[0].changes));
  assert.equal(upd[0].changes[0].from, '0'); assert.equal(upd[0].changes[0].to, '1');
});

test('Việc 4 / Publishing: BD nộp revision chỉ đổi bdComment (chế độ xem hồ sơ) -> request vẫn đóng dấu người nộp + audit revision', () => {
  const h = loadPublishing('bd', { memberId: 'linh', role: 'bd' }, seedRequest('Chờ đánh giá'));
  h.dispatchClick({ hasAttribute: () => false, dataset: { review: 'REV-1' } });
  /* Chế độ XEM khối BD: form KHÔNG có build/source/assignee/due/intake —
     FakeFormData.get trả null cho các field đó nên submitReview giữ
     nguyên cấp hồ sơ; thay đổi duy nhất nằm trong revision (bdComment). */
  h.dispatchReviewSubmit({ reviewer: 'linh', comment: 'BD bổ sung lần 1', s_deal: '', t_deal: 'Thiếu', n_deal: '', u_deal: '', s_legalEvidence: '', t_legalEvidence: 'Thiếu', n_legalEvidence: '', u_legalEvidence: '', ...GATE_FIELDS });
  const req = JSON.parse(h.ls.getItem('sava_publishing_v1')).requests[0];
  assert.equal(req.revisions.length, 1);
  assert.notEqual(req.updatedAt, SEED_AT, 'nộp bổ sung BD là một lần cập nhật — updatedAt không được đứng yên');
  assert.equal(req.updatedBy, 'linh', 'updatedBy phải là BD vừa nộp, không phải người cũ (zac)');
  const upd = h.captured.filter(e => e.entityType === 'request' && e.entityId === 'REV-1' && e.action === 'update');
  assert.equal(upd.length, 1, 'đúng 1 mục audit update: ' + JSON.stringify(h.captured));
  assert.deepEqual([...upd[0].changes.map(c => c.field)], ['revision']);
});

test('Việc 4 bổ sung / Publishing hiển thị: thẻ request ở danh sách hiện 🕘 theo updatedAt; request chưa có dấu thì không hiện chỉ dấu', () => {
  const expected = new Date(SEED_AT).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const h = loadPublishing('bd', { memberId: 'linh', role: 'bd' }, seedRequest('Chờ đánh giá'));
  h.dispatchClick({ hasAttribute: () => false, dataset: { tab: 'reviews' } });
  const html = h.run(`document.querySelector('#screen').innerHTML`);
  assert.ok(html.includes('🕘 ' + expected), 'thẻ request phải hiện 🕘 + ngày updatedAt (' + expected + '): ' + html.slice(0, 400));

  const bare = seedRequest('Chờ đánh giá'); delete bare.createdAt; delete bare.updatedAt; delete bare.updatedBy;
  const h2 = loadPublishing('bd', { memberId: 'linh', role: 'bd' }, bare);
  h2.dispatchClick({ hasAttribute: () => false, dataset: { tab: 'reviews' } });
  const html2 = h2.run(`document.querySelector('#screen').innerHTML`);
  assert.ok(!html2.includes('🕘'), 'request chưa có dấu hệ thống: thẻ không hiện chỉ dấu, không lấy mốc nghiệp vụ lấp vào');
});

test('Việc 4 / Publishing: nộp revision KÈM đổi cấp hồ sơ vẫn đúng 1 mục audit, changes chỉ gồm field hồ sơ (không nhân đôi revision)', () => {
  const h = loadPublishing('bd', { memberId: 'linh', role: 'bd' }, seedRequest('Chờ đánh giá'));
  h.dispatchClick({ hasAttribute: () => false, dataset: { review: 'REV-1' } });
  h.dispatchReviewSubmit({ reviewer: 'linh', build: 'Build 2', source: '', assignee: 'mai', due: '', comment: 'bổ sung', s_deal: '', t_deal: 'Thiếu', n_deal: '', u_deal: '', s_legalEvidence: '', t_legalEvidence: 'Thiếu', n_legalEvidence: '', u_legalEvidence: '', ...COMPANY_INTAKE_FIELDS, ...GATE_FIELDS });
  const req = JSON.parse(h.ls.getItem('sava_publishing_v1')).requests[0];
  assert.equal(req.build, 'Build 2');
  assert.equal(req.updatedBy, 'linh');
  const upd = h.captured.filter(e => e.entityType === 'request' && e.entityId === 'REV-1' && e.action === 'update');
  assert.equal(upd.length, 1, 'vẫn đúng 1 mục audit cho request trong 1 lần write');
  assert.deepEqual([...upd[0].changes.map(c => c.field)], ['build'], 'changes giữ nguyên như hành vi đã chốt: chỉ field cấp hồ sơ');
});
