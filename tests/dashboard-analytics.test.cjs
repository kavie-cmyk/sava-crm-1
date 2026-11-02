/* Dashboard Phân tích (khu "Phân tích" trong Tổng quan BD):
   - Helper thuần window.SavaDash (shared.js): dashPct, dashCountNew,
     dashTrend (bucket ngày/tuần/tháng), dashLeadFunnel (luỹ kế + rớt phễu
     + status lạ), dashWinRate, dashDealStages, dashScopeFilter (khoá:
     lead.ownerId / deal.owner / task.assignee; công ty của BD = hợp tập
     công ty phân biệt từ lead ∪ deal của BD), dashConversions, dashCompare
     (tổng các hàng BD + Chưa gán = toàn hệ ở các chỉ số cộng được).
   - Tĩnh: render dashAnalyticsHTML gắn vào vDash, ghi chú trung thực của
     phễu, bộ màu DASH_COLORS định nghĩa một chỗ, CSS tiền tố dash-.
   - Hành vi qua harness index.html: vDash hiện đủ các khối; chuyển scope
     sang 1 BD thì bảng so sánh biến mất và ghi chú phạm vi BD xuất hiện. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const NOW = new Date('2026-11-02T12:00:00+07:00');
const isoDaysAgo = n => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d.toISOString(); };

/* ---------- 1) dashPct + dashCountNew ---------- */

test('dashPct: mẫu số 0 -> null; có mẫu số -> % số', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(D.dashPct(3, 0), null);
  assert.equal(D.dashPct(0, 0), null);
  assert.equal(D.dashPct(1, 4), 25);
  assert.equal(D.dashPct(0, 5), 0);
});

test('dashCountNew: đếm trong kỳ theo createdAt; thiếu/rỗng/hỏng createdAt -> missing, không tính', () => {
  const D = loadShared().window.SavaDash;
  const list = [
    { createdAt: isoDaysAgo(0) }, { createdAt: isoDaysAgo(6) }, { createdAt: isoDaysAgo(7) },
    { createdAt: isoDaysAgo(40) }, {}, { createdAt: '' }, { createdAt: 'không-phải-ngày' },
  ];
  const r7 = D.dashCountNew(list, 7, NOW);
  assert.equal(r7.count, 2, 'kỳ 7 ngày gồm hôm nay + 6 ngày trước');
  assert.equal(r7.missing, 3);
  assert.equal(D.dashCountNew(list, 30, NOW).count, 3);
  const rAll = D.dashCountNew(list, null, NOW);
  assert.equal(rAll.count, 4, 'kỳ Tất cả: mọi bản ghi có createdAt hợp lệ');
  assert.equal(rAll.missing, 3);
});

/* ---------- 2) dashTrend: quy tắc bucket ---------- */

test('dashTrend kỳ 7/30 ngày: bucket theo ngày, đúng số bucket, đếm đúng, missing tách riêng', () => {
  const D = loadShared().window.SavaDash;
  const sets = {
    company: [{ createdAt: isoDaysAgo(0) }, { createdAt: isoDaysAgo(6) }, {}],
    lead: [{ createdAt: isoDaysAgo(0) }, { createdAt: isoDaysAgo(0) }, { createdAt: isoDaysAgo(20) }],
    deal: [{ createdAt: isoDaysAgo(3) }],
  };
  const t7 = D.dashTrend(sets, 7, NOW);
  assert.equal(t7.granularity, 'day');
  assert.equal(t7.buckets.length, 7);
  assert.equal(t7.buckets[6].company, 1); assert.equal(t7.buckets[6].lead, 2);
  assert.equal(t7.buckets[0].company, 1);
  assert.equal(t7.buckets.reduce((a, b) => a + b.lead, 0), 2, 'lead 20 ngày trước nằm ngoài kỳ 7 -> không vào bucket');
  assert.equal(t7.missing, 1);
  const t30 = D.dashTrend(sets, 30, NOW);
  assert.equal(t30.buckets.length, 30);
  assert.equal(t30.buckets.reduce((a, b) => a + b.lead, 0), 3);
});

test('dashTrend kỳ 90: bucket theo tuần (thứ Hai); Tất cả: <=730 ngày theo tuần, >730 ngày theo tháng', () => {
  const D = loadShared().window.SavaDash;
  const t90 = D.dashTrend({ company: [{ createdAt: isoDaysAgo(89) }, { createdAt: isoDaysAgo(0) }], lead: [], deal: [] }, 90, NOW);
  assert.equal(t90.granularity, 'week');
  assert.ok(t90.buckets.length >= 13 && t90.buckets.length <= 14, '90 ngày ~ 13 tuần: ' + t90.buckets.length);
  assert.equal(t90.buckets.reduce((a, b) => a + b.company, 0), 2);
  const tAllWeek = D.dashTrend({ company: [{ createdAt: isoDaysAgo(100) }], lead: [], deal: [] }, null, NOW);
  assert.equal(tAllWeek.granularity, 'week');
  assert.equal(tAllWeek.buckets.reduce((a, b) => a + b.company, 0), 1);
  const old = new Date(NOW); old.setFullYear(old.getFullYear() - 3);
  const tAllMonth = D.dashTrend({ company: [{ createdAt: old.toISOString() }, { createdAt: isoDaysAgo(0) }], lead: [], deal: [] }, null, NOW);
  assert.equal(tAllMonth.granularity, 'month');
  assert.ok(tAllMonth.buckets.length >= 36);
  assert.equal(tAllMonth.buckets.reduce((a, b) => a + b.company, 0), 2);
  const tEmpty = D.dashTrend({ company: [{}], lead: [], deal: [] }, null, NOW);
  assert.equal(tEmpty.buckets.length, 0); assert.equal(tEmpty.missing, 1);
});

/* ---------- 3) Phễu lead luỹ kế ---------- */

const MAIN_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'qualified', 'converted'];
test('dashLeadFunnel: luỹ kế "đang ở hoặc đã qua bước", % bước tiếp + % từ đầu, rớt phễu, status lạ', () => {
  const D = loadShared().window.SavaDash;
  const leads = [
    { status: 'new' }, { status: 'new' }, { status: 'qualified' }, { status: 'converted' },
    { status: 'not_yet_have_demand' }, { status: 'trang-thai-la' },
  ];
  const f = D.dashLeadFunnel(leads, MAIN_KEYS, 'not_yet_have_demand');
  const byKey = Object.fromEntries(f.steps.map(s => [s.key, s]));
  assert.equal(byKey.new.count, 4);
  assert.equal(byKey.sent_connect.count, 2);
  assert.equal(byKey.qualified.count, 2);
  assert.equal(byKey.converted.count, 1);
  assert.equal(byKey.new.toNext, 50);
  assert.equal(byKey.converted.toNext, null, 'bước cuối không có bước tiếp');
  assert.equal(byKey.converted.fromStart, 25);
  assert.equal(f.dropped.count, 1);
  assert.ok(Math.abs(f.dropped.pct - 100 / 6) < 1e-9, 'rớt phễu % trên TỔNG lead (gồm cả status lạ)');
  assert.equal(f.unknown, 1); assert.equal(f.total, 6);
  const f0 = D.dashLeadFunnel([], MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(f0.steps[0].count, 0); assert.equal(f0.steps[0].toNext, null, 'mẫu số 0 -> null, không NaN');
  assert.equal(f0.dropped.pct, null);
});

/* ---------- 4) Win rate + deal theo mảng ---------- */

test('dashWinRate + dashDealStages: thứ tự stage theo pipeline, tỉ lệ thắng, amount deal mở nhóm theo tiền tệ (game không tính amount)', () => {
  const ctx = loadShared(), D = ctx.window.SavaDash, LINES = vm.runInContext('LINES', ctx);
  const deals = [
    { line: 'ai', stage: 'prospect', amount: 100, cur: 'USD' },
    { line: 'ai', stage: 'won', amount: 999, cur: 'USD' },
    { line: 'ai', stage: 'lost' },
    { line: 'ai', stage: 'quote', amount: 5000000, cur: 'VND' },
    { line: 'game_studio', stage: 'target', amount: 777, cur: 'USD' },
    { line: 'metaverse', stage: 'won' }, { line: 'metaverse', stage: 'won' },
  ];
  const wr = D.dashWinRate(deals.filter(d => d.line === 'ai'));
  assert.equal(wr.won, 1); assert.equal(wr.lost, 1); assert.equal(wr.rate, 50);
  const rows = D.dashDealStages(deals, LINES);
  assert.equal(rows.map(r => r.line).join(','), Object.keys(LINES).join(','), 'đủ 4 mảng theo thứ tự LINES');
  const ai = rows.find(r => r.line === 'ai');
  assert.equal(ai.stages.map(s => s.key).join(','), LINES.ai.stages.map(s => s[0]).join(','), 'stage theo đúng thứ tự pipeline, gồm won/lost cuối');
  assert.equal(ai.stages.find(s => s.key === 'prospect').count, 1);
  assert.equal(ai.openCount, 2);
  assert.equal(ai.openAmounts.USD, 100); assert.equal(ai.openAmounts.VND, 5000000); assert.equal(Object.keys(ai.openAmounts).length, 2, 'chỉ deal ĐANG MỞ, nhóm theo cur; deal won không tính');
  const gs = rows.find(r => r.line === 'game_studio');
  assert.equal(Object.keys(gs.openAmounts).length, 0, 'mảng game không có amount');
  assert.equal(gs.rate, null, 'chưa có deal đóng -> rate null');
  const mv = rows.find(r => r.line === 'metaverse');
  assert.equal(mv.rate, 100);
});

/* ---------- 5) Scope BD + conversions ---------- */

function fixtureState() {
  return {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }, { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'C1' }, { id: 'c2', name: 'C2' }, { id: 'c3', name: 'C3' }, { id: 'c4', name: 'C4' }],
    leads: [
      { id: 'l1', company: 'c1', line: 'ai', status: 'converted', ownerId: 'yen', createdAt: isoDaysAgo(1) },
      { id: 'l2', company: 'c2', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(50) },
      { id: 'l3', company: 'c2', line: 'metaverse', status: 'qualified', ownerId: 'hoang', createdAt: isoDaysAgo(2) },
      { id: 'l4', company: 'c3', line: 'ai', status: 'new', createdAt: isoDaysAgo(3) },
    ],
    deals: [
      { id: 'd1', company: 'c2', line: 'ai', stage: 'prospect', owner: 'yen', createdAt: isoDaysAgo(1) },
      { id: 'd2', company: 'c3', line: 'ai', stage: 'won', owner: 'hoang', createdAt: isoDaysAgo(9) },
      { id: 'd3', company: 'c4', line: 'ai', stage: 'lost', createdAt: isoDaysAgo(9) },
    ],
    tasks: [
      { id: 't1', assignee: 'yen', done: false, dueDate: '2026-10-01' },
      { id: 't2', assignee: 'yen', done: true, dueDate: '2026-10-01' },
      { id: 't3', done: false, dueDate: '2026-10-01' },
    ],
    activities: [], games: [],
  };
}

test('dashScopeOwners + dashScopeFilter: khoá ownerId/owner/assignee; công ty của BD = hợp phân biệt lead ∪ deal', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  assert.equal(D.dashScopeOwners(s).sort().join(','), 'hoang,yen');
  const all = D.dashScopeFilter(s, '');
  assert.equal(all.scoped, false); assert.equal(all.companies.length, 4); assert.equal(all.leads.length, 4);
  const yen = D.dashScopeFilter(s, 'yen');
  assert.equal(yen.leads.length, 2); assert.equal(yen.deals.length, 1); assert.equal(yen.tasks.length, 2);
  assert.equal(yen.companyIds.sort().join(','), 'c1,c2', 'lead c1+c2, deal c2 -> {c1,c2}');
  assert.equal(yen.companies.map(c => c.id).sort().join(','), 'c1,c2');
  const hoang = D.dashScopeFilter(s, 'hoang');
  assert.equal(hoang.companyIds.sort().join(','), 'c2,c3', 'lead c2 ∪ deal c3');
});

test('dashConversions: 3 tỉ lệ kèm tử/mẫu, trên toàn hệ và trên scope 1 BD', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  const all = D.dashConversions(D.dashScopeFilter(s, ''));
  assert.deepEqual([all.leadToDeal.x, all.leadToDeal.y], [1, 4]); assert.equal(all.leadToDeal.pct, 25);
  assert.deepEqual([all.dealWin.x, all.dealWin.y], [1, 2]); assert.equal(all.dealWin.pct, 50);
  assert.deepEqual([all.companyWithDeal.x, all.companyWithDeal.y], [3, 4], 'c2,c3,c4 có deal; c1 chưa');
  const yen = D.dashConversions(D.dashScopeFilter(s, 'yen'));
  assert.deepEqual([yen.leadToDeal.x, yen.leadToDeal.y], [1, 2]);
  assert.equal(yen.dealWin.pct, null, 'BD chưa có deal đóng -> null');
  assert.deepEqual([yen.companyWithDeal.x, yen.companyWithDeal.y], [1, 2], 'trong tập công ty của Yến {c1,c2} chỉ c2 có deal của Yến');
});

/* ---------- 6) Bảng so sánh BD ---------- */

test('dashCompare: hàng theo BD + Chưa gán; tổng các chỉ số cộng được = toàn hệ; quá hạn đúng logic', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  const rows = D.dashCompare(s, 30, NOW);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.ok(byId.yen && byId.hoang && byId.__none__, 'đủ hàng BD + Chưa gán');
  assert.equal(byId.yen.leadTotal, 2); assert.equal(byId.yen.leadNew, 1, 'l2 tạo 50 ngày trước -> ngoài kỳ 30');
  assert.equal(byId.yen.converted, 1); assert.equal(byId.yen.leadRate, 50);
  assert.equal(byId.yen.open, 1); assert.equal(byId.yen.overdue, 1, 't1 quá hạn; t2 đã xong không tính');
  assert.equal(byId.hoang.won, 1); assert.equal(byId.hoang.winRate, 100);
  assert.equal(byId.__none__.leadTotal, 1); assert.equal(byId.__none__.lost, 1); assert.equal(byId.__none__.overdue, 1, 'việc chưa gán quá hạn vào hàng Chưa gán');
  for (const k of ['leadTotal', 'leadNew', 'converted', 'open', 'won', 'lost', 'overdue']) {
    const sum = rows.reduce((a, r) => a + r[k], 0);
    const total = { leadTotal: s.leads.length, leadNew: 3, converted: 1, open: 1, won: 1, lost: 1, overdue: 2 }[k];
    assert.equal(sum, total, `tổng các hàng ở chỉ số ${k} phải bằng toàn hệ`);
  }
});

/* ---------- 7) Tĩnh index/CSS/shared ---------- */

test('tĩnh: vDash gắn dashAnalyticsHTML; đủ nhãn trung thực + điều khiển; màu định nghĩa 1 chỗ; CSS dash- riêng', () => {
  const html = read('index.html'), shared = read('shared.js'), css = read('workspace-design.css');
  assert.ok(html.includes('+ dashAnalyticsHTML()'), 'vDash phải cộng khu Phân tích vào cuối, không di chuyển khối cũ');
  assert.ok(html.includes('Ước tính theo trạng thái hiện tại — hệ thống không lưu lịch sử từng bước đi của lead'), 'phễu phải có ghi chú trung thực nguyên văn');
  assert.ok(html.includes('ảnh chụp hiện tại'), 'phải ghi nhãn phễu/tỉ lệ là ảnh chụp hiện tại');
  assert.ok(html.includes('Chưa có deal đóng'));
  assert.ok(html.includes('setDashPeriod') && html.includes('setDashScope') && html.includes('setDashFunnelLine') && html.includes('setDashFunnelOwner'));
  assert.ok(html.includes('công ty của BD'), 'phải có chú thích định nghĩa công ty của BD khi scope != Toàn hệ');
  assert.ok(shared.includes('const DASH_COLORS'), 'bộ màu dùng chung định nghĩa một chỗ trong shared.js');
  assert.ok(css.includes('.dash-wrap') && css.includes('.dash-funnel-row') && css.includes('.dash-table'), 'CSS dash- phải có trong workspace-design.css');
});

/* ---------- 8) Hành vi render qua harness ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = fixtureState();
  s.leads.forEach(l => { l.name = 'Lead ' + l.id; l.person = ''; l.note = ''; l.source = ''; l.when = '2026-11-02'; });
  s.deals.forEach(d => { d.title = 'Deal ' + d.id; d.due = ''; d.idle = 0; d.custom = {}; d.leads = []; });
  s.tasks.forEach(t => { t.title = 'Việc ' + t.id; t.due = ''; });
  s.companies.forEach(c => { c.type = 'Doanh nghiệp'; c.roles = { ai: 'Khách hàng' }; c.last = 'Hôm nay'; });
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

test('hành vi: Tổng quan hiện đủ 6 khối phân tích ở Toàn hệ; chuyển scope BD ẩn bảng so sánh + hiện định nghĩa công ty của BD', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; render()");
  const html = getEl('view').innerHTML;
  for (const needle of ['Phân tích', 'Xu hướng thêm mới', 'Phễu Lead', 'Tiến trình Deal theo mảng', 'Lead → Deal', 'So sánh theo BD', 'Rớt phễu', 'Yến', 'Hoàng Daden', 'Chưa gán']) {
    assert.ok(html.includes(needle), 'thiếu khối/nội dung: ' + needle);
  }
  assert.ok(!html.includes('/ 4 · 1 / 4'), 'thẻ tỉ lệ không được in trùng số tử/mẫu');
  run("setDashScope('yen')");
  const scoped = getEl('view').innerHTML;
  assert.ok(!scoped.includes('So sánh theo BD'), 'scope 1 BD thì không hiện bảng so sánh');
  assert.ok(scoped.includes('công ty của BD'), 'scope BD phải hiện chú thích định nghĩa công ty của BD');
  run("setDashScope('')");
});
