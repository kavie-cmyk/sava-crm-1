/* Việc 8 — PHÂN TRANG + THU GỌN/MỞ RỘNG cho mọi danh sách dài:
   - Logic thuần DÙNG CHUNG window.SavaPager (shared.js), tách từ mẫu
     chuẩn Lead Block (10 mục/trang, pager Trước/Sau disable ở biên,
     dòng "Trang X/Y · Đang hiện A–B / N mục", ≤1 trang thì ẩn pager).
   - List phẳng (Công ty/Game/Sự kiện/Thành viên/Việc): phân trang
     10/trang; sort (Việc 6) áp TRƯỚC phân trang, STT chạy LIÊN TỤC
     qua các trang; đổi lọc/tìm kiếm/sort -> về trang 1; hợp các trang
     = đúng tập đã lọc + sort (không mất, không trùng).
   - List theo nhóm/block (Việc theo người, Lịch sử tổng): thêm đóng/mở
     từng block — đóng chỉ còn header + tổng số, mở lại giữ trang.
   - List con trong drawer (lead/deal/việc/hoạt động của công ty…):
     phân trang ngay trong drawer, key riêng theo đối tượng.
   - Publishing (publishing.js dùng chung publishing.html + mkt.html):
     danh sách request + bảng thị trường cùng SavaPager.
   - Thao tác phân trang/đóng-mở là hiển thị THUẦN: kho localStorage
     nguyên từng byte, không state nào lọt vào S (như test tính thuần
     của Việc 6). Hai pipeline board (Deal + Lead) là NGOẠI LỆ giữ
     nguyên cơ chế cột tự cuộn — không thuộc file này.
   Fixture Công ty mô phỏng danh sách lớn: 25 công ty (qua 3 trang);
   các list khác đều >10 mục để qua nhiều trang. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const pubSrc = read('publishing.js');
const tick = () => new Promise(r => setTimeout(r, 0));
const pad = n => String(n).padStart(2, '0');

/* ================= (A) SavaPager thuần (shared.js) ================= */
function loadShared() {
  const ctx = vm.createContext({ console, URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaPager;
}
test('SavaPager: PAGE_SIZE = 10; info kẹp trang về [1, tổng trang]; from/to đúng vị trí 1-based', () => {
  const P = loadShared();
  assert.equal(P.PAGE_SIZE, 10);
  assert.deepEqual({ ...P.info(25, 1) }, { page: 1, totalPages: 3, total: 25, size: 10, start: 0, from: 1, to: 10 });
  assert.deepEqual({ ...P.info(25, 3) }, { page: 3, totalPages: 3, total: 25, size: 10, start: 20, from: 21, to: 25 });
  assert.equal(P.info(25, 99).page, 3, 'trang vượt -> kẹp về trang cuối hợp lệ');
  assert.equal(P.info(25, 0).page, 1, 'trang < 1 -> kẹp về 1');
  assert.deepEqual({ ...P.info(0, 5) }, { page: 1, totalPages: 1, total: 0, size: 10, start: 0, from: 0, to: 0 }, 'tập rỗng: 1 trang, from/to = 0');
  assert.equal(P.info(10, 2).page, 1, 'đúng 10 mục = 1 trang, trang 2 kẹp về 1');
});

test('SavaPager.slice: hợp các trang = đúng tập gốc, không mất/không trùng; THUẦN không mutate', () => {
  const P = loadShared();
  const items = Array.from({ length: 27 }, (_, i) => ({ id: 'x' + i }));
  const before = JSON.stringify(items);
  const seen = [];
  for (let p = 1; p <= 3; p++) {
    const { info, pageItems } = P.slice(items, p);
    assert.equal(info.page, p);
    seen.push(...pageItems.map(x => x.id));
  }
  assert.deepEqual(seen, items.map(x => x.id), 'ghép 3 trang phải ra đúng thứ tự + đủ 27 mục');
  assert.equal(new Set(seen).size, 27, 'không trùng mục giữa các trang');
  assert.equal(JSON.stringify(items), before, 'slice không mutate mảng/bản ghi vào');
});

/* ================= (B) Tích hợp UI phía BD (index.html) ================= */
function fixtureState() {
  const companies = Array.from({ length: 25 }, (_, i) => ({ id: 'comp' + pad(i + 1), name: 'Cong Ty ' + pad(i + 1), type: 'Studio', roles: { ai: 'Doanh nghiệp' }, last: 'Hôm qua' }));
  const members = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true },
    ...Array.from({ length: 12 }, (_, i) => ({ id: 'mem' + pad(i + 1), name: 'Member ' + pad(i + 1), role: 'BD', active: true }))];
  const games = Array.from({ length: 15 }, (_, i) => ({ id: 'game' + pad(i + 1), title: 'Game ' + pad(i + 1), own: 'partner', company: 'comp01', genre: 'Puzzle', platform: 'Android', stage: 'Dev', desc: '' }));
  const deals = Array.from({ length: 12 }, (_, i) => ({ id: 'deal' + pad(i + 1), line: 'ai', title: 'Deal ' + pad(i + 1), company: 'comp01', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 100, cur: 'VND', custom: {}, leads: [] }));
  const leads = Array.from({ length: 15 }, (_, i) => ({ id: 'lead' + pad(i + 1), name: 'Lead ' + pad(i + 1), company: 'comp01', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '' }));
  const tasks = [...Array.from({ length: 23 }, (_, i) => ({ id: 'task' + pad(i + 1), title: 'Viec ' + pad(i + 1), assignee: 'zac', done: false })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: 'ctask' + pad(i + 1), title: 'ViecCT ' + pad(i + 1), assignee: 'zac', done: false, company: 'comp01' }))];
  const activities = Array.from({ length: 12 }, (_, i) => ({ id: 'act' + pad(i + 1), deal: 'deal01', type: 'Note', who: 'zac', when: '2026-10-01', text: 'Act ' + pad(i + 1) }));
  const events = Array.from({ length: 12 }, (_, i) => ({ id: 'ev' + pad(i + 1), name: 'Event ' + pad(i + 1), date: '2026-11-01', location: '', note: '', attendees: [], companies: [], leads: [], deals: [] }));
  return { members, companies, games, deals, leads, tasks, activities, events, verticals: [] };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(fixtureState()));
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
  for (const f of ['apple-ui.js', 'shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
const viewOf = h => h.getEl('view').innerHTML;
const compRows = h => [...viewOf(h).matchAll(/<td class="list-stt">(\d+)<\/td><td><b>(Cong Ty \d+)<\/b>/g)].map(m => [Number(m[1]), m[2]]);
function renderView(h, view) { h.run(`curView = "${view}"; curLine = "all"; query = ""; render();`); }

test('tĩnh BD: lớp phân trang dùng chung (listPageSlice/listPagerHTML/setListPage/toggleListBlock + pagerSyncFilter) đi qua SavaPager; Lead Block uỷ quyền SavaPager', () => {
  for (const fn of ['function listPageSlice(', 'function listPagerHTML(', 'function setListPage(', 'function toggleListBlock(', 'function pagerSyncFilter(']) assert.ok(html.includes(fn), 'thiếu ' + fn);
  const seg = html.slice(html.indexOf('function setListPage('), html.indexOf('function toggleListBlock('));
  assert.ok(seg.includes('render()') && !/[^\/\w]save\(\)/.test(seg.replace(/\/\*[\s\S]*?\*\//g, '')), 'setListPage chỉ render lại, TUYỆT ĐỐI không save()');
  const leadSeg = html.slice(html.indexOf('function leadBlockPageInfo('), html.indexOf('function leadBlockPagerHTML('));
  assert.ok(leadSeg.includes('window.SavaPager.info'), 'leadBlockPageInfo phải uỷ quyền phép chia/kẹp trang cho SavaPager dùng chung');
});

test('Công ty (25 mục): trang 1 = 10 hàng STT 1–10 + pager đúng mẫu; trang cuối 5 hàng STT 21–25; hợp 3 trang = đủ 25, không trùng', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  assert.deepEqual(compRows(h).map(([s]) => s), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'trang 1 chỉ hiện 10 công ty đầu');
  assert.ok(viewOf(h).includes('Trang 1/3') && viewOf(h).includes('Đang hiện 1–10 / 25 công ty'), 'dòng pager phải đúng mẫu Lead Block');
  const prevBtn = viewOf(h).match(/<button[^>]*onclick="setListPage\('companies', 0\)"[^>]*>/);
  assert.ok(prevBtn && prevBtn[0].includes('disabled'), 'trang đầu: nút Trước disabled');
  const all = [];
  for (let p = 1; p <= 3; p++) { h.run(`setListPage('companies', ${p});`); all.push(...compRows(h)); }
  assert.equal(all.length, 25, 'ghép 3 trang phải đủ 25 công ty');
  assert.deepEqual(all.map(([s]) => s), Array.from({ length: 25 }, (_, i) => i + 1), 'STT LIÊN TỤC 1..25 qua các trang');
  assert.equal(new Set(all.map(([, n]) => n)).size, 25, 'không công ty nào trùng giữa các trang');
  assert.deepEqual(compRows(h).map(([s]) => s), [21, 22, 23, 24, 25], 'trang cuối còn 5 hàng');
  const nextBtn = viewOf(h).match(/<button[^>]*onclick="setListPage\('companies', 4\)"[^>]*>/);
  assert.ok(nextBtn && nextBtn[0].includes('disabled'), 'trang cuối: nút Sau disabled');
});

test('Công ty: đổi SORT và đổi TÌM KIẾM đều đưa về trang 1; STT vẫn liên tục theo thứ tự sau sort ở trang 2', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  h.run("setListPage('companies', 3);");
  assert.ok(viewOf(h).includes('Trang 3/3'), 'sanity: đang ở trang 3');
  h.run('setListSort("companies", "name");'); /* tên tăng dần — trùng thứ tự mặc định nhưng là ĐỔI trạng thái sort */
  assert.ok(viewOf(h).includes('Trang 1/3'), 'đổi sort -> về trang 1');
  h.run("setListPage('companies', 2);");
  assert.deepEqual(compRows(h).map(([s]) => s), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'sau sort, STT trang 2 vẫn liên tục 11–20');
  h.run('query = "cong ty 07"; render();');
  assert.deepEqual(compRows(h), [[1, 'Cong Ty 07']], 'đổi tìm kiếm -> tập lọc mới, STT đánh lại từ 1, không còn pager');
  assert.ok(!viewOf(h).includes('list-pager'), 'tập ≤1 trang thì ẩn pager');
});

test('Công ty: trang đang xem vượt khi tập co lại (xoá bớt) -> kẹp về trang cuối hợp lệ, không trang trống', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  h.run("setListPage('companies', 3);");
  assert.ok(viewOf(h).includes('Trang 3/3'));
  h.run('S.companies.splice(10); render();'); /* còn 10 công ty = 1 trang */
  assert.equal(compRows(h).length, 10, 'block co lại: vẫn hiện đủ trang cuối hợp lệ');
  assert.ok(!viewOf(h).includes('Trang 3/'), 'không còn dòng trang 3 không hợp lệ');
});

test('Game / Sự kiện / Thành viên / Việc (phẳng): trang 1 = 10 mục, STT liên tục sang trang 2', () => {
  const h = loadIndex();
  renderView(h, 'games');
  assert.deepEqual([...viewOf(h).matchAll(/list-stt">#(\d+)<\/div><h4>/g)].map(m => Number(m[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'game trang 1: 10 thẻ');
  h.run("setListPage('games', 2);");
  assert.deepEqual([...viewOf(h).matchAll(/list-stt">#(\d+)<\/div><h4>/g)].map(m => Number(m[1])), [11, 12, 13, 14, 15], 'game trang 2: STT 11–15');
  renderView(h, 'events');
  assert.equal((viewOf(h).match(/<td class="list-stt">\d+<\/td><td><b>🎪/g) || []).length, 10, 'sự kiện trang 1: 10 hàng');
  h.run("setListPage('events', 2);");
  assert.deepEqual([...viewOf(h).matchAll(/<td class="list-stt">(\d+)<\/td><td><b>🎪/g)].map(m => Number(m[1])), [11, 12], 'sự kiện trang 2: STT 11–12');
  renderView(h, 'members');
  assert.equal((viewOf(h).match(/<td class="list-stt">\d+<\/td><td><b>/g) || []).length, 10, 'thành viên trang 1: 10 hàng (13 thành viên)');
  h.run("setListPage('members', 2);");
  assert.deepEqual([...viewOf(h).matchAll(/<td class="list-stt">(\d+)<\/td><td><b>/g)].map(m => Number(m[1])), [11, 12, 13], 'thành viên trang 2: STT 11–13');
  renderView(h, 'tasks');
  assert.equal((viewOf(h).match(/<span class="list-stt mut">#\d+<\/span>/g) || []).length, 10, 'việc trang 1: 10 dòng (35 việc)');
  assert.ok(viewOf(h).includes('Trang 1/4') && viewOf(h).includes('/ 35 việc'));
  h.run("setListPage('tasks', 2);");
  assert.deepEqual([...viewOf(h).matchAll(/<span class="list-stt mut">#(\d+)<\/span>/g)].map(m => Number(m[1])), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'việc trang 2: STT liên tục 11–20');
});

test('Việc theo người: mỗi cột nhóm phân trang riêng + đóng cột chỉ còn header/tổng số, mở lại giữ nguyên trang', () => {
  const h = loadIndex();
  renderView(h, 'tasksByMember');
  const zacCol = () => { const seg = viewOf(h).split('data-tbm-group="zac"')[1] || ''; return seg.split('data-tbm-group=')[0]; };
  assert.equal((zacCol().match(/<span class="list-stt mut">#\d+<\/span>/g) || []).length, 10, 'cột Zac trang 1: 10 việc');
  assert.ok(zacCol().includes('Trang 1/4'), 'cột Zac có pager riêng (35 việc của Zac)');
  h.run("setListPage('tbm:zac', 2);");
  assert.deepEqual([...zacCol().matchAll(/<span class="list-stt mut">#(\d+)<\/span>/g)].map(m => Number(m[1])), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'STT trong cột liên tục qua trang');
  h.run("toggleListBlock('tbm:zac');");
  assert.equal((zacCol().match(/<span class="list-stt mut">#\d+<\/span>/g) || []).length, 0, 'đóng cột: không còn dòng việc nào');
  assert.ok(zacCol().includes('>Zac') && zacCol().includes('Tổng sau lọc'), 'đóng cột: header + dòng tổng số vẫn còn');
  assert.ok(zacCol().includes('aria-expanded="false"'));
  h.run("toggleListBlock('tbm:zac');");
  assert.ok(zacCol().includes('Trang 2/4'), 'mở lại cột: giữ nguyên trang 2 đang xem dở');
});

test('Drawer công ty: lead/deal/việc liên quan/hoạt động đều phân trang 10/trang ngay trong drawer', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  h.run("openCompany('comp01');");
  const drawer = () => h.getEl('drawer').innerHTML;
  const leadCards = () => (drawer().match(/<div class="t">📥 Lead \d+/g) || []).length;
  assert.equal(leadCards(), 10, 'drawer công ty trang 1: 10 lead (công ty có 15 lead)');
  assert.ok(drawer().includes('Đang hiện 1–10 / 15 lead'), 'pager của danh sách lead trong drawer');
  h.run("setListPage('companyleads:comp01', 2);");
  assert.equal(leadCards(), 5, 'trang 2 của lead trong drawer: 5 lead còn lại');
  assert.ok(drawer().includes('Lead 15') && !drawer().includes('Lead 09'), 'trang 2 là các lead cuối, không lặp trang 1');
  const relSeg = drawer().split('Việc liên quan')[1].split('Games liên quan')[0];
  assert.equal((relSeg.match(/ViecCT \d+/g) || []).length, 10, 'Việc liên quan trang 1: 10/12 việc');
  h.run("setListPage('tasks:company:comp01', 2);");
  const relSeg2 = drawer().split('Việc liên quan')[1].split('Games liên quan')[0];
  assert.equal((relSeg2.match(/ViecCT \d+/g) || []).length, 2, 'Việc liên quan trang 2: 2 việc còn lại');
  const actSeg = drawer().split('Hoạt động gần nhất')[1];
  assert.equal((actSeg.match(/Act \d+/g) || []).length, 10, 'Hoạt động gần nhất trang 1: 10/12 hoạt động');
});

test('Lịch sử tổng: phân trang TRONG từng block hành động + đóng block chỉ còn header/tổng số; đổi lọc về trang 1', async () => {
  const h = loadIndex();
  h.ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  const rows = [...Array.from({ length: 25 }, (_, i) => ({ entityType: 'company', entityId: 'comp01', at: '2026-10-31T12:00:00.000Z', byMemberId: 'zac', action: 'create', changes: [{ field: 'name', label: 'TOK-C' + pad(i + 1), from: '', to: 'X' }] })),
    ...Array.from({ length: 3 }, (_, i) => ({ entityType: 'deal', entityId: 'deal01', at: '2026-10-31T11:00:00.000Z', byMemberId: 'zac', action: 'update', changes: [{ field: 'title', label: 'TOK-U' + i, from: 'a', to: 'b' }] }))];
  h.ctx.SavaAudit = { listRecent: async () => rows.slice(), recordBatch() {}, listFor: async () => [] };
  h.run('curView = "auditHistory"; render();');
  await tick(); await tick(); await tick();
  const box = () => h.getEl('auditHistoryList').innerHTML;
  const createSeg = () => box().split('data-audit-action="create"')[1].split('data-audit-action=')[0];
  assert.equal((createSeg().match(/audit-history-row/g) || []).length, 10, 'block Tạo mới trang 1: 10/25 mục');
  assert.ok(createSeg().includes('Trang 1/3') && createSeg().includes('/ 25 mục'));
  h.run("setAuditHistPage('audit:create', 3);");
  await tick(); await tick(); await tick();
  assert.equal((createSeg().match(/audit-history-row/g) || []).length, 5, 'block Tạo mới trang 3: 5 mục cuối');
  assert.ok(createSeg().includes('TOK-C25') && createSeg().includes('Trang 3/3'));
  h.run("toggleAuditHistBlock('audit:create');");
  await tick(); await tick(); await tick();
  assert.equal((createSeg().match(/audit-history-row/g) || []).length, 0, 'đóng block: không còn mục nào');
  assert.ok(createSeg().includes('25 mục') && createSeg().includes('>Tạo mới</span>'), 'đóng block: header + tổng số vẫn đúng');
  h.run("toggleAuditHistBlock('audit:create');");
  await tick(); await tick(); await tick();
  assert.ok(createSeg().includes('Trang 3/3'), 'mở lại block: giữ nguyên trang 3');
  h.run("setAuditHistFilter('type', 'deal');");
  await tick(); await tick(); await tick();
  assert.ok(!box().includes('audit:create') || box().includes('Trang 1/'), 'đổi bộ lọc -> các block về trang 1');
});

test('Tính THUẦN: lật trang + đóng/mở ở mọi bề mặt -> kho nguyên từng byte, không state phân trang nào lọt vào S', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  const rawBefore = h.ls.getItem('sava_crm_shared_v1');
  h.run("setListPage('companies', 2); setListPage('companies', 3);");
  renderView(h, 'games'); h.run("setListPage('games', 2);");
  renderView(h, 'tasksByMember'); h.run("setListPage('tbm:zac', 2); toggleListBlock('tbm:zac'); toggleListBlock('tbm:zac');");
  renderView(h, 'companies'); h.run("openCompany('comp01'); setListPage('companyleads:comp01', 2);");
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), rawBefore, 'phân trang/đóng-mở không được ghi lại kho (không save/sync, không đổi updatedAt)');
  for (const k of ['listPageState', 'listCollapsedState', 'listFilterSigs']) assert.equal(h.run(`Object.prototype.hasOwnProperty.call(S, '${k}')`), false, k + ' không nằm trong dữ liệu S');
});

/* ================= (C) Publishing — request + thị trường ================= */
function makeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeElement() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPublishing(tab) {
  const ls = makeLocalStorage();
  const companies = Array.from({ length: 25 }, (_, i) => ({ id: 'pc' + pad(i + 1), name: 'Studio ' + pad(i + 1), type: 'Studio', roles: { publishing: 'Studio' }, last: '' }));
  ls.setItem('sava_crm_shared_v1', JSON.stringify({ members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }], companies, games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [] }));
  const req = (id, entityId) => ({ id, kind: 'company', entityId, requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-08-01T00:00:00.000Z', current: null, revisions: [], revision: 0 });
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: companies.map((c, i) => req('REV-' + (i + 1), c.id)), marketUpdates: [] }));
  const elements = new Map();
  const documentStub = { readyState: 'complete', body: Object.assign(makeElement(), { dataset: { role: 'bd' } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener() {} };
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '?tab=' + tab, href: 'http://localhost/publishing.html?tab=' + tab },
    addEventListener() {}, URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, ls, elements };
}
const reviewCards = els => [...(els.get('#screen').innerHTML.matchAll(/list-stt">#(\d+)<\/span><\/div><h3>([^<]+)<\/h3>/g))].map(m => [Number(m[1]), m[2]]);

test('tĩnh Publishing: phân trang request/thị trường qua SavaPager dùng chung + hook SavaReviewPager/SavaMarketPager; setter chỉ render lại', () => {
  assert.ok(pubSrc.includes('window.SavaPager') && pubSrc.includes('SavaReviewPager') && pubSrc.includes('SavaMarketPager'), 'publishing.js phải dùng SavaPager + có hook kiểm thử');
  const seg = pubSrc.slice(pubSrc.indexOf('function setReviewPage('), pubSrc.indexOf('function pubPagerHTML('));
  assert.ok(seg.includes('renderReviews()') && seg.includes('renderMarket()'), 'setter phân trang phải render lại đúng danh sách');
  assert.ok(!seg.includes('write('), 'setter phân trang TUYỆT ĐỐI không ghi kho');
});

test('Publishing reviews (25 request): 10 thẻ/trang, STT liên tục qua 3 trang, hợp các trang đủ 25 không trùng; sort -> về trang 1; lật trang không ghi kho', () => {
  const { ctx, ls, elements } = loadPublishing('reviews');
  assert.deepEqual(reviewCards(elements).map(([s]) => s), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'trang 1: 10 thẻ, STT 1–10');
  assert.ok(elements.get('#screen').innerHTML.includes('Trang 1/3') && elements.get('#screen').innerHTML.includes('/ 25 yêu cầu'));
  const rawBefore = ls.getItem('sava_publishing_v1');
  const all = [];
  for (let p = 1; p <= 3; p++) { ctx.window.SavaReviewPager.set(p); all.push(...reviewCards(elements)); }
  assert.equal(all.length, 25);
  assert.deepEqual(all.map(([s]) => s), Array.from({ length: 25 }, (_, i) => i + 1), 'STT liên tục 1..25 qua các trang');
  assert.equal(new Set(all.map(([, n]) => n)).size, 25, 'không request nào trùng giữa các trang');
  ctx.window.SavaReviewPager.set(3);
  ctx.window.SavaReviewSort.set('name'); /* đổi sort -> chữ ký đổi -> trang 1 */
  assert.equal(ctx.window.SavaReviewPager.get(), 1, 'đổi sort -> về trang 1');
  assert.deepEqual(reviewCards(elements).map(([, n]) => n), Array.from({ length: 10 }, (_, i) => 'Studio ' + pad(i + 1)), 'sau sort tên, trang 1 là 10 studio đầu theo thứ tự mới');
  ctx.window.SavaReviewPager.set(2);
  assert.deepEqual(reviewCards(elements).map(([s]) => s), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'STT trang 2 sau sort vẫn liên tục');
  assert.equal(ls.getItem('sava_publishing_v1'), rawBefore, 'lật trang/sort không ghi lại kho Publishing');
});

test('Publishing market: bảng mechanic (Puzzle 12 record) phân trang 10 + 2, đổi nhóm -> về trang 1', () => {
  const { ctx, elements } = loadPublishing('market');
  /* Chỉ đếm dòng trong BẢNG mechanic (phần trực quan phía trên cũng có
     nút data-market của biểu đồ/matrix — không thuộc bảng phân trang). */
  const marketRows = () => { const seg = elements.get('#screen').innerHTML.split('<th>Mechanic / nhóm</th>')[1] || ''; return (seg.match(/<button class="link-button" data-market=/g) || []).length; };
  assert.equal(marketRows(), 10, 'bảng thị trường trang 1: 10 dòng mechanic');
  assert.ok(elements.get('#screen').innerHTML.includes('Trang 1/2') && elements.get('#screen').innerHTML.includes('/ 12 mechanic'));
  ctx.window.SavaMarketPager.set(2);
  assert.equal(marketRows(), 2, 'trang 2: 2 dòng còn lại');
  ctx.window.SavaMarketPager.set(99);
  assert.equal(ctx.window.SavaMarketPager.get(), 2, 'trang vượt -> kẹp về trang cuối hợp lệ');
});
