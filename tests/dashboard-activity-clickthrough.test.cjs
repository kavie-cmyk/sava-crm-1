/* Đợt LÀM BẤM ĐƯỢC HOẠT ĐỘNG Ở DASHBOARD (09/11/2026):
   - Bề mặt chết đã rà: (1) Báo cáo hoạt động executive — "Hoạt động gần
     nhất" chỉ có nút chữ nhỏ mở drawer chủ, không highlight, phần còn lại
     của dòng chết; thẻ KPI từng loại / dòng Cơ cấu / ô loại trong bảng
     thành viên / cột Xu hướng đều KHÔNG handler (KPI loại chỉ tự gọi
     setDashboardMode('activity') = đứng yên). (2) Panel legacy "Hoạt
     động gần nhất" mở được drawer chủ nhưng không cuộn/highlight.
   - Cơ chế mới: dashOpenActivity(actId) mở drawer ĐÚNG chủ
     (deal/lead/game/event) qua open* sẵn có + nhảy pager khối hoạt động
     trong drawer về đúng trang chứa hoạt động + applyActivityHighlight
     cuộn tới hàng act-row-<id> (activityRowHTML mang id/data-act-id) và
     gắn .act-highlight. setDashboardActivityType(key) lọc danh sách theo
     loại trong đúng phạm vi Kỳ × Người × Mảng (model.records), chip xoá
     được; ô loại theo thành viên qua setDashboardActivityTypeForMember.
   Harness vm nạp index.html THẬT như event-task-activity.test.cjs. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function fixtureState() {
  const dealActs = [];
  for (let i = 1; i <= 12; i++) {
    const n = String(i).padStart(2, '0');
    dealActs.push({ id: 'ad' + n, deal: 'd1', who: 'zac', type: i % 3 === 1 ? 'Email' : 'Note', text: 'Hoạt động deal số ' + i, when: '2026-11-0' + (9 - Math.ceil(i / 2)), url: i === 1 ? 'https://mail.google.com/mail/u/0/#inbox/thread1' : '' });
  }
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: 'Anh Một — CEO', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'converted', note: '', when: '2026-10-01' }],
    tasks: [],
    activities: [
      ...dealActs,
      { id: 'al1', lead: 'l1', who: 'linh', type: 'Messenger', text: 'Chat với lead qua Messenger', when: '2026-11-07', url: 'https://www.messenger.com/t/123' },
      { id: 'ag1', game: 'g1', who: 'zac', type: 'Demo', text: 'Demo game cho đối tác', when: '2026-11-06', url: '' },
      { id: 'ae1', event: 'ev1', who: 'zac', type: 'Meeting', text: 'Gặp trực tiếp tại sự kiện', when: '2026-11-05', url: '' },
      { id: 'aorphan', deal: 'dDaXoa', who: 'zac', type: 'Email', text: 'Hoạt động mồ côi chủ đã xoá', when: '2026-11-08', url: '' },
    ],
    events: [
      { id: 'ev1', name: 'Expo Một', date: '2026-11-05', endDate: '2026-11-05', location: 'HCMC', note: '', attendees: ['zac'], companies: ['c1'], leads: ['l1'], deals: ['d1'], status: 'attended' },
    ],
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
/* Bắt highlight: thay querySelector của #drawer để ghi lại selector được
   hỏi + trả phần tử giả ghi lại class/scroll. */
function captureHighlight(getEl) {
  const drawer = getEl('drawer');
  const cap = { selector: '', classes: [], scrolled: false };
  const orig = drawer.querySelector.bind(drawer);
  drawer.querySelector = sel => {
    if (String(sel).includes('data-act-id')) {
      cap.selector = String(sel);
      return { classList: { add: c => cap.classes.push(c), remove() {} }, scrollIntoView: () => { cap.scrolled = true; } };
    }
    return orig(sel);
  };
  return cap;
}

test('activityRowHTML mang id + data-act-id để highlight tìm đúng hàng', () => {
  const { run } = loadIndex();
  const row = run("activityRowHTML(S.activities.find(x=>x.id==='ad01'))");
  assert.ok(row.includes('id="act-row-ad01"') && row.includes('data-act-id="ad01"'), 'hàng hoạt động phải mang act-row-<id>');
});

test('dashOpenActivity: mở drawer deal + nhảy pager tới trang chứa hoạt động + highlight', () => {
  const { run, getEl } = loadIndex();
  const cap = captureHighlight(getEl);
  run("dashOpenActivity('ad12')");
  assert.equal(run("drawerCtx && drawerCtx.type"), 'deal');
  assert.equal(run("drawerCtx && drawerCtx.id"), 'd1');
  assert.equal(run("listPageState['dealacts:d1']"), 2, 'hoạt động thứ 12 phải nhảy pager sang trang 2');
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('id="act-row-ad12"'), 'drawer phải chứa đúng hàng hoạt động đích');
  assert.ok(!html.includes('id="act-row-ad01"'), 'trang 2 không lẫn hoạt động trang 1');
  assert.equal(cap.selector, '[data-act-id="ad12"]');
  assert.ok(cap.classes.includes('act-highlight') && cap.scrolled, 'phải gắn .act-highlight + cuộn tới');
  run("dashOpenActivity('ad01')");
  assert.ok(getEl('drawer').innerHTML.includes('Mở đúng cuộc hội thoại'), 'hoạt động có link ghim (ad01, Gmail) phải hiện nút mở đúng cuộc hội thoại trong drawer');
});

test('dashOpenActivity: chủ lead/game/event mở đúng drawer tương ứng', () => {
  const { run, getEl } = loadIndex();
  run("dashOpenActivity('al1')");
  assert.equal(run("drawerCtx && drawerCtx.type"), 'lead');
  assert.ok(getEl('drawer').innerHTML.includes('id="act-row-al1"'), 'drawer lead chứa hàng hoạt động lead (pager đã nhảy đúng trang)');
  run("dashOpenActivity('ag1')");
  assert.equal(run("drawerCtx && drawerCtx.type"), 'game');
  assert.ok(getEl('drawer').innerHTML.includes('id="act-row-ag1"'));
  run("dashOpenActivity('ae1')");
  assert.equal(run("drawerCtx && drawerCtx.type"), 'event');
  assert.ok(getEl('drawer').innerHTML.includes('id="act-row-ae1"'));
});

test('dashOpenActivity: chủ đã xoá -> không mở drawer nào', () => {
  const { run } = loadIndex();
  run('closeDrawer()');
  run("dashOpenActivity('aorphan')");
  assert.equal(run('drawerCtx'), null, 'hoạt động mồ côi không được mở drawer');
});

test('Dashboard: dòng hoạt động gần nhất + thẻ KPI loại đều có handler bấm xuyên', () => {
  const { run, getEl } = loadIndex();
  run("dashboardMode='activity'; dashPeriodDays=30; dashScope=''; dashLine=''; render();");
  const v = getEl('view').innerHTML;
  assert.ok(v.includes("dashOpenActivity('ad01')"), 'dòng hoạt động gần nhất (executive) bấm xuyên được');
  assert.ok(v.includes("dashOpenActivity('ad12')") || v.includes('Hoạt động gần nhất'), 'khối hoạt động gần nhất hiện diện');
  assert.ok(v.includes("setDashboardActivityType('email')"), 'thẻ KPI Email bấm để lọc loại');
  assert.ok(v.includes("setDashboardActivityType('message')"), 'dòng Cơ cấu Tin nhắn bấm để lọc loại');
  assert.ok(v.includes('setDashboardActivityTypeForMember('), 'ô loại trong bảng thành viên bấm được');
  assert.ok(v.includes('onclick="dashOpenActivity(\'ad01\')"'), 'panel legacy Hoạt động gần nhất cũng bấm xuyên qua dashOpenActivity');
});

test('lọc theo loại: danh sách đúng loại trong phạm vi chung, chip xoá được, bấm lại loại = bỏ lọc', () => {
  const { run, getEl } = loadIndex();
  run("dashboardMode='activity'; dashPeriodDays=30; dashScope=''; dashLine=''; setDashboardActivityType('email');");
  assert.equal(run('dashboardActivityTypeFilter'), 'email');
  let v = getEl('view').innerHTML;
  assert.ok(v.includes('Hoạt động loại: Email'), 'hiện danh sách loại Email');
  assert.ok(v.includes('Đang lọc: Email') && v.includes('clearDashboardActivityType()'), 'chip lọc hiện rõ + xoá được');
  const seg = v.slice(v.indexOf('Hoạt động loại: Email'), v.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Hoạt động deal số 1'), 'danh sách gồm hoạt động Email trong kỳ');
  assert.ok(!seg.includes('Chat với lead qua Messenger'), 'hoạt động loại khác không lẫn vào danh sách');
  assert.ok(seg.includes("dashOpenActivity('ad01')"), 'dòng trong danh sách lọc bấm tiếp được vào drawer chủ');
  run("setDashboardActivityType('email');");
  assert.equal(run('dashboardActivityTypeFilter'), '', 'bấm lại đúng loại đang lọc = bỏ lọc');
  v = getEl('view').innerHTML;
  assert.ok(!v.includes('Hoạt động loại: Email'), 'bỏ lọc thì danh sách loại biến mất');
});

test('lọc theo loại tôn trọng bộ lọc chung Người: ô loại của thành viên đặt cả scope', () => {
  const { run, getEl } = loadIndex();
  run("dashboardMode='activity'; dashPeriodDays=30; dashScope=''; dashLine=''; setDashboardActivityTypeForMember('message','linh');");
  assert.equal(run('dashScope'), 'linh');
  assert.equal(run('dashboardActivityTypeFilter'), 'message');
  const v = getEl('view').innerHTML;
  const seg = v.slice(v.indexOf('Hoạt động loại: Tin nhắn'), v.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Chat với lead qua Messenger'), 'hoạt động Messenger của Linh hiện trong danh sách');
  assert.ok(!seg.includes('Hoạt động deal số 1'), 'hoạt động của người khác không lộ qua đường lọc này');
});

test('resetDashboardFilters xoá cả lọc loại hoạt động', () => {
  const { run } = loadIndex();
  run("dashboardActivityTypeFilter='email'; resetDashboardFilters();");
  assert.equal(run('dashboardActivityTypeFilter'), '');
});

test('tĩnh: cơ chế highlight + handler dùng chung có trong source, không còn openFn cũ', () => {
  const html = read('index.html');
  for (const s of ['function dashOpenActivity(', 'function applyActivityHighlight(', 'function activityPagerTargets(', '.act-highlight', 'function dashboardActivityTypeListHTML(', 'function setDashboardActivityType(', 'data-act-id='])
    assert.ok(html.includes(s), 'thiếu: ' + s);
  assert.ok(!html.includes('const openFn = o ?'), 'panel legacy không còn mở drawer trần không highlight');
  const css = read('dashboard-design.css');
  assert.ok(css.includes('.ex-chip-clear') && css.includes('.ex-clickable'), 'CSS chip lọc + dòng bấm được có trong dashboard-design.css');
});
