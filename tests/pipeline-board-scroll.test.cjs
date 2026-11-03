/* Pipeline board SCROLL (Deal theo mảng + Lead Pipeline):
   - Trước đây .board/.col cao theo nội dung nên thanh cuộn ngang nằm ở
     đáy tài liệu: muốn cuộn ngang phải kéo trang xuống tận cùng.
   - Nay CHỈ hai board pipeline mang class .pipeline-board (CSS scoped
     trong workspace-design.css): board bị giới hạn chiều cao theo
     viewport (100vh/100dvh trừ --pipeline-reserve suy ra từ layout
     thật), từng cột là flex-column với header (h4 + .sum) nằm NGOÀI
     vùng cuộn .col-cards, danh sách thẻ tự cuộn dọc trong .col-cards.
   - Board Việc theo người vẫn dùng .board thường — KHÔNG đổi hành vi.
   - Trang Publishing không có khung kanban .board/.col (chỉ bảng +
     card-grid) nên không áp dụng; CSS scoped .pipeline-board cũng
     không chạm được vào nó.
   - Kéo-thả: handler ondragover/ondrop giữ nguyên trên .col, thẻ
     draggable giữ nguyên — sự kiện nổi bọt từ .col-cards lên .col,
     engine kéo-thả (drop/dropLead + confirmStageChange) không đổi. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const wcss = read('workspace-design.css');
const section = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a) + a.length));

/* ---------- Tĩnh: markup board ---------- */
test('tĩnh: vBoard gắn .pipeline-board + bọc thẻ trong .col-cards, handler kéo-thả giữ nguyên trên .col', () => {
  const seg = section(html, 'function vBoard()', 'let dragId');
  assert.ok(seg.includes('<div class="board pipeline-board">'), 'board Deal phải mang class pipeline-board');
  assert.ok(seg.includes('<div class="col-cards">${cards||'), 'danh sách thẻ Deal phải nằm trong .col-cards');
  assert.ok(seg.includes('ondrop="drop(event,'), 'handler drop của Deal phải giữ nguyên trên .col');
  assert.ok(seg.includes('ondragover="event.preventDefault(); this.classList.add(\'drag\')"'), 'handler dragover phải giữ nguyên');
  assert.ok(seg.includes('ondragstart="drag(event,'), 'thẻ Deal vẫn draggable như cũ');
  const colStart = seg.indexOf('<div class="col"');
  assert.ok(seg.indexOf('<h4>', colStart) < seg.indexOf('<div class="col-cards">', colStart), 'header cột (h4) phải nằm NGOÀI/TRƯỚC vùng cuộn .col-cards');
});

test('tĩnh: vLeadsPipeline gắn .pipeline-board + .col-cards chứa cả thẻ lẫn nút Hiển thị thêm ở cuối', () => {
  const seg = section(html, 'function vLeadsPipeline()', '/* ===== Sự kiện');
  assert.ok(seg.includes('<div class="board lead-board pipeline-board">'), 'board Lead phải mang cả lead-board lẫn pipeline-board');
  assert.ok(seg.includes('<div class="col-cards">${cards ||'), 'danh sách thẻ Lead phải nằm trong .col-cards');
  assert.ok(seg.includes('${more}</div></div>'), 'nút Hiển thị thêm phải nằm TRONG .col-cards (cuối danh sách thẻ của cột)');
  assert.ok(seg.includes('ondrop="dropLead(event,'), 'handler dropLead phải giữ nguyên trên .col');
});

test('tĩnh: board Việc theo người KHÔNG bị scoped — vẫn .board thường, không .col-cards/.pipeline-board', () => {
  const seg = section(html, 'function vTasksByMember()', '/* ===== P6');
  assert.ok(seg.includes('<div class="board">${cols}</div>') || seg.includes('<div class="board">'), 'board Việc phải giữ markup .board thường');
  assert.ok(!seg.includes('pipeline-board') && !seg.includes('col-cards'), 'board Việc không được dính khung cuộn pipeline');
});

/* ---------- Tĩnh: CSS scoped ---------- */
test('tĩnh CSS: .board.pipeline-board giới hạn chiều cao viewport (vh + dvh fallback) với reserve đo từ layout', () => {
  assert.ok(wcss.includes('.board.pipeline-board {--pipeline-reserve:370px;height:calc(100vh - var(--pipeline-reserve));height:calc(100dvh - var(--pipeline-reserve));min-height:260px;'), 'thiếu rule chiều cao board pipeline (vh trước, dvh sau làm fallback ngược: trình duyệt mới dùng dvh)');
  assert.ok(wcss.includes('@media(max-width:900px){.board.pipeline-board {--pipeline-reserve:450px;min-height:240px}}'), '≤900px phải tăng reserve (toolbar 2 hàng + mobile-nav cố định)');
  assert.ok(wcss.includes('.board.pipeline-board .col {display:flex;flex-direction:column;min-height:0}'), 'cột pipeline phải là flex-column và gỡ min-height:350px của .col thường');
  const cards = section(wcss, '.board.pipeline-board .col-cards', '}');
  assert.ok(cards.includes('overflow-y:auto'), '.col-cards phải tự cuộn dọc');
  assert.ok(cards.includes('flex:1 1 auto') && cards.includes('min-height:0'), '.col-cards phải co giãn trong cột và cho phép cuộn (min-height:0)');
  assert.ok(cards.includes('-webkit-overflow-scrolling:touch'), 'phải giữ cuộn chạm mượt trên mobile');
  /* Scope: mọi rule chứa pipeline-reserve/col-cards đều bám .board.pipeline-board;
     rule .board nền cũ phải còn nguyên (không đổi hành vi view khác). */
  assert.ok(wcss.includes('.board {gap:15px;padding-bottom:18px;scroll-snap-type:x proximity;scroll-padding:4px}'), 'rule .board nền phải giữ nguyên như trước');
  for (const line of wcss.split('\n').filter(l => l.includes('col-cards') || l.includes('pipeline-reserve'))) {
    assert.ok(line.includes('.board.pipeline-board') || line.includes('--pipeline-reserve'), 'rule cuộn pipeline bị rò ra ngoài scope .board.pipeline-board: ' + line.trim());
  }
});

test('tĩnh: Publishing không dùng khung board kanban — không áp dụng fix này', () => {
  assert.ok(!read('publishing.css').includes('.board'), 'publishing.css không có .board/.col kanban');
  assert.ok(!read('publishing.html').includes('pipeline-board'), 'publishing.html không có board pipeline');
  assert.ok(!html.includes('pipeline-board') || html.split('pipeline-board').length - 1 >= 2, 'index phải có pipeline-board ở cả Deal lẫn Lead');
});

/* ---------- Render thật (vm harness theo mẫu lead-pipeline-board) ---------- */
function fixtureState() {
  const sent = Array.from({ length: 60 }, (_, i) => ({
    id: 'ls' + String(i).padStart(2, '0'), name: 'Sent Lead ' + String(i).padStart(2, '0'),
    company: 'c1', person: '', phone: '', line: 'metaverse', source: 'Khac',
    status: 'sent_connect', note: '', when: '2026-10-10', mainContact: false,
  }));
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Cong Ty Mot Fixture', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hom qua' }],
    games: [],
    deals: [{ id: 'd1', line: 'game_studio', title: 'Deal Fixture Mot', company: 'c1', stage: 'target', owner: 'zac', due: '', idle: 0, custom: {}, leads: [] }],
    leads: [...sent],
    tasks: [{ id: 't1', title: 'Viec Fixture', assignee: 'zac', done: false, due: '', dueDate: '' }],
    activities: [], verticals: [],
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
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => true, crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}

test('render: board Deal có đủ .col-cards theo stage, board Lead 12 cột + Hiển thị thêm nằm trong .col-cards, board Việc không đổi', () => {
  const h = loadIndex();
  h.run('curLine = "game_studio"; curView = "board"; query = ""; render();');
  const dealView = h.getEl('view').innerHTML;
  assert.ok(dealView.includes('<div class="board pipeline-board">'), 'render Deal: thiếu pipeline-board');
  assert.equal((dealView.match(/class="col-cards"/g) || []).length, 7, 'Game Studio có 7 stage -> 7 vùng cuộn .col-cards');
  assert.ok(dealView.includes('Deal Fixture Mot'), 'render Deal: mất thẻ deal');

  h.run('curView = "leads"; curLine = "all"; query = ""; setLeadViewMode("pipeline");');
  const leadView = h.getEl('view').innerHTML;
  assert.ok(leadView.includes('<div class="board lead-board pipeline-board">'), 'render Lead: thiếu pipeline-board');
  assert.equal((leadView.match(/class="col-cards"/g) || []).length, 11, 'Lead có 11 trạng thái (đã bỏ qualified 2026-11-03) -> 11 vùng cuộn .col-cards');
  const sentSeg = leadView.slice(leadView.indexOf('data-lead-status="sent_connect"'), leadView.indexOf('data-lead-status="first_message"'));
  assert.ok(sentSeg.indexOf('class="col-cards"') > -1 && sentSeg.indexOf('class="col-cards"') < sentSeg.indexOf('showMoreLeadBoard'), 'cột Sent connect: nút Hiển thị thêm phải nằm SAU (trong) .col-cards');

  h.run('curView = "tasksByMember"; render();');
  const taskView = h.getEl('view').innerHTML;
  assert.ok(taskView.includes('<div class="board">'), 'render Việc theo người: vẫn là .board thường');
  assert.ok(!taskView.includes('pipeline-board') && !taskView.includes('col-cards'), 'render Việc theo người: không được dính khung pipeline');
});
