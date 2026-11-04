/* F1 + F2 (QA đợt chuẩn hoá dd-mm-yyyy, 4/11/2026):
   - F1: badge snapshot ở header renderMarket (Publishing, màn Thị trường)
     KHÔNG còn hard-code "15/08/2026" / "25/08/2026" — ngày lấy từ dữ liệu
     snapshot gốc thật (DATA.records của publishing-data.js) và format qua
     pubFmtDate -> "15-08-2026" / "25-08-2026".
   - F2 lớp GHI (shared.js auditValue): field ngày ghi vào audit ở dạng
     dd-mm-yyyy (datetime -> dd-mm-yyyy hh:mm); chữ tự do giữ nguyên văn;
     giá trị đã dd-mm-yyyy giữ nguyên (idempotent); sub-key ngày lồng trong
     object (contract.signed) cũng được đổi trong chuỗi tóm tắt.
   - F2 lớp HIỂN THỊ (audit.js entryHTML — dùng chung cho Lịch sử chỉnh sửa
     trong drawer + Lịch sử tổng): mục audit CŨ đã ghi ISO trên server vẫn
     render ra dd-mm-yyyy; áp cả 2 lớp không format 2 lần / không vỡ.
   - Việc nhỏ: placeholder ngày kết thúc sự kiện có gợi ý (dd-mm-yyyy). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaSys;
}
const st = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };

/* ---------- F2 lớp ghi: auditValue ---------- */

test('F2 ghi: auditValue đổi ISO -> dd-mm-yyyy cho mọi field ngày theo tên field', () => {
  const S = loadShared();
  assert.equal(S.auditValue(st, 'deal', {}, 'due', '2026-11-20'), '20-11-2026');
  assert.equal(S.auditValue(st, 'request', {}, 'due', '2026-11-20'), '20-11-2026');
  assert.equal(S.auditValue(st, 'task', {}, 'dueDate', '2026-11-25'), '25-11-2026');
  assert.equal(S.auditValue(st, 'lead', {}, 'when', '2026-10-01'), '01-10-2026');
  assert.equal(S.auditValue(st, 'activity', {}, 'when', '2026-10-05'), '05-10-2026');
  assert.equal(S.auditValue(st, 'event', {}, 'date', '2026-11-15'), '15-11-2026');
  assert.equal(S.auditValue(st, 'event', {}, 'endDate', '2026-11-17'), '17-11-2026');
  assert.equal(S.auditValue(st, 'deal', {}, 'signed', '2026-10-15'), '15-10-2026');
  /* Datetime ISO -> dd-mm-yyyy hh:mm (Asia/Ho_Chi_Minh) như fmtSysTime */
  assert.equal(S.auditValue(st, 'request', {}, 'requestedAt', '2026-10-30T00:00:00.000Z'), '30-10-2026 07:00');
  /* Idempotent: đã dd-mm-yyyy thì giữ nguyên; chữ tự do giữ nguyên văn */
  assert.equal(S.auditValue(st, 'deal', {}, 'due', '20-11-2026'), '20-11-2026');
  assert.equal(S.auditValue(st, 'task', {}, 'due', 'Hôm nay'), 'Hôm nay', 'task.due là nhãn chữ tự do — không được phá');
  assert.equal(S.auditValue(st, 'lead', {}, 'when', 'Vừa xong'), 'Vừa xong');
  /* Field KHÔNG phải ngày không bị đụng tới */
  assert.equal(S.auditValue(st, 'deal', {}, 'title', '2026-11-20'), '2026-11-20');
});

test('F2 ghi: stampCollection sinh changes dd-mm-yyyy cho thay đổi field ngày + sub-key signed lồng trong contract', () => {
  const S = loadShared();
  const before = { id: 'd1', title: 'Deal A', line: 'ai', stage: 'prospect', due: '2026-11-20', contract: { status: 'Chưa ký', no: '', signed: '', url: '' }, createdAt: '2026-10-31T10:00:00.000Z', updatedAt: '2026-10-31T10:00:00.000Z', updatedBy: 'zac' };
  const after = JSON.parse(JSON.stringify(before)); after.due = '2026-11-25'; after.contract.signed = '2026-11-01';
  const entries = S.stampCollection(st, [after], new Map([['d1', S.cloneForDiff(before)]]), 'deal', 'zac', '2026-10-31T11:00:00.000Z');
  assert.equal(entries.length, 1);
  const dueCh = entries[0].changes.find(c => c.field === 'due');
  assert.equal(dueCh.from, '20-11-2026'); assert.equal(dueCh.to, '25-11-2026');
  const ctCh = entries[0].changes.find(c => c.field === 'contract');
  assert.ok(ctCh.to.includes('signed: 01-11-2026'), 'tóm tắt contract phải ghi signed dạng dd-mm-yyyy: ' + ctCh.to);
  assert.ok(!JSON.stringify(entries[0].changes).includes('2026-11-25') && !JSON.stringify(entries[0].changes).includes('2026-11-01'), 'changes mới không được còn ISO của field ngày');
});

/* ---------- F2 lớp hiển thị: entryHTML cứu mục cũ ---------- */

test('F2 hiển thị: entryHTML render mục audit CŨ (changes ISO) ra dd-mm-yyyy — ca thật QA nêu', () => {
  const UI = require('../audit.js');
  const html = UI.entryHTML(st, { action: 'update', at: '2026-11-04T03:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'due', label: 'Hạn', from: '2026-11-20', to: '2026-11-25' }] });
  assert.ok(html.includes('Hạn: 20-11-2026 → 25-11-2026'), 'phải hiện dd-mm-yyyy: ' + html);
  assert.ok(!html.includes('2026-11-20') && !html.includes('2026-11-25'), 'không được lộ ISO');
});

test('F2 hiển thị: idempotent với changes MỚI (đã dd-mm-yyyy), datetime có hh:mm, chữ tự do + field thường giữ nguyên', () => {
  const UI = require('../audit.js');
  const neu = UI.entryHTML(st, { action: 'update', at: '2026-11-04T03:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'due', label: 'Hạn', from: '20-11-2026', to: '25-11-2026' }] });
  assert.ok(neu.includes('Hạn: 20-11-2026 → 25-11-2026'), 'áp 2 lớp không format 2 lần: ' + neu);
  const dt = UI.entryHTML(st, { action: 'create', at: '2026-11-04T03:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'requestedAt', label: 'requestedAt', from: '', to: '2026-10-30T00:00:00.000Z' }] });
  assert.ok(dt.includes('30-10-2026 07:00'), 'datetime phải hiện dd-mm-yyyy hh:mm: ' + dt);
  const free = UI.entryHTML(st, { action: 'update', at: '2026-11-04T03:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'due', label: 'Hạn (nhãn)', from: 'Hôm nay', to: 'Tuần sau' }, { field: 'title', label: 'Tiêu đề', from: '2026-11-20', to: 'Deal X' }] });
  assert.ok(free.includes('Hôm nay → Tuần sau'), 'chữ tự do của field ngày giữ nguyên văn');
  assert.ok(free.includes('Tiêu đề: 2026-11-20 → Deal X'), 'field KHÔNG phải ngày giữ nguyên văn kể cả trông giống ISO');
  const nested = UI.entryHTML(st, { action: 'update', at: '2026-11-04T03:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'contract', label: 'Hợp đồng', from: '', to: 'signed: 2026-10-15; status: Đã ký' }] });
  assert.ok(nested.includes('signed: 15-10-2026'), 'tóm tắt object cũ: sub-key signed phải được đổi: ' + nested);
});

/* ---------- F1: badge snapshot ---------- */

test('F1: publishing.js không còn literal gạch chéo; badge lấy ngày từ DATA.records qua pubFmtDate', () => {
  const pub = read('publishing.js');
  assert.ok(!pub.includes('15/08/2026') && !pub.includes('25/08/2026'), 'không còn hard-code gạch chéo');
  assert.ok(pub.includes("snapDateFor('Puzzle')") && pub.includes("snapDateFor('Simulation')"), 'badge phải tính từ dữ liệu snapshot');
  assert.ok(pub.includes('DATA.records') && pub.includes('pubFmtDate(ds[0])'), 'ngày snapshot phải qua pubFmtDate');
  /* Dữ liệu snapshot gốc thật cho đúng 2 ngày kỳ vọng */
  const sandbox = { window: {} };
  vm.runInNewContext(read('publishing-data.js'), sandbox);
  const recs = sandbox.window.PublishingData.records;
  const datesOf = cat => [...new Set(recs.filter(r => r.category === cat).map(r => r.date))];
  assert.deepEqual(datesOf('Puzzle'), ['2026-08-15']);
  assert.deepEqual(datesOf('Simulation'), ['2026-08-25']);
});

test('F1 harness: boot publishing.js thật -> renderMarket hiện badge dd-mm-yyyy, không còn ngày gạch chéo nào trên màn Thị trường', () => {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({ members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] }));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [], marketUpdates: [] }));
  const makeElement = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, reportValidity: () => true, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map(); const handlers = {};
  const documentStub = { readyState: 'complete', body: Object.assign(makeElement(), { dataset: { role: 'bd' } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [], addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); } };
  class FakeFormData { constructor(f) { this.m = (f && f._fields) || new Map(); } get(k) { return this.m.has(k) ? this.m.get(k) : null; } getAll(k) { const v = this.m.get(k); return v === undefined ? [] : [v]; } }
  const ctx = vm.createContext({ console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/publishing.html' },
    addEventListener() {}, URLSearchParams, URL, structuredClone, FormData: FakeFormData,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const html = elements.get('#screen').innerHTML;
  assert.ok(html.includes('Snapshot Puzzle · 15-08-2026'), 'badge Puzzle phải là dd-mm-yyyy từ dữ liệu thật: ' + html.slice(0, 300));
  assert.ok(html.includes('Snapshot Simulation · 25-08-2026'), 'badge Simulation phải là dd-mm-yyyy từ dữ liệu thật');
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(html), 'toàn màn Thị trường không còn ngày gạch chéo');
});

/* ---------- Việc nhỏ: placeholder sự kiện ---------- */

test('việc nhỏ: placeholder ngày kết thúc sự kiện có gợi ý dd-mm-yyyy; ngày bắt đầu cũng ghi rõ định dạng', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('Để trống = cùng ngày bắt đầu (dd-mm-yyyy)'), 'placeholder e_evenddate phải có (dd-mm-yyyy)');
  assert.ok(idx.includes('VD: 15-11-2026 (dd-mm-yyyy)'), 'placeholder e_evdate phải ghi rõ dd-mm-yyyy');
});
