/* Search "dat bike" (Zac báo 17/11/2026: chỉ hiện 3/4 lead) — khoá các
   lớp nguyên nhân đã chứng minh bằng code tại HEAD 4e695cd:
   - filteredLeads CŨ khớp (name + person + leadCompanyName + note)
     .toLowerCase().includes(query): cụm LIỀN, KHÔNG bỏ dấu hai phía ->
     trượt "DatBike" (dính liền), "Dat-Bike" (dấu câu), thừa khoảng
     trắng, "Đạt Bike" (có dấu); haystack CŨ cũng thiếu email/SĐT.
   - Bản sửa: searchMatches (fold qua comboFoldText cả hai phía + khớp
     cụm / gộp sát / token AND) + leadSearchHaystack (tên + person +
     tên công ty qua liên kết CÒN SỐNG + note + email + phone), áp cho
     filteredLeads + vCompanies + dealsFiltered/vDash/vBoard.
   - Lớp KHÔNG sửa được ở tầng code (khoá bằng test âm): lead mồ côi
     không còn dấu vết dat/bike ở field của chính nó thì search theo
     công ty không bắt được — dữ kiện, chờ gói SQL xác minh danh tính.
   - Lớp KHÔNG đổi semantics (khoá bằng test): bộ lọc kế thừa curLine /
     leadOwnerFilter vẫn AND với search như trước.
   Harness vm theo mẫu lead-block-pager. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'cSpace', name: 'Dat Bike', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cSquash', name: 'DatBike', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cDiac', name: 'Đạt Bike', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cHyphen', name: 'Dat-Bike JSC', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cDatCar', name: 'Dat Car', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cBikeShop', name: 'Bike Shop', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
    ],
    games: [],
    deals: [
      { id: 'dSquash', title: 'Hop tac phan phoi', company: 'cSquash', line: 'publishing', stage: 'discovery', leads: [] },
      { id: 'dOther', title: 'Hop tac khac', company: 'cDatCar', line: 'publishing', stage: 'discovery', leads: [] },
    ],
    leads: [
      { id: 'lSpace', name: 'Nguyen Van A', company: 'cSpace', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lSquash', name: 'Nguyen Van B', company: 'cSquash', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lDiac', name: 'Nguyen Van C', company: 'cDiac', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lHyphen', name: 'Nguyen Van D', company: 'cHyphen', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lEmail', name: 'Nguyen Van E', company: 'cDatCar', person: '', phone: '', email: 'founder@datbike.vn', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lOrphanNote', name: 'Nguyen Van F', company: '', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: 'Da gap Dat Bike tai su kien', when: '2026-11-01' },
      { id: 'lOrphanNone', name: 'Tran Van G', company: 'cGone', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lBikeOnly', name: 'Nguyen Van H', company: 'cBikeShop', person: '', phone: '', email: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lMeta', name: 'Nguyen Van I', company: 'cSpace', person: '', phone: '', email: '', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-01' },
    ],
    tasks: [], activities: [], verticals: [],
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

/* ---------- 1) Tĩnh: cấu trúc bản sửa ---------- */

test('tĩnh: searchMatches/searchFoldText/leadSearchHaystack tồn tại; filteredLeads + companies + deals dùng helper, không còn includes(query) thô ở các bề mặt đã sửa', () => {
  assert.ok(html.includes('function searchMatches(hay, rawQuery)'), 'thiếu helper searchMatches');
  assert.ok(html.includes('function searchFoldText(s)'), 'thiếu helper searchFoldText');
  assert.ok(html.includes('function leadSearchHaystack(l)'), 'thiếu leadSearchHaystack');
  assert.ok(html.includes('searchMatches(leadSearchHaystack(l), query)'), 'filteredLeads phải khớp qua helper + haystack lead');
  /* Sửa có chủ đích (đợt rà toàn app 17/11/2026): haystack công ty/deal
     chuyển từ chuỗi inline (chỉ tên / title+công ty) sang builder riêng
     companySearchHaystack/dealSearchHaystack (thêm field nhận diện) —
     khẳng định đổi đích tương ứng, độ chặt giữ nguyên (vẫn bắt buộc
     khớp qua searchMatches, không includes thô). */
  assert.ok(html.includes('searchMatches(companySearchHaystack(c), query)'), 'vCompanies phải khớp qua helper + haystack công ty');
  assert.ok(html.includes('searchMatches(dealSearchHaystack(d), query)'), 'dealsFiltered phải khớp qua helper + haystack deal');
  assert.ok(!html.includes('(l.name + " " + (l.person||"") + " " + leadCompanyName(l) + " " + l.note).toLowerCase().includes(query)'), 'haystack lead cũ (cụm liền, không fold, thiếu email/phone) phải đã bị thay');
  const haySeg = html.slice(html.indexOf('function leadSearchHaystack'), html.indexOf('function dealsFiltered'));
  assert.ok(haySeg.includes('l.email') && haySeg.includes('l.phone'), 'haystack lead phải gồm email + SĐT');
  assert.ok(haySeg.includes('leadCompany(l)'), 'haystack phải lấy tên công ty qua liên kết sống leadCompany, không qua placeholder của leadCompanyName');
});

/* ---------- 2) Hành vi: các biến thể "dat bike" đều khớp ---------- */

test('hành vi: query "dat bike" bắt đủ biến thể dính liền / dấu câu / có dấu / qua email / mồ côi-có-note; không bắt thiếu-từ và mồ côi-không-dấu-vết', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "dat bike";');
  const ids = leadIds(h);
  for (const id of ['lSpace', 'lSquash', 'lDiac', 'lHyphen', 'lEmail', 'lOrphanNote', 'lMeta']) {
    assert.ok(ids.includes(id), 'phải bắt được ' + id + ' — nhận được: ' + ids.join(','));
  }
  assert.ok(!ids.includes('lBikeOnly'), 'chỉ có "bike" (thiếu "dat") thì không khớp');
  assert.ok(!ids.includes('lOrphanNone'), 'mồ côi + không dấu vết ở field của chính lead -> không khớp (giới hạn dữ kiện, không phải lỗi khớp chuỗi)');
});

test('hành vi: query có dấu "đạt bike" và query dính liền "datbike" đều bắt cùng tập cốt lõi', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "đạt bike";');
  let ids = leadIds(h);
  for (const id of ['lSpace', 'lSquash', 'lDiac', 'lHyphen']) assert.ok(ids.includes(id), 'query có dấu phải bắt ' + id);
  h.run('query = "datbike";');
  ids = leadIds(h);
  for (const id of ['lSpace', 'lSquash', 'lDiac', 'lHyphen', 'lEmail']) assert.ok(ids.includes(id), 'query dính liền phải bắt ' + id);
  assert.ok(!ids.includes('lBikeOnly'), 'query dính liền không được bắt lead chỉ có "bike"');
});

test('hành vi: searchMatches thuần — cụm / gộp sát / token AND / rỗng / một từ thiếu là không khớp', () => {
  const h = loadIndex();
  const m = (hay, q) => h.run(`searchMatches(${JSON.stringify(hay)}, ${JSON.stringify(q)})`);
  assert.equal(m('Dat Bike', 'dat bike'), true, 'cụm nguyên văn');
  assert.equal(m('DatBike', 'dat bike'), true, 'dính liền');
  assert.equal(m('Dat-Bike JSC', 'dat bike'), true, 'dấu câu');
  assert.equal(m('Đạt Bike', 'dat bike'), true, 'dữ liệu có dấu, query không dấu');
  assert.equal(m('Dat Bike', 'đạt bike'), true, 'query có dấu, dữ liệu không dấu');
  assert.equal(m('Dat  Bike', 'dat bike'), true, 'thừa khoảng trắng');
  assert.equal(m('Bike Dat', 'dat bike'), true, 'token AND nguyên từ, thứ tự tự do');
  assert.equal(m('Đà Nẵng Corp', 'ân corp'), false, 'từ ngắn "an" là mảnh của "nang" thì KHÔNG khớp (regression list-sort: query "ân corp" chỉ được bắt "Ân Corp")');
  assert.equal(m('Ân Corp', 'ân corp'), true, 'query có dấu bắt đúng công ty có dấu');
  assert.equal(m('Bike Shop', 'dat bike'), false, 'thiếu token dat');
  assert.equal(m('Dat Car', 'dat bike'), false, 'thiếu token bike');
  assert.equal(m('Bat Dike', 'dat bike'), false, 'gần giống nhưng khác chữ thì không khớp');
  assert.equal(m('Bat Dike', ''), true, 'query rỗng luôn khớp');
});

/* ---------- 3) Semantics kế thừa KHÔNG đổi ---------- */

test('hành vi: bộ lọc kế thừa giữ nguyên — curLine khác mảng vẫn loại lead khớp search; leadOwnerFilter vẫn AND với search', () => {
  const h = loadIndex();
  h.run('curLine = "publishing"; query = "dat bike";');
  let ids = leadIds(h);
  assert.ok(ids.includes('lSpace') && !ids.includes('lMeta'), 'curLine=publishing phải loại lead metaverse dù khớp search (semantics cũ giữ nguyên)');
  h.run('curLine = "all"; leadOwnerFilter = "__none__";');
  ids = leadIds(h);
  assert.ok(ids.includes('lSpace'), 'lead chưa gán owner vẫn qua lọc __none__');
  h.run('leadOwnerFilter = "zac";');
  assert.deepEqual(leadIds(h), [], 'lọc owner=zac (không lead nào gán zac) -> rỗng, search không được phá bộ lọc người');
});

/* ---------- 4) Bề mặt công ty + deal ---------- */

test('hành vi: view Công ty với query "dat bike" hiện cả DatBike/Đạt Bike/Dat-Bike JSC, ẩn Bike Shop và Dat Car', () => {
  const h = loadIndex();
  h.run('curView = "companies"; curLine = "all"; query = "dat bike"; render();');
  const view = h.getEl('view').innerHTML;
  for (const n of ['Dat Bike', 'DatBike', 'Đạt Bike', 'Dat-Bike JSC']) assert.ok(view.includes(n), 'view Công ty phải hiện ' + n);
  assert.ok(!view.includes('Bike Shop'), 'Bike Shop (thiếu dat) phải bị ẩn');
  assert.ok(!view.includes('Dat Car'), 'Dat Car (thiếu bike) phải bị ẩn');
});

test('hành vi: dealsFiltered với query "dat bike" bắt deal của công ty DatBike, không bắt deal Dat Car', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "dat bike";');
  const ids = JSON.parse(JSON.stringify(h.run('dealsFiltered().map(d => d.id)')));
  assert.deepEqual(ids, ['dSquash'], 'chỉ deal gắn công ty DatBike khớp — nhận được: ' + ids.join(','));
});
