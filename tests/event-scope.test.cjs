/* Sự kiện theo tài khoản — BỘ LỌC HIỂN THỊ ở view Sự kiện (Zac chốt
   16/11/2026, ĐÍNH CHÍNH 17:58 cùng ngày: KHÔNG phải khoá quyền):
   - Field `owner` (member id) trên event, sống trong legacy_extra qua
     adapter (KHÔNG cột server, KHÔNG key owner_id trong dòng events,
     KHÔNG gói SQL riêng của đợt này; server Supabase không đổi).
   - eventOwnerId(ev): owner -> dấu người tạo createdBy -> "" (chưa rõ
     chủ). KHÔNG dùng updatedBy. Không ghi bù dữ liệu.
   - View Sự kiện có điều khiển phạm vi "Của tôi" / "Tất cả": mặc định
     non-Admin = "Của tôi", Admin = "Tất cả"; "Của tôi" áp như nhau cho
     mọi vai (Admin cũng chỉ thấy event của Admin). Phạm vi AND với tìm
     kiếm + nhóm trạng thái + sort + phân trang sẵn có.
   - Mọi bề mặt khác (Lịch, drawer, picker, openEvent) GIỮ NGUYÊN xem
     chung — test tĩnh khoá việc index.html không còn helper siết quyền
     sự kiện (visibleEvents/canViewEvent) của brief cũ đã bị đổi hướng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const adapter = require('../supabase-adapter.js');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
    ],
    companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [],
    events: [
      { id: 'evHoang', name: 'Expo Của Hoàng', owner: 'hoangdaden', status: 'planned', date: iso(5), endDate: iso(5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      /* Sự kiện cũ KHÔNG có owner, chỉ có dấu người tạo createdBy -> suy chủ = người tạo */
      { id: 'evHoangCu', name: 'Hội Thảo Cũ Của Hoàng', createdBy: 'hoangdaden', status: 'planned', date: iso(6), endDate: iso(6), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evYen', name: 'Expo Của Yến', owner: 'yen', status: 'planned', date: iso(5), endDate: iso(5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evZac', name: 'Expo Của Zac', owner: 'zac', status: 'planned', date: iso(5), endDate: iso(5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      /* Chưa rõ chủ: không owner, không createdBy; updatedBy cố ý trỏ sang
         người khác để khoá việc KHÔNG suy chủ từ người sửa cuối */
      { id: 'evNone', name: 'Sự Kiện Chưa Rõ Chủ', updatedBy: 'yen', status: 'planned', date: iso(5), endDate: iso(5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evHoangDone', name: 'Expo Hoàng Đã Đi', owner: 'hoangdaden', status: 'attended', date: iso(-5), endDate: iso(-5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
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
function loginAs(h, memberId, role) {
  h.ctx.SavaAuth = { currentUser: () => ({ memberId, role, name: memberId }) };
}
function renderEvents(h) { h.run('curView = "events"; render();'); return h.getEl('view').innerHTML; }

/* ---------- eventOwnerId / nhãn ---------- */
test('eventOwnerId: owner thắng createdBy; fallback createdBy; không có cả hai -> "" và TUYỆT ĐỐI không dùng updatedBy', () => {
  const h = loadIndex();
  assert.equal(h.run("eventOwnerId(S.events.find(e=>e.id==='evHoang'))"), 'hoangdaden');
  assert.equal(h.run("eventOwnerId({owner:'yen', createdBy:'hoangdaden'})"), 'yen', 'owner là nguồn sự thật, thắng createdBy');
  assert.equal(h.run("eventOwnerId(S.events.find(e=>e.id==='evHoangCu'))"), 'hoangdaden', 'event cũ không owner -> suy từ dấu người tạo createdBy');
  assert.equal(h.run("eventOwnerId(S.events.find(e=>e.id==='evNone'))"), '', 'chỉ có updatedBy (người sửa cuối) -> vẫn chưa rõ chủ');
  assert.equal(h.run("eventOwnerId(null)"), '');
  assert.equal(h.run("eventOwnerLabel(S.events.find(e=>e.id==='evNone'))"), 'Chưa gán');
  assert.equal(h.run("eventOwnerLabel(S.events.find(e=>e.id==='evHoang'))"), 'Hoàng Daden');
});

/* ---------- Phạm vi mặc định + "Của tôi" của BD ---------- */
test('BD mặc định "Của tôi": chỉ thấy event của mình (gồm event cũ suy chủ từ createdBy), không thấy của người khác / chưa rõ chủ', () => {
  const h = loadIndex();
  loginAs(h, 'hoangdaden', 'bd');
  assert.equal(h.run('eventScope()'), 'mine', 'non-Admin mặc định "Của tôi"');
  const view = renderEvents(h);
  assert.ok(view.includes('Expo Của Hoàng'), 'event owner=hoangdaden hiện');
  assert.ok(view.includes('Hội Thảo Cũ Của Hoàng'), 'event cũ suy chủ từ createdBy hiện ở "Của tôi"');
  assert.ok(view.includes('Expo Hoàng Đã Đi'), 'event đã tham dự của mình hiện (nhóm trạng thái khác)');
  assert.ok(!view.includes('Expo Của Yến'), 'event của BD khác không hiện');
  assert.ok(!view.includes('Expo Của Zac'), 'event của Admin không hiện ở "Của tôi" của BD');
  assert.ok(!view.includes('Sự Kiện Chưa Rõ Chủ'), 'event chưa rõ chủ chỉ thuộc "Tất cả"');
  assert.ok(view.includes('Phụ trách: Hoàng Daden'), 'hàng sự kiện hiện tên người phụ trách');
  assert.equal((view.match(/Phụ trách:/g) || []).length, 3, 'đúng 3 hàng sự kiện của Hoàng được render');
  assert.ok(view.includes('2 sự kiện') && view.includes('1 sự kiện'), 'số đếm nhóm trạng thái tính trên tập đã lọc phạm vi (planned=2, attended=1)');
});

/* ---------- Chuyển "Tất cả" ---------- */
test('BD chuyển "Tất cả": thấy đủ event của mọi người + event chưa rõ chủ (nhãn "Chưa gán")', () => {
  const h = loadIndex();
  loginAs(h, 'hoangdaden', 'bd');
  h.run("setEventScope('all')");
  assert.equal(h.run('eventScope()'), 'all');
  const view = renderEvents(h);
  for (const name of ['Expo Của Hoàng', 'Hội Thảo Cũ Của Hoàng', 'Expo Của Yến', 'Expo Của Zac', 'Sự Kiện Chưa Rõ Chủ', 'Expo Hoàng Đã Đi'])
    assert.ok(view.includes(name), 'phạm vi "Tất cả" phải hiện: ' + name);
  assert.ok(view.includes('Phụ trách: Chưa gán'), 'event chưa rõ chủ hiện nhãn "Chưa gán"');
  assert.equal((view.match(/Phụ trách:/g) || []).length, 6, 'render đủ 6 sự kiện');
});

/* ---------- Admin: mặc định "Tất cả"; "Của tôi" của Admin chỉ gồm event của Admin ---------- */
test('Admin mặc định "Tất cả" thấy đủ; Admin chọn "Của tôi" chỉ thấy event của Admin (phạm vi áp như nhau mọi vai)', () => {
  const h = loadIndex();
  loginAs(h, 'zac', 'admin');
  assert.equal(h.run('eventScope()'), 'all', 'Admin mặc định "Tất cả"');
  let view = renderEvents(h);
  assert.equal((view.match(/Phụ trách:/g) || []).length, 6, 'Admin mặc định thấy đủ 6 sự kiện');
  h.run("setEventScope('mine')");
  view = renderEvents(h);
  assert.ok(view.includes('Expo Của Zac'), 'event của Admin hiện ở "Của tôi" của Admin');
  assert.ok(!view.includes('Expo Của Hoàng') && !view.includes('Expo Của Yến') && !view.includes('Sự Kiện Chưa Rõ Chủ'), '"Của tôi" của Admin KHÔNG gồm event người khác / chưa rõ chủ');
  assert.equal((view.match(/Phụ trách:/g) || []).length, 1);
});

/* ---------- Phạm vi × tìm kiếm (AND) ---------- */
test('Phạm vi kết hợp AND với tìm kiếm: query chỉ khớp event người khác -> rỗng ở "Của tôi", có ở "Tất cả"', () => {
  const h = loadIndex();
  loginAs(h, 'hoangdaden', 'bd');
  h.run('query = "expo của yến";'); /* query luôn được chuẩn hoá chữ thường ở handler ô tìm kiếm (index.html) */
  let view = renderEvents(h);
  assert.ok(!view.includes('Expo Của Yến'), '"Của tôi" + query khớp event người khác -> không hiện');
  assert.ok(view.includes('Không có sự kiện nào khớp tìm kiếm hiện tại.'), 'rỗng do lọc -> thông báo không khớp');
  h.run("setEventScope('all');");
  view = renderEvents(h);
  assert.ok(view.includes('Expo Của Yến'), '"Tất cả" + cùng query -> hiện event của Yến');
  assert.ok(!view.includes('Expo Của Hoàng'), 'query vẫn lọc trong phạm vi "Tất cả"');
});

/* ---------- Form: mặc định chủ = người đăng nhập; gán lại lưu đúng; event cũ có owner khi user tự sửa + lưu ---------- */
test('Form sự kiện: tạo mới mặc định chủ = người đăng nhập; đổi chủ qua form lưu đúng; sửa event cũ (chưa owner) ghi owner theo form', () => {
  const h = loadIndex();
  loginAs(h, 'hoangdaden', 'bd');
  h.run('openEventForm()');
  let form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_evowner"'), 'form có ô chọn Người phụ trách');
  assert.ok(form.includes('<option value="hoangdaden" selected>'), 'tạo mới: chủ mặc định = người đang đăng nhập');
  h.getEl('e_evname').value = 'Sự Kiện Mới Của Hoàng';
  h.getEl('e_evdate').value = '20-11-2026';
  h.getEl('e_evowner').value = 'yen';
  h.run('saveEvent(null)');
  const created = h.run("S.events[S.events.length-1]");
  assert.equal(created.owner, 'yen', 'gán lại chủ qua form -> owner lưu đúng người được chọn');

  /* Event cũ chưa có owner: mở form sửa -> ô chọn hiện chủ suy từ createdBy;
     lưu -> owner được ghi thật theo form (lần duy nhất owner của event cũ được ghi) */
  assert.equal(h.run("S.events.find(e=>e.id==='evHoangCu').owner"), undefined, 'trước khi sửa: event cũ vẫn chưa có field owner (không ghi bù)');
  h.run("openEventForm('evHoangCu')");
  form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('<option value="hoangdaden" selected>'), 'form sửa event cũ chọn sẵn chủ suy từ createdBy');
  h.getEl('e_evname').value = 'Hội Thảo Cũ Của Hoàng';
  h.getEl('e_evdate').value = '21-11-2026';
  h.getEl('e_evowner').value = 'hoangdaden';
  h.run("saveEvent('evHoangCu')");
  assert.equal(h.run("S.events.find(e=>e.id==='evHoangCu').owner"), 'hoangdaden', 'sau khi user tự sửa + lưu: owner ghi theo form');
});

/* ---------- Adapter: round-trip owner qua legacy_extra, KHÔNG key owner_id ---------- */
test('Adapter: owner round-trip qua legacy_extra (state->rows->state), dòng events KHÔNG chứa key owner_id', () => {
  const state = { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], salesMaterials: [], verticals: [],
    events: [
      { id: 'evA', name: 'A', date: '2026-11-20', location: '', owner: 'hoangdaden', companies: [], leads: [], deals: [] },
      { id: 'evB', name: 'B', date: '2026-11-21', location: '', owner: '', companies: [], leads: [], deals: [] },
      { id: 'evC', name: 'C', date: '2026-11-22', location: '', companies: [], leads: [], deals: [] },
    ] };
  const rows = adapter.crmStateToRows(state);
  assert.equal(rows.events.length, 3);
  for (const r of rows.events) assert.ok(!('owner_id' in r), 'dòng events TUYỆT ĐỐI không phát key owner_id (server không có cột này)');
  assert.equal(rows.events[0].legacy_extra.owner, 'hoangdaden', 'owner nằm trong legacy_extra khi ghi');
  const back = adapter.crmRowsToState(rows);
  assert.equal(back.events.find(e => e.id === 'evA').owner, 'hoangdaden', 'đọc lại khôi phục đúng owner');
  assert.ok(!back.events.find(e => e.id === 'evB').owner, 'owner rỗng giữ nguyên rỗng/chưa gán');
  assert.ok(!back.events.find(e => e.id === 'evC').owner, 'event không có owner giữ nguyên chưa gán');
});

/* ---------- Tĩnh: không gói SQL, không helper siết quyền, nhãn + REF đúng ---------- */
test('Tĩnh: repo KHÔNG có gói SQL của đợt này; index.html không còn helper/lọc siết quyền sự kiện; shared.js có nhãn + REF cho event.owner', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'supabase', 'event-privacy-by-owner.sql')), false, 'đợt này KHÔNG có file SQL (server giữ nguyên)');
  const idx = read('index.html');
  assert.ok(!idx.includes('visibleEvents') && !idx.includes('canViewEvent') && !idx.includes('eventPrivacyActive'), 'không còn helper siết quyền sự kiện của brief cũ');
  assert.ok(idx.includes('>Của tôi</button>') && idx.includes('>Tất cả</button>'), 'view Sự kiện có 2 nút phạm vi đúng nhãn "Của tôi" / "Tất cả"');
  assert.ok(idx.includes('setEventScope'), 'có hàm chuyển phạm vi');
  const sh = read('shared.js');
  assert.ok(sh.includes('owner: "Người phụ trách"'), 'FIELD_LABELS.event.owner = "Người phụ trách"');
  assert.ok(sh.includes('event: { owner: "member" }'), 'REF_FIELDS.event.owner -> member (diff audit resolve tên)');
  const ad = read('supabase-adapter.js');
  assert.ok(!/rows\.events\.push\(\{[^}]*owner_id/.test(ad), 'adapter không dựng dòng events kèm owner_id');
});
