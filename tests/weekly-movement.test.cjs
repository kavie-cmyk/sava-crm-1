/* Biến động tuần (Weekly Movement) — khối cuối khu Phân tích ở Tổng quan BD:
   - Helper thuần window.SavaDash (shared.js): wmScopeKey (ánh xạ phạm vi
     Tổng quan -> scope key snapshot), wmDelta (chênh + %, tuần trước = 0
     -> pct null), wmMetricsFor (scope/tuần thiếu -> toàn 0),
     wmNormalizeMetrics (chỉ chuẩn hoá 7 chỉ số), wmDefaultWeekIndex
     (tuần chứa hôm nay, không có -> tuần cuối; rỗng -> -1), wmWeekLabel
     (Thứ 2 -> Chủ nhật dd-mm-yyyy), wmComputedAtText (HH:mm ngày
     dd-mm-yyyy quy về Asia/Saigon, lấy đúng giờ trong computed_at).
   - Bảng biến động theo trạng thái (stage) của Lead ĐÃ GỠ SẠCH khỏi
     khối (Zac chốt 5/11/2026, gồm cả quyết định bổ sung gỡ luôn phần
     TÍNH leadStages ở tầng dữ liệu — đợt dữ liệu riêng): không còn
     wmStageRows / WM_STAGE_* ở shared.js, không còn bảng Vào/Ra/Ròng ở
     index.html, không còn .dash-wm-subtitle ở CSS, và payload KHÔNG
     còn key leadStages — mọi payload mẫu trong file này đều không có
     key đó, app phải chạy an toàn khi key vắng mặt.
   - Tĩnh: index.html đọc dashboard_snapshots key="weekly_movement" qua
     client dùng chung, khối gắn CUỐI dashAnalyticsHTML, đủ chú thích
     phạm vi dữ liệu bắt buộc + nhãn "Số liệu tính tới"; CSS dash-wm-.
   - Hành vi qua harness index.html: render đủ 7 thẻ và KHÔNG còn bảng
     stage trên payload mẫu đúng hợp đồng mới (không có leadStages);
     so sánh tuần trước (gồm ca tuần
     trước = 0 chỉ hiện chênh tuyệt đối; Deal Lost đảo màu); nút ‹ ›
     disable ở biên + wmMoveWeek kẹp biên; đổi dashScope -> số đổi theo
     member:<id>, scope thiếu trong snapshot -> toàn 0 không vỡ trang;
     trạng thái trống (empty / lỗi đọc) hiện thông báo, khối khác nguyên. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

function mkMetrics(over = {}) {
  return { leadsNew: 0, leadsMovedUnique: 0, dealsNew: 0, dealsWon: 0, dealsLost: 0, activitiesNew: 0, tasksCompleted: 0, ...over };
}
/* Payload mẫu đúng hợp đồng MỚI (sau quyết định gỡ leadStages ở tầng
   dữ liệu): metrics CHỈ có 7 chỉ số, KHÔNG có key leadStages ở bất kỳ
   scope/tuần nào. 3 tuần tăng dần; tuần 1 toàn 0 (để ca tuần trước = 0
   rơi vào tuần 2); member:yen có số riêng; member hoang KHÔNG có scope
   nào (ca scope thiếu). computed_at 11:05 — cố ý khác 18:00. */
function wmPayload() {
  return {
    version: 1,
    weeks: [
      { weekStart: '2026-10-19', scopes: { all: mkMetrics(), 'member:yen': mkMetrics() } },
      { weekStart: '2026-10-26', scopes: {
        all: mkMetrics({ leadsNew: 10, leadsMovedUnique: 5, dealsNew: 4, dealsWon: 2, dealsLost: 1, activitiesNew: 7, tasksCompleted: 3 }),
        'member:yen': mkMetrics({ leadsNew: 4, leadsMovedUnique: 2, dealsNew: 1, dealsWon: 1, dealsLost: 0, activitiesNew: 3, tasksCompleted: 1 }),
      } },
      { weekStart: '2026-11-02', scopes: {
        all: mkMetrics({ leadsNew: 15, leadsMovedUnique: 5, dealsNew: 2, dealsWon: 3, dealsLost: 3, activitiesNew: 0, tasksCompleted: 6 }),
        'member:yen': mkMetrics({ leadsNew: 9, leadsMovedUnique: 2, dealsNew: 1, dealsWon: 2, dealsLost: 0, activitiesNew: 1, tasksCompleted: 2 }),
      } },
    ],
  };
}
const WM_ROW = { payload: wmPayload(), computed_at: '2026-11-05T11:05:00+07:00' };

/* ---------- 1) Ánh xạ scope -> scope key ---------- */

test('wmScopeKey: Toàn hệ -> all; member id -> member:<id>; Chưa gán -> unassigned', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(D.wmScopeKey(''), 'all');
  assert.equal(D.wmScopeKey(null), 'all');
  assert.equal(D.wmScopeKey(undefined), 'all');
  assert.equal(D.wmScopeKey('yen'), 'member:yen');
  assert.equal(D.wmScopeKey('hoang'), 'member:hoang');
  assert.equal(D.wmScopeKey('__none__'), 'unassigned');
  assert.equal(D.wmScopeKey('unassigned'), 'unassigned');
});

/* ---------- 2) Chênh / % ---------- */

test('wmDelta: chênh tuyệt đối + % trên tuần trước; tuần trước = 0 -> pct null (không chia 0)', () => {
  const D = loadShared().window.SavaDash;
  const J = o => JSON.parse(JSON.stringify(o)); /* đưa object từ vm về realm test để deepEqual */
  assert.deepEqual(J(D.wmDelta(15, 10)), { cur: 15, prev: 10, diff: 5, pct: 50 });
  assert.deepEqual(J(D.wmDelta(2, 4)), { cur: 2, prev: 4, diff: -2, pct: -50 });
  assert.deepEqual(J(D.wmDelta(0, 7)), { cur: 0, prev: 7, diff: -7, pct: -100 });
  assert.deepEqual(J(D.wmDelta(4, 0)), { cur: 4, prev: 0, diff: 4, pct: null }, 'prev = 0: chỉ chênh tuyệt đối, pct null');
  assert.deepEqual(J(D.wmDelta(0, 0)), { cur: 0, prev: 0, diff: 0, pct: null });
  assert.deepEqual(J(D.wmDelta(undefined, null)), { cur: 0, prev: 0, diff: 0, pct: null }, 'thiếu số -> 0, không NaN');
});

/* ---------- 3) Metrics theo tuần/scope + chuẩn hoá ---------- */

test('wmMetricsFor: scope thiếu trong tuần / tuần hỏng -> toàn 0; payload THIẾU HẲN leadStages vẫn chuẩn hoá đúng 7 chỉ số', () => {
  const D = loadShared().window.SavaDash;
  const payload = wmPayload();
  for (const w of payload.weeks) for (const k of Object.keys(w.scopes)) assert.ok(!('leadStages' in w.scopes[k]), 'payload mẫu theo hợp đồng mới không có key leadStages ở scope ' + k);
  const week = payload.weeks[2];
  assert.equal(D.wmMetricsFor(week, 'all').leadsNew, 15);
  assert.equal(D.wmMetricsFor(week, 'member:yen').leadsNew, 9);
  const missing = D.wmMetricsFor(week, 'member:hoang');
  assert.equal(missing.leadsNew, 0); assert.equal(missing.tasksCompleted, 0);
  assert.equal(D.wmMetricsFor(null, 'all').dealsNew, 0);
  assert.equal(D.wmMetricsFor({}, 'all').leadsMovedUnique, 0);
  const norm = D.wmNormalizeMetrics({ leadsNew: 3 });
  assert.equal(norm.leadsNew, 3);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(norm))).sort(), ['activitiesNew', 'dealsLost', 'dealsNew', 'dealsWon', 'leadsMovedUnique', 'leadsNew', 'tasksCompleted'], 'metrics chuẩn hoá chỉ gồm đúng 7 chỉ số, không sinh key lạ khi payload thiếu leadStages');
  assert.equal(norm.dealsWon, 0, 'field thiếu -> 0');
});

/* ---------- 4) Chọn tuần mặc định + nhãn tuần + mốc tính ---------- */

test('wmDefaultWeekIndex: tuần chứa hôm nay; ngoài cửa sổ -> tuần cuối; rỗng -> -1', () => {
  const D = loadShared().window.SavaDash;
  const weeks = wmPayload().weeks;
  assert.equal(D.wmDefaultWeekIndex(weeks, '2026-11-05'), 2, '05-11-2026 nằm trong tuần 02-11');
  assert.equal(D.wmDefaultWeekIndex(weeks, '2026-10-19'), 0, 'đúng thứ Hai của tuần đầu');
  assert.equal(D.wmDefaultWeekIndex(weeks, '2026-10-25'), 0, 'Chủ nhật vẫn thuộc tuần đó');
  assert.equal(D.wmDefaultWeekIndex(weeks, '2027-03-01'), 2, 'hôm nay ngoài cửa sổ snapshot -> tuần cuối');
  assert.equal(D.wmDefaultWeekIndex(weeks, ''), 2);
  assert.equal(D.wmDefaultWeekIndex([], '2026-11-05'), -1);
  assert.equal(D.wmDefaultWeekIndex(null, '2026-11-05'), -1);
});

test('wmWeekLabel + wmComputedAtText: dd-mm-yyyy; giờ quy về Asia/Saigon đúng như computed_at', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(D.wmWeekLabel('2026-11-02'), 'Tuần 02-11-2026 → 08-11-2026');
  assert.equal(D.wmWeekLabel('2026-10-26'), 'Tuần 26-10-2026 → 01-11-2026', 'Chủ nhật có thể sang tháng sau');
  assert.equal(D.wmComputedAtText('2026-11-05T11:05:00+07:00'), '11:05 ngày 05-11-2026', 'ghi đúng 11:05 trong dữ kiện, không giả định 18:00');
  assert.equal(D.wmComputedAtText('2026-11-05T01:30:00Z'), '08:30 ngày 05-11-2026', 'mốc UTC quy về giờ Saigon (+7)');
  assert.equal(D.wmComputedAtText(''), '');
  assert.equal(D.wmComputedAtText('không-phải-ngày'), '');
});

/* ---------- 5) Bảng stage ĐÃ GỠ (Zac chốt 5/11/2026) ---------- */

test('đã gỡ bảng stage: SavaDash không còn wmStageRows / WM_STAGE_* và shared.js không còn helper stage', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(D.wmStageRows, undefined, 'helper chỉ phục vụ bảng stage đã gỡ');
  assert.equal(D.WM_STAGE_KEYS, undefined);
  assert.equal(D.WM_STAGE_LABELS, undefined);
  const shared = read('shared.js');
  assert.ok(!shared.includes('wmStageRows') && !shared.includes('WM_STAGE_KEYS') && !shared.includes('WM_STAGE_LABELS'), 'helper/hằng chỉ phục vụ bảng stage đã gỡ hẳn khỏi shared.js');
  assert.ok(typeof D.wmMetricsFor === 'function' && typeof D.wmDelta === 'function' && typeof D.wmDefaultWeekIndex === 'function', 'helper dùng chung cho 7 thẻ + chọn tuần vẫn còn nguyên');
});

/* ---------- 6) Tĩnh ---------- */

test('tĩnh: index đọc dashboard_snapshots/weekly_movement qua client dùng chung; khối gắn cuối dashAnalyticsHTML; đủ nhãn bắt buộc; CSS dash-wm-', () => {
  const html = read('index.html'), css = read('workspace-design.css'), shared = read('shared.js');
  assert.ok(html.includes('weeklyMovementHTML()'), 'dashAnalyticsHTML phải gắn khối Biến động tuần');
  assert.ok(html.includes('compareHTML}${weeklyMovementHTML()'), 'khối mới đặt DƯỚI các khối hiện có (sau bảng so sánh BD)');
  assert.ok(html.includes('dashboard_snapshots') && html.includes('"weekly_movement"'), 'đọc đúng bảng + key theo hợp đồng');
  assert.ok(html.includes('window.savaSupabase'), 'đọc qua client dùng chung savaSupabase (supabase-client.js)');
  assert.ok(html.includes('Số liệu tính tới'), 'có dòng nhãn thời gian tính số liệu');
  assert.ok(html.includes('wmComputedAtText'), 'nhãn thời gian lấy từ computed_at thật qua helper, không bịa giờ');
  assert.ok(html.includes('Số chuyển trạng thái lấy từ lịch sử thay đổi trong hệ thống, đầy đủ từ 31-10-2026'), 'chú thích phạm vi dữ liệu: ý 1');
  assert.ok(html.includes('không tính vào biến động stage') && html.includes('vẫn được tính ở số mới tạo của tuần nạp'), 'chú thích phạm vi dữ liệu: ý nạp hàng loạt');
  assert.ok(html.includes('Chưa có số liệu biến động tuần — số liệu được tính tự động lúc 18:00 hằng ngày.'), 'thông báo trạng thái trống');
  assert.ok(html.includes('wmMoveWeek(-1)') && html.includes('wmMoveWeek(1)'), 'có nút chuyển tuần 2 chiều');
  const wmFn = html.slice(html.indexOf('function weeklyMovementHTML'), html.indexOf('/* Quá hạn tính ĐỘNG'));
  assert.ok(wmFn.includes('D.wmScopeKey(dashScope)'), 'phạm vi của khối ánh xạ từ dashScope sẵn có của Tổng quan');
  assert.ok(!wmFn.includes('<select') && !wmFn.includes('onchange'), 'khối không tạo bộ chọn phạm vi riêng');
  assert.ok(shared.includes('WM_METRIC_DEFS') && shared.includes('wmScopeKey'), 'helper thuần nằm ở shared.js qua SavaDash');
  assert.ok(css.includes('.dash-wm-grid') && css.includes('.dash-wm-delta') && css.includes('.dash-wm-weeknav'), 'CSS dash-wm- trong workspace-design.css');
  assert.ok(!html.includes('dash-wm-table') && !html.includes('dash-wm-subtitle') && !html.includes('Biến động theo trạng thái của Lead') && !html.includes('wmStageRows'), 'index.html không còn render bảng stage của Lead');
  assert.ok(!css.includes('.dash-wm-subtitle'), 'CSS chỉ dùng cho tiêu đề bảng stage (.dash-wm-subtitle) đã gỡ');
});

/* ---------- 7) Hành vi qua harness ---------- */

function fixtureState() {
  const isoDaysAgo = n => { const d = new Date('2026-11-02T12:00:00+07:00'); d.setDate(d.getDate() - n); return d.toISOString(); };
  return {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }, { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'C1' }],
    leads: [{ id: 'l1', company: 'c1', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(1) }],
    deals: [{ id: 'd1', company: 'c1', line: 'ai', stage: 'prospect', owner: 'yen', createdAt: isoDaysAgo(1) }],
    tasks: [], activities: [], games: [],
  };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = fixtureState();
  s.leads.forEach(l => { l.name = 'Lead ' + l.id; l.person = ''; l.note = ''; l.source = ''; l.when = '2026-11-02'; });
  s.deals.forEach(d => { d.title = 'Deal ' + d.id; d.due = ''; d.idle = 0; d.custom = {}; d.leads = []; });
  s.companies.forEach(c => { c.type = 'Doanh nghiệp'; c.roles = { ai: 'Khách hàng' }; c.last = 'Hôm nay'; });
  ls.setItem('sava_crm_shared_v1', JSON.stringify(s));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: q => getEl('qs:' + q), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(x => x.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
function renderReady(run, idx) {
  run(`wmData = ${JSON.stringify(WM_ROW)}; wmStatus = "ready"; wmWeekIdx = ${idx}; curView = "dash"; render();`);
}
const wmSlice = html => html.slice(html.indexOf('id="wmBlock"'));
const wmGrid = html => { const s = wmSlice(html); const start = s.indexOf('dash-wm-grid'); return s.slice(start, s.indexOf('<p class="dash-note">', start)); };

test('hành vi: tuần hiện tại (idx cuối) — nhãn tính tới đúng computed_at, nhãn tuần, 7 thẻ + chênh/% + Deal Lost đảo màu, KHÔNG còn bảng stage và payload không còn key leadStages vẫn render đúng, nút › disable', () => {
  const { run, getEl } = loadIndex();
  renderReady(run, 2);
  const html = wmSlice(getEl('view').innerHTML);
  assert.ok(html.includes('Biến động tuần'));
  assert.ok(html.includes('Số liệu tính tới 11:05 ngày 05-11-2026'), 'mốc tính lấy từ computed_at thật (11:05), không phải 18:00');
  assert.ok(html.includes('Tuần 02-11-2026 → 08-11-2026'), 'nhãn tuần Thứ 2 → Chủ nhật dd-mm-yyyy');
  const grid = wmGrid(getEl('view').innerHTML);
  for (const label of ['Lead mới tạo', 'Lead chuyển trạng thái', 'Deal mới', 'Deal Won', 'Deal Lost', 'Note/Hoạt động mới', 'Việc hoàn thành']) assert.ok(grid.includes(label), 'thiếu thẻ: ' + label);
  assert.ok(grid.includes('<div class="v">15</div>'), 'Lead mới tạo = 15');
  assert.ok(grid.includes('dash-wm-delta good">▲ +5 (+50%)'), 'Lead mới 10 -> 15: tăng, xanh, +5 (+50%)');
  assert.ok(grid.includes('— 0 (0%)'), 'Lead chuyển trạng thái 5 -> 5: chênh 0');
  assert.ok(grid.includes('dash-wm-delta bad">▼ -2 (-50%)'), 'Deal mới 4 -> 2: giảm, đỏ');
  assert.ok(grid.includes('dash-wm-delta bad">▲ +2 (+200%)'), 'Deal Lost 1 -> 3: TĂNG nhưng ĐỎ (đảo nghĩa màu)');
  assert.ok(grid.includes('dash-wm-delta bad">▼ -7 (-100%)'), 'Hoạt động 7 -> 0: giảm, đỏ');
  assert.ok(grid.includes('dash-wm-delta good">▲ +3 (+100%)'), 'Việc hoàn thành 3 -> 6: tăng, xanh');
  assert.ok(!html.includes('dash-wm-table') && !html.includes('dash-wm-subtitle') && !html.includes('Biến động theo trạng thái của Lead'), 'không còn bảng Vào/Ra/Ròng theo trạng thái Lead — và payload mẫu theo hợp đồng mới không có key leadStages ở bất kỳ scope nào, khối vẫn render bình thường (an toàn khi key vắng mặt)');
  assert.ok(!html.includes('<th>Trạng thái</th>'), 'không còn header bảng stage trong khối');
  assert.ok(/wmMoveWeek\(1\)" disabled/.test(html), 'đang ở tuần cuối: nút › disable');
  assert.ok(!/wmMoveWeek\(-1\)" disabled/.test(html), 'nút ‹ còn bấm được');
  assert.ok(html.includes('Số chuyển trạng thái lấy từ lịch sử thay đổi trong hệ thống, đầy đủ từ 31-10-2026'), 'chú thích cuối khối có mặt khi render');
});

test('hành vi: tuần trước = 0 -> chỉ hiện chênh tuyệt đối, không hiện % nào trong lưới thẻ; tuần đầu -> ghi rõ không có tuần liền trước + nút ‹ disable', () => {
  const { run, getEl } = loadIndex();
  renderReady(run, 1);
  let grid = wmGrid(getEl('view').innerHTML);
  assert.ok(grid.includes('▲ +10'), 'Lead mới 0 -> 10: chênh tuyệt đối +10');
  assert.ok(!grid.includes('%'), 'tuần trước toàn 0: không thẻ nào hiện % (không chia 0)');
  assert.ok(grid.includes('dash-wm-delta bad">▲ +1'), 'Deal Lost 0 -> 1: tăng lost vẫn đỏ dù không có %');
  assert.ok(!/wmMoveWeek\(-1\)" disabled/.test(wmSlice(getEl('view').innerHTML)), 'tuần giữa: nút ‹ bấm được');
  run('wmMoveWeek(-1)');
  assert.equal(run('wmWeekIdx'), 0);
  grid = wmGrid(getEl('view').innerHTML);
  assert.ok(grid.includes('Không có tuần liền trước trong dữ liệu'), 'tuần đầu của snapshot: nói rõ, không bịa so sánh với 0');
  assert.ok(/wmMoveWeek\(-1\)" disabled/.test(wmSlice(getEl('view').innerHTML)), 'tuần đầu: nút ‹ disable');
  run('wmMoveWeek(-1)');
  assert.equal(run('wmWeekIdx'), 0, 'wmMoveWeek kẹp ở biên đầu, không đi quá');
  run('wmMoveWeek(1)'); run('wmMoveWeek(1)'); run('wmMoveWeek(1)');
  assert.equal(run('wmWeekIdx'), 2, 'wmMoveWeek kẹp ở biên cuối');
});

test('hành vi: đổi phạm vi Tổng quan -> khối ăn theo member:<id>; scope thiếu trong snapshot -> toàn 0, không vỡ trang', () => {
  const { run, getEl } = loadIndex();
  renderReady(run, 2);
  run("setDashScope('yen')");
  let grid = wmGrid(getEl('view').innerHTML);
  assert.ok(grid.includes('<div class="v">9</div>'), 'phạm vi Yến: Lead mới tuần này = 9 (scope member:yen)');
  assert.ok(grid.includes('dash-wm-delta good">▲ +5 (+125%)'), 'Yến: Lead mới 4 -> 9 là +5 (+125%)');
  assert.ok(wmSlice(getEl('view').innerHTML).includes('Yến'), 'khối ghi rõ phạm vi đang xem');
  run("setDashScope('hoang')");
  grid = wmGrid(getEl('view').innerHTML);
  assert.ok(grid.includes('<div class="v">0</div>'), 'Hoàng không có scope trong snapshot -> số 0');
  assert.ok(wmSlice(getEl('view').innerHTML).includes('Biến động tuần'), 'trang không vỡ khi scope thiếu');
  run("setDashScope('')");
});

test('hành vi: mặc định khi chưa chọn tuần -> tuần chứa hôm nay / tuần cuối (nhãn tuần mới nhất của fixture)', () => {
  const { run, getEl } = loadIndex();
  run(`wmData = ${JSON.stringify(WM_ROW)}; wmStatus = "ready"; wmWeekIdx = null; curView = "dash"; render();`);
  assert.ok(wmSlice(getEl('view').innerHTML).includes('Tuần 02-11-2026 → 08-11-2026'), 'mặc định rơi về tuần cuối/chứa hôm nay của snapshot');
});

test('hành vi: trạng thái trống (chưa có snapshot) + lỗi đọc -> thông báo trống, các khối Tổng quan khác nguyên vẹn', () => {
  const { run, getEl } = loadIndex();
  run('wmData = null; wmStatus = "empty"; wmWeekIdx = null; curView = "dash"; render();');
  let html = getEl('view').innerHTML;
  assert.ok(html.includes('Chưa có số liệu biến động tuần — số liệu được tính tự động lúc 18:00 hằng ngày.'), 'empty: hiện thông báo trống có giải thích');
  assert.ok(!wmSlice(html).includes('dash-wm-grid'), 'empty: không vẽ lưới thẻ rỗng');
  assert.ok(html.includes('Phân tích') && html.includes('Phễu Lead'), 'empty: các khối khác của Tổng quan vẫn nguyên');
  /* Lỗi đọc thật: harness không có client Supabase -> loadWeeklyMovement
     phải rơi về trạng thái lỗi êm, hiện cùng thông báo trống. */
  const h2 = loadIndex();
  h2.run("curView = 'dash'; render();");
  assert.equal(h2.run('wmStatus'), 'error', 'không có client -> wmStatus = error, không exception');
  html = h2.getEl('view').innerHTML;
  assert.ok(html.includes('Chưa có số liệu biến động tuần — số liệu được tính tự động lúc 18:00 hằng ngày.'), 'error: hiện thông báo trống');
  assert.ok(html.includes('Phân tích'), 'error: Tổng quan vẫn render các khối khác');
});
