/* Đợt bổ sung: (1) Trạng thái đánh giá 3 mức + nút "Yêu cầu đánh giá" phía BD
   (helper dùng chung PublishingBridge.evalStatus / evalBadge /
   evalRequestButtonHTML); (2) Đồng bộ thông tin liên quan CRM <-> đánh giá
   (live theo id cho định danh/mô tả, snapshot fallback cho request mồ côi,
   mechanic: request mở theo CRM hiện tại — request đã xong giữ mechanic đã
   chấm + ghi chú khác biệt, điểm/kết luận lịch sử không viết lại).
   Harness theo mẫu sẵn có: vm + localStorage stub (partner-a7 /
   publishing-page / bd-batch3). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ================= Harness bridge (shared + score + bridge THẬT) ================= */
function loadBridge({ companies = [], games = [], pubRaw } = {}) {
  const store = new Map();
  if (pubRaw !== undefined) store.set('sava_publishing_v1', typeof pubRaw === 'string' ? pubRaw : JSON.stringify(pubRaw));
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  vm.runInContext(read('publishing-score.js'), ctx, { filename: 'publishing-score.js' });
  ctx.S = { members: [], deals: [], games, leads: [], tasks: [], activities: [], companies };
  vm.runInContext(read('publishing-bridge.js'), ctx, { filename: 'publishing-bridge.js' });
  return { ctx, store, bridge: ctx.window.PublishingBridge, F: ctx.window.PublishingScore };
}
const studio = (id, extra = {}) => ({ id, name: 'Studio ' + id, type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '', ...extra });
const gameRec = (id, extra = {}) => ({ id, title: 'Game ' + id, own: 'partner', company: 'c1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', ...extra });
function v2Full(F, mech, status) {
  const rev = { scoresV2: { version: 'market-v2', fromMechanicId: mech, market: Object.fromEntries(F.market.map(([k]) => [k, { score: 5 }])), prototype: Object.fromEntries(F.prototype.map(([k]) => [k, { score: 5 }])) }, entries: {}, reviewer: 'mai', role: 'mkt', at: '2026-10-30T00:00:00.000Z' };
  if (status) rev.status = status;
  return rev;
}
function legacyFull(F) {
  const e = { score: 5, status: 'Đã xác minh', note: 'n', source: 's' };
  return { entries: Object.fromEntries([...F.market, ...F.prototype].map(([k]) => [k, { ...e }])), quality: 5, gate: 'PASS', reviewer: 'mai', role: 'mkt', at: '2026-10-30T00:00:00.000Z' };
}
function partnerFull(F) {
  const e = s => ({ score: s, status: 'Đã xác minh', note: 'n', source: 's' });
  const entries = {};
  ['track', 'team', 'data', 'collaboration', 'strategy', 'pipeline', 'capacity', 'cadence', 'milestone', 'liveops'].forEach(k => { entries[k] = e(5); });
  entries.deal = e(5);
  return { entries, gates: Object.fromEntries(F.gates.map(([k]) => [k, { value: 'PASS', note: 'n', source: 's' }])), reviewer: 'mai', role: 'mkt', at: '2026-10-30T00:00:00.000Z' };
}
const req = (kind, entityId, extra = {}) => ({ id: 'R-' + entityId + '-' + (extra.__n || '1'), kind, entityId, requestedBy: 'linh', assignee: 'mai', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-10-30T00:00:00.000Z', current: null, revisions: [], revision: 0, ...extra });

/* ================= (1) Trạng thái 3 mức — game ================= */
test('evalStatus game: none / waiting (Chờ + Chờ bổ sung) / done theo dữ kiện thật', () => {
  const { bridge, F } = loadBridge({ games: [gameRec('g1')], companies: [studio('c1')] });
  const from = bridge.evalStatusFromRequests;
  assert.equal(from('game', 'g1', []).state, 'none');
  assert.equal(from('game', 'g1', [req('game', 'g1')]).state, 'waiting');
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Chờ bổ sung' })]).state, 'waiting', 'Chờ bổ sung = request bị trả xin thêm bằng chứng, vẫn đang mở');
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Đang đánh giá' })]).label, 'Đang chờ đánh giá');
  /* done theo status Hoàn tất của request */
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Hoàn tất' })]).state, 'done');
  /* done theo revision v2 có quyết định hiệu lực dù status request chưa Hoàn tất */
  const revV2 = v2Full(F, 'MECH-008');
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Đang đánh giá', intake: { mechanicId: 'MECH-008' }, current: revV2, revisions: [revV2], revision: 1 })]).state, 'done');
  /* done theo legacy đủ dữ kiện (final có + completeness >= 80%) */
  const revLeg = legacyFull(F);
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Đang đánh giá', current: revLeg, revisions: [revLeg], revision: 1 })]).state, 'done');
  /* CHƯA done: v2 mới có 1 điểm (chưa ra quyết định) -> vẫn waiting */
  const revPartial = { scoresV2: { market: { size: { score: 5 } }, prototype: {} }, entries: {} };
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Đang đánh giá', intake: { mechanicId: 'MECH-008' }, current: revPartial, revisions: [revPartial], revision: 1 })]).state, 'waiting');
  /* CHƯA done: điểm v2 thuộc mechanic cũ (request còn mở, stale) -> waiting */
  assert.equal(from('game', 'g1', [req('game', 'g1', { status: 'Đang đánh giá', intake: { mechanicId: 'MECH-004' }, current: revV2, revisions: [revV2], revision: 1 })]).state, 'waiting');
  /* done có sẵn từ trước KHÔNG qua request đang mở: request cũ đã xong + request mới đang mở -> done thắng */
  const doneOld = req('game', 'g1', { __n: 'old', status: 'Hoàn tất', current: revV2, revisions: [revV2], revision: 1, intake: { mechanicId: 'MECH-008' } });
  const openNew = req('game', 'g1', { __n: 'new', status: 'Chờ đánh giá' });
  const st = from('game', 'g1', [doneOld, openNew]);
  assert.equal(st.state, 'done'); assert.equal(st.completedRequestId, doneOld.id);
  /* evalStatus (đọc kho thật + entity còn tồn tại) khớp đường thuần */
  const env = loadBridge({ games: [gameRec('gx')], companies: [], pubRaw: { version: 1, marketUpdates: [], requests: [req('game', 'gx')] } });
  assert.equal(env.bridge.evalStatus('game', 'gx').state, 'waiting');
  assert.equal(env.bridge.evalStatus('game', 'khong-co').state, 'none', 'entity không còn -> none (không hiện badge ma)');
});

test('evalStatus company: none / waiting / done (Partner Fit tính được) + partial chưa done', () => {
  const { bridge, F } = loadBridge({ companies: [studio('c1')] });
  const from = bridge.evalStatusFromRequests;
  assert.equal(from('company', 'c1', []).state, 'none');
  assert.equal(from('company', 'c1', [req('company', 'c1')]).state, 'waiting');
  const revFull = partnerFull(F);
  assert.equal(from('company', 'c1', [req('company', 'c1', { status: 'Đang đánh giá', current: revFull, revisions: [revFull], revision: 1 })]).state, 'done', 'revision Partner đủ 7 pillar (Fit tính được) = đã đánh giá');
  assert.equal(from('company', 'c1', [req('company', 'c1', { status: 'Hoàn tất' })]).state, 'done');
  const revPartial = { entries: { track: { score: 5, status: 'Đã xác minh', note: 'n', source: 's' } }, gates: {} };
  assert.equal(from('company', 'c1', [req('company', 'c1', { status: 'Đang đánh giá', current: revPartial, revisions: [revPartial], revision: 1 })]).state, 'waiting', 'mới 1 pillar -> Fit null -> chưa hoàn thành');
});

test('badge + nút yêu cầu: nhãn 3 mức, chống trùng (waiting -> "Đã yêu cầu — đang chờ"), done -> ẩn nút, own=ours không bị chặn, company ngoài studio không hiện nút', () => {
  const env = loadBridge({
    companies: [studio('c1'), { id: 'c9', name: 'DN AI', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: '', phone: '', last: '' }],
    games: [gameRec('g1'), gameRec('g-ours', { own: 'ours', company: undefined })],
    pubRaw: { version: 1, marketUpdates: [], requests: [] },
  });
  const B = env.bridge;
  assert.ok(B.evalBadge('game', 'g1').includes('Chưa đánh giá'));
  let btn = B.evalRequestButtonHTML('game', 'g1');
  assert.ok(btn.includes('Yêu cầu đánh giá') && btn.includes('publishing.html?tab=reviews&amp;kind=game&amp;id=g1'.replaceAll('&amp;', '&')) || btn.includes('kind=game'), 'nút phải trỏ deep-link publishing.html?kind=game&id=');
  assert.ok(btn.includes('id=g1'));
  /* game của Sava (own='ours') vẫn gửi đánh giá được */
  assert.ok(B.evalRequestButtonHTML('game', 'g-ours').includes('Yêu cầu đánh giá'));
  /* đã có request đang mở -> không tạo thêm, nút đổi trạng thái */
  env.store.set('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests: [req('game', 'g1'), req('company', 'c1')] }));
  assert.ok(B.evalBadge('game', 'g1').includes('Đang chờ đánh giá'));
  btn = B.evalRequestButtonHTML('game', 'g1');
  assert.ok(btn.includes('Đã yêu cầu — đang chờ'), 'nút waiting phải ghi "Đã yêu cầu — đang chờ"');
  assert.ok(btn.includes('id=g1'), 'bấm vào mở được đúng request/entity đó qua deep-link');
  assert.ok(B.evalRequestButtonHTML('company', 'c1').includes('Đã yêu cầu — đang chờ'));
  /* công ty không đủ điều kiện studio -> không nút Partner */
  assert.equal(B.evalRequestButtonHTML('company', 'c9'), '');
  /* đã đánh giá xong -> nút ẩn, chỉ còn nhãn */
  const revFull = partnerFull(env.F);
  env.store.set('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests: [req('company', 'c1', { status: 'Hoàn tất', current: revFull, revisions: [revFull], revision: 1 })] }));
  assert.ok(B.evalBadge('company', 'c1').includes('Đã đánh giá'));
  assert.equal(B.evalRequestButtonHTML('company', 'c1'), '');
  /* gameBadge (danh sách game) nay chính là badge 3 mức dùng chung */
  assert.equal(B.gameBadge('g1'), B.evalBadge('game', 'g1'));
});

test('tĩnh: index.html dùng helper dùng chung ở danh sách + drawer; publishing.js giữ đường tạo request duy nhất + snapshot + requestedBy mặc định', () => {
  const html = read('index.html'), pub = read('publishing.js');
  assert.ok(html.includes('PublishingBridge.evalBadge("company", c.id)'), 'vCompanies chưa gắn evalBadge company');
  assert.ok(html.includes('PublishingBridge.gameBadge(g.id)'), 'vGames chưa dùng gameBadge (= evalBadge game)');
  assert.ok(html.includes('evalRequestButtonHTML'), 'drawer company chưa gắn nút yêu cầu qua helper bridge');
  assert.ok(read('publishing-bridge.js').includes('${evalRequestButtonHTML(\'game\', id)}'), 'drawer game (bridge.summary) chưa gắn nút yêu cầu');
  /* Đường tạo duy nhất: submitRequest của publishing.js (chống trùng bằng find + mở request sẵn có) */
  const submit = pub.slice(pub.indexOf('function submitRequest'), pub.indexOf('const evidenceLabels'));
  assert.ok(submit.includes("s.requests.find(r=>r.kind===kind&&r.entityId===entityId)"), 'submitRequest mất chống trùng');
  assert.ok(submit.includes('entitySnapshot:entitySnapshotFor(kind,entity(c,kind,entityId))'), 'submitRequest chưa chụp entitySnapshot');
  assert.ok(pub.includes('currentRequesterId()'), 'requestForm chưa mặc định requestedBy = member đang đăng nhập');
  /* BD không ghi kho Publishing trực tiếp ở index.html: không có đường ghi thứ hai */
  assert.ok(!html.includes("localStorage.setItem(\"sava_publishing_v1\"") && !html.includes("localStorage.setItem('sava_publishing_v1'"), 'index.html không được ghi trực tiếp kho Publishing');
});

test('adapter Supabase: entitySnapshot sống sót qua publishingStateToRows -> publishingRowsToState (legacy_extra)', () => {
  const A = require('../supabase-adapter.js');
  const snap = { name: 'Game Snap', genre: 'Puzzle / Merge', platform: 'Android', stage: 'Beta', desc: 'd', buildUrl: 'https://b', trailerUrl: 'https://t' };
  const state = { version: 1, marketUpdates: [], requests: [req('game', 'g1', { entitySnapshot: snap })] };
  const back = A.publishingRowsToState(A.publishingStateToRows(state, new Set()));
  assert.deepEqual(back.requests[0].entitySnapshot, snap);
});

/* ================= Harness publishing (CRM + Publishing THẬT) ================= */
function makePubElement() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPub({ crmState, requests = [], role = 'bd', search = '' } = {}) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests }));
  const elements = new Map();
  const docListeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: Object.assign(makePubElement(), { dataset: { role } }), activeElement: null,
      querySelector: s => { if (!elements.has(s)) elements.set(s, makePubElement()); return elements.get(s); },
      querySelectorAll: () => [], addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); } },
    location: { search, href: 'http://localhost/publishing.html' + search }, history: { replaceState() {} },
    addEventListener() {}, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const openReview = id => {
    const btn = { dataset: { review: id }, hasAttribute: () => false };
    (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
    return elements.get('#editor').innerHTML;
  };
  const setCrm = next => ls.setItem('sava_crm_shared_v1', JSON.stringify(next));
  return { ctx, ls, store, elements, openReview, setCrm, eff: ctx.window.PublishingEffective };
}
const MEMBERS = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }];
const crmBase = (games, companies) => ({ members: MEMBERS, companies, games, deals: [], leads: [], tasks: [], activities: [] });

test('(a) đồng bộ game: sửa tên + mechanic (genre) + link ở CRM -> request ĐANG CHỜ hiển thị/mechanic hiệu lực theo giá trị mới', () => {
  const g = { id: 'g1', title: 'Tên Cũ', own: 'partner', company: 'c1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: 'mô tả cũ', bdNote: '', buildUrl: '', trailerUrl: '' };
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '' };
  const rOpen = req('game', 'g1', { intake: { mechanicId: 'MECH-008', genre: 'Puzzle', subGenre: 'Match-3' } });
  const env = loadPub({ crmState: crmBase([g], [co]), requests: [rOpen], role: 'mkt' });
  /* Sửa ở CRM: tên mới, genre mới (mechanic Merge), trailer mới */
  env.setCrm(crmBase([{ ...g, title: 'Tên Mới Nhất', genre: 'Puzzle / Merge', trailerUrl: 'https://youtube.com/trailer-moi', desc: 'mô tả mới' }], [co]));
  const effIntake = env.eff.effectiveIntake(rOpen);
  assert.equal(effIntake.mechanicId, 'MECH-004', 'mechanic hiệu lực của request mở phải theo CRM hiện tại (Merge)');
  assert.equal(effIntake.genre, 'Puzzle'); assert.equal(effIntake.subGenre, 'Merge');
  assert.equal(effIntake.videoUrl, 'https://youtube.com/trailer-moi');
  assert.equal(env.eff.effectiveMechanicId(rOpen), 'MECH-004');
  const dlg = env.openReview(rOpen.id);
  assert.ok(dlg.includes('Tên Mới Nhất'), 'dialog phải hiện tên game MỚI từ CRM');
  assert.ok(!dlg.includes('Tên Cũ'), 'dialog không còn tên cũ');
  assert.ok(dlg.includes('Merge'), 'dialog phải hiện mechanic mới (Merge)');
  assert.ok(dlg.includes('https://youtube.com/trailer-moi'), 'dialog phải hiện link trailer mới từ CRM');
  assert.ok(dlg.includes('theo CRM hiện tại'), 'khối thông tin hồ sơ phải ghi nguồn CRM hiện tại');
});

test('(a2) game ĐÃ ĐÁNH GIÁ XONG: tên mới hiển thị, điểm/kết luận cũ nguyên vẹn, có ghi chú mechanic khác biệt', () => {
  const g = { id: 'g1', title: 'Tên Cũ', own: 'partner', company: 'c1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' };
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '' };
  const env0 = loadBridge({ games: [g], companies: [co] });
  const revDone = v2Full(env0.F, 'MECH-008', 'Hoàn tất');
  const rDone = req('game', 'g1', { status: 'Hoàn tất', intake: { mechanicId: 'MECH-008', genre: 'Puzzle' }, current: revDone, revisions: [revDone], revision: 1 });
  const before = JSON.stringify(rDone.revisions);
  const env = loadPub({ crmState: crmBase([g], [co]), requests: [rDone], role: 'bd' });
  env.setCrm(crmBase([{ ...g, title: 'Tên Sau Khi Đổi', genre: 'Puzzle / Merge' }], [co]));
  /* Kết quả hiệu lực giữ nguyên: không stale, Final 100, Greenlight, có cờ diverged */
  const eff = env.eff.effectiveGameResult({ ...rDone, intake: { mechanicId: 'MECH-004' } });
  assert.equal(eff.type, 'v2'); assert.equal(eff.final, 100); assert.equal(eff.decision, 'Greenlight');
  assert.equal(eff.mechanicDiverged, true);
  /* bridge phía BD cũng giữ quyết định + cờ diverged (không vô hiệu điểm đã xong) */
  const envB = loadBridge({ games: [{ ...g, genre: 'Puzzle / Merge' }], companies: [co], pubRaw: { version: 1, marketUpdates: [], requests: [{ ...rDone, intake: { mechanicId: 'MECH-004' } }] } });
  const gs = envB.bridge.gameSummary('g1');
  assert.equal(gs.mechanicMismatch, false); assert.equal(gs.mechanicDiverged, true);
  assert.equal(gs.v2.decision, 'Greenlight');
  assert.ok(envB.bridge.summary('game', 'g1').includes('giữ nguyên theo mechanic đã chấm'));
  /* Dialog: tên MỚI + ghi chú khác biệt + revision trong kho không bị viết lại */
  const dlg = env.openReview(rDone.id);
  assert.ok(dlg.includes('Tên Sau Khi Đổi'), 'tên hiển thị phải theo CRM hiện tại');
  assert.ok(dlg.includes('khác mechanic đã chấm') || dlg.includes('KHÁC mechanic đã chấm'), 'phải có ghi chú mechanic khác biệt cho bản đã xong');
  assert.ok(dlg.includes('Greenlight'), 'kết luận cũ vẫn hiển thị nguyên vẹn');
  const stored = JSON.parse(env.ls.getItem('sava_publishing_v1'));
  assert.equal(JSON.stringify(stored.requests[0].revisions), before, 'mở xem không được viết lại revision lịch sử');
});

test('(b) đồng bộ company: sửa tên + đầu mối ở CRM -> Partner evaluation hiển thị mới; bản đã xong giữ nguyên điểm', () => {
  const co = { id: 'c1', name: 'Studio Tên Cũ', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An — cũ', phone: '0901', last: '' };
  const env0 = loadBridge({ companies: [co] });
  const revFull = partnerFull(env0.F);
  const rDone = req('company', 'c1', { status: 'Hoàn tất', current: revFull, revisions: [revFull], revision: 1 });
  const before = JSON.stringify(rDone.revisions);
  const env = loadPub({ crmState: crmBase([], [co]), requests: [rDone], role: 'bd' });
  env.setCrm(crmBase([], [{ ...co, name: 'Studio Tên Mới', contact: 'Bình — mới', phone: '0902' }]));
  const dlg = env.openReview(rDone.id);
  assert.ok(dlg.includes('Studio Tên Mới'), 'dialog Partner phải hiện tên công ty MỚI từ CRM');
  assert.ok(dlg.includes('Bình — mới'), 'đầu mối mới từ CRM phải hiện ở khối thông tin hồ sơ');
  assert.ok(dlg.includes('theo CRM hiện tại'));
  const stored = JSON.parse(env.ls.getItem('sava_publishing_v1'));
  assert.equal(JSON.stringify(stored.requests[0].revisions), before, 'revision Partner lịch sử không bị viết lại');
});

test('(c) request mồ côi: hiển thị bằng entitySnapshot, không lỗi; mồ côi cũ không snapshot -> fallback intake + nhãn đã gỡ', () => {
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '' };
  const snap = { name: 'Game Mồ Côi Snap', genre: 'Puzzle / Merge', platform: 'Android', stage: 'Beta', desc: 'mô tả chụp', buildUrl: 'https://build.example/x', trailerUrl: 'https://youtube.com/snap' };
  const rOrphan = req('game', 'gx-da-xoa', { intake: { mechanicId: 'MECH-004', genre: 'Puzzle' }, entitySnapshot: snap });
  const rOrphanOld = req('game', 'gy-da-xoa', { __n: 'old', intake: { mechanicId: 'MECH-008', genre: 'Puzzle', subGenre: 'Match-3' } });
  const env = loadPub({ crmState: crmBase([], [co]), requests: [rOrphan, rOrphanOld], role: 'bd' });
  let dlg;
  assert.doesNotThrow(() => { dlg = env.openReview(rOrphan.id); });
  assert.ok(dlg.includes('Game Mồ Côi Snap'), 'mồ côi phải hiện tên từ snapshot');
  assert.ok(dlg.includes('dữ liệu chụp trong yêu cầu'), 'phải ghi rõ nguồn snapshot');
  assert.ok(dlg.includes('https://youtube.com/snap'));
  let dlg2;
  assert.doesNotThrow(() => { dlg2 = env.openReview(rOrphanOld.id); });
  assert.ok(dlg2.includes('Hồ sơ này đã được gỡ khỏi CRM'), 'mồ côi cũ giữ cảnh báo C15');
  assert.ok(dlg2.includes('không có dữ liệu chụp'), 'mồ côi cũ không snapshot phải ghi rõ fallback intake');
});

test('thiếu mechanic: deep-link mở FORM điền sẵn (không tạo request im lặng); có mechanic suy được thì prefill sẵn trong form', () => {
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '', last: '' };
  const gNoMech = { id: 'g-nomech', title: 'Dice Game', own: 'partner', company: 'c1', genre: 'Roguelike / Dice', platform: 'Android', stage: 'Alpha', emoji: '🎲', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' };
  const env = loadPub({ crmState: crmBase([gNoMech], [co]), requests: [], role: 'bd', search: '?tab=reviews&kind=game&id=g-nomech' });
  const form = env.elements.get('#editor').innerHTML;
  assert.ok(form.includes('Gửi yêu cầu đánh giá'), 'phải mở form yêu cầu cho BD bổ sung');
  assert.ok(form.includes('Chưa khớp mechanic trong dữ liệu'), 'form phải để trống mechanic cho BD chọn tay khi suy không ra');
  assert.equal(JSON.parse(env.ls.getItem('sava_publishing_v1')).requests.length, 0, 'mở form KHÔNG được tự tạo request thiếu dữ kiện');
  const gMech = { ...gNoMech, id: 'g-mech', title: 'Match Game', genre: 'Puzzle / Match-3' };
  const env2 = loadPub({ crmState: crmBase([gMech], [co]), requests: [], role: 'bd', search: '?tab=reviews&kind=game&id=g-mech' });
  const form2 = env2.elements.get('#editor').innerHTML;
  assert.ok(form2.includes('value="MECH-008" selected') || form2.includes('MECH-008'), 'mechanic suy từ genre phải được điền sẵn trong form');
  /* game của Sava qua deep-link cũng mở form được (own=ours không bị chặn) */
  const gOurs = { ...gMech, id: 'g-ours2', own: 'ours', company: undefined };
  const env3 = loadPub({ crmState: crmBase([gOurs], [co]), requests: [], role: 'bd', search: '?tab=reviews&kind=game&id=g-ours2' });
  assert.ok(env3.elements.get('#editor').innerHTML.includes('Gửi yêu cầu đánh giá'));
});

/* ================= (d) Đồng bộ nội bộ CRM (harness index.html THẬT) ================= */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: MEMBERS,
    companies: [
      { id: 'c1', name: 'Hanbit Fixture', type: 'Publisher', roles: { game_studio: 'Publisher' }, contact: 'Ms. Yoon', phone: '', last: 'Hôm qua' },
      { id: 'c3', name: 'Pixel Ant Studio', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An — Founder', phone: '', last: 'Hôm nay' },
    ],
    games: [{ id: 'g3', title: 'Tiny Farm Story', own: 'partner', company: 'c3', genre: 'Farm / Simulation', platform: 'Android', stage: 'Beta', emoji: '🌾', desc: 'd', bdNote: 'note', buildUrl: '', trailerUrl: '' }],
    deals: [{ id: 'dz', line: 'ai', title: 'Deal Fixture', company: 'c1', stage: 'poc', owner: 'zac', due: '', idle: 0, custom: {}, amount: 100, cur: 'VND' },
            { id: 'dg', line: 'publishing', title: 'Deal Game', company: 'c3', game: 'g3', stage: 'screening', owner: 'linh', due: '', idle: 0, custom: {}, leads: [] }],
    leads: [], tasks: [], activities: [],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('(d) nội bộ CRM: đổi tên company/game -> danh sách, drawer, deal liên quan đều hiện tên mới (resolve theo id)', () => {
  const { run, getEl } = loadIndex();
  run(`S.companies.find(c=>c.id==='c3').name = 'Pixel Ant Đổi Tên';
       S.companies.find(c=>c.id==='c1').name = 'Hanbit Đổi Tên';
       S.games.find(g=>g.id==='g3').title = 'Tiny Farm Đổi Tên';`);
  run("curView='companies'; render();");
  assert.ok(getEl('view').innerHTML.includes('Pixel Ant Đổi Tên'), 'danh sách công ty phải hiện tên mới');
  run("curView='games'; render();");
  assert.ok(getEl('view').innerHTML.includes('Tiny Farm Đổi Tên'), 'danh sách game phải hiện tên mới');
  assert.ok(getEl('view').innerHTML.includes('Chưa đánh giá'), 'danh sách game phải hiện nhãn trạng thái đánh giá 3 mức');
  run("openCompany('c3');");
  let drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Pixel Ant Đổi Tên') && drawer.includes('Tiny Farm Đổi Tên'), 'drawer công ty phải hiện tên công ty + tên game mới');
  assert.ok(drawer.includes('Trạng thái đánh giá:'), 'drawer công ty phải hiện trạng thái đánh giá');
  run("openGame('g3');");
  drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Tiny Farm Đổi Tên') && drawer.includes('Pixel Ant Đổi Tên'), 'drawer game phải hiện tên game + tên studio mới');
  assert.ok(drawer.includes('Trạng thái đánh giá:'), 'drawer game phải hiện trạng thái đánh giá (qua bridge.summary)');
  run("openDeal('dg');");
  drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Pixel Ant Đổi Tên') && drawer.includes('Tiny Farm Đổi Tên'), 'drawer deal phải hiện tên công ty + game mới theo id');
  run("curLine='publishing'; curView='board'; render();");
  assert.ok(getEl('view').innerHTML.includes('Pixel Ant Đổi Tên') && getEl('view').innerHTML.includes('Tiny Farm Đổi Tên'), 'thẻ deal trên board phải hiện tên công ty + game mới theo id');
  run("openDeal('dz');");
  assert.ok(getEl('drawer').innerHTML.includes('Hanbit Đổi Tên'), 'drawer deal phải hiện tên công ty mới theo id');
});
