/* HỒI QUY ma trận ngày cho biên tuần Thứ 2–Chủ nhật của Lịch (15/11/2026):
   Bối cảnh: tests/calendar-member-colors.test.cjs từng chỉ fail vào
   Chủ nhật — điều tra Pha 1 kết luận đó là LỖI TEST (fixture bám ngày
   thật: việc +1 ngày của Chủ nhật thuộc tuần sau nên vắng segment ở
   tuần đang xem là ĐÚNG thiết kế), app render đúng vào mọi ngày.
   File này khoá hành vi ĐÚNG của app ở tầng render để lỗi phụ thuộc
   ngày không sống sót được nữa:
   - Mock ngày hệ thống qua ĐỦ 7 thứ trong tuần 09–15/11/2026 trên
     cùng một fixture TUYỆT ĐỐI; ở mỗi ngày: tuần neo theo "hôm nay"
     phải là đúng tuần Thứ 2 09/11 – Chủ nhật 15/11/2026.
   - Ca biên: việc đúng Chủ nhật; việc Thứ 7 -> Thứ 2 (cắt 5-6 ở tuần
     này, 0-0 ở tuần sau); việc Chủ nhật -> Thứ 2 (cắt 6-6 / 0-0);
     việc phủ cả tuần (0-6); việc + sự kiện CHỈ ở Thứ 2 tuần sau
     (vắng ở tuần này, hiện ở tuần sau) — vắng/hiện đều là khẳng định
     cứng, không phải chấp nhận mơ hồ.
   - Chế độ Tháng hiện đủ mọi ca ở cả 7 ngày mock.
   - Ca tái hiện nguyên hình lỗi cũ: ghim Chủ nhật + fixture tương đối
     (+1 ngày) — việc/sự kiện +1 ngày KHÔNG có segment ở tuần này và
     CÓ segment ở tuần sau. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const W1 = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const W2 = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function mockDateClass(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  class MockDate extends Date {
    constructor(...args) { if (args.length === 0) super(y, m - 1, d, 12, 0, 0, 0); else super(...args); }
    static now() { return new Date(y, m - 1, d, 12, 0, 0, 0).getTime(); }
  }
  return MockDate;
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
      { id: 'sunOnly', title: 'Việc Đúng Chủ Nhật', assignee: 'zac', due: '', startDate: '2026-11-15', dueDate: '2026-11-15', done: false, overdue: false },
      { id: 'satMon', title: 'Việc Thứ 7 Sang Thứ 2', assignee: 'hoangdaden', due: '', startDate: '2026-11-14', dueDate: '2026-11-16', done: false, overdue: false },
      { id: 'sunMon', title: 'Việc Chủ Nhật Sang Thứ 2', assignee: 'yen', due: '', startDate: '2026-11-15', dueDate: '2026-11-16', done: false, overdue: false },
      { id: 'fullWeek', title: 'Việc Phủ Cả Tuần', assignee: 'zac', due: '', startDate: '2026-11-09', dueDate: '2026-11-15', done: false, overdue: false },
      { id: 'nextMon', title: 'Việc Riêng Thứ 2 Tuần Sau', assignee: 'yen', due: '', dueDate: '2026-11-16', done: false, overdue: false },
    ],
    activities: [], verticals: [],
    events: [
      { id: 'nextEv', name: 'Sự Kiện Thứ 2 Tuần Sau', status: 'planned', date: '2026-11-16', endDate: '2026-11-16', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
  };
}
function loadIndex(state, pinnedIso) {
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
  const ctx = vm.createContext({ console, localStorage: ls, Date: mockDateClass(pinnedIso),
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
function weekSegCols(h, anchor) {
  const json = h.run("(() => { const wk = calWeekDates('" + anchor + "'); const { dated } = calBuildItems(); const o = {}; calWeekSegments(wk, dated).forEach(s => { o[s.item.title] = s.colStart + '-' + s.colEnd; }); return JSON.stringify(o); })()");
  return JSON.parse(json);
}
function renderWeek(h, anchor) {
  h.run("calAnchor = '" + anchor + "'; calMode = 'week'; calMemberFilter = ''; calKindFilter = ''; curView = 'tasks'; render();");
  return h.getEl('view').innerHTML;
}

test('ma trận 7 ngày: neo theo "hôm nay" mock luôn cho tuần Thứ 2 09/11 – Chủ nhật 15/11/2026; segment trong tuần hiện đủ, ca biên bị cắt đúng cột', () => {
  W1.forEach((pinned, i) => {
    const label = DAY_NAMES[i] + ' ' + pinned;
    const h = loadIndex(fixtureState(), pinned);
    assert.equal(h.run('todayStr()'), pinned, label + ': mock ngày hệ thống phải có hiệu lực qua todayStr()');
    assert.deepEqual([...h.run('calWeekDates(todayStr())')], W1, label + ': tuần chứa hôm nay phải là 09–15/11/2026');
    const view = renderWeek(h, pinned);
    for (const t of ['Việc Đúng Chủ Nhật', 'Việc Thứ 7 Sang Thứ 2', 'Việc Chủ Nhật Sang Thứ 2', 'Việc Phủ Cả Tuần'])
      assert.ok(segOf(view, t), label + ': segment "' + t + '" phải hiện trong tuần của chính nó');
    assert.equal(segOf(view, 'Việc Riêng Thứ 2 Tuần Sau'), null, label + ': việc chỉ ở Thứ 2 tuần sau KHÔNG được hiện ở tuần này');
    assert.equal(segOf(view, 'Sự Kiện Thứ 2 Tuần Sau'), null, label + ': sự kiện chỉ ở Thứ 2 tuần sau KHÔNG được hiện ở tuần này');
    const cols = weekSegCols(h, pinned);
    assert.equal(cols['Việc Phủ Cả Tuần'], '0-6', label + ': việc phủ cả tuần phải trải cột 0-6');
    assert.equal(cols['Việc Thứ 7 Sang Thứ 2'], '5-6', label + ': việc Thứ 7 -> Thứ 2 phải bị cắt ở biên Chủ nhật (cột 5-6) ở tuần này');
    assert.equal(cols['Việc Chủ Nhật Sang Thứ 2'], '6-6', label + ': việc Chủ nhật -> Thứ 2 phải bị cắt còn cột 6 ở tuần này');
    assert.equal(cols['Việc Đúng Chủ Nhật'], '6-6', label + ': việc đúng Chủ nhật ở cột 6');
    assert.ok(!('Việc Riêng Thứ 2 Tuần Sau' in cols), label + ': calWeekSegments không được dựng segment cho việc ngoài tuần');
  });
});

test('ma trận 7 ngày: tuần sau (neo Thứ 2 16/11) hiện đúng phần bị cắt của các ca biên + việc/sự kiện riêng của tuần sau, ở mọi ngày hệ thống', () => {
  W1.forEach((pinned, i) => {
    const label = DAY_NAMES[i] + ' ' + pinned;
    const h = loadIndex(fixtureState(), pinned);
    assert.deepEqual([...h.run("calWeekDates('2026-11-16')")], W2, label + ': tuần chứa 16/11 phải là 16–22/11/2026');
    const view = renderWeek(h, '2026-11-16');
    for (const t of ['Việc Thứ 7 Sang Thứ 2', 'Việc Chủ Nhật Sang Thứ 2', 'Việc Riêng Thứ 2 Tuần Sau', 'Sự Kiện Thứ 2 Tuần Sau'])
      assert.ok(segOf(view, t), label + ': segment "' + t + '" phải hiện ở tuần sau');
    assert.equal(segOf(view, 'Việc Đúng Chủ Nhật'), null, label + ': việc chỉ ở Chủ nhật tuần trước không hiện ở tuần sau');
    assert.equal(segOf(view, 'Việc Phủ Cả Tuần'), null, label + ': việc phủ tuần trước (kết thúc 15/11) không hiện ở tuần sau');
    const cols = weekSegCols(h, '2026-11-16');
    assert.equal(cols['Việc Thứ 7 Sang Thứ 2'], '0-0', label + ': phần Thứ 2 của việc Thứ 7 -> Thứ 2 ở cột 0 tuần sau');
    assert.equal(cols['Việc Chủ Nhật Sang Thứ 2'], '0-0', label + ': phần Thứ 2 của việc Chủ nhật -> Thứ 2 ở cột 0 tuần sau');
    assert.equal(cols['Việc Riêng Thứ 2 Tuần Sau'], '0-0', label + ': việc riêng Thứ 2 tuần sau ở cột 0');
  });
});

test('ma trận 7 ngày: chế độ Tháng ở cả 7 ngày hệ thống — mọi ca biên đều tới được (segment hoặc nhãn tràn + panel ngày)', () => {
  /* Riêng ô Chủ nhật 15/11 có 4 mục chồng nhau (đúng CN + Thứ 7->Thứ 2
     + CN->Thứ 2 + phủ cả tuần): lưới Tháng theo thiết kế chỉ vẽ tối đa
     3 lane (maxLanes = 3 trong vCalendar), mục thứ 4 nằm sau nhãn
     "+1 nữa" và hiện đầy đủ trong panel ngày — đây là thiết kế tràn
     lane CÓ SẴN của chế độ Tháng cho MỌI ngày đông mục, không riêng
     Chủ nhật và không phải mất việc. Vì vậy khẳng định ở Tháng là:
     các ca không tràn lane phải có segment; riêng ô 15/11 phải có
     nhãn "+1 nữa" và calItemsOn(15/11) phải gồm đủ cả 4 mục. */
  W1.forEach((pinned, i) => {
    const label = DAY_NAMES[i] + ' ' + pinned;
    const h = loadIndex(fixtureState(), pinned);
    h.run("calAnchor = todayStr(); calMode = 'month'; calMemberFilter = ''; calKindFilter = ''; curView = 'tasks'; render();");
    const view = h.getEl('view').innerHTML;
    for (const t of ['Việc Thứ 7 Sang Thứ 2', 'Việc Phủ Cả Tuần', 'Việc Riêng Thứ 2 Tuần Sau', 'Sự Kiện Thứ 2 Tuần Sau'])
      assert.ok(segOf(view, t), label + ' (Tháng): segment "' + t + '" phải hiện');
    const sunSegs = ['Việc Đúng Chủ Nhật', 'Việc Chủ Nhật Sang Thứ 2'].filter(t => segOf(view, t));
    assert.equal(sunSegs.length, 1, label + ' (Tháng): ô Chủ nhật đông 4 mục -> đúng 1 trong 2 việc bắt đầu Chủ nhật nhường lane cho nhãn tràn (3 lane tối đa)');
    assert.ok(view.includes('+1 nữa'), label + ' (Tháng): ô Chủ nhật phải có nhãn "+1 nữa" cho mục tràn lane');
    const onSun = JSON.parse(h.run("JSON.stringify(calItemsOn(calBuildItems().dated, '2026-11-15').map(x => x.title))"));
    for (const t of ['Việc Đúng Chủ Nhật', 'Việc Thứ 7 Sang Thứ 2', 'Việc Chủ Nhật Sang Thứ 2', 'Việc Phủ Cả Tuần'])
      assert.ok(onSun.includes(t), label + ' (Tháng): panel ngày 15/11 phải chứa đủ "' + t + '" (không mất việc vì tràn lane)');
  });
});

test('tái hiện nguyên hình lỗi cũ dưới ngày ghim Chủ nhật: việc/sự kiện +1 ngày vắng ở tuần này (đúng thiết kế) và hiện ở tuần sau', () => {
  const pinned = '2026-11-15'; /* Chủ nhật */
  const state = fixtureState();
  state.tasks = [
    { id: 'plus1', title: 'Việc Cộng Một Ngày', assignee: 'yen', due: '', dueDate: '2026-11-16', done: false, overdue: false },
    { id: 'today1', title: 'Việc Đúng Hôm Nay', assignee: 'zac', due: '', dueDate: '2026-11-15', done: false, overdue: false },
  ];
  state.events = [
    { id: 'evPlus1', name: 'Sự Kiện Cộng Một Ngày', status: 'planned', date: '2026-11-16', endDate: '2026-11-16', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
  ];
  const h = loadIndex(state, pinned);
  assert.equal(h.run('todayStr()'), pinned);
  const viewThis = renderWeek(h, pinned);
  assert.ok(segOf(viewThis, 'Việc Đúng Hôm Nay'), 'Chủ nhật: việc đúng hôm nay phải hiện ở tuần này');
  assert.equal(segOf(viewThis, 'Việc Cộng Một Ngày'), null, 'Chủ nhật: việc +1 ngày (Thứ 2 tuần sau) vắng ở tuần này là ĐÚNG thiết kế — đây chính là điểm test cũ sập');
  assert.equal(segOf(viewThis, 'Sự Kiện Cộng Một Ngày'), null, 'Chủ nhật: sự kiện +1 ngày vắng ở tuần này là ĐÚNG thiết kế');
  const viewNext = renderWeek(h, '2026-11-16');
  assert.ok(segOf(viewNext, 'Việc Cộng Một Ngày'), 'việc +1 ngày phải hiện khi xem tuần sau');
  assert.ok(segOf(viewNext, 'Sự Kiện Cộng Một Ngày'), 'sự kiện +1 ngày phải hiện khi xem tuần sau');
});
