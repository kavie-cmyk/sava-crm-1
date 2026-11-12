/* Đợt sửa Dashboard 12/11/2026 — Zac chốt "Sửa tất cả, kể cả số chính
   KPI thành số trong kỳ". Phủ 5 hạng mục:
   1) Donut + cột stage "Deal Pipeline theo mảng" (executive) theo
      cohort — cùng số với "Tiến trình Deal theo mảng" (Phân tích) trên
      cùng dữ kiện + bộ lọc (ca lệch cũ: kỳ 7, AI có 3 deal mở toàn tập
      nhưng chỉ 1 deal mở tạo trong kỳ: bản cũ donut ghi 3 trong khi
      Tiến trình ghi 1; bản mới cả hai ghi 1).
   2) Dòng lối ra phễu đếm theo SỰ KIỆN vào droppedKey trong kỳ:
      ca biên (a) vào lối ra trong kỳ rồi quay lại đường chính vẫn đếm
      ở lối ra + vẫn tính ở đường chính; ca biên (b) đang ở lối ra
      nhưng sự kiện vào lối ra ngoài kỳ thì KHÔNG đếm; khoảng Tuỳ
      chỉnh có chặn trên; nhiều lần vào lối ra trong kỳ chỉ đếm 1.
   3) Hoán đổi số chính/phụ MỌI thẻ KPI (executive + Phân tích): chính
      = trong kỳ (cohort), phụ = "Tổng hiện tại: N"; neo hồi quy kỳ
      "Tất cả": chính == tổng hiện tại tương ứng cho từng loại thẻ
      (Công ty / Lead / Deal đang mở / Deal đã won / Giá trị pipeline).
   4) Đổi nhãn: "Deal thắng toàn tập" -> "Tỉ lệ thắng Deal trong kỳ";
      thẻ legacy "Lead mới" -> "Lead đang ở Mới" (chỉ đổi chữ).
   5) Đoạn "Phạm vi số liệu" viết lại (a)-(e), bỏ hẳn "Ngoại lệ duy
      nhất"; đúng 1 dòng chú thích trong khu legacy; footnote phễu
      executive có ý lead nhập lô không có sự kiện cho từng lead.

   Bảng số harness (fixture cố định ở dưới, đối chiếu tay):
   deals: AI mở toàn tập 3 (tạo 40d/20d/2d) + AI won 2 (3d/50d);
          Metaverse mở 2 (1d/80d). Công ty tạo 2d/20d/60d; Lead 2d/15d/45d.
   ┌────────┬──────────────┬──────────────┬──────────────┐
   │ Kỳ     │ Donut AI mở  │ KPI Cty/Lead │ Deal mở/Won  │ Giá trị pipeline (mở, cohort)
   │        │ (= Tiến trình AI) │ chính (phụ) │ chính (phụ) │
   ├────────┼──────────────┼──────────────┼──────────────┤
   │ 7 ngày │ 1 (cũ: 3)    │ 1 (3) / 1 (3)│ 2 (5) / 1 (2)│ $300 + 7tr ₫ (tổng: $600 + 12tr ₫)
   │ 30 ngày│ 2 (cũ: 3)    │ 2 (3) / 2 (3)│ 3 (5) / 1 (2)│ $500 + 7tr ₫ (tổng: $600 + 12tr ₫)
   │ Tất cả │ 3 (= cũ)     │ 3 (3) / 3 (3)│ 5 (5) / 2 (2)│ $600 + 12tr ₫ (= tổng hiện tại)
   └────────┴──────────────┴──────────────┴──────────────┘ */
process.env.TZ = 'Asia/Ho_Chi_Minh';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const MAIN_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'converted'];
const NOW = new Date('2026-11-12T12:00:00+07:00'); /* kỳ 7 ngày bắt đầu 06/11/2026 */
const ev = (leadId, at, from, to) => ({ entityType: 'lead', entityId: leadId, at, action: 'update', changes: [{ field: 'status', label: 'Trạng thái', from, to }] });
const funnel = (D, leads, events, days, range) => D.dashLeadFunnelByEvents(leads, events, events, days === undefined ? 7 : days, NOW, range || null, MAIN_KEYS, 'not_yet_have_demand');

/* ---------- 2) Phễu: dòng lối ra theo sự kiện ---------- */

test('lối ra (a): vào lối ra trong kỳ rồi quay lại đường chính — vẫn đếm ở lối ra VÀ vẫn tính ở đường chính', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'A', status: 'first_message', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [
    ev('A', '2026-11-08T09:00:00+07:00', 'Mới', 'Not yet have demand'),
    ev('A', '2026-11-09T09:00:00+07:00', 'Not yet have demand', '1st message'),
    ev('A', '2026-11-10T09:00:00+07:00', 'Not yet have demand', 'Not yet have demand'), /* vào lại lần 2: vẫn chỉ đếm 1 lead phân biệt */
  ];
  const f = funnel(D, leads, events);
  assert.equal(f.dropped.count, 1, 'lead phân biệt có sự kiện vào lối ra trong kỳ -> đếm 1 (dù vào 2 lần)');
  assert.deepEqual(J(f.droppedLeadIds), ['A'], 'click-through dòng lối ra = đúng tập sự kiện này');
  assert.equal(f.total, 1, 'lead vẫn vào N của đường chính');
  assert.equal(f.levels.A, 2, 'mức đường chính = 1st message');
  assert.equal(f.steps.find(s => s.key === 'first_message').count, 1);
});

test('lối ra (b): đang ở lối ra nhưng sự kiện vào lối ra NGOÀI kỳ — không đếm ở dòng lối ra; vẫn bị trừ khỏi N', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'B', status: 'not_yet_have_demand', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [ev('B', '2026-11-01T09:00:00+07:00', 'Mới', 'Not yet have demand')]; /* 01/11: trước kỳ 7 (06/11) */
  const f = funnel(D, leads, events);
  assert.equal(f.dropped.count, 0);
  assert.deepEqual(J(f.droppedLeadIds), []);
  assert.equal(f.total, 0, 'trạng thái hiện tại ở lối ra vẫn bị trừ khỏi N (giữ quy tắc đường chính cũ)');
  assert.equal(f.unknown, 0);
  /* Cùng lead, cùng sự kiện, kỳ "Tất cả": sự kiện nằm trong cửa sổ -> đếm. */
  const fAll = funnel(D, leads, events, null);
  assert.equal(fAll.dropped.count, 1);
  assert.deepEqual(J(fAll.droppedLeadIds), ['B']);
});

test('lối ra: khoảng Tuỳ chỉnh có chặn trên — sự kiện vào lối ra sau ngày "to" không đếm, trong khoảng thì đếm', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'C', status: 'not_yet_have_demand', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [ev('C', '2026-11-07T09:00:00+07:00', 'Mới', 'Not yet have demand')];
  assert.equal(funnel(D, leads, events, null, { from: '2026-11-06', to: '2026-11-08' }).dropped.count, 1, '07/11 nằm trong [06/11, 08/11]');
  assert.equal(funnel(D, leads, events, null, { from: '2026-11-09', to: '2026-11-10' }).dropped.count, 0, '07/11 nằm ngoài [09/11, 10/11]');
  assert.equal(funnel(D, leads, events, null, { from: '2026-11-01', to: '2026-11-06' }).dropped.count, 0, '07/11 sau ngày "to" 06/11 -> bị chặn trên loại');
});

/* ---------- Harness render thật (index.html) ---------- */

const isoDaysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
function fixtureState() {
  return {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }],
    companies: [
      { id: 'cA', name: 'CA', createdAt: isoDaysAgo(2) },
      { id: 'cB', name: 'CB', createdAt: isoDaysAgo(20) },
      { id: 'cC', name: 'CC', createdAt: isoDaysAgo(60) },
    ],
    leads: [
      { id: 'lA', company: 'cA', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(2) },
      { id: 'lB', company: 'cA', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(15) },
      { id: 'lC', company: 'cA', line: 'ai', status: 'new', ownerId: 'yen', createdAt: isoDaysAgo(45) },
    ],
    deals: [
      { id: 'd1', company: 'cA', line: 'ai', stage: 'prospect', owner: 'yen', amount: 100, cur: 'USD', createdAt: isoDaysAgo(40) },
      { id: 'd2', company: 'cA', line: 'ai', stage: 'prospect', owner: 'yen', amount: 200, cur: 'USD', createdAt: isoDaysAgo(20) },
      { id: 'd3', company: 'cA', line: 'ai', stage: 'prospect', owner: 'yen', amount: 300, cur: 'USD', createdAt: isoDaysAgo(2) },
      { id: 'd4', company: 'cA', line: 'ai', stage: 'won', owner: 'yen', createdAt: isoDaysAgo(3) },
      { id: 'd5', company: 'cA', line: 'ai', stage: 'won', owner: 'yen', createdAt: isoDaysAgo(50) },
      { id: 'd6', company: 'cA', line: 'metaverse', stage: 'prospect', owner: 'yen', amount: 7000000, cur: 'VND', createdAt: isoDaysAgo(1) },
      { id: 'd7', company: 'cA', line: 'metaverse', stage: 'prospect', owner: 'yen', amount: 5000000, cur: 'VND', createdAt: isoDaysAgo(80) },
    ],
    tasks: [], activities: [], games: [], events: [],
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
  vm.runInContext("window.SavaData = { listLeadFunnelEvents: async () => ({ windowEvents: [], earliestEvents: [] }) }", ctx);
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
async function settle(h) { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); h.run('render()'); }
/* Số donut executive của 1 mảng: trích từ đúng segment khối
   "Deal Pipeline theo mảng" (legend cạnh donut). */
function donutValue(html, label) {
  /* Segment = đúng khối pipeline executive: từ heading <h3> của khối
     tới đầu khối dưới (ex-overview-bottom). Không dùng needle trần
     "Deal Pipeline theo mảng"/"Cần xử lý" vì đoạn Phạm vi số liệu
     (a)/(c) cũng nhắc hai cụm chữ này ở vị trí sớm hơn. */
  const start = html.indexOf('<h3>Deal Pipeline theo mảng</h3>');
  const seg = html.slice(start, html.indexOf('ex-overview-bottom', start));
  const m = new RegExp('<span>' + label + '</span><b>(\\d+)</b>').exec(seg);
  return m ? Number(m[1]) : null;
}
/* Số "deal đang mở" của thẻ Tiến trình Deal theo mảng (Phân tích). */
function progressOpen(html, label) {
  const m = new RegExp('<h3>' + label + '</h3><span class="dash-badge">(\\d+) deal đang mở</span>').exec(html);
  return m ? Number(m[1]) : null;
}
const exKpi = (label, value, note) => `<span class="ex-kpi-label">${label}</span><strong>${value}</strong><span class="ex-kpi-note">${note}</span>`;
const anKpi = (label, value, total) => `<div class="k">${label}</div><div class="v">${value}</div><div class="s">Tổng hiện tại: ${total}</div>`;

test('harness kỳ 7: donut executive AI == Tiến trình AI == 1 (ca lệch 2-vs-1/3-vs-1 cũ đã khớp); KPI chính = trong kỳ, phụ = Tổng hiện tại', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('7')");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.equal(donutValue(html, 'AI'), 1, 'donut executive: AI chỉ còn deal mở TẠO trong kỳ 7 (d3)');
  assert.equal(progressOpen(html, 'AI'), 1, 'Tiến trình Deal theo mảng: AI mở trong cohort kỳ 7');
  assert.equal(donutValue(html, 'AI'), progressOpen(html, 'AI'), 'HAI KHỐI CHO CÙNG MỘT SỐ trên cùng dữ kiện + bộ lọc');
  assert.ok(html.includes('Phân bổ deal đang mở · chỉ tính deal tạo trong kỳ (7 ngày)'), 'phụ đề donut mới');
  assert.ok(html.includes('Từng stage gồm cả Won · chỉ tính deal tạo trong kỳ, stage lấy theo hiện tại.'), 'footnote cột stage mới');
  /* Executive KPI */
  assert.ok(html.includes(exKpi('Công ty', 1, 'Tổng hiện tại: 3')), 'executive Công ty: chính 1 (tạo trong kỳ), phụ tổng 3');
  assert.ok(html.includes(exKpi('Leads', 1, 'Tổng hiện tại: 3')), 'executive Leads: chính 1, phụ tổng 3');
  assert.ok(html.includes(exKpi('Deal đang mở', 2, 'Tổng hiện tại: 5')), 'executive Deal đang mở: chính = mở ∩ cohort (d3, d6) = 2, phụ = 5 đang mở hiện tại');
  assert.ok(html.includes(exKpi('Giá trị pipeline', '$300 + 7tr ₫', 'Tổng hiện tại: $600 + 12tr ₫ · Deal mở tạo trong kỳ 7 ngày · AI & Metaverse')), 'executive Giá trị pipeline: chính = pipeline của deal mở thuộc cohort; phụ = pipeline hiện tại; ghi chú nhắc kỳ');
  /* Phân tích KPI */
  assert.ok(html.includes(anKpi('Công ty', 1, 3)), 'Phân tích Công ty: chính 1 / phụ 3');
  assert.ok(html.includes(anKpi('Lead', 1, 3)), 'Phân tích Lead: chính 1 / phụ 3');
  assert.ok(html.includes(anKpi('Deal đang mở', 2, 5)), 'Phân tích Deal đang mở: chính 2 / phụ 5');
  assert.ok(html.includes(anKpi('Deal đã won', 1, 2)), 'Phân tích Deal đã won: chính = won thuộc cohort (d4) = 1 / phụ = 2 won hiện tại');
  /* Footnote phễu executive: có ý lead nhập lô (hạng mục 5) */
  assert.ok(html.includes('Lead nhập theo lô hàng loạt không có sự kiện cho từng lead: lead được tạo trong kỳ thì tính từ trạng thái lúc tạo'), 'footnote phễu executive bổ sung ý lead nhập lô, khớp panel chi tiết');
});

test('harness kỳ 30: donut/Tiến trình AI == 2; KPI chính tăng theo cohort 30 ngày, phụ giữ nguyên tổng hiện tại', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('30')");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.equal(donutValue(html, 'AI'), 2);
  assert.equal(progressOpen(html, 'AI'), 2);
  assert.equal(donutValue(html, 'AI'), progressOpen(html, 'AI'));
  assert.ok(html.includes(exKpi('Công ty', 2, 'Tổng hiện tại: 3')));
  assert.ok(html.includes(exKpi('Leads', 2, 'Tổng hiện tại: 3')));
  assert.ok(html.includes(exKpi('Deal đang mở', 3, 'Tổng hiện tại: 5')), 'mở ∩ cohort 30 = d2, d3, d6');
  assert.ok(html.includes(exKpi('Giá trị pipeline', '$500 + 7tr ₫', 'Tổng hiện tại: $600 + 12tr ₫ · Deal mở tạo trong kỳ 30 ngày · AI & Metaverse')));
  assert.ok(html.includes(anKpi('Deal đã won', 1, 2)), 'won thuộc cohort 30 vẫn chỉ d4 (d5 tạo 50d trước)');
});

test('harness NEO HỒI QUY kỳ Tất cả: MỌI số chính == tổng hiện tại tương ứng (từng loại thẻ)', async () => {
  const h = loadIndex();
  h.run("curView = 'dash'; setDashPeriod('all')");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.equal(donutValue(html, 'AI'), 3, 'Tất cả: donut AI = toàn bộ deal AI đang mở hiện tại');
  assert.equal(progressOpen(html, 'AI'), 3);
  assert.ok(html.includes(exKpi('Công ty', 3, 'Tổng hiện tại: 3')), 'neo Công ty executive');
  assert.ok(html.includes(exKpi('Leads', 3, 'Tổng hiện tại: 3')), 'neo Leads executive');
  assert.ok(html.includes(exKpi('Deal đang mở', 5, 'Tổng hiện tại: 5')), 'neo Deal đang mở executive');
  assert.ok(html.includes(exKpi('Giá trị pipeline', '$600 + 12tr ₫', 'Tổng hiện tại: $600 + 12tr ₫ · Deal mở tạo trong kỳ Tất cả · AI & Metaverse')), 'neo Giá trị pipeline executive');
  assert.ok(html.includes(anKpi('Công ty', 3, 3)), 'neo Công ty Phân tích');
  assert.ok(html.includes(anKpi('Lead', 3, 3)), 'neo Lead Phân tích');
  assert.ok(html.includes(anKpi('Deal đang mở', 5, 5)), 'neo Deal đang mở Phân tích');
  assert.ok(html.includes(anKpi('Deal đã won', 2, 2)), 'neo Deal đã won Phân tích');
});

test('harness khoảng Tuỳ chỉnh [hôm nay-9 ngày, hôm nay]: donut/KPI theo đúng khoảng (chặn cả hai đầu)', async () => {
  const h = loadIndex();
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  h.run(`curView = 'dash'; dashCustomActive = true; dashCustomFrom = '${iso(9)}'; dashCustomTo = '${iso(0)}'; render()`);
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.equal(donutValue(html, 'AI'), 1, 'khoảng 10 ngày: AI mở thuộc khoảng chỉ d3 (d2 tạo 20d trước bị loại)');
  assert.equal(progressOpen(html, 'AI'), 1, 'Tiến trình khớp donut ở khoảng Tuỳ chỉnh');
  assert.ok(html.includes(exKpi('Công ty', 1, 'Tổng hiện tại: 3')), 'Công ty thuộc khoảng: chỉ cA (2d)');
  assert.ok(html.includes(exKpi('Deal đang mở', 2, 'Tổng hiện tại: 5')), 'Deal mở thuộc khoảng: d3 + d6');
  assert.ok(html.includes(anKpi('Deal đã won', 1, 2)), 'Won thuộc khoảng: d4 (3d)');
});

/* ---------- 4) + 5) Tĩnh: nhãn + đoạn chữ ---------- */

test('tĩnh hạng mục 4+5: nhãn mới, đoạn Phạm vi (a)-(e) không còn "Ngoại lệ duy nhất", đúng 1 chú thích legacy', () => {
  const html = read('index.html');
  assert.ok(!html.includes('Ngoại lệ duy nhất') && !html.includes('NGOẠI LỆ DUY NHẤT'), 'bỏ hẳn chữ "Ngoại lệ duy nhất" khỏi index.html');
  assert.ok(!html.includes('Deal thắng toàn tập'), 'tên donut cũ đã bỏ hẳn');
  assert.ok(html.includes('Tỉ lệ thắng Deal trong kỳ'), 'tên mới của thẻ tỉ lệ thắng (vốn tính theo cohort kỳ)');
  const kpiSeg = html.slice(html.indexOf('function kpiHTML()'), html.indexOf('function vDash()'));
  assert.ok(kpiSeg.includes("item('Lead đang ở Mới'"), 'thẻ legacy đổi tên đúng nghĩa: đếm lead ĐANG Ở trạng thái Mới');
  assert.ok(!kpiSeg.includes("item('Lead mới'"), 'thẻ legacy không còn nhãn "Lead mới" gây hiểu nhầm');
  assert.ok(kpiSeg.includes("l.status==='new'"), 'chỉ đổi chữ — cách đếm của thẻ legacy giữ nguyên');
  for (const frag of [
    'Số chính trên thẻ KPI, khu Phân tích và donut “Deal Pipeline theo mảng” ở Tổng quan kinh doanh tính theo <b>cohort</b>',
    'tổng hiện tại nằm ở dòng phụ của thẻ KPI với nhãn “Tổng hiện tại”',
    'Phễu Lead (gồm dòng lối ra Not yet have demand) tính theo <b>lần chuyển stage trong kỳ</b> từ nhật ký hệ thống; nhật ký đầy đủ từ 31-10-2026',
    'lead nhập theo lô hàng loạt không có sự kiện cho từng lead nên chỉ được tính từ lần chuyển stage đầu tiên sau khi nhập (hoặc từ lúc tạo nếu tạo trong kỳ)',
    'Cột trạng thái trong bảng Hiệu suất team / So sánh theo BD (Lead phụ trách · Deal đang mở · Việc quá hạn) và khối “Cần xử lý” là <b>số hiện tại</b>, không theo kỳ',
    'Tab Báo cáo hoạt động tính theo <b>ngày hoạt động trong kỳ</b>',
    'Khu legacy “Pipeline chi tiết, việc cần làm &amp; ghi hoạt động” ở cuối trang <b>không áp bộ lọc chung</b>',
  ]) assert.ok(html.includes(frag), 'đoạn Phạm vi số liệu thiếu ý: ' + frag);
  assert.equal((html.match(/ex-legacy-note/g) || []).length, 1, 'đúng 1 dòng chú thích trong khu legacy');
  assert.ok(html.includes('Chú thích: Khu legacy này không áp bộ lọc chung của Dashboard (Kỳ × Người × Mảng) — các số dưới đây không đổi theo bộ lọc chung đã chọn ở trên.'), 'nguyên văn chú thích legacy');
  assert.ok(html.includes('Lead nhập theo lô hàng loạt không có sự kiện cho từng lead: lead được tạo trong kỳ thì tính từ trạng thái lúc tạo, lead có từ trước kỳ thì chỉ tính từ lần chuyển stage đầu tiên trong kỳ'), 'footnote phễu executive (và panel chi tiết) cùng một ý lead nhập lô');
});
