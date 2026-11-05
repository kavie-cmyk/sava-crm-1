/* Màu chip Việc trên Lịch THEO NGƯỜI PHỤ TRÁCH (bổ sung 5/11/2026):
   - Cơ chế: CAL_TASK_PALETTE cố định 8 màu + hash FNV-1a XÁC ĐỊNH từ
     member id (calColorHash % 8) -> cùng id luôn cùng màu mọi phiên,
     member mới tự có màu mà không đổi màu member cũ; palette KHÔNG có
     tím #7c3aed (Sự kiện) và KHÔNG có đỏ #dc2626 (quá hạn).
   - Gán hiện tại: zac -> #2563eb, hoangdaden -> #059669, yen -> #d97706;
     chưa gán -> xám #64748b.
   - Áp cho dải việc ở CẢ Tháng lẫn Tuần, kể cả việc nhiều ngày; khi lọc
     1 người, việc giữ màu của chính người đó (không về xanh dương cũ
     trừ khi màu của người đó vốn là xanh dương).
   - Tín hiệu trạng thái: quá hạn chưa xong -> ĐỎ #dc2626 thắng màu
     người trên toàn dải; đã xong -> giữ màu người + .cal-seg--done
     (tối + gạch ngang) + ✓. Sự kiện giữ tím nguyên vẹn.
   - Legend theo người (.cal-people-legend): chỉ khi trục người = Tất
     cả; liệt kê người có việc chạm khoảng đang xem + "Chưa gán" nếu có.
   - Tooltip của chip việc ghi tên người phụ trách. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Bự', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
    ],
    companies: [], games: [], deals: [], leads: [],
    tasks: [
      { id: 'tZac', title: 'Việc Của Bự', assignee: 'zac', due: '', startDate: iso(0), dueDate: iso(0), done: false, overdue: false },
      { id: 'tHoang', title: 'Việc Của Hoàng', assignee: 'hoangdaden', due: '', startDate: iso(-1), dueDate: iso(2), done: false, overdue: false },
      { id: 'tYen', title: 'Việc Của Yến', assignee: 'yen', due: '', dueDate: iso(1), done: false, overdue: false },
      { id: 'tNone', title: 'Việc Chưa Gán', due: '', dueDate: iso(0), done: false, overdue: false },
      { id: 'tOver', title: 'Việc Quá Hạn Của Yến', assignee: 'yen', due: '', dueDate: iso(-2), done: false, overdue: false },
      { id: 'tDone', title: 'Việc Đã Xong Của Hoàng', assignee: 'hoangdaden', due: '', dueDate: iso(-3), done: true, overdue: false },
    ],
    activities: [], verticals: [],
    events: [
      { id: 'ev1', name: 'Sự Kiện Tím', status: 'planned', date: iso(1), endDate: iso(1), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
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
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
function segOf(view, title) {
  const m = view.match(new RegExp('<div class="cal-seg[^"]*"[^>]*>' + '(?:✓ |⚠️ )?' + title + '</div>'));
  return m && m[0];
}

test('calMemberColor: gán cố định cho 3 member hiện tại, phân biệt nhau, không trùng tím Sự kiện / đỏ quá hạn; chưa gán = xám', () => {
  const h = loadIndex();
  assert.equal(h.run("calMemberColor('zac')"), '#2563eb');
  assert.equal(h.run("calMemberColor('hoangdaden')"), '#059669');
  assert.equal(h.run("calMemberColor('yen')"), '#d97706');
  const colors = h.run("[calMemberColor('zac'), calMemberColor('hoangdaden'), calMemberColor('yen')]");
  assert.equal(new Set(colors).size, 3, '3 member hiện tại phải có 3 màu khác nhau');
  for (const c of colors) { assert.notEqual(c, '#7c3aed', 'không trùng tím Sự kiện'); assert.notEqual(c, '#dc2626', 'không trùng đỏ quá hạn'); }
  assert.equal(h.run("calMemberColor('')"), '#64748b');
  assert.equal(h.run("calMemberColor(null)"), '#64748b');
  assert.equal(h.run("calMemberColor(undefined)"), '#64748b');
});

test('calMemberColor: ổn định qua nhiều lần gọi + member MỚI tự có màu theo hash mà không đổi màu member cũ (palette không chứa tím/đỏ)', () => {
  const h = loadIndex();
  const before = h.run("[calMemberColor('zac'), calMemberColor('hoangdaden'), calMemberColor('yen')]");
  for (let i = 0; i < 5; i++) assert.deepEqual([...h.run("[calMemberColor('zac'), calMemberColor('hoangdaden'), calMemberColor('yen')]")], [...before], 'cùng id phải luôn cùng màu');
  const fresh = h.run("calMemberColor('member-moi-xyz')");
  assert.equal(fresh, h.run("CAL_TASK_PALETTE[calColorHash('member-moi-xyz') % CAL_TASK_PALETTE.length]"), 'member mới: màu = palette[hash(id) % len]');
  assert.ok(h.run("CAL_TASK_PALETTE.includes(calMemberColor('member-moi-xyz'))"));
  assert.deepEqual([...h.run("[calMemberColor('zac'), calMemberColor('hoangdaden'), calMemberColor('yen')]")], [...before], 'thêm member mới không được đổi màu member cũ');
  assert.ok(h.run("!CAL_TASK_PALETTE.includes('#7c3aed') && !CAL_TASK_PALETTE.includes('#dc2626')"), 'palette không được chứa tím Sự kiện / đỏ quá hạn');
  assert.equal(h.run("new Set(CAL_TASK_PALETTE).size"), h.run("CAL_TASK_PALETTE.length"), 'palette không trùng màu trong nội bộ');
});

test('render Tháng + Tuần: dải việc mang màu người phụ trách (kể cả việc nhiều ngày), chưa gán = xám, tooltip ghi người phụ trách', () => {
  const h = loadIndex();
  for (const mode of ['month', 'week']) {
    h.run("calAnchor = todayStr(); calMode = '" + mode + "'; calMemberFilter = ''; calKindFilter = ''; curView = 'tasks'; render();");
    const view = h.getEl('view').innerHTML;
    assert.ok(segOf(view, 'Việc Của Bự').includes('background:#2563eb'), mode + ': việc của zac/Bự phải nền xanh dương #2563eb');
    assert.ok(segOf(view, 'Việc Của Hoàng').includes('background:#059669'), mode + ': việc nhiều ngày của Hoàng phải nền emerald #059669 trên cả dải');
    assert.ok(segOf(view, 'Việc Của Yến').includes('background:#d97706'), mode + ': việc của Yến phải nền hổ phách #d97706');
    assert.ok(segOf(view, 'Việc Chưa Gán').includes('background:#64748b'), mode + ': việc chưa gán phải nền xám #64748b');
    assert.ok(segOf(view, 'Việc Của Hoàng').includes('Người phụ trách: Hoàng Daden'), mode + ': tooltip chip việc phải ghi tên người phụ trách');
    assert.ok(segOf(view, 'Việc Chưa Gán').includes('Người phụ trách: Chưa gán'), mode + ': tooltip việc chưa gán phải ghi Chưa gán');
    assert.ok(segOf(view, 'Sự Kiện Tím').includes('cal-seg--event') && !segOf(view, 'Sự Kiện Tím').includes('background:'), mode + ': sự kiện giữ class tím, không bị nhuộm màu người');
  }
});

test('trạng thái trên nền màu người: quá hạn -> ĐỎ thắng màu người toàn dải; đã xong -> giữ màu người + done (tối/gạch ngang) + ✓', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'month'; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  const over = segOf(view, 'Việc Quá Hạn Của Yến');
  assert.ok(over.includes('background:#dc2626') && over.includes('cal-seg--overdue'), 'việc quá hạn của Yến phải nhuộm đỏ #dc2626 (không phải màu hổ phách của Yến)');
  assert.ok(over.includes('Người phụ trách: Yến'), 'tooltip việc quá hạn vẫn ghi người phụ trách');
  const done = segOf(view, 'Việc Đã Xong Của Hoàng');
  assert.ok(done.includes('background:#059669') && done.includes('cal-seg--done'), 'việc đã xong giữ màu emerald của Hoàng + class done');
});

test('lọc 1 người: việc hiện ra giữ màu của CHÍNH người đó; legend theo người ẨN', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'month'; calMemberFilter = 'hoangdaden'; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok(segOf(view, 'Việc Của Hoàng').includes('background:#059669'), 'lọc Hoàng: việc vẫn emerald của Hoàng');
  assert.ok(!view.includes('cal-people-legend'), 'đang lọc 1 người thì không hiện legend theo người');
  assert.ok(!segOf(view, 'Việc Của Yến'), 'lọc Hoàng: SEGMENT lịch của Yến bị ẩn như cũ (khối danh sách bên dưới có lọc riêng, ngoài phạm vi)');
});

test('legend theo người: chỉ khi Tất cả — ô màu + tên từng người có việc trong khoảng đang xem + Chưa gán; khoảng trống việc thì không hiện mục nào', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'month'; calMemberFilter = ''; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  const legend = view.match(/<div class="cal-people-legend">[\s\S]*?<\/div>/);
  assert.ok(legend, 'phải có hàng chú thích màu theo người khi xem Tất cả');
  for (const [color, name] of [['#2563eb', 'Bự'], ['#059669', 'Hoàng Daden'], ['#d97706', 'Yến'], ['#64748b', 'Chưa gán']])
    assert.ok(legend[0].includes('background:' + color) && legend[0].includes(name), 'legend thiếu mục ' + name + ' (' + color + ')');
  /* Chuyển sang tháng xa (không việc nào chạm khoảng) -> legend biến mất */
  h.run("calAnchor = calAddDays(todayStr(), 400); render();");
  assert.ok(!h.getEl('view').innerHTML.includes('cal-people-legend'), 'khoảng không có việc nào thì không hiện legend theo người');
  /* Chỉ Sự kiện: không hiện legend theo người */
  h.run("calAnchor = todayStr(); calKindFilter = 'event'; render();");
  assert.ok(!h.getEl('view').innerHTML.includes('cal-people-legend'), 'lọc Chỉ Sự kiện thì không hiện legend theo người');
});

test('tĩnh: cơ chế màu người nằm ở index.html (palette + hash + legend), CSS dự phòng .cal-seg--task và tím Sự kiện giữ nguyên', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('CAL_TASK_PALETTE') && idx.includes('calColorHash') && idx.includes('calMemberColor'), 'phải có palette + hash + hàm gán màu');
  assert.ok(idx.includes('.cal-seg--task { background:#2563eb; }'), 'class Việc giữ làm màu dự phòng');
  assert.ok(idx.includes('.cal-seg--event { background:#7c3aed; }'), 'chip Sự kiện giữ nguyên màu tím');
  assert.ok(idx.includes('.cal-seg--overdue { background:#dc2626; }'), 'class quá hạn giữ nguyên đỏ');
  assert.ok(idx.includes('calPeopleLegendHTML'), 'phải có hàm dựng legend theo người');
});
