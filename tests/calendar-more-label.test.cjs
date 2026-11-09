/* Nhãn tràn "+N nữa" ở ô ngày chật trong lưới Lịch (màn Việc hợp nhất):
   - TRƯỚC SỬA: nhãn render là <span class="cal-more"> TRẦN — không có
     handler riêng nào; việc mở panel ngày chỉ dựa vào click NỔI BỌT lên
     onclick của ô cha (.cal-day). Bấm vào chính nhãn được báo là không
     có phản ứng / không mở được danh sách đầy đủ của ngày.
   - SAU SỬA: nhãn có handler RIÊNG onclick="event.stopPropagation();
     calOpenDayMore('<iso>')" — stopPropagation theo đúng mẫu dải
     calSegHTML (tránh chạy trùng handler ô cha), calOpenDayMore mở
     panel chi tiết của ĐÚNG ngày đó qua calOpenDay (panel liệt kê MỌI
     mục chạm ngày, kể cả mục bị ẩn khỏi ô) rồi cuộn panel vào tầm nhìn
     (panel nằm dưới toàn bộ lưới tháng). CSS .cal-more có cursor:pointer
     + hover gạch chân để ra dáng bấm được.
   - KHÔNG đổi: bấm ô ngày vẫn mở panel (calOpenDay ở div cha), bấm dải
     việc/sự kiện vẫn mở đúng mục đó, tạo nhanh trong panel vẫn điền sẵn
     ngày đang chọn, chế độ Tuần (maxLanes 99) không sinh nhãn tràn. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dmyOf(isoStr) { return isoStr.split('-').reverse().join('-'); }
function fixtureState() {
  const today = iso(0);
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [], games: [], deals: [], leads: [], activities: [], verticals: [],
    events: [
      { id: 'evToday', name: 'Sự Kiện Hôm Nay', status: 'planned', date: today, endDate: today, location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
    /* 5 việc + 1 sự kiện cùng hôm nay: ô Tháng chỉ hiện 3 làn -> 3 mục ẩn, nhãn "+3 nữa" */
    tasks: Array.from({ length: 5 }, (_, i) => ({ id: 'bulk' + (i + 1), title: 'Việc Dồn ' + (i + 1), assignee: 'zac', due: '', startDate: today, dueDate: today, done: false, overdue: false, createdAt: today + 'T01:00:00.000Z' })),
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
/* Trích onclick RIÊNG của nhãn .cal-more trong HTML đã render (null nếu nhãn không có handler riêng như bản cũ) */
function moreLabelOnclick(view) {
  const m = view.match(/<span class="cal-more"([^>]*)>([^<]*)<\/span>/);
  if (!m) return null;
  const oc = /onclick="([^"]*)"/.exec(m[1]);
  return { attrs: m[1], text: m[2], onclick: oc ? oc[1] : null };
}

test('nhãn "+N nữa": có handler RIÊNG gọi calOpenDayMore đúng ngày + stopPropagation; CSS ra dáng bấm được', () => {
  const h = loadIndex();
  const today = iso(0);
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = ''; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  const label = moreLabelOnclick(view);
  assert.ok(label, 'ngày có 6 mục mà ô Tháng chỉ hiện 3 làn thì phải có nhãn .cal-more');
  assert.equal(label.text, '+3 nữa', '6 mục - 3 làn hiện = +3 nữa');
  assert.ok(label.onclick, 'nhãn phải có onclick RIÊNG (bản cũ là span trần, bấm vào nhãn không có handler nào chạy)');
  assert.ok(label.onclick.includes('stopPropagation()'), 'handler nhãn phải stopPropagation để không chạy trùng handler ô cha (mẫu calSegHTML)');
  assert.ok(label.onclick.includes("calOpenDayMore('" + today + "')"), 'handler nhãn phải mở panel của ĐÚNG ngày chứa nhãn: ' + label.onclick);
  const idx = read('index.html');
  assert.match(idx, /\.cal-more \{[^}]*cursor:pointer;/, '.cal-more phải có cursor:pointer');
  assert.ok(idx.includes('function calOpenDayMore(iso)'), 'phải có helper calOpenDayMore trong index.html');
});

test('bấm vào CHÍNH nhãn (chỉ chạy handler riêng của nhãn): panel mở đúng ngày và liệt kê ĐỦ 100% mục, kể cả 3 mục bị ẩn khỏi ô', () => {
  const h = loadIndex();
  const today = iso(0);
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = ''; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  /* Ô lưới chỉ hiện 3 làn: đúng 3 dải hiện trong lưới, các mục còn lại bị ẩn khỏi ô */
  const gridSegs = (view.slice(0, view.indexOf('cal-undated')).match(/class="cal-seg /g) || []).length;
  assert.equal(gridSegs, 3, 'lưới Tháng chỉ được hiện 3 làn ở tuần chứa ngày chật (kiểm chứng tiền đề tràn ô)');
  const label = moreLabelOnclick(view);
  assert.ok(label && label.onclick, 'phải trích được handler riêng của nhãn');
  /* Mô phỏng bấm vào nhãn: CHỈ handler của nhãn chạy (event stub có stopPropagation như trình duyệt thật) */
  h.run("(function(event){ " + label.onclick + " })({ stopPropagation(){} })");
  assert.equal(h.run('calSelectedDay'), today, 'bấm nhãn phải chọn đúng ngày của nhãn');
  const after = h.getEl('view').innerHTML;
  assert.ok(after.includes('cal-daypanel'), 'bấm nhãn phải mở panel chi tiết ngày');
  const panel = after.slice(after.indexOf('cal-daypanel'), after.indexOf('cal-undated'));
  assert.ok(panel.includes('6 mục'), 'panel phải báo đủ 6 mục của ngày');
  for (let i = 1; i <= 5; i++) assert.ok(panel.includes('Việc Dồn ' + i), 'panel thiếu việc bị ẩn khỏi ô: Việc Dồn ' + i);
  assert.ok(panel.includes('Sự Kiện Hôm Nay'), 'panel thiếu sự kiện của ngày');
});

test('không phá hành vi cũ: bấm Ô NGÀY vẫn mở panel; bấm DẢI việc vẫn mở sửa việc đúng mục (stopPropagation như cũ)', () => {
  const h = loadIndex();
  const today = iso(0);
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = ''; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  const cell = view.match(new RegExp('<div class="cal-day[^"]*" onclick="([^"]*' + today + '[^"]*)"'));
  assert.ok(cell && cell[1].includes("calOpenDay('" + today + "')"), 'ô ngày phải giữ onclick calOpenDay như cũ');
  h.run(cell[1]);
  assert.equal(h.run('calSelectedDay'), today, 'bấm ô ngày vẫn chọn đúng ngày');
  assert.ok(h.getEl('view').innerHTML.includes('cal-daypanel'), 'bấm ô ngày vẫn mở panel');
  const seg = view.match(/<div class="cal-seg [^"]*"[^>]*onclick="([^"]*)"[^>]*>Việc Dồn 1<\/div>/);
  assert.ok(seg && seg[1].includes("editTask('bulk1')"), 'dải việc phải giữ onclick editTask đúng mục');
  assert.ok(seg[1].includes('stopPropagation()'), 'dải việc phải giữ stopPropagation như cũ');
});

test('tạo nhanh trong panel mở từ nhãn vẫn điền sẵn đúng ngày đang chọn (việc + sự kiện)', () => {
  const h = loadIndex();
  const today = iso(0);
  h.run("calAnchor = todayStr(); calMode = 'month'; calSelectedDay = ''; curView = 'tasks'; render();");
  const label = moreLabelOnclick(h.getEl('view').innerHTML);
  h.run("(function(event){ " + label.onclick + " })({ stopPropagation(){} })");
  h.run('calNewTask();');
  let form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_tstartDate" type="text" placeholder="dd-mm-yyyy" value="' + dmyOf(today) + '"'), 'việc tạo nhanh từ panel (mở qua nhãn): Ngày bắt đầu điền sẵn ngày của nhãn');
  assert.ok(form.includes('id="e_tdueDate" type="text" placeholder="dd-mm-yyyy" value="' + dmyOf(today) + '"'), 'việc tạo nhanh từ panel (mở qua nhãn): Hạn điền sẵn ngày của nhãn');
  h.run('calNewEvent();');
  form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('value="' + dmyOf(today) + '"'), 'sự kiện tạo nhanh từ panel (mở qua nhãn): ngày điền sẵn ngày của nhãn');
});

test('chế độ Tuần không sinh nhãn tràn (maxLanes 99) và nhãn chỉ nằm trong calWeekHTML dùng chung Tháng/Tuần', () => {
  const h = loadIndex();
  h.run("calAnchor = todayStr(); calMode = 'week'; calSelectedDay = ''; curView = 'tasks'; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok(!view.includes('cal-more'), 'chế độ Tuần hiện mọi làn nên không được có nhãn +N nữa');
  const idx = read('index.html');
  assert.equal((idx.match(/calOpenDayMore\('/g) || []).length, 1, 'chỉ 1 điểm render nhãn tràn (trong calWeekHTML dùng chung cho cả Tháng và Tuần)');
  assert.ok(!read('mkt.html').includes('cal-more') && !read('publishing.html').includes('cal-more'), 'mkt/publishing không có lịch nên không có nhãn tràn này');
});
