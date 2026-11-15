/* ĐỢT GOM BỘ CHỌN MẢNG 15/11/2026 — test render qua đường setLine():
   lỗ hổng kiểm thử cũ là suite chỉ phủ đường đặt mảng RIÊNG của
   Dashboard nên lỗi "chọn mảng ở tab toàn cục thì số Dashboard đứng
   yên" sống sót. File này đi ĐÚNG đường người dùng thật: bấm tab mảng
   toàn cục setLine(k) khi đang ở Dashboard, rồi kiểm mọi khối chính
   phải đổi số đúng theo mảng đó:
   - executive: KPI, phễu, donut "Deal Pipeline theo mảng", "Cần xử lý",
     bảng "Hiệu suất team";
   - phân tích chi tiết: KPI, phễu, thẻ "Tiến trình Deal theo mảng",
     bảng "So sánh theo BD";
   - tab Báo cáo hoạt động: model hoạt động + khối "Chuyển đổi trong kỳ";
   - select con "Pipeline hiển thị": khoá khi tab đang chọn 1 mảng,
     tự do khi tab ở "Tất cả";
   - reset Dashboard đưa mảng chung của cả app về "Tất cả";
   - click-through phễu giữ đúng mảng đang chọn.
   Fixture (chung với dashboard-line-filter.test.cjs, cộng hoạt động):
   công ty đa vai trò cC {ai, publishing}; lead/deal/việc phân bố khác
   rõ theo mảng; hoạt động gắn deal ai / lead metaverse / không gắn. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const todayISO = () => new Date().toISOString();

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
    activities: [
      { id: 'aAI', deal: 'D1', who: 'yen', type: 'Email', text: 'Mail deal AI', when: todayISO() },
      { id: 'aMV', lead: 'L3', who: 'yen', type: 'Call', text: 'Gọi lead Metaverse', when: todayISO() },
      { id: 'aFree', who: 'hoang', type: 'Note', text: 'Ghi chú không gắn', when: todayISO() },
    ],
  };
}
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
  s.activities.forEach(a => { a.url = ''; });
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
  const ev = (leadId, by) => ({ entityType: 'lead', entityId: leadId, at: todayISO(), byMemberId: by, action: 'update', changes: [{ field: 'status', label: 'Trạng thái', from: 'Đã liên hệ', to: 'Đã chuyển đổi' }] });
  vm.runInContext(`window.SavaData = { listLeadConversionEvents: async () => ({ windowEvents: ${JSON.stringify([ev('L2', 'yen'), ev('L4', 'hoang')])} }) }`, ctx);
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
async function settle(h) { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); h.run('render()'); }
function donutValue(html, label) {
  const start = html.indexOf('<h3>Deal Pipeline theo mảng</h3>');
  if (start < 0) return null;
  const seg = html.slice(start, html.indexOf('ex-overview-bottom', start));
  const m = new RegExp('<span>' + label + '</span><b>(\\d+)</b>').exec(seg);
  return m ? Number(m[1]) : null;
}
const exKpi = (label, value, note) => `<span class="ex-kpi-label">${label}</span><strong>${value}</strong><span class="ex-kpi-note">${note}</span>`;

test('setLine ở Dashboard: executive KPI + phễu + donut + Cần xử lý + Hiệu suất team đổi số đúng theo mảng (không khối nào đứng yên)', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('all'); render()");
  await settle(h);
  let html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Công ty', 4, 'Tổng hiện tại: 4')), 'Tất cả: executive Công ty 4');
  assert.ok(html.includes(exKpi('Leads', 6, 'Tổng hiện tại: 6')), 'Tất cả: executive Leads 6');
  assert.ok(html.includes(exKpi('Deal đang mở', 2, 'Tổng hiện tại: 2')), 'Tất cả: Deal đang mở = D2 + D4');
  assert.ok(html.includes('Tổng lead đưa vào — 5 lead · 100%'), 'Tất cả: phễu N=5');
  assert.equal(donutValue(html, 'Metaverse'), 1, 'Tất cả: donut Metaverse = D2 đang mở');
  assert.ok(html.includes('<b>6</b> việc quá hạn'), 'Tất cả: Cần xử lý — 6 việc quá hạn');
  h.run("setLine('ai')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Công ty', 2, 'Tổng hiện tại: 2')), 'AI: Công ty = cA + cC (cC đa vai trò)');
  assert.ok(html.includes(exKpi('Leads', 2, 'Tổng hiện tại: 2')), 'AI: Leads = L1 + L2');
  assert.ok(html.includes(exKpi('Deal đang mở', 0, 'Tổng hiện tại: 0')), 'AI: D1 đã won nên 0 deal mở');
  assert.ok(html.includes('Tổng lead đưa vào — 2 lead · 100%'), 'AI: phễu N=2');
  assert.equal(donutValue(html, 'AI'), 0, 'AI: donut chỉ còn mục AI, giá trị 0');
  assert.equal(donutValue(html, 'Metaverse'), null, 'AI: donut không còn mục Metaverse');
  assert.ok(html.includes('<b>3</b> việc quá hạn'), 'AI: việc quá hạn thuộc mảng ai = T1 + T4 + T6');
  h.run("setLine('metaverse')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Công ty', 1, 'Tổng hiện tại: 1')), 'Metaverse: Công ty = cB');
  assert.ok(html.includes(exKpi('Leads', 2, 'Tổng hiện tại: 2')), 'Metaverse: Leads = L3 + L6');
  assert.ok(html.includes(exKpi('Deal đang mở', 1, 'Tổng hiện tại: 1')), 'Metaverse: Deal đang mở = D2');
  assert.ok(html.includes('Tổng lead đưa vào — 1 lead · 100%'), 'Metaverse: phễu đường chính chỉ L3 (L6 lối ra)');
  assert.equal(donutValue(html, 'Metaverse'), 1);
  assert.ok(html.includes('<b>1</b> việc quá hạn'), 'Metaverse: việc quá hạn = T2');
  h.run("setLine('game_studio')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Leads', 0, 'Tổng hiện tại: 0')), 'Game Studio (không dữ kiện ở fixture): Leads 0');
  assert.ok(html.includes('Tổng lead đưa vào — 0 lead · 100%'), 'Game Studio: phễu 0');
  h.run("setLine('all')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Leads', 6, 'Tổng hiện tại: 6')), 'về Tất cả: số khôi phục nguyên vẹn');
});

test('setLine ở Dashboard: phân tích chi tiết (KPI + thẻ Tiến trình Deal + caption So sánh theo BD) đổi theo mảng', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('all'); setLine('publishing'); render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Lead</div><div class="v">1</div>'), 'Publishing: KPI phân tích Lead = L4');
  assert.ok(html.includes('Công ty</div><div class="v">1</div>'), 'Publishing: KPI phân tích Công ty = cC (đa vai trò)');
  assert.equal((html.match(/dash-line-card/g) || []).length, 1, 'Publishing: Tiến trình Deal chỉ hiện 1 thẻ');
  assert.ok(html.includes('<h3>Publishing</h3>'), 'thẻ còn lại là Publishing');
  assert.ok(html.includes('Mảng đang áp dụng: <b>Publishing</b>'), 'caption So sánh theo BD ghi mảng Publishing');
  h.run("setLine('all')");
  const all = h.getEl('view').innerHTML;
  assert.equal((all.match(/dash-line-card/g) || []).length, 4, 'về Tất cả: đủ 4 thẻ Tiến trình Deal');
});

test('setLine ở Dashboard: tab Báo cáo hoạt động — tổng hoạt động + khối Chuyển đổi trong kỳ đổi theo mảng', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; dashboardMode = 'activity'; setDashPeriod('all'); render()");
  await settle(h);
  let html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Tổng hoạt động', 3, 'Ghi nhận trong kỳ đang chọn · bấm để bỏ lọc loại')), 'Tất cả: 3 hoạt động');
  let seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Đã chuyển đổi trong kỳ: <b>2</b> lead'), 'Tất cả: chuyển đổi = L2 + L4');
  h.run("setLine('ai')");
  await settle(h);
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Tổng hoạt động', 1, 'Ghi nhận trong kỳ đang chọn · bấm để bỏ lọc loại')), 'AI: chỉ hoạt động gắn deal ai');
  seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Đã chuyển đổi trong kỳ: <b>1</b> lead'), 'AI: chuyển đổi chỉ L2');
  assert.ok(seg.includes('· Mảng: AI'), 'dòng meta của khối chuyển đổi ghi mảng đang chọn ở tab toàn cục');
  h.run("setLine('metaverse')");
  await settle(h);
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes(exKpi('Tổng hoạt động', 1, 'Ghi nhận trong kỳ đang chọn · bấm để bỏ lọc loại')), 'Metaverse: chỉ hoạt động gắn lead metaverse');
  seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Đã chuyển đổi trong kỳ: <b>0</b> lead'), 'Metaverse: không lead nào chuyển đổi (L2/L4 thuộc mảng khác)');
});

test('select con "Pipeline hiển thị": khoá theo tab mảng khi đang chọn 1 mảng; tự do chọn khi tab ở Tất cả', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('all'); setLine('ai'); render()");
  await settle(h);
  let html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Pipeline: AI'), 'tab AI: cột stage hiện đúng AI');
  assert.ok(/ex-pipeline-select[^>]*disabled/.test(html), 'tab AI: select con bị khoá (disabled)');
  h.run("setDashboardPipeline('metaverse')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Pipeline: AI'), 'gọi setDashboardPipeline(metaverse) khi tab đang ở AI KHÔNG ghi đè được');
  assert.equal(h.run('dashboardPipeline'), 'ai', 'dashboardPipeline bị khoá về mảng của tab toàn cục');
  h.run("setLine('all')");
  html = h.getEl('view').innerHTML;
  assert.ok(!/ex-pipeline-select[^>]*disabled/.test(html), 'tab Tất cả: select con mở khoá');
  h.run("setDashboardPipeline('metaverse')");
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Pipeline: Metaverse'), 'tab Tất cả: chọn ở select con đổi cột stage như trước');
});

test('reset Dashboard: mảng chung của cả app về Tất cả + Kỳ/Người về mặc định; click-through phễu giữ mảng đang chọn', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('all'); setLine('metaverse'); render()");
  await settle(h);
  h.run("dashOpenLeadFunnelStep('')");
  assert.equal(h.run('curView'), 'leads');
  assert.equal(h.run('curLine'), 'metaverse', 'click-through dòng mốc phễu giữ mảng Metaverse đang chọn');
  assert.deepEqual(JSON.parse(JSON.stringify(h.run('filteredLeads().map(l => l.id)'))), ['L3'], 'tập đã đếm ở dòng mốc của mảng Metaverse = lead đường chính của mảng đó');
  h.run("setView('dash'); resetDashboardFilters()");
  assert.equal(h.run('curLine'), 'all', 'reset đặt mảng chung về Tất cả');
  assert.equal(h.run('dashPeriodDays'), 30, 'reset đặt Kỳ về 30 ngày');
  assert.equal(h.run('dashScope'), '', 'reset đặt Người về Toàn hệ');
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Mảng đang áp dụng: <b>Tất cả mảng</b>'), 'sau reset, Dashboard tính trên Tất cả mảng');
});
