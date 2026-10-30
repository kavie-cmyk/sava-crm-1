/* Bỏ trường "đầu mối chính" riêng cấp công ty (chốt nghiệp vụ):
   người liên hệ của công ty = chính các Lead của công ty đó, một nguồn
   sự thật duy nhất. File này kiểm:
   - Migration một lần trong migrateState (shared.js): công ty còn đầu mối
     cũ (c.contact + c.phone đi kèm) mà chưa có lead tương ứng -> tạo Lead
     (tên từ đầu mối, SĐT từ c.phone, line suy từ roles/deal), marker
     c.contactLeadMigrated chống chạy lại (kể cả khi lead đã migrate bị
     xóa), không tạo trùng khi đã có lead trùng name HOẶC person, không
     đụng lead user đã tự sửa, giữ chỗ "—"/rỗng không sinh lead.
   - Field cũ giữ trong dữ liệu thô (lựa chọn đã ghi trong shared.js) nên
     adapter round-trip không mất: marker + lead.phone đi qua legacy_extra.
   - Bề mặt: form công ty không còn field đầu mối (e_ccontact/e_cphone),
     index.html không còn đọc c.contact/c.phone ở bề mặt nào,
     publishing.js không còn "Đầu mối chính" và khối thông tin công ty
     phía đánh giá hiện danh sách lead theo CRM hiện tại (kể cả SĐT),
     snapshot mồ côi không còn hiện đầu mối cũ.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Harness shared.js THẬT (vm + localStorage stub) ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const base = over => Object.assign({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] }, over || {});

/* ---------- Migration ---------- */
test('migration: tạo lead từ đầu mối cũ (tên + SĐT), line suy từ roles, gắn marker, giữ field thô', () => {
  const ctx = loadShared();
  const s = base({ companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Nguyễn Văn A — CEO', phone: '0901234567', last: 'Hôm qua' }] });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.length, 1, 'phải tạo đúng 1 lead từ đầu mối cũ');
  const l = out.leads[0];
  assert.equal(l.company, 'c1');
  assert.equal(l.name, 'Nguyễn Văn A — CEO', 'tên lead lấy từ đầu mối cũ');
  assert.equal(l.phone, '0901234567', 'SĐT của khối đầu mối cũ phải sang lead');
  assert.equal(l.line, 'ai', 'line suy từ vai trò theo mảng của công ty');
  assert.equal(l.status, 'new');
  assert.ok(l.id && !out.leads.some(x => x !== l && x.id === l.id), 'lead mới có id riêng, không trùng');
  const c = out.companies[0];
  assert.equal(c.contactLeadMigrated, true, 'công ty phải được gắn marker đã migrate');
  assert.equal(c.contact, 'Nguyễn Văn A — CEO', 'lựa chọn đã chốt: field cũ GIỮ trong dữ liệu thô, chỉ bỏ khỏi bề mặt');
});

test('migration: idempotent — chạy lại nhiều lần không nhân bản; xóa lead đã migrate không hồi sinh', () => {
  const ctx = loadShared();
  let s = base({ companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { publishing: 'Game studio' }, contact: 'Chị B — Founder', phone: '0912', last: '' }] });
  s = ctx.migrateState(s);
  assert.equal(s.leads.length, 1);
  s = ctx.migrateState(JSON.parse(JSON.stringify(s)));
  s = ctx.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(s.leads.length, 1, 'chạy lại migrateState không được tạo thêm lead');
  /* User xóa lead đã migrate -> marker chặn hồi sinh từ field thô còn giữ */
  s.leads = [];
  s = ctx.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(s.leads.length, 0, 'lead đã xóa không được tự hồi sinh ở lần nạp sau');
});

test('migration: đã có lead trùng TÊN ở cùng công ty -> không tạo trùng', () => {
  const ctx = loadShared();
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Trần Văn B', phone: '0909', last: '' }],
    leads: [{ id: 'l1', name: 'Trần Văn B', company: 'c1', person: 'Anh B — CTO', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-01' }],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.length, 1, 'lead cùng tên + cùng công ty đã là đầu mối tương ứng');
  assert.equal(out.companies[0].contactLeadMigrated, true);
});

test('migration: đã có lead trùng PERSON (tiền lệ contact ghi từ lead.person) -> không tạo trùng', () => {
  const ctx = loadShared();
  const s = base({
    companies: [{ id: 'c10', name: 'Studio Mooncat', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'Anh Minh — Founder', phone: '', last: '' }],
    leads: [{ id: 'l1', name: 'Nguyễn Tuấn Minh', company: 'c10', person: 'Anh Minh — Founder', line: 'publishing', source: '', status: 'qualified', note: 'lead user tự quản', when: '2026-10-01' }],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.length, 1, 'person trùng đầu mối = cùng một người, không tạo lead trùng');
  assert.equal(out.leads[0].note, 'lead user tự quản', 'lead có sẵn không bị đụng');
});

test('migration: trùng tên nhưng KHÁC công ty -> vẫn tạo lead cho công ty này', () => {
  const ctx = loadShared();
  const s = base({
    companies: [
      { id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Anh Chung', phone: '', last: '' },
      { id: 'c2', name: 'Beta', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: '', phone: '', last: '' },
    ],
    leads: [{ id: 'l1', name: 'Anh Chung', company: 'c2', person: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-01' }],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.filter(l => l.company === 'c1').length, 1, 'lead trùng tên ở công ty khác không tính là đầu mối của công ty này');
});

test('migration: đầu mối giữ chỗ/rỗng không sinh lead; công ty bản mới (không field cũ) không gắn marker thừa', () => {
  const ctx = loadShared();
  const s = base({
    companies: [
      { id: 'c1', name: 'Giữ chỗ', type: 'Đối tác', roles: {}, contact: '—', phone: '', last: '' },
      { id: 'c2', name: 'Trống', type: 'Đối tác', roles: {}, contact: '', phone: '0909', last: '' },
      { id: 'c3', name: 'Bản mới', type: 'Đối tác', roles: {}, last: '' },
    ],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.length, 0, '"—"/rỗng (kể cả chỉ có SĐT, không tên) không tạo lead');
  assert.equal('contactLeadMigrated' in out.companies[2], false, 'công ty không có field cũ thì không cần marker');
});

test('migration: line fallback — không roles thì lấy line của deal; không deal thì publishing', () => {
  const ctx = loadShared();
  const s = base({
    companies: [
      { id: 'c1', name: 'Có deal AI', type: 'Doanh nghiệp', roles: {}, contact: 'Người Một', phone: '', last: '' },
      { id: 'c2', name: 'Trơ', type: 'Doanh nghiệp', roles: {}, contact: 'Người Hai', phone: '', last: '' },
    ],
    deals: [{ id: 'd1', line: 'ai', title: 'Deal', company: 'c1', stage: 'prospect', owner: '', due: '', idle: 0, custom: {}, leads: [] }],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.find(l => l.company === 'c1').line, 'ai');
  assert.equal(out.leads.find(l => l.company === 'c2').line, 'publishing');
});

test('migration: lead user tự sửa (không trùng đầu mối) giữ nguyên từng field', () => {
  const ctx = loadShared();
  const mine = { id: 'l9', name: 'Tên User Tự Đặt', company: 'c1', person: 'Mô tả riêng', phone: '0999', line: 'ai', source: 'Giới thiệu', status: 'qualified', note: 'ghi chú của user', when: '2026-10-15' };
  const before = JSON.parse(JSON.stringify(mine));
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Đầu Mối Khác', phone: '', last: '' }],
    leads: [mine],
  });
  const out = ctx.migrateState(s);
  assert.deepEqual(JSON.parse(JSON.stringify(out.leads.find(l => l.id === 'l9'))), before, 'lead có sẵn không được sửa bởi migration');
  assert.equal(out.leads.length, 2, 'đầu mối khác (chưa có lead tương ứng) vẫn được tạo lead riêng');
});

/* ---------- Adapter: marker + lead.phone sống qua legacy_extra ---------- */
test('adapter: marker migration + lead.phone round-trip qua legacy_extra (không cần cột/SQL mới)', () => {
  const A = require('../supabase-adapter.js');
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Nguyễn Văn A — CEO', phone: '0901234567', last: '', contactLeadMigrated: true }],
    leads: [{ id: 'l1', name: 'Nguyễn Văn A — CEO', company: 'c1', person: 'Nguyễn Văn A — CEO', phone: '0901234567', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-30' }],
  });
  const rows = A.crmStateToRows(s);
  assert.equal(rows.companies[0].legacy_extra.contactLeadMigrated, true, 'marker phải đi qua companies.legacy_extra');
  assert.equal(rows.leads[0].legacy_extra.phone, '0901234567', 'lead.phone phải đi qua leads.legacy_extra');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.companies[0].contactLeadMigrated, true);
  assert.equal(back.leads[0].phone, '0901234567');
  /* State THIẾU hẳn contact/phone (công ty tạo bởi bản mới) không vỡ adapter */
  const rows2 = A.crmStateToRows(base({ companies: [{ id: 'c9', name: 'Mới', type: '', roles: {}, last: '' }] }));
  assert.equal(rows2.companies[0].contact, '');
  assert.equal(A.crmRowsToState(rows2).companies[0].name, 'Mới');
});

/* ---------- Bề mặt tĩnh ---------- */
test('tĩnh: form công ty không còn field đầu mối; không bề mặt nào trong index.html đọc c.contact/c.phone', () => {
  const html = read('index.html');
  assert.ok(!html.includes('e_ccontact'), 'form công ty còn input e_ccontact');
  assert.ok(!html.includes('e_cphone'), 'form công ty còn input e_cphone');
  assert.ok(!html.includes('esc(c.contact'), 'còn bề mặt hiển thị c.contact');
  assert.ok(!html.includes('esc(c.phone'), 'còn bề mặt hiển thị c.phone');
  const editCompany = html.slice(html.indexOf('function editCompany'), html.indexOf('function saveCompany'));
  assert.ok(!editCompany.includes('Đầu mối chính'), 'editCompany còn field "Đầu mối chính"');
  const saveCompany = html.slice(html.indexOf('function saveCompany'), html.indexOf('function deleteCompany'));
  assert.ok(!/contact|phone/.test(saveCompany.replace('contactLeadMigrated', '')), 'saveCompany còn ghi contact/phone');
  assert.ok(html.includes('companyLeadsHTML'), 'thiếu helper hiển thị đầu mối từ danh sách lead');
  assert.ok(html.includes('chính là đầu mối liên hệ của công ty'), 'drawer công ty phải nói rõ lead = đầu mối liên hệ');
});

test('tĩnh: publishing.js bỏ "Đầu mối chính" — khối công ty lấy lead từ CRM; snapshot không chụp contact/phone', () => {
  const pub = read('publishing.js');
  assert.ok(!pub.includes('Đầu mối chính'), 'publishing.js còn nhãn "Đầu mối chính"');
  assert.ok(!pub.includes('en.contact') && !pub.includes('snap.contact'), 'publishing.js còn đọc contact của công ty/snapshot');
  assert.ok(pub.includes('Đầu mối liên hệ — lead của công ty (CRM hiện tại)'), 'khối thông tin công ty phía đánh giá phải hiện lead của công ty theo CRM hiện tại');
  const snapFn = pub.slice(pub.indexOf('function entitySnapshotFor'), pub.indexOf('function currentRequesterId'));
  assert.ok(!snapFn.includes('contact') || snapFn.includes('KHÔNG còn chụp'), 'entitySnapshotFor không được chụp contact/phone nữa');
});

/* ---------- Publishing THẬT: dialog hiện lead, không hiện đầu mối cũ ---------- */
function makePubElement() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPub({ crmState, requests = [], role = 'bd' } = {}) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests }));
  const elements = new Map();
  const docListeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: Object.assign(makePubElement(), { dataset: { role } }), activeElement: null,
      querySelector: s => { if (!elements.has(s)) elements.set(s, makePubElement()); return elements.get(s); },
      querySelectorAll: () => [], addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); } },
    location: { search: '', href: 'http://localhost/publishing.html' }, history: { replaceState() {} },
    addEventListener() {}, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const openReview = id => {
    const btn = { dataset: { review: id }, hasAttribute: () => false };
    (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
    return elements.get('#editor').innerHTML;
  };
  return { ctx, ls, elements, openReview };
}
const MEMBERS = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }];
const reqCo = (entityId, extra = {}) => ({ id: 'R-' + entityId, kind: 'company', entityId, requestedBy: 'linh', assignee: 'mai', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-10-30T00:00:00.000Z', current: null, revisions: [], revision: 0, ...extra });

test('publishing: khối thông tin công ty hiện LEAD (tên + SĐT) theo CRM hiện tại, không hiện đầu mối cũ', () => {
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'Đầu Mối Cũ Riêng', phone: '0900-cu', last: '', contactLeadMigrated: true };
  const lead = { id: 'l1', name: 'Lead Thật', company: 'c1', person: 'Chị Thật — Founder', phone: '0912345678', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-30' };
  const crmState = { members: MEMBERS, companies: [co], games: [], deals: [], leads: [lead], tasks: [], activities: [] };
  const env = loadPub({ crmState, requests: [reqCo('c1')], role: 'bd' });
  const dlg = env.openReview('R-c1');
  assert.ok(dlg.includes('Lead Thật'), 'dialog phải hiện tên lead của công ty');
  assert.ok(dlg.includes('0912345678'), 'dialog phải hiện SĐT của lead');
  assert.ok(dlg.includes('Đầu mối liên hệ — lead của công ty (CRM hiện tại)'), 'nhãn khối đầu mối phải là lead theo CRM hiện tại');
  assert.ok(!dlg.includes('Đầu Mối Cũ Riêng'), 'đầu mối cũ cấp công ty không được hiện nữa');
  assert.ok(!dlg.includes('0900-cu'), 'SĐT cũ cấp công ty không được hiện nữa');
});

test('publishing: request mồ côi (snapshot còn contact cũ trong dữ liệu thô) không hiện đầu mối cũ', () => {
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: '', phone: '', last: '' };
  const snap = { name: 'Snap Co', type: 'Game studio', contact: 'Snap Contact Cũ', phone: '0900-snap' };
  const crmState = { members: MEMBERS, companies: [co], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const env = loadPub({ crmState, requests: [reqCo('cx-da-xoa', { entitySnapshot: snap })], role: 'bd' });
  const dlg = env.openReview('R-cx-da-xoa');
  assert.ok(dlg.includes('Snap Co'), 'mồ côi vẫn hiện tên từ snapshot');
  assert.ok(!dlg.includes('Snap Contact Cũ'), 'snapshot không được hiện đầu mối cũ nữa');
  assert.ok(!dlg.includes('0900-snap'), 'snapshot không được hiện SĐT cũ nữa');
});
