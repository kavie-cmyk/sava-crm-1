/* KỲ "TUỲ CHỈNH" của bộ lọc chung khu Phân tích (Tổng quan) — 05/11/2026:
   - Trục Kỳ có thêm "Tuỳ chỉnh": hai ô Từ ngày / Đến ngày (dd-mm-yyyy,
     qua parseDMYtoISO dùng chung), mặc định khi mới mở = hôm nay − 29
     đến hôm nay (tương đương kỳ 30 ngày).
   - Ngữ nghĩa cohort: bản ghi ĐƯỢC TẠO trong [Từ 00:00, Đến 23:59:59]
     giờ địa phương (ICT) — gồm cả hai đầu ngày — qua tham số range của
     SavaDash.dashCohort / dashCountNew / dashTrend / dashCompare.
     Không truyền range -> preset 7/30/90/Tất cả Y HỆT trước (neo hồi quy
     ở dashboard-unified-filter.test.cjs vẫn phải xanh nguyên).
   - Chặn lỗi ở tầng nhập: ngày không có thật / Từ > Đến -> KHÔNG áp
     dụng, giữ khoảng đang áp dụng cũ. Khoảng tương lai / không dữ kiện
     -> mọi khối 0 / trống tử tế, không NaN/undefined.
   - Phễu click-through ở kỳ Tuỳ chỉnh chở khoảng tường minh sang view
     Lead qua leadCreatedRange: nhìn thấy (option "Tuỳ chỉnh: …" trong
     select Ngày tạo + chip ghi rõ khoảng) và gỡ được tại chỗ, áp cho
     cả Block + Pipeline (cùng filteredLeads). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
/* Ngày/giờ ĐỊA PHƯƠNG tường minh (không phụ thuộc múi giờ máy chạy test):
   local(y, m, d, h) -> ISO string của đúng ngày đó giờ đó theo giờ máy;
   dashParseDate + dashDayStart đọc lại đúng ngày lịch đó. */
const localISO = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();
const isoDay = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const dmyOf = dt => String(dt.getDate()).padStart(2, '0') + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + dt.getFullYear();
const isoOf = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');

/* ---------- 1) dashRangeWindow ---------- */

test('dashRangeWindow: hợp lệ -> cửa sổ + số ngày gồm cả hai đầu; vắng -> null; sai (from>to / ngày không có thật / sai định dạng) -> invalid', () => {
  const D = loadShared().window.SavaDash;
  const w = D.dashRangeWindow({ from: '2026-10-01', to: '2026-10-30' });
  assert.equal(w.days, 30);
  assert.equal(D.dashRangeWindow({ from: '2026-10-05', to: '2026-10-05' }).days, 1, 'Từ = Đến = 1 ngày');
  assert.equal(D.dashRangeWindow(null), null);
  assert.equal(D.dashRangeWindow(undefined), null);
  assert.equal(D.dashRangeWindow({ from: '2026-10-30', to: '2026-10-01' }).invalid, true, 'from > to');
  assert.equal(D.dashRangeWindow({ from: '2026-02-31', to: '2026-03-01' }).invalid, true, '31-02 không tồn tại');
  assert.equal(D.dashRangeWindow({ from: '01-10-2026', to: '2026-10-30' }).invalid, true, 'range lưu nội bộ phải là ISO, không phải dd-mm-yyyy');
  assert.equal(D.dashRangeWindow({ from: '2026-10-01' }).invalid, true, 'thiếu một đầu');
});

/* ---------- 2) dashCohort với range: biên hai đầu ---------- */

test('dashCohort range: gồm cả hai đầu ngày (00:30 ngày Từ + 23:30 ngày Đến đều lọt), loại ngày kề ngoài + bản ghi thiếu createdAt; 1 ngày duy nhất chạy đúng', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const list = [
    { id: 'before', createdAt: localISO(2026, 9, 30, 23, 59) },
    { id: 'fromStart', createdAt: localISO(2026, 10, 1, 0, 30) },
    { id: 'mid', createdAt: localISO(2026, 10, 15, 12) },
    { id: 'toEnd', createdAt: localISO(2026, 10, 30, 23, 30) },
    { id: 'after', createdAt: localISO(2026, 10, 31, 0, 15) },
    { id: 'nodate' },
  ];
  const range = { from: '2026-10-01', to: '2026-10-30' };
  assert.deepEqual(D.dashCohort(list, 30, now, range).map(x => x.id), ['fromStart', 'mid', 'toEnd']);
  assert.deepEqual(D.dashCohort(list, null, now, { from: '2026-10-15', to: '2026-10-15' }).map(x => x.id), ['mid'], 'Từ = Đến: chỉ bản ghi đúng ngày đó');
  assert.equal(D.dashCohort(list, 30, now, { from: '2026-10-30', to: '2026-10-01' }).length, 0, 'range sai -> tập rỗng, không âm thầm bỏ lọc');
});

test('dashCohort/dashCountNew KHÔNG truyền range (hoặc range = null) = preset y hệt trước', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const list = [{ id: 'a', createdAt: isoDaysAgo(0) }, { id: 'b', createdAt: isoDaysAgo(6) }, { id: 'c', createdAt: isoDaysAgo(7) }, { id: 'd' }];
  assert.deepEqual(D.dashCohort(list, 7, now, null).map(x => x.id), D.dashCohort(list, 7, now).map(x => x.id));
  assert.deepEqual(D.dashCohort(list, null, now, null).map(x => x.id), ['a', 'b', 'c', 'd'], 'Tất cả + range null vẫn trả nguyên tập');
  assert.deepEqual(D.dashCountNew(list, 7, now, null), D.dashCountNew(list, 7, now));
});

/* ---------- 3) dashCountNew với range ---------- */

test('dashCountNew range: đếm trong khoảng gồm hai đầu + missing riêng', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const list = [{ createdAt: localISO(2026, 10, 1, 0, 5) }, { createdAt: localISO(2026, 10, 30, 23, 55) }, { createdAt: localISO(2026, 11, 2) }, {}];
  const r = D.dashCountNew(list, 30, now, { from: '2026-10-01', to: '2026-10-30' });
  assert.equal(r.count, 2); assert.equal(r.missing, 1);
});

/* ---------- 4) dashTrend với range: cỡ bucket theo độ dài khoảng ---------- */

test('dashTrend range ngắn (<= 31 ngày) -> bucket theo NGÀY phủ đủ khoảng; khoảng 1 ngày -> đúng 1 bucket; không dữ kiện -> mọi bucket 0', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const sets = { company: [{ createdAt: localISO(2026, 10, 1, 9) }, { createdAt: localISO(2026, 10, 10, 9) }], lead: [{ createdAt: localISO(2026, 10, 10, 18) }], deal: [] };
  const t = D.dashTrend(sets, 30, now, { from: '2026-10-01', to: '2026-10-10' });
  assert.equal(t.granularity, 'day'); assert.equal(t.buckets.length, 10);
  assert.equal(t.buckets[0].company, 1); assert.equal(t.buckets[9].company, 1); assert.equal(t.buckets[9].lead, 1);
  assert.equal(t.buckets.reduce((a, b) => a + b.company, 0), 2, 'bản ghi ngoài khoảng không lọt bucket nào');
  const one = D.dashTrend(sets, 30, now, { from: '2026-10-10', to: '2026-10-10' });
  assert.equal(one.buckets.length, 1); assert.equal(one.buckets[0].company, 1); assert.equal(one.buckets[0].lead, 1);
  const empty = D.dashTrend({ company: [], lead: [], deal: [] }, 30, now, { from: '2026-10-01', to: '2026-10-05' });
  assert.equal(empty.buckets.length, 5); assert.ok(empty.buckets.every(b => b.company + b.lead + b.deal === 0), 'khoảng không dữ kiện vẫn có bucket 0 để render');
});

test('dashTrend range trung (32..730 ngày) -> bucket theo TUẦN; bản ghi SAU ngày Đến nhưng cùng tuần với ngày Đến KHÔNG bị tính', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  /* 01-09-2026 (thứ Ba) -> 29-10-2026 (thứ Năm): 59 ngày. 30-10 cùng
     tuần Mon 26-10 với 29-10 — nếu chỉ dựa biên bucket sẽ lọt sai. */
  const sets = { company: [{ createdAt: localISO(2026, 10, 29, 15) }, { createdAt: localISO(2026, 10, 30, 15) }], lead: [], deal: [] };
  const t = D.dashTrend(sets, 90, now, { from: '2026-09-01', to: '2026-10-29' });
  assert.equal(t.granularity, 'week');
  assert.equal(t.buckets.reduce((a, b) => a + b.company, 0), 1, 'chỉ bản ghi ngày 29-10 (đúng ngày Đến) được tính');
  assert.ok(t.buckets[t.buckets.length - 1].label.endsWith('29-10'), 'nhãn bucket tuần cuối bị kẹp ở ngày Đến, không kéo tới cuối tuần');
});

test('dashTrend range dài (> 730 ngày) -> bucket theo THÁNG', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const sets = { company: [{ createdAt: localISO(2024, 1, 20) }, { createdAt: localISO(2026, 11, 2) }], lead: [], deal: [] };
  const t = D.dashTrend(sets, null, now, { from: '2024-01-15', to: '2026-11-05' });
  assert.equal(t.granularity, 'month');
  assert.equal(t.buckets.length, 35, '01-2024 .. 11-2026');
  assert.equal(t.buckets[0].company, 1); assert.equal(t.buckets[34].company, 1);
});

/* ---------- 5) dashCompare với range ---------- */

test('dashCompare range: cột luồng tính trên cohort khoảng, cột trạng thái giữ hiện tại', () => {
  const D = loadShared().window.SavaDash, now = new Date();
  const s = {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }],
    leads: [
      { id: 'L1', status: 'converted', ownerId: 'yen', createdAt: localISO(2026, 10, 5) },
      { id: 'L2', status: 'converted', ownerId: 'yen', createdAt: localISO(2026, 8, 5) },
      { id: 'L3', status: 'new', ownerId: 'yen', createdAt: localISO(2026, 10, 20) },
    ],
    deals: [{ id: 'D1', stage: 'won', owner: 'yen', createdAt: localISO(2026, 10, 6) }, { id: 'D2', stage: 'won', owner: 'yen', createdAt: localISO(2026, 5, 6) }],
    tasks: [],
  };
  const rows = Object.fromEntries(D.dashCompare(s, 30, now, undefined, { from: '2026-10-01', to: '2026-10-31' }).map(r => [r.id, r]));
  assert.equal(rows.yen.leadTotal, 3, 'trạng thái: vẫn phụ trách cả 3 lead');
  assert.equal(rows.yen.leadNew, 2, 'luồng: chỉ L1 + L3 tạo trong tháng 10');
  assert.equal(rows.yen.converted, 1); assert.equal(rows.yen.leadRate, 50);
  assert.equal(rows.yen.won, 1, 'D2 won nhưng tạo tháng 5 -> ngoài khoảng');
});

/* ---------- 6) Hành vi render qua harness (sao mẫu dashboard-unified-filter) ---------- */

function fixtureState() {
  return {
    members: [
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
      { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true },
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
    ],
    tasks: [], activities: [], games: [],
  };
}
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
const daysAgoDate = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

test('hành vi: bật Tuỳ chỉnh -> mặc định hôm nay − 29 đến hôm nay, hiện 2 ô ngày, KPI ghi rõ khoảng', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('custom')");
  assert.equal(run('dashCustomActive'), true);
  assert.equal(run('dashCustomTo'), isoOf(new Date()), 'Đến = hôm nay');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(29)), 'Từ = hôm nay − 29 (tương đương kỳ 30 ngày)');
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('id="dashCustomFrom"') && html.includes('id="dashCustomTo"'), 'thanh lọc hiện hai ô Từ ngày / Đến ngày');
  assert.ok(html.includes(`value="${dmyOf(daysAgoDate(29))}"`) && html.includes(`value="${dmyOf(new Date())}"`), 'ô ngày hiển thị dd-mm-yyyy');
  assert.ok(html.includes(`+4 mới từ ${dmyOf(daysAgoDate(29))} đến ${dmyOf(new Date())}`), 'KPI Lead: +4 mới (L1,L2,L4,L5 trong 30 ngày) kèm khoảng ngày cụ thể');
  assert.ok(html.includes(`Kỳ đang áp dụng: <b>từ ${dmyOf(daysAgoDate(29))} đến ${dmyOf(new Date())}</b>`), 'caption bảng so sánh BD ghi khoảng ngày cụ thể');
});

test('hành vi: nhập khoảng 4 ngày gần nhất (kể cả dạng ddmmyyyy) -> mọi khối theo khoảng; Từ > Đến / ngày không có thật -> KHÔNG áp, giữ khoảng cũ', async () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('custom')");
  await settleFunnel({ run });
  getEl('dashCustomFrom').value = dmyOf(daysAgoDate(3));
  getEl('dashCustomTo').value = dmyOf(new Date());
  run('setDashCustomRange()');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(3)));
  let html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 3 lead · 100%'), 'phễu theo khoảng 4 ngày: L1 (2d) + L4 (3d) + L5 (1d)');
  assert.ok(html.includes(`<b>Tính theo lần chuyển stage trong kỳ</b> (từ ${dmyOf(daysAgoDate(3))} đến ${dmyOf(new Date())})`), 'ghi chú phễu ghi khoảng cụ thể');
  /* Gõ nhanh 8 số liền ddmmyyyy cũng áp được qua parseDMYtoISO dùng chung. */
  const compact = d => String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear();
  getEl('dashCustomFrom').value = compact(daysAgoDate(1));
  getEl('dashCustomTo').value = compact(new Date());
  run('setDashCustomRange()');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(1)), 'ddmmyyyy được chuẩn hoá và áp dụng');
  /* Từ > Đến: không áp, giữ khoảng 2 ngày đang chạy. */
  getEl('dashCustomFrom').value = dmyOf(daysAgoDate(0));
  getEl('dashCustomTo').value = dmyOf(daysAgoDate(5));
  run('setDashCustomRange()');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(1)), 'Từ > Đến bị chặn, khoảng cũ giữ nguyên');
  assert.equal(run('dashCustomTo'), isoOf(new Date()));
  /* Ngày không có thật 31-02: không áp. */
  getEl('dashCustomFrom').value = '31-02-2026';
  getEl('dashCustomTo').value = dmyOf(new Date());
  run('setDashCustomRange()');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(1)), '31-02-2026 bị validate chuẩn chặn');
  /* 29-02 năm không nhuận cũng bị chặn. */
  getEl('dashCustomFrom').value = '29022026';
  run('setDashCustomRange()');
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(1)), '29022026 (2026 không nhuận) bị chặn');
  html = getEl('view').innerHTML;
  assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'sau các lần nhập sai, render vẫn sạch');
});

test('hành vi: khoảng hoàn toàn trong tương lai -> mọi khối 0/trống tử tế, không NaN/undefined/lỗi render', async () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('custom')");
  await settleFunnel({ run });
  getEl('dashCustomFrom').value = dmyOf(daysAgoDate(-5));
  getEl('dashCustomTo').value = dmyOf(daysAgoDate(-10));
  run('setDashCustomRange()');
  await settleFunnel({ run });
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 0 lead · 100%'));
  assert.ok(html.includes('Chưa có lead nào trong phạm vi này.'));
  assert.ok(html.includes('+0 mới từ '), 'KPI mới = 0 kèm khoảng ngày');
  assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'không NaN/undefined khi cohort rỗng');
});

test('hành vi: phễu click-through ở kỳ Tuỳ chỉnh chở ĐÚNG khoảng sang view Lead — nhìn thấy + gỡ được; giữ lựa chọn qua chuyển view và qua preset khác', () => {
  const { run, getEl } = loadIndex();
  run("curView = 'dash'; setDashPeriod('custom')");
  getEl('dashCustomFrom').value = dmyOf(daysAgoDate(3));
  getEl('dashCustomTo').value = dmyOf(new Date());
  run('setDashCustomRange()');
  run("dashOpenLeadStatus('converted')");
  assert.equal(run('curView'), 'leads');
  assert.deepEqual(JSON.parse(JSON.stringify(run('leadCreatedRange'))), { from: isoOf(daysAgoDate(3)), to: isoOf(new Date()) }, 'khoảng tường minh được chở sang nguyên vẹn');
  assert.equal(run('leadCreatedPeriodDays'), null, 'cơ chế số ngày cũ được xoá để không đè nhau');
  assert.deepEqual(ids(run), ['L4'], 'chỉ L4: converted + tạo trong khoảng (L2 converted nhưng tạo 5 ngày trước)');
  const head = getEl('view').innerHTML;
  assert.ok(head.includes('<option value="custom" selected>'), 'select Ngày tạo hiện lựa chọn Tuỳ chỉnh đang áp');
  assert.ok(head.includes(`📅 Tạo từ ${dmyOf(daysAgoDate(3))} đến ${dmyOf(new Date())}`), 'chip ghi rõ khoảng đang lọc ở view Lead');
  /* Gỡ tại chỗ bằng chip ✕: còn lọc trạng thái converted -> cả L2 + L4. */
  run('clearLeadCreatedRange()');
  assert.deepEqual(ids(run), ['L2', 'L4']);
  /* Giữ trong phiên: về Tổng quan (vẫn Tuỳ chỉnh + khoảng cũ), sang preset
     7 rồi quay lại Tuỳ chỉnh -> khoảng đã nhập vẫn còn. */
  run("setView('dash')");
  assert.equal(run('dashCustomActive'), true);
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(3)));
  run("setDashPeriod('7')");
  assert.equal(run('dashCustomActive'), false);
  run("setDashPeriod('custom')");
  assert.equal(run('dashCustomFrom'), isoOf(daysAgoDate(3)), 'quay lại Tuỳ chỉnh giữ khoảng đã nhập trong phiên');
  assert.equal(run('dashCustomTo'), isoOf(new Date()));
});
