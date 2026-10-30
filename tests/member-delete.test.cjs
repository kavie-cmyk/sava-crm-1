/* Xoá thành viên (chỉ Admin) — phía frontend index.html.
   Harness vm theo mẫu loadIndex của tests/lead-term-view-edit.test.cjs:
   nạp shared.js + publishing-score/bridge + script inline THẬT của
   index.html với localStorage giả chứa FIXTURE RIÊNG của test.
   supabase-auth.js KHÔNG được nạp trong harness này nên test tự cài
   stub window.SavaAuth (currentUser/callMemberAdmin/accountStatusFor)
   để điều khiển vai người xem + ghi lại lời gọi Edge Function.
   Kiểm:
     - memberReferences: đếm đúng từng loại tham chiếu (deal owner /
       task assignee / activity who / game mktEval.by / Publishing
       requestedBy+assignee+reviewer / marketUpdates by) — và lead.person
       trùng id KHÔNG bị tính là tham chiếu (lead không trỏ member).
     - vMembers: Admin thấy nút "Xoá thành viên" ở mọi dòng TRỪ dòng của
       chính mình; BD không thấy nút ở bất kỳ dòng nào.
     - deleteMember: còn tham chiếu -> chặn, member còn nguyên, KHÔNG
       gọi function; tự xoá mình -> chặn; không còn tham chiếu + chưa có
       tài khoản (đã rõ trạng thái) -> xoá khỏi S.members + lưu qua
       save() (localStorage hết member) + biến mất khỏi ô chọn người;
       có tài khoản -> gọi function delete_member TRƯỚC rồi mới xoá;
       function lỗi -> KHÔNG xoá gì. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

let confirmResult = true;

function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  /* FIXTURE RIÊNG CỦA TEST:
     - zac: Admin đang đăng nhập, KHÔNG tham chiếu nghiệp vụ nào (để ca
       tự-xoá kiểm đúng chặn "chính mình", không lẫn chặn tham chiếu).
     - linh: vướng deal.owner + task.assignee + activity.who.
     - mai: chỉ vướng kho Publishing (requestedBy + reviewer của 1
       request, by của 1 marketUpdate).
     - gamkt: chỉ vướng games[].mktEval.by.
     - tuan: KHÔNG vướng gì, chưa có tài khoản.
     - binh: KHÔNG vướng gì, ĐÃ có tài khoản (profile u-binh).
     Lead l1 có person = "tuan" (tên tự do trùng id member) — KHÔNG được
     tính là tham chiếu của tuan. */
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
      { id: 'tuan', name: 'Tuấn', role: 'BD', active: true },
      { id: 'mai', name: 'Mai', role: 'MKT', active: true },
      { id: 'gamkt', name: 'Gia', role: 'MKT', active: true },
      { id: 'binh', name: 'Bình', role: 'BD', active: true },
    ],
    companies: [{ id: 'c1', name: 'Hanbit Fixture', type: 'Publisher', roles: { game_studio: 'Publisher' }, contact: 'Ms. Yoon', phone: '', last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Puzzle Cats Adventure', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Beta', emoji: '🐱', desc: '', bdNote: '', mktEval: { by: 'gamkt', at: 'Hôm nay', verdict: 'Ổn' } }],
    deals: [{ id: 'd1', line: 'game_studio', title: 'Deal của Linh', company: 'c1', game: 'g1', stage: 'evaluating', owner: 'linh', due: '', idle: 0, custom: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Đầu Mối', company: 'c1', person: 'tuan', line: 'game_studio', source: '', status: 'new', note: '', when: 'Hôm nay' }],
    tasks: [{ id: 't1', title: 'Việc của Linh', assignee: 'linh', deal: 'd1', due: '', dueDate: '', done: false }],
    activities: [{ id: 'a1', deal: 'd1', type: 'Note', who: 'linh', when: 'Hôm nay', text: 'Ghi chú của Linh' }],
  }));
  ls.setItem('sava_publishing_v1', JSON.stringify({
    version: 1,
    requests: [{
      id: 'r1', kind: 'game', entityId: 'g1', requestedBy: 'mai', assignee: 'linh', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '',
      current: { reviewer: 'mai' }, revisions: [{ reviewer: 'mai' }], revision: 1,
    }],
    marketUpdates: [{ id: 'mu1', name: 'Puzzle', category: 'Puzzle', date: '2026-10-30', geo: 'US', platform: 'Android', downloads: 1, revenue: 1, url: 'https://example.com', by: 'mai', confidence: 3, note: '', audit: [] }],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => confirmResult,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(readF(f), ctx, { filename: f });
  [...readF('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

/* Cài stub SavaAuth: viewer là ai + ghi lại lời gọi callMemberAdmin. */
function setViewer(h, viewer, callImpl) {
  const calls = [];
  h.ctx.SavaAuth = {
    currentUser: () => viewer,
    callMemberAdmin: async payload => { calls.push(payload); if (callImpl) return callImpl(payload); return { ok: true, message: 'OK từ function (test)' }; },
    fetchMemberProfiles: async () => ({}),
    accountStatusFor: (hasProfile, fnEntry) => fnEntry
      ? { key: fnEntry.status, label: fnEntry.status === 'active' ? 'Đã có tài khoản' : 'Đã mời – chờ đặt mật khẩu' }
      : { key: hasProfile ? 'linked' : 'none', label: hasProfile ? 'Đã gắn tài khoản' : 'Chưa có tài khoản' },
    isValidEmail: e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()),
  };
  return calls;
}
const ADMIN = { memberId: 'zac', name: 'Zac', role: 'admin', memberRole: 'Admin', email: 'zac@example.com' };
const BD = { memberId: 'linh', name: 'Linh', role: 'bd', memberRole: 'BD', email: 'linh@example.com' };

/* ---------- memberReferences ---------- */
test('memberReferences: đếm đúng từng loại tham chiếu; lead.person trùng id KHÔNG tính', () => {
  const h = loadIndex();
  /* Mảng/object sinh trong vm realm khác prototype với realm của test —
     chuẩn hoá qua JSON trước khi deepEqual (như lưu ý ở harness cũ). */
  const refs = id => JSON.parse(JSON.stringify(h.run('memberReferences(' + JSON.stringify(id) + ')')));
  const linh = refs('linh').join(' | ');
  assert.match(linh, /1 deal đang phụ trách/);
  assert.match(linh, /1 công việc được giao/);
  assert.match(linh, /1 hoạt động đã ghi/);
  assert.match(linh, /1 yêu cầu đánh giá Publishing/, 'linh là assignee của request r1');
  const mai = refs('mai').join(' | ');
  assert.match(mai, /1 yêu cầu đánh giá Publishing \(người yêu cầu/);
  assert.match(mai, /có bản chấm do thành viên này thực hiện/);
  assert.match(mai, /1 quan sát thị trường/);
  assert.deepEqual(refs('gamkt').length, 1);
  assert.match(refs('gamkt')[0], /điểm MKT lưu trữ/);
  assert.deepEqual(refs('tuan'), [], 'tuan không vướng gì — lead.person="tuan" là tên tự do, không phải tham chiếu');
  assert.deepEqual(refs('zac'), []);
  assert.deepEqual(refs('binh'), []);
});

/* ---------- hiển thị nút theo vai + chính mình ---------- */
test('vMembers: Admin thấy nút Xoá ở mọi dòng TRỪ dòng của chính mình; BD không thấy nút nào', () => {
  const h = loadIndex();
  setViewer(h, ADMIN);
  h.run('curView = "members"; render();');
  const adminHtml = h.getEl('view').innerHTML;
  assert.ok(adminHtml.includes("deleteMember('tuan')"), 'Admin phải thấy nút xoá cho tuan');
  assert.ok(adminHtml.includes("deleteMember('linh')"), 'Admin phải thấy nút xoá cho linh (chặn nằm ở bước bấm, không phải ẩn nút)');
  assert.ok(adminHtml.includes('🗑 Xoá thành viên'));
  assert.ok(!adminHtml.includes("deleteMember('zac')"), 'Admin KHÔNG thấy nút xoá trên dòng của chính mình');

  const h2 = loadIndex();
  setViewer(h2, BD);
  h2.run('curView = "members"; render();');
  const bdHtml = h2.getEl('view').innerHTML;
  assert.ok(!bdHtml.includes('Xoá thành viên'), 'BD không được thấy nút Xoá thành viên');
  assert.ok(!bdHtml.includes('deleteMember('), 'BD không được thấy hành động deleteMember nào');
});

/* ---------- chặn khi còn tham chiếu ---------- */
test('deleteMember: còn tham chiếu -> chặn, member còn nguyên, KHÔNG gọi function, toast nói rõ vướng ở đâu', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  confirmResult = true;
  await h.run("deleteMember('linh')");
  assert.ok(h.run("S.members.some(m => m.id === 'linh')"), 'linh phải còn trong danh sách');
  assert.equal(calls.length, 0, 'còn tham chiếu thì không được gọi Edge Function');
  const toast = h.getEl('toast').textContent;
  assert.match(toast, /Không xoá được Linh/);
  assert.match(toast, /deal đang phụ trách/);
  assert.match(toast, /Ngừng hoạt động/, 'toast phải gợi ý dùng Ngừng hoạt động thay thế');
});

test('deleteMember: vướng CHỈ ở kho Publishing (mai) -> cũng chặn', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  await h.run("deleteMember('mai')");
  assert.ok(h.run("S.members.some(m => m.id === 'mai')"));
  assert.equal(calls.length, 0);
  assert.match(h.getEl('toast').textContent, /Publishing/);
});

test('deleteMember: tự xoá chính mình -> chặn ngay cả khi không có tham chiếu', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  await h.run("deleteMember('zac')");
  assert.ok(h.run("S.members.some(m => m.id === 'zac')"));
  assert.equal(calls.length, 0);
  assert.match(h.getEl('toast').textContent, /Không thể xoá chính bạn/);
});

test('deleteMember: BD gọi trực tiếp hàm -> chặn, không xoá, không gọi function', async () => {
  const h = loadIndex();
  const calls = setViewer(h, BD);
  await h.run("deleteMember('tuan')");
  assert.ok(h.run("S.members.some(m => m.id === 'tuan')"));
  assert.equal(calls.length, 0);
  assert.match(h.getEl('toast').textContent, /Chỉ Admin/);
});

test('deleteMember: Admin huỷ ở hộp xác nhận -> không xoá', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  confirmResult = false;
  await h.run("deleteMember('tuan')");
  confirmResult = true;
  assert.ok(h.run("S.members.some(m => m.id === 'tuan')"));
  assert.equal(calls.length, 0);
});

/* ---------- xoá thành công ---------- */
test('deleteMember: không tham chiếu + chưa có tài khoản (đã rõ trạng thái) -> KHÔNG gọi function, xoá khỏi state + bản đã lưu + ô chọn người', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  h.run('memberProfiles = {}; memberFnStatus = {};'); // đã rõ: không ai có tài khoản theo dữ kiện này — binh sẽ được đặt riêng ở ca dưới
  await h.run("deleteMember('tuan')");
  assert.equal(calls.length, 0, 'chắc chắn chưa có tài khoản thì không cần gọi function');
  assert.ok(!h.run("S.members.some(m => m.id === 'tuan')"), 'tuan phải biến mất khỏi S.members');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.ok(!saved.members.some(m => m.id === 'tuan'), 'bản đã lưu qua save() cũng phải hết tuan (diff-sync sẽ xoá dòng members)');
  const selHtml = h.run("ownerSel('e_test_owner', '')");
  assert.ok(!selHtml.includes('Tuấn'), 'ô chọn người phụ trách không còn Tuấn');
  assert.match(h.getEl('toast').textContent, /Đã xoá thành viên: Tuấn/);
});

test('deleteMember: có tài khoản -> gọi function delete_member TRƯỚC, thành công mới xoá dòng members', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN);
  h.run("memberProfiles = { binh: { id: 'u-binh', member_id: 'binh', email: 'binh@example.com' } };");
  await h.run("deleteMember('binh')");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ action: 'delete_member', member_id: 'binh' }]);
  assert.ok(!h.run("S.members.some(m => m.id === 'binh')"), 'binh phải biến mất sau khi function ok');
});

test('deleteMember: function LỖI khi xoá tài khoản -> KHÔNG xoá dòng members', async () => {
  const h = loadIndex();
  const calls = setViewer(h, ADMIN, async () => { throw Object.assign(new Error('Xoá tài khoản đăng nhập thất bại (test).'), { status: 500 }); });
  h.run("memberProfiles = { binh: { id: 'u-binh', member_id: 'binh', email: 'binh@example.com' } };");
  await h.run("deleteMember('binh')");
  assert.equal(calls.length, 1, 'vẫn phải đã thử gọi function');
  assert.ok(h.run("S.members.some(m => m.id === 'binh')"), 'function lỗi thì binh phải CÒN trong danh sách');
  assert.match(h.getEl('toast').textContent, /Chưa xoá thành viên/);
});
