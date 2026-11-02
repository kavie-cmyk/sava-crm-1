/* View Lead dạng BLOCK — phân trang trong từng block + đóng/mở block:
   - Mỗi block trạng thái chỉ hiện LEAD_BLOCK_PAGE_SIZE (10) lead/trang,
     điều hướng ngay trong block: nút Trước/Sau (disabled ở biên) + dòng
     "Trang X/Y · Đang hiện A–B / N lead".
   - UI-state theo status key (leadBlockPage / leadBlockCollapsed) là
     state hiển thị trong phiên: KHÔNG lưu localStorage, không vào S.
   - Đổi bộ lọc/tìm kiếm -> mọi block về trang 1; đếm khớp tập đã lọc.
   - Lead đổi trạng thái làm block co lại -> trang đang xem vượt tổng số
     trang mới thì KẸP về trang cuối hợp lệ, không hiện trang trống.
   - Đóng block: body ẩn, header + nhãn + tổng số (sau lọc) vẫn đúng;
     mở lại giữ nguyên trang đang xem. Mặc định mọi block đều mở.
   - Block rỗng (không lọc) vẫn hiện ghi chú "Chưa có lead nào..." như cũ.
   Fixture: 95 lead ở trạng thái "new" (-> 10 trang, trang cuối 5 lead),
   3 lead contacted, 1 lead lạ. Harness vm theo mẫu lead-status-blocks. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  const bulk = Array.from({ length: 95 }, (_, i) => ({
    id: 'lb' + String(i).padStart(2, '0'), name: 'Bulk Lead ' + String(i).padStart(2, '0'),
    company: 'c1', person: '', phone: '', line: 'publishing', source: 'Khac',
    status: 'new', note: 'tok-bulk', when: '2026-10-10', mainContact: false,
  }));
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Cong Ty Mot Fixture', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hom qua' }],
    games: [], deals: [],
    leads: [
      ...bulk,
      { id: 'lc0', name: 'Contacted Zero', company: 'c1', person: '', line: 'publishing', source: 'Khac', status: 'contacted', note: 'tok-c', when: '2026-10-01' },
      { id: 'lc1', name: 'Contacted One', company: 'c1', person: '', line: 'publishing', source: 'Khac', status: 'contacted', note: 'tok-c', when: '2026-10-02' },
      { id: 'lc2', name: 'Contacted Two', company: 'c1', person: '', line: 'publishing', source: 'Khac', status: 'contacted', note: 'tok-c', when: '2026-10-03' },
      { id: 'lw0', name: 'Weird Zero', company: 'c1', person: '', line: 'publishing', source: 'Khac', status: 'legacy_weird', note: 'tok-w', when: '2026-10-04' },
    ],
    tasks: [], activities: [], verticals: [],
  };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(fixtureState()));
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
function blocks(view) {
  const parts = view.split(/(?=data-lead-status=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-lead-status="'.length, p.indexOf('"', 'data-lead-status="'.length)), html: p }));
}
const rowsIn = seg => (seg.match(/<tr onclick="openLead\(/g) || []).length;
const renderBlocks = h => { h.run('curView = "leads"; leadViewMode = "block"; curLine = "all"; query = ""; render();'); return Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html])); };

test('tĩnh: page size = 10, có đủ hàm setLeadBlockPage/toggleLeadBlock, UI-state không qua save/localStorage', () => {
  assert.ok(html.includes('const LEAD_BLOCK_PAGE_SIZE = 10;'), 'mỗi block phải hiện 10 lead/trang');
  assert.ok(html.includes('function setLeadBlockPage(') && html.includes('function toggleLeadBlock('), 'thiếu hàm chuyển trang / đóng-mở block');
  const seg = html.slice(html.indexOf('const LEAD_BLOCK_PAGE_SIZE'), html.indexOf('function vLeads()'));
  assert.ok(!seg.includes('localStorage'), 'UI-state phân trang/đóng-mở không được lưu localStorage');
  assert.ok(seg.includes('leadBlockPage') && seg.includes('leadBlockCollapsed'), 'state phải giữ theo status key ở 2 map riêng');
});

test('phân trang: block 95 lead -> 10 trang; trang 1 hiện 10 hàng + Trước disabled; trang cuối 5 hàng + Sau disabled', () => {
  const h = loadIndex();
  let byKey = renderBlocks(h);
  assert.equal(rowsIn(byKey.new), 10, 'trang 1 của block Mới chỉ hiện 10 hàng');
  assert.ok(byKey.new.includes('95 lead'), 'đầu block vẫn ghi tổng 95 lead');
  assert.ok(byKey.new.includes('Trang 1/10') && byKey.new.includes('Đang hiện 1–10 / 95 lead'), 'dòng trang phải ghi Trang X/Y + khoảng đang hiện');
  assert.ok(byKey.new.includes('Bulk Lead 00') && byKey.new.includes('Bulk Lead 09') && !byKey.new.includes('Bulk Lead 10'), 'trang 1 là 10 lead đầu');
  const prevBtn = byKey.new.match(/<button[^>]*onclick="setLeadBlockPage\('new', 0\)"[^>]*>/);
  assert.ok(prevBtn && prevBtn[0].includes('disabled'), 'ở trang đầu nút Trước phải disabled');
  const nextBtn = byKey.new.match(/<button[^>]*onclick="setLeadBlockPage\('new', 2\)"[^>]*>/);
  assert.ok(nextBtn && !nextBtn[0].includes('disabled'), 'ở trang đầu nút Sau phải bấm được');
  h.run("setLeadBlockPage('new', 2);");
  byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.ok(byKey.new.includes('Trang 2/10') && byKey.new.includes('Đang hiện 11–20 / 95 lead'));
  assert.ok(byKey.new.includes('Bulk Lead 10') && byKey.new.includes('Bulk Lead 19') && !byKey.new.includes('Bulk Lead 09'), 'trang 2 là lead 11–20');
  h.run("setLeadBlockPage('new', 10);");
  byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.equal(rowsIn(byKey.new), 5, 'trang cuối chỉ còn 5 lead');
  assert.ok(byKey.new.includes('Trang 10/10') && byKey.new.includes('Đang hiện 91–95 / 95 lead'));
  assert.ok(byKey.new.includes('Bulk Lead 94') && !byKey.new.includes('Bulk Lead 89'));
  const nextLast = byKey.new.match(/<button[^>]*onclick="setLeadBlockPage\('new', 11\)"[^>]*>/);
  assert.ok(nextLast && nextLast[0].includes('disabled'), 'ở trang cuối nút Sau phải disabled');
  assert.equal(rowsIn(byKey.contacted), 3, 'block khác (3 lead) hiện hết trong 1 trang, không bị ảnh hưởng trang của block Mới');
  assert.ok(!byKey.contacted.includes('lead-block-pager'), 'block 1 trang thì không hiện điều hướng trang');
});

test('đóng/mở: đóng block -> body ẩn nhưng header + nhãn + tổng số vẫn đúng; mở lại giữ nguyên trang đang xem', () => {
  const h = loadIndex();
  renderBlocks(h);
  h.run("setLeadBlockPage('new', 3);");
  h.run("toggleLeadBlock('new');");
  let byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.equal(rowsIn(byKey.new), 0, 'block đã đóng thì không còn hàng lead nào');
  assert.ok(!byKey.new.includes('lead-block-pager'), 'block đã đóng thì điều hướng trang cũng ẩn theo body');
  assert.ok(byKey.new.includes('>Mới</span>') && byKey.new.includes('95 lead'), 'header khi đóng vẫn hiện nhãn trạng thái + tổng số lead của block');
  assert.ok(h.getEl('view').innerHTML.includes('lead-status-block--collapsed" data-lead-status="new"'), 'section của block Mới phải mang class collapsed');
  assert.ok(byKey.new.includes('aria-expanded="false"'), 'nút chevron phải phản ánh trạng thái đóng');
  assert.equal(rowsIn(byKey.contacted), 3, 'đóng block Mới không ảnh hưởng block khác');
  h.run("toggleLeadBlock('new');");
  byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.equal(rowsIn(byKey.new), 10, 'mở lại: body hiện lại đủ 1 trang');
  assert.ok(byKey.new.includes('Trang 3/10') && byKey.new.includes('Bulk Lead 20'), 'mở lại phải giữ nguyên trang 3 đang xem dở');
});

test('lọc/tìm kiếm: mọi block về trang 1 và số đếm khớp tập đã lọc; UI-state không lọt vào dữ liệu lưu', () => {
  const h = loadIndex();
  renderBlocks(h);
  h.run("setLeadBlockPage('new', 5);");
  assert.ok(h.getEl('view').innerHTML.includes('Trang 5/10'), 'sanity: đang ở trang 5 trước khi lọc');
  h.run('query = "tok-bulk"; render();');
  let byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.ok(byKey.new.includes('Trang 1/10'), 'đổi từ khóa tìm kiếm -> block về trang 1');
  assert.equal(rowsIn(byKey.new), 10);
  h.run('query = "bulk lead 07"; render();'); /* query thật luôn qua toLowerCase ở handler ô tìm kiếm */
  byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.equal(rowsIn(byKey.new), 1, 'tìm đúng 1 lead: block chỉ còn 1 hàng');
  assert.ok(byKey.new.includes('1 lead') && !byKey.new.includes('lead-block-pager'), 'tập đã lọc còn 1 lead -> không còn điều hướng trang');
  assert.equal(h.run("Object.prototype.hasOwnProperty.call(S, 'leadBlockPage')"), false, 'leadBlockPage không nằm trong state dữ liệu');
  assert.ok(!h.ls.getItem('sava_crm_shared_v1').includes('leadBlockPage') && !h.ls.getItem('sava_crm_shared_v1').includes('leadBlockCollapsed'), 'bản ghi xuống kho không chứa UI-state phân trang/đóng-mở');
});

test('kẹp trang: lead đổi trạng thái làm block nguồn co lại -> trang sâu tự kẹp về trang cuối hợp lệ', () => {
  const h = loadIndex();
  renderBlocks(h);
  h.run("setLeadBlockPage('new', 10);");
  assert.ok(h.getEl('view').innerHTML.includes('Trang 10/10'), 'sanity: đang ở trang cuối 10/10');
  /* 70 lead đầu rời block Mới sang Đã liên hệ (mô phỏng đổi trạng thái
     hàng loạt qua form/board — đường đổi status thật đã khoá ở các suite
     khác; ở đây chỉ kiểm phản ứng phân trang trước state mới). */
  h.run('S.leads.forEach((l, i) => { if (i < 70) l.status = "contacted"; }); render();');
  const byKey = Object.fromEntries(blocks(h.getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.ok(byKey.new.includes('25 lead'), 'block Mới còn 25 lead');
  assert.ok(byKey.new.includes('Trang 3/3'), 'trang 10 cũ phải kẹp về trang cuối hợp lệ 3/3');
  assert.ok(byKey.new.includes('Đang hiện 21–25 / 25 lead'));
  assert.equal(rowsIn(byKey.new), 5, 'trang kẹp vẫn có đủ 5 hàng, không trống trơn');
  assert.ok(byKey.contacted.includes('73 lead'), 'block đích nhận đủ 70 lead chuyển sang + 3 lead sẵn có');
});

test('block rỗng vẫn hiện ghi chú như cũ và không có điều hướng trang; block lạ vẫn gom ở cuối', () => {
  const h = loadIndex();
  const byKey = renderBlocks(h);
  assert.ok(byKey.first_message.includes('0 lead') && byKey.first_message.includes('Chưa có lead nào ở trạng thái này.'), 'block rỗng (không lọc) vẫn hiện ghi chú trống như cũ');
  assert.ok(!byKey.first_message.includes('lead-block-pager'), 'block rỗng không hiện điều hướng trang');
  assert.ok(byKey.__unknown__.includes('Weird Zero') && byKey.__unknown__.includes('1 lead'), 'block Khác vẫn gom lead trạng thái lạ');
});
