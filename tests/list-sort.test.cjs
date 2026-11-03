/* Việc 6 — SORT + ĐÁNH SỐ THỨ TỰ cho mọi danh sách:
   - Helper thuần window.SavaSort (shared.js): sort theo Tên (KHÔNG DẤU
     tiếng Việt), theo Date modified (updatedAt), theo Deal size
     (amount) — cả 2 chiều cho từng tiêu chí; bản ghi THIẾU updatedAt
     xếp CUỐI ở cả hai chiều; deal không có amount hợp lệ (thiếu amount
     hoặc deal mảng game rev-share) xếp CUỐI ở cả hai chiều khi sort
     theo amount. Chiều mặc định khi chọn tiêu chí mới: Tên A→Z,
     updated Mới→Cũ, amount Lớn→Nhỏ; bấm lại cùng tiêu chí -> đảo chiều.
   - Sort là thao tác hiển thị THUẦN: sortItems không mutate mảng vào /
     bản ghi; ở tầng UI (setListSort phía BD + setReviewSort phía
     Publishing) sort KHÔNG đổi updatedAt, KHÔNG ghi lại kho
     (localStorage giữ nguyên từng byte -> không save/sync), KHÔNG
     sinh lịch sử (lịch sử sinh ở đường save() — kho không đổi thì
     không có mục mới).
   - UI phía BD: pattern duy nhất — bảng bấm tiêu đề cột (sortThHTML),
     list thẻ/dòng dùng hàng nút sort (sortBarHTML), cùng chỉ dấu
     ▲/▼/↕. STT = thứ tự hiển thị SAU lọc + sort, đánh lại từ 1; Lead
     dạng Block: STT LIÊN TỤC qua các trang trong cùng block.
   Trước Việc 6 các list KHÔNG có sort/STT nào — toàn bộ test hành vi
   trong file này là khẳng định hành vi MỚI. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const pubSrc = read('publishing.js');

/* ================= (A) Helper thuần SavaSort ================= */
function loadShared() {
  const ctx = vm.createContext({ console, URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaSort;
}
function sortFixture() {
  return [
    { id: 'ech', name: 'Ếch', updatedAt: '2026-10-01T00:00:00.000Z', amount: 50, line: 'ai' },
    { id: 'danang', name: 'Đà Nẵng', updatedAt: '2026-11-01T00:00:00.000Z', amount: 500, line: 'ai' },
    { id: 'an', name: 'Ân', updatedAt: '2026-09-01T00:00:00.000Z', amount: 5, line: 'metaverse' },
    { id: 'binh', name: 'Bình', amount: 100, line: 'ai' }, /* thiếu updatedAt */
    { id: 'game', name: 'Game Deal', updatedAt: '2026-12-01T00:00:00.000Z', amount: 9999, line: 'publishing' }, /* mảng game: amount không tính */
    { id: 'khong', name: 'Không tiền', updatedAt: '2026-08-01T00:00:00.000Z', line: 'ai' }, /* thiếu amount */
  ];
}
const ids = arr => arr.map(x => x.id);

test('SavaSort.fold: bỏ dấu tiếng Việt đúng như helper chuẩn hoá sẵn có (Ếch->ech, Đà Nẵng->da nang, Ân->an)', () => {
  const SS = loadShared();
  assert.equal(SS.fold('Ếch'), 'ech');
  assert.equal(SS.fold('Đà Nẵng'), 'da nang');
  assert.equal(SS.fold('Ân'), 'an');
  assert.equal(SS.fold(''), '');
  assert.equal(SS.fold(null), '');
});

test('SavaSort tên: A→Z không dấu (Ân/Ếch không bị đẩy xuống cuối) + chiều ngược', () => {
  const SS = loadShared();
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'name', dir: 'asc' })), ['an', 'binh', 'danang', 'ech', 'game', 'khong']);
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'name', dir: 'desc' })), ['khong', 'game', 'ech', 'danang', 'binh', 'an']);
});

test('SavaSort updated: mới→cũ và cũ→mới; bản ghi THIẾU updatedAt luôn CUỐI ở cả hai chiều', () => {
  const SS = loadShared();
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'updated', dir: 'desc' })), ['game', 'danang', 'ech', 'an', 'khong', 'binh']);
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'updated', dir: 'asc' })), ['khong', 'an', 'ech', 'danang', 'game', 'binh']);
  /* dấu hỏng (không đọc được ngày) cũng coi như thiếu -> cuối */
  const bad = [{ id: 'x', name: 'X', updatedAt: 'không-phải-ngày' }, { id: 'y', name: 'Y', updatedAt: '2026-01-01T00:00:00.000Z' }];
  assert.deepEqual(ids(SS.sortItems(bad, { key: 'updated', dir: 'desc' })), ['y', 'x']);
  assert.deepEqual(ids(SS.sortItems(bad, { key: 'updated', dir: 'asc' })), ['y', 'x']);
});

test('SavaSort amount: lớn→nhỏ và nhỏ→lớn; deal thiếu amount + deal mảng game (rev-share) luôn CUỐI ở cả hai chiều', () => {
  const SS = loadShared();
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'amount', dir: 'desc' })), ['danang', 'binh', 'ech', 'an', 'game', 'khong']);
  assert.deepEqual(ids(SS.sortItems(sortFixture(), { key: 'amount', dir: 'asc' })), ['an', 'ech', 'binh', 'danang', 'game', 'khong']);
  assert.equal(SS.amountOf({ amount: 9999, line: 'game_studio' }), null, 'deal Game Studio không có amount hợp lệ cho sort');
  assert.equal(SS.amountOf({ amount: 0, line: 'ai' }), 0, 'amount 0 là giá trị hợp lệ, không phải thiếu');
  assert.equal(SS.amountOf({ amount: '500', line: 'ai' }), null, 'amount không phải số -> thiếu');
});

test('SavaSort.next: chọn tiêu chí mới -> chiều mặc định (name asc, updated desc, amount desc); bấm lại -> đảo chiều', () => {
  const SS = loadShared();
  const nx = (s, k) => { const r = SS.next(s, k); return [r.key, r.dir]; }; /* so theo cặp giá trị: object trả về thuộc realm vm, deepStrictEqual chê prototype */
  assert.deepEqual(nx({ key: null, dir: null }, 'name'), ['name', 'asc']);
  assert.deepEqual(nx({ key: null, dir: null }, 'updated'), ['updated', 'desc']);
  assert.deepEqual(nx({ key: null, dir: null }, 'amount'), ['amount', 'desc']);
  assert.deepEqual(nx({ key: 'name', dir: 'asc' }, 'name'), ['name', 'desc']);
  assert.deepEqual(nx({ key: 'updated', dir: 'desc' }, 'updated'), ['updated', 'asc']);
  assert.deepEqual(nx({ key: 'name', dir: 'desc' }, 'amount'), ['amount', 'desc'], 'đổi tiêu chí -> về mặc định của tiêu chí mới, không giữ chiều cũ');
  assert.equal(SS.indicator({ key: 'name', dir: 'asc' }, 'name'), '▲');
  assert.equal(SS.indicator({ key: 'name', dir: 'desc' }, 'name'), '▼');
  assert.equal(SS.indicator({ key: 'name', dir: 'asc' }, 'updated'), '↕');
});

test('SavaSort.sortItems THUẦN: không mutate mảng vào, không đổi field nào của bản ghi (kể cả updatedAt), state rỗng -> giữ nguyên thứ tự', () => {
  const SS = loadShared();
  const items = sortFixture();
  const before = JSON.stringify(items);
  const out = SS.sortItems(items, { key: 'updated', dir: 'desc' });
  assert.notEqual(out, items, 'phải trả mảng mới');
  assert.equal(JSON.stringify(items), before, 'mảng gốc + bản ghi phải nguyên vẹn sau sort');
  assert.deepEqual(ids(SS.sortItems(items, { key: null, dir: null })), ids(items), 'chưa chọn tiêu chí -> giữ nguyên thứ tự hiện hành');
  assert.deepEqual(ids(SS.sortItems(items, null)), ids(items));
});

/* ================= (B) Tích hợp UI phía BD (index.html) ================= */
function fixtureState() {
  const leadNums = ['07', '02', '11', '01', '05', '12', '03', '09', '04', '10', '06', '08'];
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true, updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'myen', name: 'Yến Võ', role: 'BD', active: true, updatedAt: '2026-10-05T00:00:00.000Z' },
      { id: 'man', name: 'Ân Trần', role: 'BD', active: true, updatedAt: '2026-11-05T00:00:00.000Z' },
      { id: 'mbinh', name: 'Bình Lê', role: 'MKT', active: true }, /* thiếu updatedAt */
    ],
    companies: [
      { id: 'c1', name: 'Ếch Corp', type: 'Studio', roles: { ai: 'Doanh nghiệp' }, last: 'Hôm qua', updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'c2', name: 'Ân Corp', type: 'Studio', roles: { ai: 'Doanh nghiệp' }, last: 'Hôm nay', updatedAt: '2026-11-01T00:00:00.000Z' },
      { id: 'c3', name: 'Đà Nẵng Corp', type: 'Studio', roles: { ai: 'Doanh nghiệp' }, last: '—' }, /* thiếu updatedAt */
    ],
    games: [
      { id: 'g1', title: 'Ếch Game', own: 'partner', company: 'c2', genre: 'Puzzle', platform: 'Android', stage: 'Dev', desc: '' },
      { id: 'g2', title: 'Ân Game', own: 'partner', company: 'c2', genre: 'Puzzle', platform: 'Android', stage: 'Dev', desc: '' },
    ],
    deals: [
      { id: 'd1', line: 'ai', title: 'Ếch Deal', company: 'c2', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 10, cur: 'VND', custom: {}, updatedAt: '2026-11-02T00:00:00.000Z' },
      { id: 'd2', line: 'ai', title: 'Ân Deal', company: 'c2', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 999, cur: 'VND', custom: {}, updatedAt: '2026-10-02T00:00:00.000Z' },
      { id: 'd3', line: 'ai', title: 'Bình Deal', company: 'c2', stage: 'prospect', owner: 'zac', due: '', idle: 0, cur: 'VND', custom: {} }, /* không amount, không updatedAt */
    ],
    leads: leadNums.map(n => ({ id: 'L' + n, name: 'Người ' + n, company: 'c2', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '', updatedAt: '2026-10-' + n + 'T00:00:00.000Z' })),
    tasks: [
      { id: 't1', title: 'Việc Ếch', assignee: 'zac', done: false, updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 't2', title: 'Việc Ân', assignee: 'zac', done: false, updatedAt: '2026-11-01T00:00:00.000Z' },
    ],
    activities: [],
    events: [
      { id: 'e1', name: 'Ếch Event', date: '2026-11-01', location: '', note: '', attendees: [], companies: [], leads: [], deals: [], updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'e2', name: 'Ân Event', date: '2026-11-02', location: '', note: '', attendees: [], companies: [], leads: [], deals: [], updatedAt: '2026-11-01T00:00:00.000Z' },
    ],
    verticals: [],
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
const tableRows = h => [...h.getEl('view').innerHTML.matchAll(/<td class="list-stt">(\d+)<\/td><td><b>([^<]+)<\/b>/g)].map(m => [Number(m[1]), m[2]]);
function renderView(h, view, extra) {
  h.run(`curView = "${view}"; curLine = "all"; query = ""; ${extra || ''} render();`);
  return h.getEl('view').innerHTML;
}

test('tĩnh BD: một pattern sort duy nhất (sortThHTML cho bảng + sortBarHTML cho thẻ/dòng), setListSort chỉ render, không save/sync/đóng dấu', () => {
  assert.ok(html.includes('function sortThHTML(') && html.includes('function sortBarHTML(') && html.includes('function setListSort('), 'thiếu helper pattern sort dùng chung');
  assert.ok(html.includes('SavaSort.next') && html.includes('SavaSort.sortItems'), 'UI phải đi qua SavaSort dùng chung của shared.js');
  const seg = html.slice(html.indexOf('function setListSort('), html.indexOf('function applyListSort('));
  assert.ok(seg.includes('render()'), 'setListSort phải render lại');
  assert.ok(!/[^\/\w]save\(\)/.test(seg.replace(/\/\*[\s\S]*?\*\//g, '')), 'setListSort TUYỆT ĐỐI không được gọi save()');
  assert.ok(!seg.includes('SavaData') && !seg.includes('localStorage.setItem'), 'setListSort không được ghi kho/đồng bộ');
  for (const scope of ['companies', 'games', 'deals', 'leads', 'events', 'tasks', 'tasksByMember', 'members']) {
    assert.ok(html.includes(`applyListSort("${scope}"`) || html.includes(`applyListSort('${scope}'`), 'chưa áp sort cho scope ' + scope);
  }
});

test('Công ty: mặc định giữ thứ tự hiện hành + STT 1..n; sort tên không dấu 2 chiều; sort updated — thiếu dấu luôn cuối 2 chiều; STT đánh lại sau sort và sau lọc', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  assert.deepEqual(tableRows(h), [[1, 'Ếch Corp'], [2, 'Ân Corp'], [3, 'Đà Nẵng Corp']], 'mặc định lần đầu: thứ tự hiện hành + STT theo thứ tự đó');
  h.run('setListSort("companies", "name");');
  assert.deepEqual(tableRows(h), [[1, 'Ân Corp'], [2, 'Đà Nẵng Corp'], [3, 'Ếch Corp']], 'tên A→Z không dấu + STT đánh lại theo thứ tự mới');
  h.run('setListSort("companies", "name");');
  assert.deepEqual(tableRows(h), [[1, 'Ếch Corp'], [2, 'Đà Nẵng Corp'], [3, 'Ân Corp']], 'bấm lại cùng tiêu chí -> đảo chiều, STT đánh lại');
  h.run('setListSort("companies", "updated");');
  assert.deepEqual(tableRows(h), [[1, 'Ân Corp'], [2, 'Ếch Corp'], [3, 'Đà Nẵng Corp']], 'updated mặc định Mới→Cũ; công ty thiếu updatedAt xếp cuối');
  h.run('setListSort("companies", "updated");');
  assert.deepEqual(tableRows(h), [[1, 'Ếch Corp'], [2, 'Ân Corp'], [3, 'Đà Nẵng Corp']], 'updated Cũ→Mới; thiếu dấu VẪN cuối');
  h.run('query = "ân corp"; render();');
  assert.deepEqual(tableRows(h), [[1, 'Ân Corp']], 'sau lọc, STT đánh lại từ 1 theo tập đã lọc + sort');
});

test('Deal pipeline: sort trong từng cột stage theo amount (mặc định Lớn→Nhỏ; deal không amount cuối ở cả 2 chiều) và theo updated; STT là số trong cột', () => {
  const h = loadIndex();
  h.run('curView = "board"; curLine = "ai"; query = ""; render();');
  const cards = () => [...h.getEl('view').innerHTML.matchAll(/<span class="list-stt">#(\d+)<\/span> ([^<]+)<\/div>/g)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(cards(), [[1, 'Ếch Deal'], [2, 'Ân Deal'], [3, 'Bình Deal']], 'mặc định giữ thứ tự hiện hành trong cột');
  h.run('setListSort("deals", "amount");');
  assert.deepEqual(cards(), [[1, 'Ân Deal'], [2, 'Ếch Deal'], [3, 'Bình Deal']], 'amount Lớn→Nhỏ; deal không amount xếp cuối');
  h.run('setListSort("deals", "amount");');
  assert.deepEqual(cards(), [[1, 'Ếch Deal'], [2, 'Ân Deal'], [3, 'Bình Deal']], 'amount Nhỏ→Lớn; deal không amount VẪN cuối');
  h.run('setListSort("deals", "updated");');
  assert.deepEqual(cards(), [[1, 'Ếch Deal'], [2, 'Ân Deal'], [3, 'Bình Deal']], 'updated Mới→Cũ; deal thiếu dấu cuối');
  assert.ok(h.getEl('view').innerHTML.includes('sortBarHTML') || h.getEl('view').innerHTML.includes('sort-bar'), 'pipeline deal phải có hàng điều khiển sort');
  assert.ok(h.getEl('view').innerHTML.includes('Giá trị deal'), 'hàng sort của deal phải có tiêu chí Giá trị deal');
});

test('Game + Việc + Sự kiện + Thành viên: sort tên không dấu + STT hiển thị đúng thứ tự sau sort', () => {
  const h = loadIndex();
  renderView(h, 'games');
  h.run('setListSort("games", "name");');
  assert.deepEqual([...h.getEl('view').innerHTML.matchAll(/list-stt">#(\d+)<\/div><h4>([^<]+)<\/h4>/g)].map(m => [Number(m[1]), m[2]]), [[1, 'Ân Game'], [2, 'Ếch Game']], 'game: Ân trước Ếch (không dấu), STT theo thứ tự mới');
  renderView(h, 'tasks');
  h.run('setListSort("tasks", "name");');
  assert.deepEqual([...h.getEl('view').innerHTML.matchAll(/<span class="list-stt mut">#(\d+)<\/span><div><div class="tt"[^>]*>([^<]+)<\/div>/g)].map(m => [Number(m[1]), m[2]]), [[1, 'Việc Ân'], [2, 'Việc Ếch']], 'việc: sort theo tiêu đề, STT đánh lại');
  renderView(h, 'events');
  h.run('setListSort("events", "name");');
  assert.deepEqual([...h.getEl('view').innerHTML.matchAll(/<td class="list-stt">(\d+)<\/td><td><b>🎪 ([^<]+)<\/b>/g)].map(m => [Number(m[1]), m[2]]), [[1, 'Ân Event'], [2, 'Ếch Event']], 'sự kiện: sort theo tên, STT đánh lại');
  renderView(h, 'members');
  h.run('setListSort("members", "name");');
  const mrows = tableRows(h).filter(([, n]) => n !== 'Zac');
  assert.deepEqual(mrows, [[1, 'Ân Trần'], [2, 'Bình Lê'], [3, 'Yến Võ']], 'thành viên: sort tên không dấu (Ân < Bình < Yến), STT liên tục gồm cả Zac ở vị trí theo sort');
  h.run('setListSort("members", "updated");');
  const urows = tableRows(h);
  assert.equal(urows[urows.length - 1][1], 'Bình Lê', 'thành viên thiếu updatedAt xếp cuối khi sort updated Mới→Cũ');
});

test('Lead Block: sort áp trong block trước khi chia trang; STT LIÊN TỤC qua trang (trang 2 bắt đầu từ 11); lọc -> STT đánh lại từ 1', () => {
  const h = loadIndex();
  renderView(h, 'leads', 'leadViewMode = "block";');
  const blockNew = () => {
    const seg = h.getEl('view').innerHTML.split('data-lead-status="new"')[1].split('data-lead-status=')[0];
    return [...seg.matchAll(/<td class="list-stt">(\d+)<\/td><td><b>([^<]+)<\/b>/g)].map(m => [Number(m[1]), m[2]]);
  };
  assert.deepEqual(blockNew().map(([, n]) => n), ['Người 07', 'Người 02', 'Người 11', 'Người 01', 'Người 05', 'Người 12', 'Người 03', 'Người 09', 'Người 04', 'Người 10'], 'mặc định trang 1 giữ thứ tự hiện hành');
  h.run('setListSort("leads", "name");');
  const p1 = blockNew();
  assert.deepEqual(p1.map(([, n]) => n), ['Người 01', 'Người 02', 'Người 03', 'Người 04', 'Người 05', 'Người 06', 'Người 07', 'Người 08', 'Người 09', 'Người 10'], 'sau sort tên, trang 1 là 10 lead đầu theo thứ tự mới');
  assert.deepEqual(p1.map(([s]) => s), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  h.run('setLeadBlockPage("new", 2);');
  assert.deepEqual(blockNew(), [[11, 'Người 11'], [12, 'Người 12']], 'STT trang 2 chạy LIÊN TỤC 11, 12 — không reset về 1');
  h.run('query = "người 05"; render();');
  assert.deepEqual(blockNew(), [[1, 'Người 05']], 'đổi bộ lọc -> STT đánh lại từ 1');
});

test('Lead Pipeline: thẻ trong cột được sort theo cùng trạng thái sort của Lead + STT trong cột', () => {
  const h = loadIndex();
  renderView(h, 'leads', 'leadViewMode = "pipeline";');
  h.run('setListSort("leads", "name");');
  const seg = h.getEl('view').innerHTML.split('data-lead-status="new"')[1].split('data-lead-status=')[0];
  const names = [...seg.matchAll(/<span class="list-stt">#(\d+)<\/span> 📥 ([^<]+)/g)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(names.slice(0, 3), [[1, 'Người 01'], [2, 'Người 02'], [3, 'Người 03']], 'pipeline lead: thẻ sort theo tên + STT trong cột');
});

test('Sort phía BD là hiển thị thuần: đổi sort mọi scope -> kho localStorage nguyên từng byte, updatedAt mọi bản ghi không đổi, trạng thái sort giữ khi chuyển view', () => {
  const h = loadIndex();
  renderView(h, 'companies');
  const rawBefore = h.ls.getItem('sava_crm_shared_v1');
  const stampsBefore = h.run('JSON.stringify(["companies","games","deals","leads","tasks","events","members"].map(k => (S[k]||[]).map(x => x.id + "=" + (x.updatedAt || ""))).flat())');
  for (const v of ['companies', 'games', 'board', 'leads', 'events', 'tasks', 'members']) {
    h.run(`curView = "${v}"; ${v === 'board' ? 'curLine = "ai";' : 'curLine = "all";'} render();`);
    h.run(`setListSort("${v === 'board' ? 'deals' : v}", "name"); setListSort("${v === 'board' ? 'deals' : v}", "updated");`);
  }
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), rawBefore, 'sort không được ghi lại kho (không save/sync)');
  assert.equal(h.run('JSON.stringify(["companies","games","deals","leads","tasks","events","members"].map(k => (S[k]||[]).map(x => x.id + "=" + (x.updatedAt || ""))).flat())'), stampsBefore, 'sort không được đổi updatedAt của bất kỳ bản ghi nào');
  /* giữ trạng thái sort trong phiên khi chuyển view qua lại */
  renderView(h, 'companies');
  assert.deepEqual(tableRows(h).map(([, n]) => n), ['Ân Corp', 'Ếch Corp', 'Đà Nẵng Corp'], 'quay lại view Công ty: sort updated Mới→Cũ (chiều mặc định khi chọn tiêu chí updated trong vòng lặp) vẫn còn nguyên, thiếu dấu vẫn cuối');
  assert.equal(h.run('Object.prototype.hasOwnProperty.call(S, "listSortStates")'), false, 'trạng thái sort không nằm trong dữ liệu S');
});

/* ================= (C) Publishing — danh sách request ================= */
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
function loadPublishing() {
  const ls = makeLocalStorage();
  const crmState = {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'pc1', name: 'Ếch Studio', type: 'Studio', roles: { publishing: 'Studio' }, last: '' },
      { id: 'pc2', name: 'Ân Studio', type: 'Studio', roles: { publishing: 'Studio' }, last: '' },
      { id: 'pc3', name: 'Đà Nẵng Studio', type: 'Studio', roles: { publishing: 'Studio' }, last: '' },
    ],
    games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [],
  };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  const req = (id, entityId, updatedAt) => ({ id, kind: 'company', entityId, requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-08-01T00:00:00.000Z', current: null, revisions: [], revision: 0, ...(updatedAt ? { updatedAt } : {}) });
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [req('REV-1', 'pc1', '2026-09-01T00:00:00.000Z'), req('REV-2', 'pc2', '2026-11-01T00:00:00.000Z'), req('REV-3', 'pc3', null)], marketUpdates: [] }));
  const elements = new Map();
  const documentStub = {
    readyState: 'complete',
    body: Object.assign(makeElement(), { dataset: { role: 'bd' } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '?tab=reviews', href: 'http://localhost/publishing.html?tab=reviews' },
    addEventListener() {}, URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, ls, elements };
}
const reviewCards = els => [...(els.get('#screen').innerHTML.matchAll(/list-stt">#(\d+)<\/span><\/div><h3>([^<]+)<\/h3>/g))].map(m => [Number(m[1]), m[2]]);

test('tĩnh Publishing: danh sách request dùng SavaSort dùng chung + hook SavaReviewSort; setReviewSort chỉ renderReviews, không write()', () => {
  assert.ok(pubSrc.includes('window.SavaSort.sortItems'), 'renderReviews chưa sort qua SavaSort dùng chung');
  assert.ok(pubSrc.includes('data-action="review-sort"') || pubSrc.includes("data-action='review-sort'"), 'thiếu nút sort của danh sách request');
  const seg = pubSrc.slice(pubSrc.indexOf('function setReviewSort('), pubSrc.indexOf('function reviewSortBarHTML('));
  assert.ok(seg.includes('renderReviews()') && !seg.includes('write('), 'setReviewSort chỉ được render lại, không write()');
});

test('Publishing reviews: mặc định giữ thứ tự + STT; sort tên không dấu 2 chiều; sort updated thiếu dấu cuối 2 chiều; sort không ghi lại kho', () => {
  const { ctx, ls, elements } = loadPublishing();
  assert.deepEqual(reviewCards(elements), [[1, 'Ếch Studio'], [2, 'Ân Studio'], [3, 'Đà Nẵng Studio']], 'mặc định: thứ tự hiện hành + STT 1..3');
  const rawBefore = ls.getItem('sava_publishing_v1');
  ctx.window.SavaReviewSort.set('name');
  assert.deepEqual(reviewCards(elements), [[1, 'Ân Studio'], [2, 'Đà Nẵng Studio'], [3, 'Ếch Studio']], 'tên A→Z không dấu + STT đánh lại');
  ctx.window.SavaReviewSort.set('name');
  assert.deepEqual(reviewCards(elements), [[1, 'Ếch Studio'], [2, 'Đà Nẵng Studio'], [3, 'Ân Studio']], 'bấm lại -> đảo chiều');
  ctx.window.SavaReviewSort.set('updated');
  assert.deepEqual(reviewCards(elements), [[1, 'Ân Studio'], [2, 'Ếch Studio'], [3, 'Đà Nẵng Studio']], 'updated Mới→Cũ; request thiếu updatedAt cuối');
  ctx.window.SavaReviewSort.set('updated');
  assert.deepEqual(reviewCards(elements), [[1, 'Ếch Studio'], [2, 'Ân Studio'], [3, 'Đà Nẵng Studio']], 'updated Cũ→Mới; thiếu dấu VẪN cuối');
  assert.equal(ls.getItem('sava_publishing_v1'), rawBefore, 'sort request không được ghi lại kho Publishing (không write/sync, không đổi updatedAt)');
});
