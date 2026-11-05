/* Việc 7 — "Hoạt động gần nhất" không thêm được hoạt động:
   - Trước sửa: CHỈ drawer Deal có form thêm hoạt động (khối "Timeline hoạt
     động"). Mọi khối mang tên "Hoạt động gần nhất" (drawer Công ty + panel
     Tổng quan) và các drawer Lead/Game/Member/Sự kiện đều KHÔNG có nút/form
     thêm — drawer Công ty còn ghi rõ "Bản thật sẽ thêm: ghi hoạt động mới".
   - Hoạt động BẮT BUỘC gắn deal (activities.deal_id NOT NULL + FK ở
     supabase/schema.sql): editActivity cho chọn "— Không gắn deal —" rồi
     saveActivity ghi a.deal="" -> adapter đẩy deal_id="" lên server -> vỡ
     FK/NOT NULL, snapshot đồng bộ không tiến được (kẹt mọi lần retry).
     Adapter cũng không có chốt chặn: hoạt động mồ côi (deal đã xoá) vẫn
     thành row đẩy đi.
   - Sau sửa: MỘT cơ chế dùng chung activityAddBlockHTML(scope, deals) cho
     mọi khối (deal/company/lead/game/member/event/dash): chọn deal trong
     phạm vi của khối (1 deal thì ghim sẵn), qua createActivity() + save()
     chung nên có đóng dấu Việc 4 + audit; saveActivity chặn deal rỗng/
     không tồn tại TRƯỚC khi mutate; adapter bỏ qua row hoạt động không có
     deal hợp lệ (giữ ở local, không đẩy vỡ FK); deleteActivity dựng lại
     ĐÚNG drawer đang mở. Hint "Cách lấy link" (Gmail/Messenger/Drive)
     nằm ngay tại ô dán link ở mọi form thêm + form sửa.
   Harness vm nạp index.html THẬT như fix-c1-index / audit-history. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const A = require('../supabase-adapter.js');

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'm1', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'c1', name: 'Studio Partner', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm qua' },
      { id: 'cEmpty', name: 'Empty Co', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: '' },
    ],
    games: [
      { id: 'gPartner', title: 'Game Partner A', own: 'partner', company: 'c1', genre: '', platform: '', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '', mktEval: null },
    ],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Pub One', company: 'c1', game: 'gPartner', stage: 'sourcing', owner: 'm1', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] },
      { id: 'd2', line: 'ai', title: 'Deal AI One', company: 'c1', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 100, cur: 'VND', leads: [] },
    ],
    leads: [
      { id: 'l1', name: 'Lead One', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'converted', note: '', when: '2026-10-01' },
    ],
    tasks: [],
    activities: [
      { id: 'a1', deal: 'd1', who: 'm1', type: 'Email', text: 'Act One Text', when: '2026-10-01', url: 'https://mail.google.com/mail/u/0/#inbox/thread111' },
      { id: 'a2', deal: 'd2', who: 'zac', type: 'Note', text: 'Act Two Text', when: '2026-10-02', url: '' },
    ],
    events: [
      { id: 'ev1', name: 'Expo One', date: '2026-10-20', location: 'HCMC', note: '', attendees: ['zac'], companies: ['c1'], leads: ['l1'], deals: ['d1'] },
    ],
    verticals: [],
  };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(fixtureState()));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [], marketUpdates: [] }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  let confirmAnswer = true; const toasts = [];
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => confirmAnswer,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  /* Bắt toast qua biến toàn cục nếu app có, nếu không thì đọc qua S state —
     harness này chỉ cần hành vi dữ liệu, toast kiểm qua chuỗi nguồn khi cần. */
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx), toasts, setConfirm: v => { confirmAnswer = v; },
    stored: () => JSON.parse(ls.getItem('sava_crm_shared_v1')) };
}
function fillScoped(h, scope, over) {
  const p = 'na_' + scope + '_';
  const vals = Object.assign({ type: 'Email', who: 'm1', text: 'Nội dung ' + scope, url: 'https://www.messenger.com/t/555' }, over || {});
  h.getEl(p + 'type').value = vals.type;
  h.getEl(p + 'who').value = vals.who;
  h.getEl(p + 'text').value = vals.text;
  h.getEl(p + 'url').value = vals.url;
  if (over && over.deal !== undefined) h.getEl(p + 'deal').value = over.deal;
  return vals;
}

/* ---------- 1. Hint lấy link: đủ 3 nền tảng, bước đúng giao diện thật ---------- */
test('hint: activityLinkHintHTML có Gmail (thanh địa chỉ, thread) + Messenger (thanh địa chỉ, /t/) + Drive (chuột phải → Chia sẻ → Sao chép đường liên kết), dạng mở gọn <details>', () => {
  const { run } = loadIndex();
  assert.equal(run('typeof activityLinkHintHTML'), 'function', 'phải có helper hint dùng chung');
  const hint = run('activityLinkHintHTML()');
  assert.ok(hint.includes('<details'), 'hint phải là mục mở gọn, không bung sẵn làm rối form');
  assert.ok(hint.includes('Cách lấy link'), 'thiếu tiêu đề Cách lấy link');
  assert.ok(hint.includes('Gmail') && hint.includes('thanh địa chỉ'), 'Gmail: phải dặn copy địa chỉ trên thanh địa chỉ trình duyệt');
  assert.ok(hint.includes('mail.google.com/mail/u/0/#inbox/'), 'Gmail: phải nêu dạng URL thread thật');
  assert.ok(hint.includes('Messenger') && hint.includes('messenger.com/t/'), 'Messenger: phải nêu dạng messenger.com/t/<id>');
  assert.ok(hint.includes('facebook.com/messages/t/'), 'Messenger: phải nêu cả dạng facebook.com/messages/t/<id>');
  assert.ok(hint.includes('Drive') && hint.includes('Chia sẻ') && hint.includes('Sao chép đường liên kết'), 'Drive: chuột phải → Chia sẻ → Sao chép đường liên kết');
  assert.ok(hint.includes('chuột phải'), 'Drive: phải bắt đầu bằng chuột phải vào file');
});

test('hint: hint nằm NGAY tại ô dán link trong form thêm ở drawer Deal + form sửa hoạt động', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('d1')");
  const d = getEl('drawer').innerHTML;
  const formSeg = d.slice(d.indexOf('id="dealActForm"'), d.indexOf('+ Thêm vào timeline'));
  assert.ok(formSeg.includes('id="na_url"'), 'form deal phải còn ô dán link na_url');
  assert.ok(formSeg.includes('Cách lấy link'), 'form thêm ở deal phải có hint ngay tại ô dán link');
  run("editActivity('a1')");
  const f = getEl('editBox').innerHTML;
  assert.ok(f.includes('id="ea_url"') && f.includes('Cách lấy link'), 'form sửa hoạt động phải có cùng hint tại ô ea_url');
});

/* ---------- 2. Drawer Công ty: khối "Hoạt động gần nhất" thêm được ---------- */
test('company: drawer công ty có form thêm hoạt động (chọn deal của công ty), thêm kèm link -> lưu + hiện lại đúng khối + vào state đã lưu', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openCompany('c1')");
  let d = getEl('drawer').innerHTML;
  const seg = d.slice(d.indexOf('🕘 Hoạt động gần nhất'));
  assert.ok(seg.includes('Thêm note'), 'khối Hoạt động gần nhất của công ty phải có nút thêm');
  assert.ok(seg.includes('id="na_company_deal"'), 'phải có ô chọn deal của công ty để gắn hoạt động');
  assert.ok(seg.includes('Deal Pub One') && seg.includes('Deal AI One'), 'ô chọn deal phải liệt kê cả 2 deal của công ty');
  assert.ok(seg.includes('Cách lấy link'), 'form công ty phải có hint lấy link');
  fillScoped(h, 'company', { deal: 'd2', text: 'Trao đổi với Studio Partner về AI', url: 'https://drive.google.com/file/d/xyz/view' });
  run("addActivityScoped('company')");
  const na = run("S.activities.find(a=>a.text==='Trao đổi với Studio Partner về AI')");
  assert.ok(na, 'hoạt động mới phải vào S.activities');
  assert.equal(na.deal, 'd2'); assert.equal(na.url, 'https://drive.google.com/file/d/xyz/view'); assert.equal(na.who, 'm1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Trao đổi với Studio Partner về AI'), 'lưu xong phải hiện lại ngay trong drawer công ty');
  assert.ok(d.includes('href="https://drive.google.com/file/d/xyz/view"'), 'nút mở link ghim phải có href đúng URL đã dán');
  assert.ok(h.stored().activities.some(a => a.text === 'Trao đổi với Studio Partner về AI'), 'phải vào bản đã lưu (đường save chung -> kế hoạch đồng bộ)');
});

test('company: công ty CHƯA có deal -> hiện hướng dẫn rõ, không có form lưu mù (hoạt động bắt buộc gắn deal)', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('cEmpty')");
  const d = getEl('drawer').innerHTML;
  const seg = d.slice(d.indexOf('🕘 Hoạt động gần nhất'));
  assert.ok(!seg.includes('id="na_company_text"'), 'không được có ô nội dung khi chưa có deal nào để gắn');
  assert.ok(seg.includes('deal'), 'phải giải thích hoạt động cần gắn deal');
  assert.ok(/chưa có deal/i.test(seg), 'phải nói rõ công ty chưa có deal');
});

/* ---------- 3. Lead / Game / Member / Sự kiện / Tổng quan ---------- */
test('lead: drawer lead có khối Hoạt động gần nhất + thêm được (deal đã gắn với lead), hiện lại đúng chỗ', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openLead('l1')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('🕘 Hoạt động gần nhất'), 'drawer lead phải có khối hoạt động');
  assert.ok(d.includes('Act One Text'), 'hoạt động của deal đã gắn phải hiện ở lead');
  assert.ok(d.includes('type="hidden" id="na_lead_deal" value="d1"'), 'lead chỉ có 1 deal đã gắn -> deal được ghim sẵn bằng hidden input mang đúng d1');
  /* Harness không parse HTML nên hidden input không tự có value như DOM
     thật — điền tay đúng giá trị markup đã mang (d1) như trình duyệt. */
  fillScoped(h, 'lead', { deal: 'd1', text: 'Gọi lead One xác nhận lịch demo' });
  run("addActivityScoped('lead')");
  const na = run("S.activities.find(a=>a.text==='Gọi lead One xác nhận lịch demo')");
  assert.ok(na && na.deal === 'd1', 'lead chỉ có 1 deal đã gắn -> hoạt động ghim đúng d1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Gọi lead One xác nhận lịch demo'), 'hiện lại trong drawer lead');
});

test('game: drawer game có khối hoạt động + thêm được vào deal đang gắn game', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openGame('gPartner')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('🕘 Hoạt động gần nhất') && d.includes('Act One Text'), 'drawer game phải hiện hoạt động qua deal gắn game');
  assert.ok(d.includes('type="hidden" id="na_game_deal" value="d1"'), 'game chỉ có 1 deal gắn -> ghim sẵn d1');
  fillScoped(h, 'game', { deal: 'd1', text: 'Chơi thử build mới với studio' });
  run("addActivityScoped('game')");
  const na = run("S.activities.find(a=>a.text==='Chơi thử build mới với studio')");
  assert.ok(na && na.deal === 'd1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Chơi thử build mới với studio'));
});

test('member: drawer thành viên thêm được hoạt động (người thực hiện điền sẵn = thành viên đó)', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openMember('m1')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Thêm note'), 'drawer thành viên phải có nút thêm hoạt động');
  fillScoped(h, 'member', { deal: 'd1', text: 'Linh gọi đối tác lần 2', who: 'm1' });
  run("addActivityScoped('member')");
  const na = run("S.activities.find(a=>a.text==='Linh gọi đối tác lần 2')");
  assert.ok(na && na.deal === 'd1' && na.who === 'm1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Linh gọi đối tác lần 2'), 'hiện lại trong khối Hoạt động đã ghi của thành viên');
});

test('event: drawer sự kiện có khối hoạt động theo deal liên kết + thêm được', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openEvent('ev1')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('🕘 Hoạt động gần nhất') && d.includes('Act One Text'), 'drawer sự kiện phải hiện hoạt động của deal liên kết');
  assert.ok(d.includes('type="hidden" id="na_event_deal" value="d1"'), 'sự kiện chỉ liên kết 1 deal -> ghim sẵn d1');
  fillScoped(h, 'event', { deal: 'd1', text: 'Gặp đối tác tại Expo, hẹn gửi build' });
  run("addActivityScoped('event')");
  const na = run("S.activities.find(a=>a.text==='Gặp đối tác tại Expo, hẹn gửi build')");
  assert.ok(na && na.deal === 'd1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Gặp đối tác tại Expo, hẹn gửi build'));
});

test('dash: panel "Hoạt động gần nhất" ở Tổng quan có form thêm + thêm xong hiện trong panel', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("curView='dash'; curLine='all'; query=''; render()");
  let v = getEl('view').innerHTML;
  const seg = v.slice(v.indexOf('Hoạt động gần nhất'));
  assert.ok(seg.includes('Thêm note') && seg.includes('id="na_dash_text"'), 'panel Tổng quan phải có form thêm hoạt động');
  fillScoped(h, 'dash', { deal: 'd2', text: 'Hoạt động thêm từ Tổng quan' });
  run("addActivityScoped('dash')");
  const na = run("S.activities.find(a=>a.text==='Hoạt động thêm từ Tổng quan')");
  assert.ok(na && na.deal === 'd2');
  v = getEl('view').innerHTML;
  assert.ok(v.includes('Hoạt động thêm từ Tổng quan'), 'thêm xong phải hiện ngay trong panel Tổng quan');
});

/* ---------- 4. Deal: giữ nguyên cơ chế gốc + link ghim là href thật ---------- */
test('deal: form thu gọn theo cơ chế cũ (dealActForm display:none + toggle), thêm kèm link -> timeline có href thật, sửa/xoá được', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openDeal('d1')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('id="dealActForm" style="display:none'), 'form deal giữ cơ chế thu gọn cũ');
  getEl('dealActForm').style.display = 'none';
  run('toggleDealActivityForm()');
  assert.equal(getEl('dealActForm').style.display, '', 'bấm nút Thêm note phải mở form');
  run('toggleDealActivityForm()');
  assert.equal(getEl('dealActForm').style.display, 'none', 'bấm lại phải thu form');
  /* link ghim sẵn có của a1 phải là href thật (không chỉ href="#") */
  assert.ok(d.includes('href="https://mail.google.com/mail/u/0/#inbox/thread111"'), 'hoạt động đã ghim phải mở bằng href đúng URL');
  getEl('na_type').value = 'Messenger'; getEl('na_who').value = 'zac';
  getEl('na_text').value = 'Chat chốt lịch ký term'; getEl('na_url').value = 'https://www.messenger.com/t/777';
  run("addActivity('d1')");
  const na = run("S.activities.find(a=>a.text==='Chat chốt lịch ký term')");
  assert.ok(na && na.url === 'https://www.messenger.com/t/777' && na.deal === 'd1');
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Chat chốt lịch ký term') && d.includes('href="https://www.messenger.com/t/777"'), 'timeline deal hiện hoạt động mới + href link ghim đúng');
  /* sửa được */
  run(`editActivity('${na.id}')`);
  getEl('ea_type').value = 'Messenger'; getEl('ea_who').value = 'zac'; getEl('ea_when').value = '';
  getEl('ea_text').value = 'Chat chốt lịch ký term (đã sửa)'; getEl('ea_url').value = 'https://www.facebook.com/messages/t/777'; getEl('ea_deal').value = 'd1';
  run(`saveActivity('${na.id}')`);
  assert.equal(run(`S.activities.find(a=>a.id==='${na.id}').text`), 'Chat chốt lịch ký term (đã sửa)');
  assert.equal(run(`S.activities.find(a=>a.id==='${na.id}').url`), 'https://www.facebook.com/messages/t/777');
  /* xoá được và drawer deal dựng lại không còn hoạt động đó */
  run(`deleteActivity('${na.id}')`);
  assert.equal(run(`S.activities.some(a=>a.id==='${na.id}')`), false);
  assert.ok(!getEl('drawer').innerHTML.includes('Chat chốt lịch ký term (đã sửa)'), 'xoá xong timeline không còn hoạt động đó');
});

/* ---------- 5. Validate gốc: hoạt động bắt buộc gắn deal hợp lệ ---------- */
test('validate: createActivity/addActivityScoped từ chối deal rỗng/không tồn tại (không push, không lưu); saveActivity chặn ea_deal rỗng TRƯỚC khi mutate', () => {
  const h = loadIndex(); const { run, getEl } = h;
  const n0 = run('S.activities.length');
  assert.equal(run("createActivity('', {type:'Note', who:'m1', text:'x', url:''})"), null, 'deal rỗng phải bị từ chối');
  assert.equal(run("createActivity('deal-khong-ton-tai', {type:'Note', who:'m1', text:'x', url:''})"), null, 'deal không tồn tại phải bị từ chối');
  assert.equal(run("createActivity('d1', {type:'Note', who:'m1', text:'  ', url:''})"), null, 'nội dung rỗng phải bị từ chối');
  assert.equal(run('S.activities.length'), n0, 'không được push hoạt động lỗi');
  /* qua đường scoped: chọn deal rỗng ở khối công ty */
  run("openCompany('c1')");
  fillScoped(h, 'company', { deal: '', text: 'Không được lưu vì thiếu deal' });
  run("addActivityScoped('company')");
  assert.equal(run('S.activities.length'), n0);
  assert.ok(!h.stored().activities.some(a => a.text === 'Không được lưu vì thiếu deal'), 'hoạt động thiếu deal không được vào bản lưu/đồng bộ');
  /* saveActivity: bỏ gắn deal -> chặn, bản ghi giữ nguyên 100% */
  run("editActivity('a1')");
  getEl('ea_type').value = 'Call'; getEl('ea_who').value = 'zac'; getEl('ea_when').value = '05-10-2026';
  getEl('ea_text').value = 'Đổi nội dung này'; getEl('ea_url').value = ''; getEl('ea_deal').value = '';
  run("saveActivity('a1')");
  const a1 = run("S.activities.find(a=>a.id==='a1')");
  assert.equal(a1.deal, 'd1', 'deal gốc phải giữ nguyên khi lưu bị chặn');
  assert.equal(a1.text, 'Act One Text', 'nội dung phải giữ nguyên khi lưu bị chặn (validate trước mutate)');
  assert.equal(a1.type, 'Email', 'loại phải giữ nguyên khi lưu bị chặn');
});

test('delete: xoá hoạt động từ drawer CÔNG TY dựng lại đúng drawer công ty (không nhảy/treo ở deal)', () => {
  const h = loadIndex(); const { run, getEl } = h;
  run("openCompany('c1')");
  run("deleteActivity('a1')");
  assert.equal(run("S.activities.some(a=>a.id==='a1')"), false);
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Studio Partner'), 'drawer đang mở vẫn là công ty sau khi xoá');
  assert.ok(!d.includes('Act One Text'), 'hoạt động đã xoá không còn hiện ở khối công ty');
});

/* ---------- 6. Việc 4: đóng dấu + audit qua save() chung ---------- */
test('stamp/audit: thêm hoạt động qua khối công ty -> activity được đóng dấu createdAt/updatedAt/updatedBy + 1 mục audit create đúng thao tác (qua SavaAudit.recordBatch)', () => {
  const h = loadIndex(); const { run } = h;
  const captured = [];
  h.ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  h.ctx.SavaAudit = { recordBatch: entries => { captured.push(...entries); return Promise.resolve(); }, listFor: async () => [] };
  run("openCompany('c1')");
  fillScoped(h, 'company', { deal: 'd1', text: 'Hoạt động kiểm dấu', url: 'https://mail.google.com/mail/u/0/#inbox/thread999' });
  run("addActivityScoped('company')");
  const na = run("S.activities.find(a=>a.text==='Hoạt động kiểm dấu')");
  assert.ok(na, 'hoạt động phải tồn tại');
  assert.ok(na.createdAt && na.updatedAt, 'phải có createdAt/updatedAt do save() đóng dấu');
  assert.equal(na.updatedBy, 'zac', 'updatedBy phải là member đang đăng nhập');
  const entry = captured.find(e => e.entityType === 'activity' && e.entityId === na.id);
  assert.ok(entry, 'phải sinh mục audit cho chính activity mới');
  assert.equal(entry.action, 'create');
  assert.equal(entry.byMemberId, 'zac');
  const fields = entry.changes.map(c => c.field);
  assert.ok(fields.includes('text') && fields.includes('url') && fields.includes('deal'), 'audit create phải ghi đúng các field của thao tác thêm (text/url/deal): ' + fields.join(','));
  const storedAct = h.stored().activities.find(a => a.id === na.id);
  assert.ok(storedAct && storedAct.createdAt, 'bản đã lưu (localStorage — đầu vào của đồng bộ) phải mang dấu');
});

/* ---------- 7. Đồng bộ: adapter plan + chốt FK ---------- */
test('sync: adapter dựng row activities đúng deal_id cho hoạt động mới; hoạt động deal rỗng/mồ côi KHÔNG thành row (không vỡ FK deal_id NOT NULL)', () => {
  const state = fixtureState();
  state.activities.push({ id: 'aNew', deal: 'd1', type: 'Email', who: 'm1', when: '2026-11-03', text: 'Mới', url: 'https://mail.google.com/mail/u/0/#inbox/t1' });
  state.activities.push({ id: 'aNoDeal', deal: '', type: 'Note', who: 'm1', when: '2026-11-03', text: 'Thiếu deal', url: '' });
  state.activities.push({ id: 'aGhost', deal: 'deal-da-xoa', type: 'Note', who: 'm1', when: '2026-11-03', text: 'Deal mồ côi', url: '' });
  const rows = A.crmStateToRows(state);
  const ids = rows.activities.map(r => r.id).sort();
  assert.deepEqual(ids, ['a1', 'a2', 'aNew'], 'chỉ hoạt động gắn deal còn tồn tại mới thành row đồng bộ: ' + ids.join(','));
  const rn = rows.activities.find(r => r.id === 'aNew');
  assert.equal(rn.deal_id, 'd1'); assert.equal(rn.url, 'https://mail.google.com/mail/u/0/#inbox/t1');
  assert.ok(rows.activities.every(r => r.deal_id), 'mọi row activities phải có deal_id (cột NOT NULL + FK)');
});

/* ---------- 8. Tĩnh: mọi khối dùng CHUNG một cơ chế, không vá riêng ---------- */
test('tĩnh: activityAddBlockHTML được dùng ở cả 6 bề mặt (company/lead/game/member/event/dash) + deal giữ khối gốc; toggle dùng chung', () => {
  for (const scope of ['company', 'lead', 'game', 'member', 'event', 'dash']) {
    assert.ok(html.includes(`activityAddBlockHTML("${scope}"`) || html.includes(`activityAddBlockHTML('${scope}'`), 'thiếu khối thêm hoạt động dùng chung cho scope ' + scope);
  }
  assert.ok(html.includes('function createActivity('), 'phải có lõi tạo hoạt động dùng chung');
  assert.ok(html.includes('function addActivityScoped('), 'phải có đường thêm theo scope dùng chung');
  assert.ok(html.includes('function toggleActivityForm('), 'phải có toggle dùng chung cho các scope');
  assert.ok(!html.includes('Bản thật sẽ thêm: ghi hoạt động mới'), 'drawer công ty không còn câu "bản thật sẽ thêm" phủ nhận khả năng thêm');
});
