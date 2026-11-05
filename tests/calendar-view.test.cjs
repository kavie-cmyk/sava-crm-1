/* Lịch (Calendar) trong app BD + field Ngày bắt đầu (startDate) của Việc:
   - Từ 5/11/2026: Lịch KHÔNG còn là view riêng — nav chỉ còn 1 mục "Việc"
     mở MÀN HÌNH HỢP NHẤT (Lịch ở trên + danh sách việc ở dưới, khối danh
     sách có chuyển nhỏ Danh sách ⇄ Theo người qua taskListMode); tên view
     cũ "calendar"/"tasksByMember" được setView/render ánh xạ về hợp nhất.
     KHÔNG có ở mkt.html / publishing.html.
   - Lịch lọc ĐỒNG THỜI 2 trục kết hợp AND: loại (calKindFilter: "" Tất cả
     / "task" Chỉ Việc / "event" Chỉ Sự kiện) × người (calMemberFilter,
     chỉ áp cho Việc); cả hai áp nhất quán cho lưới + panel ngày + panel
     "Chưa có ngày" qua calBuildItems, và giữ nguyên khi chuyển tháng/tuần.
   - Chế độ Tháng (mặc định) + Tuần; tuần bắt đầu Thứ 2; điều hướng ‹ Hôm nay ›.
   - Việc: dải startDate -> dueDate; CHƯA đặt startDate -> đầu dải = chính
     ngày hạn (startDate ?? dueDate, KHÔNG dùng createdAt — Zac chốt lại
     5/11/2026) nên hiện gọn 1 ngày tại hạn; đầu dải >= hạn cũng 1 ngày.
     Đã xong -> tối màu + gạch ngang + ✓; quá hạn chưa xong -> class đỏ cả dải.
   - Sự kiện: dải date -> endDate (tái dùng eventStatusKey/eventDaysInfo):
     attended -> done-style, cancelled -> xám + gạch ngang, planned quá ngày
     -> warn (viền vàng + ⚠️).
   - Ô ngày chật (Tháng): tối đa 3 làn + "+N nữa"; panel chi tiết ngày liệt kê
     MỌI mục chạm ngày đó (kể cả mục kéo dải qua) + nút + Việc / + Sự kiện điền
     sẵn ngày; mục không đặt được ngày -> panel "Chưa có ngày", không biến mất.
   - Lọc theo người: chỉ áp cho Việc (assignee), Sự kiện hiện tất cả.
   - startDate của Việc: ô nhập dd-mm-yyyy trong form việc DUY NHẤT (editTask),
     lưu qua legacy_extra (adapter round-trip, KHÔNG cột), chặn lưu khi
     startDate > dueDate. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dmyOf(isoStr) { return isoStr.split('-').reverse().join('-'); }
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
    ],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] }],
    leads: [],
    tasks: [
      /* Việc kéo dải bằng startDate tường minh: -4 -> -1 (đã qua hạn, chưa xong -> đỏ) */
      { id: 'tRange', title: 'Việc Dải Dài', assignee: 'zac', due: '', startDate: iso(-4), dueDate: iso(-1), done: false, overdue: false, createdAt: iso(-9) + 'T02:00:00.000Z' },
      /* Việc KHÔNG có startDate (createdAt ở -6, xa hạn): vẫn chỉ 1 ngày tại hạn -5 — KHÔNG kéo dải về ngày tạo */
      { id: 'tCreated', title: 'Việc Không Ngày Bắt Đầu', assignee: 'linh', due: '', dueDate: iso(-5), done: true, overdue: false, createdAt: iso(-6) + 'T03:00:00.000Z' },
      /* Việc 1 ngày: start = due (hôm nay) */
      { id: 'tSingle', title: 'Việc Một Ngày', assignee: 'zac', due: '', startDate: iso(0), dueDate: iso(0), done: false, overdue: false, createdAt: iso(0) + 'T01:00:00.000Z' },
      /* Việc tương lai của Linh (để test lọc theo người) */
      { id: 'tLinh', title: 'Việc Của Linh', assignee: 'linh', due: '', startDate: iso(1), dueDate: iso(3), done: false, overdue: false, createdAt: iso(0) + 'T01:00:00.000Z' },
      /* Việc chưa có ngày: không dueDate (chỉ hạn dạng chữ) */
      { id: 'tNoDate', title: 'Việc Chưa Có Hạn', assignee: 'zac', due: 'Tuần sau', dueDate: '', done: false, overdue: false },
    ],
    activities: [], verticals: [],
    events: [
      { id: 'evMulti', name: 'Expo Nhiều Ngày', status: 'planned', date: iso(1), endDate: iso(3), location: 'SECC', note: '', attendees: ['zac'], companies: [], leads: [], deals: [] },
      { id: 'evAtt', name: 'Expo Đã Đi', status: 'attended', date: iso(-3), endDate: iso(-2), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evCancel', name: 'Expo Đã Huỷ', status: 'cancelled', date: iso(2), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evWarn', name: 'Expo Quên Cập Nhật', status: 'planned', date: iso(-2), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evFree', name: 'Expo Ngày Chữ', date: 'Tuần sau', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
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

/* ---------- Tĩnh: nav / phạm vi app BD ---------- */
test('tĩnh: nav CHỈ còn 1 mục Việc (desktop + mobile) cho màn hình hợp nhất; không còn nav Lịch/Việc theo người riêng; mkt/publishing KHÔNG có Lịch', () => {
  const idx = read('index.html');
  assert.equal((idx.match(/data-view="tasks"/g) || []).length, 2, 'phải có đúng nút Việc ở nav desktop + mobile-nav');
  assert.equal((idx.match(/data-view="calendar"/g) || []).length, 0, 'nav Lịch riêng phải bị gỡ');
  assert.equal((idx.match(/data-view="tasksByMember"/g) || []).length, 0, 'nav Việc theo người riêng phải bị gỡ (đã thành chuyển nhỏ trong khối danh sách)');
  assert.ok(idx.includes('tasks:"Việc"'), 'tiêu đề view hợp nhất phải là "Việc"');
  assert.ok(idx.includes('tasks:vTasks'), 'render() phải dispatch view hợp nhất sang vTasks');
  assert.ok(idx.includes('vCalendar() + taskListHeadHTML() + listHTML'), 'vTasks phải ghép Lịch (trên) + đầu khối danh sách + danh sách (dưới)');
  assert.ok(idx.includes("setTaskListMode('list')") && idx.includes("setTaskListMode('bymember')"), 'khối danh sách phải có chuyển nhỏ Danh sách ⇄ Theo người');
  assert.ok(idx.includes("if (v === \"calendar\")") && idx.includes('taskListMode = "bymember"'), 'setView/render phải ánh xạ tên view cũ calendar/tasksByMember về view hợp nhất');
  assert.ok(idx.includes('id="e_tstartDate" type="text" placeholder="dd-mm-yyyy"'), 'form việc phải có ô Ngày bắt đầu dạng text dd-mm-yyyy');
  for (const f of ['mkt.html', 'publishing.html', 'publishing.js']) {
    assert.ok(!read(f).includes('data-view="calendar"'), f + ' không được có view Lịch');
    assert.ok(!read(f).includes('vCalendar'), f + ' không được có vCalendar');
  }
});

/* ---------- Thuần: tuần bắt đầu Thứ 2 + lưới tháng ---------- */
test('calWeekDates: tuần chứa ngày neo bắt đầu Thứ 2, đủ 7 ngày liên tiếp', () => {
  const h = loadIndex();
  const wk = h.run("calWeekDates('2026-11-05')");
  assert.deepEqual([...wk], ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(new Date(wk[0] + 'T00:00:00Z').getUTCDay(), 1, 'ngày đầu tuần phải là Thứ 2');
  assert.deepEqual([...h.run("calWeekDates('2026-11-02')")][0], '2026-11-02', 'neo đúng Thứ 2 thì tuần bắt đầu ngay ngày neo');
  assert.deepEqual([...h.run("calWeekDates('2026-11-08')")][0], '2026-11-02', 'Chủ nhật thuộc tuần bắt đầu Thứ 2 trước đó');
});

test('calMonthWeeks: tháng 11/2026 có 6 tuần, tuần đầu bắt đầu Thứ 2 26-10-2026, phủ đủ 30 ngày của tháng', () => {
  const h = loadIndex();
  const weeks = h.run("calMonthWeeks('2026-11-15')").map(w => [...w]);
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0][0], '2026-10-26');
  assert.equal(weeks[5][6], '2026-12-06');
  const flat = weeks.flat();
  for (let d = 1; d <= 30; d++) assert.ok(flat.includes('2026-11-' + String(d).padStart(2, '0')), 'thiếu ngày ' + d + '/11 trong lưới');
  weeks.forEach(w => assert.equal(new Date(w[0] + 'T00:00:00Z').getUTCDay(), 1, 'mọi tuần đều bắt đầu Thứ 2'));
});

/* ---------- Thuần: dải ngày của Việc ---------- */
test('calTaskRange: startDate tường minh -> dải đúng; KHÔNG startDate -> đúng 1 ngày tại hạn dù createdAt ở bất kỳ ngày nào (startDate ?? dueDate)', () => {
  const h = loadIndex();
  const t = id => h.run(`S.tasks.find(x=>x.id==='${id}')`);
  assert.deepEqual({ ...h.run("calTaskRange(S.tasks.find(x=>x.id==='tRange'))") }, { start: iso(-4), end: iso(-1), source: 'startDate' });
  assert.deepEqual({ ...h.run("calTaskRange(S.tasks.find(x=>x.id==='tCreated'))") }, { start: iso(-5), end: iso(-5), source: 'single' }, 'không startDate -> 1 ngày tại hạn, KHÔNG kéo dải về ngày tạo (createdAt -6)');
  assert.deepEqual({ ...h.run("calTaskRange({dueDate:'" + iso(2) + "', createdAt:'" + iso(-30) + "T00:00:00.000Z'})") }, { start: iso(2), end: iso(2), source: 'single' }, 'createdAt xa tới đâu cũng không làm đầu dải');
  assert.deepEqual({ ...h.run("calTaskRange(S.tasks.find(x=>x.id==='tSingle'))") }, { start: iso(0), end: iso(0), source: 'single' }, 'start = due -> chip 1 ngày');
  assert.equal(t('tNoDate') && h.run("calTaskRange(S.tasks.find(x=>x.id==='tNoDate'))"), null, 'không dueDate -> không đặt được ngày');
  const after = h.run("calTaskRange({startDate:'" + iso(5) + "', dueDate:'" + iso(2) + "', createdAt:'" + iso(0) + "T00:00:00.000Z'})");
  assert.deepEqual({ ...after }, { start: iso(2), end: iso(2), source: 'single' }, 'startDate > dueDate (dữ liệu cũ) -> 1 ngày tại hạn, không dải ngược');
  /* Việc không startDate cũng KHÔNG xuất hiện ở panel của ngày tạo — chỉ ở ngày hạn */
  const onCreatedDay = h.run("calItemsOn(calBuildItems().dated, '" + iso(-6) + "')");
  assert.ok(!onCreatedDay.some(i => i.id === 'tCreated'), 'ngày tạo của việc không-startDate không được chứa việc đó');
  const onDueDay = h.run("calItemsOn(calBuildItems().dated, '" + iso(-5) + "')");
  assert.ok(onDueDay.some(i => i.id === 'tCreated'), 'việc không-startDate phải xuất hiện ở panel ngày hạn');
});

test('calTaskRange: dảiข้าม tuần + khác tháng đếm đúng số ô qua calWeekSegments', () => {
  const h = loadIndex();
  /* Việc 28-10-2026 -> 04-11-2026: tuần 26/10-01/11 chiếm cột 2..6, tuần 02-08/11 chiếm cột 0..2 */
  h.run("S.tasks.push({id:'tCross', title:'Việc Xuyên Tháng', assignee:'zac', due:'', startDate:'2026-10-28', dueDate:'2026-11-04', done:false, overdue:false, createdAt:'2026-10-20T00:00:00.000Z'})");
  const items = h.run("calBuildItems().dated");
  const cross = items.find(i => i.id === 'tCross');
  assert.ok(cross, 'việc xuyên tháng phải nằm trong dated');
  const w1 = h.run("calWeekSegments(calWeekDates('2026-10-29'), calBuildItems().dated)").filter(s => s.item.id === 'tCross');
  const w2 = h.run("calWeekSegments(calWeekDates('2026-11-04'), calBuildItems().dated)").filter(s => s.item.id === 'tCross');
  assert.equal(w1.length, 1); assert.equal(w1[0].colStart, 2); assert.equal(w1[0].colEnd, 6);
  assert.equal(w2.length, 1); assert.equal(w2[0].colStart, 0); assert.equal(w2[0].colEnd, 2);
  /* Panel ngày: ngày GIỮA dải (không phải ngày hạn) vẫn chứa việc */
  const mid = h.run("calItemsOn(calBuildItems().dated, '2026-11-01')");
  assert.ok(mid.some(i => i.id === 'tCross'), 'ngày giữa dải phải liệt kê việc trong panel chi tiết ngày');
});

/* ---------- Thuần: dải ngày của Sự kiện ---------- */
test('calEventRange: nhiều ngày, endDate trống -> 1 ngày, endDate < date -> 1 ngày, ngày chữ tự do -> null', () => {
  const h = loadIndex();
  assert.deepEqual({ ...h.run("calEventRange(S.events.find(e=>e.id==='evMulti'))") }, { start: iso(1), end: iso(3) });
  assert.deepEqual({ ...h.run("calEventRange({date:'" + iso(2) + "'})") }, { start: iso(2), end: iso(2) });
  assert.deepEqual({ ...h.run("calEventRange({date:'" + iso(3) + "', endDate:'" + iso(1) + "'})") }, { start: iso(3), end: iso(3) });
  assert.equal(h.run("calEventRange(S.events.find(e=>e.id==='evFree'))"), null, 'ngày chữ tự do -> chưa có ngày');
});

/* ---------- Phân loại trạng thái hiển thị ---------- */
test('calTaskState / calEventState: done/overdue/open + attended/cancelled/planned-quá-ngày (tái dùng isOverdue/eventStatusKey/eventDaysInfo)', () => {
  const h = loadIndex();
  assert.equal(h.run("calTaskState(S.tasks.find(x=>x.id==='tRange'))"), 'overdue', 'chưa xong + hạn đã qua -> overdue');
  assert.equal(h.run("calTaskState(S.tasks.find(x=>x.id==='tCreated'))"), 'done');
  assert.equal(h.run("calTaskState(S.tasks.find(x=>x.id==='tSingle'))"), 'open');
  assert.deepEqual({ ...h.run("calEventState(S.events.find(e=>e.id==='evAtt'))") }, { phase: 'attended', warn: false });
  assert.deepEqual({ ...h.run("calEventState(S.events.find(e=>e.id==='evCancel'))") }, { phase: 'cancelled', warn: false });
  assert.deepEqual({ ...h.run("calEventState(S.events.find(e=>e.id==='evWarn'))") }, { phase: 'planned', warn: true }, 'planned đã qua ngày -> warn như view Sự kiện');
  assert.equal(h.run("calEventState({date:'" + iso(-5) + "'}).phase"), 'attended', 'sự kiện cũ không status: suy attended theo ngày như eventStatusKey');
});

/* ---------- Gom mục + lọc theo người + chưa có ngày ---------- */
test('calBuildItems: mục chưa có ngày gom riêng (không biến mất); lọc theo người CHỈ áp cho Việc', () => {
  const h = loadIndex();
  const all = h.run('calBuildItems()');
  assert.deepEqual([...all.undated.map(u => u.id)].sort(), ['evFree', 'tNoDate']);
  assert.ok(all.undated.find(u => u.id === 'tNoDate').reason.includes('Tuần sau'), 'lý do của việc chưa có ngày phải nhắc hạn dạng chữ');
  h.run("calMemberFilter = 'linh'");
  const f = h.run('calBuildItems()');
  assert.ok(f.dated.every(i => i.kind !== 'task' || i.ref.assignee === 'linh'), 'sau lọc, việc dated chỉ còn của Linh');
  assert.ok(f.dated.some(i => i.kind === 'event'), 'sự kiện vẫn hiện tất cả sau lọc theo người');
  assert.ok(!f.undated.some(u => u.id === 'tNoDate'), 'việc chưa có ngày của Zac cũng bị lọc theo người');
  assert.ok(f.undated.some(u => u.id === 'evFree'), 'sự kiện chưa có ngày không bị lọc');
});

/* ---------- Render: lưới tháng + trạng thái + "+N nữa" + panel ---------- */
test('vCalendar (Tháng): tiêu đề tháng/năm, legend, class trạng thái đúng từng loại mục, hôm nay nổi bật', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'month'; curView = 'calendar'; render();");
  const view = h.getEl('view').innerHTML;
  const now = new Date();
  assert.ok(view.includes('Tháng ' + (now.getMonth() + 1) + '/' + now.getFullYear()), 'tiêu đề phải hiện tháng/năm đang xem');
  assert.ok(view.includes('cal-day--today'), 'ô hôm nay phải nổi bật');
  assert.ok(view.includes('#2563eb') && view.includes('#7c3aed'), 'legend phải có 2 màu phân biệt Việc / Sự kiện');
  assert.ok(view.includes('Việc Dải Dài') && view.includes('cal-seg--overdue'), 'việc quá hạn phải có segment đỏ');
  const doneSeg = view.match(/<div class="cal-seg[^"]*"[^>]*>✓ Việc Không Ngày Bắt Đầu<\/div>/);
  assert.ok(doneSeg && doneSeg[0].includes('cal-seg--done'), 'việc đã xong: segment tối màu + gạch ngang (cal-seg--done) + ✓');
  assert.ok(view.includes('cal-seg--cancelled') && view.includes('Expo Đã Huỷ'), 'sự kiện đã huỷ: class xám + gạch ngang');
  const attSeg = view.match(/<div class="cal-seg[^"]*"[^>]*>✓ Expo Đã Đi<\/div>/);
  assert.ok(attSeg && attSeg[0].includes('cal-seg--done'), 'sự kiện đã tham dự: done-style + ✓');
  assert.ok(view.includes('cal-seg--warn') && view.includes('Expo Quên Cập Nhật'), 'sự kiện planned quá ngày: class warn');
  assert.ok(view.includes('Chưa có ngày') && view.includes('Việc Chưa Có Hạn') && view.includes('Expo Ngày Chữ'), 'panel Chưa có ngày phải liệt kê cả việc lẫn sự kiện không đặt được ngày');
  assert.ok(view.includes("editTask('tRange')") && view.includes("openEvent('evMulti')"), 'bấm mục phải mở đúng form việc / drawer sự kiện sẵn có');
});

test('vCalendar (Tháng): ngày chật hiện tối đa 3 làn + dòng "+N nữa"', () => {
  const st = fixtureState();
  for (let i = 1; i <= 5; i++) st.tasks.push({ id: 'bulk' + i, title: 'Việc Dồn ' + i, assignee: 'zac', due: '', startDate: iso(0), dueDate: iso(0), done: false, overdue: false });
  const h = loadIndex(st);
  h.run("calAnchor = todayStr(); calMode = 'month'; curView = 'calendar'; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('cal-more'), 'phải có dòng +N nữa ở ô ngày chật');
  const m = view.match(/\+(\d+) nữa/);
  assert.ok(m && Number(m[1]) >= 2, 'số mục ẩn phải >= 2 khi 1 ngày có 6 mục mà chỉ hiện 3 làn + panel: ' + (m && m[0]));
});

test('vCalendar: panel chi tiết ngày liệt kê MỌI mục chạm ngày (kể cả dải qua) + 2 nút tạo mới điền sẵn ngày', () => {
  const h = loadIndex();
  const midDay = iso(2); /* evMulti (1->3) và tLinh (1->3) đều kéo dải qua ngày +2; evCancel bắt đầu +2 */
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = '" + midDay + "'; curView = 'calendar'; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('cal-daypanel'), 'phải có panel chi tiết ngày');
  assert.ok(view.includes(dmyOf(midDay)), 'panel phải hiện ngày đang chọn dạng dd-mm-yyyy');
  for (const name of ['Expo Nhiều Ngày', 'Việc Của Linh', 'Expo Đã Huỷ']) assert.ok(view.includes(name), 'panel thiếu mục chạm ngày: ' + name);
  assert.ok(view.includes('calNewTask()') && view.includes('calNewEvent()'), 'panel phải có 2 nút + Việc / + Sự kiện');
});

test('vCalendar (Tuần): chỉ 1 tuần, tuần bắt đầu Thứ 2, hiện đủ dải việc trong tuần', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'week'; curView = 'calendar'; render();");
  const view = h.getEl('view').innerHTML;
  assert.equal((view.match(/class="cal-week"/g) || []).length, 1, 'chế độ Tuần chỉ hiện đúng 1 tuần');
  assert.ok(view.includes('Tuần '), 'tiêu đề chế độ Tuần');
  assert.ok(view.includes('Thứ 2') && view.includes('Chủ nhật'), 'hàng thứ phải từ Thứ 2 tới Chủ nhật');
});

/* ---------- Giai đoạn 2 (5/11): hôm nay nổi bật HẲN — chỉ trình bày ---------- */
test('tĩnh: CSS ô hôm nay nổi bật hẳn — nền #dbeafe + viền đặc 2px #2563eb + vòng tròn đặc số trắng đậm + nhãn "Hôm nay"; ô tháng kề không bị mờ; màu chip giữ nguyên', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('.cal-day--today { background:#dbeafe; box-shadow:inset 0 0 0 2px #2563eb; flex-wrap:wrap; }'), 'ô hôm nay: nền xanh-100 đậm hẳn + viền đặc 2px màu nhấn (inset, không đổi kích thước ô) + nhãn tự xuống dòng khi ô Tháng chật');
  assert.ok(idx.includes('.cal-day--today:hover { background:#bfdbfe; }'), 'hover ô hôm nay không được bị .cal-day:hover rửa về nền xám nhạt');
  assert.match(idx, /\.cal-day--today \.cal-daynum \{[^}]*background:#2563eb; color:#fff; font-weight:800;/, 'số ngày hôm nay: vòng tròn đặc màu nhấn + số trắng đậm');
  assert.match(idx, /\.cal-today-label \{[^}]*font-weight:800; color:#1d4ed8;[^}]*white-space:nowrap;/, 'nhãn "Hôm nay": chữ đậm màu nhấn đậm, không vỡ chữ');
  assert.match(idx, /\.cal-day--today\.cal-day--other \{ opacity:1; \}/, 'hôm nay thuộc tháng kề phải thắng opacity:.42 của .cal-day--other');
  /* Chip trong ô hôm nay giữ nguyên màu bão hoà (tương phản không bị phá bởi nền #dbeafe nhạt) */
  assert.ok(idx.includes('.cal-seg--task { background:#2563eb; }'), 'chip Việc giữ nguyên màu');
  assert.ok(idx.includes('.cal-seg--event { background:#7c3aed; }'), 'chip Sự kiện giữ nguyên màu');
  assert.ok(idx.includes('.cal-seg--overdue { background:#dc2626; }'), 'chip quá hạn giữ nguyên màu đỏ');
});

test('vCalendar: nhãn chữ "Hôm nay" cạnh số ngày ở CẢ Tháng lẫn Tuần; hôm nay thuộc tháng kề vẫn mang đủ today + nhãn (không mờ)', () => {
  const h = loadIndex();
  const todayCell = view => view.match(/<div class="cal-day cal-day--today[^"]*"[^>]*>[\s\S]*?<\/div>/);
  for (const mode of ['month', 'week']) {
    h.run("calAnchor = todayStr(); calMode = '" + mode + "'; calSelectedDay = ''; curView = 'calendar'; render();");
    const cell = todayCell(h.getEl('view').innerHTML);
    assert.ok(cell, 'chế độ ' + mode + ': phải có ô .cal-day--today');
    assert.ok(cell[0].includes('<span class="cal-daynum">'), 'chế độ ' + mode + ': ô hôm nay phải có số ngày (vòng tròn đặc qua CSS)');
    assert.ok(cell[0].includes('<span class="cal-today-label">Hôm nay</span>'), 'chế độ ' + mode + ': ô hôm nay phải có nhãn chữ "Hôm nay" cạnh số ngày');
  }
  /* Hôm nay nằm trong tuần đang xem nhưng anchor thuộc tháng khác -> ô mang
     cả --today lẫn --other; CSS .cal-day--today.cal-day--other (test tĩnh
     ở trên) giữ opacity:1 nên vẫn nổi bật nguyên vẹn. */
  const html = h.run("calMode = 'month'; calAnchor = calAddDays(todayStr(), 40); calWeekHTML(calWeekDates(todayStr()), [], 3)");
  const spill = todayCell(html);
  assert.ok(spill && spill[0].includes('cal-day--other'), 'ô hôm nay thuộc tháng kề phải mang cả cal-day--other');
  assert.ok(spill[0].includes('<span class="cal-today-label">Hôm nay</span>'), 'ô hôm nay thuộc tháng kề vẫn phải có nhãn "Hôm nay"');
});

/* ---------- Form việc: startDate ---------- */
test('editTask/saveTask: ô Ngày bắt đầu hiện dd-mm-yyyy; lưu startDate hợp lệ; sửa startDate đổi dải; startDate > dueDate bị CHẶN', () => {
  const h = loadIndex();
  h.run("editTask('tRange')");
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_tstartDate" type="text" placeholder="dd-mm-yyyy" value="' + dmyOf(iso(-4)) + '"'), 'ô bắt đầu phải hiện dd-mm-yyyy của startDate đã lưu');
  /* Sửa startDate -4 -> -2 rồi lưu: dải phải rút ngắn đúng */
  const fill = (start, due) => { h.getEl('e_ttitle').value = 'Việc Dải Dài'; h.getEl('e_tassignee').value = 'zac'; h.getEl('e_tstartDate').value = start; h.getEl('e_tdueDate').value = due; h.getEl('e_tdone').checked = false; h.getEl('e_tlink').value = ''; };
  fill(dmyOf(iso(-2)), dmyOf(iso(-1)));
  h.run("saveTask('tRange')");
  let t = h.run("S.tasks.find(x=>x.id==='tRange')");
  assert.equal(t.startDate, iso(-2), 'startDate mới phải được lưu dạng ISO');
  assert.deepEqual({ ...h.run("calTaskRange(S.tasks.find(x=>x.id==='tRange'))") }, { start: iso(-2), end: iso(-1), source: 'startDate' }, 'dải phải thay đổi theo startDate mới');
  /* startDate > dueDate -> chặn, dữ kiện không đổi */
  h.run("editTask('tRange')");
  fill(dmyOf(iso(3)), dmyOf(iso(1)));
  h.run("saveTask('tRange')");
  t = h.run("S.tasks.find(x=>x.id==='tRange')");
  assert.equal(t.startDate, iso(-2), 'startDate > dueDate phải bị chặn lưu (startDate cũ giữ nguyên)');
  assert.equal(t.dueDate, iso(-1), 'startDate > dueDate phải bị chặn lưu (dueDate cũ giữ nguyên)');
  /* Nhập nhanh 8 số liền cho ô bắt đầu cũng được như các ô ngày khác */
  h.run("editTask('tRange')");
  fill(iso(-3).split('-').reverse().join(''), dmyOf(iso(-1)));
  h.run("saveTask('tRange')");
  assert.equal(h.run("S.tasks.find(x=>x.id==='tRange').startDate"), iso(-3), 'gõ nhanh ddmmyyyy ở ô Ngày bắt đầu phải parse về ISO');
  /* Để trống startDate là hợp lệ */
  h.run("editTask('tRange')");
  fill('', dmyOf(iso(-1)));
  h.run("saveTask('tRange')");
  assert.equal(h.run("S.tasks.find(x=>x.id==='tRange').startDate"), '', 'startDate để trống phải lưu được');
});

test('calNewTask / calNewEvent: tạo mới từ panel ngày điền sẵn ĐÚNG ngày đang chọn', () => {
  const h = loadIndex();
  const day = iso(6);
  h.run("calSelectedDay = '" + day + "'; calNewTask();");
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_tstartDate" type="text" placeholder="dd-mm-yyyy" value="' + dmyOf(day) + '"'), 'việc mới từ Lịch: Ngày bắt đầu điền sẵn ngày đang chọn');
  assert.ok(form.includes('id="e_tdueDate" type="text" placeholder="dd-mm-yyyy" value="' + dmyOf(day) + '"'), 'việc mới từ Lịch: Hạn điền sẵn ngày đang chọn');
  h.getEl('e_ttitle').value = 'Việc Từ Lịch'; h.getEl('e_tassignee').value = 'zac';
  h.getEl('e_tstartDate').value = dmyOf(day); h.getEl('e_tdueDate').value = dmyOf(day);
  h.getEl('e_tdone').checked = false; h.getEl('e_tlink').value = '';
  const before = h.run('S.tasks.length');
  h.run('saveTask(null)');
  assert.equal(h.run('S.tasks.length'), before + 1);
  const nt = h.run("S.tasks.find(x=>x.title==='Việc Từ Lịch')");
  assert.equal(nt.startDate, day); assert.equal(nt.dueDate, day);
  h.run("calSelectedDay = '" + day + "'; calNewEvent();");
  const eform = h.getEl('editBox').innerHTML;
  assert.ok(eform.includes('value="' + dmyOf(day) + '"'), 'sự kiện mới từ Lịch: Ngày bắt đầu điền sẵn ngày đang chọn');
});

/* ---------- View Việc HỢP NHẤT: Lịch trên + danh sách dưới (5/11/2026) ---------- */
test('hợp nhất: view Việc hiện Lịch Ở TRÊN + khối danh sách Ở DƯỚI trên cùng một trang; mặc định khối dưới là Danh sách', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  const iCal = view.indexOf('cal-grid'), iHead = view.indexOf('Danh sách việc'), iList = view.indexOf('Việc của cả team');
  assert.ok(iCal > -1 && iHead > iCal && iList > iHead, 'thứ tự phải là: lưới lịch -> đầu khối danh sách -> danh sách việc');
  assert.equal(h.getEl('viewTitle').textContent, 'Việc', 'tiêu đề view hợp nhất là "Việc"');
  assert.ok(view.includes("setTaskListMode('bymember')"), 'khối danh sách phải có nút chuyển sang Theo người');
  assert.equal(h.run('taskListMode'), 'list', 'chế độ mặc định của khối danh sách là Danh sách');
});

test('hợp nhất: chuyển nhỏ trong khối danh sách Danh sách ⇄ Theo người; rời view rồi quay lại VẪN giữ chế độ', () => {
  const h = loadIndex();
  h.run("curView = 'tasks'; render(); setTaskListMode('bymember');");
  let view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Tổng việc đang mở') && view.includes('Lọc theo trạng thái:'), 'chế độ Theo người phải hiện đúng nội dung Việc theo người cũ');
  assert.ok(view.includes('cal-grid'), 'Lịch vẫn ở phía trên khi khối dưới ở chế độ Theo người');
  h.run("setView('dash'); setView('tasks');");
  view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Tổng việc đang mở'), 'quay lại view Việc phải giữ chế độ Theo người đã chọn');
  h.run("setTaskListMode('list');");
  assert.ok(h.getEl('view').innerHTML.includes('Việc của cả team'), 'chuyển về Danh sách phải hiện lại danh sách việc');
});

test('hợp nhất: tên view cũ calendar/tasksByMember (setView + gán thẳng curView) mở đúng màn hình hợp nhất', () => {
  const h = loadIndex();
  h.run("setView('calendar');");
  assert.equal(h.run('curView'), 'tasks', 'setView(calendar) phải ánh xạ sang tasks');
  assert.ok(h.getEl('view').innerHTML.includes('cal-grid'), 'mở qua tên cũ calendar vẫn thấy Lịch ở phần trên');
  h.run("curView = 'tasksByMember'; render();");
  assert.equal(h.run('curView'), 'tasks', 'gán thẳng curView=tasksByMember phải được render() ánh xạ sang tasks');
  assert.ok(h.getEl('view').innerHTML.includes('Tổng việc đang mở'), 'mở qua tên cũ tasksByMember: khối dưới ở chế độ Theo người');
  h.run("setView('tasksByMember');");
  assert.equal(h.run('taskListMode'), 'bymember');
});

/* ---------- Lọc 2 trục của Lịch: loại × người (AND) ---------- */
test('calBuildItems: trục LOẠI — Chỉ Việc bỏ hết Sự kiện, Chỉ Sự kiện bỏ hết Việc (cả dated lẫn Chưa có ngày)', () => {
  const h = loadIndex();
  h.run("calKindFilter = 'task'");
  let b = h.run('calBuildItems()');
  assert.ok(b.dated.length && b.dated.every(i => i.kind === 'task'), 'Chỉ Việc: dated chỉ còn việc');
  assert.deepEqual([...b.undated.map(u => u.id)], ['tNoDate'], 'Chỉ Việc: panel Chưa có ngày chỉ còn việc chưa có hạn');
  h.run("calKindFilter = 'event'");
  b = h.run('calBuildItems()');
  assert.ok(b.dated.length && b.dated.every(i => i.kind === 'event'), 'Chỉ Sự kiện: dated chỉ còn sự kiện');
  assert.deepEqual([...b.undated.map(u => u.id)], ['evFree'], 'Chỉ Sự kiện: panel Chưa có ngày chỉ còn sự kiện ngày chữ');
  h.run("calKindFilter = ''");
  b = h.run('calBuildItems()');
  assert.ok(b.dated.some(i => i.kind === 'task') && b.dated.some(i => i.kind === 'event'), 'Tất cả: cả việc lẫn sự kiện');
});

test('lọc AND: Chỉ Việc + theo Linh -> chỉ việc của Linh; Chỉ Sự kiện + theo Linh -> chỉ sự kiện (lọc người KHÔNG ẩn sự kiện)', () => {
  const h = loadIndex();
  h.run("calKindFilter = 'task'; calMemberFilter = 'linh';");
  let b = h.run('calBuildItems()');
  assert.ok(b.dated.length && b.dated.every(i => i.kind === 'task' && i.ref.assignee === 'linh'), 'Chỉ Việc + Linh: chỉ việc của Linh');
  h.run("calKindFilter = 'event'; calMemberFilter = 'linh';");
  b = h.run('calBuildItems()');
  assert.ok(b.dated.length && b.dated.every(i => i.kind === 'event'), 'Chỉ Sự kiện + Linh: chỉ sự kiện, lọc người không ẩn sự kiện');
  assert.ok(!b.undated.some(u => u.kind === 'task'), 'Chỉ Sự kiện + Linh: không còn việc nào kể cả ở Chưa có ngày');
});

test('lọc loại áp nhất quán cho panel ngày + panel Chưa có ngày khi render; lọc của Lịch KHÔNG đụng khối danh sách bên dưới', () => {
  const h = loadIndex();
  const midDay = iso(2);
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = '" + midDay + "'; calKindFilter = 'task'; curView = 'tasks'; render();");
  let view = h.getEl('view').innerHTML;
  const panel = view.slice(view.indexOf('cal-daypanel'), view.indexOf('cal-undated'));
  assert.ok(panel.includes('Việc Của Linh') && !panel.includes('Expo'), 'panel ngày khi lọc Chỉ Việc: chỉ việc, không sự kiện');
  const undated = view.slice(view.indexOf('cal-undated'), view.indexOf('Danh sách việc'));
  assert.ok(undated.includes('Việc Chưa Có Hạn') && !undated.includes('Expo Ngày Chữ'), 'panel Chưa có ngày khi lọc Chỉ Việc: không liệt kê sự kiện');
  const below = view.slice(view.indexOf('Danh sách việc'));
  assert.ok(below.includes('Việc Dải Dài'), 'khối danh sách bên dưới không bị lọc loại của Lịch ẩn việc');
  h.run("calKindFilter = 'event'; render();");
  view = h.getEl('view').innerHTML;
  const panel2 = view.slice(view.indexOf('cal-daypanel'), view.indexOf('cal-undated'));
  assert.ok(panel2.includes('Expo Nhiều Ngày') && !panel2.includes('Việc Của Linh'), 'panel ngày khi lọc Chỉ Sự kiện: chỉ sự kiện');
});

test('lọc 2 trục + chế độ Tháng/Tuần + tháng đang xem GIỮ NGUYÊN khi chuyển tháng/tuần và khi đổi chế độ khối danh sách', () => {
  const h = loadIndex();
  h.run("curView = 'tasks'; calKindFilter = 'task'; calMemberFilter = 'linh'; calSetMode('week'); calNav(1);");
  assert.equal(h.run('calKindFilter'), 'task', 'chuyển tuần không được reset lọc loại');
  assert.equal(h.run('calMemberFilter'), 'linh', 'chuyển tuần không được reset lọc người');
  assert.equal(h.run('calMode'), 'week', 'chế độ Tuần giữ nguyên');
  h.run("setTaskListMode('bymember'); setTaskListMode('list');");
  assert.equal(h.run('calKindFilter'), 'task', 'đổi chế độ khối danh sách không đụng lọc của Lịch');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Tuần '), 'vẫn đang xem Tuần sau các lần chuyển');
  assert.ok(view.includes('calSetKind'), 'khối điều khiển Lịch phải có nút chọn loại cạnh lọc người');
});

/* ---------- Adapter: startDate qua legacy_extra, round-trip nguyên vẹn ---------- */
test('adapter: startDate của việc đi qua legacy_extra (không cột), round-trip giữ nguyên; nhãn audit có Ngày bắt đầu', () => {
  const st = fixtureState();
  const rows = A.crmStateToRows(st);
  const row = rows.tasks.find(r => r.id === 'tRange');
  assert.ok(row, 'phải có row việc');
  assert.equal(row.legacy_extra && row.legacy_extra.startDate, iso(-4), 'startDate phải nằm trong legacy_extra của row tasks');
  assert.ok(!('start_date' in row) && !('startDate' in row), 'không được sinh cột start_date/startDate trên row');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.tasks.find(t => t.id === 'tRange').startDate, iso(-4), 'round-trip phải khôi phục startDate nguyên vẹn');
  const shared = read('shared.js');
  assert.ok(shared.includes('startDate: "Ngày bắt đầu"'), 'FIELD_LABELS.task phải có nhãn Ngày bắt đầu cho audit');
});
