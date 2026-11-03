/* Phần 2B — gợi ý phòng trùng NGAY KHI GÕ trong form thêm mới:
   - Engine vẫn là SavaDedupe (Phần 1): typeahead chỉ thêm NGƯỠNG HIỂN THỊ
     0.50 (< ngưỡng cảnh báo 0.70) + cửa token/prefix, tối đa 6 mục,
     debounce 300ms; khớp tuyệt đối (domain/nameKey/slug) ghim đầu.
   - Bề mặt: form công ty (ô Tên e_cname + ô Website e_cp_website + ô
     LinkedIn e_cp_linkedinUrl), form lead (ô tên e_lname — CHỈ lead của
     công ty đang chọn ở e_lcompany), form game (ô tên e_gtitle).
   - Bấm gợi ý -> mở drawer bản ghi đích LÊN TRÊN form và GIỮ NGUYÊN dữ
     liệu đang gõ (khác nút [Xem] Phần 2 vốn closeEdit() huỷ form).
   - Esc đóng gợi ý không xoá chữ; Enter không chọn gợi ý.
   - Cảnh báo Phần 2 (vùng e_company_dedupe_warn + chốt confirm khi Lưu)
     vẫn còn nguyên — suite dedupe-warnings kiểm riêng phần đó. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Alpha Games', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay', website: 'https://www.alpha.vn/about', linkedinUrl: 'https://www.linkedin.com/company/alpha-games/' },
      { id: 'c2', name: 'Beta Studio', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm qua', website: 'beta.vn', linkedinUrl: '' },
      { id: 'c3', name: 'Sava Meta', type: 'Doanh nghiệp', roles: {}, last: 'Hôm nay', website: 'savameta.com', linkedinUrl: '' },
      { id: 'c4', name: 'Meta Sava', type: 'Doanh nghiệp', roles: {}, last: 'Hôm nay', website: '', linkedinUrl: '' },
    ],
    games: [
      { id: 'g1', title: 'Puzzle Cats', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' },
      { id: 'g2', title: 'Puzzle Dogs', own: 'partner', company: 'c2', genre: 'Puzzle', platform: 'Android', stage: 'Concept', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' },
      { id: 'g3', title: 'Dragon Merge', own: 'ours', genre: 'Merge', platform: 'iOS', stage: 'Alpha', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' },
    ],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'zac', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'd2', line: 'publishing', title: 'Deal Hai', company: 'c1', stage: 'contact', owner: 'zac', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
    ],
    leads: [
      { id: 'l1', name: 'Nguyễn Văn Đức', company: 'c1', person: 'CEO', phone: '0901', email: '', linkedinUrl: '', ownerId: 'zac', line: 'publishing', source: 'Giới thiệu', status: 'qualified', note: '', when: '2026-10-01', mainContact: false },
      { id: 'l2', name: 'Nguyễn Văn Dũng', company: 'c1', person: 'CTO', phone: '', email: '', linkedinUrl: '', ownerId: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-02', mainContact: false },
      { id: 'l3', name: 'Nguyễn Văn Đức', company: 'c2', person: 'Manager', phone: '', email: '', linkedinUrl: '', ownerId: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-03', mainContact: false },
    ],
    tasks: [], activities: [],
    events: [{ id: 'ev1', name: 'Expo 2026', date: '2026-10-15', location: 'SECC', note: '', attendees: ['zac'], companies: [], leads: [], deals: [] }],
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
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'dedupe.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

/* ---------- Tĩnh ---------- */
test('tĩnh: đủ 5 hộp gợi ý + hook gõ cho lead/game, hook công ty giữ nguyên thuộc tính Phần 2, CSS ta-* + drawer nâng lớp', () => {
  for (const id of ['ta_company_name', 'ta_company_website', 'ta_company_linkedin', 'ta_lead_name', 'ta_game_title']) {
    assert.ok(html.includes(`id="${id}"`), 'thiếu hộp gợi ý ' + id);
    assert.ok(html.includes('data-ta-box="1"'), 'hộp gợi ý phải mang data-ta-box');
  }
  assert.ok(html.includes(`oninput="scheduleTypeahead('lead-name')"`), 'ô tên lead thiếu hook gợi ý');
  assert.ok(html.includes(`oninput="scheduleTypeahead('game-title')"`), 'ô tên game thiếu hook gợi ý');
  assert.ok(html.includes(`oninput="scheduleCompanyDedupeCheck('form')"`), 'hook Phần 2 ở ô tên công ty phải giữ nguyên văn');
  assert.ok(html.includes('id="e_company_dedupe_warn"') && html.includes('companyDedupeConfirmOnSave("form")'), 'cảnh báo Phần 2 phải còn nguyên');
  const css = read('workspace-design.css');
  assert.ok(css.includes('.ta-list') && css.includes('.ta-item') && css.includes('.ta-over-modal'), 'CSS thiếu lớp gợi ý / lớp nâng drawer');
  assert.ok(css.includes('text-overflow:ellipsis'), 'tên dài phải cắt ellipsis trên viewport hẹp');
});

test('ngưỡng hiển thị: 0.50 < ngưỡng cảnh báo SavaDedupe 0.70; giới hạn 6 mục; debounce 300ms', () => {
  const h = loadIndex();
  assert.equal(h.run('TYPEAHEAD_DISPLAY_THRESHOLD'), 0.5);
  assert.ok(h.run('TYPEAHEAD_DISPLAY_THRESHOLD') < h.run('SavaDedupe.SIMILARITY_THRESHOLD'));
  assert.equal(h.run('TYPEAHEAD_LIMIT'), 6);
  assert.equal(h.run('TYPEAHEAD_DEBOUNCE_MS'), 300);
});

/* ---------- Xếp hạng thuần (công ty) ---------- */
test('công ty theo tên: nameKey tuyệt đối ghim đầu, tên giống >70% xếp sau kèm nhãn lý do %', () => {
  const h = loadIndex();
  const r = h.run(`typeaheadCompanyMatches('name', 'Sava Meta')`);
  assert.deepEqual([...r.map(x => x.company.id)], ['c3', 'c4'], 'trùng tuyệt đối (c3) phải trước đảo-từ giống 87% (c4)');
  assert.equal(r[0].exact, true);
  assert.ok(r[0].reasons.join(' ').includes('tên trùng khớp'));
  assert.ok(r[1].score > 0.7 && /tên giống \d+%/.test(r[1].reasons.join(' ')), 'mục >70% phải kèm nhãn lý do kèm %');
});

test('công ty theo tên: gõ dở / giống 50–70% vẫn hiện (dưới ngưỡng cảnh báo), khác hẳn thì không', () => {
  const h = loadIndex();
  const r = h.run(`typeaheadCompanyMatches('name', 'Alpha Game')`);
  assert.equal(r[0].company.id, 'c1');
  assert.ok(r[0].score > 0.7);
  const partial = h.run(`typeaheadCompanyMatches('name', 'Alph')`);
  assert.ok([...partial.map(x => x.company.id)].includes('c1'), 'gõ dở "Alph" phải gợi ý Alpha Games');
  assert.deepEqual([...h.run(`typeaheadCompanyMatches('name', 'XYZ Studio')`)], [], 'chỉ chung token Studio (0.334) không được gợi ý');
});

test('công ty theo Website: domain tuyệt đối (biến thể URL) lên đầu kèm lý do trùng domain; gõ dở domain cũng khớp', () => {
  const h = loadIndex();
  const r = h.run(`typeaheadCompanyMatches('website', 'https://alpha.vn/lien-he')`);
  assert.equal(r.length, 1);
  assert.equal(r[0].company.id, 'c1');
  assert.equal(r[0].exact, true);
  assert.ok(r[0].reasons.join(' ').includes('trùng domain alpha.vn'));
  const partial = h.run(`typeaheadCompanyMatches('website', 'alpha.v')`);
  assert.deepEqual([...partial.map(x => x.company.id)], ['c1'], 'đang gõ dở domain alpha.v phải khớp alpha.vn');
});

test('công ty theo LinkedIn: slug tuyệt đối -> exact kèm lý do; sửa công ty loại chính nó khỏi mọi bề mặt', () => {
  const h = loadIndex();
  const r = h.run(`typeaheadCompanyMatches('linkedin', 'linkedin.com/company/Alpha-Games')`);
  assert.equal(r.length, 1);
  assert.equal(r[0].company.id, 'c1');
  assert.ok(r[0].reasons.join(' ').includes('trùng LinkedIn alpha-games'));
  h.run(`editCompany('c1')`);
  assert.ok(![...h.run(`typeaheadCompanyMatches('name', 'Alpha Games')`)].some(x => x.company.id === 'c1'), 'đang sửa c1 thì c1 không tự gợi ý (tên)');
  assert.ok(![...h.run(`typeaheadCompanyMatches('website', 'alpha.vn')`)].some(x => x.company.id === 'c1'), 'đang sửa c1 thì c1 không tự gợi ý (website)');
});

test('giới hạn hiển thị: nhiều ứng viên giống nhau -> tối đa 6 mục', () => {
  const st = fixtureState();
  st.companies = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, name: 'Alpha Studio ' + (i + 1), type: 'Game studio', roles: {}, last: '', website: '', linkedinUrl: '' }));
  const h = loadIndex(st);
  const r = h.run(`typeaheadCompanyMatches('name', 'Alpha Studio')`);
  assert.equal(r.length, 6);
});

/* ---------- Render + tương tác: form công ty ---------- */
test('form công ty: render gợi ý ở ô Website đủ tên + domain + mảng + số lead/deal + lý do; debounce chỉ hiện sau nhịp chờ', async () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cp_website').value = 'https://alpha.vn/lien-he';
  const items = h.run(`refreshTypeahead('company-website')`);
  assert.equal(items.length, 1);
  const box = h.getEl('ta_company_website').innerHTML;
  assert.ok(box.includes('Alpha Games') && box.includes('alpha.vn'), 'dòng gợi ý phải có tên + domain');
  assert.ok(box.includes('Publishing: Game studio'), 'dòng gợi ý phải có mảng/vai trò của công ty');
  assert.ok(box.includes('2 lead') && box.includes('2 deal'), 'dòng gợi ý phải có số lead + số deal đang gắn');
  assert.ok(box.includes('trùng domain alpha.vn'), 'mục tuyệt đối phải kèm nhãn lý do');
  assert.ok(box.includes(`typeaheadOpenCompany('c1')`), 'bấm dòng phải mở qua đường giữ-form typeaheadOpenCompany');
  /* debounce: lên lịch xong chưa hiện ngay, sau ~300ms mới hiện */
  h.getEl('e_cname').value = 'Alpha Game';
  h.run(`scheduleTypeahead('company-name')`);
  assert.equal(h.getEl('ta_company_name').innerHTML, '', 'debounce chưa tới nhịp thì hộp vẫn trống');
  await new Promise(res => setTimeout(res, 420));
  assert.ok(h.getEl('ta_company_name').innerHTML.includes('Alpha Games'), 'sau nhịp debounce gợi ý phải hiện');
});

test('bấm gợi ý công ty: drawer đích mở LÊN TRÊN form, chữ đã gõ + pendingEventLink GIỮ NGUYÊN; đóng drawer quay lại form còn nguyên', () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Alpha Gam';
  h.getEl('e_cp_website').value = 'https://alpha.vn/x';
  h.getEl('e_cp_industry').value = 'Game';
  h.run(`pendingEventLink = { eventId: 'ev1', kind: 'company' }`);
  h.run(`typeaheadOpenCompany('c1')`);
  assert.equal(h.run('drawerCtx.id'), 'c1', 'drawer mở phải là công ty được gợi ý');
  assert.ok(h.getEl('drawer').innerHTML.includes('Alpha Games'));
  assert.equal(h.getEl('drawer').style.zIndex, '80', 'drawer xem-trước phải được nâng lên trên modal form');
  assert.equal(h.getEl('e_cname').value, 'Alpha Gam', 'tên đang gõ phải giữ nguyên khi drawer mở');
  assert.equal(h.getEl('e_cp_website').value, 'https://alpha.vn/x');
  assert.equal(h.getEl('e_cp_industry').value, 'Game');
  assert.ok(h.run('pendingEventLink') && h.run('pendingEventLink.eventId') === 'ev1', 'KHÔNG được gọi closeEdit(): pendingEventLink phải còn nguyên (khác nút Xem của Phần 2)');
  h.run('closeDrawer()');
  assert.equal(h.getEl('drawer').style.zIndex, '', 'đóng drawer phải gỡ lớp nâng');
  assert.equal(h.getEl('e_cname').value, 'Alpha Gam', 'đóng drawer quay lại: form còn nguyên từng chữ');
  assert.equal(h.getEl('e_cp_website').value, 'https://alpha.vn/x');
});

test('Esc đóng gợi ý không xoá chữ đã gõ; Enter KHÔNG chọn gợi ý; bấm ra ngoài đóng gợi ý', () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Alpha Game';
  h.run(`refreshTypeahead('company-name')`);
  assert.ok(h.getEl('ta_company_name').innerHTML.includes('Alpha Games'));
  assert.equal(h.run(`typeaheadHandleKeydown({ key: 'Enter', target: { id: 'e_cname' } })`), false, 'Enter không được xử lý bởi typeahead');
  assert.ok(h.getEl('ta_company_name').innerHTML.includes('Alpha Games'), 'Enter không được chọn/đóng gợi ý thay thao tác mặc định');
  assert.equal(h.run('drawerCtx'), null, 'Enter không được mở drawer nào');
  assert.equal(h.run(`typeaheadHandleKeydown({ key: 'Escape', target: { id: 'e_cname' } })`), true);
  assert.equal(h.getEl('ta_company_name').innerHTML, '', 'Esc phải đóng gợi ý');
  assert.equal(h.getEl('e_cname').value, 'Alpha Game', 'Esc không được xoá chữ đã gõ');
  h.run(`refreshTypeahead('company-name')`);
  assert.ok(h.getEl('ta_company_name').innerHTML.includes('Alpha Games'));
  assert.equal(h.run(`typeaheadHandleDocumentClick({ target: { id: 'view' } })`), true, 'bấm ra ngoài phải đóng gợi ý');
  assert.equal(h.getEl('ta_company_name').innerHTML, '');
});

/* ---------- Lead ---------- */
test('lead: CHỈ gợi ý lead của công ty đang chọn (cùng tên ở công ty khác bị loại); chưa chọn công ty -> không gợi ý', () => {
  const h = loadIndex();
  const inC1 = h.run(`typeaheadLeadMatches('Nguyễn Văn Đức', 'c1')`);
  assert.deepEqual([...inC1.map(x => x.lead.id)], ['l1', 'l2'], 'c1: l1 tuyệt đối đầu, l2 giống >70% sau; l3 cùng tên nhưng công ty c2 bị loại');
  assert.ok(inC1[1].reasons.join(' ').includes('tên giống'), 'l2 >70% phải kèm nhãn lý do');
  assert.deepEqual([...h.run(`typeaheadLeadMatches('Nguyễn Văn Đức', '')`)], [], 'chưa chọn công ty -> không gợi ý');
  assert.deepEqual([...h.run(`typeaheadLeadMatches('Nguyễn Văn Đức', '__new__')`)], [], 'đang tạo công ty mới -> không gợi ý');
  /* render thật qua form: select công ty quyết định pool */
  h.run('editLead(null)');
  h.getEl('e_lcompany').value = 'c1';
  h.getEl('e_lname').value = 'Nguyễn Văn Đứ';
  const items = h.run(`refreshTypeahead('lead-name')`);
  assert.ok(items.length >= 1 && items[0].lead.id === 'l1');
  const box = h.getEl('ta_lead_name').innerHTML;
  assert.ok(box.includes('Nguyễn Văn Đức') && box.includes('CEO'), 'dòng gợi ý lead: tên người + chức danh (person/Position)');
  assert.ok(!box.includes('Manager'), 'lead của công ty khác không được xuất hiện');
});

test('bấm gợi ý lead: drawer lead mở, form lead giữ nguyên; sửa lead loại chính nó', () => {
  const h = loadIndex();
  h.run('editLead(null)');
  h.getEl('e_lcompany').value = 'c1';
  h.getEl('e_lname').value = 'Nguyễn Văn Đứ';
  h.getEl('e_lnote').value = 'ghi chú đang gõ dở';
  h.run(`typeaheadOpenLead('l1')`);
  assert.equal(h.run('drawerCtx.type'), 'lead');
  assert.equal(h.run('drawerCtx.id'), 'l1');
  assert.equal(h.getEl('e_lname').value, 'Nguyễn Văn Đứ', 'tên đang gõ giữ nguyên');
  assert.equal(h.getEl('e_lnote').value, 'ghi chú đang gõ dở');
  h.run('closeDrawer()');
  assert.equal(h.getEl('e_lname').value, 'Nguyễn Văn Đứ', 'đóng drawer: form lead còn nguyên');
  const h2 = loadIndex();
  h2.run(`editLead('l1')`);
  assert.ok(![...h2.run(`typeaheadLeadMatches('Nguyễn Văn Đức', 'c1')`)].some(x => x.lead.id === 'l1'), 'sửa l1 thì l1 không tự gợi ý');
});

/* ---------- Game ---------- */
test('game: tên gần giống xếp đúng hạng; ca token/prefix điểm thấp ("Cat") vẫn gợi ý Puzzle Cats; dòng có studio + genre', () => {
  const h = loadIndex();
  const r = h.run(`typeaheadGameMatches('Puzzle Cat')`);
  assert.equal(r[0].game.id, 'g1', 'Puzzle Cat (0.626) phải đứng đầu cho Puzzle Cats');
  const cat = h.run(`typeaheadGameMatches('Cat')`);
  assert.ok([...cat.map(x => x.game.id)].includes('g1'), '"Cat" là tiền tố token "Cats" -> gợi ý dù điểm engine chỉ 0.10');
  h.run('editGame(null)');
  h.getEl('e_gtitle').value = 'Puzzle Cat';
  const items = h.run(`refreshTypeahead('game-title')`);
  assert.equal(items[0].game.id, 'g1');
  const box = h.getEl('ta_game_title').innerHTML;
  assert.ok(box.includes('Puzzle Cats') && box.includes('Alpha Games') && box.includes('Puzzle'), 'dòng gợi ý game: tên + studio + genre');
});

test('bấm gợi ý game: drawer game mở, form game giữ nguyên; sửa game loại chính nó', () => {
  const h = loadIndex();
  h.run('editGame(null)');
  h.getEl('e_gtitle').value = 'Puzzle Cat';
  h.getEl('e_gdesc').value = 'mô tả đang gõ dở';
  h.run(`typeaheadOpenGame('g1')`);
  assert.equal(h.run('drawerCtx.type'), 'game');
  assert.equal(h.run('drawerCtx.id'), 'g1');
  assert.equal(h.getEl('e_gtitle').value, 'Puzzle Cat');
  assert.equal(h.getEl('e_gdesc').value, 'mô tả đang gõ dở');
  h.run('closeDrawer()');
  assert.equal(h.getEl('e_gtitle').value, 'Puzzle Cat', 'đóng drawer: form game còn nguyên');
  const h2 = loadIndex();
  h2.run(`editGame('g1')`);
  assert.ok(![...h2.run(`typeaheadGameMatches('Puzzle Cats')`)].some(x => x.game.id === 'g1'), 'sửa g1 thì g1 không tự gợi ý');
});
