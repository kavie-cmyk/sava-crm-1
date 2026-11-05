/* Dashboard Phân tích (khu "Phân tích" trong Tổng quan BD):
   - Helper thuần window.SavaDash (shared.js): dashPct, dashCountNew,
     dashTrend (bucket ngày/tuần/tháng), dashLeadFunnel (BẢN CHỐT: phễu
     TÍCH LUỸ "đã tới bước này trở lên" — dãy đơn điệu không tăng, N = tổng
     lead đường chính, status lạ + not_yet_have_demand không tính vào N,
     tóm tắt Đã liên hệ trở lên / đã chuyển thành deal), dashWinRate,
     dashDealStages, dashScopeFilter (khoá: lead.ownerId / deal.owner /
     task.assignee; công ty của BD = hợp tập công ty phân biệt từ lead ∪
     deal của BD), dashConversions, dashCompare (tổng các hàng BD + Chưa
     gán = toàn hệ ở các chỉ số cộng được).
   - Tĩnh: render dashAnalyticsHTML gắn vào vDash, ghi chú trung thực của
     phễu, bộ màu DASH_COLORS định nghĩa một chỗ, CSS tiền tố dash-.
   - Hành vi qua harness index.html: vDash hiện đủ các khối; phễu trình
     bày bản chốt (dòng mốc, % nguyên kèm số lead thật, dòng phụ % đi tiếp
     ngay dưới % lớn — không còn pill mũi tên giữa các dòng, cột
     lối ra, dòng tóm tắt) trên fixture N=7 số lẻ đối chiếu tay; bấm một
     dòng phễu mở view Lead lọc đúng trạng thái; chuyển scope sang 1 BD
     thì bảng so sánh biến mất và ghi chú phạm vi BD xuất hiện. */
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

/* ---------- 3) Phễu lead TÍCH LUỸ (bản chốt) ---------- */

const MAIN_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'converted']; /* đường chính còn 10 trạng thái sau khi bỏ qualified (2026-11-03) */
/* Fixture số lẻ N=7 (đường chính): new×2, sent_connect×1, first_email×1,
   in_reply×1, contacted×1, converted×1 — cộng 1 not_yet_have_demand (lối
   ra) + 1 trạng thái lạ, cả hai KHÔNG tính vào N. Đối chiếu tay:
   tích luỹ = new 7, sent 5, 1st_msg 4, 1st_email 4, 1st_fu 3, in_resp 3,
   in_reply 3, discovery 2, contacted 2, converted 1. */
const FUNNEL_LEADS = [
  { status: 'new' }, { status: 'new' }, { status: 'sent_connect' }, { status: 'first_email' },
  { status: 'in_reply' }, { status: 'contacted' }, { status: 'converted' },
  { status: 'not_yet_have_demand' }, { status: 'trang-thai-la' },
];
test('dashLeadFunnel bản chốt: dãy tích luỹ đơn điệu không tăng, % dòng = dòng/N, % đi tiếp = dòng dưới/dòng trên', () => {
  const D = loadShared().window.SavaDash;
  const f = D.dashLeadFunnel(FUNNEL_LEADS, MAIN_KEYS, 'not_yet_have_demand');
  const byKey = Object.fromEntries(f.steps.map(s => [s.key, s]));
  assert.equal(f.total, 7, 'N = tổng lead đường chính (không gồm lối ra + trạng thái lạ)');
  assert.equal(f.rawTotal, 9);
  assert.deepEqual(f.steps.map(s => s.count), [7, 5, 4, 4, 3, 3, 3, 2, 2, 1], 'tích luỹ đối chiếu tay (10 bước đường chính)');
  for (let i = 1; i < f.steps.length; i++) assert.ok(f.steps[i].count <= f.steps[i - 1].count, `dãy tích luỹ không tăng ở bước ${f.steps[i].key}`);
  for (const s of f.steps) {
    assert.ok(Math.abs(s.pct - s.count / 7 * 100) < 1e-9, `% dòng ${s.key} = count/N`);
    assert.equal(s.fromStart, s.pct, 'fromStart là cùng một % so với điểm bắt đầu');
    if (s.toNext !== null) {
      const nxt = f.steps[f.steps.indexOf(s) + 1];
      assert.ok(Math.abs(s.toNext - nxt.count / s.count * 100) < 1e-9, `% đi tiếp từ ${s.key} = dòng dưới / dòng trên`);
    }
  }
  assert.equal(byKey.new.exact, 2); assert.equal(byKey.sent_connect.exact, 1); assert.equal(byKey.first_message.exact, 0);
  assert.equal(byKey.converted.toNext, null, 'bước cuối không có bước tiếp');
});

test('dashLeadFunnel bản chốt: bất biến phụ — tích luỹ sent_connect = N − số ở Mới; tích luỹ converted = số converted; lối ra + status lạ ngoài N', () => {
  const D = loadShared().window.SavaDash;
  const f = D.dashLeadFunnel(FUNNEL_LEADS, MAIN_KEYS, 'not_yet_have_demand');
  const byKey = Object.fromEntries(f.steps.map(s => [s.key, s]));
  assert.equal(byKey.sent_connect.count, f.total - byKey.new.exact, 'tích luỹ tại Sent connect = N − (số đang ở Mới)');
  assert.equal(byKey.converted.count, byKey.converted.exact, 'tích luỹ tại converted = đúng số lead converted');
  assert.equal(byKey.converted.count, 1);
  assert.equal(f.dropped.key, 'not_yet_have_demand');
  assert.equal(f.dropped.count, 1);
  assert.ok(Math.abs(f.dropped.pct - 100 / 7) < 1e-9, 'lối ra: % trên tổng ban đầu N (không phải trên rawTotal)');
  assert.equal(f.unknown, 1, 'trạng thái lạ bị loại và đếm riêng để ghi chú');
  assert.equal(f.summary.reachedContactedPlus, 2, 'n = lead ở contacted ∪ converted');
  assert.ok(Math.abs(f.summary.reachedContactedPlusPct - 200 / 7) < 1e-9);
  assert.ok(!('qualifiedPlus' in f.summary), 'khái niệm qualifiedPlus đã đổi tên sạch sang reachedContactedPlus');
  assert.equal(f.summary.converted, 1);
  assert.ok(Math.abs(f.summary.convertedPct - 100 / 7) < 1e-9);
  const f0 = D.dashLeadFunnel([], MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(f0.total, 0);
  assert.equal(f0.steps[0].count, 0); assert.equal(f0.steps[0].toNext, null, 'mẫu số 0 -> null, không NaN');
  assert.equal(f0.steps[1].pct, null); assert.equal(f0.dropped.pct, null); assert.equal(f0.summary.reachedContactedPlusPct, null);
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
      { id: 'l3', company: 'c2', line: 'metaverse', status: 'contacted', ownerId: 'hoang', createdAt: isoDaysAgo(2) },
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
  assert.equal(byId.yen.converted, 1); assert.equal(byId.yen.leadRate, 100, 'bộ lọc chung 2026-11-05: converted + leadRate là chỉ số LUỒNG trên cohort kỳ 30 — lead trong kỳ của Yến chỉ có l1 (converted) nên 1/1 = 100%; leadTotal ở trên vẫn là trạng thái hiện tại (2)');
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
  assert.ok(html.includes('setDashPeriod') && html.includes('setDashScope') && html.includes('setDashFunnelLine'));
  assert.ok(!html.includes('setDashFunnelOwner'), 'bộ lọc chung 2026-11-05: trục Người của phễu đã gộp vào thanh lọc chung — không còn select người riêng của phễu');
  assert.ok(html.includes('dash-filterbar') && html.includes('leadCreatedPeriodSel') && html.includes('setLeadCreatedPeriodFilter'), 'thanh lọc chung + bộ lọc kỳ tạo nhìn thấy/gỡ được ở view Lead');
  assert.ok(html.includes('công ty của BD'), 'phải có chú thích định nghĩa công ty của BD khi scope != Toàn hệ');
  assert.ok(shared.includes('const DASH_COLORS'), 'bộ màu dùng chung định nghĩa một chỗ trong shared.js');
  assert.ok(css.includes('.dash-wrap') && css.includes('.dash-funnel-row') && css.includes('.dash-table'), 'CSS dash- phải có trong workspace-design.css');
});

test('tĩnh phễu bản chốt: đủ mẫu câu/mẫu dòng phụ % đi tiếp/nhãn bắt buộc; không còn pill mũi tên; % phễu làm tròn nguyên qua helper riêng', () => {
  const html = read('index.html'), css = read('workspace-design.css');
  assert.ok(html.includes('Số % lớn trên mỗi dòng: trong tổng lead ban đầu, bao nhiêu % đã tới được bước đó. Số % nhỏ có mũi tên ↓ ngay dưới % lớn: trong số lead tới bước ngay trên, bao nhiêu % đi tiếp xuống bước này.'), '2 câu chú thích nguyên văn ngay trên phễu (đã khớp trình bày mới)');
  assert.ok(html.includes('Tổng lead đưa vào — ${funnel.total} lead · 100%'), 'dòng mốc đầu phễu');
  assert.ok(html.includes('lead đã tới bước này'), 'mỗi dòng trạng thái kèm số lead thật + câu "đã tới bước này"');
  assert.ok(html.includes('% so với điểm bắt đầu'), 'nhãn % của dòng');
  assert.ok(html.includes('dash-funnel-fromprev') && html.includes('đi tiếp ${j === 0 ? "từ đầu vào" : "từ bước trước"}'), 'dòng phụ % đi tiếp nằm trong khối % của dòng đích; Sent connect ghi "từ đầu vào", dòng sau ghi "từ bước trước"');
  assert.ok(!html.includes('dash-funnel-arrow'), 'KHÔNG còn pill mũi tên đứng riêng giữa các dòng trong source render');
  assert.ok(!html.includes('lead đi tiếp ('), 'mẫu chip cũ "↓ {m} trong {n} lead đi tiếp ({p}%)" đã bỏ hẳn');
  assert.ok(html.includes('tạm dừng — chưa có nhu cầu'), 'nhãn phụ cột lối ra');
  assert.ok(html.includes('trên tổng ban đầu'), 'cột lối ra hiện % trên tổng ban đầu');
  assert.ok(html.includes('lead đã tới bước Đã liên hệ trở lên') && html.includes('lead đã chuyển thành deal'), 'dòng tóm tắt dưới phễu');
  assert.ok(html.includes('Chưa có lead nào trong phạm vi này.'), 'tóm tắt thay thế khi N=0, không chia cho 0');
  assert.ok(html.includes('function dashPctIntTxt'), '% khối phễu làm tròn 0 thập phân qua helper riêng');
  assert.ok(html.includes('dashOpenLeadStatus') && html.includes('id="leadStatusFilterSel"') && html.includes('l.status === leadStatusFilter'), 'dòng phễu bấm được -> view Lead lọc đúng trạng thái qua leadStatusFilter');
  for (const stale of ['Rớt phễu', '→ bước tiếp:', 'từ bước đầu:', 'đang ở hoặc đã vượt qua']) {
    assert.ok(!html.includes(stale), 'không sót diễn giải/mẫu cũ của phễu: ' + stale);
  }
  assert.ok(!css.includes('.dash-funnel-arrow'), 'CSS pill mũi tên cũ đã gỡ hẳn');
  assert.ok(css.includes('.dash-funnel-fromprev') && css.includes('.dash-funnel-exit') && css.includes('.dash-funnel-summary') && css.includes('.dash-funnel-pct'), 'CSS dash- cho dòng phụ % đi tiếp/dòng lối ra/tóm tắt/% lớn phải có');
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
  for (const needle of ['Phân tích', 'Xu hướng thêm mới', 'Phễu Lead', 'Tiến trình Deal theo mảng', 'Lead → Deal', 'So sánh theo BD', 'Tổng lead đưa vào', 'Not yet have demand', 'Yến', 'Hoàng Daden', 'Chưa gán']) {
    assert.ok(html.includes(needle), 'thiếu khối/nội dung: ' + needle);
  }
  assert.ok(!html.includes('/ 4 · 1 / 4'), 'thẻ tỉ lệ không được in trùng số tử/mẫu');
  run("setDashScope('yen')");
  const scoped = getEl('view').innerHTML;
  assert.ok(!scoped.includes('So sánh theo BD'), 'scope 1 BD thì không hiện bảng so sánh');
  assert.ok(scoped.includes('công ty của BD'), 'scope BD phải hiện chú thích định nghĩa công ty của BD');
  run("setDashScope('')");
});

test('hành vi phễu bản chốt: fixture N=7 số lẻ — dòng mốc, dòng phụ % đi tiếp trong dòng đích (không pill, không lặp số lead), lối ra, tóm tắt; prev=0 hiện ↓ —, không NaN', () => {
  const { run, getEl } = loadIndex();
  const mk = (id, status) => ({ id, company: 'c1', line: 'ai', status, name: 'Lead ' + id, person: '', note: '', source: '', when: '2026-11-02', createdAt: isoDaysAgo(1) });
  run(`S.leads = ${JSON.stringify([mk('f1', 'new'), mk('f2', 'new'), mk('f3', 'sent_connect'), mk('f4', 'first_email'), mk('f5', 'in_reply'), mk('f6', 'contacted'), mk('f7', 'converted'), mk('f8', 'not_yet_have_demand'), mk('f9', 'trang-thai-la')])}`);
  run("curView = 'dash'; render()");
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 7 lead · 100%'), 'dòng mốc: N=7 (lối ra + trạng thái lạ không tính vào N)');
  assert.ok(!html.includes("dashOpenLeadStatus('new')"), 'KHÔNG vẽ dòng Mới riêng');
  assert.ok(!html.includes('dash-funnel-arrow'), 'render KHÔNG còn pill .dash-funnel-arrow nào');
  assert.ok(!/trong \d+ lead đi tiếp/.test(html), 'phần % đi tiếp KHÔNG lặp số đếm lead kiểu chip cũ');
  assert.ok(html.includes('<span class="dash-funnel-fromprev">↓ 71% đi tiếp từ đầu vào</span>'), 'dòng Sent connect: % đi tiếp từ dòng mốc tổng (5/7 -> 71%) ghi "từ đầu vào", nằm trong khối % của chính dòng');
  assert.ok(html.includes('<span class="dash-funnel-fromprev">↓ 80% đi tiếp từ bước trước</span>'), 'dòng first_message: đi tiếp từ Sent connect 4/5 = 80%');
  assert.ok(html.includes('<span class="dash-funnel-fromprev">↓ 50% đi tiếp từ bước trước</span>'), 'dòng converted: đi tiếp từ contacted 1/2 = 50%');
  assert.ok(html.includes('5 lead đã tới bước này') && html.includes('<b>71%</b>'), 'dòng Sent connect: số tích luỹ thật + % nguyên so với điểm bắt đầu');
  assert.ok(html.includes('<b>29%</b>'), 'dòng tích luỹ 2/7 hiện 29% (làm tròn nguyên)');
  assert.ok(html.includes('1 lead · 14% trên tổng ban đầu') && html.includes('tạm dừng — chưa có nhu cầu'), 'cột lối ra: 1 lead, 1/7 -> 14% trên tổng ban đầu, nhãn tạm dừng');
  const exitSlice = html.slice(html.indexOf('dash-funnel-exit'), html.indexOf('dash-funnel-summary'));
  assert.ok(!exitSlice.includes('dash-funnel-fromprev') && !exitSlice.includes('đi tiếp'), 'khối lối ra Not yet have demand KHÔNG có % đi tiếp');
  assert.ok(html.includes('Trong 7 lead: 2 lead đã tới bước Đã liên hệ trở lên (29%) · 1 lead đã chuyển thành deal (14%)'), 'dòng tóm tắt đúng mẫu câu + % nguyên');
  assert.ok(html.includes('1 lead có trạng thái lạ') && html.includes('không tính vào tổng lead đưa vào'), 'ghi chú trạng thái lạ bị loại tại phễu');
  assert.ok(html.includes('Số % lớn trên mỗi dòng: trong tổng lead ban đầu, bao nhiêu % đã tới được bước đó. Số % nhỏ có mũi tên ↓ ngay dưới % lớn: trong số lead tới bước ngay trên, bao nhiêu % đi tiếp xuống bước này.'), '2 câu chú thích nguyên văn trên phễu (trình bày mới)');
  /* Mọi lead kẹt ở Mới: các dòng tích luỹ = 0; dòng đầu (prev = N = 2) hiện 0%, các dòng sau (prev = 0) hiện ↓ —. */
  run(`S.leads = ${JSON.stringify([mk('g1', 'new'), mk('g2', 'new')])}`);
  run("render()");
  const zero = getEl('view').innerHTML;
  assert.ok(zero.includes('<span class="dash-funnel-fromprev">↓ 0% đi tiếp từ đầu vào</span>'), 'dòng Sent connect khi không ai đi tiếp: 0/2 = 0% từ đầu vào');
  assert.ok(zero.includes('<span class="dash-funnel-fromprev">↓ —</span>'), 'bước ngay trên = 0 lead -> dòng phụ "↓ —", không NaN');
  assert.ok(!zero.includes('dash-funnel-arrow'), 'kể cả fixture 0 cũng không có pill mũi tên');
  assert.ok(!zero.includes('NaN'), 'không NaN khi mẫu số 0');
  assert.ok(zero.includes('Trong 2 lead: 0 lead đã tới bước Đã liên hệ trở lên (0%) · 0 lead đã chuyển thành deal (0%)'));
  /* N=0: câu tóm tắt thay thế, không chia cho 0. */
  run('S.leads = []');
  run("render()");
  assert.ok(getEl('view').innerHTML.includes('Chưa có lead nào trong phạm vi này.'));
});

test('hành vi: bấm một dòng phễu (dashOpenLeadStatus) mở view Lead lọc đúng trạng thái đó', () => {
  const { run, getEl } = loadIndex();
  run("dashOpenLeadStatus('contacted')");
  assert.equal(run('curView'), 'leads');
  assert.equal(run('leadStatusFilter'), 'contacted');
  assert.deepEqual(JSON.parse(JSON.stringify(run('filteredLeads().map(l => l.id)'))), ['l3'], 'chỉ lead contacted của fixture lọt qua bộ lọc');
  const html = getEl('view').innerHTML;
  assert.ok(html.includes('data-lead-status="contacted"'), 'view Lead hiện block trạng thái đích');
  assert.ok(!html.includes('data-lead-status="new"'), 'đang lọc: block trạng thái khác bị ẩn');
  assert.ok(html.includes('id="leadStatusFilterSel"'), 'view Lead có select trạng thái để đổi/bỏ lọc');
  run("dashOpenLeadStatus('not_yet_have_demand')");
  assert.deepEqual(JSON.parse(JSON.stringify(run('filteredLeads().map(l => l.id)'))), [], 'dòng lối ra lọc đúng not_yet_have_demand (fixture không có lead nào)');
  run("dashOpenLeadStatus('')");
  assert.equal(run('leadCreatedPeriodDays'), 30, 'bộ lọc chung: click phễu mang kỳ đang chọn (mặc định 30) sang view Lead');
  assert.equal(run('filteredLeads().length'), 3, 'dòng mốc bỏ lọc trạng thái nhưng VẪN lọc kỳ tạo 30 ngày: l2 (50 ngày) bị loại');
  run("setLeadCreatedPeriodFilter('')");
  assert.equal(run('filteredLeads().length'), 4, 'gỡ bộ lọc kỳ tạo ở view Lead -> thấy tất cả lead');
});
