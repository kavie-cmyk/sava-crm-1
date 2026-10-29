/* A7 (chốt 2026-10-29): adapter PublishingScore.company() phải tính evidence
   CẤP PILLAR Production (productionPillarEvidence do migration legacy giữ
   lại) theo ĐÚNG ngữ nghĩa legacy PartnerEval.compute trên c.partnerEval:
   pillar là 1 trong 11 mục, đếm độc lập với 4 ô con — không đếm trùng,
   "N/A" loại khỏi mẫu số ở cả hai đường, nấc giữa không tính là đã xác minh.
   Không có field pillar -> giữ hành vi cũ (suy từ 4 ô con).
   Bất biến: Partner Fit / phân loại / composite của fixture chuẩn không đổi;
   số chỉ đổi ở ca pillar đã xác minh (hoặc N/A / nấc khác) mà ô con chưa khớp. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

/* ---- Môi trường vm: shared.js + publishing-score.js + publishing-bridge.js THẬT ---- */
function loadEnv({ companies = [], pubRaw } = {}) {
  const store = new Map();
  if (pubRaw !== undefined) store.set('sava_publishing_v1', typeof pubRaw === 'string' ? pubRaw : JSON.stringify(pubRaw));
  const ls = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), ctx, { filename: 'shared.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-score.js'), 'utf8'), ctx, { filename: 'publishing-score.js' });
  ctx.S = { members: [], deals: [], games: [], leads: [], tasks: [], activities: [], companies };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-bridge.js'), 'utf8'), ctx, { filename: 'publishing-bridge.js' });
  return { ctx, store, PE: ctx.window.PartnerEval, F: ctx.window.PublishingScore, bridge: ctx.window.PublishingBridge };
}
const env = loadEnv();
const { PE, F } = env;
assert.ok(PE && typeof PE.compute === 'function', 'thiếu PartnerEval thật');
assert.ok(F && typeof F.company === 'function', 'thiếu PublishingScore.company thật');
/* Đường fallback của publishing-score khi chạy độc lập (không có shared.js):
   require ở realm chính — realm này không có PartnerEval toàn cục. */
const FStandalone = require('../publishing-score.js');
assert.equal(typeof globalThis.PartnerEval, 'undefined', 'test fallback phải chạy khi không có PartnerEval toàn cục');

const V = 'Đã xác minh', U = 'Chưa rõ', NA = 'N/A';
const NONPROD = ['track', 'team', 'data', 'collaboration', 'strategy', 'pipeline'];
const SUBS = ['capacity', 'cadence', 'milestone', 'liveops'];
/* Fixture điểm chuẩn (giống partner-eval.test.cjs): Fit = 75.0 */
const SCORES = { track: 5, team: 2, production: 3.5, data: 3, collaboration: 4, strategy: 5, pipeline: 4 };

function legacyEv({ nonProd = [V, V, V, V, V, V], pillar = V, subs = [U, U, U, U], scores = SCORES } = {}) {
  const ev = PE.empty();
  PE.GATES.forEach(([k]) => { ev.hardGate[k].status = 'Đạt'; ev.hardGate[k].note = 'n'; });
  NONPROD.forEach((k, i) => { ev.evidence[k].status = nonProd[i]; ev.evidence[k].note = 'n'; });
  ev.evidence.production.status = pillar; ev.evidence.production.note = 'n';
  SUBS.forEach((k, i) => { ev.evidence.productionSubs[k].status = subs[i]; ev.evidence.productionSubs[k].note = 'n'; });
  ev.scores = { ...scores };
  ev.dealFit = 5;
  return ev;
}
/* Revision canonical tương đương đúng cách legacyToRevision dựng:
   entries pillar đơn = điểm legacy, 4 ô con đều mang điểm production legacy
   (TB = điểm production), gates PASS, pillar evidence ở field riêng. */
function canonicalRev(opts = {}, { withPillar = true } = {}) {
  const { nonProd = [V, V, V, V, V, V], pillar = V, subs = [U, U, U, U], scores = SCORES } = opts;
  const entries = {};
  NONPROD.forEach((k, i) => { entries[k] = { score: scores[k], status: nonProd[i], note: 'n', source: 's' }; });
  SUBS.forEach((k, i) => { entries[k] = { score: scores.production, status: subs[i], note: 'n', source: 's' }; });
  entries.deal = { score: 5, status: U, note: '', source: '' };
  const gates = Object.fromEntries(F.gates.map(([k]) => [k, { value: 'PASS', note: 'n', source: 's' }]));
  const rev = { entries, gates, strengths: '', risks: '', next: '', reviewer: '', at: '' };
  if (withPillar) rev.productionPillarEvidence = { status: pillar, note: 'n', source: '' };
  return rev;
}
const detailOf = r => ({ verified: r.coverageDetail.verified, total: r.coverageDetail.total, excludedNA: r.coverageDetail.excludedNA, pct: r.coverageDetail.pct });

/* [tên, opts, verified, total, excludedNA, pct] — số kỳ vọng tính TAY theo
   quy tắc legacy: verified = (6 pillar đơn đã xác minh) + (pillar Production
   đã xác minh ? 1 : 0) + (ô con đã xác minh); excludedNA tương tự với "N/A";
   total = 11 - excludedNA. */
const COMBOS = [
  ['biên A7: 6 pillar + pillar Production đã xác minh, 4 ô con chưa', {}, 7, 11, 0, 63.6],
  ['pillar đã xác minh + 4 ô con đã xác minh (không đếm trùng)', { subs: [V, V, V, V] }, 11, 11, 0, 100],
  ['pillar đã xác minh + 2/4 ô con đã xác minh', { subs: [V, V, U, U] }, 9, 11, 0, 81.8],
  ['pillar đã xác minh + 1/4 ô con đã xác minh', { subs: [V, U, U, U] }, 8, 11, 0, 72.7],
  ['pillar N/A + 4 ô con N/A', { pillar: NA, subs: [NA, NA, NA, NA] }, 6, 6, 5, 100],
  ['pillar N/A + 4 ô con đã xác minh', { pillar: NA, subs: [V, V, V, V] }, 10, 10, 1, 100],
  ['pillar N/A + 2 ô con đã xác minh + 2 ô con N/A', { pillar: NA, subs: [V, V, NA, NA] }, 8, 8, 3, 100],
  ['pillar N/A + 4 ô con chưa rõ', { pillar: NA, subs: [U, U, U, U] }, 6, 10, 1, 60],
  ['pillar Chưa rõ + 4 ô con đã xác minh', { pillar: U, subs: [V, V, V, V] }, 10, 11, 0, 90.9],
  ['pillar Thiếu + 4 ô con đã xác minh', { pillar: 'Thiếu', subs: [V, V, V, V] }, 10, 11, 0, 90.9],
  ['pillar Đã trao đổi + 4 ô con đã xác minh', { pillar: 'Đã trao đổi', subs: [V, V, V, V] }, 10, 11, 0, 90.9],
  ['pillar Đối tác đã gửi + 4 ô con đã xác minh', { pillar: 'Đối tác đã gửi', subs: [V, V, V, V] }, 10, 11, 0, 90.9],
  ['pillar nhãn cũ "Partner cung cấp" + 4 ô con đã xác minh', { pillar: 'Partner cung cấp', subs: [V, V, V, V] }, 10, 11, 0, 90.9],
  ['pillar Chưa rõ + 2/4 ô con đã xác minh', { pillar: U, subs: [V, V, U, U] }, 8, 11, 0, 72.7],
  ['1 pillar đơn N/A + pillar Production đã xác minh + ô con chưa', { nonProd: [V, V, V, V, V, NA] }, 6, 10, 1, 60],
  ['không mục nào đã xác minh', { nonProd: [U, U, U, U, U, U], pillar: U, subs: [U, U, U, U] }, 0, 11, 0, 0],
];
test('A7: canonical (adapter) khớp TUYỆT ĐỐI legacy ở mọi tổ hợp pillar × ô con', () => {
  for (const [name, opts, verified, total, excludedNA, pct] of COMBOS) {
    const legacy = PE.compute(legacyEv(opts));
    assert.deepEqual(
      { verified: legacy.coverage.verified, total: legacy.coverage.total, excludedNA: legacy.coverage.excludedNA, pct: legacy.coverage.pct },
      { verified, total, excludedNA, pct }, 'số legacy tự tính khác số kỳ vọng tay — tổ hợp: ' + name);
    const canon = F.company(canonicalRev(opts));
    assert.deepEqual(detailOf(canon), { verified, total, excludedNA, pct }, 'canonical lệch legacy — tổ hợp: ' + name);
    assert.equal(canon.coveragePct, legacy.coverage.pct, name);
    assert.equal(canon.coverage, legacy.coverage.pct / 100, name);
    assert.equal(canon.evidenceGate, legacy.evidenceGate, name);
    assert.equal(canon.confidence, legacy.confidence, name);
    assert.equal(canon.conclusion, legacy.conclusion, name);
    /* Điểm không phụ thuộc evidence: Fit giữ nguyên ở mọi tổ hợp */
    assert.equal(canon.partnerFit, 75.0, name);
    assert.equal(canon.partnerFit, legacy.partnerFit, name);
  }
});
test('A7: đường fallback độc lập của publishing-score (không có PartnerEval) cho cùng kết quả', () => {
  for (const [name, opts, verified, total, excludedNA, pct] of COMBOS) {
    const canon = FStandalone.company(canonicalRev(opts));
    assert.deepEqual(
      { verified: canon.coverageDetail.verified, total: canon.coverageDetail.total, excludedNA: canon.coverageDetail.excludedNA, pct: canon.coverageDetail.pct },
      { verified, total, excludedNA, pct }, 'fallback lệch — tổ hợp: ' + name);
    assert.equal(canon.partnerFit, 75.0, name);
  }
});
test('A7: fixture biên qua migration THẬT (bridge) — canonical 63.6% (7/11) khớp legacy, Fit 75.0 "Đạt" khi gate đủ', () => {
  const ev = legacyEv({}); /* 6 pillar + pillar Production verified, ô con chưa */
  const e2 = loadEnv({ companies: [{ id: 'ca7x', name: 'Studio A7', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: '', phone: '', last: '', partnerEval: ev }] });
  assert.equal(e2.bridge.migratePartnerLegacy().migrated, 1);
  const rev = JSON.parse(e2.store.get('sava_publishing_v1')).requests[0].current;
  assert.equal(rev.productionPillarEvidence.status, V);
  const legacy = e2.PE.compute(ev);
  const canon = e2.F.company(rev);
  assert.equal(legacy.coverage.pct, 63.6);
  assert.equal(canon.coveragePct, 63.6);
  assert.deepEqual(
    { verified: canon.coverageDetail.verified, total: canon.coverageDetail.total, excludedNA: canon.coverageDetail.excludedNA },
    { verified: 7, total: 11, excludedNA: 0 });
  assert.equal(canon.partnerFit, 75.0);
  /* partnerSummary (bridge) — bề mặt BD dùng chung đúng kết quả này */
  const ps = e2.bridge.partnerSummary('ca7x');
  assert.equal(ps.computed.coveragePct, 63.6);
  assert.equal(ps.computed.coverageDetail.verified, 7);
  assert.equal(ps.computed.coverageDetail.total, 11);
  assert.equal(ps.computed.conclusion, canon.conclusion);
  const html = e2.bridge.summary('company', 'ca7x');
  assert.ok(html.includes('Evidence: 63.6%'), 'summary bridge phải hiện Evidence: 63.6% — nhận: ' + html);
});
test('A7: không có field pillar -> hành vi như hiện tại (suy từ 4 ô con)', () => {
  const cases = [
    ['ô con đủ 4 đã xác minh -> pillar coi như đã xác minh', { subs: [V, V, V, V] }, { verified: 11, total: 11, excludedNA: 0, pct: 100 }],
    ['ô con đủ 4 N/A -> pillar coi như N/A', { subs: [NA, NA, NA, NA] }, { verified: 6, total: 6, excludedNA: 5, pct: 100 }],
    ['ô con 2/4 đã xác minh -> pillar Chưa rõ', { subs: [V, V, U, U] }, { verified: 8, total: 11, excludedNA: 0, pct: 72.7 }],
    ['ô con 2 đã xác minh + 2 N/A -> pillar Chưa rõ, chỉ ô con N/A ra khỏi mẫu số', { subs: [V, V, NA, NA] }, { verified: 8, total: 9, excludedNA: 2, pct: 88.9 }],
    ['ô con chưa rõ hết -> pillar Chưa rõ', { subs: [U, U, U, U] }, { verified: 6, total: 11, excludedNA: 0, pct: 54.5 }],
  ];
  for (const [name, opts, exp] of cases) {
    const canon = F.company(canonicalRev(opts, { withPillar: false }));
    assert.deepEqual(detailOf(canon), exp, name);
    assert.equal(canon.partnerFit, 75.0, name);
  }
  /* entries.production có status (dự phòng khi không có field riêng) cũng được tính như pillar */
  const rev = canonicalRev({}, { withPillar: false });
  rev.entries.production = { score: null, status: V, note: 'n', source: '' };
  assert.deepEqual(detailOf(F.company(rev)), { verified: 7, total: 11, excludedNA: 0, pct: 63.6 });
});
test('A7: bất biến fixture chuẩn — 75.0 "Đạt", 85.0 "Ưu tiên", composite 3.25, coverage ca chuẩn', () => {
  /* Fixture chuẩn đầy đủ (mọi mục đã xác minh, kể cả pillar) ở CẢ hai đường */
  const full = { subs: [V, V, V, V] };
  const legacyFull = PE.compute(legacyEv(full));
  assert.equal(legacyFull.partnerFit, 75.0); assert.equal(legacyFull.classification, 'Đạt'); assert.equal(legacyFull.coverage.pct, 100);
  const canonFull = F.company(canonicalRev(full));
  assert.equal(canonFull.partnerFit, 75.0); assert.equal(canonFull.classification, 'Đạt');
  assert.equal(canonFull.coveragePct, 100); assert.equal(canonFull.conclusion, 'Đạt');
  /* Ngưỡng 85.0 "Ưu tiên": điểm đều 4.25 ở cả hai đường */
  const uni = Object.fromEntries(Object.keys(SCORES).map(k => [k, 4.25]));
  assert.equal(PE.compute(legacyEv({ ...full, scores: uni })).partnerFit, 85.0);
  const canon85 = F.company(canonicalRev({ ...full, scores: uni }));
  assert.equal(canon85.partnerFit, 85.0); assert.equal(canon85.classification, 'Ưu tiên'); assert.equal(canon85.coveragePct, 100);
  /* Composite 3.25: ca chuẩn của publishing-score.test.cjs — ô con 4/3/3/3,
     KHÔNG có field pillar (đường suy cũ) -> composite và coverage không đổi */
  const e = n => ({ score: n, status: V, note: 'evidence', source: 'fixture' });
  const a = { entries: Object.fromEntries(['track', 'team', ...SUBS, 'data', 'collaboration', 'deal', 'strategy', 'pipeline'].map(k => [k, e(4)])), gates: Object.fromEntries(F.gates.map(([k]) => [k, { value: 'PASS', note: 'n', source: 's' }])) };
  a.entries.capacity = e(4); a.entries.cadence = e(3); a.entries.milestone = e(3); a.entries.liveops = e(3);
  const rc = F.company(a);
  assert.equal(rc.composite, 3.25);
  assert.equal(rc.coveragePct, 100);
  /* F.company({}) rỗng: như cũ */
  assert.equal(F.company({}).total, null);
  assert.equal(F.company({}).coveragePct, 0);
});
test('A7: one-pager partnerEvidenceCounts (index.html) dùng cùng kết quả adapter ở mọi đường', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('function partnerEvidenceCounts(ps) {');
  const b = html.indexOf('\nfunction partnerPagerHTML', a);
  assert.ok(a >= 0 && b > a, 'không trích được partnerEvidenceCounts từ index.html');
  const fn = new Function('normalizeEvidenceStatusStrict', html.slice(a, b) + '\n;return partnerEvidenceCounts;')(env.ctx.window.normalizeEvidenceStatusStrict);
  const edge = canonicalRev({}); /* biên A7 */
  /* (1) computed mang coverageDetail của adapter -> dùng thẳng, kể cả khi current trống */
  assert.deepEqual(fn({ computed: { coveragePct: 63.6, coverageDetail: { verified: 7, total: 11, excludedNA: 0, pct: 63.6 } }, current: null }),
    { verified: 7, total: 11, excludedNA: 0 });
  /* (2) computed không mang số đếm -> đếm từ current PHẢI tính field pillar (bản cũ ra 6/11) */
  assert.deepEqual(fn({ computed: { coveragePct: 63.6 }, current: edge }), { verified: 7, total: 11, excludedNA: 0 });
  /* (3) pillar N/A + ô con đã xác minh: đếm từ current khớp adapter (10/10, loại 1) */
  const naRev = canonicalRev({ pillar: NA, subs: [V, V, V, V] });
  assert.deepEqual(fn({ computed: {}, current: naRev }), { verified: 10, total: 10, excludedNA: 1 });
  /* (4) không field pillar -> suy từ ô con như cũ (ca B1: 5 đã xác minh + 6 N/A -> 5/5) */
  const entries = {};
  ['track', 'team', 'data', 'collaboration', 'strategy'].forEach(k => { entries[k] = { status: V, note: '', source: '' }; });
  entries.pipeline = { status: NA, note: '', source: '' };
  SUBS.forEach(k => { entries[k] = { status: NA, note: '', source: '' }; });
  assert.deepEqual(fn({ computed: {}, current: { entries } }), { verified: 5, total: 5, excludedNA: 6 });
  /* (5) object coverage của PartnerEval (đường stub cũ) vẫn được tôn trọng */
  assert.deepEqual(fn({ computed: { coverage: { verified: 5, total: 5, excludedNA: 6 } }, current: null }),
    { verified: 5, total: 5, excludedNA: 6 });
});
