/* Hồ sơ công ty (Company Profile) — đợt bổ sung A:
   - 17 field phụ (key + nhãn theo đúng hợp đồng) định nghĩa ở MỘT danh
     sách dùng chung COMPANY_PROFILE_FIELDS (shared.js); FIELD_LABELS
     .company mang đủ 17 nhãn để lịch sử chỉnh sửa (diff/audit) đọc được.
   - Các key KHÔNG nằm trong COMPANY_KNOWN của adapter: đi qua
     legacy_extra của bảng companies, round-trip nguyên vẹn, không SQL.
   - Drawer công ty: khối "Hồ sơ công ty" xem-trước-sửa-sau (mẫu khối
     Term ở drawer deal): xem chỉ hiện field CÓ dữ kiện; Sửa hiện ô nhập
     cả bộ; Lưu -> về xem; field rỗng không ghi key rác.
   - Form công ty (editCompany): mục "Hồ sơ công ty" đủ 17 field, đọc/
     ghi cùng key — tạo mới cũng nhập được.
   - vertical: SELECT từ danh sách ngành chính thức (mặc định +
     S.verticals, đúng nguồn deal đang dùng); giá trị ngoài danh sách
     hiện "(dữ liệu cũ)" qua selLegacy và không bị mất khi lưu. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const A = require('../supabase-adapter.js');

const PROFILE = [
  ['location', 'Địa điểm'], ['establishedYear', 'Năm thành lập'], ['size', 'Quy mô'],
  ['employees', 'Số nhân sự'], ['industry', 'Ngành'], ['website', 'Website'],
  ['linkedinUrl', 'LinkedIn công ty'], ['parentCompany', 'Công ty mẹ / Nhà đầu tư'],
  ['parentWebsite', 'Website công ty mẹ'], ['suborgCount', 'Số tổ chức con'],
  ['suborgDomains', 'Domain tổ chức con'], ['suborgNames', 'Tên tổ chức con'],
  ['buyingSignals', 'Tín hiệu mua (Buying Signals)'], ['vertical', 'Ngành dọc'],
  ['savaOffering', 'SAVA Offering'], ['bizModel', 'Mô hình kinh doanh (Biz Model)'],
  ['priority', 'Mức ưu tiên (Priority)'],
];
const KEYS = PROFILE.map(([k]) => k);

/* ---------- Tĩnh + shared.js thuần ---------- */
function loadShared() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('tĩnh: COMPANY_PROFILE_FIELDS đúng 17 key + nhãn hợp đồng, đúng thứ tự; textarea cho 3 field dài, vertical là select ngành', () => {
  const ctx = loadShared();
  const fields = ctx.COMPANY_PROFILE_FIELDS;
  assert.ok(Array.isArray(fields), 'shared.js phải định nghĩa COMPANY_PROFILE_FIELDS');
  /* Array.from ở realm Node: tránh deepStrictEqual lệch prototype với mảng tạo trong vm */
  assert.deepEqual(Array.from(fields, f => [f.key, f.label]), PROFILE);
  const typeOf = k => fields.find(f => f.key === k).type;
  assert.equal(typeOf('vertical'), 'vertical');
  for (const k of ['suborgDomains', 'suborgNames', 'buyingSignals']) assert.equal(typeOf(k), 'textarea', k + ' phải là textarea');
  for (const k of KEYS.filter(k => !['suborgDomains', 'suborgNames', 'buyingSignals', 'vertical'].includes(k))) assert.equal(typeOf(k), 'text', k + ' phải là input text');
});

test('tĩnh: FIELD_LABELS.company đủ 17 nhãn (lịch sử chỉnh sửa đọc được, nhãn khớp danh sách dùng chung)', () => {
  const ctx = loadShared();
  const labels = ctx.window.SavaSys.FIELD_LABELS.company;
  for (const [k, label] of PROFILE) assert.equal(labels[k], label, 'FIELD_LABELS.company thiếu/sai nhãn cho ' + k);
  const diff = ctx.window.SavaSys.diffEntity({}, 'company', { id: 'c1' }, { id: 'c1', location: 'Hà Nội', priority: 'Cao' });
  assert.deepEqual(Array.from(diff, d => [d.field, d.label, d.to]), [['location', 'Địa điểm', 'Hà Nội'], ['priority', 'Mức ưu tiên (Priority)', 'Cao']]);
});

test('tĩnh: drawer + form cùng dùng COMPANY_PROFILE_FIELDS qua helper chung; 17 key không vào COMPANY_KNOWN', () => {
  assert.ok(html.includes('companyProfileBlockHTML(c)'), 'openCompany phải gắn khối hồ sơ');
  assert.ok(html.includes('companyProfileFormFieldsHTML(c)'), 'editCompany phải gắn mục hồ sơ từ helper chung');
  assert.ok(html.includes('COMPANY_PROFILE_FIELDS.map'), 'helper phải dựng từ danh sách dùng chung');
  const adapter = read('supabase-adapter.js');
  const known = adapter.match(/const COMPANY_KNOWN = \[([^\]]+)\]/)[1];
  for (const k of KEYS) assert.ok(!known.includes("'" + k + "'"), k + ' không được vào COMPANY_KNOWN (phải qua legacy_extra)');
});

/* ---------- Adapter round-trip ---------- */
test('adapter: round-trip giữ đủ 17 key qua companies.legacy_extra (không thành cột row)', () => {
  const comp = { id: 'c1', name: 'Profile Co', type: 'Doanh nghiệp', roles: {}, last: '' };
  KEYS.forEach(k => { comp[k] = 'V-' + k; });
  const state = { members: [], companies: [comp], games: [], deals: [], leads: [], tasks: [], activities: [], events: [] };
  const rows = A.crmStateToRows(state);
  const row = rows.companies.find(r => r.id === 'c1');
  for (const k of KEYS) {
    assert.equal(k in row, false, 'row companies không được mang cột ' + k);
    assert.equal(row.legacy_extra[k], 'V-' + k, 'legacy_extra phải giữ ' + k);
  }
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  const cBack = back.companies.find(c => c.id === 'c1');
  for (const k of KEYS) assert.equal(cBack[k], 'V-' + k, 'đọc lại phải nguyên vẹn ' + k);
});

/* ---------- Harness vm: nạp index.html thật ---------- */
function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Profile Fixture Co', type: 'Doanh nghiệp', roles: {}, last: 'Hôm nay',
        location: 'TP. Hồ Chí Minh', establishedYear: '2019', website: 'https://example.vn',
        vertical: 'Giáo dục', buyingSignals: 'Đang mở rộng team', priority: 'Cao' },
      { id: 'c2', name: 'Legacy Vertical Co', type: 'Doanh nghiệp', roles: {}, last: 'Hôm qua', vertical: 'Ngành lạ XYZ' },
    ],
    games: [], deals: [], leads: [], tasks: [], activities: [], verticals: ['Logistics'],
  }));
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
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(readF(f), ctx, { filename: f });
  [...readF('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
/* Gán giá trị cho cả bộ ô hồ sơ theo tiền tố — stub DOM không tự điền
   value từ HTML như trình duyệt, nên test gán tường minh như người dùng
   đang thấy trong ô. */
function setProfile(getEl, prefix, values) {
  for (const k of KEYS) getEl(prefix + k).value = values[k] !== undefined ? values[k] : '';
}

test('drawer: chế độ XEM chỉ hiện field có dữ kiện, ẩn field rỗng, không có ô nhập', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c1')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Hồ sơ công ty'), 'drawer phải có khối Hồ sơ công ty');
  assert.ok(drawer.includes('Địa điểm') && drawer.includes('TP. Hồ Chí Minh'));
  assert.ok(drawer.includes('Năm thành lập') && drawer.includes('2019'));
  assert.ok(drawer.includes('Ngành dọc') && drawer.includes('Giáo dục'));
  assert.ok(drawer.includes('Tín hiệu mua (Buying Signals)') && drawer.includes('Đang mở rộng team'));
  for (const hidden of ['Số nhân sự', 'LinkedIn công ty', 'Công ty mẹ / Nhà đầu tư', 'SAVA Offering', 'Mô hình kinh doanh (Biz Model)']) {
    assert.ok(!drawer.includes(hidden), 'field rỗng phải ẩn ở chế độ xem: ' + hidden);
  }
  assert.ok(drawer.includes('✏️ Sửa hồ sơ'), 'chế độ xem phải có nút Sửa hồ sơ');
  assert.ok(!drawer.includes('id="cp_location"'), 'chế độ xem KHÔNG được có ô nhập hồ sơ');
});

test('drawer: Sửa hiện cả bộ 17 ô (vertical là select có ngành chính thức); Lưu qua khối hồ sơ ghi đúng key, xoá key khi để trống, rồi về xem', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c1'); startCompanyProfileEdit('c1');");
  assert.equal(run('companyProfileEditId'), 'c1');
  const edit = getEl('drawer').innerHTML;
  for (const k of KEYS) assert.ok(edit.includes('id="cp_' + k + '"'), 'chế độ sửa thiếu ô cp_' + k);
  assert.ok(edit.includes('<select id="cp_vertical"'), 'vertical ở drawer phải là SELECT');
  assert.ok(edit.includes('>Logistics</option>'), 'select vertical phải có ngành từ S.verticals');
  assert.ok(edit.includes('>Giáo dục</option>'), 'select vertical phải có ngành mặc định');
  assert.ok(edit.includes('<textarea id="cp_buyingSignals"'), 'buyingSignals ở drawer phải là textarea');
  /* Hủy: đổi trong ô rồi Hủy -> về xem, dữ liệu không đổi */
  setProfile(getEl, 'cp_', { location: 'Nơi Khác Hẳn' });
  run("cancelCompanyProfileEdit('c1')");
  assert.equal(run('companyProfileEditId'), null);
  assert.equal(run("S.companies.find(c=>c.id==='c1').location"), 'TP. Hồ Chí Minh', 'Hủy không được lưu');
  /* Sửa thật + Lưu */
  run("startCompanyProfileEdit('c1');");
  setProfile(getEl, 'cp_', {
    location: 'Hà Nội', establishedYear: '2019', employees: '120', website: '',
    vertical: 'Logistics', buyingSignals: 'Vừa gọi vốn', priority: 'Cao',
  });
  run("persistCompanyProfile('c1')");
  const c = run("S.companies.find(c=>c.id==='c1')");
  assert.equal(c.location, 'Hà Nội');
  assert.equal(c.employees, '120', 'Số nhân sự giữ nguyên văn dạng chuỗi');
  assert.equal(c.vertical, 'Logistics');
  assert.equal(c.buyingSignals, 'Vừa gọi vốn');
  assert.equal('website' in c, false, 'để trống khi sửa = xoá key, không ghi key rác');
  assert.equal(run('companyProfileEditId'), null, 'lưu xong phải thoát chế độ sửa');
  const after = getEl('drawer').innerHTML;
  assert.ok(!after.includes('id="cp_location"') && after.includes('Hà Nội') && after.includes('✏️ Sửa hồ sơ'), 'sau khi lưu drawer phải về dạng xem với giá trị mới');
});

test('form công ty: mục Hồ sơ đủ 17 field; sửa qua form lưu đúng key; tạo mới cũng nhập được, field trống không thành key rác', () => {
  const { run, getEl } = loadIndex();
  run("editCompany('c1')");
  const box = getEl('editBox').innerHTML;
  assert.ok(box.includes('Hồ sơ công ty'), 'form công ty phải có mục Hồ sơ công ty');
  for (const k of KEYS) assert.ok(box.includes('id="e_cp_' + k + '"'), 'form thiếu ô e_cp_' + k);
  assert.ok(box.includes('<select id="e_cp_vertical"'), 'vertical ở form phải là SELECT');
  getEl('e_cname').value = 'Profile Fixture Co';
  getEl('e_ctype').value = 'Doanh nghiệp';
  setProfile(getEl, 'e_cp_', { location: 'Đà Nẵng', industry: 'Game', vertical: 'Giáo dục', savaOffering: 'Publishing' });
  run("saveCompany('c1')");
  let c = run("S.companies.find(c=>c.id==='c1')");
  assert.equal(c.location, 'Đà Nẵng', 'sửa qua form phải lưu cùng key như drawer');
  assert.equal(c.industry, 'Game');
  assert.equal(c.savaOffering, 'Publishing');
  assert.equal('employees' in c, false);
  /* Tạo mới */
  run('editCompany(null)');
  getEl('e_cname').value = 'Cong Ty Moi Ho So';
  getEl('e_ctype').value = 'Doanh nghiệp';
  setProfile(getEl, 'e_cp_', { location: 'Cần Thơ', priority: 'Thấp' });
  run('saveCompany(null)');
  c = run("S.companies.find(c=>c.name==='Cong Ty Moi Ho So')");
  assert.ok(c, 'công ty mới phải được tạo');
  assert.equal(c.location, 'Cần Thơ');
  assert.equal(c.priority, 'Thấp');
  assert.equal('website' in c, false, 'tạo mới để trống thì không ghi key rác');
});

test('vertical ngoài danh sách: hiện "(dữ liệu cũ)" ở cả drawer + form, lưu không đụng thì giữ nguyên và không bị hợp thức hoá vào S.verticals', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c2'); startCompanyProfileEdit('c2');");
  assert.ok(getEl('drawer').innerHTML.includes('(dữ liệu cũ) Ngành lạ XYZ'), 'drawer sửa phải hiện option (dữ liệu cũ) cho vertical ngoài danh sách');
  setProfile(getEl, 'cp_', { vertical: 'Ngành lạ XYZ' });
  run("persistCompanyProfile('c2')");
  assert.equal(run("S.companies.find(c=>c.id==='c2').vertical"), 'Ngành lạ XYZ', 'vertical lạ không được mất khi lưu qua drawer');
  run("editCompany('c2')");
  assert.ok(getEl('editBox').innerHTML.includes('(dữ liệu cũ) Ngành lạ XYZ'), 'form công ty cũng phải hiện (dữ liệu cũ) cho vertical lạ');
  getEl('e_cname').value = 'Legacy Vertical Co';
  getEl('e_ctype').value = 'Doanh nghiệp';
  setProfile(getEl, 'e_cp_', { vertical: 'Ngành lạ XYZ' });
  run("saveCompany('c2')");
  assert.equal(run("S.companies.find(c=>c.id==='c2').vertical"), 'Ngành lạ XYZ', 'vertical lạ không được mất khi lưu qua form');
  assert.ok(![...run('S.verticals')].includes('Ngành lạ XYZ'), 'lưu không đụng KHÔNG được ghi vertical lạ vào S.verticals');
});
