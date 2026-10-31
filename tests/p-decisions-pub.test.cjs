/* Đợt 7 quyết định (P1–P7) — cụm Publishing + shared (P3 / P4 / P5):
   - P4: MỘT helper định dạng điểm TỔNG /100 duy nhất — fmtFinalScore trong
     shared.js (luôn đúng 1 chữ số thập phân: 80 -> "80.0", 64.96 -> "65.0";
     null/thiếu/không hợp lệ -> "—" như mẫu hiển thị chung của app). Mọi bề
     mặt Final v2 + Final legacy + Partner Fit trong publishing.js và
     publishing-bridge.js đi qua helper này; điểm thành phần (Market /
     Prototype / composite / từng tiêu chí) và % completeness/coverage giữ
     nguyên định dạng cũ (num()/pct()/fmt1 cho coverage ở bridge).
   - P5(b): từ vựng kind=company thống nhất "Đánh giá Partner" — không còn
     "Năng lực sản xuất" (mọi biến thể hoa/thường) trong publishing.js.
   - P5(a): noun của Task trong TYPE_BADGE_META (shared.js) là "Việc",
     không còn "Công việc"; câu văn xuôi "Việc lưu ở tab này đã bị CHẶN"
     (việc = hành động lưu, KHÔNG phải Task entity) giữ nguyên.
   - P3: currentRequesterId() của publishing.js resolve qua nguồn danh tính
     DUY NHẤT window.SavaAuth.currentUser().memberId và là mặc định của
     field requestedBy trong form gửi yêu cầu; không file nào của cụm
     Publishing chứa mặc định cứng 'zac'.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Harness shared.js tối thiểu (mẫu type-badge.test.cjs) ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { getElementById: () => null, addEventListener() {} },
    addEventListener() {}, setTimeout, clearTimeout, URLSearchParams, URL });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

/* ---------- P4: helper fmtFinalScore ---------- */
test('P4 tĩnh: shared.js có đúng 1 helper fmtFinalScore và phơi qua window như các helper khác', () => {
  const shared = read('shared.js');
  assert.equal((shared.match(/function fmtFinalScore\(/g) || []).length, 1, 'phải có đúng 1 định nghĩa fmtFinalScore');
  assert.ok(shared.includes('window.fmtFinalScore = fmtFinalScore'), 'helper phải phơi qua window.fmtFinalScore');
  /* Cả 3 trang nạp shared.js TRƯỚC publishing-bridge.js / publishing.js */
  for (const page of ['publishing.html', 'mkt.html', 'index.html']) {
    const html = read(page);
    assert.ok(html.indexOf('src="shared.js"') > -1 && html.indexOf('src="shared.js"') < html.indexOf('src="publishing-bridge.js"'), page + ': shared.js phải nạp trước bridge');
    assert.ok(html.indexOf('src="shared.js"') < html.indexOf('src="publishing.js"') || !html.includes('src="publishing.js"'), page + ': shared.js phải nạp trước publishing.js');
  }
});

test('P4 hành vi: fmtFinalScore luôn đúng 1 thập phân, làm tròn ở tầng hiển thị, thiếu dữ liệu -> "—"', () => {
  const ctx = loadShared();
  const f = ctx.window.fmtFinalScore;
  assert.equal(typeof f, 'function');
  assert.equal(f(80), '80.0');
  assert.equal(f(64.96), '65.0');
  assert.equal(f(79.975), '80.0');
  assert.equal(f(65), '65.0');
  assert.equal(f(0), '0.0');
  assert.equal(f(100), '100.0');
  assert.equal(f(70.25), '70.3');
  assert.equal(f(null), '—');
  assert.equal(f(undefined), '—');
  assert.equal(f(''), '—');
  assert.equal(f(NaN), '—');
  assert.equal(f('không-phải-số'), '—');
});

test('P4 publishing.js: mọi bề mặt Final v2 / Final legacy / Partner Fit dùng fmtFinalScore, điểm thành phần giữ num()', () => {
  const pub = read('publishing.js');
  assert.ok(pub.includes('const fmtFinalScore = window.fmtFinalScore'), 'publishing.js phải lấy helper từ shared.js qua window');
  for (const needle of [
    'fmtFinalScore(eff.final)',        // companyNavHTML: dòng kết quả game của studio (Final v2 + legacy)
    'fmtFinalScore(res.final)',        // v2PanelHTML: ô Final /100 của panel Market Score v2
    'fmtFinalScore(value)',            // renderReviews: thẻ review (Partner Fit company / Final game)
    'fmtFinalScore(result.total)',     // openReview: Partner Fit (company) /100
    'fmtFinalScore(result.final)',     // openReview: Final /100 khung legacy
    'fmtFinalScore(effH.v2.final)',    // openReview: dòng Final v2 trong lịch sử phiên bản
    'fmtFinalScore(histVal)',          // openReview: tổng /100 trong lịch sử (Partner Fit / Final)
  ]) assert.ok(pub.includes(needle), 'thiếu bề mặt qua helper: ' + needle);
  for (const raw of ['num(eff.final,1)', 'num(res.final, 1)', 'num(value,1)', 'num(result.total,1)', 'num(result.final,1)', 'num(effH.v2.final,1)', 'num(histVal,1)']) {
    assert.ok(!pub.includes(raw), 'còn bề mặt in điểm tổng thô qua num(): ' + raw);
  }
  /* Điểm thành phần GIỮ NGUYÊN num(): Market/Prototype legacy, Market/Prototype v2 ở lịch sử, Production Composite /5 */
  for (const kept of ['num(result.market,1)', 'num(result.prototype,1)', 'num(effH.v2.market.score,1)', 'num(effH.v2.prototype.score,1)', 'num(result.composite,1)']) {
    assert.ok(pub.includes(kept), 'điểm thành phần phải giữ num(): ' + kept);
  }
});

test('P4 bridge: Final v2 + Partner Fit dùng fmtFinalScore (từ shared.js), legacy qua fmtLegacyFinal nhất quán, coverage giữ fmt1', () => {
  const bridge = read('publishing-bridge.js');
  assert.ok(bridge.includes("typeof window.fmtFinalScore === 'function'"), 'bridge phải resolve helper từ window (shared.js)');
  assert.ok(bridge.includes('fmtFinalScore(cp.partnerFit)'), 'summary company: Partner Fit phải qua helper');
  assert.ok(bridge.includes('fmtFinalScore(v2.final)'), 'summary game: Final v2 phải qua helper');
  assert.ok(!bridge.includes('fmt1(cp.partnerFit)') && !bridge.includes('fmt1(v2.final)'), 'không còn in Partner Fit / Final v2 qua fmt1 (ra "85" thay vì "85.0")');
  assert.ok(bridge.includes('fmt1(cp.coveragePct)'), 'coverage % là điểm thành phần — giữ fmt1 như cũ');
  assert.ok(bridge.includes('fmtLegacyFinal(res.final)') && bridge.includes('legacyThresholdNote(res.final)'), 'nhánh legacy giữ fmtLegacyFinal + legacyThresholdNote');
});

test('P4 bridge: fmtLegacyFinal/legacyThresholdNote (đoạn cắt như fix-c3) cho chuỗi 1 thập phân nhất quán, không float dài', () => {
  const bridge = read('publishing-bridge.js');
  const seg = bridge.slice(bridge.indexOf('function fmtLegacyFinal'), bridge.indexOf('/* ===== Partner:'));
  const api = new Function(seg + '\n;return { fmtLegacyFinal, legacyThresholdNote };')();
  assert.equal(api.fmtLegacyFinal(64.96), '65.0');
  assert.equal(api.fmtLegacyFinal(80), '80.0');
  assert.equal(api.fmtLegacyFinal(null), '—');
  const note = api.legacyThresholdNote(64.96);
  assert.ok(note.includes('65.0') && note.includes('chưa qua ngưỡng 65'), 'ghi chú ngưỡng phải khớp số hiển thị 1 thập phân: ' + note);
  assert.ok(!note.includes('64.96000000000001'), 'ghi chú không được in float thô dài');
  assert.equal(api.legacyThresholdNote(80), '');
});

/* ---------- P5: thống nhất từ vựng ---------- */
test('P5(b): publishing.js không còn "Năng lực sản xuất" (mọi hoa/thường), bề mặt company dùng "Đánh giá Partner"', () => {
  const pub = read('publishing.js');
  assert.ok(!/năng lực sản xuất/i.test(pub), 'còn biến thể "năng lực sản xuất" trong publishing.js');
  assert.ok(pub.includes("['company','Đánh giá Partner']"), 'option loại đánh giá company phải là "Đánh giá Partner"');
  assert.ok(pub.includes('<h3>Đánh giá Partner — Partner Fit</h3>'), 'tiêu đề section company phải là "Đánh giá Partner — Partner Fit"');
  assert.ok(pub.includes('STUDIO / ĐÁNH GIÁ PARTNER'), 'eyebrow thẻ review company phải thống nhất "ĐÁNH GIÁ PARTNER"');
  /* "Năng lực Team" là TÊN 1 pillar của khung Partner — không thuộc thay đổi này */
  assert.ok(pub.includes('Năng lực Team'), 'pillar "Năng lực Team" phải giữ nguyên');
});

test('P5(a): TYPE_BADGE_META task noun là "Việc" (không còn "Công việc"), badge render "✅ Việc"; văn xuôi giữ nguyên', () => {
  const shared = read('shared.js');
  assert.ok(shared.includes('task: { icon: "✅", noun: "Việc"'), 'noun của task trong TYPE_BADGE_META phải là "Việc"');
  assert.ok(!shared.includes('noun: "Công việc"'), 'không còn noun "Công việc" cho task');
  const ctx = loadShared();
  const badge = ctx.window.typeBadgeHTML('task');
  assert.ok(badge.includes('✅ Việc') && !badge.includes('Công việc'), 'badge task phải render "✅ Việc": ' + badge);
  /* Giữ nguyên: "Việc lưu..." ở banner stale của publishing.js là văn xuôi
     (việc = hành động lưu), KHÔNG phải Task entity. */
  assert.ok(read('publishing.js').includes('Việc lưu ở tab này đã bị CHẶN'), 'banner stale giữ nguyên câu văn xuôi');
});

/* ---------- P3: một nguồn danh tính duy nhất ---------- */
test('P3: currentRequesterId resolve qua SavaAuth.currentUser().memberId và là mặc định requestedBy của form yêu cầu', () => {
  const pub = read('publishing.js');
  const seg = pub.slice(pub.indexOf('function currentRequesterId()'), pub.indexOf('function currentRequesterId()') + 400);
  assert.ok(seg.includes('window.SavaAuth') && seg.includes('currentUser()') && seg.includes('memberId'), 'currentRequesterId phải resolve qua SavaAuth.currentUser().memberId');
  assert.ok(pub.includes('const meReqId = currentRequesterId();'), 'requestForm phải lấy member đang đăng nhập qua currentRequesterId');
  assert.ok(pub.includes("memberField('requestedBy','BD phụ trách',reqRoleFilter,meReqId"), 'requestedBy mặc định = member đang đăng nhập, không phải giá trị cứng');
  /* currentPubMemberId (đóng dấu audit) cũng qua đúng nguồn SavaAuth */
  assert.ok(pub.includes('function currentPubMemberId()') && pub.slice(pub.indexOf('function currentPubMemberId()'), pub.indexOf('function currentPubMemberId()') + 300).includes('SavaAuth.currentUser()'), 'currentPubMemberId phải qua SavaAuth.currentUser()');
  /* Âm tính: không file nào của cụm Publishing chứa mặc định cứng 'zac' */
  for (const f of ['publishing.js', 'publishing-bridge.js', 'publishing-score.js', 'publishing.html', 'mkt.html']) {
    assert.ok(!read(f).includes("'zac'") && !read(f).includes('"zac"'), f + ' chứa mặc định cứng zac');
  }
});
