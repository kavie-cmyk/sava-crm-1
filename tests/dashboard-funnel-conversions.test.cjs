/* Đợt chiều 12/11/2026 (Zac chốt lại) — THAY file
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
const conv = (D, leads, events, days, range, scope) => D.dashLeadConversionsInPeriod(leads, events, days === undefined ? 7 : days, NOW, range || null, scope || '');

test('chuyển đổi: nhiều sự kiện converted trong kỳ -> đếm 1, gán người của sự kiện ĐẦU TIÊN trong kỳ', () => {
  const D = loadShared().window.SavaDash;
  const events = [
    ev('L1', '2026-11-08T09:00:00+07:00', 'hoang'),
    ev('L1', '2026-11-10T09:00:00+07:00', 'yen'),
    ev('L1', '2026-11-11T09:00:00+07:00', 'yen'),
  ];
  const r = conv(D, CLEADS, events);
  assert.equal(r.total, 1);
  assert.deepEqual(J(r.rows.map(x => ({ id: x.id, count: x.count, leadIds: x.leadIds }))), [{ id: 'hoang', count: 1, leadIds: ['L1'] }], 'sự kiện đầu tiên (08/11, Hoàng) quyết định người được gán (đầu ra cũ của rows giữ nguyên; cells kiểm ở test ma trận riêng)');
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
  const sum = r.rows.reduce((a, x) => a + x.count, 0);
  assert.equal(sum, r.total, 'tổng toàn phạm vi == tổng các dòng BD + Không rõ');
  const byId = Object.fromEntries(r.rows.map(x => [x.id, x]));
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
  assert.deepEqual(J(r.rows.map(x => ({ id: x.id, count: x.count, leadIds: x.leadIds }))), [{ id: 'yen', count: 1, leadIds: ['L1'] }]);
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

/* ---------- dashLeadConversionsInPeriod: phân loại theo mảng (BD × Mảng) ---------- */

const MLEADS = [
  { id: 'M1', ownerId: 'yen', line: 'game_studio' },
  { id: 'M2', ownerId: 'yen', line: 'publishing' },
  { id: 'M3', ownerId: 'hoang', line: 'ai' },
  { id: 'M4', ownerId: 'hoang', line: 'metaverse' },
  { id: 'M5', ownerId: 'yen', line: 'ai' },
  { id: 'M6', ownerId: 'hoang', line: 'game_studio' },
  { id: 'M7', ownerId: 'yen', line: 'la-khong-chuan' }, /* line lạ -> __unknown__ */
  { id: 'M8', ownerId: 'hoang' }, /* thiếu line -> __unknown__ */
  { id: 'M9', line: 'publishing' }, /* không owner + sự kiện không byMemberId -> __none__ */
];
const MEVENTS = [
  ev('M1', '2026-11-08T09:00:00+07:00', 'yen'),
  ev('M2', '2026-11-08T09:05:00+07:00', 'yen'),
  ev('M3', '2026-11-08T09:10:00+07:00', 'hoang'),
  ev('M4', '2026-11-08T09:15:00+07:00', 'hoang'),
  ev('M5', '2026-11-08T09:20:00+07:00', 'yen'),
  ev('M6', '2026-11-08T09:25:00+07:00', 'hoang'),
  ev('M7', '2026-11-08T09:30:00+07:00', 'yen'),
  ev('M8', '2026-11-08T09:35:00+07:00', 'hoang'),
  ev('M9', '2026-11-08T09:40:00+07:00', ''),
];
const LINE_KEYS5 = ['game_studio', 'publishing', 'ai', 'metaverse', '__unknown__'];
function assertMatrixInvariants(r, label) {
  assert.deepEqual(J(r.byLine.map(c => c.key)), LINE_KEYS5, label + ': byLine đúng 5 phần tử, đúng thứ tự cố định');
  assert.equal(r.byLine.reduce((a, c) => a + c.count, 0), r.total, label + ': total == tổng count byLine');
  const byUnion = J(r.byLine.flatMap(c => c.leadIds)).slice().sort();
  assert.deepEqual(byUnion, J(r.totalLeadIds).slice().sort(), label + ': hợp leadIds byLine == totalLeadIds');
  assert.equal(new Set(byUnion).size, byUnion.length, label + ': leadIds byLine không trùng');
  for (const row of r.rows) {
    assert.deepEqual(J(row.cells.map(c => c.key)), LINE_KEYS5, label + ': cells của ' + row.id + ' đúng 5 phần tử, đúng thứ tự');
    assert.equal(row.cells.reduce((a, c) => a + c.count, 0), row.count, label + ': count dòng ' + row.id + ' == tổng count các cells');
    const cellUnion = J(row.cells.flatMap(c => c.leadIds)).slice().sort();
    assert.deepEqual(cellUnion, J(row.leadIds).slice().sort(), label + ': hợp leadIds cells của ' + row.id + ' == leadIds của dòng');
    assert.equal(new Set(cellUnion).size, cellUnion.length, label + ': cells của ' + row.id + ' không trùng lead');
  }
  assert.equal(r.rows.reduce((a, x) => a + x.count, 0), r.total, label + ': total == tổng count các rows (bất biến cũ)');
}

test('chuyển đổi × mảng: byLine khớp tổng tay đủ 4 mảng + __unknown__ (line lạ/thiếu); cells từng BD khớp; bất biến ba chiều', () => {
  const D = loadShared().window.SavaDash;
  const r = conv(D, MLEADS, MEVENTS);
  assert.equal(r.total, 9);
  const byKey = Object.fromEntries(r.byLine.map(c => [c.key, c]));
  assert.equal(byKey.game_studio.count, 2); assert.deepEqual(J(byKey.game_studio.leadIds), ['M1', 'M6']);
  assert.equal(byKey.publishing.count, 2); assert.deepEqual(J(byKey.publishing.leadIds), ['M2', 'M9']);
  assert.equal(byKey.ai.count, 2); assert.deepEqual(J(byKey.ai.leadIds), ['M3', 'M5']);
  assert.equal(byKey.metaverse.count, 1); assert.deepEqual(J(byKey.metaverse.leadIds), ['M4']);
  assert.equal(byKey.__unknown__.count, 2); assert.deepEqual(J(byKey.__unknown__.leadIds), ['M7', 'M8']);
  const rowOf = id => r.rows.find(x => x.id === id);
  const cellOf = (row, key) => row.cells.find(c => c.key === key);
  assert.equal(rowOf('yen').count, 4);
  assert.equal(cellOf(rowOf('yen'), 'game_studio').count, 1);
  assert.equal(cellOf(rowOf('yen'), 'publishing').count, 1);
  assert.equal(cellOf(rowOf('yen'), 'ai').count, 1);
  assert.equal(cellOf(rowOf('yen'), 'metaverse').count, 0);
  assert.equal(cellOf(rowOf('yen'), '__unknown__').count, 1);
  assert.deepEqual(J(cellOf(rowOf('yen'), '__unknown__').leadIds), ['M7']);
  assert.equal(rowOf('hoang').count, 4);
  assert.equal(cellOf(rowOf('hoang'), 'game_studio').count, 1);
  assert.equal(cellOf(rowOf('hoang'), 'ai').count, 1);
  assert.equal(cellOf(rowOf('hoang'), 'metaverse').count, 1);
  assert.equal(cellOf(rowOf('hoang'), '__unknown__').count, 1);
  assert.equal(rowOf('__none__').count, 1, 'M9 gán Không rõ');
  assert.equal(cellOf(rowOf('__none__'), 'publishing').count, 1);
  assert.deepEqual(J(cellOf(rowOf('__none__'), 'publishing').leadIds), ['M9']);
  assertMatrixInvariants(r, 'toàn phạm vi');
  /* Đầu ra cũ trên cùng dữ kiện không đổi: total/rows (id/count/leadIds) như hành vi trước đợt. */
  assert.deepEqual(J(r.rows.map(x => ({ id: x.id, count: x.count, leadIds: x.leadIds }))), [
    { id: 'hoang', count: 4, leadIds: ['M3', 'M4', 'M6', 'M8'] },
    { id: 'yen', count: 4, leadIds: ['M1', 'M2', 'M5', 'M7'] },
    { id: '__none__', count: 1, leadIds: ['M9'] },
  ], 'thứ tự rows + đầu ra cũ giữ nguyên (bằng count: BD trước, Không rõ sau; hoang < yen theo localeCompare)');
});

test('chuyển đổi × mảng: scopeId = 1 BD thì byLine chỉ còn phần của BD đó và vẫn khớp ba chiều', () => {
  const D = loadShared().window.SavaDash;
  const r = conv(D, MLEADS, MEVENTS, 7, null, 'yen');
  assert.equal(r.total, 4);
  const byKey = Object.fromEntries(r.byLine.map(c => [c.key, c.count]));
  assert.deepEqual(byKey, { game_studio: 1, publishing: 1, ai: 1, metaverse: 0, __unknown__: 1 }, 'byLine trong scope Yến chỉ gồm lead gán Yến');
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].id, 'yen');
  assertMatrixInvariants(r, 'scope yen');
  const rn = conv(D, MLEADS, MEVENTS, 7, null, '__none__');
  assert.equal(rn.total, 1);
  assert.deepEqual(Object.fromEntries(rn.byLine.map(c => [c.key, c.count])), { game_studio: 0, publishing: 1, ai: 0, metaverse: 0, __unknown__: 0 });
  assertMatrixInvariants(rn, 'scope __none__');
});

test('chuyển đổi × mảng: đầu vào đã lọc sẵn 1 mảng (mô phỏng dashLine) thì cột mảng khác = 0, Tổng == cột mảng đó', () => {
  const D = loadShared().window.SavaDash;
  const aiOnly = MLEADS.filter(l => l.line === 'ai');
  const r = conv(D, aiOnly, MEVENTS);
  assert.equal(r.total, 2);
  const byKey = Object.fromEntries(r.byLine.map(c => [c.key, c.count]));
  assert.deepEqual(byKey, { game_studio: 0, publishing: 0, ai: 2, metaverse: 0, __unknown__: 0 });
  assert.equal(r.total, byKey.ai, 'Tổng == cột mảng ai');
  for (const row of r.rows) for (const c of row.cells) assert.equal(c.count, c.key === 'ai' ? c.count : 0, 'cells ngoài mảng ai đều 0');
  assertMatrixInvariants(r, 'lọc sẵn mảng ai');
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

test('UI chuyển đổi: khối hiện tổng + bảng theo BD (chỉ số đếm, không %), click-through đúng tập + chip ghi khối/kỳ/BD; cache thu hẹp không nạp lại, mở rộng nạp lại', async () => {
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
  assert.ok(seg.includes('Tổng số lead được chuyển đổi trong kỳ: <b>3</b>'), 'tổng = 3 lead phân biệt');
  assert.ok(seg.includes('Yến') && seg.includes('Hoàng Daden') && seg.includes('Không rõ'), 'đủ 3 dòng gán: Yến / Hoàng (fallback owner) / Không rõ');
  assert.ok(!seg.includes('%'), 'khối chuyển đổi TUYỆT ĐỐI không có % ở bất kỳ dạng nào');
  assert.ok(seg.includes('Nhật ký hệ thống đầy đủ từ 31-10-2026'), 'chú thích nguồn + mốc nhật ký đầy đủ');
  assert.ok(seg.includes('không có sự kiện chuyển đổi thì không được đếm'), 'chú thích lead nhập lô không có sự kiện thì không đếm');
  /* Thu hẹp kỳ 30 -> 7: cache phủ -> không nạp lại. Mở rộng 7 -> 90: nạp lại. */
  h.run("setDashPeriod('7')");
  assert.equal(calls, 1, 'thu hẹp kỳ dùng lại cache');
  h.run("setDashPeriod('90')");
  await settle(h);
  assert.equal(calls, 2, 'mở rộng kỳ nạp lại');
  h.run("setDashPeriod('30')");
  /* Click-through từng dòng + tổng. */
  h.run("dashOpenLeadConversionRow('yen')");
  assert.deepEqual(idsOf(h.run), ['LA'], 'dòng Yến = chỉ LA');
  let v = h.getEl('view').innerHTML;
  assert.ok(v.includes('Chuyển đổi trong kỳ — Yến · kỳ 30 ngày'), 'chip ghi khối + BD + kỳ');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionRow('__none__')");
  assert.deepEqual(idsOf(h.run), ['LC'], 'dòng Không rõ = chỉ LC');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionRow('')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB', 'LC'], 'số tổng = mọi lead đã đếm');
});

test('UI chuyển đổi × mảng: bảng ma trận BD × Mảng — cột Chưa rõ mảng ẩn khi tổng của nó = 0; ô 0 tĩnh mờ không phải nút; ô > 0 + tfoot bấm-xuyên đúng tập ô', async () => {
  const todayISO = new Date().toISOString();
  const stub = async () => ({ windowEvents: [
    ev('LA', todayISO, 'yen'),
    ev('LB', todayISO, ''), /* fallback owner hoang */
    ev('LC', todayISO, ''), /* Không rõ */
  ] });
  const h = loadIndex(stub);
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  const seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  for (const col of ['BD', 'Game Studio', 'Publishing', 'AI', 'Metaverse', 'Tổng']) assert.ok(seg.includes('<th>' + col + '</th>'), 'có cột ' + col);
  assert.ok(!seg.includes('Chưa rõ mảng'), 'tổng __unknown__ = 0 (mọi lead đều mảng ai) -> KHÔNG hiện cột Chưa rõ mảng');
  assert.ok(seg.includes("dashOpenLeadConversionCell('yen','ai')"), 'ô Yến × AI > 0 là nút bấm-xuyên theo ô');
  assert.ok(seg.includes("dashOpenLeadConversionCell('','ai')"), 'ô tfoot cột AI > 0 là nút bấm-xuyên tổng cột');
  assert.ok(seg.includes('<tfoot>'), 'có hàng tfoot Tổng lấy từ byLine');
  assert.ok(!seg.includes("dashOpenLeadConversionCell('yen','game_studio')"), 'ô Yến × Game Studio = 0 KHÔNG phải nút');
  assert.ok(!seg.includes("dashOpenLeadConversionCell('','game_studio')"), 'ô tfoot Game Studio = 0 KHÔNG phải nút');
  assert.ok(seg.includes('ex-cell-zero'), 'ô 0 hiện tĩnh với class mờ ex-cell-zero');
  assert.ok(!seg.includes('%'), 'khối ma trận vẫn tuyệt đối không có %');
  assert.ok(seg.includes('Mảng của mỗi lead lấy theo mảng của lead đó.'), 'chú thích có câu nguồn mảng đã thêm');
  /* Bấm-xuyên theo ô: ô thường, ô tổng cột, ô 0 không làm gì. */
  h.run("dashOpenLeadConversionCell('yen','ai')");
  assert.deepEqual(idsOf(h.run), ['LA'], 'ô Yến × AI = chỉ LA');
  assert.ok(h.getEl('view').innerHTML.includes('Chuyển đổi trong kỳ — Yến · AI · kỳ 30 ngày'), 'chip ghi khối + BD + mảng + kỳ');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionCell('','ai')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB', 'LC'], 'ô tổng cột AI = mọi lead mảng ai đã đếm');
  assert.ok(h.getEl('view').innerHTML.includes('Chuyển đổi trong kỳ — Tất cả BD · AI · kỳ 30 ngày'), 'chip ô tổng cột ghi Tất cả BD + mảng + kỳ');
  h.run("setView('dash'); dashboardMode = 'activity'; render()");
  await settle(h);
  h.run("dashOpenLeadConversionCell('yen','game_studio')");
  assert.equal(h.run('curView'), 'dash', 'ô 0 (tập rỗng) -> không làm gì, vẫn ở dashboard');
});

test('UI chuyển đổi × mảng: cột Chưa rõ mảng CHỈ xuất hiện khi tổng của nó > 0 + bấm-xuyên ô unknown đúng tập', async () => {
  const todayISO = new Date().toISOString();
  const stub = async () => ({ windowEvents: [
    ev('LA', todayISO, 'yen'),
    ev('LD', todayISO, 'yen'), /* lead line lạ -> __unknown__ */
  ] });
  const h = loadIndex(stub);
  h.run("S.leads.push({ id: 'LD', company: 'c1', line: 'la-khong-chuan', status: 'converted', ownerId: 'yen', name: 'Lead D', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date().toISOString() })");
  h.run("curView = 'dash'; dashboardMode = 'activity'; render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  const seg = html.slice(html.indexOf('Chuyển đổi trong kỳ'), html.indexOf('Xu hướng hoạt động'));
  assert.ok(seg.includes('<th>Chưa rõ mảng</th>'), 'tổng __unknown__ = 1 > 0 -> hiện cột Chưa rõ mảng');
  assert.ok(seg.includes("dashOpenLeadConversionCell('yen','__unknown__')"), 'ô Yến × Chưa rõ mảng là nút');
  assert.ok(!seg.includes('%'), 'khối vẫn không có %');
  h.run("dashOpenLeadConversionCell('yen','__unknown__')");
  assert.deepEqual(idsOf(h.run), ['LD'], 'ô Yến × Chưa rõ mảng = chỉ LD');
  assert.ok(h.getEl('view').innerHTML.includes('Chuyển đổi trong kỳ — Yến · Chưa rõ mảng · kỳ 30 ngày'), 'chip ghi tên mảng Chưa rõ mảng');
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
  assert.ok(!html.includes('Tổng số lead được chuyển đổi trong kỳ'), 'lỗi thì không hiện tổng (không số 0 giả)');
  hErr.run("dashboardMode = 'overview'; render()");
  assert.equal(funnelTotalOf(hErr.getEl('view').innerHTML), 2, 'phễu không phụ thuộc nhật ký: vẫn hiện N=2 khi nạp chuyển đổi lỗi');
});
