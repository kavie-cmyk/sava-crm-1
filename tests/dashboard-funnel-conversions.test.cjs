/* Đợt 13/11/2026 (Zac chốt): khối "Chuyển đổi trong kỳ" ĐỔI PHÂN LOẠI
   từ BD x Mảng sang BD x TRẠNG THÁI — test ma trận-mảng cũ được thay
   bằng test ma trận-trạng thái ở cuối file (neo converted chụp từ hàm
   cũ trước khi sửa, deal stage, biên cửa sổ cho cả lead + deal, lọc
   Người/Mảng cho cả hai nhóm cột, render 2 nhóm cột + không tổng-hàng).
   Phần dưới đây là lịch sử đợt chiều 12/11/2026.
   Đợt chiều 12/11/2026 (Zac chốt lại) — THAY file
   dashboard-funnel-events.test.cjs cũ:
   - Phễu Lead BỎ hẳn cách tính theo sự kiện (dashLeadFunnelByEvents
     đã gỡ): phễu quay về dashLeadFunnel trên toàn bộ lead trong phạm
     vi Người × Mảng theo trạng thái hiện tại, không theo kỳ. Phủ:
     tập ID tường minh mới của dashLeadFunnel (step.leadIds /
     totalLeadIds / droppedLeadIds); bất biến phễu theo Kỳ trên
     render thật (7/30/90/Tất cả/Tuỳ chỉnh cho cùng một số, cả 2 bề
     mặt); đổi Người/Mảng thì đổi đúng; click-through phễu mở đúng
     tập đã đếm + chip không nhắc kỳ.
   - Khối MỚI "Chuyển đổi trong kỳ" (tab Báo cáo hoạt động): hàm
     thuần SavaDash.dashLeadConversionsInPeriod — nhiều sự kiện
     converted trong kỳ đếm 1 + gán người của sự kiện ĐẦU TIÊN;
     ngoài cửa sổ không đếm; Tuỳ chỉnh chặn trên; preset không chặn
     trên; byMemberId rỗng -> fallback owner hiện tại; cả hai rỗng ->
     "Không rõ"; chuyển ra rồi chuyển lại trong kỳ vẫn 1; tổng ==
     tổng các dòng BD + Không rõ; trục Người áp trên kết quả gán.
   - Đường nạp audit theo cửa sổ (listLeadConversionEvents, bí danh
     listLeadFunnelEvents) phân trang vượt 1.000 dòng; lỗi -> khối
     hiện lỗi rõ ràng, KHÔNG số 0 giả; đang tải -> hiện đang tải;
     phễu vẫn hiện số bình thường kể cả khi nạp nhật ký lỗi (phễu
     không còn phụ thuộc nhật ký). */
process.env.TZ = 'Asia/Ho_Chi_Minh';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const MAIN_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'converted'];
const NOW = new Date('2026-11-12T12:00:00+07:00'); /* thứ Năm 12/11/2026 ICT; kỳ 7 ngày bắt đầu 06/11/2026 */
const J = x => JSON.parse(JSON.stringify(x));
const ev = (leadId, at, byMemberId, to, from) => ({ entityType: 'lead', entityId: leadId, at, byMemberId: byMemberId || '', action: 'update', changes: [{ field: 'status', label: 'Trạng thái', from: from || 'Đã liên hệ', to: to || 'Đã chuyển đổi' }] });

/* ---------- Map nhãn audit -> key (helper còn dùng cho khối chuyển đổi) ---------- */

test('dashLeadStatusKeyFromAudit: đủ 12 nhãn (gồm Đạt chuẩn legacy) + nhận thẳng key + nhãn lạ -> null', () => {
  const D = loadShared().window.SavaDash;
  const pairs = { 'Mới': 'new', 'Sent connect': 'sent_connect', '1st message': 'first_message', '1st email': 'first_email', '1st FU': 'first_fu', 'In-response': 'in_response', 'In reply': 'in_reply', 'Discovery meeting': 'discovery_meeting', 'Đã liên hệ': 'contacted', 'Đạt chuẩn': 'qualified', 'Đã chuyển đổi': 'converted', 'Not yet have demand': 'not_yet_have_demand' };
  for (const [label, key] of Object.entries(pairs)) assert.equal(D.dashLeadStatusKeyFromAudit(label), key, label);
  assert.equal(D.dashLeadStatusKeyFromAudit('converted'), 'converted');
  assert.equal(D.dashLeadStatusKeyFromAudit('nhãn lạ'), null);
  assert.equal(D.dashLeadStatusKeyFromAudit(null), null);
  assert.equal(typeof D.dashLeadConversionsInPeriod, 'function', 'hàm đếm chuyển đổi trong kỳ phải được export');
  assert.equal(typeof D.dashConversionsByStatusInPeriod, 'function', 'hàm đếm theo trạng thái (13/11) phải được export');
  assert.equal(typeof D.dashDealStageKeyFromAudit, 'function');
  assert.equal(typeof D.dashDealStageChangesOf, 'function');
  assert.equal(typeof D.dashDealStageColumns, 'function');
  assert.equal(D.dashLeadFunnelByEvents, undefined, 'hàm phễu theo sự kiện đã gỡ hẳn');
  assert.equal(D.dashLeadCreatedInWindow, undefined, 'helper sàn của phễu sự kiện đã gỡ hẳn (hết nơi dùng)');
});

/* ---------- dashLeadFunnel: tập ID tường minh ---------- */

test('dashLeadFunnel: step.leadIds = tập có chỉ số trạng thái >= bước; totalLeadIds = tập vào N; droppedLeadIds = lead đang ở lối ra', () => {
  const D = loadShared().window.SavaDash;
  const leads = [
    { id: 'n1', status: 'new' }, { id: 's1', status: 'sent_connect' }, { id: 'c1', status: 'contacted' },
    { id: 'v1', status: 'converted' }, { id: 'x1', status: 'not_yet_have_demand' }, { id: 'u1', status: 'la' },
  ];
  const f = D.dashLeadFunnel(leads, MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(f.total, 4);
  assert.deepEqual(J(f.totalLeadIds), ['n1', 's1', 'c1', 'v1']);
  assert.deepEqual(J(f.steps.find(x => x.key === 'new').leadIds), ['n1', 's1', 'c1', 'v1']);
  assert.deepEqual(J(f.steps.find(x => x.key === 'sent_connect').leadIds), ['s1', 'c1', 'v1']);
  assert.deepEqual(J(f.steps.find(x => x.key === 'contacted').leadIds), ['c1', 'v1']);
  assert.deepEqual(J(f.steps.find(x => x.key === 'converted').leadIds), ['v1']);
  assert.deepEqual(J(f.droppedLeadIds), ['x1']);
  assert.deepEqual(J(f.dropped.leadIds), ['x1']);
  assert.equal(f.dropped.count, 1);
  assert.ok(f.dropped.pct <= 100, 'lối ra cùng tập với đường chính nên % không vượt 100');
  for (const st of f.steps) assert.equal(st.leadIds.length, st.count, 'mọi lead fixture đều có id nên |leadIds| == count ở bước ' + st.key);
});

/* ---------- dashLeadConversionsInPeriod: các ca bắt buộc ---------- */

const CLEADS = [
  { id: 'L1', ownerId: 'yen', line: 'ai' },
  { id: 'L2', ownerId: 'yen', line: 'ai' },
  { id: 'L3', ownerId: 'hoang', line: 'ai' },
  { id: 'L4', line: 'ai' },
  { id: 'L5', ownerId: 'yen', line: 'metaverse' },
];
const conv = (D, leads, events, days, range, scope) => D.dashConversionsByStatusInPeriod(leads, [], events, days === undefined ? 7 : days, NOW, range || null, scope || '');
/* Neo hồi quy converted: trích cột "Đã chuyển đổi" (nhóm Lead) của cấu
   trúc MỚI về đúng dạng đầu ra của hàm cũ { id, count, leadIds }. */
const convRowsOf = r => r.rows.map(row => { const c = row.leadCells.find(x => x.key === 'converted'); return c && c.count ? { id: row.id, count: c.count, leadIds: c.leadIds } : null; }).filter(Boolean);
const convCellOf = (r, rowId, key) => { const row = r.rows.find(x => x.id === rowId); return row ? row.leadCells.find(x => x.key === key) : undefined; };

test('chuyển đổi: nhiều sự kiện converted trong kỳ -> đếm 1, gán người của sự kiện ĐẦU TIÊN trong kỳ', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-08T09:00:00+07:00', 'hoang'),
    ev('L1', '2026-11-10T09:00:00+07:00', 'yen'),
    ev('L1', '2026-11-11T09:00:00+07:00', 'yen'),
  ];
  const r = conv(D, CLEADS, events);
  assert.equal(r.total, 1);
  assert.deepEqual(J(convRowsOf(r)), [{ id: 'hoang', count: 1, leadIds: ['L1'] }], 'sự kiện đầu tiên (08/11, Hoàng) quyết định người được gán ở cột converted');
});

test('chuyển đổi: sự kiện ngoài cửa sổ không đếm; preset không chặn trên (sự kiện sau "now" vẫn trong cửa sổ)', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-05T16:59:59.000Z', 'yen'), /* 23:59:59 ICT 05/11 — trước kỳ 7 một giây */
    ev('L2', '2026-11-05T17:00:00.000Z', 'yen'), /* 00:00 ICT 06/11 — đúng mốc đầu kỳ */
    ev('L3', '2026-11-20T09:00:00+07:00', 'hoang'), /* sau now nhưng preset không chặn trên -> vẫn đếm */
  ];
  const r = conv(D, CLEADS, events);
  assert.equal(r.total, 2);
  assert.deepEqual(J(r.totalLeadIds), ['L2', 'L3']);
});

test('chuyển đổi: khoảng Tuỳ chỉnh chặn cả hai đầu', () => {
  const D = loadShared().window.SavaDash;
  const range = { from: '2026-11-06', to: '2026-11-08' };
  const events = [
    ev('L1', '2026-11-08T23:59:59+07:00', 'yen'),
    ev('L2', '2026-11-09T00:00:00+07:00', 'yen'),
    ev('L3', '2026-11-05T12:00:00+07:00', 'hoang'),
  ];
  const r = conv(D, CLEADS, events, null, range);
  assert.equal(r.total, 1);
  assert.deepEqual(J(r.totalLeadIds), ['L1']);
});

test('chuyển đổi: byMemberId rỗng -> fallback owner hiện tại; cả hai rỗng -> Không rõ; tổng == tổng các dòng', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-08T09:00:00+07:00', 'yen'),
    ev('L3', '2026-11-08T10:00:00+07:00', ''), /* fallback owner hoang */
    ev('L4', '2026-11-08T11:00:00+07:00', ''), /* không byMemberId, không owner -> Không rõ */
  ];
  const r = conv(D, CLEADS, events);
  assert.equal(r.total, 3);
  const sum = convRowsOf(r).reduce((a, x) => a + x.count, 0);
  assert.equal(sum, r.total, 'tổng toàn phạm vi == tổng cột converted qua các dòng BD + Không rõ');
  const byId = Object.fromEntries(convRowsOf(r).map(x => [x.id, x]));
  assert.equal(byId.yen.count, 1); assert.equal(byId.hoang.count, 1); assert.equal(byId.__none__.count, 1);
});

test('chuyển đổi: chuyển đổi -> kéo ra -> chuyển lại trong kỳ vẫn đếm 1; đích khác converted không đếm; lead ngoài tập (khác mảng) không đếm', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-07T09:00:00+07:00', 'yen'),
    ev('L1', '2026-11-08T09:00:00+07:00', 'yen', 'Đã liên hệ', 'Đã chuyển đổi'),
    ev('L1', '2026-11-09T09:00:00+07:00', 'hoang'),
    ev('L2', '2026-11-09T09:00:00+07:00', 'yen', 'Đã liên hệ'), /* đích contacted, không phải converted */
    ev('L5', '2026-11-09T09:00:00+07:00', 'yen'), /* L5 thuộc mảng metaverse — tập đầu vào đã lọc mảng ai nên không có L5 */
  ];
  const aiLeads = CLEADS.filter(l => l.line === 'ai');
  const r = conv(D, aiLeads, events);
  assert.equal(r.total, 1, 'chỉ L1, đếm đúng 1 lần dù chuyển lại, và giữ người của lần đầu (Yến)');
  assert.deepEqual(J(convRowsOf(r)), [{ id: 'yen', count: 1, leadIds: ['L1'] }]);
});

test('chuyển đổi: trục Người áp trên kết quả gán — scope 1 BD chỉ còn phần của BD đó; scope __none__ chỉ còn Không rõ', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-08T09:00:00+07:00', 'yen'),
    ev('L3', '2026-11-08T10:00:00+07:00', ''),
    ev('L4', '2026-11-08T11:00:00+07:00', ''),
  ];
  assert.deepEqual(J(conv(D, CLEADS, events, 7, null, 'yen').totalLeadIds), ['L1']);
  assert.deepEqual(J(conv(D, CLEADS, events, 7, null, 'hoang').totalLeadIds), ['L3'], 'L3 gán Hoàng qua fallback owner nên nằm trong scope Hoàng');
  assert.deepEqual(J(conv(D, CLEADS, events, 7, null, '__none__').totalLeadIds), ['L4']);
  assert.equal(conv(D, CLEADS, events, 7, null, 'yen').total, 1);
});

/* ---------- dashConversionsByStatusInPeriod: phân loại theo TRẠNG THÁI (BD × Trạng thái, 13/11/2026) ---------- */

test('neo converted: cột Đã chuyển đổi của hàm MỚI bằng ĐÚNG đầu ra hàm CŨ chụp trước khi sửa (mọi scope + Tuỳ chỉnh)', () => {
  const D = loadShared().window.SavaDash;
  /* Bộ dữ kiện kiểm thử này đã chạy qua hàm CŨ (bb59e99) TRƯỚC khi sửa
     và đầu ra dưới đây là nguyên văn bản chụp đó:
     scope "" -> total 5 [L1,L2,L3,L4,L6], hoang 2 [L1,L3], yen 2 [L2,L6], __none__ 1 [L4];
     scope yen -> 2 [L2,L6]; hoang -> 2 [L1,L3]; __none__ -> 1 [L4];
     range 06-08/11 -> total 3 [L1,L3,L4], hoang 2 [L1,L3], __none__ 1 [L4]. */
  const leads = [
    { id: 'L1', ownerId: 'yen', line: 'ai' }, { id: 'L2', ownerId: 'yen', line: 'ai' },
    { id: 'L3', ownerId: 'hoang', line: 'ai' }, { id: 'L4', line: 'ai' },
    { id: 'L5', ownerId: 'yen', line: 'metaverse' }, { id: 'L6', ownerId: 'hoang', line: 'publishing' },
  ];
  const events = [
    ev('L1', '2026-11-08T09:00:00+07:00', 'hoang'), ev('L1', '2026-11-10T09:00:00+07:00', 'yen'),
    ev('L2', '2026-11-08T09:00:00+07:00', '', 'Sent connect', 'Mới'), ev('L2', '2026-11-09T09:00:00+07:00', ''),
    ev('L3', '2026-11-08T10:00:00+07:00', ''),
    ev('L4', '2026-11-08T11:00:00+07:00', ''),
    ev('L5', '2026-11-01T09:00:00+07:00', 'yen'),
    ev('L6', '2026-11-11T09:00:00+07:00', 'hoang', 'Đã liên hệ', 'Mới'), ev('L6', '2026-11-11T10:00:00+07:00', 'yen'),
  ];
  const byIdSorted = r => Object.fromEntries(convRowsOf(r).map(x => [x.id, { count: x.count, leadIds: x.leadIds }]));
  const all = conv(D, leads, events);
  assert.equal(all.total, 5); assert.deepEqual(J(all.totalLeadIds), ['L1', 'L2', 'L3', 'L4', 'L6']);
  assert.deepEqual(J(byIdSorted(all)), { hoang: { count: 2, leadIds: ['L1', 'L3'] }, yen: { count: 2, leadIds: ['L2', 'L6'] }, __none__: { count: 1, leadIds: ['L4'] } }, 'theo từng BD phải bằng bản chụp cũ');
  const ct = all.columnTotals.lead.find(c => c.key === 'converted');
  assert.equal(ct.count, 5); assert.deepEqual(J(ct.leadIds), ['L1', 'L2', 'L3', 'L4', 'L6'], 'tổng cột converted == totalLeadIds cũ');
  assert.deepEqual(J(conv(D, leads, events, 7, null, 'yen').totalLeadIds), ['L2', 'L6']);
  assert.deepEqual(J(conv(D, leads, events, 7, null, 'hoang').totalLeadIds), ['L1', 'L3']);
  assert.deepEqual(J(conv(D, leads, events, 7, null, '__none__').totalLeadIds), ['L4']);
  const rng = conv(D, leads, events, null, { from: '2026-11-06', to: '2026-11-08' });
  assert.equal(rng.total, 3); assert.deepEqual(J(rng.totalLeadIds), ['L1', 'L3', 'L4']);
  assert.deepEqual(J(byIdSorted(rng)), { hoang: { count: 2, leadIds: ['L1', 'L3'] }, __none__: { count: 1, leadIds: ['L4'] } });
});

test('trạng thái lead: cấu trúc cột đúng 11 (10 đường chính + lối ra cuối); không còn byLine/cells', () => {
  const D = loadShared().window.SavaDash;
  const r = conv(D, CLEADS, []);
  assert.deepEqual(J(r.leadColumns.map(c => c.key)), ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'converted', 'not_yet_have_demand']);
  assert.equal(r.leadColumns[10].label, 'Not yet have demand');
  assert.equal(r.byLine, undefined, 'byLine (phân loại theo mảng) đã gỡ');
  const r2 = conv(D, CLEADS, [ev('L1', '2026-11-08T09:00:00+07:00', 'yen')]);
  assert.equal(r2.rows[0].cells, undefined, 'rows[].cells (ma trận mảng) đã gỡ');
  assert.ok(Array.isArray(r2.rows[0].leadCells) && Array.isArray(r2.rows[0].dealCells), 'rows mang leadCells + dealCells');
  assert.equal(r2.rows[0].leadCells.length, 11); assert.equal(r2.rows[0].dealCells.length, r2.dealColumns.length);
});

test('trạng thái lead: lead qua nhiều trạng thái trong kỳ — mỗi cột đếm 1 dù vào lại nhiều lần; mỗi cột gán đúng người của trạng thái đó; create đặt thẳng vào trạng thái giữa', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'A1', ownerId: 'yen', line: 'ai' }, { id: 'A2', ownerId: 'hoang', line: 'ai' }];
  const sev = (id, at, by, to, from, action) => ({ entityType: 'lead', entityId: id, at, byMemberId: by || '', action: action || 'update', changes: [{ field: 'status', from: from || '', to }] });
  const events = [
    sev('A1', '2026-11-07T09:00:00+07:00', 'yen', 'Sent connect', 'Mới'),
    sev('A1', '2026-11-08T09:00:00+07:00', 'hoang', '1st message', 'Sent connect'), /* BD khác động vào ở trạng thái khác */
    sev('A1', '2026-11-09T09:00:00+07:00', 'yen', 'Sent connect', '1st message'), /* vào lại Sent connect: vẫn 1, vẫn gán Yến (lần đầu) */
    sev('A1', '2026-11-10T09:00:00+07:00', 'hoang', '1st message', 'Sent connect'),
    sev('A2', '2026-11-08T09:00:00+07:00', 'hoang', 'In reply', '', 'create'), /* create đặt thẳng vào trạng thái giữa */
    sev('A2', '2026-11-08T10:00:00+07:00', '', 'Not yet have demand', 'In reply'), /* lối ra; byMemberId rỗng -> fallback owner hoang */
  ];
  const r = conv(D, leads, events);
  assert.equal(convCellOf(r, 'yen', 'sent_connect').count, 1); assert.deepEqual(J(convCellOf(r, 'yen', 'sent_connect').leadIds), ['A1']);
  assert.equal(convCellOf(r, 'hoang', 'first_message').count, 1); assert.deepEqual(J(convCellOf(r, 'hoang', 'first_message').leadIds), ['A1'], 'cột first_message của A1 gán Hoàng — người đầu tiên đưa vào trạng thái đó, khác người của cột sent_connect');
  assert.equal(convCellOf(r, 'hoang', 'in_reply').count, 1, 'create đặt thẳng vào In reply vẫn đếm');
  assert.equal(convCellOf(r, 'hoang', 'not_yet_have_demand').count, 1, 'lối ra đếm ở cột cuối nhóm Lead, fallback owner khi sự kiện thiếu byMemberId');
  const tot = k => r.columnTotals.lead.find(c => c.key === k).count;
  assert.equal(tot('sent_connect'), 1); assert.equal(tot('first_message'), 1); assert.equal(tot('in_reply'), 1); assert.equal(tot('not_yet_have_demand'), 1);
  assert.equal(tot('converted'), 0); assert.equal(r.total, 0, 'không lead nào converted trong dữ kiện này');
  /* Bất biến: tổng từng cột == tổng ô cột đó qua mọi hàng. */
  for (const col of r.leadColumns) {
    const sumRows = r.rows.reduce((a, row) => a + row.leadCells.find(c => c.key === col.key).count, 0);
    assert.equal(r.columnTotals.lead.find(c => c.key === col.key).count, sumRows, 'bất biến cột lead ' + col.key);
  }
});

test('trạng thái lead: biên cửa sổ ICT cho sự kiện lead (preset + Tuỳ chỉnh chặn trên) + lọc Người + lọc Mảng (đầu vào đã lọc)', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'B1', ownerId: 'yen', line: 'ai' }, { id: 'B2', ownerId: 'yen', line: 'metaverse' }];
  const events = [
    ev('B1', '2026-11-05T16:59:59.000Z', 'yen', 'Sent connect', 'Mới'), /* 23:59:59 ICT 05/11 — ngoài kỳ 7 */
    ev('B1', '2026-11-05T17:00:00.000Z', 'yen', 'Sent connect', 'Mới'), /* 00:00 ICT 06/11 — trong kỳ */
    ev('B2', '2026-11-08T09:00:00+07:00', 'yen', 'Sent connect', 'Mới'),
  ];
  const r = conv(D, leads, events);
  assert.equal(r.columnTotals.lead.find(c => c.key === 'sent_connect').count, 2);
  const rng = conv(D, leads, events, null, { from: '2026-11-06', to: '2026-11-07' });
  assert.equal(rng.columnTotals.lead.find(c => c.key === 'sent_connect').count, 1, 'Tuỳ chỉnh chặn trên: sự kiện 08/11 của B2 bị loại');
  assert.deepEqual(J(rng.columnTotals.lead.find(c => c.key === 'sent_connect').leadIds), ['B1']);
  const scoped = conv(D, leads, events, 7, null, 'hoang');
  assert.equal(scoped.columnTotals.lead.find(c => c.key === 'sent_connect').count, 0, 'lọc Người Hoàng: mọi ô đều gán Yến nên rỗng');
  const aiOnly = conv(D, leads.filter(l => l.line === 'ai'), events);
  assert.equal(aiOnly.columnTotals.lead.find(c => c.key === 'sent_connect').count, 1, 'lọc Mảng ai (đầu vào đã qua dashFilterByLine): chỉ B1');
});

/* ---------- Deal: taxonomy + đếm stage ---------- */

const dev = (dealId, at, byMemberId, to, from, action) => ({ entityType: 'deal', entityId: dealId, at, byMemberId: byMemberId || '', action: action || 'update', changes: [{ field: 'stage', label: 'Giai đoạn', from: from || '', to }] });
const CDEALS = [
  { id: 'D1', owner: 'yen', line: 'ai' },
  { id: 'D2', owner: 'hoang', line: 'game_studio' },
  { id: 'D3', line: 'publishing' }, /* không owner */
  { id: 'D4', owner: 'yen', line: 'metaverse' },
];
const convD = (D, deals, dealEvents, days, range, scope, leads, leadEvents) => D.dashConversionsByStatusInPeriod(leads || [], deals, [...(leadEvents || []), ...(dealEvents || [])], days === undefined ? 7 : days, NOW, range || null, scope || '');
const dealCellOf = (r, rowId, key) => { const row = r.rows.find(x => x.id === rowId); return row ? row.dealCells.find(x => x.key === key) : undefined; };

test('deal taxonomy: dashDealStageKeyFromAudit map nhãn -> key (ưu tiên line của deal) + nhận thẳng key + nhãn lạ -> null; dashDealStageChangesOf chỉ lấy field stage', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(D.dashDealStageKeyFromAudit('Ký hợp đồng — Won'), 'won');
  assert.equal(D.dashDealStageKeyFromAudit('Thua — Lost'), 'lost');
  assert.equal(D.dashDealStageKeyFromAudit('Từ chối — Lost', 'publishing'), 'lost');
  assert.equal(D.dashDealStageKeyFromAudit('Term sheet / Đàm phán'), 'term');
  assert.equal(D.dashDealStageKeyFromAudit('Đánh giá build', 'publishing'), 'build_eval');
  assert.equal(D.dashDealStageKeyFromAudit('Demo / Prototype', 'metaverse'), 'proto');
  assert.equal(D.dashDealStageKeyFromAudit('quote'), 'quote');
  assert.equal(D.dashDealStageKeyFromAudit('nhãn lạ'), null);
  const ch = D.dashDealStageChangesOf({ at: '2026-11-08T09:00:00+07:00', changes: [{ field: 'stage', from: 'Tiếp cận', to: 'Báo giá / Đàm phán' }, { field: 'title', from: 'a', to: 'b' }] }, { line: 'ai' });
  assert.deepEqual(J(ch), [{ fromKey: 'prospect', toKey: 'quote', at: '2026-11-08T09:00:00+07:00' }]);
});

test('deal taxonomy: cột Deal = HỢP 19 stage của 4 pipeline, sắp theo vòng đời (xác suất tăng dần), won áp cuối, lost cuối cùng', () => {
  const D = loadShared().window.SavaDash;
  const cols = D.dashDealStageColumns();
  assert.deepEqual(J(cols.map(c => c.key)), ['target', 'sourcing', 'prospect', 'contacted', 'screening', 'discovery', 'pitched', 'build_eval', 'usecase', 'concept', 'evaluating', 'demo', 'biz_eval', 'proto', 'poc', 'term', 'quote', 'won', 'lost']);
  assert.equal(cols.find(c => c.key === 'lost').label, 'Thua — Lost');
  assert.equal(cols.find(c => c.key === 'won').label, 'Ký hợp đồng — Won');
});

test('deal: tạo ở stage giữa; chuyển Won trong kỳ; chuyển Lost NGOÀI cửa sổ -> không đếm; fallback owner deal; không owner + không by -> Không rõ', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    dev('D1', '2026-11-07T09:00:00+07:00', 'yen', 'POC / Pilot', '', 'create'), /* tạo thẳng ở stage giữa */
    dev('D1', '2026-11-09T09:00:00+07:00', 'hoang', 'Ký hợp đồng — Won', 'POC / Pilot'),
    dev('D1', '2026-11-10T09:00:00+07:00', 'yen', 'Ký hợp đồng — Won', 'POC / Pilot'), /* vào lại Won: vẫn 1, gán Hoàng (lần đầu) */
    dev('D2', '2026-11-01T09:00:00+07:00', 'hoang', 'Thua — Lost', 'Đã pitch'), /* ngoài kỳ 7 -> không đếm */
    dev('D2', '2026-11-08T09:00:00+07:00', '', 'Đã pitch', 'Đã liên hệ'), /* by rỗng -> fallback owner hoang */
    dev('D3', '2026-11-08T09:00:00+07:00', '', 'Từ chối — Lost', 'Sơ tuyển'), /* không by, không owner -> Không rõ; nhãn Lost riêng của publishing */
    dev('D4', '2026-11-20T09:00:00+07:00', 'yen', 'Báo giá / Đàm phán', 'Demo / Prototype'), /* sau now: preset không chặn trên -> đếm */
  ];
  const r = convD(D, CDEALS, events);
  assert.equal(dealCellOf(r, 'yen', 'poc').count, 1); assert.deepEqual(J(dealCellOf(r, 'yen', 'poc').dealIds), ['D1']);
  assert.equal(dealCellOf(r, 'hoang', 'won').count, 1, 'Won gán người của lần vào Won ĐẦU TIÊN (Hoàng), không phải lần vào lại của Yến');
  assert.equal(dealCellOf(r, 'hoang', 'pitched').count, 1, 'fallback owner của deal khi sự kiện thiếu byMemberId');
  assert.equal(dealCellOf(r, '__none__', 'lost').count, 1); assert.deepEqual(J(dealCellOf(r, '__none__', 'lost').dealIds), ['D3']);
  assert.equal(r.columnTotals.deal.find(c => c.key === 'lost').count, 1, 'Lost ngoài cửa sổ của D2 không đếm — chỉ D3');
  assert.equal(r.columnTotals.deal.find(c => c.key === 'quote').count, 1, 'preset không chặn trên cho cả sự kiện deal');
  for (const col of r.dealColumns) {
    const sumRows = r.rows.reduce((a, row) => a + row.dealCells.find(c => c.key === col.key).count, 0);
    assert.equal(r.columnTotals.deal.find(c => c.key === col.key).count, sumRows, 'bất biến cột deal ' + col.key);
  }
});

test('deal: biên Tuỳ chỉnh chặn trên + lọc Người + lọc Mảng cho nhóm cột Deal', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    dev('D1', '2026-11-08T23:59:59+07:00', 'yen', 'Ký hợp đồng — Won', 'POC / Pilot'),
    dev('D4', '2026-11-09T00:00:00+07:00', 'yen', 'Ký hợp đồng — Won', 'Báo giá / Đàm phán'),
  ];
  const rng = convD(D, CDEALS, events, null, { from: '2026-11-06', to: '2026-11-08' });
  assert.equal(rng.columnTotals.deal.find(c => c.key === 'won').count, 1, 'Tuỳ chỉnh chặn trên áp cho cả sự kiện deal');
  assert.deepEqual(J(rng.columnTotals.deal.find(c => c.key === 'won').dealIds), ['D1']);
  const scoped = convD(D, CDEALS, events, 7, null, 'hoang');
  assert.equal(scoped.columnTotals.deal.find(c => c.key === 'won').count, 0, 'lọc Người Hoàng: ô Won gán Yến nên rỗng');
  const aiOnly = convD(D, CDEALS.filter(d => d.line === 'ai'), events);
  assert.equal(aiOnly.columnTotals.deal.find(c => c.key === 'won').count, 1, 'lọc Mảng ai (deal theo d.line): chỉ D1');
  assert.deepEqual(J(aiOnly.columnTotals.deal.find(c => c.key === 'won').dealIds), ['D1']);
});

/* ---------- Harness đường nạp: phân trang qua supabase-data.js ---------- */

const A = require('../supabase-adapter.js');
function makeAuditClient(rows, opts = {}) {
  const selects = [];
  function exec(b) {
    let out = rows.slice();
    if (b.eqF) out = out.filter(r => String(r[b.eqF.col]) === String(b.eqF.val));
    if (b.inF) out = out.filter(r => b.inF.values.map(String).includes(String(r[b.inF.col])));
    if (b.gteF) out = out.filter(r => String(r[b.gteF.col]) >= String(b.gteF.val));
    if (b.ltF) out = out.filter(r => String(r[b.ltF.col]) < String(b.ltF.val));
    if (b.orderCol) out.sort((x, y) => (String(x[b.orderCol] ?? '') < String(y[b.orderCol] ?? '') ? -1 : 1));
    if (opts.failAtRange !== undefined && b.rangeFrom === opts.failAtRange) return { data: null, error: { message: 'boom-trang-2' } };
    if (b.rangeFrom !== null && b.rangeFrom !== undefined) out = out.slice(b.rangeFrom, b.rangeTo + 1);
    else out = out.slice(0, 1000);
    selects.push({ from: b.rangeFrom ?? null, n: out.length });
    return { data: out.map(r => ({ ...r })), error: null };
  }
  function builder(table) {
    const b = { table, rangeFrom: null, rangeTo: null };
    b.select = () => b;
    b.eq = (col, val) => { b.eqF = { col, val }; return b; };
    b.in = (col, values) => { b.inF = { col, values }; return b; };
    b.gte = (col, val) => { b.gteF = { col, val }; return b; };
    b.lt = (col, val) => { b.ltF = { col, val }; return b; };
    b.order = col => { b.orderCol = col; return b; };
    b.range = (from, to) => { b.rangeFrom = from; b.rangeTo = to; return b; };
    b.limit = () => b;
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _selects: selects };
}
function makeEl2() { return { style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }
async function setupData(rows, opts = {}) {
  const client = makeAuditClient(rows, opts);
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const sandbox = { console, setTimeout, clearTimeout, structuredClone, localStorage, document: { getElementById: () => null, createElement: () => makeEl2(), body: { appendChild() {} } } };
  sandbox.window = sandbox;
  sandbox.window.SavaAdapter = A;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-data.js'), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, 'bd');
  return { client, D };
}

test('nạp: >1.000 dòng trong cửa sổ -> phân trang lấy đủ 2.500 sự kiện (chỉ còn 1 đường cửa sổ, không còn earliest)', async () => {
  const rows = [];
  for (let i = 0; i < 2500; i++) rows.push({ entity_type: 'lead', entity_id: 'w' + i, at: new Date(Date.UTC(2026, 10, 10) + i * 1000).toISOString(), by_member_id: 'yen', action: 'update', changes: [{ field: 'status', from: 'Đã liên hệ', to: 'Đã chuyển đổi' }] });
  const { client, D } = await setupData(rows);
  const res = await D.listLeadConversionEvents({ gte: '2026-11-01T00:00:00.000Z', lt: '2026-12-01T00:00:00.000Z' });
  assert.equal(res.windowEvents.length, 2500, 'phân trang phải lấy đủ 2.500 dòng (trần 1.000/trang)');
  assert.deepEqual(J(client._selects.filter(s => s.from !== null).map(s => s.from)), [0, 1000, 2000], 'đúng 3 trang cửa sổ, không còn select earliest riêng');
  assert.equal(res.earliestEvents, undefined, 'đường earliest của phễu sự kiện cũ đã gỡ');
  const alias = await D.listLeadFunnelEvents({ gte: '2026-11-01T00:00:00.000Z', lt: '2026-12-01T00:00:00.000Z' });
  assert.equal(alias.windowEvents.length, 2500, 'bí danh listLeadFunnelEvents vẫn trỏ cùng đường nạp');
});

test('nạp: lỗi ở trang 2 -> listLeadConversionEvents NÉM lỗi (không trả dữ liệu dở)', async () => {
  const rows = [];
  for (let i = 0; i < 1500; i++) rows.push({ entity_type: 'lead', entity_id: 'w' + i, at: new Date(Date.UTC(2026, 10, 10) + i * 1000).toISOString(), by_member_id: 'yen', action: 'update', changes: [] });
  const { D } = await setupData(rows, { failAtRange: 1000 });
  await assert.rejects(() => D.listLeadConversionEvents({ gte: '2026-11-01T00:00:00.000Z', lt: null }), /boom-trang-2/);
});

/* ---------- Harness UI: phễu bất biến theo kỳ + khối chuyển đổi ---------- */

function loadIndex(stubImpl) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }, { id: 'hoang', name: 'Hoàng Daden', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'C1', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' }],
    leads: [
      { id: 'LA', company: 'c1', line: 'ai', status: 'contacted', ownerId: 'yen', name: 'Lead A', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
      { id: 'LB', company: 'c1', line: 'ai', status: 'new', ownerId: 'hoang', name: 'Lead B', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
      { id: 'LC', company: 'c1', line: 'ai', status: 'not_yet_have_demand', name: 'Lead C', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    ],
    deals: [], tasks: [], activities: [], games: [], events: [],
  };
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
  ctx.window.SavaData = { listLeadConversionEvents: stubImpl, listLeadFunnelEvents: stubImpl };
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
async function settle(h) { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); h.run('render()'); }
const idsOf = run => J(run('filteredLeads().map(l => l.id)'));
const funnelTotalOf = html => { const m = /Tổng lead đưa vào — (\d+) lead/.exec(html); return m ? Number(m[1]) : null; };

test('UI phễu: bất biến theo Kỳ — 7/30/90/Tất cả/Tuỳ chỉnh cùng một số ở cả chi tiết; đổi Người thì đổi đúng', async () => {
  const h = loadIndex(async () => ({ windowEvents: [] }));
  h.run("curView = 'dash'; dashboardMode = 'overview'; render()");
  await settle(h);
  const seen = [];
  for (const p of ['7', '30', '90', 'all']) { h.run(`setDashPeriod('${p}')`); seen.push(funnelTotalOf(h.getEl('view').innerHTML)); }
  h.run("setDashPeriod('custom')"); seen.push(funnelTotalOf(h.getEl('view').innerHTML));
  assert.deepEqual(seen, [2, 2, 2, 2, 2], 'N=2 (LA contacted + LB new; LC ở lối ra) ở mọi kỳ — phễu không theo kỳ');
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Toàn bộ lead theo trạng thái hiện tại · không theo kỳ'), 'bề mặt executive ghi nhãn mới');
  assert.ok(html.includes('Toàn bộ · theo trạng thái hiện tại'), 'bề mặt chi tiết ghi nhãn mới (huy hiệu)');
  assert.ok(!html.includes('Theo lần chuyển stage'), 'không còn nhãn phễu theo sự kiện ở bất kỳ bề mặt nào');
  h.run("setDashScope('yen')");
  assert.equal(funnelTotalOf(h.getEl('view').innerHTML), 1, 'phạm vi Yến: chỉ LA');
  h.run("setDashScope(''); setDashLine('metaverse')");
  assert.equal(funnelTotalOf(h.getEl('view').innerHTML), 0, 'phạm vi mảng metaverse: không lead nào');
  h.run("setDashLine('')");
});

test('UI phễu: click-through mở đúng tập đã đếm + chip không nhắc kỳ; gỡ chip khôi phục', async () => {
  const h = loadIndex(async () => ({ windowEvents: [] }));
  h.run("curView = 'dash'; render()");
  await settle(h);
  h.run("dashOpenLeadFunnelStep('contacted')");
  assert.equal(h.run('curView'), 'leads');
  assert.deepEqual(idsOf(h.run), ['LA'], 'dòng contacted = lead có trạng thái >= contacted: chỉ LA');
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Đang xem tập đã đếm:') && html.includes('Phễu Lead — Đã liên hệ · toàn bộ theo trạng thái hiện tại'), 'chip ghi tập từ phễu, KHÔNG nhắc kỳ');
  h.run('clearLeadFunnelIds()');
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB', 'LC']);
  h.run("setView('dash'); render(); dashOpenLeadFunnelStep('')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB'], 'dòng mốc = totalLeadIds');
  h.run("setView('dash'); render(); dashOpenLeadFunnelStep('__dropped__')");
  assert.deepEqual(idsOf(h.run), ['LC'], 'dòng lối ra = lead đang ở lối ra');
});

test('UI chuyển đổi: khối hiện bảng theo trạng thái (chỉ số đếm, không %), click-through ô Lead đúng tập + chip ghi khối/BD/trạng thái/kỳ; cache thu hẹp không nạp lại, mở rộng nạp lại', async () => {
  let calls = 0;
  const todayISO = new Date().toISOString();
  const stub = async () => {
    calls++;
    return { windowEvents: [
      ev('LA', todayISO, 'yen'),
      ev('LA', new Date(Date.now() + 60000).toISOString(), 'hoang'), /* lần 2 cùng kỳ: không đổi người gán (lần đầu = Yến), không đếm thêm */
      ev('LB', todayISO, ''), /* byMemberId rỗng -> fallback owner hoang */
      ev('LC', todayISO, ''), /* rỗng + không owner -> Không rõ */
    ] };
  };
  const h = loadIndex(stub);
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  assert.equal(calls, 1, 'nạp lần đầu khi mở tab Báo cáo hoạt động');
  const html = h.getEl('view').innerHTML;
  const seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('Đã chuyển đổi trong kỳ: <b>3</b> lead'), 'dòng meta: cột converted = 3 lead phân biệt (neo tổng cũ)');
  assert.ok(seg.includes('Yến') && seg.includes('Hoàng Daden') && seg.includes('Không rõ'), 'đủ 3 dòng gán: Yến / Hoàng (fallback owner) / Không rõ');
  /* Đợt biểu đồ 13/11/2026: % CHỈ được phép ở legend của donut (tỉ
     trọng lượt vào trạng thái); bảng + chart cột vẫn tuyệt đối không %. */
  const segNoDonut = seg.slice(0, seg.indexOf('ex-conversion-donut')) + seg.slice(seg.indexOf('ex-conversion-bars'));
  assert.ok(!segNoDonut.includes('%'), 'ngoài donut, khối chuyển đổi TUYỆT ĐỐI không có % ở bất kỳ dạng nào');
  assert.ok(seg.includes('Nhật ký hệ thống đầy đủ từ 31-10-2026'), 'chú thích nguồn + mốc nhật ký đầy đủ');
  assert.ok(seg.includes('không có sự kiện chuyển trạng thái thì không được đếm'), 'chú thích thao tác ngoài app không có sự kiện thì không đếm');
  assert.ok(seg.includes('một lead/deal có thể xuất hiện ở nhiều cột'), 'phụ đề nói rõ một lead/deal ở nhiều cột');
  /* Thu hẹp kỳ 30 -> 7: cache phủ -> không nạp lại. Mở rộng 7 -> 90: nạp lại. */
  h.run("setDashPeriod('7')");
  assert.equal(calls, 1, 'thu hẹp kỳ dùng lại cache');
  h.run("setDashPeriod('90')");
  await settle(h);
  assert.equal(calls, 2, 'mở rộng kỳ nạp lại');
  h.run("setDashPeriod('30')");
  /* Click-through ô Lead converted từng dòng + tổng cột. */
  h.run("dashOpenLeadConversionCell('yen','converted')");
  assert.deepEqual(idsOf(h.run), ['LA'], 'ô Yến × Đã chuyển đổi = chỉ LA');
  let v = h.getEl('view').innerHTML;
  assert.ok(v.includes('Chuyển đổi trong kỳ — Yến · Đã chuyển đổi · kỳ 30 ngày'), 'chip ghi khối + BD + trạng thái + kỳ');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionCell('__none__','converted')");
  assert.deepEqual(idsOf(h.run), ['LC'], 'ô Không rõ × Đã chuyển đổi = chỉ LC');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionCell('','converted')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB', 'LC'], 'ô tổng cột Đã chuyển đổi = mọi lead đã đếm ở cột đó');
  assert.ok(h.getEl('view').innerHTML.includes('Chuyển đổi trong kỳ — Tất cả BD · Đã chuyển đổi · kỳ 30 ngày'), 'chip ô tổng cột ghi Tất cả BD + trạng thái + kỳ');
});

test('UI chuyển đổi × trạng thái: 2 nhóm cột Lead/Deal có tiêu đề nhóm; cột mảng + Chưa rõ mảng biến mất; không cột tổng-hàng; ô 0 tĩnh mờ; ô Deal bấm mở Pipeline mảng tương ứng (gần đúng)', async () => {
  const todayISO = new Date().toISOString();
  const stub = async () => ({ windowEvents: [
    ev('LA', todayISO, 'yen'),
    ev('LB', todayISO, ''), /* fallback owner hoang */
    { entityType: 'deal', entityId: 'DA', at: todayISO, byMemberId: 'yen', action: 'update', changes: [{ field: 'stage', from: 'POC / Pilot', to: 'Ký hợp đồng — Won' }] },
  ] });
  const h = loadIndex(stub);
  h.run("S.deals.push({ id: 'DA', company: 'c1', line: 'ai', stage: 'won', owner: 'yen', title: 'Deal A' })");
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  const seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('<th colspan="11">Lead</th>'), 'tiêu đề nhóm Lead phủ 11 cột (10 đường chính + lối ra)');
  assert.ok(seg.includes('<th colspan="19">Sau chuyển đổi (Deal)</th>'), 'tiêu đề nhóm Deal phủ 19 cột (hợp stage 4 mảng)');
  for (const col of ['Mới', 'Sent connect', 'Đã chuyển đổi', 'Not yet have demand', 'Danh sách mục tiêu', 'Ký hợp đồng — Won', 'Thua — Lost']) assert.ok(seg.includes('<th>' + col + '</th>'), 'có cột ' + col);
  assert.ok(!seg.includes('Chưa rõ mảng'), 'cột Chưa rõ mảng của ma trận mảng cũ đã biến mất');
  for (const col of ['Game Studio', 'Publishing', 'Metaverse']) assert.ok(!seg.includes('<th>' + col + '</th>'), 'cột mảng ' + col + ' đã biến mất khỏi thead');
  const thead = seg.slice(seg.indexOf('<thead>'), seg.indexOf('</thead>'));
  assert.ok(!thead.includes('Tổng'), 'KHÔNG có cột tổng-hàng trong thead');
  assert.ok(seg.includes("dashOpenLeadConversionCell('yen','converted')"), 'ô Yến × Đã chuyển đổi > 0 là nút bấm-xuyên Lead theo ô');
  assert.ok(seg.includes("dashOpenLeadConversionCell('','converted')"), 'ô tfoot cột Đã chuyển đổi > 0 là nút bấm-xuyên tổng cột Lead');
  assert.ok(seg.includes("dashOpenDealConversionCell('yen','won')"), 'ô Yến × Won > 0 là nút mở Pipeline (Deal)');
  assert.ok(seg.includes("dashOpenDealConversionCell('','won')"), 'ô tfoot cột Won > 0 là nút mở Pipeline (Deal)');
  assert.ok(!seg.includes("dashOpenLeadConversionCell('yen','new')"), 'ô Yến × Mới = 0 KHÔNG phải nút');
  assert.ok(seg.includes('ex-cell-zero'), 'ô 0 hiện tĩnh với class mờ ex-cell-zero');
  const segNoDonut2 = seg.slice(0, seg.indexOf('ex-conversion-donut')) + seg.slice(seg.indexOf('ex-conversion-bars'));
  assert.ok(!segNoDonut2.includes('%'), 'bảng ma trận trạng thái + chart cột vẫn tuyệt đối không có % (% chỉ ở legend donut)');
  assert.ok(seg.includes('hai đối tượng khác nhau'), 'chú thích nói rõ hai nhóm cột đếm hai đối tượng khác nhau');
  assert.ok(seg.includes('đích gần đúng'), 'chú thích khai thẳng bấm ô Deal là đích gần đúng');
  /* Bấm ô Lead: đúng tập. */
  h.run("dashOpenLeadConversionCell('yen','converted')");
  assert.deepEqual(idsOf(h.run), ['LA'], 'ô Yến × Đã chuyển đổi = chỉ LA');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  /* Bấm ô Deal: mở view Pipeline ở mảng của deal trong ô (ai) — đích gần đúng. */
  h.run("dashOpenDealConversionCell('yen','won')");
  assert.equal(h.run('curView'), 'board', 'ô Deal mở view Pipeline');
  assert.equal(h.run('curLine'), 'ai', 'Pipeline mở ở mảng tương ứng của deal trong ô (ai)');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  /* Ô 0: không làm gì. */
  h.run("dashOpenLeadConversionCell('yen','new')");
  assert.equal(h.run('curView'), 'dash', 'ô Lead 0 (tập rỗng) -> không làm gì, vẫn ở dashboard');
  h.run("dashOpenDealConversionCell('yen','lost')");
  assert.equal(h.run('curView'), 'dash', 'ô Deal 0 (tập rỗng) -> không làm gì, vẫn ở dashboard');
});

test('UI chuyển đổi × trạng thái: lead line lạ vẫn đếm theo trạng thái (không còn cột Chưa rõ mảng)', async () => {
  const todayISO = new Date().toISOString();
  const stub = async () => ({ windowEvents: [
    ev('LA', todayISO, 'yen'),
    ev('LD', todayISO, 'yen'), /* lead line lạ — bản cũ vào cột __unknown__; bản mới đếm theo trạng thái như mọi lead (dashLine đang Tất cả mảng) */
  ] });
  const h = loadIndex(stub);
  h.run("S.leads.push({ id: 'LD', company: 'c1', line: 'la-khong-chuan', status: 'converted', ownerId: 'yen', name: 'Lead D', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date().toISOString() })");
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  const seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(!seg.includes('Chưa rõ mảng'), 'không còn cột Chưa rõ mảng');
  const segNoDonut3 = seg.slice(0, seg.indexOf('ex-conversion-donut')) + seg.slice(seg.indexOf('ex-conversion-bars'));
  assert.ok(!segNoDonut3.includes('%'), 'khối vẫn không có % ngoài legend donut');
  h.run("dashOpenLeadConversionCell('yen','converted')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LD'], 'ô Yến × Đã chuyển đổi gồm cả lead line lạ');
});

test('UI chuyển đổi: đang nạp -> hiện đang tải; nạp lỗi -> hiện lỗi + nút thử lại, KHÔNG số 0 giả; phễu ở Tổng quan vẫn hiện số khi nhật ký lỗi', async () => {
  const hLoad = loadIndex(() => new Promise(() => {}));
  hLoad.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  assert.ok(hLoad.getEl('view').innerHTML.includes('Đang tải nhật ký chuyển đổi'), 'đang nạp phải hiện trạng thái đang tải');
  const hErr = loadIndex(async () => { throw new Error('mất mạng giả lập'); });
  hErr.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(hErr);
  const html = hErr.getEl('view').innerHTML;
  assert.ok(html.includes('Chưa tải được nhật ký chuyển đổi'), 'nạp lỗi phải hiện lỗi rõ ràng');
  assert.ok(html.includes('retryConversionAudit()'), 'có nút thử tải lại');
  assert.ok(!html.includes('Đã chuyển đổi trong kỳ:'), 'lỗi thì không hiện dòng meta số (không số 0 giả)');
  hErr.run("dashboardMode = 'overview'; render()");
  assert.equal(funnelTotalOf(hErr.getEl('view').innerHTML), 2, 'phễu không phụ thuộc nhật ký: vẫn hiện N=2 khi nạp chuyển đổi lỗi');
});

/* ---------- Biểu đồ khối "Chuyển đổi trong kỳ" (13/11/2026, Zac chốt thêm) ----------
   Chỉ lớp trình bày từ cùng kết quả dashConversionsByStatusInPeriod:
   cột xếp chồng theo BD (màu thành viên calMemberColor, bấm khúc =
   đúng handler ô bảng, không % trong vùng chart cột) + donut 2 phần
   theo tổng LƯỢT vào trạng thái (% duy nhất của khối, kèm caption
   bắt buộc) + ca biên donut rỗng / một phần 0. */

function chartSegOf(h) {
  const html = h.getEl('view').innerHTML;
  return html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
}
function chartSvgOf(seg) {
  const start = seg.indexOf('<svg class="ex-conversion-chart"');
  const end = seg.indexOf('</svg>', start);
  return { tag: seg.slice(start, seg.indexOf('>', start) + 1), inner: seg.slice(seg.indexOf('>', start) + 1, end) };
}
async function loadChartFixture() {
  const todayISO = new Date().toISOString();
  const stub = async () => ({ windowEvents: [
    ev('LA', todayISO, 'yen', 'Đã liên hệ', 'Mới'),
    ev('LA', todayISO, 'yen'),
    ev('LB', todayISO, '', 'Sent connect', 'Mới'), /* fallback owner hoang */
    ev('LC', todayISO, ''), /* Không rõ */
    { entityType: 'deal', entityId: 'DA', at: todayISO, byMemberId: 'yen', action: 'update', changes: [{ field: 'stage', from: 'POC / Pilot', to: 'Ký hợp đồng — Won' }] },
  ] });
  const h = loadIndex(stub);
  h.run("S.deals.push({ id: 'DA', company: 'c1', line: 'ai', stage: 'won', owner: 'yen', title: 'Deal A' })");
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  return h;
}

test('UI biểu đồ chuyển đổi: donut 2 phần theo tổng lượt (Lead 4 / Deal 1 / tổng 5) + % chỉ ở legend donut + caption nguyên văn bắt buộc + màu donut khác màu thành viên', async () => {
  const h = await loadChartFixture();
  const seg = chartSegOf(h);
  assert.ok(seg.includes('ex-conversion-charts'), 'khối phải có vùng biểu đồ phía trên bảng');
  assert.ok(seg.indexOf('ex-conversion-charts') < seg.indexOf('<table'), 'biểu đồ nằm TRÊN bảng trong cùng khối');
  const donut = seg.slice(seg.indexOf('ex-conversion-donut'), seg.indexOf('ex-conversion-bars'));
  assert.ok(donut.includes('Trước chuyển đổi (Lead)') && donut.includes('Sau chuyển đổi (Deal)'), 'donut đúng 2 phần với đúng nhãn');
  assert.ok(donut.includes('<b>4</b>') && donut.includes('80%'), 'phần Lead = 4 lượt (contacted 1 + converted 2 + sent_connect 1) = 80% tổng lượt');
  assert.ok(donut.includes('<b>1</b>') && donut.includes('20%'), 'phần Deal = 1 lượt (won) = 20% tổng lượt');
  assert.ok(donut.includes('<strong>5</strong>') && donut.includes('lượt vào trạng thái'), 'tâm donut hiện tổng 5 kèm nhãn "lượt vào trạng thái"');
  assert.ok(donut.includes('Tỉ trọng tính trên tổng lượt vào trạng thái trong kỳ — không phải tỉ trọng lead, vì một lead/deal đi qua nhiều trạng thái.'), 'caption donut bắt buộc, nguyên văn');
  assert.ok(donut.includes('#6253ce') && donut.includes('#e11d48'), 'donut dùng 2 màu đã chốt #6253ce / #e11d48');
  for (const memberColor of ['#2563eb', '#059669', '#d97706', '#64748b'])
    assert.ok(!['#6253ce', '#e11d48'].includes(memberColor), 'màu donut không trùng màu thành viên ' + memberColor);
});

test('UI biểu đồ chuyển đổi: cột xếp chồng — cấu trúc cột/khúc khớp dữ kiện vào, màu khúc = calMemberColor (Không rõ = xám), tổng trên đỉnh, cột 0 ở chân, nhãn nhóm, KHÔNG % trong chart cột', async () => {
  const h = await loadChartFixture();
  const seg = chartSegOf(h);
  const { inner } = chartSvgOf(seg);
  assert.ok(!inner.includes('%'), 'vùng vẽ chart cột tuyệt đối không có ký tự %');
  assert.ok(inner.includes('Lead — trước chuyển đổi') && inner.includes('Sau chuyển đổi (Deal)'), 'có nhãn nhóm dưới trục cho 2 nhóm cột');
  assert.ok(inner.indexOf('>Mới</text>') < inner.indexOf('>Đã chuyển đổi</text>') && inner.indexOf('>Đã chuyển đổi</text>') < inner.indexOf('>Danh sách mục tiêu</text>'), 'thứ tự cột = đúng thứ tự bảng: Lead (…Đã chuyển đổi…) rồi Deal (Danh sách mục tiêu…)');
  /* Khúc có số: yen×contacted, yen×converted, yen×won, hoang×sent_connect, __none__×converted = 5 */
  assert.equal((inner.match(/ex-conversion-seg/g) || []).length, 5, 'đúng 5 khúc có count > 0');
  assert.ok(inner.includes('fill="#d97706"'), 'khúc của Yến dùng màu thành viên của Yến (#d97706 qua calMemberColor)');
  assert.ok(inner.includes('fill="' + h.run("calMemberColor('hoang')") + '"'), 'khúc của Hoàng dùng đúng calMemberColor(hoang)');
  assert.ok(inner.includes('fill="#64748b"'), 'khúc Không rõ dùng xám trung tính #64748b');
  /* Tổng cột: converted = 2 là tổng lớn nhất, ghi trên đỉnh cột */
  assert.ok(/ex-conversion-coltotal[^>]*>2<\/text>/.test(inner), 'tổng cột Đã chuyển đổi = 2 ghi trên đỉnh cột');
  /* Cột tổng 0: 30 cột − 4 cột có số (sent_connect, contacted, converted, won) = 26 số 0 ở chân cột */
  assert.equal((inner.match(/ex-conversion-colzero/g) || []).length, 26, '26 cột tổng 0 vẫn giữ vị trí + số 0 ở chân cột');
  /* Trục đứng: mốc tick là số nguyên */
  assert.ok(/>\d+<\/text>/.test(inner), 'trục đứng có mốc số nguyên');
});

test('UI biểu đồ chuyển đổi: bấm khúc = đúng handler ô bảng tương ứng + tooltip đúng mẫu lead/deal + vùng bấm phủ mọi khúc có số', async () => {
  const h = await loadChartFixture();
  const seg = chartSegOf(h);
  const { inner } = chartSvgOf(seg);
  assert.equal((inner.match(/ex-conversion-hit/g) || []).length, 5, 'mỗi khúc có số có đúng 1 vùng bấm');
  assert.ok(inner.includes(`onclick="dashOpenLeadConversionCell('yen','converted')"`), 'khúc Yến × Đã chuyển đổi bấm đúng handler ô Lead của bảng');
  assert.ok(inner.includes(`onclick="dashOpenDealConversionCell('yen','won')"`), 'khúc Yến × Won bấm đúng handler ô Deal của bảng');
  assert.ok(inner.includes(`onclick="dashOpenLeadConversionCell('__none__','converted')"`), 'khúc Không rõ bấm đúng handler với rowId __none__');
  assert.ok(inner.includes('<title>Yến · Đã chuyển đổi: 1 lead</title>'), 'tooltip nhóm Lead: "{BD} · {Trạng thái}: {n} lead"');
  assert.ok(inner.includes('<title>Yến · Ký hợp đồng — Won: 1 deal</title>'), 'tooltip nhóm Deal: "{BD} · {Trạng thái}: {n} deal"');
  /* Bấm thật qua handler dùng chung: đúng tập như ô bảng */
  h.run("dashOpenLeadConversionCell('yen','converted')");
  assert.deepEqual(idsOf(h.run), ['LA'], 'handler của khúc cho đúng tập lead của ô tương ứng');
});

test('UI biểu đồ chuyển đổi: ca biên donut — cả hai phần 0 -> vòng xám + câu trống; một phần 0 -> vòng một màu đầy + legend ghi 0', async () => {
  const hEmpty = loadIndex(async () => ({ windowEvents: [] }));
  hEmpty.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(hEmpty);
  const segE = chartSegOf(hEmpty);
  assert.ok(segE.includes('Chưa có lượt vào trạng thái nào trong kỳ'), 'cả hai phần 0: hiện câu trống bắt buộc');
  assert.ok(segE.includes('stroke="#e2e8f0"'), 'cả hai phần 0: vòng xám trống');
  assert.ok(!segE.includes('ex-conversion-seg'), 'không có khúc nào khi không có sự kiện');
  assert.equal((chartSvgOf(segE).inner.match(/ex-conversion-colzero/g) || []).length, 30, 'cả 30 cột đều là cột 0 ở ca rỗng');
  assert.ok(!segE.includes('NaN'), 'ca rỗng không sinh NaN');

  const todayISO = new Date().toISOString();
  const hLeadOnly = loadIndex(async () => ({ windowEvents: [ev('LA', todayISO, 'yen')] }));
  hLeadOnly.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(hLeadOnly);
  const segL = chartSegOf(hLeadOnly);
  const donutL = segL.slice(segL.indexOf('ex-conversion-donut'), segL.indexOf('ex-conversion-bars'));
  assert.ok(donutL.includes('Sau chuyển đổi (Deal)') && donutL.includes('<b>0</b>') && donutL.includes('0%'), 'một phần 0: legend vẫn ghi 0 lượt + 0% cho phần Deal');
  assert.ok(donutL.includes('100%'), 'phần Lead chiếm trọn 100% tổng lượt');
  assert.ok(!donutL.includes('Chưa có lượt vào trạng thái nào'), 'có lượt thì không hiện câu trống');
});

test('UI biểu đồ chuyển đổi: lỗi nạp -> không chart, không số giả; đang nạp -> không chart', async () => {
  const hErr = loadIndex(async () => { throw new Error('mất mạng giả lập'); });
  hErr.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(hErr);
  const htmlErr = hErr.getEl('view').innerHTML;
  assert.ok(htmlErr.includes('Chưa tải được nhật ký chuyển đổi'), 'lỗi vẫn hiện rõ như cũ');
  assert.ok(!htmlErr.includes('ex-conversion-charts'), 'lỗi thì không hiện biểu đồ');
  const hLoad = loadIndex(() => new Promise(() => {}));
  hLoad.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  assert.ok(hLoad.getEl('view').innerHTML.includes('Đang tải nhật ký chuyển đổi'), 'đang nạp vẫn hiện trạng thái đang tải như cũ');
  assert.ok(!hLoad.getEl('view').innerHTML.includes('ex-conversion-charts'), 'đang nạp thì không hiện biểu đồ');
});

test('tĩnh biểu đồ chuyển đổi: chỉ index.html + dashboard-design.css mang bề mặt chart; mkt.html / publishing.html không dính', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('dashboardConversionChartsHTML') && idx.includes('dashboardConversionStackedChartHTML') && idx.includes('dashboardConversionDonutHTML'), 'index.html có đủ 3 hàm dựng biểu đồ của khối');
  assert.ok(read('dashboard-design.css').includes('.ex-conversion-charts'), 'CSS của biểu đồ nằm ở dashboard-design.css');
  for (const f of ['mkt.html', 'publishing.html'])
    assert.ok(!read(f).includes('ex-conversion-charts'), f + ' không bị ảnh hưởng');
});
