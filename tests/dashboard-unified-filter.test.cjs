/* BỘ LỌC CHUNG khu Phân tích (Tổng quan) — đợt gộp 2026-11-05:
   - MỘT thanh lọc duy nhất: Kỳ (7/30/90/Tất cả, mặc định 30) × Người
     (Toàn hệ / member đang active / Chưa gán "__none__"), thay cả bộ
     chọn kỳ rời lẫn bộ chọn phạm vi cũ; trục Người của phễu gộp vào đây.
   - Quy tắc cohort thống nhất: chỉ tính bản ghi ĐƯỢC TẠO trong kỳ
     (SavaDash.dashCohort, cùng cửa sổ dashCountNew), trạng thái hiện
     tại. "Tất cả" + Toàn hệ = MỎ NEO HỒI QUY: mọi số khớp fixture tính
     theo định nghĩa TRƯỚC đợt gộp (phễu/deal/donut/compare trên toàn
     tập, không lọc ngày tạo).
   - Kỳ 7 ngày + 1 BD: đối chiếu tay từng khối trên fixture có phân bố
     createdAt + owner rõ ràng.
   - Phễu click-through: dashOpenLeadStatus mang ĐÚNG tập (trạng thái +
     createdAt trong kỳ + người theo trục Người) sang view Lead qua
     leadStatusFilter + leadCreatedPeriodDays + leadOwnerFilter; bộ lọc
     kỳ tạo nhìn thấy (select #leadCreatedPeriodSel) và gỡ được ở đó.
   - Lựa chọn Kỳ/Người là UI-state trong phiên: chuyển view rồi quay về
     Tổng quan không reset. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
/* Ngày tương đối theo ĐỒNG HỒ THẬT (render trong harness dùng new Date()). */
const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

/* Fixture phân bố rõ createdAt + owner:
   members: yen, hoang (active), cu (active=false — KHÔNG được vào trục Người).
   companies: cA tạo 2d, cB tạo 40d, cC tạo 3d, cD tạo 100d.
   leads:  L1 yen/cA contacted 2d · L2 yen/cA converted 5d · L3 yen/cB new 40d
           L4 hoang/cC converted 3d · L5 (chưa gán)/cC new 1d · L6 hoang/cD not_yet 100d
   deals:  D1 yen/cA ai won 4d · D2 yen/cA ai prospect (mở, 200 USD) 6d
           D3 hoang/cC ai lost 3d · D4 (chưa gán)/cD metaverse prospect (mở, 7.000.000 VND) 80d
           D5 hoang/cC ai won 50d */
function fixtureState() {
  return {
    members: [
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
      { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'cu', name: 'Người Cũ', role: 'BD', active: false },
    ],
    companies: [
      { id: 'cA', name: 'CA', createdAt: isoDaysAgo(2) }, { id: 'cB', name: 'CB', createdAt: isoDaysAgo(40) },
      { id: 'cC', name: 'CC', createdAt: isoDaysAgo(3) }, { id: 'cD', name: 'CD', createdAt: isoDaysAgo(100) },
    ],
    leads: [
      { id: 'L1', company: 'cA', line: 'ai', status: 'contacted', ownerId: 'yen', createdAt: isoDaysAgo(2) },
      { id: 'L2', company: 'cA', line: 'ai', status: 'converted', ownerId: 'yen', createdAt: isoDaysAgo(5) },
      { id: 'L3', company: 'cB', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(40) },
      { id: 'L4', company: 'cC', line: 'ai', status: 'converted', ownerId: 'hoang', createdAt: isoDaysAgo(3) },
      { id: 'L5', company: 'cC', line: 'ai', status: 'new', createdAt: isoDaysAgo(1) },
      { id: 'L6', company: 'cD', line: 'ai', status: 'not_yet_have_demand', ownerId: 'hoang', createdAt: isoDaysAgo(100) },
    ],
    deals: [
      { id: 'D1', company: 'cA', line: 'ai', stage: 'won', owner: 'yen', createdAt: isoDaysAgo(4) },
      { id: 'D2', company: 'cA', line: 'ai', stage: 'prospect', owner: 'yen', amount: 200, cur: 'USD', createdAt: isoDaysAgo(6) },
      { id: 'D3', company: 'cC', line: 'ai', stage: 'lost', owner: 'hoang', createdAt: isoDaysAgo(3) },
      { id: 'D4', company: 'cD', line: 'metaverse', stage: 'prospect', amount: 7000000, cur: 'VND', createdAt: isoDaysAgo(80) },
      { id: 'D5', company: 'cC', line: 'ai', stage: 'won', owner: 'hoang', createdAt: isoDaysAgo(50) },
    ],
    tasks: [], activities: [], games: [],
  };
}
const MAIN_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'converted'];

/* ---------- 1) dashCohort thuần ---------- */

test('dashCohort: kỳ hữu hạn chỉ giữ bản ghi tạo trong kỳ (thiếu createdAt bị loại); Tất cả trả nguyên tập kể cả bản ghi thiếu ngày', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const list = [{ id: 'a', createdAt: isoDaysAgo(0) }, { id: 'b', createdAt: isoDaysAgo(6) }, { id: 'c', createdAt: isoDaysAgo(7) }, { id: 'd' }, { id: 'e', createdAt: 'hỏng' }];
  assert.deepEqual(D.dashCohort(list, 7, now).map(x => x.id), ['a', 'b'], 'kỳ 7 gồm hôm nay + 6 ngày trước, đúng cửa sổ dashCountNew');
  assert.deepEqual(D.dashCohort(list, null, now).map(x => x.id), ['a', 'b', 'c', 'd', 'e'], 'Tất cả = mỏ neo hồi quy: không loại bản ghi nào');
  assert.equal(D.dashCohort(null, 7, now).length, 0);
});

/* ---------- 2) Scope "Chưa gán" ---------- */

test('dashScopeFilter "__none__": lead/deal chưa gán + công ty = ∪ công ty của lead/deal chưa gán', () => {
  const D = loadShared().window.SavaDash, s = fixtureState();
  const none = D.dashScopeFilter(s, '__none__');
  assert.equal(none.leads.map(l => l.id).join(','), 'L5');
  assert.equal(none.deals.map(d => d.id).join(','), 'D4');
  assert.equal(none.companyIds.sort().join(','), 'cC,cD', 'L5 thuộc cC, D4 thuộc cD');
  assert.equal(none.scoped, true);
});

/* ---------- 3) NEO HỒI QUY: Tất cả + Toàn hệ khớp định nghĩa trước đợt gộp ---------- */

test('neo hồi quy Tất cả + Toàn hệ: phễu/deal/donut/compare tính trên TOÀN tập như trước đợt gộp', () => {
  const ctx = loadShared(), D = ctx.window.SavaDash, LINES = vm.runInContext('LINES', ctx), s = fixtureState(), now = new Date();
  const scoped = D.dashScopeFilter(s, '');
  const cC = D.dashCohort(scoped.companies, null, now), cL = D.dashCohort(scoped.leads, null, now), cD = D.dashCohort(scoped.deals, null, now);
  assert.equal(cL.length, 6); assert.equal(cD.length, 5); assert.equal(cC.length, 4);
  const funnel = D.dashLeadFunnel(cL, MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(funnel.total, 5, 'N = 5 lead đường chính (L6 lối ra không tính vào N)');
  assert.equal(funnel.dropped.count, 1);
  assert.equal(funnel.steps.find(x => x.key === 'converted').count, 2, 'converted tích luỹ = L2 + L4');
  const conv = D.dashConversions({ companies: cC, leads: cL, deals: cD });
  assert.deepEqual([conv.leadToDeal.x, conv.leadToDeal.y], [2, 6], 'Lead→Deal: tử = converted, mẫu = TỔNG lead của tập (6, gồm cả lead lối ra — đúng định nghĩa dashConversions cũ)');
  assert.ok(Math.abs(conv.leadToDeal.pct - 100 / 3) < 1e-9);
  assert.deepEqual([conv.dealWin.x, conv.dealWin.y], [2, 3], 'won D1+D5, lost D3');
  assert.deepEqual([conv.companyWithDeal.x, conv.companyWithDeal.y], [3, 4], 'cA,cC,cD có deal; cB chưa');
  const rows = D.dashDealStages(cD, LINES);
  const ai = rows.find(r => r.line === 'ai');
  assert.equal(ai.won, 2); assert.equal(ai.lost, 1); assert.ok(Math.abs(ai.rate - 200 / 3) < 1e-9);
  assert.equal(ai.openAmounts.USD, 200, 'amount deal đang mở như bản cũ');
  const mv = rows.find(r => r.line === 'metaverse');
  assert.equal(mv.openAmounts.VND, 7000000); assert.equal(mv.rate, null, 'chưa có deal đóng -> null như quy ước cũ');
  const cmp = Object.fromEntries(D.dashCompare(s, null, now).map(r => [r.id, r]));
  assert.equal(cmp.yen.leadTotal, 3); assert.equal(cmp.yen.converted, 1); assert.ok(Math.abs(cmp.yen.leadRate - 100 / 3) < 1e-9, 'kỳ Tất cả: leadRate trên toàn tập như bản cũ');
  assert.equal(cmp.hoang.won, 1); assert.equal(cmp.hoang.lost, 1); assert.equal(cmp.hoang.winRate, 50);
  assert.equal(cmp.__none__.leadTotal, 1); assert.equal(cmp.__none__.open, 1);
});

/* ---------- 4) Kỳ 7 ngày + 1 BD (đối chiếu tay từng khối) ---------- */

test('kỳ 7 ngày + BD Yến: cohort từng khối khớp tính tay', () => {
  const ctx = loadShared(), D = ctx.window.SavaDash, LINES = vm.runInContext('LINES', ctx), s = fixtureState(), now = new Date();
  const scoped = D.dashScopeFilter(s, 'yen');
  assert.deepEqual(scoped.leads.map(l => l.id), ['L1', 'L2', 'L3']);
  assert.deepEqual(scoped.companies.map(c => c.id).sort(), ['cA', 'cB']);
  const cC = D.dashCohort(scoped.companies, 7, now), cL = D.dashCohort(scoped.leads, 7, now), cD = D.dashCohort(scoped.deals, 7, now);
  assert.deepEqual(cL.map(l => l.id), ['L1', 'L2'], 'L3 tạo 40 ngày trước -> ngoài kỳ 7');
  assert.deepEqual(cD.map(d => d.id), ['D1', 'D2']);
  assert.deepEqual(cC.map(c => c.id), ['cA'], 'cB tạo 40 ngày trước -> ngoài cohort công ty của kỳ');
  const funnel = D.dashLeadFunnel(cL, MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(funnel.total, 2);
  assert.equal(funnel.steps.find(x => x.key === 'contacted').count, 2);
  assert.equal(funnel.steps.find(x => x.key === 'converted').count, 1);
  const conv = D.dashConversions({ companies: cC, leads: cL, deals: cD });
  assert.deepEqual([conv.leadToDeal.x, conv.leadToDeal.y, conv.leadToDeal.pct], [1, 2, 50], 'Lead→Deal từ lead của kỳ');
  assert.deepEqual([conv.dealWin.x, conv.dealWin.y, conv.dealWin.pct], [1, 1, 100], 'thắng deal từ deal của kỳ: D1 won, chưa deal lost nào trong kỳ');
  assert.deepEqual([conv.companyWithDeal.x, conv.companyWithDeal.y, conv.companyWithDeal.pct], [1, 1, 100], 'công ty tạo trong kỳ của Yến: chỉ cA, và cA có deal trong kỳ');
  const ai = D.dashDealStages(cD, LINES).find(r => r.line === 'ai');
  assert.equal(ai.won, 1); assert.equal(ai.lost, 0); assert.equal(ai.rate, 100);
  assert.equal(ai.openAmounts.USD, 200, 'amount deal đang mở tính trên cohort kỳ (D2 tạo 6 ngày trước, trong kỳ)');
  assert.equal(D.dashCountNew(scoped.leads, 7, now).count, 2, 'KPI "mới trong kỳ" cùng cửa sổ cohort');
});

/* ---------- 5) Bảng so sánh BD ở kỳ 7: luồng theo kỳ, trạng thái giữ nguyên + caption ---------- */

test('dashCompare kỳ 7 (Toàn hệ): cột luồng theo cohort, cột trạng thái là hiện tại', () => {
  const D = loadShared().window.SavaDash, s = fixtureState(), now = new Date();
  const cmp = Object.fromEntries(D.dashCompare(s, 7, now).map(r => [r.id, r]));
  assert.equal(cmp.yen.leadTotal, 3, 'trạng thái: Yến vẫn phụ trách 3 lead (kể cả L3 ngoài kỳ)');
  assert.equal(cmp.yen.leadNew, 2);
  assert.equal(cmp.yen.converted, 1); assert.equal(cmp.yen.leadRate, 50, 'converted/cohort lead kỳ (L2 / {L1,L2})');
  assert.equal(cmp.hoang.won, 0); assert.equal(cmp.hoang.lost, 1); assert.equal(cmp.hoang.winRate, 0, 'D5 won tạo 50 ngày trước -> ngoài kỳ; chỉ D3 lost trong kỳ');
  assert.equal(cmp.hoang.open, 0);
  assert.equal(cmp.__none__.won + cmp.__none__.lost, 0, 'D4 tạo 80 ngày trước -> ngoài kỳ, chưa đóng');
  assert.equal(cmp.__none__.open, 1, 'trạng thái: D4 đang mở vẫn đếm ở cột Deal đang mở');
});

/* ---------- 6) Hành vi render qua harness ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = fixtureState();
  s.leads.forEach(l => { l.name = 'Lead ' + l.id; l.person = ''; l.note = ''; l.source = ''; l.when = '2026-11-02'; });
  s.deals.forEach(d => { d.title = 'Deal ' + d.id; d.due = ''; d.idle = 0; d.custom = {}; d.leads = []; });
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
  /* Phễu theo sự kiện (12/11/2026): stub tầng nạp nhật ký — 0 sự kiện,
     số phễu đến từ quy tắc sàn như harness dashboard-analytics. */
  vm.runInContext("window.SavaData = { listLeadFunnelEvents: async () => ({ windowEvents: [], earliestEvents: [] }) }", ctx);
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
/* Chờ vòng nạp nhật ký phễu (bất đồng bộ) xong rồi render lại. */
async function settleFunnel(h) { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); h.run("render()"); }
const ids = run => JSON.parse(JSON.stringify(run('filteredLeads().map(l => l.id)')));

test('hành vi: thanh lọc chung là chỗ chọn DUY NHẤT cho Kỳ + Người; trục Người chỉ gồm member active + Chưa gán', async () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; render()");
  await settleFunnel({ run });
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('dash-filterbar'), 'có thanh lọc chung ở đầu khu Phân tích');
  assert.equal((html.match(/onchange="setDashScope\(this\.value\)"/g) || []).length, 1, 'đúng 1 select trục Người trong khu Phân tích');
  assert.equal((html.match(/onclick="setDashPeriod\(/g) || []).length, 5, 'đúng 1 cụm nút trục Kỳ (7/30/90/Tất cả/Tuỳ chỉnh — Tuỳ chỉnh thêm 05/11/2026)');
  assert.ok(!html.includes('Người Cũ'), 'member đã ngừng hoạt động KHÔNG xuất hiện ở trục Người');
  assert.ok(html.includes('<option value="__none__"') && html.includes('>Chưa gán</option>'), 'trục Người có lựa chọn Chưa gán');
  assert.ok(html.includes('Kỳ đang áp dụng: <b>30 ngày</b>'), 'caption bảng so sánh BD ghi rõ kỳ đang áp dụng (mặc định 30)');
  assert.ok(html.includes('Tính theo lần chuyển stage trong kỳ</b> (30 ngày)'), 'phễu ghi chú cách tính theo sự kiện trong kỳ (12/11/2026)');
});

test('hành vi: kỳ 7 + BD Yến trên render — phễu N=2, KPI mới trong kỳ, bảng so sánh ẩn; Tất cả + Toàn hệ khôi phục số toàn tập', async () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('7'); setDashScope('yen')");
  await settleFunnel({ run });
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 2 lead · 100%'), 'phễu theo sự kiện kỳ 7 của Yến: N=2 (lead tạo trong kỳ, quy tắc sàn)');
  assert.ok(html.includes('+2 mới trong 7 ngày gần nhất'), 'KPI lead: +2 mới trong kỳ (L1, L2)');
  assert.ok(!html.includes('So sánh theo BD'), 'Người ≠ Toàn hệ -> ẩn bảng so sánh');
  run("setDashPeriod('all'); setDashScope('')");
  await settleFunnel({ run });
  const all = getEl('view').innerHTML;
  assert.ok(all.includes('Tổng lead đưa vào — 5 lead · 100%'), 'neo hồi quy trên render: Tất cả + Toàn hệ -> phễu N=5 như trước đợt gộp');
  assert.ok(all.includes('Kỳ đang áp dụng: <b>Tất cả</b>'));
});

test('hành vi: phễu click-through mang đúng trạng thái + kỳ tạo + người sang view Lead; bộ lọc kỳ tạo gỡ được tại view Lead', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('7'); setDashScope('yen')");
  run("dashOpenLeadStatus('converted')");
  assert.equal(run('curView'), 'leads');
  assert.equal(run('leadStatusFilter'), 'converted');
  assert.equal(run('leadOwnerFilter'), 'yen');
  assert.equal(run('leadCreatedPeriodDays'), 7);
  assert.deepEqual(ids(run), ['L2'], 'chỉ L2: converted + của Yến + tạo trong 7 ngày (L4 converted nhưng của Hoàng)');
  const head = getEl('view').innerHTML;
  assert.ok(head.includes('id="leadCreatedPeriodSel"'), 'view Lead hiện select kỳ tạo');
  assert.ok(head.includes('<option value="7" selected>Tạo trong 7 ngày</option>'), 'select kỳ tạo đang chọn đúng 7 ngày mang sang');
  /* Gỡ kỳ tạo tại view Lead: vẫn chỉ còn lọc trạng thái + người. */
  run("setLeadCreatedPeriodFilter('')");
  assert.deepEqual(ids(run), ['L2']);
  /* Trục Người = Chưa gán + kỳ 30: dòng new chỉ còn L5. */
  run("curView = 'dash'; setDashPeriod('30'); setDashScope('__none__'); dashOpenLeadStatus('new')");
  assert.equal(run('leadOwnerFilter'), '__none__');
  assert.deepEqual(ids(run), ['L5']);
  /* Kỳ 7 + Toàn hệ, dòng new: L5 (1d) lọt, L3 (40d) bị kỳ loại. */
  run("curView = 'dash'; setDashPeriod('7'); setDashScope(''); dashOpenLeadStatus('new')");
  assert.deepEqual(ids(run), ['L5'], 'L3 new nhưng tạo 40 ngày trước -> ngoài kỳ 7');
  run("setLeadCreatedPeriodFilter('')");
  assert.deepEqual(ids(run), ['L3', 'L5'], 'gỡ kỳ tạo -> cả hai lead new');
});

test('hành vi: lựa chọn Kỳ + Người KHÔNG reset khi chuyển view qua lại', async () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('7'); setDashScope('hoang'); render()");
  await settleFunnel({ run });
  run("setView('leads')");
  run("setView('dash')");
  assert.equal(run('dashPeriodDays'), 7);
  assert.equal(run('dashScope'), 'hoang');
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('<button class="dash-chip on" onclick="setDashPeriod(\'7\')">7 ngày</button>'), 'chip kỳ 7 ngày vẫn đang chọn sau khi quay lại');
  assert.ok(html.includes('Tổng lead đưa vào — 1 lead · 100%'), 'phễu vẫn theo kỳ 7 của Hoàng (chỉ L4) sau khi quay lại Tổng quan');
});
