/* Lịch làm việc — bộ lọc THEO NGƯỜI áp cho CẢ Việc lẫn Sự kiện
   (đợt sửa 17/11/2026, Zac báo: chọn 1 người trên Lịch vẫn thấy sự kiện
   của người khác / chưa gán):
   - TRƯỚC SỬA: calBuildItems chỉ lọc Việc theo assignee; vòng lặp Sự
     kiện KHÔNG xét calMemberFilter (comment cũ ghi thẳng "trục người
     không áp cho Sự kiện — sự kiện xem chung") nên sự kiện rò qua MỌI
     lựa chọn người trên MỌI bề mặt suy ra từ calBuildItems: lưới Tháng,
     segment timeline Tuần (calWeekSegments), panel chi tiết ngày (kể cả
     mở qua nhãn tràn "+N nữa"), panel "Chưa có ngày" + các số đếm/badge.
   - SAU SỬA (semantics đích): Việc theo assignee, Sự kiện theo chủ qua
     eventOwnerId (owner -> createdBy -> ""); chọn 1 người -> đúng việc
     + sự kiện của người đó; "Tất cả" -> mọi mục; chưa gán -> chỉ hiện ở
     "Tất cả" hoặc khi chọn "Chưa gán" (__none__); vai Admin/BD KHÔNG
     đổi semantics (lọc hiển thị, không phân quyền); phạm vi Của tôi/
     Tất cả của view Sự kiện KHÔNG áp lên Lịch (điều khiển riêng).
   Fixture GHIM ngày tuyệt đối quanh tuần Thứ 2 09/11 – CN 15/11/2026
   (neo Thứ 4 11/11/2026, MockDate ghim todayStr) với 3 thành viên thật
   zac / hoangdaden / yen: việc + sự kiện của từng người, chưa gán, có
   ngày trong tuần/tháng, nhiều ngày, tràn biên tuần (bắt đầu trước
   tuần / kết thúc sau tuần), chưa có ngày, và sự kiện suy chủ từ
   createdBy. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const PINNED_TODAY = '2026-11-11'; /* Thứ 4, giữa tuần 09–15/11/2026 */
const _p = PINNED_TODAY.split('-').map(Number);
class MockDate extends Date {
  constructor(...args) { if (args.length === 0) super(_p[0], _p[1] - 1, _p[2], 12, 0, 0, 0); else super(...args); }
  static now() { return new Date(_p[0], _p[1] - 1, _p[2], 12, 0, 0, 0).getTime(); }
}
const MID = '2026-11-11'; /* ngày giữa tuần/tháng dùng cho panel ngày */

function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
    ],
    companies: [], games: [], deals: [], leads: [], activities: [], verticals: [],
    tasks: [
      { id: 'tZac', title: 'TASK-ZAC', assignee: 'zac', due: '', startDate: '2026-11-10', dueDate: '2026-11-12', done: false, overdue: false },
      { id: 'tHoang', title: 'TASK-HOANG', assignee: 'hoangdaden', due: '', startDate: '2026-11-10', dueDate: '2026-11-12', done: false, overdue: false },
      { id: 'tYen', title: 'TASK-YEN', assignee: 'yen', due: '', dueDate: MID, done: false, overdue: false },
      { id: 'tNone', title: 'TASK-NONE', assignee: '', due: '', dueDate: MID, done: false, overdue: false },
      /* Tràn biên tuần: bắt đầu TRƯỚC tuần, kết thúc SAU tuần */
      { id: 'tZacEdge', title: 'TASK-ZAC-EDGE', assignee: 'zac', due: '', startDate: '2026-11-02', dueDate: '2026-11-20', done: false, overdue: false },
      { id: 'tHoangEdge', title: 'TASK-HOANG-EDGE', assignee: 'hoangdaden', due: '', startDate: '2026-11-02', dueDate: '2026-11-20', done: false, overdue: false },
      /* Chưa có ngày */
      { id: 'tZacU', title: 'TASK-ZAC-UNDATED', assignee: 'zac', due: 'Tuần sau', dueDate: '', done: false, overdue: false },
      { id: 'tHoangU', title: 'TASK-HOANG-UNDATED', assignee: 'hoangdaden', due: 'Tuần sau', dueDate: '', done: false, overdue: false },
      { id: 'tNoneU', title: 'TASK-NONE-UNDATED', assignee: '', due: 'Tuần sau', dueDate: '', done: false, overdue: false },
    ],
    events: [
      { id: 'evZac', name: 'EV-ZAC', owner: 'zac', status: 'planned', date: '2026-11-10', endDate: '2026-11-12', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evHoang', name: 'EV-HOANG', owner: 'hoangdaden', status: 'planned', date: '2026-11-10', endDate: '2026-11-12', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evYen', name: 'EV-YEN', owner: 'yen', status: 'planned', date: MID, endDate: MID, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evNone', name: 'EV-NONE', status: 'planned', date: MID, endDate: MID, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      /* Tràn biên tuần theo chủ */
      { id: 'evZacEdge', name: 'EV-ZAC-EDGE', owner: 'zac', status: 'planned', date: '2026-11-02', endDate: '2026-11-20', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evHoangEdge', name: 'EV-HOANG-EDGE', owner: 'hoangdaden', status: 'planned', date: '2026-11-02', endDate: '2026-11-20', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      /* Không owner, suy chủ từ createdBy (đường eventOwnerId) */
      { id: 'evHoangCB', name: 'EV-HOANG-CB', createdBy: 'hoangdaden', status: 'planned', date: MID, endDate: MID, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      /* Chưa có ngày */
      { id: 'evZacU', name: 'EV-ZAC-UNDATED', owner: 'zac', status: 'planned', date: 'Tuần sau', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evHoangU', name: 'EV-HOANG-UNDATED', owner: 'hoangdaden', status: 'planned', date: 'Tuần sau', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evNoneU', name: 'EV-NONE-UNDATED', status: 'planned', date: 'Tuần sau', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
  };
}
/* Ma trận kỳ vọng: dated / undated theo từng lựa chọn người */
const EXPECT = {
  '':        { dated: ['evHoang', 'evHoangCB', 'evHoangEdge', 'evNone', 'evYen', 'evZac', 'evZacEdge', 'tHoang', 'tHoangEdge', 'tNone', 'tYen', 'tZac', 'tZacEdge'],
               undated: ['evHoangU', 'evNoneU', 'evZacU', 'tHoangU', 'tNoneU', 'tZacU'] },
  'zac':     { dated: ['evZac', 'evZacEdge', 'tZac', 'tZacEdge'], undated: ['evZacU', 'tZacU'] },
  'hoangdaden': { dated: ['evHoang', 'evHoangCB', 'evHoangEdge', 'tHoang', 'tHoangEdge'], undated: ['evHoangU', 'tHoangU'] },
  'yen':     { dated: ['evYen', 'tYen'], undated: [] },
  '__none__': { dated: ['evNone', 'tNone'], undated: ['evNoneU', 'tNoneU'] },
};
const TITLE = { tZac: 'TASK-ZAC', tHoang: 'TASK-HOANG', tYen: 'TASK-YEN', tNone: 'TASK-NONE', tZacEdge: 'TASK-ZAC-EDGE', tHoangEdge: 'TASK-HOANG-EDGE',
  tZacU: 'TASK-ZAC-UNDATED', tHoangU: 'TASK-HOANG-UNDATED', tNoneU: 'TASK-NONE-UNDATED',
  evZac: 'EV-ZAC', evHoang: 'EV-HOANG', evYen: 'EV-YEN', evNone: 'EV-NONE', evZacEdge: 'EV-ZAC-EDGE', evHoangEdge: 'EV-HOANG-EDGE', evHoangCB: 'EV-HOANG-CB',
  evZacU: 'EV-ZAC-UNDATED', evHoangU: 'EV-HOANG-UNDATED', evNoneU: 'EV-NONE-UNDATED' };

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
  const ctx = vm.createContext({ console, localStorage: ls, Date: MockDate,
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
function setFilter(h, f) { h.run("calMemberFilter = " + JSON.stringify(f) + "; calKindFilter = ''; query = '';"); }
function ids(list) { return [...list.map(i => i.id)].sort(); }
function renderCal(h, mode) {
  h.run("calAnchor = '" + MID + "'; calMode = '" + mode + "'; calSelectedDay = '" + MID + "'; curView = 'tasks'; render();");
  return h.getEl('view').innerHTML;
}
/* Khối Lịch trong view hợp nhất: từ đầu lưới tới hết panel Chưa có ngày
   (khối danh sách việc bên dưới có lọc riêng, nằm ngoài phạm vi này) */
function calSlice(view) { return view.slice(view.indexOf('cal-grid'), view.indexOf('Danh sách việc')); }
function panelSlice(view) { return view.slice(view.indexOf('cal-daypanel'), view.indexOf('cal-undated')); }
function undatedSlice(view) { return view.slice(view.indexOf('cal-undated'), view.indexOf('Danh sách việc')); }

/* ---------- Bề mặt lõi: calBuildItems (nguồn của mọi bề mặt) ---------- */
test('calBuildItems: ma trận người × (dated + undated) khớp kỳ vọng cho cả Việc (assignee) và Sự kiện (eventOwnerId)', () => {
  const h = loadIndex();
  for (const [f, exp] of Object.entries(EXPECT)) {
    setFilter(h, f);
    const b = h.run('calBuildItems()');
    assert.deepEqual(ids(b.dated), exp.dated, 'dated sai ở lọc "' + (f || 'Tất cả') + '"');
    assert.deepEqual(ids(b.undated), exp.undated, 'undated sai ở lọc "' + (f || 'Tất cả') + '"');
    /* Mọi sự kiện còn lại phải thuộc đúng chủ đã chọn (trừ "Tất cả": mọi chủ đều hợp lệ) */
    if (f) for (const it of b.dated.filter(i => i.kind === 'event'))
      assert.equal(h.run('eventOwnerId(S.events.find(e=>e.id===' + JSON.stringify(it.id) + '))'), f === '__none__' ? '' : f, 'sự kiện rò chủ ở lọc ' + f + ': ' + it.id);
  }
});

test('calBuildItems: sự kiện suy chủ từ createdBy (không owner) lọc đúng theo người đó; updatedBy KHÔNG suy chủ', () => {
  const h = loadIndex();
  h.run("S.events.push({id:'evUpdatedOnly', name:'EV-UPDATED-ONLY', updatedBy:'yen', status:'planned', date:'" + MID + "', endDate:'" + MID + "', location:'', note:'', attendees:[], companies:[], leads:[], deals:[]})");
  setFilter(h, 'hoangdaden');
  assert.ok(ids(h.run('calBuildItems()').dated).includes('evHoangCB'), 'sự kiện createdBy=hoangdaden phải hiện khi lọc Hoàng');
  setFilter(h, 'yen');
  assert.ok(!ids(h.run('calBuildItems()').dated).includes('evUpdatedOnly'), 'sự kiện chỉ có updatedBy=yen vẫn là chưa gán — không hiện khi lọc Yến');
  setFilter(h, '__none__');
  assert.ok(ids(h.run('calBuildItems()').dated).includes('evUpdatedOnly'), 'sự kiện chỉ có updatedBy hiện ở "Chưa gán"');
});

/* ---------- Bề mặt timeline Tuần: calWeekSegments trên tập đã lọc ---------- */
test('timeline Tuần: segment sinh từ tập đã lọc theo người — đúng tập + đúng cột cho mục tràn biên tuần', () => {
  const h = loadIndex();
  for (const [f, exp] of Object.entries(EXPECT)) {
    setFilter(h, f);
    const segs = h.run("calWeekSegments(calWeekDates('" + MID + "'), calBuildItems().dated)");
    assert.deepEqual([...new Set(segs.map(s => s.item.id))].sort(), exp.dated, 'segment tuần sai ở lọc "' + (f || 'Tất cả') + '"');
  }
  /* Biên tuần: mục bắt đầu trước tuần / kết thúc sau tuần phủ cột 0..6 và vẫn lọc theo chủ */
  setFilter(h, 'zac');
  const edge = h.run("calWeekSegments(calWeekDates('" + MID + "'), calBuildItems().dated)").filter(s => s.item.id === 'evZacEdge' || s.item.id === 'tZacEdge');
  assert.equal(edge.length, 2, 'lọc Zac: cả việc lẫn sự kiện tràn biên của Zac đều có segment');
  for (const s of edge) { assert.equal(s.colStart, 0); assert.equal(s.colEnd, 6, 'segment tràn biên phải phủ hết tuần'); }
  setFilter(h, 'yen');
  const yenSegs = h.run("calWeekSegments(calWeekDates('" + MID + "'), calBuildItems().dated)");
  assert.ok(yenSegs.every(s => s.colStart === 2 && s.colEnd === 2), 'lọc Yến: 2 mục 1 ngày ở Thứ 4 (cột 2)');
  assert.ok(!yenSegs.some(s => s.item.id === 'evZacEdge' || s.item.id === 'evHoangEdge'), 'lọc Yến: không segment tràn biên của người khác');
});

/* ---------- Bề mặt lưới Tháng + Tuần khi render ---------- */
test('render Tháng + Tuần: lưới chỉ chứa segment của đúng người đã chọn (việc + sự kiện)', () => {
  const h = loadIndex();
  for (const mode of ['month', 'week']) {
    for (const [f, exp] of Object.entries(EXPECT)) {
      setFilter(h, f);
      const grid = calSlice(renderCal(h, mode));
      for (const id of exp.dated) assert.ok(grid.includes(TITLE[id]), mode + '/lọc ' + (f || 'Tất cả') + ': lưới thiếu ' + TITLE[id]);
      for (const id of Object.keys(TITLE)) {
        if (exp.dated.includes(id) || exp.undated.includes(id)) continue;
        assert.ok(!grid.includes(TITLE[id]), mode + '/lọc ' + (f || 'Tất cả') + ': lưới RÒ ' + TITLE[id]);
      }
    }
  }
});

/* ---------- Bề mặt panel ngày + số đếm ---------- */
test('panel chi tiết ngày: liệt kê đúng mục của người đã chọn + badge đếm khớp (mọi mục dated đều chạm ngày giữa)', () => {
  const h = loadIndex();
  for (const [f, exp] of Object.entries(EXPECT)) {
    setFilter(h, f);
    const view = renderCal(h, 'month');
    const panel = panelSlice(view);
    const m = panel.match(/<span class="count-badge">(\d+) mục<\/span>/);
    assert.ok(m, 'panel phải có badge đếm');
    assert.equal(Number(m[1]), exp.dated.length, 'badge panel ngày sai ở lọc ' + (f || 'Tất cả'));
    for (const id of exp.dated) assert.ok(panel.includes(TITLE[id]), 'panel thiếu ' + TITLE[id] + ' ở lọc ' + f);
    for (const id of Object.keys(TITLE)) {
      if (exp.dated.includes(id) || exp.undated.includes(id)) continue;
      assert.ok(!panel.includes(TITLE[id]), 'panel RÒ ' + TITLE[id] + ' ở lọc ' + f);
    }
  }
});

/* ---------- Bề mặt panel "Chưa có ngày" + badge ---------- */
test('panel Chưa có ngày: việc + sự kiện chưa có ngày lọc theo người/ chủ như mục có ngày + badge khớp', () => {
  const h = loadIndex();
  for (const [f, exp] of Object.entries(EXPECT)) {
    setFilter(h, f);
    const view = renderCal(h, 'month');
    const un = undatedSlice(view);
    const m = un.match(/Chưa có ngày <span class="count-badge">(\d+)<\/span>/);
    assert.ok(m, 'panel Chưa có ngày phải có badge đếm');
    assert.equal(Number(m[1]), exp.undated.length, 'badge Chưa có ngày sai ở lọc ' + (f || 'Tất cả'));
    for (const id of exp.undated) assert.ok(un.includes(TITLE[id]), 'panel Chưa có ngày thiếu ' + TITLE[id] + ' ở lọc ' + f);
    for (const id of ['tZacU', 'tHoangU', 'tNoneU', 'evZacU', 'evHoangU', 'evNoneU']) {
      if (exp.undated.includes(id)) continue;
      assert.ok(!un.includes(TITLE[id]), 'panel Chưa có ngày RÒ ' + TITLE[id] + ' ở lọc ' + f);
    }
  }
});

/* ---------- Bề mặt nhãn tràn "+N nữa" ---------- */
test('nhãn tràn "+N nữa" tính trên tập ĐÃ lọc: ngày chật đổi số ẩn đúng theo người', () => {
  /* 5 việc của Zac + 1 sự kiện Zac + 1 sự kiện Hoàng, tất cả cùng 1 ngày:
     Tất cả = 7 mục -> ẩn 4; Zac = 6 mục -> ẩn 3; Hoàng = 1 -> không nhãn;
     Chưa gán = 0 -> không nhãn (ô Tháng hiện tối đa 3 làn) */
  const st = fixtureState();
  st.tasks = Array.from({ length: 5 }, (_, i) => ({ id: 'ovT' + i, title: 'OV-T' + i, assignee: 'zac', due: '', startDate: MID, dueDate: MID, done: false, overdue: false }));
  st.events = [
    { id: 'ovEvZac', name: 'OV-EV-ZAC', owner: 'zac', status: 'planned', date: MID, endDate: MID, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    { id: 'ovEvHoang', name: 'OV-EV-HOANG', owner: 'hoangdaden', status: 'planned', date: MID, endDate: MID, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
  ];
  const h = loadIndex(st);
  const labelFor = f => {
    setFilter(h, f);
    const view = renderCal(h, 'month');
    const m = calSlice(view).match(/\+(\d+) nữa/);
    return m ? Number(m[1]) : 0;
  };
  assert.equal(labelFor(''), 4, 'Tất cả: 7 mục, hiện 3 làn -> +4 nữa');
  assert.equal(labelFor('zac'), 3, 'Zac: 6 mục của Zac -> +3 nữa (sự kiện Hoàng không tính vào số ẩn)');
  assert.equal(labelFor('hoangdaden'), 0, 'Hoàng: chỉ 1 sự kiện -> không tràn');
  assert.equal(labelFor('__none__'), 0, 'Chưa gán: 0 mục -> không tràn');
  /* Bấm nhãn (handler riêng) mở panel liệt kê đúng tập đã lọc */
  setFilter(h, 'zac');
  h.run("calAnchor = '" + MID + "'; calMode = 'month'; calSelectedDay = ''; curView = 'tasks'; render();");
  const lbl = h.getEl('view').innerHTML.match(/<span class="cal-more"([^>]*)>/);
  assert.ok(lbl, 'lọc Zac vẫn phải có nhãn tràn');
  const oc = /onclick="([^"]*)"/.exec(lbl[1])[1];
  h.run("(function(event){ " + oc + " })({ stopPropagation(){} })");
  const panel = panelSlice(h.getEl('view').innerHTML);
  assert.ok(panel.includes('6 mục'), 'panel mở từ nhãn ở lọc Zac phải đếm 6 mục');
  assert.ok(!panel.includes('OV-EV-HOANG'), 'panel mở từ nhãn ở lọc Zac không được chứa sự kiện của Hoàng');
});

/* ---------- Đổi người liên tục + vai trò + phạm vi Sự kiện không lan sang Lịch ---------- */
test('đổi người liên tục A -> B -> Tất cả -> Chưa gán: tập mục đổi đúng từng bước, không rò tồn dư', () => {
  const h = loadIndex();
  const seq = ['zac', 'hoangdaden', '', '__none__', 'yen', ''];
  for (const f of seq) {
    h.run('calSetMember(' + JSON.stringify(f) + ')');
    const b = h.run('calBuildItems()');
    assert.deepEqual(ids(b.dated), EXPECT[f].dated, 'sau calSetMember(' + (f || 'Tất cả') + ') dated phải khớp kỳ vọng');
    assert.deepEqual(ids(b.undated), EXPECT[f].undated, 'sau calSetMember(' + (f || 'Tất cả') + ') undated phải khớp kỳ vọng');
  }
});

test('vai Admin/BD KHÔNG đổi semantics lọc người của Lịch; phạm vi Của tôi của view Sự kiện KHÔNG áp lên Lịch', () => {
  /* Lưu ý tầng dưới: visibleTasks() có privacy việc sẵn có (BD chỉ thấy
     việc của mình — đợt 9/11, NGOÀI phạm vi đợt này, giữ nguyên). Vì vậy
     so sánh xuyên vai làm trên (a) lọc đúng người đang đăng nhập (BD
     thấy đủ việc của chính mình) và (b) phần SỰ KIỆN của mọi lựa chọn
     (sự kiện không có privacy theo vai ở tầng dưới). */
  const h = loadIndex();
  const loginAs = (memberId, role) => { h.ctx.SavaAuth = { currentUser: () => ({ memberId, role, name: memberId }) }; };
  setFilter(h, 'hoangdaden');
  loginAs('zac', 'admin');
  const asAdmin = ids(h.run('calBuildItems()').dated);
  loginAs('hoangdaden', 'bd');
  const asBD = ids(h.run('calBuildItems()').dated);
  assert.deepEqual(asAdmin, EXPECT.hoangdaden.dated);
  assert.deepEqual(asBD, EXPECT.hoangdaden.dated, 'lọc Hoàng: Admin và chính Hoàng (BD) cho cùng một tập — semantics lọc người không đổi theo vai');
  /* Phần sự kiện của lọc Yến giống hệt nhau ở cả hai vai */
  setFilter(h, 'yen');
  loginAs('zac', 'admin');
  const evAsAdmin = ids(h.run('calBuildItems()').dated).filter(id => id.startsWith('ev'));
  loginAs('hoangdaden', 'bd');
  const evAsBD = ids(h.run('calBuildItems()').dated).filter(id => id.startsWith('ev'));
  assert.deepEqual(evAsAdmin, ['evYen']);
  assert.deepEqual(evAsBD, evAsAdmin, 'lọc sự kiện theo chủ không đổi theo vai người đăng nhập');
  /* Phạm vi Sự kiện = "Của tôi" (của Hoàng) không được thu hẹp Lịch khi Lịch đang chọn "Tất cả".
     Đăng nhập Admin để tầng privacy việc không can thiệp vào phép so sánh này. */
  loginAs('zac', 'admin');
  h.run("eventScopeFilter = 'mine';");
  setFilter(h, '');
  assert.deepEqual(ids(h.run('calBuildItems()').dated), EXPECT[''].dated, 'Lịch chọn Tất cả vẫn thấy mọi việc + sự kiện dù view Sự kiện đang ở "Của tôi"');
});

/* ---------- AND với trục loại ---------- */
test('AND loại × người: Chỉ Sự kiện + 1 người -> chỉ sự kiện của người đó; Chỉ Việc + Chưa gán -> chỉ việc chưa gán', () => {
  const h = loadIndex();
  h.run("calKindFilter = 'event'; calMemberFilter = 'hoangdaden'; query = '';");
  let b = h.run('calBuildItems()');
  assert.deepEqual(ids(b.dated), ['evHoang', 'evHoangCB', 'evHoangEdge']);
  assert.deepEqual(ids(b.undated), ['evHoangU']);
  h.run("calKindFilter = 'task'; calMemberFilter = '__none__';");
  b = h.run('calBuildItems()');
  assert.deepEqual(ids(b.dated), ['tNone']);
  assert.deepEqual(ids(b.undated), ['tNoneU']);
});

/* ---------- Tĩnh: nguồn lọc + nhãn UI ---------- */
test('tĩnh: calBuildItems lọc sự kiện qua eventOwnerId; UI không còn câu "lọc người chỉ áp cho Việc"; nhãn lọc ghi "Theo người"', () => {
  const idx = read('index.html');
  const evLoop = idx.slice(idx.indexOf('eventsList().forEach'), idx.indexOf('dated.sort'));
  assert.ok(evLoop.includes('eventOwnerId(ev)'), 'vòng lặp sự kiện trong calBuildItems phải xét chủ qua eventOwnerId');
  assert.ok(evLoop.includes('calMemberFilter'), 'vòng lặp sự kiện phải xét calMemberFilter');
  assert.ok(!idx.includes('lọc người chỉ áp cho Việc'), 'không còn câu mô tả semantics cũ trong legend');
  assert.ok(!idx.includes('không áp cho Sự kiện — sự kiện xem chung'), 'không còn comment semantics cũ ở vòng lặp sự kiện');
  assert.ok(idx.includes('Theo người:'), 'nhãn bộ lọc phải là "Theo người" (áp cả việc + sự kiện)');
  assert.ok(idx.includes('aria-label="Lọc việc và sự kiện theo người"'), 'aria-label của ô lọc phải nêu cả việc + sự kiện');
});
