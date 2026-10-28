/* Partner Eval (khung Partner gắn vào hồ sơ công ty, drawer trong index.html).
   Sau hợp nhất, khối PARTNER EVAL trong index.html chỉ DELEGATE sang
   window.PartnerEval — implementation Partner DUY NHẤT nằm ở shared.js.
   Harness vì vậy nạp THẬT shared.js vào một vm context (window trỏ về chính
   context đó để shared.js gắn window.PartnerEval như trong trình duyệt) rồi
   mới trích logic/UI từ index.html và chạy với window.PartnerEval THẬT đó —
   không stub số liệu/logic Partner giả. Smoke UI vẫn dùng stub tối thiểu cho
   esc/ownerSel/memberName/S/LINES (hàm môi trường của trang, không phải logic Partner). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');

/* Nạp shared.js thật: top-level của shared.js chỉ dùng window/localStorage/document
   bên trong thân hàm nên nạp trần an toàn; nó sẽ tự gắn window.PartnerEval. */
const sharedCtx = vm.createContext({ console });
sharedCtx.window = sharedCtx;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), sharedCtx, { filename: 'shared.js' });
const realPartnerEval = sharedCtx.window.PartnerEval;
assert.ok(realPartnerEval && typeof realPartnerEval.compute === 'function' && typeof realPartnerEval.normalize === 'function' && typeof realPartnerEval.empty === 'function',
  'shared.js thật không gắn window.PartnerEval (compute/normalize/empty)');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function extract(startMarker, endMarker) {
  const a = html.indexOf(startMarker), b = html.indexOf(endMarker);
  assert.ok(a >= 0 && b > a, 'thiếu marker khối Partner Eval trong index.html');
  return html.slice(a, b + endMarker.length);
}
const logicCode = extract('/* === PARTNER EVAL LOGIC START === */', '/* === PARTNER EVAL LOGIC END === */');
const uiCode = extract('/* === PARTNER EVAL UI START === */', '/* === PARTNER EVAL UI END === */');

const escStub = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const SStub = { members: [{ id: 'mai', name: 'Mai', role: 'MKT', active: true }], deals: [], games: [] };
const memberNameStub = (s, id) => { const m = (s.members || []).find(x => x.id === id); return m ? m.name : '—'; };
const ownerSelStub = (id, cur) => `<select id="${id}"><option value="">— Chưa gán —</option>${cur ? `<option value="${cur}" selected>${cur}</option>` : ''}</select>`;
const LINESStub = { publishing: { name: 'Publishing', color: '#0ea5e9' } };
/* window được truyền vào là window THẬT chứa PartnerEval vừa nạp từ shared.js;
   khối logic trích từ index.html delegate sang đó (đúng như runtime trình duyệt:
   shared.js nạp trước script inline của index.html). */
const api = new Function('esc', 'ownerSel', 'memberName', 'S', 'LINES', 'window',
  logicCode + '\n' + uiCode +
  /* Khối logic hợp nhất chỉ còn export peEmptyEval/peNormalize/peCompute (+ hằng PE_*);
     các helper rời peHardGate/peCoverage/peConfidence/peEvidenceGate/pePartnerFit/peClassify
     của bản cũ không còn tồn tại — mọi khẳng định bên dưới đi qua peCompute THẬT. */
  '\n;return {PE_GATES,PE_PILLARS,PE_PROD_SUBS,PE_EVIDENCE_TOTAL,peEmptyEval,peNormalize,peCompute,peSummaryHTML,partnerEvalSection,partnerEvalBadge,partnerPagerHTML};'
)(escStub, ownerSelStub, memberNameStub, SStub, LINESStub, { PartnerEval: realPartnerEval });
const { peCompute } = api;
/* Mảng PE_* sinh từ vm context của shared.js mang prototype của realm đó ->
   deepStrictEqual ở các test dưới fail oan ("same structure but not reference-equal").
   Ép các tuple về mảng của realm chính; GIÁ TRỊ vẫn nguyên từ shared.js thật. */
for (const k of ['PE_GATES', 'PE_PILLARS', 'PE_PROD_SUBS']) api[k] = [...api[k]].map(t => [...t]);

/* Fixture điểm mẫu từ báo cáo khảo sát khung Partner (chỉ lấy bộ số điểm):
   Track 5, Team 2, Production 3.5, Data 3, Hợp tác 4, Strategic 5, Long-term 4. */
const FIXTURE_SCORES = { track: 5, team: 2, production: 3.5, data: 3, collaboration: 4, strategy: 5, pipeline: 4 };
function makeEval({ gateStatus = 'Đạt', failGate = null, verifiedCount = 11, scores = FIXTURE_SCORES, dealFit = 5 } = {}) {
  const ev = api.peEmptyEval();
  api.PE_GATES.forEach(([k]) => { ev.hardGate[k].status = k === failGate ? 'Không đạt' : gateStatus; ev.hardGate[k].note = 'Ghi chú kiểm chứng'; });
  const items = [...api.PE_PILLARS.map(([k]) => ['pillar', k]), ...api.PE_PROD_SUBS.map(([k]) => ['sub', k])];
  items.forEach(([kind, k], i) => {
    const target = kind === 'pillar' ? ev.evidence[k] : ev.evidence.productionSubs[k];
    target.status = i < verifiedCount ? 'Đã xác minh' : 'Chưa rõ';
    target.note = 'Bằng chứng kiểm chứng';
  });
  ev.scores = { ...scores };
  ev.dealFit = dealFit;
  return ev;
}

test('nhãn 6 cổng Hard Gate + 7 pillar + 4 ô con Production khớp khung gốc', () => {
  assert.deepEqual(api.PE_GATES.map(([, l]) => l), ['Pháp lý / Hợp đồng', 'Quyền sở hữu IP / source code', 'Xung đột Publisher', 'Minh bạch Data', 'Tính liên tục của team', 'Uy tín / Compliance']);
  assert.deepEqual(api.PE_PILLARS.map(([, l, w]) => [l, w]), [['Track Record', 10], ['Năng lực Team', 15], ['Production & Execution', 15], ['Data & Tech', 10], ['Hợp tác', 15], ['Strategic Fit', 15], ['Tiềm năng Long-term', 10]]);
  assert.equal(api.PE_PILLARS.reduce((s, [, , w]) => s + w, 0), 90);
  assert.deepEqual(api.PE_PROD_SUBS.map(([, l]) => l), ['Capacity', 'Cadence', 'Milestone', 'LiveOps']);
  assert.equal(api.PE_EVIDENCE_TOTAL, 11);
});

test('fixture điểm mẫu -> Partner Fit = 75.0, phân loại "Đạt", kết luận "Đạt" khi cả 2 gate đạt', () => {
  const r = peCompute(makeEval());
  assert.equal(r.partnerFit, 75.0);
  assert.equal(r.classification, 'Đạt');
  assert.equal(r.hardGate, 'ĐẠT');
  assert.equal(r.evidenceGate, 'ĐẠT');
  assert.equal(r.conclusion, 'Đạt');
  assert.equal(r.coverage.pct, 100);
  assert.equal(r.confidence, 'Cao');
});

test('Deal Fit không vào tổng Partner Fit', () => {
  assert.equal(peCompute(makeEval({ dealFit: 1 })).partnerFit, 75.0);
  assert.equal(peCompute(makeEval({ dealFit: 5 })).partnerFit, 75.0);
  assert.equal(peCompute(makeEval({ dealFit: null })).partnerFit, 75.0);
});

test('thiếu 1 trong 7 điểm -> Partner Fit null (chưa đủ điểm)', () => {
  const scores = { ...FIXTURE_SCORES }; delete scores.team;
  const r = peCompute(makeEval({ scores }));
  assert.equal(r.partnerFit, null);
  assert.equal(r.classification, null);
  assert.equal(r.conclusion, 'Chưa đủ điểm');
});

test('ma trận kết luận cuối theo đúng công thức gốc (cột N)', () => {
  assert.equal(peCompute(makeEval({ failGate: 'legal' })).conclusion, 'Bị chặn');
  assert.equal(peCompute(makeEval({ failGate: 'legal' })).hardGate, 'KHÔNG ĐẠT');
  assert.equal(peCompute(makeEval({ gateStatus: 'Chưa xác minh' })).conclusion, 'Chờ xác minh');
  assert.equal(peCompute(makeEval({ gateStatus: 'Đạt', verifiedCount: 5 })).conclusion, 'Thiếu Evidence');
  assert.equal(peCompute(makeEval({ gateStatus: 'Đạt', verifiedCount: 11 })).conclusion, 'Đạt');
  /* Ưu tiên thứ tự: gate KHÔNG ĐẠT thắng cả evidence thiếu */
  assert.equal(peCompute(makeEval({ failGate: 'ip', verifiedCount: 0 })).conclusion, 'Bị chặn');
  assert.equal(peCompute(makeEval({ gateStatus: 'Chưa xác minh', verifiedCount: 0 })).conclusion, 'Chờ xác minh');
});

test('phân loại Partner Fit tại các ngưỡng 85 / 75 / 65', () => {
  /* Helper rời pePartnerFit/peClassify không còn tồn tại sau hợp nhất — đi qua
     peCompute THẬT với điểm đều cả 7 pillar (fit = điểm × 20). */
  const uniform = n => Object.fromEntries(api.PE_PILLARS.map(([k]) => [k, n]));
  const at = n => peCompute(makeEval({ scores: uniform(n) }));
  assert.equal(at(4.25).partnerFit, 85.0); assert.equal(at(4.25).classification, 'Ưu tiên');
  assert.equal(at(3.75).partnerFit, 75.0); assert.equal(at(3.75).classification, 'Đạt');
  assert.equal(at(3.25).partnerFit, 65.0); assert.equal(at(3.25).classification, 'Có điều kiện');
  assert.equal(at(3.245).partnerFit, 64.9); assert.equal(at(3.245).classification, 'Cần xem xét');
  /* fit null -> classification null: đã khẳng định ở test "thiếu 1 trong 7 điểm". */
});

test('coverage / confidence / evidence gate tại các biên 80% · 90% · 60%', () => {
  /* Helper rời peEvidenceGate/peConfidence theo % tự do không còn tồn tại — coverage
     chỉ sinh từ số mục đã xác minh /11, nên kiểm các giá trị /11 kẹp sát nhất quanh
     từng ngưỡng: 80% nằm giữa 8/11 (72.7) và 9/11 (81.8); 90% giữa 9/11 (81.8) và
     10/11 (90.9); 60% giữa 6/11 (54.5) và 7/11 (63.6). */
  const c8 = peCompute(makeEval({ verifiedCount: 8 }));
  assert.equal(c8.coverage.pct, 72.7); assert.equal(c8.evidenceGate, 'CHƯA ĐẠT'); assert.equal(c8.confidence, 'Trung bình');
  /* Qua peCompute với mẫu số 11 mục: 9/11, 10/11, 7/11, 6/11 */
  const c9 = peCompute(makeEval({ verifiedCount: 9 }));
  assert.equal(c9.coverage.verified, 9); assert.equal(c9.coverage.total, 11);
  assert.equal(c9.coverage.pct, 81.8); assert.equal(c9.evidenceGate, 'ĐẠT'); assert.equal(c9.confidence, 'Trung bình');
  const c10 = peCompute(makeEval({ verifiedCount: 10 }));
  assert.equal(c10.coverage.pct, 90.9); assert.equal(c10.confidence, 'Cao'); assert.equal(c10.evidenceGate, 'ĐẠT');
  const c7 = peCompute(makeEval({ verifiedCount: 7 }));
  assert.equal(c7.coverage.pct, 63.6); assert.equal(c7.confidence, 'Trung bình'); assert.equal(c7.evidenceGate, 'CHƯA ĐẠT');
  const c6 = peCompute(makeEval({ verifiedCount: 6 }));
  assert.equal(c6.coverage.pct, 54.5); assert.equal(c6.confidence, 'Thấp');
});

test('điểm mạnh / điểm cần lưu ý tự suy từ pillar cao nhất / thấp nhất', () => {
  const r = peCompute(makeEval());
  assert.equal(r.strongest.label, 'Track Record'); /* 5 điểm, thắng Strategic cũng 5 vì đứng trước trong thứ tự pillar */
  assert.equal(r.weakest.label, 'Năng lực Team');
  assert.equal(r.weakest.score, 2);
});

test('peNormalize chịu được dữ liệu thiếu / hỏng', () => {
  const r = peCompute(null);
  assert.equal(r.hardGate, 'CHỜ XÁC MINH');
  assert.equal(r.partnerFit, null);
  assert.equal(r.coverage.pct, 0);
  const n = api.peNormalize({ scores: { track: '4.5', team: 99 }, hardGate: { legal: { status: 'Bậy', note: 3 } } });
  assert.equal(n.scores.track, 4.5);
  assert.equal(n.scores.team, null);
  assert.equal(n.hardGate.legal.status, 'Chưa xác minh');
});

test('smoke UI: section drawer + badge + one-pager render đúng khung', () => {
  const company = { id: 'cx', name: 'Studio Kiểm Chứng', type: 'Game studio', contact: 'An — Founder', phone: '090x', roles: { publishing: 'Game studio' }, partnerEval: makeEval({}) };
  company.partnerEval.notesWeak = 'Team mỏng, phụ thuộc 2 dev chính';
  company.partnerEval.nextAction = 'Theo dõi capacity trong project hiện tại';
  company.partnerEval.reviewer = 'mai';
  company.partnerEval.reviewDate = '2026-11-01';
  const section = api.partnerEvalSection(company);
  for (const needle of ['Đánh giá Partner', 'Pháp lý / Hợp đồng', 'Tính liên tục của team', 'Uy tín / Compliance',
    'id="pe_gate_legal_s"', 'id="pe_ev_track_s"', 'id="pe_ev_sub_capacity_s"', 'id="pe_ev_sub_liveops_s"',
    'id="pe_sc_track"', 'id="pe_dealfit"', 'id="pe_weak"', 'id="pe_next"', 'id="pe_date"', 'id="pe_reviewer"',
    'Lưu đánh giá Partner', 'One-pager quyết định', '11 mục', '80%', 'KHÔNG vào tổng']) {
    assert.ok(section.includes(needle), 'section thiếu: ' + needle);
  }
  assert.match(section, /Partner Fit: 75\.0 \/ 100/);
  assert.match(section, /Kết luận: Đạt/);
  const badge = api.partnerEvalBadge(company);
  assert.match(badge, /Partner Fit 75\.0 · Đạt/);
  const pager = api.partnerPagerHTML(company);
  for (const needle of ['One-pager quyết định', 'Studio Kiểm Chứng', 'Hard Gate', 'Evidence Coverage', '100%', 'Minimum Evidence Gate',
    'Track Record · 10%', 'Tiềm năng Long-term · 10%', 'Điểm mạnh', 'Năng lực Team', 'Team mỏng, phụ thuộc 2 dev chính',
    'Theo dõi capacity trong project hiện tại', 'Kết luận cuối: Đạt', 'Mai', '2026-11-01']) {
    assert.ok(pager.includes(needle), 'one-pager thiếu: ' + needle);
  }
  /* Chưa đánh giá: badge rỗng, section báo chưa đánh giá; công ty ngoài Publishing không có section */
  const fresh = { id: 'cy', name: 'Studio Chưa Chấm', type: 'Game studio', contact: '—', roles: { publishing: 'Game studio' } };
  assert.equal(api.partnerEvalBadge(fresh), '');
  assert.match(api.partnerEvalSection(fresh), /Chưa đánh giá partner/);
  assert.equal(api.partnerEvalSection({ id: 'cz', name: 'DN AI', roles: { ai: 'Khách hàng' } }), '');
});

test('tích hợp tĩnh vào index.html + cú pháp mọi script inline', () => {
  assert.ok(html.includes('${partnerEvalSection(c)}'), 'openCompany chưa gắn section Partner');
  assert.ok(html.includes('partnerEvalBadge(c)'), 'vCompanies chưa gắn badge Partner');
  assert.ok(html.includes('id="partnerPager"'), 'thiếu modal one-pager');
  assert.ok(html.includes('function savePartnerEval'), 'thiếu hàm lưu Partner Eval');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length >= 2, 'không trích được script inline');
  blocks.forEach((code, i) => {
    const f = path.join(os.tmpdir(), `sava-index-inline-${process.pid}-${i}.js`);
    fs.writeFileSync(f, code);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    finally { fs.unlinkSync(f); }
  });
});
