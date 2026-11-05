/* TRỤC "MẢNG" của bộ lọc chung khu Phân tích (Tổng quan) — 2026-11-05:
   - Thanh .dash-filterbar có trục THỨ BA: Mảng (dashLine = "" Tất cả
     mảng / game_studio / publishing / ai / metaverse), single-select
     như Kỳ + Người, giữ trong phiên, ba trục kết hợp AND.
   - Định nghĩa mảng TÁI DÙNG cơ chế sẵn có của app: deal theo d.line;
     lead theo l.line (đúng bộ lọc mảng RIÊNG của phễu trước đợt này —
     select riêng đó đã GỠ, hợp nhất lên thanh chung); công ty theo
     c.roles[line] (đúng tab mảng của view Công ty). Bản ghi không thuộc
     mảng nào (line rỗng/thiếu, công ty không có roles[line]) chỉ hiện
     khi Mảng = Tất cả mảng.
   - Việc (task) không mang line: suy mảng từ đối tượng ĐƯỢC GẮN qua
     SavaDash.dashTaskInLine (deal/lead/công ty/game/sự kiện); không gắn
     hoặc không suy được -> không tính khi đang lọc 1 mảng cụ thể.
   - NEO HỒI QUY: Mảng = Tất cả mảng -> mọi số y hệt trước đợt này
     (dashFilterByLine("") trả nguyên tập; dashCompare không truyền line
     === truyền line "" === truyền line "ai" trên tập chỉ có mảng ai… —
     ở đây neo chính: không-line và line-rỗng cho cùng một kết quả, và
     harness mặc định khớp số fixture tính tay theo định nghĩa cũ).
   - Phễu click-through mang mảng sang view Lead qua curLine (tab mảng
     sẵn có của view Lead — nhìn thấy/đổi được tại chỗ, áp cho cả Block
     + Pipeline qua filteredLeads). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

/* Fixture phân bố mảng rõ ràng:
   companies: cA roles{ai} · cB roles{metaverse} · cC roles{ai,publishing} · cD roles{} (không mảng)
   leads:  L1 ai/contacted/yen · L2 ai/converted/yen · L3 metaverse/new/yen
           L4 publishing/converted/hoang · L5 (không line)/new/chưa gán · L6 metaverse/not_yet/hoang
   deals:  D1 ai/won/yen · D2 metaverse/prospect/hoang · D3 publishing/lost/hoang · D4 (không line)/prospect/chưa gán
   games:  g1 own=partner (Publishing) · g2 own=ours (Game Studio)
   events: e1 line=ai · e2 line=metaverse
   tasks (đều quá hạn 2020-01-01, chưa xong):
           T1 yen gắn deal D1(ai) · T2 yen gắn lead L3(metaverse) · T3 hoang KHÔNG gắn
           T4 hoang gắn công ty cA(roles ai) · T5 chưa gán gắn game g1(publishing) · T6 yen gắn sự kiện e1(ai) */
function fixtureState() {
  return {
    members: [
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
      { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true },
    ],
    companies: [
      { id: 'cA', name: 'CA', roles: { ai: 'Khách hàng' }, createdAt: isoDaysAgo(2) },
      { id: 'cB', name: 'CB', roles: { metaverse: 'Khách hàng' }, createdAt: isoDaysAgo(3) },
      { id: 'cC', name: 'CC', roles: { ai: 'Khách hàng', publishing: 'Studio' }, createdAt: isoDaysAgo(40) },
      { id: 'cD', name: 'CD', roles: {}, createdAt: isoDaysAgo(1) },
    ],
    leads: [
      { id: 'L1', company: 'cA', line: 'ai', status: 'contacted', ownerId: 'yen', createdAt: isoDaysAgo(2) },
      { id: 'L2', company: 'cA', line: 'ai', status: 'converted', ownerId: 'yen', createdAt: isoDaysAgo(5) },
      { id: 'L3', company: 'cB', line: 'metaverse', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(1) },
      { id: 'L4', company: 'cC', line: 'publishing', status: 'converted', ownerId: 'hoang', createdAt: isoDaysAgo(3) },
      { id: 'L5', company: 'cC', line: '', status: 'new', createdAt: isoDaysAgo(1) },
      { id: 'L6', company: 'cB', line: 'metaverse', status: 'not_yet_have_demand', ownerId: 'hoang', createdAt: isoDaysAgo(2) },
    ],
    deals: [
      { id: 'D1', company: 'cA', line: 'ai', stage: 'won', owner: 'yen', createdAt: isoDaysAgo(4) },
      { id: 'D2', company: 'cB', line: 'metaverse', stage: 'prospect', owner: 'hoang', amount: 7000000, cur: 'VND', createdAt: isoDaysAgo(2) },
      { id: 'D3', company: 'cC', line: 'publishing', stage: 'lost', owner: 'hoang', createdAt: isoDaysAgo(3) },
      { id: 'D4', company: 'cD', line: '', stage: 'prospect', createdAt: isoDaysAgo(1) },
    ],
    games: [
      { id: 'g1', title: 'Game đối tác', own: 'partner', company: 'cC' },
      { id: 'g2', title: 'Game của Sava', own: 'ours', company: '' },
    ],
    events: [
      { id: 'e1', name: 'Sự kiện AI', line: 'ai' },
      { id: 'e2', name: 'Sự kiện Meta', line: 'metaverse' },
    ],
    tasks: [
      { id: 'T1', assignee: 'yen', done: false, dueDate: '2020-01-01', deal: 'D1' },
      { id: 'T2', assignee: 'yen', done: false, dueDate: '2020-01-01', lead: 'L3' },
      { id: 'T3', assignee: 'hoang', done: false, dueDate: '2020-01-01' },
      { id: 'T4', assignee: 'hoang', done: false, dueDate: '2020-01-01', company: 'cA' },
      { id: 'T5', done: false, dueDate: '2020-01-01', game: 'g1' },
      { id: 'T6', assignee: 'yen', done: false, dueDate: '2020-01-01', event: 'e1' },
    ],
    activities: [],
  };
}
const idsOf = arr => arr.map(x => x.id);

/* ---------- 1) dashTaskInLine: suy mảng của việc từ đối tượng được gắn ---------- */

test('dashTaskInLine: deal/lead theo line của đối tượng; công ty theo roles; game theo own; sự kiện theo line; không gắn/đích đã xoá -> false', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  assert.equal(D.dashTaskInLine({ deal: 'D1' }, s, 'ai'), true);
  assert.equal(D.dashTaskInLine({ deal: 'D1' }, s, 'metaverse'), false);
  assert.equal(D.dashTaskInLine({ lead: 'L3' }, s, 'metaverse'), true);
  assert.equal(D.dashTaskInLine({ company: 'cC' }, s, 'ai'), true, 'công ty có cả roles ai + publishing');
  assert.equal(D.dashTaskInLine({ company: 'cC' }, s, 'publishing'), true);
  assert.equal(D.dashTaskInLine({ company: 'cC' }, s, 'metaverse'), false);
  assert.equal(D.dashTaskInLine({ company: 'cD' }, s, 'ai'), false, 'công ty không roles mảng nào -> không thuộc mảng nào');
  assert.equal(D.dashTaskInLine({ game: 'g1' }, s, 'publishing'), true, 'game đối tác -> Publishing (đúng ánh xạ view Game)');
  assert.equal(D.dashTaskInLine({ game: 'g2' }, s, 'game_studio'), true, 'game của Sava -> Game Studio');
  assert.equal(D.dashTaskInLine({ game: 'g2' }, s, 'publishing'), false);
  assert.equal(D.dashTaskInLine({ event: 'e2' }, s, 'metaverse'), true);
  assert.equal(D.dashTaskInLine({}, s, 'ai'), false, 'việc không gắn đối tượng -> không mảng');
  assert.equal(D.dashTaskInLine({ deal: 'da-xoa' }, s, 'ai'), false, 'đối tượng đích đã xoá -> không suy được mảng');
  assert.equal(D.dashTaskInLine({ deal: 'D4' }, s, 'ai'), false, 'deal không line -> không thuộc mảng cụ thể nào');
  assert.equal(D.dashTaskInLine({ deal: 'D1' }, s, ''), false, 'line rỗng không dùng để suy (Tất cả mảng đi đường riêng)');
});

/* ---------- 2) dashFilterByLine ---------- */

test('dashFilterByLine: "" / null trả NGUYÊN tập (neo hồi quy); từng mảng lọc đúng theo định nghĩa tái dùng; bản ghi không mảng chỉ ở Tất cả', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  const scoped = D.dashScopeFilter(s, '');
  for (const empty of ['', null, undefined]) {
    const out = D.dashFilterByLine(scoped, empty, s);
    assert.deepEqual(idsOf(out.leads), idsOf(s.leads)); assert.deepEqual(idsOf(out.deals), idsOf(s.deals));
    assert.deepEqual(idsOf(out.companies), idsOf(s.companies)); assert.deepEqual(idsOf(out.tasks), idsOf(s.tasks));
  }
  const ai = D.dashFilterByLine(scoped, 'ai', s);
  assert.deepEqual(idsOf(ai.leads), ['L1', 'L2'], 'lead theo l.line');
  assert.deepEqual(idsOf(ai.deals), ['D1'], 'deal theo d.line');
  assert.deepEqual(idsOf(ai.companies), ['cA', 'cC'], 'công ty theo roles[line] — cC có cả ai');
  assert.deepEqual(idsOf(ai.tasks), ['T1', 'T4', 'T6'], 'việc: gắn deal ai + gắn công ty có roles ai + gắn sự kiện ai');
  const mv = D.dashFilterByLine(scoped, 'metaverse', s);
  assert.deepEqual(idsOf(mv.leads), ['L3', 'L6']); assert.deepEqual(idsOf(mv.deals), ['D2']);
  assert.deepEqual(idsOf(mv.companies), ['cB']); assert.deepEqual(idsOf(mv.tasks), ['T2']);
  const pub = D.dashFilterByLine(scoped, 'publishing', s);
  assert.deepEqual(idsOf(pub.leads), ['L4']); assert.deepEqual(idsOf(pub.deals), ['D3']);
  assert.deepEqual(idsOf(pub.companies), ['cC']); assert.deepEqual(idsOf(pub.tasks), ['T5'], 'việc gắn game đối tác -> Publishing');
  const gs = D.dashFilterByLine(scoped, 'game_studio', s);
  assert.deepEqual(idsOf(gs.leads), []); assert.deepEqual(idsOf(gs.deals), []); assert.deepEqual(idsOf(gs.companies), []); assert.deepEqual(idsOf(gs.tasks), []);
  for (const ln of ['ai', 'metaverse', 'publishing', 'game_studio']) {
    const out = D.dashFilterByLine(scoped, ln, s);
    assert.ok(!idsOf(out.leads).includes('L5') && !idsOf(out.deals).includes('D4') && !idsOf(out.companies).includes('cD'),
      'bản ghi không thuộc mảng nào (L5/D4/cD) bị loại ở MỌI mảng cụ thể: ' + ln);
  }
});

/* ---------- 3) dashCompare với trục Mảng ---------- */

test('dashCompare + line: luồng + trạng thái đều lọc theo mảng; tổng các hàng = tổng của mảng đó; không truyền line === line "" (neo hồi quy)', () => {
  const D = loadShared().window.SavaDash, s = fixtureState(), now = new Date();
  const base = D.dashCompare(s, null, now);
  assert.deepEqual(D.dashCompare(s, null, now, undefined, null, ''), base, 'line "" = không lọc, y hệt không truyền');
  assert.deepEqual(D.dashCompare(s, null, now, undefined, null, undefined), base);
  const ai = Object.fromEntries(D.dashCompare(s, null, now, undefined, null, 'ai').map(r => [r.id, r]));
  assert.equal(ai.yen.leadTotal, 2, 'Yến: L1 + L2 (L3 metaverse bị loại)');
  assert.equal(ai.yen.converted, 1); assert.equal(ai.yen.won, 1); assert.equal(ai.yen.lost, 0);
  assert.equal(ai.yen.overdue, 2, 'việc quá hạn của Yến thuộc mảng ai: T1 (deal) + T6 (sự kiện); T2 metaverse bị loại');
  assert.equal(ai.hoang.leadTotal, 0, 'Hoàng không có lead ai (L4 publishing, L6 metaverse)');
  assert.equal(ai.hoang.overdue, 1, 'T4 gắn công ty cA có roles ai; T3 không gắn đối tượng -> không tính');
  assert.equal(ai.__none__.leadTotal, 0, 'L5 chưa gán nhưng KHÔNG có line -> loại khi lọc ai');
  assert.equal(ai.__none__.open, 0, 'D4 chưa gán nhưng không line -> loại');
  assert.equal(ai.__none__.overdue, 0, 'T5 chưa gán gắn game đối tác -> publishing, không phải ai');
  const rowsAi = D.dashCompare(s, null, now, undefined, null, 'ai');
  for (const k of ['leadTotal', 'converted', 'open', 'won', 'lost', 'overdue']) {
    const sum = rowsAi.reduce((a, r) => a + r[k], 0);
    const total = { leadTotal: 2, converted: 1, open: 0, won: 1, lost: 0, overdue: 3 }[k];
    assert.equal(sum, total, `tổng các hàng BD ở chỉ số ${k} = đúng tổng của mảng ai`);
  }
  const pub = Object.fromEntries(D.dashCompare(s, null, now, undefined, null, 'publishing').map(r => [r.id, r]));
  assert.equal(pub.__none__.overdue, 1, 'T5 (chưa gán, gắn game đối tác) tính vào hàng Chưa gán ở mảng publishing');
  assert.equal(pub.hoang.lost, 1, 'D3 publishing lost của Hoàng');
  /* Kết hợp Kỳ × Mảng: kỳ 7 ngày + metaverse — mọi bản ghi fixture đều trong 7 ngày trừ createdAt công ty (không vào compare). */
  const mv7 = Object.fromEntries(D.dashCompare(s, 7, now, undefined, null, 'metaverse').map(r => [r.id, r]));
  assert.equal(mv7.yen.leadNew, 1, 'L3 tạo 1 ngày trước, trong kỳ 7');
  assert.equal(mv7.hoang.leadTotal, 1, 'trạng thái hiện tại: Hoàng phụ trách L6 (not_yet vẫn là lead của Hoàng)');
});

/* ---------- 4) Hành vi render qua harness ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = fixtureState();
  s.leads.forEach(l => { l.name = 'Lead ' + l.id; l.person = ''; l.note = ''; l.source = ''; l.when = '2026-11-02'; });
  s.deals.forEach(d => { d.title = 'Deal ' + d.id; d.due = ''; d.idle = 0; d.custom = {}; d.leads = []; });
  s.tasks.forEach(t => { t.title = 'Việc ' + t.id; t.due = ''; });
  s.companies.forEach(c => { c.type = 'Doanh nghiệp'; c.last = 'Hôm nay'; });
  s.events.forEach(e => { e.date = '2026-11-01'; e.status = 'planned'; e.attendees = []; e.companies = []; e.leads = []; e.deals = []; e.note = ''; e.location = ''; });
  s.games.forEach(g => { g.genre = ''; g.platform = ''; g.stage = ''; g.desc = ''; g.emoji = '🎮'; });
  ls.setItem('sava_crm_shared_v1', JSON.stringify(s));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: q => getEl('qs:' + q), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(x => x.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
const leadIds = run => JSON.parse(JSON.stringify(run('filteredLeads().map(l => l.id)')));

test('hành vi: thanh lọc chung có ĐÚNG 1 select trục Mảng (Tất cả mảng + 4 mảng); phễu KHÔNG còn select mảng riêng', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; render()");
  const html = getEl('view').innerHTML;
  assert.equal((html.match(/onchange="setDashLine\(this\.value\)"/g) || []).length, 1, 'đúng 1 select trục Mảng trên thanh lọc chung');
  assert.equal((html.match(/onchange="setDashScope\(this\.value\)"/g) || []).length, 1, 'trục Người vẫn là 1 select duy nhất');
  for (const opt of ['<option value="" selected>Tất cả mảng</option>', '<option value="game_studio"', '<option value="publishing"', '<option value="ai"', '<option value="metaverse"']) {
    assert.ok(html.includes(opt), 'thiếu lựa chọn mảng: ' + opt);
  }
  assert.ok(!html.includes('Lọc phễu theo mảng'), 'select mảng RIÊNG của phễu đã gỡ hẳn');
  assert.ok(!html.includes('setDashFunnelLine(this.value)'), 'không còn đường onchange riêng của phễu');
  assert.ok(html.includes('Mảng đang áp dụng: <b>Tất cả mảng</b>'), 'caption bảng so sánh BD ghi mảng đang áp dụng');
  assert.ok(html.includes('Tổng lead đưa vào — 5 lead · 100%'), 'neo hồi quy trên render: mặc định (30 ngày, Toàn hệ, Tất cả mảng) phễu N=5 như trước đợt này');
  assert.equal((html.match(/dash-line-card/g) || []).length, 4, 'Tất cả mảng: khối Deal theo mảng hiện đủ 4 thẻ');
});

test('hành vi: lọc 1 mảng áp đồng nhất KPI + phễu + thẻ deal + caption so sánh; kết hợp AND với Kỳ + Người', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('all'); setDashLine('ai')");
  let html = getEl('view').innerHTML;
  assert.ok(html.includes('Lead</div><div class="v">2</div>'), 'KPI Lead (tổng theo mảng): chỉ L1 + L2 thuộc ai');
  assert.ok(html.includes('Công ty</div><div class="v">2</div>'), 'KPI Công ty: cA + cC có roles ai');
  assert.ok(html.includes('Tổng lead đưa vào — 2 lead · 100%'), 'phễu theo mảng ai: N=2');
  assert.equal((html.match(/dash-line-card/g) || []).length, 1, 'khối Deal theo mảng chỉ hiện thẻ của mảng đang lọc');
  assert.ok(html.includes('<h3>AI</h3>'), 'thẻ deal còn lại là AI');
  assert.ok(html.includes('Mảng đang áp dụng: <b>AI</b>'), 'caption so sánh BD ghi mảng AI');
  assert.ok(html.includes('Đang lọc riêng mảng <b>AI</b>'), 'ghi chú dưới thanh lọc giải thích định nghĩa mảng đang áp');
  run("setDashLine('metaverse')");
  html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 1 lead · 100%'), 'phễu metaverse: chỉ L3 đường chính (L6 là lối ra)');
  assert.ok(html.includes('<h3>Metaverse</h3>'));
  /* AND với Người: Hoàng + ai -> không lead nào; Yến + ai + kỳ 7 -> L1 + L2. */
  run("setDashLine('ai'); setDashScope('hoang')");
  html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 0 lead · 100%') && html.includes('Chưa có lead nào trong phạm vi này.'), 'Hoàng × ai: giao nhau rỗng, hiện tử tế');
  run("setDashScope('yen'); setDashPeriod('7')");
  html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 2 lead · 100%'), 'Yến × ai × kỳ 7: L1 (2d) + L2 (5d)');
  run("setDashPeriod('all'); setDashScope(''); setDashLine('')");
  html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 5 lead · 100%'), 'về Tất cả mảng: số khôi phục nguyên vẹn (neo hồi quy)');
});

test('hành vi: phễu click-through mang CẢ mảng sang view Lead qua curLine (áp Block + Pipeline), gỡ được tại tab mảng; lựa chọn mảng giữ qua chuyển view', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('all'); setDashLine('metaverse')");
  run("dashOpenLeadStatus('new')");
  assert.equal(run('curView'), 'leads');
  assert.equal(run('curLine'), 'metaverse', 'mảng được chở sang bằng curLine — cơ chế lọc mảng sẵn có của view Lead');
  assert.deepEqual(leadIds(run), ['L3'], 'chỉ L3: new + metaverse (L5 new nhưng không line)');
  run("setLeadViewMode('pipeline')");
  assert.deepEqual(leadIds(run), ['L3'], 'Pipeline dùng cùng filteredLeads nên mảng áp như Block');
  /* Gỡ mảng ngay tại view Lead bằng tab mảng (cơ chế sẵn có): */
  run("setLine('all')");
  assert.deepEqual(leadIds(run), ['L3', 'L5'], 'về tab Tất cả: cả hai lead new (vẫn lọc trạng thái new + kỳ Tất cả)');
  /* Mảng = Tất cả ở Tổng quan: click phễu đặt curLine về all, không kẹt mảng cũ. */
  run("curView = 'dash'; setDashLine(''); dashOpenLeadStatus('converted')");
  assert.equal(run('curLine'), 'all');
  assert.deepEqual(leadIds(run), ['L2', 'L4'], 'converted mọi mảng: L2 (ai) + L4 (publishing)');
  /* Giữ trong phiên: */
  run("setView('dash'); setDashLine('ai')");
  assert.equal(run('dashLine'), 'ai', 'setDashLine đặt đúng trục mảng chung');
  run("setView('leads'); setView('dash')");
  assert.equal(run('dashLine'), 'ai', 'lựa chọn mảng không reset khi chuyển view');
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('<option value="ai" selected>AI</option>'), 'select trục Mảng vẫn chọn AI sau khi quay lại Tổng quan');
});
