/* Partner Eval (khung Partner cho hồ sơ công ty).
   Sau hợp nhất + tách giao diện đánh giá:
   - Implementation Partner DUY NHẤT là window.PartnerEval trong shared.js;
     index.html chỉ còn các delegate pe* (khối PARTNER EVAL LOGIC) phục vụ
     nhãn/one-pager, KHÔNG còn form chấm Partner (peSummaryHTML /
     partnerEvalSection / savePartnerEval và mọi id pe_* đã gỡ có chủ đích).
   - Bề mặt BD (badge, khối tóm tắt drawer, one-pager) đọc dữ liệu canonical
     qua PublishingBridge.partnerSummary() — test smoke UI bên dưới stub đúng
     1 điểm chạm đó (PublishingBridge) bằng tóm tắt suy từ peCompute THẬT,
     còn mọi logic Partner vẫn chạy trên shared.js thật.
   - Migration c.partnerEval -> request kind=company được kiểm ở mức hàm:
     nạp publishing-bridge.js THẬT vào vm (localStorage stub) và gọi
     migratePartnerLegacy() trực tiếp. */
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
const fmtStampStub = v => v || '—';
const fmtNum1Stub = n => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
const isStudioCompanyStub = c => !!(c && c.roles && c.roles.publishing) && !/publisher/i.test(c.type || '');
const compStub = id => SStub.companies ? SStub.companies.find(c => c.id === id) : undefined;

/* Tóm tắt canonical stub cho UI: hình dạng đúng partnerSummary() của bridge,
   số liệu suy từ peCompute THẬT trên fixture chuẩn (xem makeEval bên dưới).
   `bridgeSummary` được gán sau khi peCompute sẵn sàng (hoist qua biến let). */
let bridgeSummary = null;
const bridgeStub = { partnerSummary: () => bridgeSummary };

/* window được truyền vào là window THẬT chứa PartnerEval vừa nạp từ shared.js;
   khối logic trích từ index.html delegate sang đó (đúng như runtime trình duyệt:
   shared.js nạp trước script inline của index.html). Khối UI chỉ đọc qua
   window.PublishingBridge.partnerSummary (điểm chạm canonical duy nhất). */
const api = new Function('esc', 'memberName', 'S', 'LINES', 'window', 'isStudioCompany', 'fmtStamp', 'fmtNum1', 'comp',
  logicCode + '\n' + uiCode +
  /* Khối logic hợp nhất chỉ còn export peEmptyEval/peNormalize/peCompute (+ hằng PE_*);
     các helper rời peHardGate/peCoverage/peConfidence/peEvidenceGate/pePartnerFit/peClassify
     của bản cũ không còn tồn tại — mọi khẳng định bên dưới đi qua peCompute THẬT.
     Khối UI nay export partnerEvalBadge/partnerSummaryBlockHTML/partnerPagerHTML
     (chỉ đọc canonical); form chấm peSummaryHTML/partnerEvalSection đã gỡ. */
  '\n;return {PE_GATES,PE_PILLARS,PE_PROD_SUBS,PE_EVIDENCE_TOTAL,peEmptyEval,peNormalize,peCompute,partnerEvalBadge,partnerSummaryBlockHTML,partnerPagerHTML};'
)(escStub, memberNameStub, SStub, { publishing: { name: 'Publishing', color: '#0ea5e9' } }, { PartnerEval: realPartnerEval, PublishingBridge: bridgeStub }, isStudioCompanyStub, fmtStampStub, fmtNum1Stub, compStub);
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

/* Tóm tắt canonical tương đương fixture chuẩn, theo đúng hình dạng bridge:
   computed mang partnerFit/classification/conclusion/hardGate/coveragePct/
   confidence/evidenceGate/dealFit như adapter PublishingScore.company trả. */
{
  const c = peCompute(makeEval());
  bridgeSummary = {
    exists: true, requestId: 'REV-test', status: 'Hoàn tất', versions: 2,
    computed: { partnerFit: c.partnerFit, classification: c.classification, conclusion: c.conclusion, hardGate: c.hardGate, coveragePct: c.coverage.pct, confidence: c.confidence, evidenceGate: c.evidenceGate, dealFit: c.dealFit },
    dealFit: c.dealFit, pillars: { ...FIXTURE_SCORES },
    strongest: c.strongest, weakest: c.weakest,
    strengths: '', risks: 'Team mỏng, phụ thuộc 2 dev chính', weak: 'Team mỏng, phụ thuộc 2 dev chính',
    next: 'Theo dõi capacity trong project hiện tại', reviewer: 'mai', date: '2026-11-01', current: null,
  };
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

test('smoke UI canonical: badge + tóm tắt drawer + one-pager đọc qua PublishingBridge.partnerSummary', () => {
  const company = { id: 'cx', name: 'Studio Kiểm Chứng', type: 'Game studio', contact: 'An — Founder', phone: '090x', roles: { publishing: 'Game studio' } };
  const badge = api.partnerEvalBadge(company);
  assert.match(badge, /Partner Fit 75\.0 · Đạt/);
  const block = api.partnerSummaryBlockHTML(company);
  for (const needle of ['Đánh giá Partner', 'Partner Fit: <b>75.0/100</b>', 'Kết luận: <b>Đạt</b>', 'Hard Gate: ĐẠT', 'Evidence: 100%',
    'publishing.html?tab=reviews&amp;kind=company&amp;id=cx', 'One-pager quyết định']) {
    assert.ok(block.includes(needle), 'khối tóm tắt thiếu: ' + needle);
  }
  /* Drawer công ty KHÔNG còn form chấm Partner: không input/select/textarea, không id pe_* */
  assert.ok(!/<input|<select|<textarea/i.test(block), 'khối tóm tắt còn ô nhập form Partner');
  assert.ok(!/pe_/.test(block), 'khối tóm tắt còn tham chiếu pe_*');
  const pager = api.partnerPagerHTML(company);
  for (const needle of ['One-pager quyết định', 'Studio Kiểm Chứng', 'Hard Gate', 'Evidence Coverage', '100%', '11/11 mục đã xác minh', 'Minimum Evidence Gate',
    'Track Record · 10%', 'Tiềm năng Long-term · 10%', 'Điểm mạnh', 'Năng lực Team', 'Team mỏng, phụ thuộc 2 dev chính',
    'Theo dõi capacity trong project hiện tại', 'Kết luận cuối: Đạt', 'Mai', '2026-11-01']) {
    assert.ok(pager.includes(needle), 'one-pager thiếu: ' + needle);
  }
  assert.match(pager, />75\.0</);
  /* Công ty ngoài Publishing (không đủ điều kiện studio): không badge, không khối tóm tắt */
  assert.equal(api.partnerEvalBadge({ id: 'cz', name: 'DN AI', roles: { ai: 'Khách hàng' } }), '');
  assert.equal(api.partnerSummaryBlockHTML({ id: 'cz', name: 'DN AI', roles: { ai: 'Khách hàng' } }), '');
});

test('migration Partner legacy ở mức hàm: bridge thật chuyển c.partnerEval thành revision canonical, chạy 2 lần không nhân đôi', () => {
  /* Môi trường vm tối thiểu cho publishing-bridge.js: localStorage stub +
     addEventListener stub; document vắng mặt nên bridge bỏ qua nhánh DOM. */
  const store = new Map();
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const bCtx = vm.createContext({ console, localStorage: localStorageStub, addEventListener: () => {} });
  bCtx.window = bCtx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), bCtx, { filename: 'shared.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-score.js'), 'utf8'), bCtx, { filename: 'publishing-score.js' });
  const crmState = {
    members: [], deals: [], games: [], leads: [], tasks: [], activities: [],
    companies: [{ id: 'cmig', name: 'Studio Migration', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '', partnerEval: makeEval({}) }],
  };
  bCtx.S = crmState;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-bridge.js'), 'utf8'), bCtx, { filename: 'publishing-bridge.js' });
  const bridge = bCtx.window.PublishingBridge;
  assert.ok(bridge && typeof bridge.migratePartnerLegacy === 'function', 'bridge không phơi migratePartnerLegacy');
  const r1 = bridge.migratePartnerLegacy();
  assert.equal(r1.migrated, 1);
  const pub = JSON.parse(store.get('sava_publishing_v1'));
  const reqs = pub.requests.filter(r => r.kind === 'company' && r.entityId === 'cmig');
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].revisions.length, 1);
  assert.equal(reqs[0].current.migratedFrom, 'bd-partnerEval');
  /* Số canonical sau migration phải khớp fixture chuẩn qua adapter thật */
  const computed = bCtx.window.PublishingScore.company(reqs[0].current);
  assert.equal(computed.total, 75.0);
  assert.equal(computed.conclusion, 'Đạt');
  assert.equal(crmState.companies[0].partnerEvalMigrated, true);
  /* Chạy lại: cờ đã đặt -> không thêm revision, không thêm request */
  const r2 = bridge.migratePartnerLegacy();
  assert.equal(r2.migrated, 0);
  const pub2 = JSON.parse(store.get('sava_publishing_v1'));
  assert.equal(pub2.requests.filter(r => r.kind === 'company' && r.entityId === 'cmig').length, 1);
  assert.equal(pub2.requests[0].revisions.length, 1);
});

test('tích hợp tĩnh vào index.html + cú pháp mọi script inline', () => {
  assert.ok(html.includes('${partnerSummaryBlockHTML(c)}'), 'openCompany chưa gắn khối tóm tắt Partner canonical');
  assert.ok(html.includes('partnerEvalBadge(c)'), 'vCompanies chưa gắn badge Partner');
  assert.ok(html.includes('id="partnerPager"'), 'thiếu modal one-pager');
  /* Form chấm Partner cũ đã gỡ có chủ đích — không được quay lại */
  assert.ok(!html.includes('partnerEvalSection'), 'partnerEvalSection (đã gỡ) vẫn còn trong index.html');
  assert.ok(!html.includes('function savePartnerEval'), 'savePartnerEval (đã gỡ) vẫn còn trong index.html');
  assert.ok(!/id="pe_/.test(html), 'vẫn còn id pe_* trong index.html');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length >= 2, 'không trích được script inline');
  blocks.forEach((code, i) => {
    const f = path.join(os.tmpdir(), `sava-index-inline-${process.pid}-${i}.js`);
    fs.writeFileSync(f, code);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    finally { fs.unlinkSync(f); }
  });
});

/* ---- Hợp nhất taxonomy evidence (2026-10-28) ----
   Khẳng định MỚI có chủ đích:
   - PartnerEval dùng thang hợp nhất duy nhất từ shared.js; normalize đổi nhãn
     "Partner cung cấp" -> "Đối tác đã gửi" và giữ nguyên các nấc giữa.
   - Coverage loại mục "N/A" khỏi mẫu số (trước hợp nhất: N/A không tồn tại
     trong thang canonical nên mọi mục đều vào mẫu số 11). Fixture chuẩn
   75.0 / biên 85.0 ở các test trên KHÔNG đổi vì không dùng N/A. */
test('hợp nhất taxonomy: thang trạng thái duy nhất + normalize đổi nhãn, giữ nấc giữa', () => {
  assert.deepEqual([...realPartnerEval.EVIDENCE_STATUSES], ['Thiếu', 'Chưa rõ', 'Đã trao đổi', 'Đối tác đã gửi', 'Đã xác minh', 'N/A']);
  assert.equal(realPartnerEval.normalizeStatus('Partner cung cấp'), 'Đối tác đã gửi');
  const ev = api.peEmptyEval();
  ev.evidence.track.status = 'Partner cung cấp';
  ev.evidence.team.status = 'Đã trao đổi';
  ev.evidence.data.status = 'N/A';
  const n = api.peNormalize(ev);
  assert.equal(n.evidence.track.status, 'Đối tác đã gửi');
  assert.equal(n.evidence.team.status, 'Đã trao đổi');
  assert.equal(n.evidence.data.status, 'N/A');
});
test('hợp nhất taxonomy: coverage loại "N/A" khỏi mẫu số, fixture chuẩn vẫn 75.0 "Đạt"', () => {
  const ev = makeEval({});
  /* Đổi 6 mục chưa-kể-production thành N/A, giữ 5 mục đã xác minh:
     makeEval đánh dấu verified theo thứ tự [7 pillar..., 4 ô con...]:
     đặt lại thủ công cho rõ: 5 verified + 6 N/A trên đúng 11 mục. */
  const items = [...api.PE_PILLARS.map(([k]) => ev.evidence[k]), ...api.PE_PROD_SUBS.map(([k]) => ev.evidence.productionSubs[k])];
  items.forEach((t, i) => { t.status = i < 5 ? 'Đã xác minh' : 'N/A'; });
  const r = peCompute(ev);
  assert.equal(r.coverage.verified, 5);
  assert.equal(r.coverage.total, 5);
  assert.equal(r.coverage.excludedNA, 6);
  assert.equal(r.coverage.pct, 100);
  assert.equal(r.evidenceGate, 'ĐẠT');
  assert.equal(r.partnerFit, 75.0);
  assert.equal(r.conclusion, 'Đạt');
  /* Toàn bộ N/A -> mẫu số 0 -> pct 0, không chia cho 0 */
  items.forEach(t => { t.status = 'N/A'; });
  const r0 = peCompute(ev);
  assert.equal(r0.coverage.total, 0);
  assert.equal(r0.coverage.pct, 0);
});
test('hợp nhất taxonomy: migrateState (kho CRM) đổi nhãn trạng thái trên c.partnerEval', () => {
  assert.equal(typeof sharedCtx.migrateState, 'function');
  const s = sharedCtx.migrateState({
    members: [], companies: [{ id: 'cx', name: 'X', roles: {}, partnerEval: { evidence: { track: { status: 'Partner cung cấp', note: '' }, productionSubs: { capacity: { status: 'Partner cung cấp', note: '' } } } } }],
    games: [], deals: [], leads: [], tasks: [], activities: [],
  });
  assert.equal(s.companies[0].partnerEval.evidence.track.status, 'Đối tác đã gửi');
  assert.equal(s.companies[0].partnerEval.evidence.productionSubs.capacity.status, 'Đối tác đã gửi');
});
/* ---- Đợt 1 QA vòng 3 (A1/A2/A12/A6 ở shared.js) ---- */
function loadSharedWithRaw(raw) {
  const store = new Map();
  if (raw !== null && raw !== undefined) store.set('sava_crm_shared_v1', raw);
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
  const ctx = vm.createContext({ console, localStorage: ls });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), ctx, { filename: 'shared.js' });
  return { ctx, store, state: ctx.loadState() };
}
test('A1/A2: loadState coi mảng và JSON scalar là dữ liệu hỏng — backup + banner, không trả mảng, không ghi đè key chính', () => {
  for (const raw of ['[1,2]', 'null', '"hello"', '123', 'true']) {
    const { ctx, store, state } = loadSharedWithRaw(raw);
    assert.ok(!Array.isArray(state), 'state không được là mảng với raw ' + raw);
    assert.ok(Array.isArray(state.companies) && Array.isArray(state.deals));
    assert.equal(ctx.CRM_LOAD_ISSUE && ctx.CRM_LOAD_ISSUE.type, 'corrupt', 'thiếu cờ corrupt với raw ' + raw);
    const backup = JSON.parse(store.get('sava_crm_shared_v1__corrupt_backup'));
    assert.equal(backup.raw, raw);
    /* Key chính giữ nguyên raw hỏng cho tới lần save hợp lệ đầu tiên */
    assert.equal(store.get('sava_crm_shared_v1'), raw);
  }
  /* Raw hợp lệ (object thuần) vẫn load + chuẩn hoá + ghi lại như cũ */
  const ok = loadSharedWithRaw('{"members":[],"companies":[],"games":[],"deals":[],"leads":[],"tasks":[],"activities":[]}');
  assert.ok(Array.isArray(ok.state.companies));
  assert.equal(ok.ctx.CRM_LOAD_ISSUE, undefined);
  assert.ok(JSON.parse(ok.store.get('sava_crm_shared_v1')).companies !== undefined);
});
test('A12/A6: migrateState chuẩn hoá ở biên — roles mảng -> {}, member trùng id giữ 1, id số -> chuỗi, entity mảng/scalar bị loại, status lạ -> "Chưa rõ"', () => {
  const s = sharedCtx.migrateState({
    members: [{ id: 'a', name: 'A Đầu', role: 'BD', active: true }, { id: 'a', name: 'A Trùng', role: 'BD', active: true }, ['mảng']],
    companies: [{ id: 7, name: 'Num Co', roles: [1, 2], partnerEval: { evidence: { track: { status: 'Trạng thái lạ', note: '' } } } }],
    games: [{ id: 9, title: 'G', company: 7 }],
    deals: [['deal-dạng-mảng'], 'deal-scalar', { id: 11, company: 7, game: 9, leads: [3, 'l2'] }],
    leads: ['lead-scalar', { id: 12, name: 'L', company: 7, person: 'P' }],
    tasks: [{ id: 13, deal: 11 }], activities: [{ id: 14, deal: 11 }],
  });
  assert.equal(s.members.length, 1); assert.equal(s.members[0].name, 'A Đầu');
  assert.equal(s.companies[0].id, '7'); assert.deepEqual({ ...s.companies[0].roles }, {});
  assert.equal(s.companies[0].partnerEval.evidence.track.status, 'Chưa rõ');
  assert.equal(s.games[0].id, '9'); assert.equal(s.games[0].company, '7');
  assert.equal(s.deals.length, 1); assert.equal(s.deals[0].id, '11'); assert.equal(s.deals[0].company, '7');
  assert.deepEqual([...s.deals[0].leads], ['3', 'l2']);
  assert.equal(s.leads.length, 1); assert.equal(s.leads[0].company, '7');
  assert.equal(s.tasks[0].deal, '11');
  /* PartnerEval.normalize: status lạ cũng về "Chưa rõ" (fallback strict duy nhất) */
  assert.equal(realPartnerEval.normalize({ evidence: { track: { status: 'Lạ', note: '' } } }).evidence.track.status, 'Chưa rõ');
  assert.equal(realPartnerEval.normalizeStatusStrict('Partner cung cấp'), 'Đối tác đã gửi');
  assert.equal(sharedCtx.migrateState([1, 2]).companies !== undefined, true);
  assert.ok(!Array.isArray(sharedCtx.migrateState([1, 2])));
});

/* ---- Đợt 1 QA vòng 3 (bridge: A3/A4/A5/A6/A7/B3) ---- */
function bridgeCtxFor({ companies, games = [], pubRaw, failPubWrite = false }) {
  const store = new Map();
  if (pubRaw !== undefined) store.set('sava_publishing_v1', typeof pubRaw === 'string' ? pubRaw : JSON.stringify(pubRaw));
  const ls = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (failPubWrite && k === 'sava_publishing_v1') throw new Error('quota'); store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), ctx, { filename: 'shared.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-score.js'), 'utf8'), ctx, { filename: 'publishing-score.js' });
  ctx.S = { members: [], deals: [], games, leads: [], tasks: [], activities: [], companies };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-bridge.js'), 'utf8'), ctx, { filename: 'publishing-bridge.js' });
  return { ctx, store, bridge: ctx.window.PublishingBridge };
}
const studioCo = (id, extra = {}) => ({ id, name: 'Studio ' + id, type: 'Game studio', roles: { publishing: 'Game studio' }, contact: '', phone: '', last: '', ...extra });
test('A3: canonical có current thật + revisions=[] thì canonical thắng — migration không ghi đè', () => {
  const current = { entries: { track: { score: 5, status: 'Đã xác minh', note: 'Đã chấm thật', source: 'src' } }, gates: {} };
  const { store, bridge } = bridgeCtxFor({
    companies: [studioCo('ca3', { partnerEval: makeEval({}) })],
    pubRaw: { version: 1, marketUpdates: [], requests: [{ id: 'REQ-A3', kind: 'company', entityId: 'ca3', status: 'Đang đánh giá', current, revisions: [], revision: 0 }] },
  });
  const r = bridge.migratePartnerLegacy();
  assert.equal(r.migrated, 0); assert.equal(r.flagged, 1);
  const req = JSON.parse(store.get('sava_publishing_v1')).requests[0];
  assert.equal(req.current.entries.track.score, 5);
  assert.equal(req.current.entries.track.note, 'Đã chấm thật');
  assert.deepEqual([...(req.revisions || [])], []);
});
test('A4: kho Publishing mảng / version lạ / ghi không được — migration không thành công giả, không đặt cờ, thử lại được', () => {
  const mk = pubRaw => bridgeCtxFor({ companies: [studioCo('ca4', { partnerEval: makeEval({}) })], pubRaw });
  const v99 = mk({ version: 99, requests: [], marketUpdates: [] });
  const r99 = v99.bridge.migratePartnerLegacy();
  assert.equal(r99.migrated, 0); assert.equal(r99.error, 'store-version');
  assert.ok(!v99.ctx.S.companies[0].partnerEvalMigrated);
  assert.equal(JSON.parse(v99.store.get('sava_publishing_v1')).version, 99);
  const arr = mk('[]');
  assert.equal(arr.bridge.migratePartnerLegacy().error, 'store-shape');
  assert.ok(!arr.ctx.S.companies[0].partnerEvalMigrated);
  const ro = bridgeCtxFor({ companies: [studioCo('ca4', { partnerEval: makeEval({}) })], pubRaw: { version: 1, requests: [], marketUpdates: [] }, failPubWrite: true });
  const rro = ro.bridge.migratePartnerLegacy();
  assert.equal(rro.migrated, 0); assert.equal(rro.error, 'write-failed');
  assert.ok(!ro.ctx.S.companies[0].partnerEvalMigrated);
});
test('A5: canonical bị xoá -> cờ tự hồi và migrate lại; nhiều request -> migration và partnerSummary chọn CÙNG request cuối mảng', () => {
  /* Cờ đặt sẵn nhưng không còn request nào -> chạy lại từ c.partnerEval */
  const healed = bridgeCtxFor({ companies: [studioCo('ca5', { partnerEval: makeEval({}), partnerEvalMigrated: true })] });
  const rh = healed.bridge.migratePartnerLegacy();
  assert.equal(rh.migrated, 1);
  assert.equal(JSON.parse(healed.store.get('sava_publishing_v1')).requests.filter(x => x.entityId === 'ca5').length, 1);
  /* Hai request cùng entity: request CUỐI là canonical cho cả hai bề mặt */
  const oldReq = { id: 'OLD', kind: 'company', entityId: 'cmulti', status: 'Hoàn tất', current: { entries: {}, gates: {} }, revisions: [{ entries: {}, gates: {} }], revision: 1 };
  const lastReq = { id: 'LAST', kind: 'company', entityId: 'cmulti', status: 'Chờ đánh giá', current: null, revisions: [], revision: 0 };
  const multi = bridgeCtxFor({ companies: [studioCo('cmulti', { partnerEval: makeEval({}) })], pubRaw: { version: 1, marketUpdates: [], requests: [oldReq, lastReq] } });
  const before = multi.bridge.partnerSummary('cmulti');
  assert.equal(before.requestId, 'LAST'); assert.equal(before.versions, 0);
  const rm = multi.bridge.migratePartnerLegacy();
  assert.equal(rm.migrated, 1); assert.equal(rm.flagged, 0);
  const reqs = JSON.parse(multi.store.get('sava_publishing_v1')).requests;
  assert.equal(reqs.find(x => x.id === 'OLD').revisions.length, 1);
  assert.equal(reqs.find(x => x.id === 'OLD').current.entries.track, undefined);
  const last = reqs.find(x => x.id === 'LAST');
  assert.equal(last.revisions.length, 1);
  assert.equal(multi.ctx.window.PublishingScore.company(last.current).total, 75.0);
  const after = multi.bridge.partnerSummary('cmulti');
  assert.equal(after.requestId, 'LAST'); assert.equal(after.versions, 1);
  assert.equal(after.computed.partnerFit, 75.0);
});
test('A6/A7: migration mang production pillar evidence + reviewDate, status lạ về "Chưa rõ" (không nâng "Đã trao đổi"), coverage/Fit không đổi', () => {
  const ev = makeEval({ verifiedCount: 0 });
  ev.evidence.production = { status: 'Đã xác minh', note: 'Bằng chứng cấp pillar Production' };
  ev.evidence.track.status = 'Trạng thái lạ';
  ev.reviewDate = '2026-10-15';
  const { ctx, store, bridge } = bridgeCtxFor({ companies: [studioCo('ca7', { partnerEval: ev })] });
  assert.equal(bridge.migratePartnerLegacy().migrated, 1);
  const rev = JSON.parse(store.get('sava_publishing_v1')).requests[0].current;
  assert.equal(rev.productionPillarEvidence.status, 'Đã xác minh');
  assert.equal(rev.productionPillarEvidence.note, 'Bằng chứng cấp pillar Production');
  assert.equal(rev.reviewDate, '2026-10-15');
  assert.equal(rev.entries.track.status, 'Chưa rõ');
  assert.equal(rev.entries.deal.status, 'Chưa rõ');
  /* Adapter suy coverage từ entries như trước: mọi entry đều "Chưa rõ" -> 0%;
     điểm giữ nguyên fixture -> Fit 75.0 */
  const computed = ctx.window.PublishingScore.company(rev);
  assert.equal(computed.total, 75.0);
  assert.equal(computed.coveragePct, 0);
});
test('B3/B6: bridge gameSummary — v2 không hợp lệ / rỗng thì rơi về legacy; current{market,prototype} không scoresV2 vẫn tính là v2', () => {
  const { ctx, store, bridge } = bridgeCtxFor({ companies: [], games: [{ id: 'gb', title: 'Game B', own: 'partner' }] });
  const PS = ctx.window.PublishingScore;
  const le = s => ({ score: s, status: 'Đã xác minh', note: 'n', source: 's' });
  const legacyEntries = Object.fromEntries([...PS.market, ...PS.prototype].map(([k]) => [k, le(4)]));
  const setReq = current => store.set('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests: [{ id: 'GR', kind: 'game', entityId: 'gb', status: 'Đang đánh giá', current, revisions: [current], revision: 1, intake: {} }] }));
  setReq({ entries: legacyEntries, scoresV2: { market: { size: { score: 3.25 } }, prototype: {} } });
  let gs = bridge.gameSummary('gb');
  assert.equal(gs.v2, null); assert.ok(gs.legacy, 'v2 sai bước 0.5 phải rơi về legacy');
  assert.equal(bridge.hasValidGameV2({ scoresV2: { market: { size: { score: 3.25 } } } }), false);
  setReq({ entries: legacyEntries, scoresV2: { market: {}, prototype: {} } });
  gs = bridge.gameSummary('gb');
  assert.equal(gs.v2, null); assert.ok(gs.legacy, 'scoresV2 rỗng phải rơi về legacy');
  setReq({ entries: legacyEntries, market: { size: { score: 5 } }, prototype: { uaTest: { score: 5 } } });
  gs = bridge.gameSummary('gb');
  assert.ok(gs.v2, 'current{market,prototype} không scoresV2 vẫn là v2');
  assert.equal(gs.legacy, null);
  setReq({ entries: legacyEntries, scoresV2: { market: { size: { score: 5 } }, prototype: { uaTest: { score: 5 } } } });
  gs = bridge.gameSummary('gb');
  assert.ok(gs.v2); assert.equal(bridge.hasValidGameV2(gs.current), true);
});

test('hợp nhất taxonomy: bridge migration giữ nguyên nấc giữa (không còn ép Chưa rõ -> Đã trao đổi)', () => {
  const store = new Map();
  const localStorageStub = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const bCtx = vm.createContext({ console, localStorage: localStorageStub, addEventListener: () => {} });
  bCtx.window = bCtx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), bCtx, { filename: 'shared.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-score.js'), 'utf8'), bCtx, { filename: 'publishing-score.js' });
  const ev = makeEval({ verifiedCount: 3 });
  ev.evidence.track.status = 'Partner cung cấp';
  const crmState = {
    members: [], deals: [], games: [], leads: [], tasks: [], activities: [],
    companies: [{ id: 'cmig2', name: 'Studio Taxonomy', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '', partnerEval: ev }],
  };
  bCtx.S = crmState;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'publishing-bridge.js'), 'utf8'), bCtx, { filename: 'publishing-bridge.js' });
  const r1 = bCtx.window.PublishingBridge.migratePartnerLegacy();
  assert.equal(r1.migrated, 1);
  const pub = JSON.parse(store.get('sava_publishing_v1'));
  const rev = pub.requests.find(r => r.kind === 'company' && r.entityId === 'cmig2').current;
  /* track: nhãn cũ -> nhãn mới; pillar chưa xác minh giữ "Chưa rõ" (bản cũ ép thành "Đã trao đổi") */
  assert.equal(rev.entries.track.status, 'Đối tác đã gửi');
  assert.equal(rev.entries.data.status, 'Chưa rõ');
});
