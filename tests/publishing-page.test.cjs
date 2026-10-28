/* Publishing page — đợt 2 QA vòng 3 (phía Publishing):
   A8 (phục hồi dữ liệu lỗi), A9 (sanitize đếm được), A11/M2 (provenance/audit),
   A13 (bridge trên publishing.html/mkt.html), A6 (normalizeStatusStrict),
   B2/D2 (kết quả v2 hiệu lực duy nhất qua hasValidV2/v2Candidate),
   C11 (deep-link kind lạ), C12 (link ngược CRM cho game), C13 (trùng tên
   quan sát -> bổ sung), C15 (request mồ côi khóa lưu), C16 (prefill mechanic),
   D1 (MKT không thấy gateNote/gateSource game), D4 (MKT không thấy intake
   expectations), D5 (MKT không thấy bdComment trong lịch sử), D6 (CSS wrap).
   Hai lớp kiểm: (1) khẳng định trên mã nguồn publishing.js/html/css — mẫu đã
   dùng ở publishing-market.test.cjs; (2) nạp publishing.js THẬT vào vm với
   DOM/localStorage stub tối thiểu và kiểm hành vi effectiveGameResult /
   mechanicIdForGame / phục hồi kho lỗi qua window.PublishingEffective. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = read('publishing.js');

/* ---------- (1) Khẳng định mã nguồn ---------- */

test('A13: publishing.html + mkt.html nạp publishing-bridge.js trước publishing.js; E4 chết đã gỡ', () => {
  for (const f of ['publishing.html', 'mkt.html']) {
    const html = read(f);
    const bi = html.indexOf('publishing-bridge.js'), pi = html.indexOf('publishing.js');
    assert.ok(bi >= 0 && pi > bi, f + ' chưa nạp bridge trước publishing.js');
  }
  assert.ok(src.includes('window.PublishingBridge.migratePartnerLegacy()'), 'publishing.js chưa gọi bridge migrate khi khởi tạo');
  assert.ok(!src.includes('PartnerMigration') && !src.includes('PartnerLegacyMigration'), 'còn tham chiếu global E4 chết');
});

test('A8: read() phục hồi dữ liệu lỗi — backup corrupt_backup + PUB_LOAD_ISSUE, không throw chết trang', () => {
  assert.ok(src.includes("KEY + '__corrupt_backup'"), 'thiếu key backup sava_publishing_v1__corrupt_backup');
  assert.ok(src.includes('corruptPubFallback') && src.includes('PUB_LOAD_ISSUE'), 'thiếu cơ chế phục hồi/cờ cảnh báo');
  assert.ok(!src.includes("throw Error('Dữ liệu Publishing không đúng định dạng"), 'read() vẫn throw khi version lạ');
  assert.ok(src.includes('dataNoticeHTML()'), 'thiếu banner cảnh báo dữ liệu trong render');
});

test('A9: sanitize đếm được số mục bị loại + lý do (gồm marketUpdates thiếu id)', () => {
  assert.ok(src.includes('lastSanitizeReport'), 'thiếu báo cáo sanitize');
  assert.ok(src.includes('quan sát thị trường thiếu id'), 'marketUpdates thiếu id chưa nằm trong số đếm cảnh báo');
  assert.ok(src.includes('yêu cầu đánh giá thiếu loại hồ sơ (company/game) hoặc thiếu entityId'), 'thiếu lý do loại request');
});

test('A6: normalizeRevision dùng normalizeStatusStrict và giữ productionPillarEvidence/reviewDate', () => {
  assert.ok(src.includes('normalizeStatusStrict'), 'chưa dùng normalizeStatusStrict');
  assert.ok(src.includes('productionPillarEvidence'), 'normalizeRevision chưa giữ productionPillarEvidence');
  const rev = src.slice(src.indexOf('function normalizeRevision'), src.indexOf('function sanitizeRequest'));
  assert.ok(!/[^S]normalizeStatus\(/.test(rev.replace(/normalizeStatusStrict/g, '')), 'normalizeRevision còn gọi normalizeStatus chỉ-đổi-nhãn');
});

test('B2: effectiveGameResult dùng hasValidV2/v2Candidate của PublishingScore, không tự đếm điểm', () => {
  const eff = src.slice(src.indexOf('function effectiveGameResult'), src.indexOf('window.PublishingEffective'));
  assert.ok(eff.includes('F.hasValidV2') && eff.includes('F.v2Candidate'), 'effectiveGameResult chưa dùng định nghĩa v2 duy nhất');
  assert.ok(!eff.includes('v2Count') && !eff.includes('cnt(') && !eff.includes('typeof x.score'), 'effectiveGameResult còn tự đếm điểm v2');
  assert.ok(eff.includes("'v2-insufficient'"), 'thiếu trạng thái v2 chưa đủ dữ liệu (final = null)');
});

test('A11/M2: submitMarket giữ provenance gốc + audit lưu evidenceType/provenance/confidence', () => {
  const sm = src.slice(src.indexOf('function submitMarket'), src.indexOf('function renderReviews'));
  assert.ok(sm.includes('[...prev.provenance]'), 'provenance gốc chưa được giữ khi bổ sung');
  assert.ok(sm.includes('evidenceType:prev.evidenceType??null') && sm.includes('confidence:prev.confidence??null'), 'audit chưa lưu evidenceType/confidence của quan sát trước');
});

test('C13: tên quan sát trùng -> định tuyến bổ sung vào record gốc (routedDuplicate)', () => {
  assert.ok(src.includes('routedDuplicate'), 'thiếu định tuyến C13');
  assert.ok(src.includes('Tên trùng quan sát đã có — đã bổ sung dữ liệu vào bản gốc'), 'thiếu thông báo định tuyến C13');
});

test('C11/C12/C15: deep-link kind lạ bị chặn; link ngược CRM cho game; request mồ côi khóa lưu', () => {
  assert.ok(src.includes("!['game','company'].includes(kind)"), 'thiếu chặn kind lạ ở deep-link');
  assert.ok(src.includes('index.html?open=game&amp;id='), 'thiếu link ngược CRM cho game');
  assert.ok(src.includes('Chưa gửi yêu cầu đánh giá — mở game trong CRM'), 'companyNav chưa biến text thành link game CRM');
  assert.ok(src.includes('Hồ sơ đã được gỡ khỏi CRM — chỉ xem, không lưu được phiên bản đánh giá mới.'), 'thiếu guard khóa lưu request mồ côi trong submitReview');
  assert.ok(src.includes("const orphan = !en;"), 'openReview chưa tính trạng thái mồ côi');
});

test('D1/D4/D5: MKT không thấy gateNote/gateSource game, intake expectations, bdComment lịch sử', () => {
  assert.ok(src.includes("role==='mkt' ? gateLabel(hh.gate||'PENDING')"), 'lịch sử game chưa lọc gateNote/gateSource cho MKT');
  assert.ok(!src.includes("${esc(a.gateNote||'Chờ BD xác minh.')}"), 'phần gate hiện tại của game vẫn lộ gateNote cho MKT');
  assert.ok(src.includes("k === 'expectations'"), 'intakeDisplayHTML chưa ẩn expectations khỏi MKT');
  assert.ok(src.includes("role === 'mkt' ? (hh.comment || '')"), 'lịch sử chưa lọc bdComment theo role');
});

test('D6: publishing.css có wrap cho .review-card h3 và .dialog-head h2', () => {
  const css = read('publishing.css');
  assert.ok(/\.review-card h3[^{]*\{[^}]*overflow-wrap/.test(css), 'thiếu overflow-wrap cho .review-card h3');
  assert.ok(/\.dialog-head h2[^{]*\{[^}]*overflow-wrap/.test(css), 'thiếu overflow-wrap cho .dialog-head h2');
});

/* ---------- (2) Harness vm: nạp publishing.js thật với DOM stub ---------- */
function makeLocalStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function makeElement() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPage({ pubRaw = null, role = 'bd' } = {}) {
  const ls = makeLocalStorage();
  if (pubRaw !== null) ls.setItem('sava_publishing_v1', pubRaw);
  const elements = new Map();
  const documentStub = {
    readyState: 'complete',
    body: Object.assign(makeElement(), { dataset: { role } }),
    querySelector: s => { if (!elements.has(s)) elements.set(s, makeElement()); return elements.get(s); },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const ctx = vm.createContext({
    console, localStorage: ls, document: documentStub,
    location: { search: '', href: 'http://localhost/publishing.html' },
    addEventListener() {}, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
  });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  return { ctx, ls, elements };
}

test('harness: trang nạp xong, PublishingEffective + PublishingBridge sẵn sàng (A13 chạy được)', () => {
  const { ctx } = loadPage();
  assert.equal(typeof ctx.window.PublishingBridge.migratePartnerLegacy, 'function');
  assert.equal(typeof ctx.window.PublishingEffective.effectiveGameResult, 'function');
  assert.equal(typeof ctx.window.PublishingEffective.mechanicIdForGame, 'function');
});

test('B2/D2 chức năng: effectiveGameResult — legacy/v2-insufficient/v2/stale theo hasValidV2', () => {
  const { ctx } = loadPage();
  const F = ctx.window.PublishingScore, eff = ctx.window.PublishingEffective.effectiveGameResult;
  const e5 = { score: 5, status: 'Đã xác minh', note: 'n', source: 's' };
  // entries khung cũ KHÔNG phải v2 -> legacy
  assert.equal(eff({ kind: 'game', intake: {}, current: { entries: { size: e5 }, quality: 5 } }).type, 'legacy');
  // scoresV2 rỗng -> legacy; điểm sai bước 0.5 (3.25) -> legacy
  assert.equal(eff({ kind: 'game', intake: {}, current: { scoresV2: {} } }).type, 'legacy');
  assert.equal(eff({ kind: 'game', intake: {}, current: { scoresV2: { market: { size: { score: 3.25 } } } } }).type, 'legacy');
  // current{market,prototype} không kèm scoresV2 vẫn là v2, nhưng completeness <80% -> v2-insufficient, final null
  const ins = eff({ kind: 'game', intake: {}, current: { market: { size: { score: 5 } }, prototype: {} } });
  assert.equal(ins.type, 'v2-insufficient'); assert.equal(ins.final, null);
  // đủ điểm v2 -> type v2, Final 100, Greenlight
  const full = { version: 'market-v2', fromMechanicId: 'MECH-001',
    market: Object.fromEntries(F.market.map(([k]) => [k, { score: 5 }])), prototype: Object.fromEntries(F.prototype.map(([k]) => [k, { score: 5 }])) };
  const ok = eff({ kind: 'game', intake: { mechanicId: 'MECH-001' }, current: { scoresV2: full } });
  assert.equal(ok.type, 'v2'); assert.equal(ok.final, 100); assert.equal(ok.decision, 'Greenlight');
  // mechanic đã đổi -> stale, final null
  const stale = eff({ kind: 'game', intake: { mechanicId: 'MECH-002' }, current: { scoresV2: full } });
  assert.equal(stale.type, 'stale'); assert.equal(stale.final, null);
});

test('C16 chức năng: mechanicIdForGame suy từ genre CRM', () => {
  const { ctx } = loadPage();
  const m = ctx.window.PublishingEffective.mechanicIdForGame;
  assert.equal(m({ genre: 'Puzzle / Match-3' }), 'MECH-008');   // khớp tên record chính xác
  assert.equal(m({ genre: 'Merge / Idle' }), 'MECH-004');       // token "Merge" = tên record
  assert.equal(m({ genre: 'Farm / Simulation' }), 'SIM-7');     // "Farm" là chuỗi con duy nhất
  assert.equal(m({ genre: 'Puzzle / Sort' }), 'MECH-001');      // "Sort" -> "Sort / Flow"
  assert.equal(m({ genre: 'Roguelike / Dice' }), '');           // không suy ra được -> không prefill
  assert.equal(m({ genre: '' }), '');
  assert.equal(m(null), '');
});

test('A8 chức năng: kho JSON hỏng / version lạ -> trang vẫn render, có backup + cờ PUB_LOAD_ISSUE', () => {
  for (const raw of ['{hong json', JSON.stringify({ version: 99, requests: [], marketUpdates: [] }), '[1,2]', 'null']) {
    const { ctx, ls, elements } = loadPage({ pubRaw: raw });
    assert.ok(ctx.window.PUB_LOAD_ISSUE, 'thiếu cờ PUB_LOAD_ISSUE cho raw: ' + raw);
    const backup = JSON.parse(ls.getItem('sava_publishing_v1__corrupt_backup'));
    assert.equal(backup.raw, raw, 'backup không giữ nguyên raw');
    assert.ok(elements.get('#screen').innerHTML.includes('Mechanic'), 'trang không render được danh sách thị trường với raw: ' + raw);
    // key chính CHƯA bị ghi đè bởi read() — giữ nguyên raw lỗi cho tới lần lưu hợp lệ
    assert.equal(ls.getItem('sava_publishing_v1'), raw);
  }
});
