/* Vòng đời 2 giai đoạn cho Sự kiện (đợt 3/11) + nút header "+ Thêm deal":
   - Trạng thái planned/attended/cancelled lưu qua legacy_extra (ev.status
     phẳng trên object sự kiện — EVENT_KNOWN của adapter cố ý không chứa
     nó, xem test adapter round-trip ở file này). Sự kiện cũ KHÔNG có
     status: eventStatusKey SUY theo ngày (ISO đã qua -> attended, còn
     lại -> planned), form sửa chọn sẵn trạng thái đã suy nên lần sửa đầu
     ghi status thật; nút chuyển trạng thái ở drawer cũng ghi thật.
   - Field mới qua legacy_extra: endDate (mặc định = ngày bắt đầu khi
     lưu), eventUrl, line, reportMet/reportOutcome/reportNext/reportLinks.
   - View Sự kiện chia 3 nhóm theo vòng đời (Sắp tới gần nhất trước + nhãn
     đếm ngày + gợi ý quá hạn; Đã tham dự mới nhất trước; Đã huỷ thu gọn
     mặc định), phân trang TRONG từng nhóm như Lead Block.
   - Drawer: chip trạng thái + nút chuyển trạng thái; khối liên kết đổi
     nhãn theo giai đoạn; khối Báo cáo CHỈ attended, view-first, chuyển
     sang attended thì tự mở chế độ sửa báo cáo. Planned: báo cáo hiện
     dạng ghi chú "sẽ nhập sau khi tham dự".
   - Header: nút "+ Thêm deal" là nút CỐ ĐỊNH của toolbar — render() ẩn
     riêng ở view Sự kiện (id headerAddDealBtn), view khác giữ nguyên.
   - Import: ô "Gắn lô vào sự kiện" ở bước Thiết lập lô; planner đặt
     plan.eventId + source "Sự kiện" cho lead; impApply gắn entity do lô
     TẠO vào event qua đúng mảng liên kết của event; gỡ lô gỡ sạch liên
     kết đó qua unlink sẵn có; danh sách lô hiện tên sự kiện (listBatches
     suy từ liên kết thật của entity mang marker lô). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* dd-mm-yyyy: định dạng HIỂN THỊ + NHẬP mới (Zac chốt 4/11/2026); dữ liệu lưu vẫn ISO (iso()). */
function dmy(offsetDays) { return iso(offsetDays).split('-').reverse().join('-'); }
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
    ],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: '', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'qualified', note: '', when: '2026-10-01', mainContact: false }],
    tasks: [], activities: [], verticals: [],
    events: [
      { id: 'evOverdue', name: 'Expo Quá Hạn', status: 'planned', date: iso(-3), location: 'SECC', note: '', attendees: ['zac'], companies: [], leads: [], deals: [] },
      { id: 'evToday', name: 'Expo Hôm Nay', status: 'planned', date: iso(0), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evNear', name: 'Expo Gần', status: 'planned', date: iso(2), endDate: iso(4), location: 'GEM', note: '', attendees: ['zac'], companies: ['c1'], leads: [], deals: [] },
      { id: 'evFar', name: 'Expo Xa', status: 'planned', date: iso(10), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evLegacyFuture', name: 'Expo Cũ Tương Lai', date: iso(30), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evAttNew', name: 'Expo Đã Đi Gần', status: 'attended', date: iso(-1), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evAttOld', name: 'Expo Đã Đi Xa', status: 'attended', date: iso(-10), endDate: iso(-8), location: 'SECC', note: '', attendees: ['linh'], companies: ['c1'], leads: ['l1'], deals: ['d1'], reportMet: 'Anh Một (Công ty Một)', reportOutcome: 'Đối tác gửi build', reportNext: 'Hẹn demo tuần sau', reportLinks: [{ label: 'Biên bản', url: 'https://drive.google.com/file/abc' }] },
      { id: 'evLegacyPast', name: 'Expo Cũ Đã Qua', date: iso(-30), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evCancelled', name: 'Expo Đã Huỷ', status: 'cancelled', date: iso(5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
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
  const listeners = {};
  const confirmMsgs = [];
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: msg => { confirmMsgs.push(String(msg)); return true; },
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, confirmMsgs, run: code => vm.runInContext(code, ctx) };
}
function loginAsZac(h) { h.ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) }; }
const evById = (h, id) => h.run(`S.events.find(e=>e.id==='${id}')`);

/* ---------- Suy trạng thái + khoảng ngày + đếm ngày ---------- */
test('eventStatusKey: có status thì dùng status; chưa có thì suy theo ngày ISO (qua -> attended, chưa tới/hôm nay -> planned, chữ tự do -> planned)', () => {
  const h = loadIndex();
  assert.equal(h.run("eventStatusKey(S.events.find(e=>e.id==='evNear'))"), 'planned');
  assert.equal(h.run("eventStatusKey(S.events.find(e=>e.id==='evAttOld'))"), 'attended');
  assert.equal(h.run("eventStatusKey(S.events.find(e=>e.id==='evCancelled'))"), 'cancelled');
  assert.equal(h.run("eventStatusKey(S.events.find(e=>e.id==='evLegacyPast'))"), 'attended', 'sự kiện cũ không status, ngày đã qua -> attended');
  assert.equal(h.run("eventStatusKey(S.events.find(e=>e.id==='evLegacyFuture'))"), 'planned', 'sự kiện cũ không status, ngày chưa tới -> planned');
  assert.equal(h.run("eventStatusKey({date:'Tuần sau'})"), 'planned', 'ngày chữ tự do không suy được -> planned');
  assert.equal(h.run("eventStatusKey({status:'lạ', date:'" + iso(-5) + "'})"), 'attended', 'status lạ -> rơi về suy theo ngày');
  assert.equal(evById(h, 'evLegacyPast').status, undefined, 'suy trạng thái KHÔNG ghi đè vào bản ghi');
});

test('eventDateRangeText + eventDaysInfo: khoảng ngày, Hôm nay / còn X ngày / quá hạn', () => {
  const h = loadIndex();
  assert.equal(h.run("eventDateRangeText(S.events.find(e=>e.id==='evNear'))"), dmy(2) + ' – ' + dmy(4));
  assert.equal(h.run("eventDateRangeText(S.events.find(e=>e.id==='evToday'))"), dmy(0), 'không có endDate -> chỉ hiện ngày bắt đầu');
  assert.equal(h.run("eventDaysInfo(S.events.find(e=>e.id==='evToday')).label"), 'Hôm nay');
  assert.equal(h.run("eventDaysInfo(S.events.find(e=>e.id==='evNear')).label"), 'còn 2 ngày');
  const od = h.run("eventDaysInfo(S.events.find(e=>e.id==='evOverdue'))");
  assert.equal(od.overdue, true); assert.equal(od.days, -3);
  assert.equal(h.run("eventDaysInfo({date:'Tuần sau'}).days"), null);
});

/* ---------- View: chia nhóm vòng đời ---------- */
test('vEvents: 3 nhóm vòng đời — Sắp tới xếp ngày tăng dần + nhãn đếm ngày + gợi ý quá hạn; Đã tham dự mới nhất trước; Đã huỷ thu gọn mặc định không hiện thẻ', () => {
  const h = loadIndex();
  h.run('curView = "events"; render();');
  const view = h.getEl('view').innerHTML;
  for (const g of ['data-event-status="planned"', 'data-event-status="attended"', 'data-event-status="cancelled"']) assert.ok(view.includes(g), 'thiếu nhóm ' + g);
  const pos = n => view.indexOf(n);
  assert.ok(pos('Expo Quá Hạn') < pos('Expo Hôm Nay') && pos('Expo Hôm Nay') < pos('Expo Gần') && pos('Expo Gần') < pos('Expo Xa') && pos('Expo Xa') < pos('Expo Cũ Tương Lai'), 'nhóm Sắp tới: quá hạn -> hôm nay -> gần -> xa -> cũ tương lai');
  assert.ok(pos('Expo Đã Đi Gần') < pos('Expo Đã Đi Xa') && pos('Expo Đã Đi Xa') < pos('Expo Cũ Đã Qua'), 'nhóm Đã tham dự: mới nhất trước, sự kiện cũ suy attended nằm cùng nhóm');
  assert.ok(view.includes('còn 2 ngày') && view.includes('Hôm nay'), 'nhãn đếm ngày ở nhóm Sắp tới');
  assert.ok(view.includes('đã qua ngày — cập nhật trạng thái?'), 'planned đã qua ngày hiện gợi ý cập nhật trạng thái');
  assert.ok(view.includes(dmy(2) + ' – ' + dmy(4)), 'thẻ hiện khoảng ngày bắt đầu – kết thúc');
  assert.ok(view.includes('1 công ty'), 'thẻ hiện số liên kết');
  const cancelPos = view.indexOf('data-event-status="cancelled"');
  const cancelTag = view.slice(view.lastIndexOf('<section', cancelPos), view.indexOf('>', cancelPos) + 1);
  assert.ok(cancelTag.includes('lead-status-block--collapsed'), 'nhóm Đã huỷ thu gọn mặc định: ' + cancelTag);
  assert.ok(!view.slice(cancelPos).includes('Expo Đã Huỷ'), 'đang thu gọn -> thẻ sự kiện đã huỷ không hiện');
  assert.ok(view.includes('openEventForm()'), 'nút + Thêm sự kiện vẫn ở đầu danh sách');
});

test('vEvents: phân trang TRONG từng nhóm (12 sự kiện planned -> nhóm Sắp tới có Trang 1/2)', () => {
  const st = fixtureState();
  st.events = Array.from({ length: 12 }, (_, i) => ({ id: 'evp' + i, name: 'Planned ' + String(i).padStart(2, '0'), status: 'planned', date: iso(i + 1), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] }));
  const h = loadIndex(st);
  h.run('curView = "events"; render();');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Trang 1/2 · Đang hiện 1–10 / 12 sự kiện'), 'pager riêng của nhóm Sắp tới: ' + view.slice(0, 0));
  assert.ok(view.includes('Planned 00') && !view.includes('Planned 11'), 'trang 1 chỉ hiện 10 sự kiện đầu của nhóm');
});

/* ---------- Form sự kiện: field mới + ghi status lần sửa đầu ---------- */
test('openEventForm/saveEvent: trạng thái + ngày kết thúc (mặc định = ngày bắt đầu) + link + mảng; sự kiện cũ ghi status thật ở lần sửa đầu', () => {
  const h = loadIndex(); loginAsZac(h);
  h.run('openEventForm()');
  let form = h.getEl('editBox').innerHTML;
  for (const id of ['e_evstatus', 'e_evenddate', 'e_evurl', 'e_evline']) assert.ok(form.includes('id="' + id + '"'), 'form thiếu ô ' + id);
  assert.ok(/<option value="planned" selected>/.test(form), 'tạo mới mặc định trạng thái Sắp tới');
  h.getEl('e_evname').value = 'Expo Mới';
  h.getEl('e_evstatus').value = 'planned';
  h.getEl('e_evdate').value = dmy(7);
  h.getEl('e_evenddate').value = '';
  h.getEl('e_evlocation').value = 'SECC';
  h.getEl('e_evurl').value = 'https://expo.example.com';
  h.getEl('e_evline').value = 'metaverse';
  h.getEl('e_evnote').value = '';
  h.run('saveEvent(null)');
  const ev = h.run("S.events.find(e=>e.name==='Expo Mới')");
  assert.equal(ev.status, 'planned');
  assert.equal(ev.endDate, iso(7), 'ngày kết thúc để trống -> mặc định = ngày bắt đầu');
  assert.equal(ev.eventUrl, 'https://expo.example.com');
  assert.equal(ev.line, 'metaverse');
  /* Sửa sự kiện cũ (chưa có status): form chọn sẵn trạng thái đã suy, lưu là ghi thật */
  h.run("openEventForm('evLegacyPast')");
  form = h.getEl('editBox').innerHTML;
  assert.ok(/<option value="attended" selected>/.test(form), 'sự kiện cũ đã qua ngày: form chọn sẵn Đã tham dự');
  h.getEl('e_evstatus').value = 'attended';
  h.getEl('e_evenddate').value = dmy(-28);
  h.run("saveEvent('evLegacyPast')");
  assert.equal(evById(h, 'evLegacyPast').status, 'attended', 'lần sửa đầu ghi status thật vào bản ghi cũ');
  assert.equal(evById(h, 'evLegacyPast').endDate, iso(-28));
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.events.find(e => e.id === 'evLegacyPast').status, 'attended', 'status ghi xuống kho qua save()');
});

/* ---------- Drawer: chuyển trạng thái + báo cáo ---------- */
test('drawer planned: chip trạng thái + 2 nút chuyển + nhãn "Mục tiêu muốn gặp" + báo cáo dạng sẽ-nhập-sau (không có ô nhập)', () => {
  const h = loadIndex();
  h.run("openEvent('evNear')");
  const d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Sắp tới'), 'header drawer có chip trạng thái');
  assert.ok(d.includes("setEventStatus('evNear','attended')") && d.includes('Đánh dấu đã tham dự'), 'có nút Đánh dấu đã tham dự');
  assert.ok(d.includes("setEventStatus('evNear','cancelled')") && d.includes('Đánh dấu đã huỷ'), 'có nút Đánh dấu đã huỷ (phụ)');
  assert.ok(d.includes('Mục tiêu muốn gặp'), 'khối liên kết ở giai đoạn planned mang nhãn Mục tiêu muốn gặp');
  assert.ok(d.includes('sẽ nhập sau khi tham dự'), 'planned: khối báo cáo hiện dạng sẽ nhập sau khi tham dự');
  assert.ok(!d.includes('e_rp_met'), 'planned: không có ô nhập báo cáo');
});

test('setEventStatus sang attended: ghi status thật + tự mở sửa báo cáo; saveEventReport lưu 3 mục + link, quay về xem view-first', () => {
  const h = loadIndex();
  h.run("setEventStatus('evNear','attended')");
  assert.equal(evById(h, 'evNear').status, 'attended');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.events.find(e => e.id === 'evNear').status, 'attended', 'chuyển trạng thái ghi xuống kho');
  let d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('id="e_rp_met"'), 'chuyển attended xong TỰ mở khối báo cáo ở chế độ sửa');
  assert.ok(d.includes('Đã gặp / Data thu thập'), 'khối liên kết đổi nhãn theo giai đoạn attended');
  assert.ok(d.includes('Đã gắn: 1 công ty · 0 lead · 0 deal'), 'dòng tổng số lượng từng loại đã gắn');
  h.getEl('e_rp_met').value = 'Anh Một — Công ty Một';
  h.getEl('e_rp_outcome').value = 'Chốt demo';
  h.getEl('e_rp_next').value = 'Gửi báo giá';
  h.getEl('e_rp_links').value = 'Biên bản | https://drive.google.com/file/xyz\nhttps://drive.google.com/file/no-label';
  h.run("saveEventReport('evNear')");
  const ev = evById(h, 'evNear');
  assert.equal(ev.reportMet, 'Anh Một — Công ty Một');
  assert.equal(ev.reportOutcome, 'Chốt demo');
  assert.equal(ev.reportNext, 'Gửi báo giá');
  assert.deepEqual(JSON.parse(JSON.stringify(ev.reportLinks)), [{ label: 'Biên bản', url: 'https://drive.google.com/file/xyz' }, { label: '', url: 'https://drive.google.com/file/no-label' }]);
  d = h.getEl('drawer').innerHTML;
  assert.ok(!d.includes('e_rp_met') && d.includes('Chốt demo') && d.includes('https://drive.google.com/file/xyz'), 'lưu xong quay về chế độ XEM (view-first), hiện nội dung + link');
  assert.ok(d.includes("startEventReportEdit('evNear')"), 'chế độ xem có nút Sửa báo cáo');
  h.run("startEventReportEdit('evNear')");
  assert.ok(h.getEl('drawer').innerHTML.includes('id="e_rp_met"'), 'bấm Sửa báo cáo -> hiện ô nhập');
  h.run("cancelEventReportEdit('evNear')");
  assert.ok(!h.getEl('drawer').innerHTML.includes('e_rp_met'), 'Hủy -> quay về xem, bỏ thay đổi');
});

test('drawer attended có sẵn báo cáo: hiện dạng xem (3 mục + link bấm được); setEventStatus sang cancelled ghi thật', () => {
  const h = loadIndex();
  h.run("openEvent('evAttOld')");
  const d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Đã tham dự') && d.includes('Đối tác gửi build') && d.includes('Hẹn demo tuần sau'), 'báo cáo đã lưu hiện ở chế độ xem');
  assert.ok(d.includes('href="https://drive.google.com/file/abc"'), 'link đính kèm là link bấm được');
  assert.ok(!d.includes('Đánh dấu đã tham dự'), 'attended không còn nút chuyển attended');
  h.run("setEventStatus('evNear','cancelled')");
  assert.equal(evById(h, 'evNear').status, 'cancelled');
  h.run("openEvent('evNear')");
  assert.ok(h.getEl('drawer').innerHTML.includes("setEventStatus('evNear','planned')"), 'sự kiện đã huỷ có nút chuyển về Sắp tới');
});

/* ---------- Header: bỏ nút "+ Thêm deal" riêng ở view Sự kiện ---------- */
test('header: nút + Thêm deal có id headerAddDealBtn; render ẩn nó CHỈ ở view Sự kiện, view khác hiện nguyên', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('id="headerAddDealBtn"') && idx.includes('onclick="openAdd()"'), 'nút header vẫn là nút mở form deal, chỉ thêm id để ẩn theo view');
  const h = loadIndex();
  h.run('curView = "events"; render();');
  assert.equal(h.getEl('headerAddDealBtn').style.display, 'none', 'view Sự kiện: nút header Thêm deal bị ẩn');
  assert.ok(h.getEl('view').innerHTML.includes('+ Thêm sự kiện'), 'view Sự kiện vẫn có nút + Thêm sự kiện riêng');
  h.run('curView = "dash"; render();');
  assert.equal(h.getEl('headerAddDealBtn').style.display, '', 'Tổng quan: nút header hiện lại như cũ');
  h.run('curView = "board"; render();');
  assert.equal(h.getEl('headerAddDealBtn').style.display, '', 'Pipeline: nút header hiện như cũ');
});

/* ---------- Adapter: field mới đi qua legacy_extra ---------- */
test('adapter: status/endDate/eventUrl/line/report* của event đi qua legacy_extra và round-trip nguyên vẹn; 3 mảng liên kết không vào legacy_extra', () => {
  const src = { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [],
    events: [{ id: 'ev1', name: 'Expo', date: '2026-11-15', location: 'SECC', note: 'n', attendees: ['zac'],
      status: 'attended', endDate: '2026-11-17', eventUrl: 'https://expo.example.com', line: 'metaverse',
      reportMet: 'A', reportOutcome: 'B', reportNext: 'C', reportLinks: [{ label: 'L', url: 'https://drive.google.com/x' }],
      companies: ['c1'], leads: ['l1'], deals: [] }] };
  const rows = A.crmStateToRows(src);
  const le = rows.events[0].legacy_extra;
  assert.equal(le.status, 'attended'); assert.equal(le.endDate, '2026-11-17');
  assert.equal(le.eventUrl, 'https://expo.example.com'); assert.equal(le.line, 'metaverse');
  assert.equal(le.reportMet, 'A'); assert.equal(le.reportOutcome, 'B'); assert.equal(le.reportNext, 'C');
  assert.deepEqual(le.reportLinks, [{ label: 'L', url: 'https://drive.google.com/x' }]);
  for (const k of ['companies', 'leads', 'deals']) assert.equal(k in le, false, 'legacy_extra không chứa mảng liên kết ' + k);
  assert.deepEqual(rows.event_links, [{ event_id: 'ev1', entity_type: 'company', entity_id: 'c1' }, { event_id: 'ev1', entity_type: 'lead', entity_id: 'l1' }]);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  const ev = back.events[0];
  assert.equal(ev.status, 'attended'); assert.equal(ev.endDate, '2026-11-17');
  assert.equal(ev.eventUrl, 'https://expo.example.com'); assert.equal(ev.line, 'metaverse');
  assert.equal(ev.reportMet, 'A'); assert.deepEqual(ev.reportLinks, [{ label: 'L', url: 'https://drive.google.com/x' }]);
  assert.deepEqual(ev.companies, ['c1']); assert.deepEqual(ev.leads, ['l1']);
});

/* ---------- Import: planner + listBatches ---------- */
function loadSharedImport() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaImport;
}
test('planImport: gắn sự kiện -> plan.eventId + lead source "Sự kiện"; không gắn / sự kiện không tồn tại -> source rỗng', () => {
  const I = loadSharedImport();
  const state = { companies: [], leads: [], events: [{ id: 'ev1', name: 'Expo', companies: [], leads: [], deals: [] }] };
  const recs = [{ _row: 2, empty: false, companyName: 'Acme', picName: 'Nguyen A', person: '', emailCell: '', phoneCell: '', linkedinUrl: '', statusRaw: '', note: '', whenRaw: '', profile: {} }];
  const p1 = I.planImport(state, recs, { batch: 'B1', ownerId: 'zac', line: 'metaverse', eventId: 'ev1' });
  assert.equal(p1.eventId, 'ev1');
  assert.equal(p1.leadsToCreate[0].source, 'Sự kiện');
  const p2 = I.planImport(state, recs, { batch: 'B1', ownerId: 'zac', line: 'metaverse' });
  assert.equal(p2.eventId, ''); assert.equal(p2.leadsToCreate[0].source, '');
  const p3 = I.planImport(state, recs, { batch: 'B1', ownerId: 'zac', line: 'metaverse', eventId: 'ev-khong-co' });
  assert.equal(p3.eventId, '', 'sự kiện không tồn tại -> coi như không gắn');
  assert.equal(p3.leadsToCreate[0].source, '');
});

test('listBatches: lô có entity được gắn vào sự kiện thì hiện tên sự kiện; chưa gắn thì rỗng', () => {
  const I = loadSharedImport();
  const state = { companies: [{ id: 'c1', name: 'Acme', importBatch: 'B1' }], leads: [{ id: 'l1', name: 'A', company: 'c1', importBatch: 'B1' }], deals: [],
    events: [{ id: 'ev1', name: 'Expo 2026', companies: ['c1'], leads: ['l1'], deals: [] }] };
  const list = I.listBatches(state);
  assert.deepEqual(Array.from(list[0].events), ['Expo 2026']);
  assert.deepEqual(Array.from(list[0].eventIds), ['ev1']);
  const state2 = { companies: state.companies, leads: state.leads, deals: [], events: [{ id: 'ev1', name: 'Expo 2026', companies: [], leads: [], deals: [] }] };
  assert.deepEqual(Array.from(I.listBatches(state2)[0].events), [], 'entity của lô không còn liên kết -> không hiện sự kiện');
});

/* ---------- Import: UI end-to-end (chọn sự kiện -> nạp -> gỡ lô) ---------- */
test('Import UI: bước Thiết lập lô có ô chọn sự kiện; impApply gắn entity của lô vào event + lead source Sự kiện; impRemoveBatch gỡ sạch liên kết', async () => {
  const st = fixtureState();
  st.companies = []; st.leads = []; st.deals = [];
  st.events = [{ id: 'evImp', name: 'Sự Kiện Nạp', date: iso(3), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] }];
  const h = loadIndex(st); loginAsZac(h);
  h.run(`impData = { fileName: 'x.xlsx', wb: null, sheetNames: ['S1'], sheetName: 'S1', aoa: [['Company Name','PIC']], links: {}, headerIdx: 0, headers: ['Company Name','PIC'], mapping: ['companyName','picName'] };`);
  h.run('curView = "import"; render();');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('id="imp_event"'), 'bước Thiết lập lô có ô chọn Gắn lô vào sự kiện');
  assert.ok(view.includes('Sự Kiện Nạp'), 'ô chọn liệt kê sự kiện hiện có');
  h.run(`impPlan = { batch: 'Lô Test', eventId: 'evImp', companiesToCreate: [{ key: 'acme', name: 'Acme', type: 'Doanh nghiệp', roles: {}, profile: {} }], companiesMatched: [], leadsToCreate: [{ name: 'PIC Một', companyKey: 'acme', companyId: '', person: '', phone: '', email: '', emailRaw: '', linkedinUrl: '', ownerId: 'zac', line: 'metaverse', source: 'Sự kiện', status: 'new', note: '', when: '', mainContact: true, importBatch: 'Lô Test' }], duplicates: [], errors: [], stats: { newCompanies: 1, matchedCompanies: 0, newLeads: 1, duplicates: 0, errors: 0 } };`);
  await h.run('impApply()');
  const nc = h.run("S.companies.find(c=>c.name==='Acme')");
  const nl = h.run("S.leads.find(l=>l.name==='PIC Một')");
  assert.ok(nc && nl, 'lô tạo công ty + lead');
  assert.equal(nl.source, 'Sự kiện', 'lead của lô gắn sự kiện mang nguồn Sự kiện');
  const ev = evById(h, 'evImp');
  assert.ok(ev.companies.includes(nc.id) && ev.leads.includes(nl.id), 'entity của lô được gắn vào event qua mảng liên kết của event');
  const batches = h.run('window.SavaImport.listBatches(S)');
  assert.deepEqual(Array.from(batches[0].events), ['Sự Kiện Nạp'], 'danh sách lô hiện tên sự kiện đã gắn');
  h.run('impBatchList = window.SavaImport.listBatches(S);');
  h.run('impRemoveBatch(0)');
  assert.equal(h.run("S.leads.some(l=>l.name==='PIC Một')"), false, 'gỡ lô xoá lead của lô');
  assert.equal(h.run("S.companies.some(c=>c.name==='Acme')"), false, 'gỡ lô xoá công ty do lô tạo (không còn ai dùng)');
  const evAfter = evById(h, 'evImp');
  assert.ok(evAfter, 'sự kiện vẫn còn sau khi gỡ lô');
  assert.deepEqual([...evAfter.companies], []); assert.deepEqual([...evAfter.leads], [], 'gỡ lô gỡ sạch liên kết event của lô');
});
