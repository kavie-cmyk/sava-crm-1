/* Rà + sửa lỗi search CÙNG KIỂU trên toàn app (17/11/2026, tiếp vụ
   "dat bike" 44d9d9f):
   - Các bề mặt còn dùng (haystack).toLowerCase().includes(query) thô —
     Game / Sự kiện / Việc (list + theo người) / Lịch (việc + sự kiện) /
     hoạt động Dashboard (legacy + dashboardActivityModel) / Việc cần
     làm ở Dashboard / tài liệu bán hàng (chỉ title, cụm liền dù đã fold)
     / Publishing-MKT (thị trường + hồ sơ đánh giá) — nay khớp qua MỘT
     cơ chế duy nhất: window.SavaSearch (shared.js), index.html ủy quyền
     qua searchMatches, publishing.js qua pubSearchMatches.
   - Haystack bổ sung field nhận diện theo từng entity (kê trong từng
     builder *SearchHaystack): lead +linkedinUrl +source; công ty +type/
     vai trò/hồ sơ (website, LinkedIn, địa điểm…)/lead liên kết; deal
     +game/stage/người phụ trách/vertical/lead gắn; game +platform/stage/
     loại/desc/studio; việc +người làm/đối tượng gắn (+công ty/game của
     deal); hoạt động +loại/chủ/người thực hiện; sự kiện +eventUrl (giữ
     nguyên các field cũ); tài liệu +description/loại/mảng; Publishing
     reviews +status/requestNote/studio của game, market +geo/platform.
   - Combo picker: KIỂM CHỨNG = đã fold + token AND nhưng token là
     CHUỖI CON (gõ dở là tính năng picker) và THIẾU nhánh gộp sát ->
     "datbike"/"dat-bike" trượt "Dat Bike": cộng thêm nhánh searchMatches,
     giữ nguyên token-substring.
   - Ca ÂM TÍNH bắt buộc mỗi bề mặt: token AND NGUYÊN TỪ — "dat bike"
     KHÔNG bắt "Dating Bike Club", "ân corp" KHÔNG bắt "Đà Nẵng Corp".
   Harness vm theo mẫu search-datbike / audit-date-dmy. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html'), pub = read('publishing.js'), shared = read('shared.js');

/* ================= Fixture index ================= */
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'yen', name: 'Yến Nguyễn', role: 'BD', active: true },
    ],
    companies: [
      { id: 'cDat', name: 'Dat Bike', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '', website: 'datbike.vn', linkedinUrl: 'https://www.linkedin.com/company/dat-bike', location: 'Đà Nẵng' },
      { id: 'cAn', name: 'Ân Corp', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cDaNang', name: 'Đà Nẵng Corp', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
      { id: 'cDating', name: 'Dating Bike Club', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' }, last: '' },
    ],
    games: [
      { id: 'gDat', title: 'Đạt Bike Racer', own: 'partner', company: 'cDat', genre: 'Racing', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: 'Game đua xe điện', scores: null, verdict: '' },
      { id: 'gPuzzle', title: 'Puzzle Cats', own: 'ours', genre: 'Puzzle', platform: 'iOS', stage: 'Alpha', emoji: '🎮', desc: '', scores: null, verdict: '' },
    ],
    deals: [
      { id: 'dDat', title: 'Hợp tác phân phối', company: 'cDat', game: 'gDat', line: 'publishing', stage: 'screening', owner: 'zac', leads: [] },
      { id: 'dOther', title: 'Deal khác hẳn', company: 'cAn', line: 'publishing', stage: 'screening', owner: 'yen', leads: [] },
    ],
    leads: [
      { id: 'lLink', name: 'Trần Văn Link', company: 'cAn', person: '', phone: '', email: '', linkedinUrl: 'https://www.linkedin.com/in/dat-bike-founder', ownerId: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lSrc', name: 'Phạm Nguồn', company: 'cAn', person: '', phone: '', email: '', linkedinUrl: '', ownerId: '', line: 'publishing', source: 'Dat Bike Expo 2026', status: 'new', note: '', when: '2026-11-01' },
      { id: 'lNeg', name: 'Lê Âm Tính', company: 'cDating', person: '', phone: '', email: '', linkedinUrl: '', ownerId: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-11-01' },
    ],
    tasks: [
      { id: 'tDat', title: 'Gọi điện chốt lịch', assignee: 'yen', deal: 'dDat', dueDate: '2026-11-20', done: false },
      { id: 'tOther', title: 'Việc khác hẳn', assignee: 'zac', dueDate: '2026-11-21', done: false },
    ],
    activities: [
      { id: 'aDat', text: 'Đã demo xe tại sự kiện', type: 'Demo', who: 'yen', deal: 'dDat', when: '2026-11-10' },
      { id: 'aOther', text: 'Ghi chú thường ngày', type: 'Note', who: 'zac', when: '2026-11-10' },
    ],
    events: [
      { id: 'evDat', name: 'Đạt Bike Expo', date: '2026-11-20', endDate: '2026-11-20', location: 'Đà Nẵng', note: '', attendees: ['yen'], companies: [], leads: [], deals: [] },
      { id: 'evOther', name: 'Hội thảo khác', date: '2026-11-21', endDate: '2026-11-21', location: 'Hà Nội', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
    salesMaterials: [
      { id: 'smDat', title: 'Deck giới thiệu 2026', description: 'Tài liệu bán hàng xe điện Dat Bike', kind: 'deck', line: 'publishing', createdAt: '2026-11-01' },
      { id: 'smOther', title: 'Deck Sava chung', description: '', kind: 'other', line: 'chung', createdAt: '2026-11-02' },
    ],
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
const viewHTML = h => h.getEl('view').innerHTML;

/* ================= 1) Tĩnh ================= */

test('tĩnh: SavaSearch ở shared.js là nguồn khớp duy nhất; index ủy quyền; không còn includes(query) thô ở mọi bề mặt list-search đã rà', () => {
  assert.ok(shared.includes('window.SavaSearch'), 'shared.js phải phơi window.SavaSearch');
  assert.ok(shared.includes('function savaSearchMatches(hay, rawQuery)'), 'shared.js thiếu savaSearchMatches');
  assert.ok(html.includes('savaSearchMatches(hay, rawQuery)'), 'searchMatches của index phải ủy quyền sang shared.js');
  const oldSurfaces = [
    '(g.title + " " + g.genre).toLowerCase().includes(query)',
    't.title.toLowerCase().includes(query)',
    '(t.title || "").toLowerCase().includes(query)',
    '(ev.name || "").toLowerCase().includes(query)',
    "(a.text+' '+actOwnerTitle(a)).toLowerCase().includes(query)",
    "(String(a.text || '') + ' ' + String(a.type || '')).toLowerCase().includes(query)",
    'salesFold(m.title || "").includes(q)',
    '(r.name+\' \'+\' \'+r.category)',
  ];
  for (const s of oldSurfaces.slice(0, 7)) assert.ok(!html.includes(s), 'index.html còn bề mặt thô: ' + s);
  assert.ok(!pub.includes("(r.name+' '+r.category).toLowerCase().includes(query)"), 'publishing market còn includes thô');
  assert.ok(!pub.includes("(label(entity(s,r.kind,r.entityId))+' '+r.kind).toLowerCase().includes(query)"), 'publishing reviews còn includes thô');
  assert.ok(pub.includes('pubSearchMatches') && pub.includes('window.SavaSearch'), 'publishing.js phải khớp qua SavaSearch dùng chung');
  for (const b of ['companySearchHaystack', 'dealSearchHaystack', 'gameSearchHaystack', 'taskSearchHaystack', 'activitySearchHaystack', 'eventSearchHaystack', 'salesSearchHaystack']) {
    assert.ok(html.includes('function ' + b + '('), 'thiếu builder ' + b);
  }
  const leadSeg = html.slice(html.indexOf('function leadSearchHaystack'), html.indexOf('function companySearchHaystack'));
  assert.ok(leadSeg.includes('l.linkedinUrl') && leadSeg.includes('l.source'), 'haystack lead phải bổ sung linkedinUrl + source');
});

/* ================= 2) SavaSearch thuần (shared.js) ================= */

test('SavaSearch thuần: ma trận biến thể + âm tính nguyên từ (nạp shared.js độc lập)', () => {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  const m = (hay, q) => ctx.window.SavaSearch.matches(hay, q);
  assert.equal(m('Dat Bike', 'dat bike'), true);
  assert.equal(m('DatBike', 'dat bike'), true, 'dính liền');
  assert.equal(m('Dat-Bike JSC', 'dat-bike'), true, 'dấu câu ở query');
  assert.equal(m('Đạt Bike', 'dat bike'), true, 'dữ liệu có dấu');
  assert.equal(m('Dat Bike', 'đạt bike'), true, 'query có dấu');
  assert.equal(m('Bike Dat', 'dat bike'), true, 'đảo thứ tự từ');
  assert.equal(m('Dating Bike Club', 'dat bike'), false, 'ÂM TÍNH: "dat" là mảnh của "dating" — không được bắt');
  assert.equal(m('Đà Nẵng Corp', 'ân corp'), false, 'ÂM TÍNH: "an" là mảnh của "nang" — không được bắt');
  assert.equal(m('Ân Corp', 'ân corp'), true);
  assert.equal(m('Dat Car', 'dat bike'), false, 'thiếu token bike');
});

/* ================= 3) Lead: field mới linkedinUrl + source ================= */

test('lead: query "dat bike" bắt lead qua linkedinUrl + qua source; KHÔNG bắt lead của Dating Bike Club', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "dat bike";');
  const ids = JSON.parse(JSON.stringify(h.run('filteredLeads().map(l => l.id)')));
  assert.ok(ids.includes('lLink'), 'lead nhận diện qua LinkedIn cá nhân (…/in/dat-bike-founder) phải khớp — nhận: ' + ids.join(','));
  assert.ok(ids.includes('lSrc'), 'lead nhận diện qua source "Dat Bike Expo 2026" phải khớp');
  assert.ok(!ids.includes('lNeg'), 'ÂM TÍNH: lead của "Dating Bike Club" không được khớp "dat bike"');
});

/* ================= 4) Công ty: haystack mở rộng + âm tính ================= */

test('công ty: tìm qua website + địa điểm có dấu; "ân corp" bắt Ân Corp, KHÔNG bắt Đà Nẵng Corp', () => {
  const h = loadIndex();
  h.run('curView = "companies"; curLine = "all"; query = "datbike.vn"; render();');
  assert.ok(viewHTML(h).includes('Dat Bike'), 'tìm theo website datbike.vn phải ra Dat Bike');
  h.run('query = "da nang"; render();');
  let v = viewHTML(h);
  assert.ok(v.includes('Dat Bike'), 'Dat Bike (địa điểm Đà Nẵng) phải hiện');
  assert.ok(v.includes('Đà Nẵng Corp'), 'Đà Nẵng Corp phải hiện với query "da nang"');
  h.run('query = "ân corp"; render();');
  v = viewHTML(h);
  assert.ok(v.includes('Ân Corp'), '"ân corp" phải bắt Ân Corp');
  assert.ok(!v.includes('Đà Nẵng Corp'), 'ÂM TÍNH: "ân corp" không được bắt Đà Nẵng Corp');
  h.run('query = "dat bike"; render();');
  assert.ok(!viewHTML(h).includes('Dating Bike Club'), 'ÂM TÍNH: "dat bike" không được bắt Dating Bike Club');
  /* ÂM TÍNH trộn xuyên field (ca list-pagination bắt được khi rà): tên
     lead liên kết KHÔNG nằm trong haystack công ty — "an link" ("an" từ
     Ân Corp + "link" từ tên lead Trần Văn Link của nó) không được bắt
     Ân Corp. */
  h.run('query = "an link"; render();');
  assert.ok(!viewHTML(h).includes('Ân Corp'), 'ÂM TÍNH: token từ tên lead không được trộn vào haystack công ty');
});

/* ================= 5) Deal: haystack mở rộng ================= */

test('deal: tìm qua tên game của deal + nhãn stage; deal công ty khác không lọt', () => {
  const h = loadIndex();
  h.run('curLine = "all"; query = "dat bike racer";');
  let ids = JSON.parse(JSON.stringify(h.run('dealsFiltered().map(d => d.id)')));
  assert.deepEqual(ids, ['dDat'], 'deal phải khớp qua game "Đạt Bike Racer" — nhận: ' + ids.join(','));
  h.run('query = "so tuyen";');
  ids = JSON.parse(JSON.stringify(h.run('dealsFiltered().map(d => d.id)')));
  assert.ok(ids.includes('dDat'), 'deal phải khớp qua nhãn stage "Sơ tuyển" (không dấu)');
});

/* ================= 6) Game ================= */

test('game: có dấu / dính liền / qua genre+platform; âm tính thiếu token', () => {
  const h = loadIndex();
  h.run('curView = "games"; curLine = "all"; query = "dat bike"; render();');
  let v = viewHTML(h);
  assert.ok(v.includes('Đạt Bike Racer'), 'query không dấu phải bắt game có dấu');
  assert.ok(!v.includes('Puzzle Cats'), 'game không liên quan phải ẩn');
  h.run('query = "racing android"; render();');
  assert.ok(viewHTML(h).includes('Đạt Bike Racer'), 'tìm qua genre + platform phải ra game');
  h.run('query = "dat cats"; render();');
  v = viewHTML(h);
  assert.ok(!v.includes('Đạt Bike Racer') && !v.includes('Puzzle Cats'), 'ÂM TÍNH: thiếu token chung thì không game nào khớp');
});

/* ================= 7) Việc: list + Dashboard + Lịch ================= */

test('việc: tìm qua người làm (có dấu) + qua công ty của deal gắn; âm tính', () => {
  const h = loadIndex();
  h.run('curView = "tasks"; query = "yen nguyen"; render();');
  let v = viewHTML(h);
  assert.ok(v.includes('Gọi điện chốt lịch'), 'việc của Yến Nguyễn phải khớp query không dấu "yen nguyen"');
  assert.ok(!v.includes('Việc khác hẳn'), 'việc của Zac không được lọt');
  h.run('query = "dat bike"; render();');
  v = viewHTML(h);
  assert.ok(v.includes('Gọi điện chốt lịch'), 'việc gắn deal của Dat Bike phải khớp qua công ty của deal');
  assert.ok(!v.includes('Việc khác hẳn'), 'ÂM TÍNH: việc không liên quan không được lọt');
});

test('lịch: calBuildItems khớp việc qua công ty của deal + sự kiện qua địa điểm; âm tính đảo từ thiếu', () => {
  const h = loadIndex();
  h.run('query = "dat bike"; calMemberFilter = ""; calKindFilter = "";');
  let items = JSON.parse(JSON.stringify(h.run('calBuildItems().dated.map(i => i.kind + ":" + i.id)')));
  assert.ok(items.includes('task:tDat'), 'lịch: việc phải khớp "dat bike" qua deal/công ty');
  assert.ok(items.includes('event:evDat'), 'lịch: sự kiện Đạt Bike Expo phải khớp');
  assert.ok(!items.includes('task:tOther'), 'ÂM TÍNH: việc khác không được vào lịch khi lọc');
  h.run('query = "da nang";');
  items = JSON.parse(JSON.stringify(h.run('calBuildItems().dated.map(i => i.kind + ":" + i.id)')));
  assert.ok(items.includes('event:evDat'), 'lịch: sự kiện phải khớp qua địa điểm "Đà Nẵng" với query không dấu');
});

/* ================= 8) Sự kiện (view) ================= */

test('sự kiện: tìm qua địa điểm + người tham dự (không dấu); âm tính', () => {
  const h = loadIndex();
  h.run('curView = "events"; query = "da nang"; render();');
  let v = viewHTML(h);
  assert.ok(v.includes('Đạt Bike Expo'), 'sự kiện ở Đà Nẵng phải khớp query không dấu');
  assert.ok(!v.includes('Hội thảo khác'), 'sự kiện ở Hà Nội không được lọt');
  h.run('query = "yen nguyen"; render();');
  assert.ok(viewHTML(h).includes('Đạt Bike Expo'), 'sự kiện phải khớp qua tên người tham dự');
  h.run('query = "dat bike club"; render();');
  assert.ok(!viewHTML(h).includes('Đạt Bike Expo'), 'ÂM TÍNH: thêm token "club" không có trong sự kiện thì không khớp');
});

/* ================= 9) Hoạt động Dashboard ================= */

test('hoạt động: dashboardActivityModel khớp qua chủ (deal) + người thực hiện; vDash legacy khớp có dấu', () => {
  const h = loadIndex();
  h.run('query = "dat bike";');
  const recs = JSON.parse(JSON.stringify(h.run('dashboardActivityModel(Date.now()).records.map(r => r.activity.id)')));
  assert.ok(recs.includes('aDat'), 'hoạt động gắn deal Dat Bike phải khớp qua nhãn chủ — nhận: ' + recs.join(','));
  assert.ok(!recs.includes('aOther'), 'ÂM TÍNH: hoạt động thường không được lọt');
  h.run('curView = "dash"; curLine = "all"; query = "dat bike"; render();');
  assert.ok(viewHTML(h).includes('Đã demo xe tại sự kiện'), 'khối Hoạt động gần nhất ở Dashboard phải hiện hoạt động khớp');
});

/* ================= 10) Tài liệu bán hàng ================= */

test('tài liệu bán hàng: tìm qua description + loại; cụm dính liền; âm tính', () => {
  const h = loadIndex();
  h.run('curView = "sales"; query = "xe dien dat bike"; render();');
  let v = viewHTML(h);
  assert.ok(v.includes('Deck giới thiệu 2026'), 'tài liệu phải khớp qua description (không dấu)');
  assert.ok(!v.includes('Deck Sava chung'), 'tài liệu khác không được lọt');
  h.run('query = "deckgioi"; render();');
  assert.ok(viewHTML(h).includes('Deck giới thiệu 2026'), 'query dính liền một phần phải khớp qua gộp sát/cụm');
});

/* ================= 11) Combo picker ================= */

test('combo: cộng nhánh gộp sát — "datbike" + "dat-bike" khớp "Dat Bike"; giữ gõ dở "nguy" khớp "Nguyễn"; âm tính thiếu từ', () => {
  const h = loadIndex();
  const opts = JSON.stringify([
    { value: 'c1', label: 'Dat Bike' },
    { value: 'c2', label: 'Dating Bike Club' },
    { value: 'l1', label: 'Nguyễn Văn Đức' },
  ]);
  let r = h.run(`comboFilterOptions(${opts}, 'datbike')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['c1'], '"datbike" dính liền phải khớp Dat Bike, không bắt Dating Bike Club');
  r = h.run(`comboFilterOptions(${opts}, 'dat-bike')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['c1'], '"dat-bike" dấu câu phải khớp Dat Bike');
  r = h.run(`comboFilterOptions(${opts}, 'nguy')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['l1'], 'gõ dở "nguy" vẫn khớp Nguyễn (tính năng picker giữ nguyên)');
  r = h.run(`comboFilterOptions(${opts}, 'dat xe')`);
  assert.deepEqual([...r.items.map(x => x.value)], [], 'ÂM TÍNH: token "xe" không có trong nhãn nào thì rỗng');
});

/* ================= (B) Ghim cơ chế loại Harish Deepak =================
   Dữ kiện server (SQL 17/11): 4 lead cùng công ty Dat Bike, cùng owner
   hoangdaden, cùng line metaverse, liên kết sống, đều khớp predicate
   khớp-chuỗi CŨ — Harish Deepak status in_response (tạo 09/11), 3 lead
   kia sent_connect (Sơn tạo 02/11, hai lead còn lại tạo 09/11). Nên tầng
   khớp chuỗi KHÔNG thể là thủ phạm: chỉ bộ lọc kế thừa của filteredLeads
   mới phân biệt được Harish. Fixture dưới đây mô phỏng đúng dữ kiện đó. */
function fixtureHarish() {
  const mk = (id, name, status, createdAt) => ({ id, name, company: 'cDatBike', person: '', phone: '', email: '', linkedinUrl: '', ownerId: 'hoangdaden', line: 'metaverse', source: '', status, note: '', when: '2026-11-09', createdAt });
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
    ],
    companies: [{ id: 'cDatBike', name: 'Dat Bike', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng' }, last: '' }],
    games: [], deals: [], tasks: [], activities: [], events: [], salesMaterials: [], verticals: [],
    leads: [
      mk('lHarish', 'Harish Deepak', 'in_response', '2026-11-09'),
      mk('lSon', 'Nguyễn Bá Cảnh Sơn', 'sent_connect', '2026-11-02'),
      mk('lPham', 'Pham Trung', 'sent_connect', '2026-11-09'),
      mk('lTam', 'Tam Vo', 'sent_connect', '2026-11-09'),
    ],
  };
}
const harishIds = h => JSON.parse(JSON.stringify(h.run('filteredLeads().map(l => l.id)')));

test('B0 nền: không bộ lọc kế thừa nào bật -> search "dat bike" ra đủ 4 lead (tầng khớp chuỗi vô tội)', () => {
  const h = loadIndex(fixtureHarish());
  h.run('curLine = "all"; query = "dat bike";');
  assert.deepEqual(harishIds(h).sort(), ['lHarish', 'lPham', 'lSon', 'lTam']);
});

test('B1 đường (a): leadStatusFilter = "sent_connect" (exact theo status HIỆN TẠI) -> mất đúng Harish, còn 3', () => {
  const h = loadIndex(fixtureHarish());
  /* Đặt tay qua đúng hàm của dropdown trạng thái ở đầu view Lead */
  h.run('curLine = "all"; query = "dat bike"; setLeadStatusFilter("sent_connect");');
  assert.deepEqual(harishIds(h).sort(), ['lPham', 'lSon', 'lTam'], 'chỉ Harish (in_response) bị loại — khớp triệu chứng 3/4');
  /* Cùng kết quả khi vào qua dashOpenLeadStatus (đường Dashboard; kỳ đặt
     null = "Tất cả" để tách bạch khỏi trục kỳ tạo) */
  const h2 = loadIndex(fixtureHarish());
  h2.run('dashPeriodDays = null; dashOpenLeadStatus("sent_connect"); query = "dat bike";');
  assert.equal(h2.run('leadStatusFilter'), 'sent_connect');
  assert.deepEqual(harishIds(h2).sort(), ['lPham', 'lSon', 'lTam'], 'dashOpenLeadStatus("sent_connect") cũng loại đúng Harish');
});

test('B2 kỳ tạo KHÔNG thể là thủ phạm đơn độc: mọi khoảng chứa 02/11 (Sơn) + 09/11 (2 lead kia) đều chứa Harish (cũng 09/11)', () => {
  const h = loadIndex(fixtureHarish());
  h.run('curLine = "all"; query = "dat bike"; leadCreatedRange = { from: "2026-11-01", to: "2026-11-30" };');
  assert.deepEqual(harishIds(h).sort(), ['lHarish', 'lPham', 'lSon', 'lTam'], 'khoảng chứa cả hai mốc tạo -> đủ 4');
  h.run('leadCreatedRange = { from: "2026-11-03", to: "2026-11-30" };');
  assert.deepEqual(harishIds(h).sort(), ['lHarish', 'lPham', 'lTam'], 'khoảng từ 03/11 chỉ loại Sơn (02/11) — người bị loại sẽ là Sơn, không phải Harish');
});

test('B3 đường (b1) chip phễu: bước "Sent connect" là TÍCH LUỸ theo status hiện tại (index >= 1) -> GỒM Harish -> search vẫn ra 4', () => {
  const h = loadIndex(fixtureHarish());
  h.run('dashFunnelLast = { funnel: SavaDash.dashLeadFunnel(S.leads, LEAD_STATUSES.filter(s => s.key !== "not_yet_have_demand").map(s => s.key), "not_yet_have_demand") };');
  const stepIds = JSON.parse(JSON.stringify(h.run('dashFunnelLast.funnel.steps.find(s => s.key === "sent_connect").leadIds')));
  assert.ok(stepIds.includes('lHarish'), 'tập ID bước sent_connect (tích luỹ >= sent_connect) phải gồm Harish (in_response ở vị trí 5 >= 1): ' + stepIds.join(','));
  h.run('dashOpenLeadFunnelStep("sent_connect"); query = "dat bike";');
  assert.ok(h.run('!!leadFunnelIds'), 'chip funnel phải đang bật sau khi bấm bước phễu');
  assert.deepEqual(harishIds(h).sort(), ['lHarish', 'lPham', 'lSon', 'lTam'], 'qua chip phễu, search vẫn ra đủ 4 — đường này KHÔNG khớp triệu chứng');
});

test('B4 đường (b2) ô "Chuyển đổi trong kỳ" sent_connect: đếm theo SỰ KIỆN vào trạng thái trong kỳ (first-entry) -> GỒM Harish -> search vẫn ra 4', () => {
  const h = loadIndex(fixtureHarish());
  const ev = [];
  for (const id of ['lHarish', 'lSon', 'lPham', 'lTam']) {
    ev.push({ entityType: 'lead', entityId: id, at: '2026-11-09T10:00:00', byMemberId: 'hoangdaden', changes: [{ field: 'status', from: '', to: 'Mới' }] });
    ev.push({ entityType: 'lead', entityId: id, at: '2026-11-10T10:00:00', byMemberId: 'hoangdaden', changes: [{ field: 'status', from: 'Mới', to: 'Sent connect' }] });
  }
  ev.push({ entityType: 'lead', entityId: 'lHarish', at: '2026-11-12T10:00:00', byMemberId: 'hoangdaden', changes: [{ field: 'status', from: 'Sent connect', to: 'In-response' }] });
  h.run(`dashConversionLast = { conversion: SavaDash.dashConversionsByStatusInPeriod(S.leads, [], ${JSON.stringify(ev)}, 30, new Date("2026-11-17T12:00:00"), null, ""), periodLabel: "30 ngày" };`);
  const cellIds = JSON.parse(JSON.stringify(h.run('dashConversionLast.conversion.columnTotals.lead.find(c => c.key === "sent_connect").leadIds')));
  assert.ok(cellIds.includes('lHarish'), 'ô sent_connect (đếm sự kiện vào-S trong kỳ, Harish đã qua sent_connect 10/11) phải gồm Harish: ' + cellIds.join(','));
  h.run('dashOpenLeadConversionCell("", "sent_connect"); query = "dat bike";');
  assert.deepEqual(harishIds(h).sort(), ['lHarish', 'lPham', 'lSon', 'lTam'], 'qua chip chuyển-đổi-trong-kỳ, search vẫn ra đủ 4 — đường này KHÔNG khớp triệu chứng');
});

test('B5 kiểm kê HIỂN THỊ restriction khi đang search ở view Leads', () => {
  const h = loadIndex(fixtureHarish());
  /* (i) Trạng thái exact đang bật + đang search: chỉ dấu hiệu là option
     được chọn sẵn trong dropdown; KHÔNG banner/cảnh báo/số đếm thu hẹp;
     block In-response (nơi Harish thuộc về) biến mất hẳn không dấu vết. */
  h.run('curView = "leads"; curLine = "all"; query = "dat bike"; setLeadStatusFilter("sent_connect");');
  let v = viewHTML(h);
  assert.ok(v.includes('<option value="sent_connect" selected>Sent connect</option>'), 'dấu hiệu duy nhất của lọc trạng thái: option selected trong dropdown');
  assert.ok(!v.includes('data-lead-status="in_response"'), 'block In-response bị ẩn hẳn khi đang lọc — không dấu vết nào cho biết Harish bị giấu ở đây (nhãn "In-response" chỉ còn trong dropdown + dòng chú thích liệt kê trạng thái)');
  assert.ok(v.includes('data-lead-status="sent_connect"'), 'block Sent connect là block duy nhất còn hiện');
  assert.ok(!v.includes('Đang lọc') && !v.includes('đang bị thu hẹp') && !v.includes('kết quả khớp'), 'không có banner/cảnh báo/số đếm kết quả nào nói kết quả đang bị thu hẹp bởi bộ lọc kế thừa');
  /* (ii) Kỳ tạo preset (số ngày): không chip — chỉ option trong select. */
  h.run('setLeadStatusFilter(""); leadCreatedPeriodDays = 30; render();');
  v = viewHTML(h);
  assert.ok(v.includes('<option value="30" selected>Tạo trong 30 ngày</option>'), 'kỳ preset chỉ hiện qua option selected');
  assert.ok(!v.includes('📅 Tạo từ'), 'kỳ preset KHÔNG có chip riêng (chỉ kỳ Tuỳ chỉnh mới có chip 📅 kèm ✕)');
  /* (iii) Kỳ Tuỳ chỉnh + chip funnel: chip tường minh kèm nút ✕. */
  h.run('leadCreatedPeriodDays = null; leadCreatedRange = { from: "2026-11-01", to: "2026-11-30" }; render();');
  assert.ok(viewHTML(h).includes('📅 Tạo từ 01-11-2026 đến 30-11-2026'), 'kỳ Tuỳ chỉnh có chip 📅 ghi rõ khoảng + ✕');
  const h2 = loadIndex(fixtureHarish());
  h2.run('curView = "leads"; dashFunnelLast = { funnel: SavaDash.dashLeadFunnel(S.leads, LEAD_STATUSES.filter(s => s.key !== "not_yet_have_demand").map(s => s.key), "not_yet_have_demand") }; dashOpenLeadFunnelStep("sent_connect");');
  assert.ok(viewHTML(h2).includes('🎯 Đang xem tập đã đếm') && viewHTML(h2).includes('clearLeadFunnelIds()'), 'chip funnel tường minh: nhãn tập đã đếm + số lead + nút ✕ gỡ tại chỗ');
});

/* ================= 12) Publishing / MKT ================= */

function loadPublishing() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'cDat', name: 'Đạt Bike Studio', type: 'Game studio', roles: { publishing: 'Game studio' } },
      { id: 'cAn', name: 'Ân Corp', type: 'Doanh nghiệp', roles: { publishing: 'Khách hàng' } },
    ],
    games: [{ id: 'gPuzzle', title: 'Puzzle Cats', own: 'partner', company: 'cAn', genre: 'Puzzle', platform: 'Android', stage: 'Prototype' }],
    deals: [], leads: [], tasks: [], activities: [], verticals: [],
  }));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [
    { id: 'rDat', kind: 'company', entityId: 'cDat', status: 'Chờ đánh giá', requestNote: 'Ưu tiên xem sớm', revisions: [], current: {} },
    { id: 'rGame', kind: 'game', entityId: 'gPuzzle', status: 'Chờ đánh giá', requestNote: '', revisions: [], current: {} },
  ], marketUpdates: [
    { id: 'OBS-DAT', name: 'Đua Xe Đạt', category: 'Puzzle', geo: 'US', platform: 'Google Play + iOS', date: '2026-08-15', downloads: 100, revenue: 100, history: {}, cpi: {}, top1: null, top3: null, top5: null },
  ] }));
  const makeElement = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, setSelectionRange() {}, reportValidity: () => true, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map(); const handlers = {};
  const documentStub = { readyState: 'complete', body: Object.assign(makeElement(), { dataset: { role: 'bd' } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    getElementById: () => null, createElement: () => makeElement() };
  class FakeFormData { constructor(f) { this.m = (f && f._fields) || new Map(); } get(k) { return this.m.has(k) ? this.m.get(k) : null; } getAll(k) { const v = this.m.get(k); return v === undefined ? [] : [v]; } }
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/publishing.html' },
    addEventListener() {}, URLSearchParams, URL, structuredClone, FormData: FakeFormData,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const fireInput = (id, value) => { (handlers.input || []).forEach(fn => fn({ target: { id, value, selectionStart: value.length } })); };
  const fireClickTab = tab => { (handlers.click || []).forEach(fn => fn({ target: { closest: sel => ({ dataset: { tab }, hasAttribute: () => false }) } })); };
  return { ctx, elements, fireInput, fireClickTab, screen: () => elements.get('#screen').innerHTML };
}

test('publishing market: mechanic có dấu qua marketUpdate — không dấu / đảo từ đều khớp; âm tính thêm token lạ', () => {
  const p = loadPublishing();
  p.fireInput('marketSearch', 'dua xe dat');
  assert.ok(p.screen().includes('Đua Xe Đạt'), 'query không dấu phải bắt mechanic "Đua Xe Đạt" — màn: ' + p.screen().slice(0, 200));
  p.fireInput('marketSearch', 'dat xe');
  assert.ok(p.screen().includes('Đua Xe Đạt'), 'đảo thứ tự từ phải khớp (token AND nguyên từ)');
  p.fireInput('marketSearch', 'dua xe dat bike');
  assert.ok(!p.screen().includes('Đua Xe Đạt'), 'ÂM TÍNH: thêm token "bike" không có trong mechanic thì không khớp');
  p.fireInput('marketSearch', 'match 3');
  assert.ok(p.screen().includes('Match-3'), 'query "match 3" phải bắt mechanic "Match-3" (gộp sát/dấu câu)');
});

test('publishing reviews: tìm company có dấu bằng query không dấu + qua requestNote; âm tính', () => {
  const p = loadPublishing();
  p.fireClickTab('reviews');
  p.fireInput('reviewSearch', 'dat bike');
  let s = p.screen();
  assert.ok(s.includes('Đạt Bike Studio'), 'query "dat bike" không dấu phải bắt company "Đạt Bike Studio"');
  assert.ok(!s.includes('Puzzle Cats'), 'hồ sơ game không liên quan phải ẩn');
  p.fireInput('reviewSearch', 'uu tien xem som');
  assert.ok(p.screen().includes('Đạt Bike Studio'), 'tìm qua requestNote (không dấu) phải ra hồ sơ');
  p.fireInput('reviewSearch', 'dat bike club');
  assert.ok(!p.screen().includes('Đạt Bike Studio'), 'ÂM TÍNH: thêm token "club" thì không khớp');
});
