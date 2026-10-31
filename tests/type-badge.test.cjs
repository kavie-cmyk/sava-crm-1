/* Nhãn LOẠI đối tượng ở vùng tiêu đề khi MỞ chi tiết:
   - Một helper DUY NHẤT typeBadgeHTML + một class CSS DUY NHẤT .type-badge
     (shared.js; CSS định nghĩa giống hệt trong index.html + publishing.css).
     Bộ icon/tên TÁI SỬ DỤNG bộ chip liên kết việc của commit 732fcc8
     (TASK_LINK_META: 📋 Deal / 🏢 Công ty / 📥 Lead / 🎮 Game), mở rộng cùng
     phong cách: ✅ Công việc / 👤 Thành viên / 🕘 Hoạt động /
     📊 Mechanic / 🏢 Đánh giá Partner / 🎮 Đánh giá Game (phía Publishing,
     theo kind của request — đúng cách gọi sẵn có của app).
   - Bề mặt GẮN badge: drawer Deal/Company/Lead/Game/Member (index.html),
     form sửa/tạo việc (editTask — form "mở một mục" của Công việc),
     one-pager Partner (tên công ty trong mục Tổng quan), dialog review
     kind=game + kind=company và dialog chi tiết mechanic (publishing.js —
     dùng chung cho publishing.html phía BD và mkt.html phía MKT).
   - Bề mặt ĐÃ RÕ LOẠI SẴN, không gắn: các form sửa còn lại (tiêu đề đã ghi
     thẳng loại: "✏️ Sửa deal / Sửa công ty / Sửa game / Sửa lead /
     Sửa thành viên / Sửa hoạt động"), form tạo deal ("Thêm deal mới"),
     dialog "Gửi yêu cầu đánh giá" + "Thêm/Bổ sung quan sát thị trường"
     phía Publishing (tiêu đề đã ghi loại, không phải mở một mục cụ thể).
   - Badge chỉ chứa LOẠI, không chứa tên -> tên đối tượng rỗng/thiếu vẫn
     hiện đúng badge cạnh tiêu đề fallback của app.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Tĩnh: helper dùng chung + tái sử dụng bộ chip 732fcc8 ---------- */
test('tĩnh: typeBadgeHTML là helper duy nhất trong shared.js, tái sử dụng đúng icon/tên của TASK_LINK_META (732fcc8)', () => {
  const shared = read('shared.js'), idx = read('index.html');
  assert.equal((shared.match(/function typeBadgeHTML\(/g) || []).length, 1, 'phải có đúng 1 helper typeBadgeHTML');
  assert.ok(shared.includes('window.typeBadgeHTML = typeBadgeHTML'), 'helper phải phơi qua window cho publishing.js');
  for (const [icon, noun] of [['📋', 'Deal'], ['🏢', 'Công ty'], ['📥', 'Lead'], ['🎮', 'Game']]) {
    assert.ok(idx.includes(`{ icon: "${icon}", noun: "${noun}"`), 'TASK_LINK_META mất cặp ' + icon + ' ' + noun);
    assert.ok(shared.includes(`icon: "${icon}", noun: "${noun}"`), 'badge phải tái sử dụng cặp ' + icon + ' ' + noun + ' của TASK_LINK_META');
  }
  for (const s of ['✅", noun: "Công việc"', '👤", noun: "Thành viên"', '🏢", noun: "Đánh giá Partner"', '🎮", noun: "Đánh giá Game"', '📊", noun: "Mechanic / Thị trường"']) {
    assert.ok(shared.includes('icon: "' + s), 'thiếu nhãn mở rộng trong TYPE_BADGE_META: ' + s);
  }
  assert.ok(!idx.includes('function typeBadgeHTML'), 'index.html không được định nghĩa lại helper');
  assert.ok(!read('publishing.js').includes('function typeBadgeHTML'), 'publishing.js không được định nghĩa lại helper');
});

test('tĩnh: class .type-badge định nghĩa giống hệt ở index.html và publishing.css', () => {
  const grab = src => { const m = src.match(/\.type-badge\s*\{([^}]*)\}/); return m ? m[1].replace(/\s+/g, ' ').trim() : null; };
  const a = grab(read('index.html')), b = grab(read('publishing.css'));
  assert.ok(a && b, 'thiếu .type-badge ở một trong hai stylesheet');
  assert.equal(a, b, '.type-badge hai nơi phải giống hệt nhau (một chuẩn chung)');
});

test('tĩnh: các bề mặt đã rõ loại sẵn giữ nguyên tiêu đề, không gắn badge thừa', () => {
  const idx = read('index.html');
  for (const s of ['✏️ Sửa deal', '✏️ Sửa công ty', '🎮 Thêm game', '✏️ Sửa lead', '📥 Thêm lead', '✏️ Sửa thành viên', '✏️ Sửa hoạt động', 'Thêm deal mới']) {
    assert.ok(idx.includes(s), 'mất tiêu đề đã rõ loại: ' + s);
  }
  const pub = read('publishing.js');
  assert.ok(pub.includes("head('Gửi yêu cầu đánh giá')"), 'dialog gửi yêu cầu giữ head thường');
  assert.ok(pub.includes("head(old?'Bổ sung quan sát · '+old.name:'Thêm quan sát thị trường')"), 'form quan sát giữ head thường');
});

/* ---------- Harness index.html THẬT (mẫu task-context-link.test.cjs) ---------- */
const SAME = 'Trùng Tên';
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'm1', name: SAME, role: 'BD', active: true }],
    companies: [{ id: 'c1', name: SAME, type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: SAME, own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: SAME, company: 'c1', game: 'g1', stage: 'build_eval', owner: 'm1', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: SAME, company: 'c1', person: '', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01' }],
    tasks: [{ id: 't1', title: SAME, assignee: 'm1', due: '', dueDate: '', done: false, overdue: false, deal: 'd1' }],
    activities: [],
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
const badgeCount = (html, type) => (html.match(new RegExp(`data-type="${type}"`, 'g')) || []).length;
const totalBadges = html => (html.match(/class="type-badge"/g) || []).length;

test('index: helper typeBadgeHTML render đúng từng loại + loại lạ -> rỗng', () => {
  const { run } = loadIndex();
  const b = t => run(`typeBadgeHTML('${t}')`);
  assert.ok(b('deal').includes('📋 Deal') && b('deal').includes('data-type="deal"'));
  assert.ok(b('company').includes('🏢 Công ty'));
  assert.ok(b('lead').includes('📥 Lead'));
  assert.ok(b('game').includes('🎮 Game'));
  assert.ok(b('task').includes('✅ Công việc'));
  assert.ok(b('member').includes('👤 Thành viên'));
  assert.equal(b('khong-co-loai-nay'), '');
});

test('index: 5 drawer hiện badge loại ĐÚNG cạnh tên — kể cả khi mọi đối tượng TRÙNG TÊN nhau', () => {
  const { run, getEl } = loadIndex();
  const cases = [
    ["openDeal('d1')", 'deal', '📋 Deal', `<h2>${SAME}</h2>`],
    ["openCompany('c1')", 'company', '🏢 Công ty', `<h2>🏢 ${SAME}</h2>`],
    ["openLead('l1')", 'lead', '📥 Lead', `<h2>📥 ${SAME}</h2>`],
    ["openGame('g1')", 'game', '🎮 Game', `<h2>${SAME}</h2>`],
    ["openMember('m1')", 'member', '👤 Thành viên', `<h2>👤 ${SAME}</h2>`],
  ];
  for (const [open, type, label, h2] of cases) {
    run(open);
    const html = getEl('drawer').innerHTML;
    assert.ok(html.includes(h2), open + ': mất tiêu đề tên ' + h2);
    assert.ok(html.includes(label), open + ': thiếu nhãn loại ' + label);
    assert.equal(badgeCount(html, type), 1, open + ': phải có đúng 1 badge loại ' + type);
    assert.equal(totalBadges(html), 1, open + ': drawer chỉ được mang badge của chính loại đang mở');
    assert.ok(html.indexOf('class="type-badge"') < html.indexOf(h2), open + ': badge phải nằm ở vùng tiêu đề, ngay trước tên');
  }
});

test('index: tên đối tượng rỗng/thiếu -> badge vẫn hiện đúng loại cạnh tiêu đề fallback', () => {
  const st = fixtureState();
  st.deals[0].title = ''; st.companies[0].name = ''; st.games[0].title = ''; st.leads[0].name = ''; st.leads[0].person = '';
  const { run, getEl } = loadIndex(st);
  run("openDeal('d1')"); assert.ok(getEl('drawer').innerHTML.includes('data-type="deal"'), 'deal không tên vẫn có badge Deal');
  run("openCompany('c1')"); assert.ok(getEl('drawer').innerHTML.includes('data-type="company"'), 'công ty không tên vẫn có badge Công ty');
  run("openGame('g1')"); assert.ok(getEl('drawer').innerHTML.includes('data-type="game"'), 'game không tên vẫn có badge Game');
  run("openLead('l1')"); assert.ok(getEl('drawer').innerHTML.includes('data-type="lead"'), 'lead không tên vẫn có badge Lead');
});

test('index: form việc (editTask) hiện badge Công việc cho cả sửa việc có sẵn và tạo mới', () => {
  const { run, getEl } = loadIndex();
  run("editTask('t1')");
  let form = getEl('editBox').innerHTML;
  assert.ok(form.includes('data-type="task"') && form.includes('✅ Công việc'), 'form sửa việc thiếu badge Công việc');
  assert.ok(form.indexOf('class="type-badge"') < form.indexOf('id="e_ttitle"'), 'badge Công việc phải ở vùng đầu form, trước ô nội dung việc');
  run('editTask(null)');
  form = getEl('editBox').innerHTML;
  assert.ok(form.includes('data-type="task"'), 'form tạo việc thiếu badge Công việc');
});

test('index: one-pager Partner hiện badge Công ty ngay cạnh tên công ty', () => {
  const { run } = loadIndex();
  const html = run("partnerPagerHTML(S.companies[0])");
  assert.ok(html.includes('data-type="company"') && html.includes('🏢 Công ty'), 'one-pager thiếu badge Công ty');
  assert.ok(html.indexOf('class="type-badge"') < html.indexOf(`<b>${SAME}</b>`), 'badge phải đứng ngay trước tên công ty trong one-pager');
});

/* ---------- Harness publishing.js THẬT (BD + MKT dùng chung) ---------- */
function loadPublishing(role) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const crmState = {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }],
    companies: [{ id: 'c1', name: SAME, type: 'Game studio', roles: { publishing: 'Game studio' }, last: '' }],
    games: [{ id: 'g1', title: SAME, own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [], leads: [], tasks: [], activities: [], verticals: [],
  };
  const req = (id, kind, entityId) => ({ id, kind, entityId, status: 'Chờ đánh giá', requestedBy: 'zac', assignee: '', due: '', requestNote: '', build: '', source: '', intake: {}, current: null, revisions: [], revision: 0 });
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [req('REV-G', 'game', 'g1'), req('REV-C', 'company', 'c1')], marketUpdates: [] }));
  const makeEl = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => makeEl(), querySelectorAll: () => [],
    focus() {}, close() { this.open = false; }, showModal() { this.open = true; }, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map();
  const listeners = {};
  const documentStub = { readyState: 'complete', body: Object.assign(makeEl(), { dataset: { role } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeEl()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener: (t, fn) => { listeners[t] = fn; }, createElement: () => makeEl() };
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/' + (role === 'mkt' ? 'mkt' : 'publishing') + '.html' },
    addEventListener() {}, history: { replaceState() {} }, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const click = target => listeners.click({ target });
  const btnTarget = dataset => ({ closest: sel => (sel === 'button' ? { dataset, hasAttribute: () => false } : null) });
  return { ctx, elements, click, btnTarget };
}

for (const role of ['bd', 'mkt']) {
  test(`publishing (${role}): dialog review hiện badge theo kind — game = Đánh giá Game, company = Đánh giá Partner — dù TRÙNG TÊN`, () => {
    const { elements, click, btnTarget } = loadPublishing(role);
    const editor = () => elements.get('#editor').innerHTML;
    click(btnTarget({ review: 'REV-G' }));
    let html = editor();
    assert.ok(html.includes('data-type="game-review"') && html.includes('🎮 Đánh giá Game'), role + ': review game thiếu badge Đánh giá Game');
    assert.ok(html.includes(`<h2 id="editorTitle">${SAME}</h2>`), role + ': review game phải giữ tên game làm tiêu đề');
    assert.ok(html.indexOf('class="type-badge"') < html.indexOf('<h2 id="editorTitle">'), role + ': badge phải ở vùng dialog-head, trước tên');
    assert.ok(!html.includes('data-type="company-review"'), role + ': review game không được mang badge công ty');
    click(btnTarget({ review: 'REV-C' }));
    html = editor();
    assert.ok(html.includes('data-type="company-review"') && html.includes('🏢 Đánh giá Partner'), role + ': review company thiếu badge Đánh giá Partner');
    assert.ok(html.includes(`Đánh giá Partner — ${SAME}`), role + ': review company phải giữ tiêu đề sẵn có');
    assert.ok(!html.includes('data-type="game-review"'), role + ': review company không được mang badge game');
  });

  test(`publishing (${role}): dialog chi tiết mechanic hiện badge Mechanic / Thị trường ở tiêu đề`, () => {
    const { ctx, elements, click } = loadPublishing(role);
    const recId = ctx.window.PublishingData.records[0].id;
    const recName = ctx.window.PublishingData.records[0].name;
    click({ closest: sel => (sel === 'button' ? null : sel === '[data-market]' ? { dataset: { market: recId } } : null) });
    const html = elements.get('#editor').innerHTML;
    assert.ok(html.includes('data-type="market"') && html.includes('📊 Mechanic / Thị trường'), role + ': chi tiết mechanic thiếu badge loại');
    assert.ok(html.includes(`<h2 id="editorTitle">${recName}</h2>`), role + ': chi tiết mechanic phải giữ tên mechanic làm tiêu đề');
    assert.ok(html.indexOf('class="type-badge"') < html.indexOf('<h2 id="editorTitle">'), role + ': badge phải ở vùng dialog-head, trước tên');
  });
}

test('tĩnh publishing: openReview + marketDetail đi qua headTyped (window.typeBadgeHTML), head thường vẫn còn cho form tạo', () => {
  const pub = read('publishing.js');
  assert.ok(pub.includes('const headTyped = (title, type)'), 'thiếu headTyped');
  assert.ok(pub.includes('window.typeBadgeHTML'), 'headTyped phải dùng helper dùng chung qua window');
  assert.ok(pub.includes("headTyped(dialogTitle,isCompany?'company-review':'game-review')"), 'openReview chưa gắn badge theo kind');
  assert.ok(pub.includes("headTyped(r.name,'market')"), 'marketDetail chưa gắn badge mechanic');
});
