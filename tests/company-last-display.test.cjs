/* Đợt BỎ HIỂN THỊ "Tương tác cuối" CỦA CÔNG TY (16/11/2026, Zac chốt — D1):
   - Bệnh cũ: field `last` của công ty chỉ được ghi "Vừa tạo"/"Vừa sửa" lúc
     tạo/lưu form công ty rồi đứng yên mãi; lead/deal/hoạt động của công ty
     đổi không chạm vào nó -> cột "Tương tác cuối" ở bảng Công ty và dòng
     header ở drawer công ty hiện một giá trị không có nghĩa cập nhật thật.
     Bảng Công ty đã có cột "Cập nhật cuối" THẬT từ updatedAt ngay cạnh.
   - Cách xử lý đã chốt: BỎ HẲN phần HIỂN THỊ (bảng + drawer), GIỮ NGUYÊN
     field `last` trong model, mọi write-site hiện tại (tạo/lưu vẫn ghi
     "Vừa tạo"/"Vừa sửa" như cũ), mapping adapter hai chiều (COMPANY_KNOWN
     chứa 'last', cột DB last_label) và schema — đúng mẫu đợt idle của deal
     (15/11): số liệu giữ nguyên vẹn để round-trip, chỉ bề mặt hiện bị gỡ.
   Harness vm nạp index.html THẬT như list-pagination / deal-idle-days. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const A = require('../supabase-adapter.js');

const SENTINEL_1 = 'SENTINEL-L1-KHONG-DUOC-HIEN';
const SENTINEL_2 = 'SENTINEL-L2-KHONG-DUOC-HIEN';

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Công Ty Sentinel Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: SENTINEL_1, createdAt: '2026-11-10T05:00:00.000Z', updatedAt: '2026-11-10T05:00:00.000Z' },
      { id: 'c2', name: 'Công Ty Sentinel Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: SENTINEL_2, createdAt: '2026-11-01T05:00:00.000Z', updatedAt: '2026-11-14T05:00:00.000Z' },
    ],
    games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [],
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
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

/* ---------- (a) Bảng Công ty: không còn render giá trị last ---------- */
test('bảng Công ty: không còn cột/giá trị "Tương tác cuối"; hàng còn đúng 6 ô khớp 6 tiêu đề', () => {
  const h = loadIndex();
  h.run('curView = "companies"; curLine = "all"; query = ""; render();');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Công Ty Sentinel Một') && view.includes('Công Ty Sentinel Hai'), 'fixture phải render được cả 2 công ty');
  assert.ok(!view.includes('Tương tác cuối'), 'bảng không còn tiêu đề "Tương tác cuối"');
  assert.ok(!view.includes(SENTINEL_1) && !view.includes(SENTINEL_2), 'giá trị last của công ty KHÔNG được render ở bất kỳ ô nào của bảng');
  const headSeg = view.slice(view.indexOf('<table class="companies-table">'), view.indexOf('</tr>'));
  assert.equal((headSeg.match(/<th/g) || []).length, 6, 'hàng tiêu đề còn đúng 6 cột (STT/Công ty/Vai trò/Đầu mối/Deal/Cập nhật cuối)');
  const rowC1 = view.slice(view.indexOf("openCompany('c1')"), view.indexOf('</tr>', view.indexOf("openCompany('c1')")));
  assert.equal((rowC1.match(/<td/g) || []).length, 6, 'hàng dữ liệu còn đúng 6 ô, khớp số tiêu đề (không lệch cột)');
});

/* ---------- (b) Cột "Cập nhật cuối" từ updatedAt vẫn hiện đúng ---------- */
test('bảng Công ty: cột "Cập nhật cuối" vẫn hiện và hiện ĐÚNG ngày từ updatedAt của từng công ty', () => {
  const h = loadIndex();
  h.run('curView = "companies"; curLine = "all"; query = ""; render();');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Cập nhật cuối'), 'tiêu đề cột "Cập nhật cuối" phải còn');
  const cell1 = h.run("sysUpdatedCell(S.companies.find(c => c.id === 'c1'))");
  const cell2 = h.run("sysUpdatedCell(S.companies.find(c => c.id === 'c2'))");
  assert.match(cell1, /🕘 10-11-2026/, 'ô Cập nhật cuối của c1 phải là ngày updatedAt 10-11-2026, nhận được: ' + cell1);
  assert.match(cell2, /🕘 14-11-2026/, 'ô Cập nhật cuối của c2 phải là ngày updatedAt 14-11-2026, nhận được: ' + cell2);
  assert.ok(view.includes(cell1) && view.includes(cell2), 'cả hai ô Cập nhật cuối phải xuất hiện trong bảng đã render');
});

/* ---------- (a2) Drawer công ty: header không còn "Tương tác cuối" ---------- */
test('drawer công ty: header không còn "Tương tác cuối"/giá trị last; tên + loại hình vẫn hiện nguyên', () => {
  const h = loadIndex();
  h.run("openCompany('c1');");
  const drawer = h.getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Công Ty Sentinel Một'), 'drawer phải mở đúng công ty');
  assert.ok(!drawer.includes('Tương tác cuối'), 'header drawer không còn nhãn "Tương tác cuối"');
  assert.ok(!drawer.includes(SENTINEL_1), 'giá trị last KHÔNG được render trong drawer');
  assert.ok(drawer.includes('<div class="mut">Publisher</div>'), 'dòng loại hình dưới tên công ty vẫn hiện nguyên (chỉ mất phần Tương tác cuối)');
});

/* ---------- Hàng trống: colspan khớp số cột mới ---------- */
test('bảng Công ty rỗng: hàng trống dùng colspan="6" khớp 6 cột hiện tại', () => {
  const empty = fixtureState(); empty.companies = [];
  const h = loadIndex(empty);
  h.run('curView = "companies"; curLine = "all"; query = ""; render();');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('<td colspan="6"'), 'hàng trống phải colspan 6 theo số cột mới');
  assert.ok(!view.includes('colspan="7"'), 'không còn colspan 7 của bố cục 7 cột cũ');
});

/* ---------- (c) Round-trip adapter giữ nguyên field last ---------- */
test('adapter: round-trip state -> rows -> state giữ NGUYÊN giá trị last qua cột last_label', () => {
  const s = { members: [], companies: [{ id: 'c9', name: 'X', type: 'Studio', roles: {}, contact: '', phone: '', last: 'SENTINEL-RT-GIU-NGUYEN' }], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], salesMaterials: [], verticals: [] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.companies[0].last_label, 'SENTINEL-RT-GIU-NGUYEN', 'ghi xuống: last phải map sang cột last_label nguyên giá trị');
  assert.ok(!('last' in (rows.companies[0].legacy_extra || {})), 'last là field KNOWN: không được lọt vào legacy_extra');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.companies[0].last, 'SENTINEL-RT-GIU-NGUYEN', 'đọc lên: last_label phải khôi phục thành last nguyên giá trị');
});

/* ---------- Tĩnh: write-site + mapping + schema giữ nguyên; không còn nơi đọc hiển thị ---------- */
test('tĩnh: index.html không còn đọc c.last để hiển thị; write-site "Vừa tạo"/"Vừa sửa" giữ nguyên đủ', () => {
  assert.ok(!html.includes('esc(c.last)'), 'không còn esc(c.last) ở bất kỳ bề mặt render nào');
  assert.ok(!html.includes('<th>Tương tác cuối</th>'), 'không còn tiêu đề cột "Tương tác cuối"');
  assert.equal((html.match(/last:\s*"Vừa tạo"/g) || []).length, 6, '6 điểm tạo công ty trong index.html giữ nguyên ghi last:"Vừa tạo"');
  assert.ok(html.includes('last: "Vừa sửa"'), 'điểm lưu form công ty giữ nguyên ghi last:"Vừa sửa"');
  const shared = read('shared.js');
  assert.ok(shared.includes('last: "Vừa tạo"'), 'điểm tạo công ty phía shared.js (mẫu/migration) giữ nguyên ghi last:"Vừa tạo"');
});

test('tĩnh: adapter + schema giữ nguyên mapping last <-> last_label', () => {
  const ad = read('supabase-adapter.js');
  assert.ok(ad.includes("'last'") && ad.includes('COMPANY_KNOWN'), 'COMPANY_KNOWN vẫn chứa last');
  assert.ok(ad.includes("last_label: String(c.last || '')"), 'chiều ghi last -> last_label giữ nguyên');
  assert.ok(ad.includes("last: c.last_label || ''"), 'chiều đọc last_label -> last giữ nguyên');
  const schema = read('supabase/schema.sql');
  assert.ok(schema.includes('last_label'), 'schema vẫn giữ cột last_label của bảng companies');
});
