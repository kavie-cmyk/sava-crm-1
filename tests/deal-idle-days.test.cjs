/* Đợt SỬA BỘ ĐẾM NGÀY CỦA DEAL (15/11/2026, Zac chốt):
   - Bệnh cũ: d.idle (DB idle_days) là số LƯU SẴN chỉ được đặt 0 khi
     tạo/sửa/chuyển stage, không có cơ chế tăng theo thời gian -> thẻ deal
     luôn "0 ngày", cảnh báo "🔥 nguội" (≥5) không bao giờ cháy, hai số
     Dashboard ("Deal cần theo dõi" legacy + "deal cần follow-up" ở khối
     Cần xử lý) luôn 0. Ví dụ thật: deal Mitsubishi Virtual Showroom
     updatedAt 03-11-2026 mà thẻ hiện 0 ngày (đúng phải 12 ngày tới 15-11).
   - Cách sửa: MỌI nơi đọc chuyển sang helper dealIdleDays(d) TÍNH TẠI
     LÚC ĐỌC từ updatedAt (ngày lịch Asia/Ho_Chi_Minh), fallback createdAt,
     thiếu cả hai -> 0. Số lưu sẵn d.idle chỉ còn được GHI 0 + round-trip
     qua adapter (cột idle_days NOT NULL), không còn nơi đọc nghiệp vụ.
   Harness vm nạp index.html THẬT như dashboard-activity-clickthrough. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

/* Mốc ISO lúc 12:00 giờ Saigon của ngày lịch Saigon cách hôm nay n ngày —
   neo giữa ngày để hiệu số ngày lịch không phụ thuộc giờ chạy test. */
function saigonNoonDaysAgo(n) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date()).forEach(x => { parts[x.type] = x.value; });
  const base = Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T05:00:00Z'); /* 12:00 Saigon */
  return new Date(base - n * 86400000).toISOString();
}

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Vừa tạo' }],
    games: [],
    deals: [
      /* Số lưu sẵn NÓI DỐI cả hai chiều: dOld lưu 0 nhưng đã 12 ngày không
         cập nhật; dFresh lưu 99 nhưng vừa cập nhật hôm nay. */
      { id: 'dOld', line: 'publishing', title: 'Deal Cũ 12 Ngày', company: 'c1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [], createdAt: saigonNoonDaysAgo(12), updatedAt: saigonNoonDaysAgo(12) },
      { id: 'dFresh', line: 'publishing', title: 'Deal Mới Hôm Nay', company: 'c1', stage: 'build_eval', owner: 'linh', due: '', idle: 99, custom: {}, term: {}, contract: {}, leads: [], createdAt: saigonNoonDaysAgo(30), updatedAt: saigonNoonDaysAgo(0) },
      { id: 'dWonOld', line: 'publishing', title: 'Deal Won Cũ', company: 'c1', stage: 'won', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [], createdAt: saigonNoonDaysAgo(40), updatedAt: saigonNoonDaysAgo(40) },
    ],
    leads: [],
    tasks: [],
    activities: [],
    events: [],
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

/* ---------- Helper: ca biên theo ngày lịch Saigon (now ghim 15-11-2026) ---------- */
test('dealIdleDays: 0/1/4/5 ngày + ca Mitsubishi 03-11 -> 15-11 = 12', () => {
  const { ctx } = loadIndex();
  const f = ctx.dealIdleDays, NOW = '2026-11-15';
  assert.equal(typeof f, 'function', 'phải có helper dealIdleDays duy nhất');
  assert.equal(f({ updatedAt: '2026-11-15T05:00:00.000Z' }, NOW), 0, 'cập nhật hôm nay = 0');
  assert.equal(f({ updatedAt: '2026-11-14T05:00:00.000Z' }, NOW), 1, 'hôm qua = 1');
  assert.equal(f({ updatedAt: '2026-11-11T05:00:00.000Z' }, NOW), 4, '4 ngày (dưới ngưỡng nguội)');
  assert.equal(f({ updatedAt: '2026-11-10T05:00:00.000Z' }, NOW), 5, '5 ngày (đúng ngưỡng nguội)');
  assert.equal(f({ updatedAt: '2026-11-03T05:00:00.000Z' }, NOW), 12, 'ca Mitsubishi: 03-11 -> 15-11 = 12');
  assert.equal(f({ updatedAt: '2026-11-03' }, NOW), 12, 'updatedAt dạng ngày thuần cũng = 12');
});

test('dealIdleDays: múi giờ Saigon (nửa đêm UTC chưa sang ngày mới ở Saigon thì không tính)', () => {
  const { ctx } = loadIndex();
  const f = ctx.dealIdleDays;
  /* 17:30 UTC 14-11 = 00:30 Saigon 15-11 -> cùng ngày lịch Saigon với 15-11 = 0, không phải 1 */
  assert.equal(f({ updatedAt: '2026-11-14T17:30:00.000Z' }, '2026-11-15'), 0);
  /* 16:30 UTC 14-11 = 23:30 Saigon 14-11 -> 1 ngày */
  assert.equal(f({ updatedAt: '2026-11-14T16:30:00.000Z' }, '2026-11-15'), 1);
});

test('dealIdleDays: fallback createdAt, thiếu cả hai -> 0, không NaN, số lưu sẵn bị bỏ qua', () => {
  const { ctx } = loadIndex();
  const f = ctx.dealIdleDays, NOW = '2026-11-15';
  assert.equal(f({ createdAt: '2026-11-03T05:00:00.000Z' }, NOW), 12, 'thiếu updatedAt -> dùng createdAt');
  assert.equal(f({ updatedAt: 'không-phải-ngày', createdAt: '2026-11-10T05:00:00.000Z' }, NOW), 5, 'updatedAt hỏng -> fallback createdAt');
  assert.equal(f({}, NOW), 0, 'thiếu cả hai dấu -> 0');
  assert.equal(f({ updatedAt: '', createdAt: '' }, NOW), 0);
  assert.equal(f(null, NOW), 0, 'deal null -> 0, không sập');
  assert.equal(f({ updatedAt: '2026-12-01T05:00:00.000Z' }, NOW), 0, 'dấu ở tương lai -> 0, không âm');
  assert.equal(f({ idle: 99, updatedAt: '2026-11-15T05:00:00.000Z' }, NOW), 0, 'số lưu sẵn 99 bị bỏ qua khi vừa cập nhật');
  assert.equal(f({ idle: 0, updatedAt: '2026-11-03T05:00:00.000Z' }, NOW), 12, 'số lưu sẵn 0 bị bỏ qua khi đã 12 ngày');
  assert.ok(Number.isFinite(f({ updatedAt: '2026-11-03T05:00:00.000Z' }, NOW)), 'không bao giờ NaN');
});

/* ---------- Render: thẻ deal + hai số Dashboard theo computed ---------- */
test('render thẻ pipeline: deal 12 ngày hiện "🔥 nguội 12 ngày" + class stale; deal hôm nay hiện "0 ngày"', () => {
  const { run, getEl } = loadIndex();
  run("curLine = 'publishing'; vBoard();");
  const out = getEl('view').innerHTML;
  assert.ok(out.includes('🔥 nguội 12 ngày'), 'thẻ deal cũ phải hiện 🔥 nguội 12 ngày, nhận được: ' + out.slice(out.indexOf('Deal Cũ'), out.indexOf('Deal Cũ') + 600));
  assert.ok(out.includes('class="stale"'), 'thẻ nguội phải mang class stale');
  const freshSeg = out.slice(out.indexOf('Deal Mới Hôm Nay'), out.indexOf('Deal Mới Hôm Nay') + 700);
  assert.ok(freshSeg.includes('>0 ngày<') || freshSeg.includes('0 ngày'), 'deal vừa cập nhật hiện 0 ngày dù số lưu sẵn là 99');
  assert.ok(!out.includes('99 ngày'), 'không nơi nào hiện số lưu sẵn 99');
});

test('hai số Dashboard theo computed: legacy "Deal cần theo dõi" = 1 và "deal cần follow-up" = 1 (deal won cũ không tính)', () => {
  const { run, getEl } = loadIndex();
  const kpi = run('kpiHTML()');
  assert.ok(/Deal cần theo dõi<\/div><div class="v[^"]*">1<\/div>/.test(kpi), 'thẻ legacy phải đếm 1 deal mở ≥5 ngày theo updatedAt, nhận được: ' + kpi);
  run("curView = 'dash'; dashboardMode = 'overview'; dashPeriodDays = null; render();");
  const dash = getEl('view').innerHTML;
  assert.ok(/<b>1<\/b> deal cần follow-up/.test(dash), 'khối Cần xử lý phải hiện 1 deal cần follow-up, nhận được đoạn: ' + dash.slice(Math.max(0, dash.indexOf('deal cần follow-up') - 120), dash.indexOf('deal cần follow-up') + 60));
});

/* ---------- Tĩnh: không còn nơi đọc nghiệp vụ của số lưu sẵn; ghi + round-trip giữ nguyên ---------- */
test('tĩnh: index.html không còn đọc d.idle để hiển thị/đếm/so ngưỡng; chỉ còn ghi 0', () => {
  assert.ok(!/\.idle\s*(>=|<=|>|<|===|==)/.test(html), 'không được còn so sánh ngưỡng trên d.idle');
  assert.ok(!/\+ ?d\.idle|d\.idle ?\+/.test(html), 'không được còn cộng/hiển thị d.idle');
  const writes = html.match(/\.idle = 0/g) || [];
  assert.equal(writes.length, 3, '3 điểm ghi cũ (drop / moveStage / saveDeal) giữ nguyên ghi 0');
  assert.ok(html.includes('idle:0'), 'điểm tạo deal mới giữ idle:0 cho round-trip');
  assert.ok(html.includes('dealIdleDays(d)>=5') && html.includes('dealIdleDays(d) >= 5'), 'cả hai số Dashboard phải qua helper');
});

test('tĩnh: adapter vẫn round-trip idle_days nguyên vẹn (cột NOT NULL, schema không đổi)', () => {
  const ad = read('supabase-adapter.js');
  assert.ok(ad.includes('idle_days: typeof d.idle ==='), 'ghi xuống vẫn map idle -> idle_days');
  assert.ok(ad.includes('idle: d.idle_days || 0'), 'đọc lên vẫn map idle_days -> idle');
  const schema = read('supabase/schema.sql');
  assert.ok(schema.includes('idle_days   integer not null default 0'), 'schema idle_days giữ nguyên');
});
