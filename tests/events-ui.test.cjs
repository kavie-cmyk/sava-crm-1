/* Sự kiện (Events) — PHẦN GIAO DIỆN trong index.html:
   - Liên kết Event↔entity nằm Ở EVENT (ev.companies / ev.leads / ev.deals
     là 3 mảng id) — nguồn sự thật duy nhất; phía company/lead/deal chỉ
     HIỂN THỊ suy ra bằng cách quét S.events.
   - View Sự kiện (vEvents) + drawer openEvent (view-first, 3 khối liên
     kết: picker dropdown chỉ chứa entity chưa gắn + nút "＋ Tạo mới" qua
     pendingEventLink mở ĐÚNG form tạo sẵn có editCompany/editLead/openAdd)
     + form openEventForm/saveEvent (attendees mặc định = người đăng nhập).
   - Tạo entity từ sự kiện: saveCompany/saveLead/saveDeal tiêu thụ
     pendingEventLink trước save() của chúng; huỷ form (closeEdit/closeAdd)
     xoá pending. Gắn lead vào sự kiện KHÔNG đổi status lead.
   - Xoá sự kiện -> entity còn nguyên; xoá entity -> liên kết trong mọi
     sự kiện mất (dọn trong deleteCompany/deleteLead/performDeleteDeal).
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Harness index.html THẬT (cùng mẫu task-context-link) ---------- */
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
      { id: 'mai', name: 'Mai', role: 'MKT', active: false },
    ],
    companies: [
      { id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Công ty Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
    ],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' }],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] },
      { id: 'd2', line: 'ai', title: 'Deal Hai', company: 'c2', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 0, cur: 'VND', leads: [] },
    ],
    leads: [
      { id: 'l1', name: 'Người Một', company: 'c1', person: 'Anh Một — CEO', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'qualified', note: '', when: '2026-10-01', mainContact: false },
      { id: 'l2', name: 'Người Hai', company: 'c2', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-02', mainContact: false },
    ],
    tasks: [], activities: [], verticals: [],
    events: [
      { id: 'ev1', name: 'Triển lãm Game 2026', date: '2026-10-15', location: 'SECC, TP.HCM', note: 'Gặp đối tác tại quầy B2', attendees: ['zac', 'linh'], companies: ['c1'], leads: [], deals: ['d1'] },
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
const ev1 = h => h.run("S.events.find(e=>e.id==='ev1')");

/* ---------- Nav + view ---------- */
test('nav: cả desktop lẫn mobile đều có nút Sự kiện (data-view=events, icon meeting) đặt sau Leads; render dispatch tới vEvents', () => {
  const idx = read('index.html');
  assert.equal((idx.match(/data-view="events"/g) || []).length, 2, 'đúng 2 nút events (desktop + mobile)');
  assert.equal((idx.match(/data-icon="meeting"/g) || []).length >= 2, true, 'icon meeting ở cả 2 nav');
  const desk = idx.slice(idx.indexOf('id="nav"'), idx.indexOf('</nav>'));
  assert.ok(desk.indexOf('data-view="leads"') < desk.indexOf('data-view="events"') && desk.indexOf('data-view="events"') < desk.indexOf('data-view="tasks"'), 'nút Sự kiện nằm sau Leads, trước Việc');
  const h = loadIndex();
  h.run('curView = "events"; render();');
  assert.equal(h.getEl('viewTitle').textContent, 'Sự kiện');
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Triển lãm Game 2026') && view.includes("openEvent('ev1')"), 'mục sự kiện bấm mở drawer được');
  assert.ok(view.includes('15-10-2026') && view.includes('SECC, TP.HCM'), 'ngày (dd-mm-yyyy) + địa điểm');
  assert.ok(view.includes('Zac') && view.includes('Linh'), 'tên người tham dự');
  assert.ok(view.includes('1 công ty') && view.includes('0 lead') && view.includes('1 deal'), '3 chip đếm từ 3 mảng liên kết');
  assert.ok(view.includes('openEventForm()'), 'nút + Thêm sự kiện mở form tạo sự kiện');
});

test('vEvents: empty-state phân biệt chưa có sự kiện với không khớp tìm kiếm', () => {
  const st = fixtureState(); st.events = [];
  const h = loadIndex(st);
  h.run('curView = "events"; render();');
  assert.ok(h.getEl('view').innerHTML.includes('Chưa có sự kiện nào.'));
  const h2 = loadIndex();
  h2.run('query = "khong-khop-gi-ca"; curView = "events"; render();');
  assert.ok(h2.getEl('view').innerHTML.includes('Không có sự kiện nào khớp tìm kiếm hiện tại.'));
  assert.ok(!h2.getEl('view').innerHTML.includes('Triển lãm Game 2026'), 'đang lọc thì sự kiện không khớp không hiện');
});

/* ---------- Form sự kiện ---------- */
test('openEventForm tạo mới: attendees mặc định tick người đang đăng nhập, member đã ngừng không có ô tick', () => {
  const h = loadIndex(); loginAsZac(h);
  h.run('openEventForm()');
  const form = h.getEl('editBox').innerHTML;
  assert.ok(/id="e_evatt_zac"[^>]*checked/.test(form), 'người đăng nhập (zac) được tick sẵn');
  assert.ok(!/id="e_evatt_linh"[^>]*checked/.test(form), 'member active khác không bị tick sẵn');
  assert.ok(!form.includes('e_evatt_mai'), 'member đã ngừng hoạt động không có ô tick');
});

test('saveEvent: tạo sự kiện mới qua form -> đủ field + 3 mảng liên kết rỗng + ghi xuống kho; tên rỗng bị chặn', () => {
  const h = loadIndex(); loginAsZac(h);
  h.run('openEventForm()');
  h.getEl('e_evname').value = '   ';
  h.run('saveEvent(null)');
  assert.equal(h.run('S.events.length'), 1, 'tên rỗng -> không tạo sự kiện');
  h.getEl('e_evname').value = 'Expo Game 2026';
  h.getEl('e_evdate').value = '20-11-2026';
  h.getEl('e_evlocation').value = 'GEM Center';
  h.getEl('e_evnote').value = 'Mang theo namecard';
  h.getEl('e_evatt_zac').checked = true;
  h.getEl('e_evatt_linh').checked = true;
  h.run('saveEvent(null)');
  const ev = h.run('S.events[S.events.length-1]');
  assert.equal(ev.name, 'Expo Game 2026');
  assert.equal(ev.date, '2026-11-20', 'ngày nhập dd-mm-yyyy được parse về ISO khi lưu (định dạng lưu không đổi)');
  assert.equal(ev.location, 'GEM Center');
  assert.equal(ev.note, 'Mang theo namecard');
  assert.deepEqual([...ev.attendees], ['zac', 'linh']);
  assert.deepEqual([...ev.companies], []); assert.deepEqual([...ev.leads], []); assert.deepEqual([...ev.deals], []);
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.events[saved.events.length - 1].name, 'Expo Game 2026', 'sự kiện ghi xuống kho qua save()');
  assert.ok(h.getEl('drawer').innerHTML.includes('Expo Game 2026'), 'lưu xong mở lại drawer sự kiện');
});

/* ---------- Drawer event + gắn/gỡ qua picker ---------- */
test('openEvent: drawer có thông tin view-first + nút Sửa + 3 khối liên kết, picker chỉ chứa entity CHƯA gắn', () => {
  const h = loadIndex();
  h.run("openEvent('ev1')");
  const d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Triển lãm Game 2026') && d.includes("openEventForm('ev1')"), 'thông tin + nút Sửa mở form sửa');
  for (const head of ['🏢 Công ty từ sự kiện này', '📥 Lead từ sự kiện này', '📋 Deal từ sự kiện này']) assert.ok(d.includes(head), 'thiếu khối: ' + head);
  assert.ok(d.includes("openCompany('c1')"), 'công ty đã gắn bấm mở drawer công ty');
  assert.ok(d.includes("openDeal('d1')") && d.includes('Công ty Một'), 'deal đã gắn kèm tên công ty');
  assert.ok(d.includes('<option value="c2">'), 'picker công ty chứa công ty chưa gắn');
  assert.ok(!d.includes('<option value="c1">'), 'picker công ty KHÔNG chứa công ty đã gắn');
  assert.ok(d.includes('<option value="l1">') && d.includes('<option value="l2">'), 'picker lead chứa lead chưa gắn');
  assert.ok(d.includes('<option value="d2">') && !d.includes('<option value="d1">'), 'picker deal chỉ chứa deal chưa gắn');
  assert.ok(d.includes("createEntityFromEvent('ev1','company')") && d.includes("createEntityFromEvent('ev1','lead')") && d.includes("createEntityFromEvent('ev1','deal')"), 'cả 3 khối có nút ＋ Tạo mới qua pending link');
  assert.ok(d.includes("deleteEvent('ev1')"), 'có nút Xoá sự kiện');
});

test('gắn qua picker: entity vào đúng mảng của event + drawer vẽ lại + ghi kho; gắn lead KHÔNG đổi status lead', () => {
  const h = loadIndex();
  h.run("openEvent('ev1')");
  h.getEl('event_link_company').value = 'c2';
  h.run("attachEventLinkFromPicker('ev1','company')");
  assert.deepEqual([...ev1(h).companies], ['c1', 'c2']);
  h.getEl('event_link_lead').value = 'l2';
  h.run("attachEventLinkFromPicker('ev1','lead')");
  assert.deepEqual([...ev1(h).leads], ['l2']);
  assert.equal(h.run("S.leads.find(l=>l.id==='l2').status"), 'new', 'gắn lead vào sự kiện không được convert status lead (l2 chưa gắn deal nào)');
  h.getEl('event_link_deal').value = 'd2';
  h.run("attachEventLinkFromPicker('ev1','deal')");
  assert.deepEqual([...ev1(h).deals], ['d1', 'd2']);
  const d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes("openCompany('c2')") && d.includes("openLead('l2')") && d.includes("openDeal('d2')"), 'drawer vẽ lại có đủ entity vừa gắn');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.deepEqual(saved.events.find(e => e.id === 'ev1').companies, ['c1', 'c2'], 'gắn phải ghi xuống kho qua save()');
});

test('gỡ liên kết: detachEventLink bỏ id khỏi mảng event, entity vẫn còn nguyên', () => {
  const h = loadIndex();
  h.run("detachEventLink('ev1','company','c1')");
  assert.deepEqual([...ev1(h).companies], []);
  assert.ok(h.run("S.companies.some(c=>c.id==='c1')"), 'công ty vẫn còn trong CRM');
  h.run("detachEventLink('ev1','deal','d1')");
  assert.deepEqual([...ev1(h).deals], []);
  assert.ok(h.run("S.deals.some(d=>d.id==='d1')"));
});

/* ---------- Phía entity: nguồn sự kiện ---------- */
test('drawer lead/company/deal hiện nguồn sự kiện: chip ở lead cạnh Nguồn, khối ở company/deal, bấm mở được sự kiện', () => {
  const h = loadIndex();
  h.run("attachEventLink('ev1','lead','l1')");
  h.run("openLead('l1')");
  let d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Nguồn:') && d.includes('🎪 từ sự kiện Triển lãm Game 2026') && d.includes("openEvent('ev1')"), 'drawer lead hiện chip từ sự kiện cạnh Nguồn');
  h.run("openCompany('c1')");
  d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Sự kiện đã gặp') && d.includes('Triển lãm Game 2026') && d.includes("openEvent('ev1')"), 'drawer công ty hiện khối sự kiện đã gặp');
  h.run("openDeal('d1')");
  d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Từ sự kiện') && d.includes('Triển lãm Game 2026') && d.includes("openEvent('ev1')"), 'drawer deal hiện khối từ sự kiện');
  /* Entity không gắn sự kiện nào -> không hiện khối/chip sự kiện */
  h.run("openCompany('c2')");
  assert.ok(!h.getEl('drawer').innerHTML.includes('Sự kiện đã gặp'), 'công ty chưa gắn sự kiện không hiện khối rỗng');
});

/* ---------- Tạo mới entity từ sự kiện (pendingEventLink) ---------- */
test('tạo công ty từ sự kiện qua ĐÚNG form editCompany/saveCompany -> hiện ở CRM chung + khối event, mở lại drawer event', () => {
  const h = loadIndex();
  h.run("createEntityFromEvent('ev1','company')");
  assert.deepEqual({ ...h.run('pendingEventLink') }, { eventId: 'ev1', kind: 'company' });
  assert.ok(h.getEl('editBox').innerHTML.includes('id="e_cname"'), 'mở đúng form công ty sẵn có');
  h.getEl('e_cname').value = 'Công ty Sự Kiện';
  h.getEl('e_ctype').value = 'Doanh nghiệp';
  h.run('saveCompany(null)');
  const nc = h.run("S.companies.find(c=>c.name==='Công ty Sự Kiện')");
  assert.ok(nc, 'công ty mới có trong CRM chung');
  assert.ok(ev1(h).companies.includes(nc.id), 'công ty mới được gắn vào sự kiện');
  assert.equal(h.run('pendingEventLink'), null, 'pending được tiêu thụ sau khi lưu');
  const d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('Triển lãm Game 2026') && d.includes('Công ty Sự Kiện'), 'sau lưu mở lại drawer sự kiện và thấy công ty mới trong khối');
});

test('tạo lead từ sự kiện: form mặc định source "Sự kiện"; lead mới có source đó, status KHÔNG converted, gắn vào event', () => {
  const h = loadIndex();
  h.run("createEntityFromEvent('ev1','lead')");
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('<option value="Sự kiện" selected>'), 'form lead mở từ sự kiện mặc định nguồn = Sự kiện');
  h.getEl('e_lname').value = 'Người Sự Kiện';
  h.getEl('e_lline').value = 'publishing';
  h.getEl('e_lcompany').value = 'c1';
  h.getEl('e_lperson').value = '';
  h.getEl('e_lphone').value = '';
  h.getEl('e_lsource').value = 'Sự kiện';
  h.getEl('e_lstatus').value = 'new';
  h.getEl('e_lwhen').value = '';
  h.getEl('e_lnote').value = '';
  h.run('saveLead(null)');
  const nl = h.run("S.leads.find(l=>l.name==='Người Sự Kiện')");
  assert.ok(nl, 'lead mới có trong CRM chung');
  assert.equal(nl.source, 'Sự kiện');
  assert.equal(nl.status, 'new', 'lead gắn vào sự kiện (chưa gắn deal) không bị converted');
  assert.ok(ev1(h).leads.includes(nl.id), 'lead mới được gắn vào sự kiện');
  assert.equal(h.run('pendingEventLink'), null);
  assert.ok(h.getEl('drawer').innerHTML.includes('Người Sự Kiện'), 'mở lại drawer sự kiện thấy lead mới');
});

test('tạo deal từ sự kiện qua ĐÚNG form openAdd/saveDeal -> deal vào pipeline + khối event, mở lại drawer event', () => {
  const h = loadIndex();
  h.run("createEntityFromEvent('ev1','deal')");
  assert.deepEqual({ ...h.run('pendingEventLink') }, { eventId: 'ev1', kind: 'deal' });
  h.getEl('f_title').value = 'Deal Từ Sự Kiện';
  h.getEl('f_line').value = 'ai';
  h.getEl('f_company').value = 'c2';
  h.getEl('f_amount').value = '';
  h.getEl('f_cur').value = 'VND';
  h.getEl('f_stage').value = 'prospect';
  h.getEl('f_owner').value = 'zac';
  h.run('saveDeal()');
  const nd = h.run("S.deals.find(d=>d.title==='Deal Từ Sự Kiện')");
  assert.ok(nd, 'deal mới có trong pipeline chung');
  assert.ok(ev1(h).deals.includes(nd.id), 'deal mới được gắn vào sự kiện');
  assert.equal(h.run('pendingEventLink'), null);
  assert.ok(h.getEl('drawer').innerHTML.includes('Deal Từ Sự Kiện'), 'mở lại drawer sự kiện thấy deal mới');
});

test('huỷ form giữa chừng xoá pending: tạo lead thường sau đó KHÔNG bị gắn nhầm vào sự kiện, nguồn không còn mặc định Sự kiện', () => {
  const h = loadIndex();
  h.run("createEntityFromEvent('ev1','lead')");
  assert.ok(h.run('pendingEventLink'));
  h.run('closeEdit()');
  assert.equal(h.run('pendingEventLink'), null, 'closeEdit xoá pending');
  h.run("createEntityFromEvent('ev1','deal')");
  assert.ok(h.run('pendingEventLink'));
  h.run('closeAdd()');
  assert.equal(h.run('pendingEventLink'), null, 'closeAdd xoá pending');
  h.run('editLead(null)');
  assert.ok(!h.getEl('editBox').innerHTML.includes('<option value="Sự kiện" selected>'), 'không còn pending -> form lead thường không mặc định nguồn Sự kiện');
  h.getEl('e_lname').value = 'Lead Thường';
  h.getEl('e_lline').value = 'ai';
  h.getEl('e_lcompany').value = '';
  h.getEl('e_lperson').value = '';
  h.getEl('e_lphone').value = '';
  h.getEl('e_lsource').value = '';
  h.getEl('e_lstatus').value = 'new';
  h.getEl('e_lwhen').value = '';
  h.getEl('e_lnote').value = '';
  h.run('saveLead(null)');
  const nl = h.run("S.leads.find(l=>l.name==='Lead Thường')");
  assert.ok(nl && !ev1(h).leads.includes(nl.id), 'lead tạo thường không bị gắn vào sự kiện');
});

/* ---------- Xoá ---------- */
test('xoá sự kiện: confirm nêu rõ số liên kết từng loại + entity vẫn giữ nguyên; xoá xong liên kết mất', () => {
  const h = loadIndex();
  h.run("attachEventLink('ev1','lead','l1')");
  h.run("deleteEvent('ev1')");
  assert.equal(h.run('S.events.length'), 0, 'sự kiện bị xoá');
  assert.ok(h.run("S.companies.some(c=>c.id==='c1')") && h.run("S.leads.some(l=>l.id==='l1')") && h.run("S.deals.some(d=>d.id==='d1')"), 'company/lead/deal vẫn giữ nguyên trong CRM');
  const msg = h.confirmMsgs[h.confirmMsgs.length - 1] || '';
  assert.ok(msg.includes('1 công ty') && msg.includes('1 lead') && msg.includes('1 deal'), 'confirm nêu số liên kết từng loại: ' + msg);
  assert.ok(msg.includes('vẫn giữ nguyên'), 'confirm khẳng định entity giữ nguyên');
  h.run("openLead('l1')");
  assert.ok(!h.getEl('drawer').innerHTML.includes('từ sự kiện'), 'chip nguồn sự kiện ở lead biến mất sau khi xoá sự kiện');
});

test('xoá entity: liên kết trong mọi sự kiện bị gỡ, sự kiện vẫn còn', () => {
  const h = loadIndex();
  h.run("attachEventLink('ev1','lead','l1')");
  h.run("deleteCompany('c1')");
  assert.deepEqual([...ev1(h).companies], [], 'xoá công ty -> ev.companies mất id công ty');
  assert.ok(ev1(h), 'sự kiện vẫn còn');
  h.run("deleteLead('l1')");
  assert.deepEqual([...ev1(h).leads], [], 'xoá lead -> ev.leads mất id lead');
  h.run("performDeleteDeal('d1')");
  assert.deepEqual([...ev1(h).deals], [], 'xoá deal -> ev.deals mất id deal');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.deepEqual(saved.events.find(e => e.id === 'ev1').deals, [], 'dọn liên kết ghi xuống kho cùng lần save của thao tác xoá');
});

/* ---------- Lịch sử tổng + phạm vi ---------- */
test('lịch sử tổng: auditHistEntity có nhánh event; tĩnh: chỉ 1 bộ form/hàm sự kiện, MKT không có bề mặt sự kiện', () => {
  const h = loadIndex();
  assert.equal(h.run('AUDIT_NAME_FIELDS.event'), 'name');
  assert.ok(h.run("AUDIT_HISTORY_TYPES.some(([k])=>k==='event')"));
  const ent = h.run("auditHistEntity('event','ev1')");
  assert.equal(ent.name, 'Triển lãm Game 2026');
  assert.equal(ent.open, 'openEvent');
  const idx = read('index.html');
  for (const fn of ['function vEvents(', 'function openEvent(', 'function openEventForm(', 'function saveEvent(']) {
    assert.equal((idx.match(new RegExp(fn.replace(/[()]/g, '\\$&'), 'g')) || []).length, 1, 'đúng 1 định nghĩa: ' + fn);
  }
  assert.ok(idx.includes('typeBadgeHTML("event")') || idx.includes("typeBadgeHTML('event')"), 'drawer/form sự kiện dùng badge loại event dùng chung');
  const mkt = read('mkt.html');
  assert.ok(!mkt.includes('openEvent') && !mkt.includes('data-view="events"'), 'mkt.html không có bề mặt sự kiện');
});
