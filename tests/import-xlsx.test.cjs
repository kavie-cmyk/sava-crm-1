/* Import xlsx/csv (view Import trong index.html + window.SavaImport ở shared.js):
   - Planner THUẦN SavaImport: đoán header (Anh/Việt/không dấu + header thật
     của 5 tab Raw data), chuẩn hoá tên, tách email/SĐT (gồm số quốc tế —
     số Thái +66 và số +84 lẫn trong ô Email), map status 12 key (lạ -> new
     + cảnh báo), dry-run planImport (công ty mới / khớp sẵn có chỉ điền
     field trống / trùng CRM / trùng nội bộ / lỗi thiếu field sau
     carry-down / mainContact 3 trường hợp), listBatches + planRemoveBatch.
   - Hyperlink mức ô: rowsToRecords nhận links {"row,col": Target} đúng
     cách UI đọc ws[addr].l.Target bằng SheetJS; và nếu gói 'xlsx' có sẵn
     trong môi trường thì kiểm thật vòng write->read->.l.Target (không có
     thì skip — đã kiểm chứng thủ công bằng SheetJS 0.18.5 khi triển khai).
   - UI: vImport -> impRunPreview -> impApply ghi qua save() đúng plan;
     impRemoveBatch gỡ đúng lô. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function loadShared() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaImport;
}
const I = loadShared();
assert.ok(I, 'shared.js phải phơi window.SavaImport');

/* ---------- Chuẩn hoá + đoán header ---------- */
test('impFold: bỏ dấu tiếng Việt + đ/Đ + gộp khoảng trắng/gạch như transform nạp Metaverse', () => {
  assert.equal(I.impFold('Công Ty Đức Anh'), 'cong ty duc anh');
  assert.equal(I.impFold('  LG   Electronics — Vietnam '), 'lg electronics vietnam');
  assert.equal(I.impFold('ĐÀ NẴNG'), 'da nang');
  assert.equal(I.impFold(null), '');
});

test('guessMapping: header tiếng Anh (bộ cột Yến Manufacturing)', () => {
  const headers = ['Company Name', 'Location', 'Established Year', 'Size', '# Employees', 'Industry', 'Website', 'Company Linkedin Url', 'PIC', 'Title', 'Email', 'Status', 'Last Approach', 'Note'];
  assert.deepEqual(Array.from(I.guessMapping(headers)), ['companyName', 'profile.location', 'profile.establishedYear', 'profile.size', 'profile.employees', 'profile.industry', 'profile.website', 'profile.linkedinUrl', 'picName', 'person', 'email', 'status', 'when', 'note']);
});

test('guessMapping: header tiếng Việt có dấu và không dấu cho cùng một đích', () => {
  const withMarks = ['Tên công ty', 'Tên PIC', 'Chức vụ', 'Email', 'Số điện thoại', 'Trạng thái', 'Ghi chú', 'Địa điểm', 'Website', 'Ngành'];
  const noMarks = ['Ten cong ty', 'Ten PIC', 'Chuc vu', 'Email', 'So dien thoai', 'Trang thai', 'Ghi chu', 'Dia diem', 'Website', 'Nganh'];
  const expected = ['companyName', 'picName', 'person', 'email', 'phone', 'status', 'note', 'profile.location', 'profile.website', 'profile.industry'];
  assert.deepEqual(Array.from(I.guessMapping(withMarks)), expected);
  assert.deepEqual(Array.from(I.guessMapping(noMarks)), expected);
});

test('guessMapping: một field chỉ nhận 1 cột — cột trùng đích thứ hai bị bỏ qua', () => {
  assert.deepEqual(Array.from(I.guessMapping(['Email', 'E-mail', 'Company Name', 'PIC'])), ['email', '', 'companyName', 'picName']);
});

/* Header THẬT của 5 tab khách hàng trong file Raw data (đối chiếu
   2026-11-02-raw-data-latest.xlsx): [tên tab, headers, số cột có tên,
   số cột đoán trúng kỳ vọng]. Cột trượt duy nhất được phép: "No." (Emidas),
   "1st Approach Week Time" (2 tab Hoàng — v2b cũng KHÔNG map cột này) và
   cột phụ trợ "Hiển thị (phụ trợ – không xoá)" (Yến Manufacturing). */
const RAW_TABS = [
  ['Yến Manufacturing',
    ['Company Name', 'Location', 'Established Year', 'Size', '# Employees', 'Industry', 'Website', 'Company Linkedin Url', 'Ultimate Parent Company Name/ Investors Supported by', 'Ultimate Parent Company/ Investors Company Website', 'Number of Suborganizations', 'Suborganization Domains', 'Suborganization Names', 'Buying Signals', 'PIC', 'Title', 'Email', 'Status', 'Last Approach', 'Note', 'Hiển thị (phụ trợ – không xoá)', ''], 21, 20],
  ['Hoàng Manufacturing',
    ['Company Name', 'Location', 'Established Year', 'Size', '# Employees', 'Industry', 'Website', 'Company Linkedin Url', 'Ultimate Parent Company Name/ Investors Supported by', 'Ultimate Parent Company/ Investors Company Website', 'Number of Suborganizations', 'Suborganization Domains', 'Suborganization Names', 'Buying Signals', 'PIC', 'Title', 'Email ', 'Status', 'Note', '', '1st Approach Week Time', '', '', '', '', ''], 20, 19],
  ['Yến International School',
    ['Company Name', 'Location ', 'Foundation Year', 'Size', '# Employees', 'Industry', 'Website', 'Company Linkedin Url', 'Ultimate Parent Company Name', 'Ultimate Parent Company Website', 'Number of Suborganizations', 'Suborganization Domains', 'Suborganization Names', 'Buying Signals', 'PIC', 'Title', 'Email', 'Status'], 18, 18],
  ['Hoàng International School',
    ['Company Name', 'Location ', 'Foundation Year', 'Size', '# Employees', 'Industry', 'Website', 'Company Linkedin Url', 'Ultimate Parent Company Name', 'Ultimate Parent Company Website', 'Number of Suborganizations', 'Suborganization Domains', 'Suborganization Names', 'Buying Signals', 'PIC', 'Title', 'Email', 'Status', 'Note', '', '1st Approach Week Time', ''], 20, 19],
  ['Emidas Manufacturing Fair 26',
    ['No.', 'Account Name', 'Industry', 'Company Location', 'Biz Model', 'Size ', 'Priority', 'SAVA Offering', 'PIC', 'Title', 'Email', 'Phone number', 'Status', 'Note', 'Last approach'], 15, 14],
];
for (const [tab, headers, named, hits] of RAW_TABS) {
  test('guessMapping header thật Raw data — ' + tab + ': đoán trúng ' + hits + '/' + named + ' cột có tên', () => {
    const m = Array.from(I.guessMapping(headers));
    const got = headers.filter((h, i) => String(h).trim() !== '' && m[i] !== '').length;
    assert.equal(got, hits, tab + ': số cột đoán trúng lệch kỳ vọng');
    assert.ok(m.includes('companyName') && m.includes('picName'), tab + ': phải ghép được 2 cột bắt buộc');
  });
}
test('guessMapping Emidas: Account Name -> công ty, Company Location -> location, Phone number -> SĐT riêng', () => {
  const m = Array.from(I.guessMapping(RAW_TABS[4][1]));
  assert.equal(m[1], 'companyName');
  assert.equal(m[3], 'profile.location');
  assert.equal(m[4], 'profile.bizModel');
  assert.equal(m[6], 'profile.priority');
  assert.equal(m[7], 'profile.savaOffering');
  assert.equal(m[11], 'phone');
  assert.equal(m[14], 'when');
});

test('findHeaderRow: bỏ qua khối tổng quan phía trên, tìm đúng dòng header; tab không có header -> -1', () => {
  const aoa = [
    ['TỔNG QUAN - tự cập nhật', '', ''],
    ['Chỉ số', 'Số công ty', 'Số PIC'],
    ['', '', ''],
    ['Company Name', 'PIC', 'Email'],
    ['Acme', 'Nguyen Van A', 'a@acme.vn'],
  ];
  assert.equal(I.findHeaderRow(aoa), 3);
  assert.equal(I.findHeaderRow([['', 'LOGIC', 'Business Model'], ['', '', '']]), -1);
});

/* ---------- Tách email / SĐT + status + số hồ sơ ---------- */
test('parseEmailPhone: ô gộp email + SĐT VN -> tách cả hai', () => {
  assert.deepEqual({ ...I.parseEmailPhone('binh@alpha.vn 0901 112 223') }, { email: 'binh@alpha.vn', phone: '0901112223', emailRaw: '' });
  assert.deepEqual({ ...I.parseEmailPhone('lienhe@congty.vn') }, { email: 'lienhe@congty.vn', phone: '', emailRaw: '' });
});
test('parseEmailPhone: số quốc tế lẫn trong ô (số Thái +66, số +84 có dấu chấm) vẫn bắt được', () => {
  assert.equal(I.parseEmailPhone('somchai@thai.co.th +66 81 234 5678').phone, '+66812345678');
  assert.equal(I.parseEmailPhone('a@b.vn +84.901.234.567').phone, '+84901234567');
  assert.equal(I.extractPhone('0084 912 345 678'), '0084912345678');
});
test('parseEmailPhone: ô chỉ có SĐT -> email rỗng, emailRaw giữ nguyên ô, vẫn tách được SĐT', () => {
  const r = I.parseEmailPhone('0901234567');
  assert.equal(r.email, '');
  assert.equal(r.phone, '0901234567');
  assert.equal(r.emailRaw, '0901234567');
  assert.deepEqual({ ...I.parseEmailPhone('') }, { email: '', phone: '', emailRaw: '' });
});
test('mapStatus: đủ 8 nhãn gốc file Raw data + nhãn vòng đời + key thô', () => {
  const cases = [['Sent connect', 'sent_connect'], ['1st message', 'first_message'], ['1st email', 'first_email'], ['1st FU', 'first_fu'], ['In-response', 'in_response'], ['In reply', 'in_reply'], ['Discovery meeting', 'discovery_meeting'], ['Not yet have demand', 'not_yet_have_demand'], ['', 'new'], ['Mới', 'new'], ['Đã liên hệ', 'contacted'], ['Đạt chuẩn', 'qualified'], ['sent_connect', 'sent_connect']];
  for (const [raw, key] of cases) { const r = I.mapStatus(raw); assert.equal(r.key, key, raw); assert.equal(r.known, true, raw); }
});
test('mapStatus: trạng thái lạ -> new + known=false (để cảnh báo, không bịa key)', () => {
  const r = I.mapStatus('Weird Status XYZ');
  assert.equal(r.key, 'new');
  assert.equal(r.known, false);
});
test('normalizeNumericProfile: bỏ ".0" chỉ cho field số hồ sơ', () => {
  assert.equal(I.normalizeNumericProfile('establishedYear', '2013.0'), '2013');
  assert.equal(I.normalizeNumericProfile('employees', '88.0'), '88');
  assert.equal(I.normalizeNumericProfile('size', '201-500'), '201-500');
  assert.equal(I.normalizeNumericProfile('location', '2013.0'), '2013.0');
});

/* ---------- rowsToRecords + hyperlink ---------- */
test('rowsToRecords: LinkedIn cá nhân lấy từ hyperlink của ô PIC (links), không phải giá trị ô', () => {
  const aoa = [
    ['Company Name', 'PIC', 'Email', 'Status'],
    ['Acme Corp', 'Nguyen Van A', 'a@acme.vn', 'Sent connect'],
    ['', 'Tran Thi B', 'b@acme.vn', ''],
  ];
  const mapping = I.guessMapping(aoa[0]);
  const recs = I.rowsToRecords(aoa, 0, mapping, { '1,1': 'https://www.linkedin.com/in/nguyenvana', '2,1': 'https://www.linkedin.com/in/tranthib' });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].linkedinUrl, 'https://www.linkedin.com/in/nguyenvana');
  assert.equal(recs[1].linkedinUrl, 'https://www.linkedin.com/in/tranthib');
  assert.equal(recs[1].companyName, ''); // carry-down do planner làm, record giữ nguyên
});
test('rowsToRecords: dòng chỉ có giá trị ở cột KHÔNG ghép (cột phụ trợ) vẫn tính là dòng trống', () => {
  const aoa = [['Company Name', 'PIC', 'Hiển thị (phụ trợ – không xoá)'], ['', '', '0'], ['Acme', 'A', '1']];
  const recs = I.rowsToRecords(aoa, 0, I.guessMapping(aoa[0]), {});
  assert.equal(recs[0].empty, true);
  assert.equal(recs[1].empty, false);
});

/* ---------- planImport trên fixture state ---------- */
function fixtureState() {
  return {
    companies: [
      { id: 'cA', name: 'Công ty Alpha', type: 'Doanh nghiệp', roles: { metaverse: 'Doanh nghiệp' }, last: '', location: 'Hà Nội' },
      { id: 'cB', name: 'Beta Co', type: 'Doanh nghiệp', roles: { metaverse: 'Doanh nghiệp' }, last: '' },
    ],
    leads: [
      { id: 'lA1', name: 'Nguyễn An', company: 'cA', person: 'CEO', phone: '', line: 'metaverse', source: '', status: 'qualified', note: '', when: '2026-01-01', mainContact: true },
      { id: 'lB1', name: 'Trần Cũ', company: 'cB', person: '', phone: '', line: 'metaverse', source: '', status: 'new', note: '', when: '', mainContact: false },
    ],
    deals: [],
  };
}
function fixtureRecords() {
  const base = { person: '', emailCell: '', phoneCell: '', linkedinUrl: '', statusRaw: '', note: '', whenRaw: '', profile: {} };
  return [
    { ...base, _row: 2, companyName: '', picName: 'Người Lạ' },                                                        // lỗi: dòng đầu, không có công ty để carry-down
    { ...base, _row: 3, companyName: 'Công ty Alpha', picName: 'Nguyễn An' },                                           // trùng CRM
    { ...base, _row: 4, companyName: 'Công ty Alpha', picName: 'Trần Bình', emailCell: 'binh@alpha.vn 0901112223', statusRaw: 'Sent connect', profile: { website: 'alpha.vn', location: 'Hồ Chí Minh' } },
    { ...base, _row: 5, companyName: 'Beta Co', picName: 'Lê Chi', statusRaw: '1st email' },
    { ...base, _row: 6, companyName: 'Beta Co', picName: 'Lê Chi', statusRaw: '1st email' },                            // trùng nội bộ file
    { ...base, _row: 7, companyName: 'Gamma Ltd', picName: 'Phạm Dũng', linkedinUrl: 'https://linkedin.com/in/dung', statusRaw: 'Discovery meeting', whenRaw: '2026-10-09 00:00:00' },
    { ...base, _row: 8, companyName: '', picName: 'Hoàng Em' },                                                         // carry-down -> Gamma Ltd
    { ...base, _row: 9, companyName: 'Delta Inc', picName: '' },                                                        // lỗi: thiếu PIC
    { ...base, _row: 10, companyName: 'Gamma Ltd', picName: 'Võ Sáu', statusRaw: 'Weird Status' },                      // status lạ -> new
  ];
}
test('planImport: tổng số khớp từng loại (mới / khớp / trùng CRM / trùng file / lỗi / status lạ)', () => {
  const plan = I.planImport(fixtureState(), fixtureRecords(), { batch: 'test-batch', line: 'metaverse', ownerId: 'zac', vertical: 'Sản xuất' });
  assert.deepEqual({ ...plan.stats }, { totalRows: 9, newCompanies: 1, matchedCompanies: 2, newLeads: 5, duplicates: 2, errors: 2, unknownStatus: 1 });
  assert.deepEqual(Array.from(plan.duplicates, d => d.reason), ['crm', 'file']);
  assert.deepEqual(Array.from(plan.errors, e => e.reason), ['missing_company', 'missing_pic']);
  assert.deepEqual(Array.from(plan.unknownStatuses, u => [u.raw, u.count]), [['Weird Status', 1]]);
  assert.equal(plan.preview.length, 5);
  assert.equal(plan.preview[0].pic, 'Trần Bình');
});
test('planImport: công ty khớp sẵn có CHỈ điền field hồ sơ đang trống, không ghi đè', () => {
  const plan = I.planImport(fixtureState(), fixtureRecords(), { batch: 'b', line: 'metaverse', ownerId: '', vertical: '' });
  const alpha = plan.companiesMatched.find(m => m.id === 'cA');
  assert.deepEqual({ ...alpha.fill }, { website: 'alpha.vn' }); // location đã có 'Hà Nội' -> không điền 'Hồ Chí Minh'
});
test('planImport: lead mới có email/SĐT đã tách, status đã map, when rút về ngày ISO, marker lô + owner', () => {
  const plan = I.planImport(fixtureState(), fixtureRecords(), { batch: 'test-batch', line: 'metaverse', ownerId: 'zac', vertical: '' });
  const binh = plan.leadsToCreate.find(l => l.name === 'Trần Bình');
  assert.equal(binh.email, 'binh@alpha.vn');
  assert.equal(binh.phone, '0901112223');
  assert.equal(binh.status, 'sent_connect');
  assert.equal(binh.companyId, 'cA');
  assert.equal(binh.importBatch, 'test-batch');
  assert.equal(binh.ownerId, 'zac');
  const dung = plan.leadsToCreate.find(l => l.name === 'Phạm Dũng');
  assert.equal(dung.when, '2026-10-09');
  assert.equal(dung.status, 'discovery_meeting');
  assert.equal(dung.companyId, null);
  assert.equal(dung.companyKey, 'gamma ltd');
  const sau = plan.leadsToCreate.find(l => l.name === 'Võ Sáu');
  assert.equal(sau.status, 'new');
  assert.equal(sau.statusUnknown, true);
});
test('planImport mainContact 3 trường hợp: công ty mới -> PIC đầu; công ty cũ chưa có main -> lead mới đầu; đã có main -> không ai', () => {
  const plan = I.planImport(fixtureState(), fixtureRecords(), { batch: 'b', line: 'metaverse', ownerId: '', vertical: '' });
  const byName = n => plan.leadsToCreate.find(l => l.name === n);
  assert.equal(byName('Phạm Dũng').mainContact, true, 'công ty mới Gamma: PIC đầu là main');
  assert.equal(byName('Hoàng Em').mainContact, false, 'công ty mới Gamma: PIC thứ hai không main');
  assert.equal(byName('Võ Sáu').mainContact, false);
  assert.equal(byName('Lê Chi').mainContact, true, 'Beta chưa có main: lead mới đầu là main');
  assert.equal(byName('Trần Bình').mainContact, false, 'Alpha đã có main (Nguyễn An): lead mới không main');
});
test('planImport: công ty mới mang profile gộp + vertical của lô khi file không có; type/roles theo mảng', () => {
  const plan = I.planImport(fixtureState(), fixtureRecords(), { batch: 'b', line: 'metaverse', ownerId: '', vertical: 'Sản xuất' });
  assert.equal(plan.companiesToCreate.length, 1);
  const g = plan.companiesToCreate[0];
  assert.equal(g.name, 'Gamma Ltd');
  assert.equal(g.profile.vertical, 'Sản xuất');
  assert.equal(g.type, 'Doanh nghiệp');
  assert.deepEqual({ ...g.roles }, { metaverse: 'Doanh nghiệp' });
  assert.equal(g.importBatch, 'b');
});

/* ---------- Lô: listBatches + planRemoveBatch ---------- */
function batchState() {
  return {
    companies: [
      { id: 'cX', name: 'X Co', importBatch: 'B1' },
      { id: 'cY', name: 'Y Co', importBatch: 'B1' },
      { id: 'cW', name: 'W Co', importBatch: 'B1' },
      { id: 'cZ', name: 'Z Co', importBatch: 'B2' },
      { id: 'cN', name: 'No Batch Co' },
    ],
    leads: [
      { id: 'l1', name: 'A', company: 'cX', importBatch: 'B1' },
      { id: 'l2', name: 'B', company: 'cY', importBatch: 'B1' },
      { id: 'l4', name: 'D', company: 'cW', importBatch: 'B1' },
      { id: 'l3', name: 'C', company: 'cY', importBatch: 'B2' },
    ],
    deals: [{ id: 'd1', title: 'Deal X', company: 'cX', leads: [] }],
  };
}
test('listBatches: đếm lead + công ty theo marker importBatch', () => {
  const list = I.listBatches(batchState());
  assert.deepEqual(Array.from(list, b => [b.batch, b.leads, b.companies]), [['B1', 3, 3], ['B2', 1, 1]]);
});
test('planRemoveBatch: xoá hết lead của lô; công ty của lô chỉ xoá khi không còn lead/deal ngoài lô dùng', () => {
  const plan = I.planRemoveBatch(batchState(), 'B1');
  assert.deepEqual(Array.from(plan.leadsToDelete).sort(), ['l1', 'l2', 'l4']);
  assert.deepEqual(Array.from(plan.companiesToDelete), ['cW']);
  const kept = Object.fromEntries(Array.from(plan.companiesToKeep, c => [c.id, [c.leadRefs, c.dealRefs]]));
  assert.deepEqual(kept, { cX: [0, 1], cY: [1, 0] });
});

/* ---------- SheetJS thật (nếu môi trường có gói xlsx) ---------- */
let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }
test('SheetJS: hyperlink đọc ở mức ô ws[addr].l.Target sau vòng write->read', { skip: !XLSX }, () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Company Name', 'PIC'], ['Acme Corp', 'Nguyen Van A']]);
  ws['B2'].l = { Target: 'https://www.linkedin.com/in/nguyenvana' };
  XLSX.utils.book_append_sheet(wb, ws, 'S1');
  const wb2 = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellDates: true });
  const cell = wb2.Sheets['S1']['B2'];
  assert.equal(cell.v, 'Nguyen Van A');
  assert.equal(cell.l.Target, 'https://www.linkedin.com/in/nguyenvana');
});

/* ---------- Tĩnh: lối vào + CDN + CSS ---------- */
test('tĩnh: nav Import ở cả desktop + mobile (class import-bd-only), SheetJS qua CDN jsdelivr, view import đăng ký trong render', () => {
  assert.equal((html.match(/data-view="import"/g) || []).length, 2);
  assert.ok(html.includes('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'));
  assert.ok(html.includes('import:vImport'));
  assert.ok(html.includes('function isImportViewer()'));
  assert.ok(html.includes('workspace-design.css?v=20261103.4'));
  const css = read('workspace-design.css');
  assert.ok(css.includes('.imp-table') && css.includes('.imp-settings'));
});

/* ---------- UI end-to-end qua harness DOM giả ---------- */
function uiFixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [],
  };
}
function loadIndex(state) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(state || uiFixtureState()));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('UI: vImport -> xem trước -> nạp ghi đúng plan qua save() -> gỡ lô sạch', async () => {
  const { run, getEl, ls } = loadIndex();
  run(`window.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) }`);
  run(`curView = 'import'; render();`);
  assert.ok(getEl('view').innerHTML.includes('Chọn file Excel'), 'view Import phải hiện bước chọn file cho Admin');
  run(`impData = { fileName: 'test.xlsx', sheetNames: ['S1'], sheetName: 'S1', wb: null,
    aoa: [['Company Name','PIC','Email','Status'], ['Acme Corp','Nguyen Van A','a@acme.vn','Sent connect'], ['','Tran Thi B','b@acme.vn','']],
    links: { '1,1': 'https://www.linkedin.com/in/nguyenvana', '2,1': 'https://www.linkedin.com/in/tranthib' },
    headerIdx: 0, headers: ['Company Name','PIC','Email','Status'], mapping: ['companyName','picName','email','status'] }; render();`);
  assert.ok(getEl('view').innerHTML.includes('Ghép cột'), 'có impData thì hiện bước ghép cột');
  getEl('imp_owner').value = 'zac';
  getEl('imp_line').value = 'metaverse';
  getEl('imp_vertical').value = '';
  getEl('imp_batch').value = 'ui-batch';
  run(`impRunPreview()`);
  assert.equal(run(`impPlan.stats.newCompanies`), 1);
  assert.equal(run(`impPlan.stats.newLeads`), 2);
  assert.ok(getEl('view').innerHTML.includes('Xem trước'), 'phải hiện khối xem trước');
  await run(`impApply()`);
  assert.equal(run(`S.companies.length`), 1);
  assert.equal(run(`S.leads.length`), 2);
  assert.equal(run(`S.companies[0].importBatch`), 'ui-batch');
  assert.equal(run(`S.leads[0].importBatch`), 'ui-batch');
  assert.equal(run(`S.leads[0].linkedinUrl`), 'https://www.linkedin.com/in/nguyenvana');
  assert.equal(run(`S.leads[0].mainContact`), true);
  assert.equal(run(`S.leads[1].mainContact`), false);
  assert.equal(run(`S.leads[0].status`), 'sent_connect');
  assert.equal(run(`S.leads[0].company`), run(`S.companies[0].id`));
  assert.ok(run(`!!S.leads[0].createdAt`), 'lead tạo qua import phải được sys-stamp như tạo tay');
  assert.ok(String(ls.getItem('sava_crm_shared_v1')).includes('ui-batch'), 'save() phải ghi lô xuống kho');
  assert.equal(run(`impBatchList.length`), 1);
  run(`impRemoveBatch(0)`);
  assert.equal(run(`S.leads.length`), 0);
  assert.equal(run(`S.companies.length`), 0);
});
test('UI: vai MKT không mở được view Import (hiện thông báo chặn)', () => {
  const { run, getEl } = loadIndex();
  run(`window.SavaAuth = { currentUser: () => ({ memberId: 'mai', role: 'mkt' }) }`);
  run(`curView = 'import'; render();`);
  assert.ok(getEl('view').innerHTML.includes('Chỉ Admin và BD'));
  assert.equal(run(`isImportViewer()`), false);
  run(`window.SavaAuth = { currentUser: () => ({ memberId: 'hoang', role: 'bd' }) }`);
  assert.equal(run(`isImportViewer()`), true);
});
