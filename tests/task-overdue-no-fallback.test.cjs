/* Đợt D2 — BỎ FALLBACK QUÁ HẠN VIỆC (16/11/2026, Zac chốt):
   - Bệnh cũ: isOverdue (index.html) và bản sao phía Dashboard
     dashIsOverdueFallback (shared.js) — khi việc KHÔNG có dueDate hợp lệ
     thì rơi về tin cờ lưu sẵn t.overdue. Cờ này không có cơ chế tự bật
     (việc không hạn không bao giờ tự thành quá hạn) nhưng dữ kiện legacy
     mang cờ true thì hiện "quá hạn" mãi mãi ở mọi bề mặt.
   - Cách sửa đã chốt: không hạn hợp lệ -> KHÔNG quá hạn, chấm hết, ở CẢ
     HAI hàm. Phần khoẻ giữ nguyên tuyệt đối: dueDate quá khứ + chưa xong
     = quá hạn (tính tại lúc đọc); đã xong = không quá hạn.
   - Field `overdue` GIỮ NGUYÊN trong model + round-trip adapter
     (TASK_KNOWN chứa 'overdue', cột overdue_stored) + write-site ở
     saveTask — chỉ ngừng ĐỌC nó làm căn cứ quá hạn, đúng mẫu đợt
     deal.idle (15/11) và company.last (D1, 16/11).
   Harness vm nạp index.html THẬT như deal-idle-days / company-last-display. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const shared = read('shared.js');
const A = require('../supabase-adapter.js');

/* Ngày ISO (giờ local, cùng định dạng todayStr của app) lệch n ngày so với
   hôm nay thật — isOverdue tính theo ngày thật nên fixture phải neo vào
   hôm nay thật, không ghim ngày cứng. */
function isoOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Vừa tạo' }],
    games: [],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', stage: 'build_eval', owner: 'zac', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [], createdAt: '2026-11-01T05:00:00.000Z', updatedAt: '2026-11-01T05:00:00.000Z' }],
    leads: [{ id: 'l1', company: 'c1', line: 'publishing', status: 'new', ownerId: 'zac', name: 'Lead Một', createdAt: '2026-11-01T05:00:00.000Z' }],
    tasks: [
      /* (a) Không dueDate + cờ true (dữ kiện legacy) -> KHÔNG quá hạn */
      { id: 'tNoDate', title: 'Việc Không Hạn Cờ True', assignee: 'zac', due: 'Tuần trước', dueDate: '', done: false, overdue: true },
      /* (a2) dueDate vắng hẳn + cờ true -> KHÔNG quá hạn */
      { id: 'tMissing', title: 'Việc Thiếu DueDate Cờ True', assignee: 'zac', due: '', done: false, overdue: true },
      /* (b) dueDate chữ tự do (sai định dạng) + cờ true -> KHÔNG quá hạn */
      { id: 'tBadDate', title: 'Việc Hạn Chữ Cờ True', assignee: 'zac', due: '', dueDate: 'tuần sau', done: false, overdue: true },
      /* (b2) dueDate đúng mẫu nhưng ngày lịch không tồn tại + cờ true -> KHÔNG quá hạn */
      { id: 'tFakeDate', title: 'Việc Ngày Không Tồn Tại Cờ True', assignee: 'zac', due: '', dueDate: '2020-02-30', done: false, overdue: true },
      /* Cờ true nhưng dueDate hợp lệ ở TƯƠNG LAI -> KHÔNG quá hạn (cờ bị bỏ qua) */
      { id: 'tFuture', title: 'Việc Tương Lai Cờ True', assignee: 'zac', due: '', dueDate: isoOffset(3), done: false, overdue: true },
      /* Cờ true, dueDate = hôm nay -> KHÔNG quá hạn (chưa qua hạn) */
      { id: 'tToday', title: 'Việc Hôm Nay Cờ True', assignee: 'zac', due: '', dueDate: isoOffset(0), done: false, overdue: true },
      /* (c) dueDate quá khứ + chưa xong -> QUÁ HẠN (dù cờ false: tính từ hạn, không cần cờ) */
      { id: 'tPast', title: 'Việc Quá Hạn Thật', assignee: 'zac', due: '', dueDate: isoOffset(-2), done: false, overdue: false },
      /* (d) Đã xong + dueDate quá khứ -> KHÔNG quá hạn (giữ hành vi cũ) */
      { id: 'tPastDone', title: 'Việc Đã Xong Quá Hạn Cũ', assignee: 'zac', due: '', dueDate: isoOffset(-2), done: true, overdue: true },
      /* Việc gắn deal (cho bề mặt drawer deal) không hạn + cờ true -> KHÔNG quá hạn */
      { id: 'tDealNoDate', title: 'Việc Gắn Deal Không Hạn Cờ True', assignee: 'zac', due: '', dueDate: '', done: false, overdue: true, deal: 'd1' },
      /* Việc gắn công ty (cho bề mặt drawer công ty) không hạn + cờ true -> KHÔNG quá hạn */
      { id: 'tCompNoDate', title: 'Việc Gắn Công Ty Không Hạn Cờ True', assignee: 'zac', due: '', dueDate: '', done: false, overdue: true, company: 'c1' },
    ],
    activities: [],
    events: [],
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const byId = (h, id) => h.run("S.tasks.find(x => x.id === '" + id + "')");

/* ---------- (a)+(b) isOverdue: không hạn hợp lệ + cờ true -> false ---------- */
test('isOverdue: (a) không dueDate / dueDate vắng + cờ true -> KHÔNG quá hạn', () => {
  const h = loadIndex();
  assert.equal(h.ctx.isOverdue(byId(h, 'tNoDate')), false, 'dueDate rỗng + cờ true phải là không quá hạn');
  assert.equal(h.ctx.isOverdue(byId(h, 'tMissing')), false, 'thiếu dueDate + cờ true phải là không quá hạn');
  assert.equal(h.ctx.isOverdue({ done: false, overdue: true }), false, 'task trần không hạn + cờ true -> false');
  assert.equal(h.ctx.isOverdue(null), false, 'task null -> false, không sập');
});

test('isOverdue: (b) dueDate sai định dạng / ngày không tồn tại + cờ true -> KHÔNG quá hạn', () => {
  const h = loadIndex();
  assert.equal(h.ctx.isOverdue(byId(h, 'tBadDate')), false, 'dueDate chữ tự do + cờ true -> false');
  assert.equal(h.ctx.isOverdue(byId(h, 'tFakeDate')), false, 'dueDate 2020-02-30 (không tồn tại) + cờ true -> false');
  assert.equal(h.ctx.isOverdue({ done: false, dueDate: '30-10-2026', overdue: true }), false, 'định dạng dd-mm-yyyy + cờ true -> false');
});

test('isOverdue: cờ true bị bỏ qua khi dueDate hợp lệ chưa qua (hôm nay / tương lai)', () => {
  const h = loadIndex();
  assert.equal(h.ctx.isOverdue(byId(h, 'tToday')), false, 'hạn hôm nay + cờ true -> chưa quá hạn');
  assert.equal(h.ctx.isOverdue(byId(h, 'tFuture')), false, 'hạn tương lai + cờ true -> chưa quá hạn');
});

/* ---------- (c)+(d) Phần khoẻ giữ nguyên ---------- */
test('isOverdue: (c) dueDate quá khứ + chưa xong -> quá hạn; (d) đã xong -> không quá hạn', () => {
  const h = loadIndex();
  assert.equal(h.ctx.isOverdue(byId(h, 'tPast')), true, 'hạn đã qua + chưa xong -> quá hạn dù cờ false (tính từ hạn)');
  assert.equal(h.ctx.isOverdue(byId(h, 'tPastDone')), false, 'đã xong + hạn đã qua -> không quá hạn');
  assert.equal(h.ctx.isOverdue({ done: false, dueDate: isoOffset(-1), overdue: false }), true, 'hôm qua + chưa xong -> quá hạn');
});

/* ---------- Bản sao Dashboard phía shared.js ---------- */
test('dashIsOverdueFallback: không hạn hợp lệ + cờ true -> false; quá khứ chưa xong -> true; đã xong -> false', () => {
  const D = loadShared().window.SavaDash;
  const now = new Date(); now.setHours(12, 0, 0, 0);
  assert.equal(typeof D.dashIsOverdueFallback, 'function', 'phải còn helper dự phòng của Dashboard');
  assert.equal(D.dashIsOverdueFallback({ done: false, dueDate: '', overdue: true }, now), false, 'rỗng + cờ true -> false');
  assert.equal(D.dashIsOverdueFallback({ done: false, overdue: true }, now), false, 'vắng dueDate + cờ true -> false');
  assert.equal(D.dashIsOverdueFallback({ done: false, dueDate: 'tuần sau', overdue: true }, now), false, 'sai định dạng + cờ true -> false');
  assert.equal(D.dashIsOverdueFallback({ done: false, dueDate: isoOffset(-1), overdue: false }, now), true, 'quá khứ + chưa xong -> true');
  assert.equal(D.dashIsOverdueFallback({ done: true, dueDate: isoOffset(-1), overdue: true }, now), false, 'đã xong -> false');
});

test('dashCompare (đường fallback, không truyền isOverdueFn): việc không hạn cờ true KHÔNG được đếm quá hạn', () => {
  const D = loadShared().window.SavaDash;
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const s = { members: [{ id: 'zac', name: 'Zac' }], companies: [], leads: [], deals: [], games: [],
    tasks: [
      { id: 'x1', assignee: 'zac', done: false, dueDate: '', overdue: true },
      { id: 'x2', assignee: 'zac', done: false, dueDate: isoOffset(-1), overdue: false },
      { id: 'x3', done: false, dueDate: 'tuần sau', overdue: true },
    ], activities: [], events: [] };
  const rows = D.dashCompare(s, null, now);
  const byRow = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(byRow.zac.overdue, 1, 'chỉ x2 (hạn quá khứ) được đếm; x1/x3 mang cờ true nhưng không hạn hợp lệ -> không đếm');
  assert.equal(byRow.__none__.overdue, 0, 'x3 chưa gán + cờ true + hạn chữ -> không đếm');
});

/* ---------- Mọi bề mặt thống nhất trên CÙNG fixture ---------- */
test('bề mặt Việc theo người: KPI "Tổng việc quá hạn" = 1 và bộ lọc Quá hạn chỉ còn việc quá hạn thật', () => {
  const h = loadIndex();
  const all = h.run('vTasksByMember()');
  assert.ok(/Tổng việc quá hạn<\/div><div class="v">1<\/div>/.test(all), 'KPI tổng quá hạn phải = 1 (chỉ tPast), nhận được đoạn: ' + all.slice(all.indexOf('Tổng việc quá hạn') - 40, all.indexOf('Tổng việc quá hạn') + 120));
  h.run('taskMemberFilter = "overdue";');
  const filtered = h.run('vTasksByMember()');
  assert.ok(filtered.includes('Việc Quá Hạn Thật'), 'lọc Quá hạn phải còn việc quá hạn thật');
  for (const title of ['Việc Không Hạn Cờ True', 'Việc Hạn Chữ Cờ True', 'Việc Tương Lai Cờ True', 'Việc Gắn Deal Không Hạn Cờ True']) {
    assert.ok(!filtered.includes(title), 'lọc Quá hạn KHÔNG được còn: ' + title);
  }
  h.run('taskMemberFilter = "all";');
});

test('bề mặt thẻ việc: taskRow + relatedTaskRow — việc cờ true không hạn không còn nhãn "Quá hạn", việc quá hạn thật còn', () => {
  const h = loadIndex();
  const rowNo = h.run("taskRow(S.tasks.find(x => x.id === 'tNoDate'), 1)");
  assert.ok(!rowNo.includes('Quá hạn'), 'taskRow của việc không hạn cờ true không được hiện "Quá hạn"');
  const rowPast = h.run("taskRow(S.tasks.find(x => x.id === 'tPast'), 2)");
  assert.ok(rowPast.includes('Quá hạn'), 'taskRow của việc quá hạn thật phải hiện "Quá hạn"');
  const relNo = h.run("relatedTaskRow(S.tasks.find(x => x.id === 'tDealNoDate'))");
  assert.ok(!relNo.includes('Quá hạn'), 'relatedTaskRow (drawer deal/công ty/lead/game) của việc không hạn cờ true không được hiện "Quá hạn"');
  const relComp = h.run("relatedTasksHTML('company', 'c1')");
  assert.ok(relComp.includes('Việc Gắn Công Ty Không Hạn Cờ True'), 'drawer công ty phải liệt kê việc gắn công ty');
  assert.ok(!relComp.includes('Quá hạn'), 'khối Việc liên quan ở drawer công ty không được gắn nhãn Quá hạn cho việc không hạn cờ true');
});

test('bề mặt Lịch: calTaskState — không hạn cờ true = open, tương lai cờ true = open, quá khứ chưa xong = overdue, đã xong = done', () => {
  const h = loadIndex();
  assert.equal(h.run("calTaskState(S.tasks.find(x => x.id === 'tNoDate'))"), 'open');
  assert.equal(h.run("calTaskState(S.tasks.find(x => x.id === 'tFuture'))"), 'open', 'việc có ngày trên Lịch mang cờ true nhưng hạn chưa qua -> open, không nhuộm đỏ quá hạn');
  assert.equal(h.run("calTaskState(S.tasks.find(x => x.id === 'tPast'))"), 'overdue');
  assert.equal(h.run("calTaskState(S.tasks.find(x => x.id === 'tPastDone'))"), 'done');
});

test('bề mặt Dashboard + drawer thành viên: số việc quá hạn = 1 ở cả hai nơi', () => {
  const h = loadIndex();
  h.run("curView = 'dash'; dashboardMode = 'overview'; dashPeriodDays = null; render();");
  const dash = h.getEl('view').innerHTML;
  assert.ok(/<b>1<\/b> việc quá hạn/.test(dash), 'khối Cần xử lý phải hiện 1 việc quá hạn, nhận được đoạn: ' + dash.slice(Math.max(0, dash.indexOf('việc quá hạn') - 120), dash.indexOf('việc quá hạn') + 60));
  h.run("openMember('zac');");
  const drawer = h.getEl('drawer').innerHTML;
  assert.ok(drawer.includes('1 quá hạn'), 'drawer "Việc theo người" (chi tiết thành viên) phải báo 1 quá hạn, nhận được đoạn: ' + drawer.slice(Math.max(0, drawer.indexOf('quá hạn') - 160), drawer.indexOf('quá hạn') + 40));
  assert.ok(!drawer.includes('Quá hạn</span>') || drawer.includes('Việc Quá Hạn Thật'), 'drawer chỉ được gắn nhãn Quá hạn cho việc quá hạn thật');
});

/* ---------- (e) Tĩnh: khoá không-còn-đọc-cờ + round-trip giữ field ---------- */
test('tĩnh: isOverdue + dashIsOverdueFallback không còn đọc cờ lưu sẵn t.overdue', () => {
  const iso = html.slice(html.indexOf('function isOverdue'), html.indexOf('function isOverdue') + 300);
  assert.ok(!iso.includes('.overdue'), 'thân isOverdue không được chứa bất kỳ phép đọc .overdue nào, nhận được: ' + iso);
  const fb = shared.slice(shared.indexOf('function dashIsOverdueFallback'), shared.indexOf('function dashIsOverdueFallback') + 400);
  assert.ok(!fb.includes('t.overdue'), 'thân dashIsOverdueFallback không được đọc t.overdue, nhận được: ' + fb);
  assert.ok(!html.includes('return !!t.overdue'), 'index.html không còn "return !!t.overdue"');
  assert.ok(!shared.includes('return !!t.overdue'), 'shared.js không còn "return !!t.overdue"');
});

test('tĩnh: write-site của cờ ở saveTask giữ nguyên (chỉ ngừng ĐỌC làm căn cứ, không xoá field)', () => {
  assert.ok(html.includes('done, overdue: false }'), 'điểm tạo dữ liệu việc trong saveTask giữ overdue: false');
  assert.ok(html.includes('data.overdue = t.overdue && !done'), 'write-site bảo lưu cờ khi sửa việc giữ nguyên như cũ');
  assert.ok(shared.includes('overdue: "Quá hạn"'), 'nhãn FIELD_LABELS của task.overdue (chỉ dùng cho diff lịch sử) giữ nguyên — tiền lệ D1');
});

test('adapter: round-trip state -> rows -> state giữ NGUYÊN field overdue qua cột overdue_stored', () => {
  const s = { members: [], companies: [], games: [], deals: [], leads: [], activities: [], events: [], salesMaterials: [], verticals: [],
    tasks: [{ id: 't1', title: 'Việc 1', assignee: 'zac', deal: '', due: 'Hôm nay', dueDate: '', done: false, overdue: true }] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.tasks[0].overdue_stored, true, 'ghi xuống: overdue phải map sang overdue_stored nguyên giá trị');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.tasks[0].overdue, true, 'đọc lên: overdue_stored phải khôi phục thành overdue nguyên giá trị');
  const ad = read('supabase-adapter.js');
  assert.ok(ad.includes("const TASK_KNOWN = ['id', 'title', 'assignee', 'deal', 'due', 'dueDate', 'done', 'overdue']"), 'TASK_KNOWN vẫn chứa overdue');
  const schema = read('supabase/schema.sql');
  assert.ok(schema.includes('overdue_stored boolean not null default false'), 'schema vẫn giữ cột overdue_stored');
});
