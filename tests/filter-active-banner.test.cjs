/* Dải cảnh báo "Đang lọc bởi" + nút "Bỏ tất cả lọc" (Zac chốt phương
   án 1, 17/11/2026) — khoá hành vi:
   - Vụ gốc "dat bike": leadStatusFilter='sent_connect' kế thừa lặng làm
     search mất lead Harish Deepak (in_response): ra 3 VÀ dải hiện đúng
     restriction; bấm Bỏ tất cả lọc -> đủ 4, chữ search còn nguyên, dải
     biến mất. Semantics lọc KHÔNG đổi (trước khi bỏ vẫn ra đúng 3).
   - Ma trận Leads: từng restriction riêng lẻ + kết hợp; không
     restriction -> không dải dù có search; không search -> không dải;
     dải hiện cả khi kết quả = 0; mảng chỉ minh bạch, không kích hoạt
     dải và không bị nút bỏ lọc reset.
   - Các view áp cùng mẫu: Deal/Pipeline (lọc ngành Metaverse), Sự kiện
     (phạm vi Của tôi), Việc Theo người (lọc trạng thái việc), Tài liệu
     bán hàng (Loại + Mảng tài liệu). View KHÔNG áp (Công ty, Game —
     chỉ có tab mảng toàn cục vốn luôn hiện ở đầu trang, không
     restriction cục bộ) được khoá bằng test tĩnh.
   Nhãn trạng thái trong dải lấy từ LEAD_STATUSES — nhãn hiển thị THẬT
   của app: sent_connect = "Sent connect", in_response = "In-response"
   (8 nhãn tiếp cận giữ nguyên văn tiếng Anh theo hợp đồng trạng thái). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fixtureState() {
  const today = isoDaysAgo(0);
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
    ],
    companies: [
      { id: 'cDatBike', name: 'Dat Bike', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
    ],
    games: [],
    deals: [
      { id: 'dMeta1', title: 'Deal Meta Mot', company: 'cDatBike', line: 'metaverse', stage: 'prospect', vertical: 'Sản xuất', amount: 0, cur: 'VND', owner: 'zac', due: '', leads: [] },
      { id: 'dMeta2', title: 'Deal Meta Hai', company: 'cDatBike', line: 'metaverse', stage: 'prospect', vertical: 'Giáo dục', amount: 0, cur: 'VND', owner: 'zac', due: '', leads: [] },
    ],
    leads: [
      { id: 'lHarish', name: 'Harish Deepak', company: 'cDatBike', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'in_response', note: '', when: '', ownerId: 'hoangdaden', createdAt: today },
      { id: 'lSon', name: 'Nguyễn Bá Cảnh Sơn', company: 'cDatBike', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'sent_connect', note: '', when: '', ownerId: '', createdAt: today },
      { id: 'lTrung', name: 'Pham Trung', company: 'cDatBike', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'sent_connect', note: '', when: '', ownerId: '', createdAt: today },
      { id: 'lTam', name: 'Tam Vo', company: 'cDatBike', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'sent_connect', note: '', when: '', ownerId: '', createdAt: today },
    ],
    tasks: [
      { id: 'tOpen', title: 'Việc Alpha Mở', assignee: 'hoangdaden', done: false, due: '', dueDate: '' },
      { id: 'tDone', title: 'Việc Alpha Xong', assignee: 'hoangdaden', done: true, due: '', dueDate: '' },
    ],
    activities: [], verticals: [],
    events: [
      { id: 'evHoang', name: 'Expo Alpha Hoàng', owner: 'hoangdaden', status: 'planned', date: isoDaysAgo(-5), endDate: isoDaysAgo(-5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
      { id: 'evZac', name: 'Expo Alpha Zac', owner: 'zac', status: 'planned', date: isoDaysAgo(-5), endDate: isoDaysAgo(-5), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
    salesMaterials: [
      { id: 'sm1', title: 'Deck Alpha', kind: 'deck', line: 'publishing', url: 'https://example.com/deck', description: '', createdAt: today },
      { id: 'sm2', title: 'Demo Alpha', kind: 'demo', line: 'ai', url: 'https://example.com/demo', description: '', createdAt: today },
    ],
  };
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
const leadIds = h => JSON.parse(JSON.stringify(h.run('filteredLeads().map(l => l.id)')));
const renderLeads = h => { h.run('curView = "leads"; render();'); return h.getEl('view').innerHTML; };
const BANNER = 'data-filter-banner="1"';

/* ---------- 1) Tĩnh ---------- */

test('tĩnh: helper dải + hàm bỏ lọc của 5 bề mặt tồn tại; các view đã áp chèn dải, Công ty/Game không chèn; filteredLeads giữ nguyên semantics gốc', () => {
  for (const fn of ['searchFilterBannerHTML', 'leadActiveRestrictions', 'leadFilterBannerHTML', 'clearLeadSearchFilters',
    'dealBoardFilterBannerHTML', 'clearBoardVerticalSearchFilter', 'eventFilterBannerHTML', 'clearEventScopeSearchFilter',
    'taskMemberFilterBannerHTML', 'clearTaskMemberSearchFilter', 'salesFilterBannerHTML', 'clearSalesSearchFilters'])
    assert.ok(html.includes('function ' + fn), 'thiếu hàm ' + fn);
  const seg = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a) + 1));
  assert.ok(seg('function vLeads()', 'function vLeadsPipeline()').includes('leadFilterBannerHTML()'), 'vLeads (Block) phải chèn dải');
  assert.ok(seg('function vLeadsPipeline()', '/* ===== Sự kiện').includes('leadFilterBannerHTML()'), 'vLeadsPipeline phải chèn dải');
  assert.ok(seg('function vBoard()', 'function vCompanies()').includes('dealBoardFilterBannerHTML()'), 'vBoard phải chèn dải lọc ngành');
  assert.ok(seg('function vEvents()', '/* ===== Tài liệu bán hàng').includes('eventFilterBannerHTML()'), 'vEvents phải chèn dải phạm vi');
  assert.ok(seg('function vTasksByMember()', '/* ===== Lịch').includes('taskMemberFilterBannerHTML()'), 'vTasksByMember phải chèn dải');
  assert.ok(seg('function vSalesMaterials()', 'function openSalesMaterialForm').includes('salesFilterBannerHTML()'), 'vSalesMaterials phải chèn dải');
  assert.ok(!seg('function vCompanies()', 'function vGames()').includes('FilterBannerHTML'), 'vCompanies KHÔNG áp dải (không restriction cục bộ — chỉ tab mảng toàn cục luôn hiện)');
  assert.ok(!seg('function vGames()', '/* ===== Leads chia').includes('FilterBannerHTML'), 'vGames KHÔNG áp dải (không restriction cục bộ)');
  /* Semantics lọc lead GIỮ NGUYÊN từng chữ so với baseline 7a7413d */
  assert.ok(html.includes('return S.leads.filter(l => (curLine==="all"||l.line===curLine) && (!query || searchMatches(leadSearchHaystack(l), query)) && (!leadOwnerFilter || (leadOwnerFilter === "__none__" ? !l.ownerId : l.ownerId === leadOwnerFilter)) && (leadFunnelIds ? leadFunnelIds.set.has(String(l.id)) : ((!leadStatusFilter || l.status === leadStatusFilter) && leadInCreatedPeriod(l))));'),
    'filteredLeads phải giữ nguyên semantics gốc');
  /* Hàm bỏ lọc của Lead không được đụng query / curLine */
  const clearSeg = seg('function clearLeadSearchFilters()', '/* --- Các view danh sách khác');
  assert.ok(!/query\s*=/.test(clearSeg) && !/curLine\s*=/.test(clearSeg), 'clearLeadSearchFilters không được gán query/curLine');
  assert.ok(clearSeg.includes('leadStatusFilter = ""') && clearSeg.includes('leadCreatedPeriodDays = null') && clearSeg.includes('leadCreatedRange = null') && clearSeg.includes('leadOwnerFilter = ""') && clearSeg.includes('leadFunnelIds = null'),
    'clearLeadSearchFilters phải xoá đủ trạng thái + kỳ (preset + range) + owner + chip');
});

/* ---------- 2) Vụ gốc "dat bike" ---------- */

test('vụ gốc: leadStatusFilter=sent_connect + search "dat bike" -> đúng 3 lead VÀ dải hiện "Trạng thái = Sent connect" (nhãn thật của app); Bỏ tất cả lọc -> đủ 4, search còn nguyên, dải biến mất', () => {
  const h = loadIndex();
  h.run('curLine = "all"; leadViewMode = "block"; query = "dat bike"; leadStatusFilter = "sent_connect";');
  assert.deepEqual(leadIds(h).sort(), ['lSon', 'lTam', 'lTrung'], 'semantics cũ giữ nguyên: Harish (in_response) bị lọc trạng thái loại — ra đúng 3');
  let view = renderLeads(h);
  assert.ok(view.includes(BANNER), 'dải cảnh báo phải hiện khi đang search + có lọc kế thừa');
  assert.ok(view.includes('Đang lọc bởi:'), 'dải phải mở đầu "Đang lọc bởi:"');
  assert.ok(view.includes('Trạng thái = Sent connect'), 'dải phải ghi đúng nhãn hiển thị thật của sent_connect — nhận được dải trong view');
  assert.ok(view.includes('Bỏ tất cả lọc'), 'dải phải có nút Bỏ tất cả lọc');
  assert.ok(view.includes('Harish Deepak') === false, 'kết quả vẫn chỉ 3 (chưa bỏ lọc thì Harish chưa hiện)');
  h.run('clearLeadSearchFilters()');
  assert.equal(h.run('query'), 'dat bike', 'chữ đang search phải còn nguyên sau khi bỏ lọc');
  assert.deepEqual(leadIds(h).sort(), ['lHarish', 'lSon', 'lTam', 'lTrung'], 'sau bỏ lọc phải đủ 4 lead Dat Bike');
  view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Harish Deepak'), 'Harish phải hiện sau khi bỏ lọc');
  assert.ok(!view.includes(BANNER), 'dải phải biến mất sau khi bỏ hết lọc cục bộ');
  assert.equal(h.run('leadStatusFilter'), '');
  assert.equal(h.run('curLine'), 'all');
});

test('vụ gốc ở chế độ Pipeline: dải cũng hiện trên board lead và biến mất sau khi bỏ lọc', () => {
  const h = loadIndex();
  h.run('curLine = "all"; leadViewMode = "pipeline"; query = "dat bike"; leadStatusFilter = "sent_connect";');
  const view = renderLeads(h);
  assert.ok(view.includes(BANNER) && view.includes('Trạng thái = Sent connect'), 'board Pipeline phải hiện cùng dải');
  h.run('clearLeadSearchFilters()');
  assert.ok(!h.getEl('view').innerHTML.includes(BANNER), 'bỏ lọc xong dải biến mất ở Pipeline');
});

/* ---------- 3) Ma trận restriction của Leads ---------- */

test('ma trận: từng restriction riêng lẻ hiện đúng nhãn trong dải', () => {
  /* trạng thái */
  let h = loadIndex();
  h.run('curLine = "all"; query = "dat bike"; leadStatusFilter = "in_response";');
  let view = renderLeads(h);
  assert.ok(view.includes('Trạng thái = In-response'), 'nhãn in_response theo LEAD_STATUSES');
  assert.deepEqual(leadIds(h), ['lHarish']);
  /* kỳ preset */
  h = loadIndex();
  h.run('curLine = "all"; query = "dat bike"; leadCreatedPeriodDays = 30;');
  view = renderLeads(h);
  assert.ok(view.includes('Kỳ tạo = 30 ngày gần nhất'), 'kỳ preset hiện "30 ngày gần nhất"');
  assert.equal(leadIds(h).length, 4, '4 lead tạo hôm nay đều trong kỳ 30 ngày');
  /* kỳ tuỳ chỉnh: khoảng dd-mm-yyyy */
  h = loadIndex();
  const from = isoDaysAgo(10), to = isoDaysAgo(0);
  const dmy = iso => { const [y, m, d] = iso.split('-'); return d + '-' + m + '-' + y; };
  h.run(`curLine = "all"; query = "dat bike"; leadCreatedRange = { from: ${JSON.stringify(from)}, to: ${JSON.stringify(to)} };`);
  view = renderLeads(h);
  assert.ok(view.includes('Kỳ tạo = ' + dmy(from) + ' → ' + dmy(to)), 'kỳ tuỳ chỉnh hiện khoảng dd-mm-yyyy');
  /* người phụ trách: tên member + Chưa gán */
  h = loadIndex();
  h.run('curLine = "all"; query = "dat bike"; leadOwnerFilter = "hoangdaden";');
  view = renderLeads(h);
  assert.ok(view.includes('Người phụ trách = Hoàng Daden'), 'owner hiện tên member thật');
  assert.deepEqual(leadIds(h), ['lHarish']);
  h.run('leadOwnerFilter = "__none__"; render();');
  view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Người phụ trách = Chưa gán'), 'owner __none__ hiện "Chưa gán"');
  /* chip tập lead: nguyên nhãn tập */
  h = loadIndex();
  h.run('curLine = "all"; query = "dat bike"; leadFunnelIds = { ids: ["lHarish", "lSon"], set: new Set(["lHarish", "lSon"]), label: "Phễu Lead — Tổng lead đầu vào · toàn bộ theo trạng thái hiện tại" }; leadFunnelVersion++;');
  view = renderLeads(h);
  assert.ok(view.includes('Tập lead = Phễu Lead — Tổng lead đầu vào'), 'chip hiện nguyên nhãn tập lead');
  assert.deepEqual(leadIds(h).sort(), ['lHarish', 'lSon'], 'chip vẫn lọc đúng tập (semantics không đổi)');
});

test('ma trận: kết hợp trạng thái + kỳ + owner + mảng — dải liệt kê đủ, không trùng; mảng ghi thêm nhưng nút bỏ lọc KHÔNG reset mảng', () => {
  const h = loadIndex();
  h.run('curLine = "publishing"; query = "dat bike"; leadStatusFilter = "sent_connect"; leadCreatedPeriodDays = 30; leadOwnerFilter = "__none__";');
  const view = renderLeads(h);
  for (const s of ['Trạng thái = Sent connect', 'Kỳ tạo = 30 ngày gần nhất', 'Người phụ trách = Chưa gán', 'Mảng = Publishing'])
    assert.ok(view.includes(s), 'dải kết hợp phải gồm: ' + s);
  assert.equal((view.match(/Đang lọc bởi:/g) || []).length, 1, 'chỉ MỘT dải, không trùng');
  assert.deepEqual(leadIds(h).sort(), ['lSon', 'lTam', 'lTrung'], 'kết hợp AND như semantics cũ');
  h.run('clearLeadSearchFilters()');
  assert.equal(h.run('curLine'), 'publishing', 'nút Bỏ tất cả lọc KHÔNG được reset tab mảng toàn cục');
  assert.equal(h.run('query'), 'dat bike', 'search còn nguyên');
  assert.ok(!h.getEl('view').innerHTML.includes(BANNER), 'dải biến mất dù mảng vẫn đang chọn (mảng một mình không giữ dải)');
  assert.equal(leadIds(h).length, 4, 'bỏ lọc cục bộ xong, 4 lead của mảng Publishing hiện đủ');
});

test('ma trận: chip thắng trạng thái/kỳ — khi chip bật, dải chỉ liệt kê chip (+ owner/mảng nếu có), không liệt kê trạng thái/kỳ đang ngủ; bỏ lọc xoá cả phần đang ngủ', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "dat bike"; leadStatusFilter = "sent_connect"; leadCreatedPeriodDays = 30; leadFunnelIds = { ids: ["lHarish"], set: new Set(["lHarish"]), label: "Phễu Lead — In-response · toàn bộ theo trạng thái hiện tại" }; leadFunnelVersion++;');
  const view = renderLeads(h);
  assert.ok(view.includes('Tập lead = Phễu Lead — In-response'), 'chip được liệt kê');
  assert.ok(!view.includes('Trạng thái = Sent connect'), 'trạng thái đang bị chip thắng (không áp) thì không liệt kê sai sự thật');
  assert.deepEqual(leadIds(h), ['lHarish'], 'chip thắng trạng thái trong filteredLeads như semantics gốc');
  h.run('clearLeadSearchFilters()');
  assert.equal(h.run('leadStatusFilter'), '', 'bỏ lọc phải xoá cả trạng thái đang ngủ để không sống lại sau gỡ chip');
  assert.equal(h.run('leadCreatedPeriodDays'), null);
  assert.equal(h.run('leadFunnelIds'), null);
});

test('ma trận: không restriction -> không dải dù có search; không search -> không dải dù có restriction; chỉ mảng -> không dải; dải hiện cả khi kết quả = 0', () => {
  let h = loadIndex();
  h.run('curLine = "all"; query = "dat bike";');
  assert.ok(!renderLeads(h).includes(BANNER), 'có search nhưng không restriction -> không dải');
  h = loadIndex();
  h.run('curLine = "all"; query = ""; leadStatusFilter = "sent_connect";');
  assert.ok(!renderLeads(h).includes(BANNER), 'có restriction nhưng không search -> không dải');
  h = loadIndex();
  h.run('curLine = "publishing"; query = "dat bike";');
  assert.ok(!renderLeads(h).includes(BANNER), 'chỉ tab mảng khác Tất cả -> không dải (mảng luôn hiện ở đầu trang, không phải restriction mờ)');
  h = loadIndex();
  h.run('curLine = "all"; query = "zzz-khong-khop"; leadStatusFilter = "sent_connect";');
  const view = renderLeads(h);
  assert.equal(leadIds(h).length, 0, 'kết quả = 0');
  assert.ok(view.includes(BANNER) && view.includes('Trạng thái = Sent connect'), 'dải vẫn hiện khi kết quả = 0');
  assert.ok(view.includes('Không có lead nào khớp bộ lọc hiện tại.'), 'thông báo rỗng vẫn hiện cùng dải');
});

/* ---------- 4) Các view áp cùng mẫu ---------- */

test('Deal/Pipeline Metaverse: lọc ngành đang bật + search -> dải hiện "Phân khúc ngành = …"; bỏ lọc chỉ xoá ngành, giữ search', () => {
  const h = loadIndex();
  h.run('curView = "board"; curLine = "metaverse"; query = "deal meta"; boardVerticalFilter = "Sản xuất"; render();');
  let view = h.getEl('view').innerHTML;
  assert.ok(view.includes(BANNER) && view.includes('Phân khúc ngành = Sản xuất'), 'dải lọc ngành phải hiện trên board Metaverse');
  assert.ok(view.includes('Deal Meta Mot') && !view.includes('Deal Meta Hai'), 'lọc ngành vẫn áp như cũ');
  h.run('clearBoardVerticalSearchFilter()');
  assert.equal(h.run('boardVerticalFilter'), '');
  assert.equal(h.run('query'), 'deal meta', 'search giữ nguyên');
  view = h.getEl('view').innerHTML;
  assert.ok(!view.includes(BANNER) && view.includes('Deal Meta Hai'), 'bỏ lọc xong thấy đủ deal + dải biến mất');
  const h2 = loadIndex();
  h2.run('curView = "board"; curLine = "metaverse"; query = "deal meta"; render();');
  assert.ok(!h2.getEl('view').innerHTML.includes(BANNER), 'không lọc ngành -> không dải trên board');
});

test('Sự kiện: phạm vi Của tôi (mặc định của BD) + search -> dải hiện; bỏ lọc = về Tất cả, giữ search; Admin mặc định Tất cả -> không dải', () => {
  const h = loadIndex();
  h.ctx.SavaAuth = { currentUser: () => ({ memberId: 'hoangdaden', role: 'bd', name: 'Hoàng Daden' }) };
  h.run('curView = "events"; eventScopeFilter = null; query = "expo alpha"; render();');
  let view = h.getEl('view').innerHTML;
  assert.ok(view.includes(BANNER) && view.includes('Phạm vi = Của tôi (Hoàng Daden)'), 'dải phạm vi phải hiện khi BD đang search ở phạm vi Của tôi mặc định');
  assert.ok(view.includes('Expo Alpha Hoàng') && !view.includes('Expo Alpha Zac'), 'phạm vi vẫn lọc như cũ');
  h.run('clearEventScopeSearchFilter()');
  assert.equal(h.run('eventScope()'), 'all');
  assert.equal(h.run('query'), 'expo alpha', 'search giữ nguyên');
  view = h.getEl('view').innerHTML;
  assert.ok(!view.includes(BANNER) && view.includes('Expo Alpha Zac'), 'bỏ lọc xong thấy sự kiện của mọi người + dải biến mất');
  const h2 = loadIndex();
  h2.ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin', name: 'Zac' }) };
  h2.run('curView = "events"; eventScopeFilter = null; query = "expo alpha"; render();');
  assert.ok(!h2.getEl('view').innerHTML.includes(BANNER), 'Admin mặc định Tất cả (không restriction) -> không dải');
});

test('Việc Theo người: lọc trạng thái việc + search -> dải hiện; bỏ lọc chỉ về Tất cả, giữ search', () => {
  const h = loadIndex();
  h.run('query = "việc alpha"; taskMemberFilter = "done";');
  let out = h.run('vTasksByMember()');
  assert.ok(out.includes(BANNER) && out.includes('Trạng thái việc = Đã xong'), 'dải trạng thái việc phải hiện ở chế độ Theo người');
  h.run('clearTaskMemberSearchFilter()');
  assert.equal(h.run('taskMemberFilter'), 'all');
  assert.equal(h.run('query'), 'việc alpha', 'search giữ nguyên');
  out = h.run('vTasksByMember()');
  assert.ok(!out.includes(BANNER), 'bỏ lọc xong dải biến mất');
  const h2 = loadIndex();
  h2.run('query = "việc alpha"; taskMemberFilter = "all";');
  assert.ok(!h2.run('vTasksByMember()').includes(BANNER), 'lọc = Tất cả -> không dải');
});

test('Tài liệu bán hàng: lọc Loại + Mảng tài liệu + search -> dải liệt kê cả hai; bỏ lọc chỉ xoá hai lọc cục bộ, giữ search', () => {
  const h = loadIndex();
  h.run('curView = "sales"; query = "alpha"; salesTypeFilter = "deck"; salesLineFilter = "publishing"; render();');
  let view = h.getEl('view').innerHTML;
  assert.ok(view.includes(BANNER) && view.includes('Loại = Deck') && view.includes('Mảng tài liệu = Publishing'), 'dải phải liệt kê Loại + Mảng tài liệu');
  assert.ok(view.includes('Deck Alpha') && !view.includes('Demo Alpha'), 'lọc vẫn áp như cũ');
  h.run('clearSalesSearchFilters()');
  assert.equal(h.run('salesTypeFilter'), '');
  assert.equal(h.run('salesLineFilter'), '');
  assert.equal(h.run('query'), 'alpha', 'search giữ nguyên');
  view = h.getEl('view').innerHTML;
  assert.ok(!view.includes(BANNER) && view.includes('Demo Alpha'), 'bỏ lọc xong thấy đủ tài liệu + dải biến mất');
});
