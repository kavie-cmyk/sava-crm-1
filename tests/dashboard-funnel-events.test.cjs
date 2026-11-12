/* Phễu Lead THEO SỰ KIỆN (đợt 12/11/2026, Zac chốt): phễu chuyển từ
   cohort-theo-ngày-tạo sang tính theo LẦN CHUYỂN STAGE TRONG KỲ từ
   audit_log. Phủ:
   - Hàm thuần SavaDash.dashLeadFunnelByEvents: nhảy nhiều bước; lùi
     rồi tiến; tạo trong kỳ không sự kiện (sàn = trạng thái hiện tại);
     tạo trong kỳ có sự kiện lùi (sàn giữ mức khởi điểm từ `from` của
     sự kiện status sớm nhất NÓI CHUNG — kể cả khi sự kiện đó nằm
     ngoài cửa sổ); tạo trước kỳ chỉ tính sự kiện trong kỳ; sự kiện
     ngoài cửa sổ bị loại; biên cửa sổ theo ICT (trước/sau mốc 1
     giây); khoảng Tuỳ chỉnh có chặn trên; đích lối ra
     not_yet_have_demand không nâng mức + lead đang ở lối ra bị trừ
     khỏi N; nhãn legacy "Đạt chuẩn" (qualified) không nâng mức; sự
     kiện create có đích khác bước đầu vẫn tính.
   - Neo hồi quy: dashCohort / dashLeadFunnel GIỮ NGUYÊN (mọi khối
     dashboard khác + KPI "Tất cả + Toàn hệ" không đổi hành vi).
   - Harness đường nạp: client giả trả > 1.000 dòng -> phân trang lấy
     đủ qua SavaData.listLeadFunnelEvents; nạp lỗi -> UI phễu hiện
     "Chưa tải được nhật ký", KHÔNG hiện số cohort cũ; đang nạp ->
     hiện trạng thái đang tải.
   - Click-through: bấm dòng phễu mở view Lead với đúng tập ID đã đếm
     + chip gỡ được; cache: thu hẹp kỳ dùng lại cache, mở rộng kỳ mới
     nạp lại. */
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
const ev = (leadId, at, from, to, action) => ({ entityType: 'lead', entityId: leadId, at, action: action || 'update', changes: [{ field: 'status', label: 'Trạng thái', from, to }] });
const funnel = (D, leads, events, earliest, days, range) => D.dashLeadFunnelByEvents(leads, events, earliest || [], days === undefined ? 7 : days, NOW, range || null, MAIN_KEYS, 'not_yet_have_demand');
const byKey = f => Object.fromEntries(f.steps.map(s => [s.key, s]));
const J = x => JSON.parse(JSON.stringify(x)); /* mảng sinh trong vm context khác prototype — so qua JSON như các harness cũ */

/* ---------- Map nhãn audit -> key ---------- */

test('dashLeadStatusKeyFromAudit: đủ 12 nhãn (gồm Đạt chuẩn legacy) + nhận thẳng key + nhãn lạ -> null', () => {
  const D = loadShared().window.SavaDash;
  const pairs = { 'Mới': 'new', 'Sent connect': 'sent_connect', '1st message': 'first_message', '1st email': 'first_email', '1st FU': 'first_fu', 'In-response': 'in_response', 'In reply': 'in_reply', 'Discovery meeting': 'discovery_meeting', 'Đã liên hệ': 'contacted', 'Đạt chuẩn': 'qualified', 'Đã chuyển đổi': 'converted', 'Not yet have demand': 'not_yet_have_demand' };
  for (const [label, key] of Object.entries(pairs)) assert.equal(D.dashLeadStatusKeyFromAudit(label), key, label);
  assert.equal(D.dashLeadStatusKeyFromAudit('converted'), 'converted', 'giá trị đã là key cũng nhận');
  assert.equal(D.dashLeadStatusKeyFromAudit('nhãn lạ'), null);
  assert.equal(D.dashLeadStatusKeyFromAudit(''), null);
  assert.equal(D.dashLeadStatusKeyFromAudit(null), null);
});

/* ---------- Hàm thuần: các ca bắt buộc ---------- */

test('thuần: nhảy nhiều bước trong 1 lần chuyển — mức = đích', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'A', status: 'converted', createdAt: '2026-10-01T09:00:00+07:00' }];
  const events = [ev('A', '2026-11-10T09:00:00+07:00', 'Mới', 'Đã chuyển đổi')];
  const f = funnel(D, leads, events, events);
  assert.equal(f.total, 1);
  assert.equal(f.levels.A, 9);
  assert.deepEqual(J(f.steps.map(s => s.count)), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'mức 9 -> mọi bước đều đếm');
  assert.deepEqual(J(f.totalLeadIds), ['A']);
  assert.deepEqual(J(byKey(f).converted.leadIds), ['A']);
});

test('thuần: lùi rồi tiến lại — mức cao nhất trong kỳ quyết định', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'B', status: 'first_message', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [
    ev('B', '2026-11-07T09:00:00+07:00', '1st email', 'Đã liên hệ'),
    ev('B', '2026-11-08T09:00:00+07:00', 'Đã liên hệ', 'Mới'),
    ev('B', '2026-11-09T09:00:00+07:00', 'Mới', '1st message'),
  ];
  const f = funnel(D, leads, events, events);
  assert.equal(f.levels.B, 8, 'đã tới contacted trong kỳ dù sau đó lùi về new rồi lên first_message');
  assert.equal(byKey(f).contacted.count, 1);
  assert.equal(byKey(f).converted.count, 0);
});

test('thuần: tạo trong kỳ, không sự kiện nào — sàn = trạng thái hiện tại', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'C', status: 'in_reply', createdAt: '2026-11-10T09:00:00+07:00' }];
  const f = funnel(D, leads, [], []);
  assert.equal(f.total, 1);
  assert.equal(f.levels.C, 6);
  assert.equal(byKey(f).in_reply.count, 1);
  assert.equal(byKey(f).discovery_meeting.count, 0);
});

test('thuần: tạo trong kỳ, có sự kiện LÙI — sàn giữ mức khởi điểm (from của sự kiện sớm nhất)', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'D', status: 'new', createdAt: '2026-11-09T09:00:00+07:00' }];
  const events = [ev('D', '2026-11-11T09:00:00+07:00', 'In reply', 'Mới')];
  const f = funnel(D, leads, events, events);
  assert.equal(f.levels.D, 6, 'đích sự kiện chỉ là new (0) nhưng sàn khởi điểm in_reply (6) giữ mức');
  assert.equal(byKey(f).in_reply.count, 1);
});

test('thuần: sàn dùng sự kiện sớm nhất NÓI CHUNG — sự kiện sớm nhất nằm NGOÀI cửa sổ (sau kỳ Tuỳ chỉnh) vẫn cho stage khởi điểm', () => {
  const D = loadShared().window.SavaDash;
  const range = { from: '2026-11-06', to: '2026-11-08' };
  const leads = [{ id: 'D2', status: 'new', createdAt: '2026-11-07T09:00:00+07:00' }];
  /* Trong kỳ không có sự kiện nào; lần chuyển đầu tiên là 10/11 (sau
     kỳ) từ Discovery meeting -> Mới: trong kỳ lead vẫn ở Discovery
     meeting (trạng thái lúc tạo) nên mức = 7. */
  const earliest = [ev('D2', '2026-11-10T09:00:00+07:00', 'Discovery meeting', 'Mới')];
  const f = funnel(D, leads, [], earliest, null, range);
  assert.equal(f.levels.D2, 7);
  assert.equal(byKey(f).discovery_meeting.count, 1);
});

test('thuần: tạo TRƯỚC kỳ — chỉ sự kiện trong kỳ tính, không có sàn (trạng thái hiện tại cao cũng không đếm)', () => {
  const D = loadShared().window.SavaDash;
  const leads = [
    { id: 'E', status: 'new', createdAt: '2026-09-01T09:00:00+07:00' },
    { id: 'E2', status: 'converted', createdAt: '2026-09-01T09:00:00+07:00' },
  ];
  const events = [ev('E', '2026-11-08T09:00:00+07:00', 'Mới', 'Sent connect')];
  const f = funnel(D, leads, events, events);
  assert.equal(f.total, 1, 'chỉ E vào N; E2 converted hiện tại nhưng không sự kiện trong kỳ + tạo trước kỳ -> ngoài N');
  assert.equal(f.levels.E, 1);
  assert.equal(f.unknown, 0, 'E2 trạng thái chuẩn nên không tính là trạng thái lạ');
});

test('thuần: sự kiện ngoài cửa sổ bị loại + biên cửa sổ theo ICT (trước/sau mốc 1 giây)', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'F', status: 'new', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [
    /* 2026-11-05T16:59:59Z = 23:59:59 ICT 05/11 — 1 giây TRƯỚC mốc bắt đầu kỳ (00:00 ICT 06/11) */
    ev('F', '2026-11-05T16:59:59.000Z', 'Đã liên hệ', 'Đã chuyển đổi'),
    /* 2026-11-05T17:00:00Z = 00:00:00 ICT 06/11 — ĐÚNG mốc bắt đầu kỳ */
    ev('F', '2026-11-05T17:00:00.000Z', 'Mới', 'Sent connect'),
  ];
  const f = funnel(D, leads, events, events);
  assert.equal(f.levels.F, 1, 'sự kiện converted trước mốc 1 giây bị loại; chỉ Sent connect đúng mốc được tính');
  assert.equal(byKey(f).converted.count, 0);
});

test('thuần: khoảng Tuỳ chỉnh có chặn trên — sự kiện sau ngày "to" bị loại', () => {
  const D = loadShared().window.SavaDash;
  const range = { from: '2026-11-06', to: '2026-11-08' };
  const leads = [{ id: 'J', status: 'converted', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [
    ev('J', '2026-11-08T23:59:59+07:00', '1st message', '1st email'),
    ev('J', '2026-11-09T00:00:00+07:00', '1st email', 'Đã chuyển đổi'),
  ];
  const f = funnel(D, leads, events, events, null, range);
  assert.equal(f.levels.J, 3, 'sự kiện trong ngày "to" tính; sự kiện 00:00 ngày hôm sau bị chặn trên loại');
  assert.equal(byKey(f).converted.count, 0);
});

test('thuần: đích lối ra không nâng mức; lead ĐANG ở lối ra bị trừ khỏi N (dropped đếm riêng, % trên N)', () => {
  const D = loadShared().window.SavaDash;
  const leads = [
    { id: 'G', status: 'not_yet_have_demand', createdAt: '2026-09-01T09:00:00+07:00' },
    { id: 'H', status: 'contacted', createdAt: '2026-09-01T09:00:00+07:00' },
  ];
  const events = [
    ev('G', '2026-11-08T09:00:00+07:00', 'Mới', 'Not yet have demand'),
    ev('H', '2026-11-08T09:00:00+07:00', 'Mới', 'Not yet have demand'),
    ev('H', '2026-11-09T09:00:00+07:00', 'Not yet have demand', '1st message'),
  ];
  const f = funnel(D, leads, events, events);
  assert.equal(f.total, 1, 'chỉ H vào N');
  assert.equal(f.levels.H, 2, 'đích lối ra không nâng H; 1st message nâng lên 2');
  assert.equal(f.dropped.count, 1);
  assert.deepEqual(J(f.droppedLeadIds), ['G']);
  assert.equal(f.dropped.pct, 100, 'dropped.pct = dropped / N = 1/1');
});

test('thuần: nhãn legacy "Đạt chuẩn" (qualified) không nâng mức', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'I', status: 'contacted', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [ev('I', '2026-11-08T09:00:00+07:00', 'Đã liên hệ', 'Đạt chuẩn')];
  const f = funnel(D, leads, events, events);
  assert.equal(f.total, 0, 'qualified nằm ngoài đường chính nên sự kiện tới Đạt chuẩn không đưa lead vào N');
  assert.equal(f.unknown, 0);
});

test('thuần: sự kiện create có status đích khác bước đầu vẫn tính', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'K', status: 'discovery_meeting', createdAt: '2026-11-10T09:00:00+07:00' }];
  const events = [ev('K', '2026-11-10T09:00:00+07:00', '', 'Discovery meeting', 'create')];
  const f = funnel(D, leads, events, events);
  assert.equal(f.levels.K, 7);
  assert.equal(byKey(f).discovery_meeting.count, 1);
});

test('thuần: mục lô (changes batch, không có change status) bị bỏ qua; change field khác status bị bỏ qua', () => {
  const D = loadShared().window.SavaDash;
  const leads = [{ id: 'L', status: 'new', createdAt: '2026-09-01T09:00:00+07:00' }];
  const events = [
    { entityType: 'lead', entityId: 'lo-1', at: '2026-11-08T09:00:00+07:00', action: 'create', changes: [{ field: '__batch', batch: true, importBatch: 'lo-1', count: 5, ids: ['L'] }] },
    { entityType: 'lead', entityId: 'L', at: '2026-11-08T10:00:00+07:00', action: 'update', changes: [{ field: 'note', label: 'Ghi chú', from: 'a', to: 'Đã chuyển đổi' }] },
  ];
  const f = funnel(D, leads, events, events);
  assert.equal(f.total, 0, 'không có change status thật -> không mức nào được tính');
});

/* ---------- Neo hồi quy: dashCohort + dashLeadFunnel giữ nguyên ---------- */

test('neo hồi quy: dashCohort(null) trả nguyên tập + dashLeadFunnel giữ nguyên hành vi cũ (KPI/Tất cả + Toàn hệ không đổi)', () => {
  const D = loadShared().window.SavaDash;
  const list = [{ createdAt: '2026-01-01T00:00:00+07:00' }, {}, { createdAt: '2026-11-01T00:00:00+07:00' }];
  assert.equal(D.dashCohort(list, null, NOW).length, 3, 'dashCohort kỳ Tất cả trả nguyên tập kể cả bản ghi thiếu createdAt');
  assert.equal(D.dashCountNew(list, null, NOW).count, 2);
  const f = D.dashLeadFunnel([{ status: 'new' }, { status: 'converted' }, { status: 'not_yet_have_demand' }], MAIN_KEYS, 'not_yet_have_demand');
  assert.equal(f.total, 2); assert.equal(f.dropped.count, 1); assert.equal(f.summary.converted, 1);
  const html = read('index.html');
  assert.ok(html.includes('D.dashCohort(lineScoped.companies, dashPeriodDays, now, range)') && html.includes('D.dashCohort(lineScoped.leads, dashPeriodDays, now, range)'), 'KPI/cohort các khối khác vẫn qua dashCohort như cũ');
  assert.ok(html.includes('D.dashLeadFunnelByEvents(lineScoped.leads'), 'chỉ phễu đi đường sự kiện riêng');
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
    else out = out.slice(0, 1000); /* trần PostgREST khi không phân trang */
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

test('nạp: >1.000 dòng trong cửa sổ -> phân trang lấy đủ 2.500 sự kiện + earliest theo id', async () => {
  const rows = [];
  for (let i = 0; i < 2500; i++) rows.push({ entity_type: 'lead', entity_id: 'w' + i, at: new Date(Date.UTC(2026, 10, 10) + i * 1000).toISOString(), by_member_id: 'yen', action: 'update', changes: [{ field: 'status', from: 'Mới', to: 'Sent connect' }] });
  rows.push({ entity_type: 'lead', entity_id: 'l1', at: '2026-10-01T00:00:00.000Z', by_member_id: 'yen', action: 'create', changes: [{ field: 'status', from: '', to: 'Mới' }] });
  rows.push({ entity_type: 'lead', entity_id: 'l2', at: '2026-10-02T00:00:00.000Z', by_member_id: 'yen', action: 'update', changes: [{ field: 'status', from: 'Mới', to: '1st email' }] });
  const { client, D } = await setupData(rows);
  const res = await D.listLeadFunnelEvents({ gte: '2026-11-01T00:00:00.000Z', lt: '2026-12-01T00:00:00.000Z', earliestForIds: ['l1', 'l2'] });
  assert.equal(res.windowEvents.length, 2500, 'phân trang phải lấy đủ 2.500 dòng (trần 1.000/trang)');
  assert.equal(res.windowEvents[0].entityId, 'w0');
  assert.equal(res.windowEvents[2499].entityId, 'w2499');
  assert.deepEqual(J(client._selects.filter(s => s.from !== null).map(s => s.from)), [0, 1000, 2000, 0], '3 trang cửa sổ (0/1000/2000) + 1 select earliest');
  assert.equal(res.earliestEvents.length, 2, 'earliest chỉ gồm 2 lead được yêu cầu, mọi thời gian (10/2026 vẫn lấy)');
  assert.equal(res.earliestEvents[0].changes[0].field, 'status');
});

test('nạp: lỗi ở trang 2 -> listLeadFunnelEvents NÉM lỗi (không trả dữ liệu dở)', async () => {
  const rows = [];
  for (let i = 0; i < 1500; i++) rows.push({ entity_type: 'lead', entity_id: 'w' + i, at: new Date(Date.UTC(2026, 10, 10) + i * 1000).toISOString(), by_member_id: 'yen', action: 'update', changes: [] });
  const { D } = await setupData(rows, { failAtRange: 1000 });
  await assert.rejects(() => D.listLeadFunnelEvents({ gte: '2026-11-01T00:00:00.000Z', lt: null, earliestForIds: [] }), /boom-trang-2/);
});

/* ---------- Harness UI: loading / lỗi / click-through / cache ---------- */

function loadIndex(stubImpl) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const s = {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'C1', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' }],
    leads: [
      { id: 'LA', company: 'c1', line: 'ai', status: 'new', ownerId: 'yen', name: 'Lead A', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
      { id: 'LB', company: 'c1', line: 'ai', status: 'new', ownerId: 'yen', name: 'Lead B', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
      { id: 'LC', company: 'c1', line: 'ai', status: 'not_yet_have_demand', ownerId: 'yen', name: 'Lead C', person: '', note: '', source: '', when: '2026-11-02', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
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
  ctx.window.SavaData = { listLeadFunnelEvents: stubImpl };
  return { ctx, getEl, run: code => vm.runInContext(code, ctx) };
}
async function settle(h) { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); h.run('render()'); }
const idsOf = run => JSON.parse(JSON.stringify(run('filteredLeads().map(l => l.id)')));

test('UI: đang nạp -> phễu hiện trạng thái đang tải, không hiện số', async () => {
  const h = loadIndex(() => new Promise(() => {})); /* không bao giờ xong */
  h.run("curView = 'dash'; render()");
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Đang tải nhật ký chuyển stage'), 'phải hiện trạng thái đang tải rõ ràng');
  assert.ok(!html.includes('Tổng lead đưa vào —'), 'đang tải thì không hiện số phễu nào');
});

test('UI: nạp THẤT BẠI -> hiện "Chưa tải được nhật ký" + nút thử lại, TUYỆT ĐỐI không hiện số cohort cũ', async () => {
  const h = loadIndex(async () => { throw new Error('mất mạng giả lập'); });
  h.run("curView = 'dash'; render()");
  await settle(h);
  const html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Chưa tải được nhật ký chuyển stage'), 'phải hiện trạng thái lỗi rõ ràng');
  assert.ok(html.includes('retryFunnelAudit()'), 'có nút thử tải lại');
  assert.ok(!html.includes('Tổng lead đưa vào —'), 'không được âm thầm hiện số cohort cũ khi nạp lỗi');
});

test('UI: click-through mở ĐÚNG tập đã đếm ở dòng phễu + chip gỡ được; cache thu hẹp không nạp lại, mở rộng mới nạp', async () => {
  let calls = 0;
  const todayISO = new Date().toISOString();
  const stub = async () => { calls++; return { windowEvents: [ev('LA', todayISO, 'Mới', 'Đã liên hệ')], earliestEvents: [] }; };
  const h = loadIndex(stub);
  h.run("curView = 'dash'; render()");
  await settle(h);
  assert.equal(calls, 1, 'nạp lần đầu cho kỳ mặc định 30 ngày');
  let html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Tổng lead đưa vào — 2 lead · 100%'), 'N=2: LA (sự kiện tới contacted) + LB (tạo trong kỳ, sàn = new); LC ở lối ra không vào N');
  /* Thu hẹp kỳ 30 -> 7: cửa sổ đã nạp phủ -> không nạp lại. */
  h.run("setDashPeriod('7')");
  assert.equal(calls, 1, 'thu hẹp kỳ dùng lại cache');
  /* Mở rộng kỳ 7 -> 90: nạp lại. */
  h.run("setDashPeriod('90')");
  await settle(h);
  assert.equal(calls, 2, 'mở rộng kỳ sang cửa sổ lớn hơn thì nạp lại');
  h.run("setDashPeriod('30')");
  /* Bấm dòng contacted: đúng tập đã đếm = chỉ LA. */
  h.run("dashOpenLeadFunnelStep('contacted')");
  assert.equal(h.run('curView'), 'leads');
  assert.deepEqual(idsOf(h.run), ['LA'], 'dòng contacted chỉ gồm LA (LB mới ở mức new)');
  html = h.getEl('view').innerHTML;
  assert.ok(html.includes('Đang xem tập từ phễu:') && html.includes('Phễu Lead — Đã liên hệ · kỳ 30 ngày'), 'chip ghi rõ tập từ phễu + kỳ');
  /* Gỡ chip -> bộ lọc thường áp lại (không còn tập ID). */
  h.run('clearLeadFunnelIds()');
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB', 'LC'], 'gỡ chip xong thấy lại mọi lead theo bộ lọc thường');
  /* Dòng mốc: cả 2 lead đã đếm. */
  h.run("setView('dash'); render()");
  h.run("dashOpenLeadFunnelStep('')");
  assert.deepEqual(idsOf(h.run).sort(), ['LA', 'LB']);
  /* Dòng lối ra: chỉ LC. */
  h.run("setView('dash'); render()");
  h.run("dashOpenLeadFunnelStep('__dropped__')");
  assert.deepEqual(idsOf(h.run), ['LC']);
});
