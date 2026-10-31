/* FIX-3 (cụm Publishing): A1/C13 canonical, A3 studio sở hữu, A11 link
   member/lead, A12 isStudioCompany thống nhất, A14 picker ngữ cảnh,
   B1 ghi chú điểm thô, B4 view-first khối BD, B8 badge market form,
   B10 nhãn "Chưa đánh giá", B14 confirm xoá tiếng Việt, B15 confirm
   requeue xoá điểm, B17 nhãn Trạng thái, C1 MKT không chạm intake,
   C4 baseline + stale-guard, C6 migrate hoãn tới data-ready + kiểm
   chứng canonical trước khi đặt cờ, mục đã biết: ghi chú lệch mechanic
   ở bridge.summary so theo mechanic suy từ genre CRM. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const pub = read('publishing.js'), bridgeSrc = read('publishing-bridge.js');

/* ================= Harness publishing đầy đủ ================= */
function makeEl() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    insertBefore(c) { this._inserted = c; return c; }, appendChild(c) { this._inserted = c; return c; },
    focus() {}, close() { this.open = false; }, showModal() { this.open = true; },
    scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPub({ crmState, requests = [], role = 'bd', search = '', confirmFn } = {}) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests }));
  const elements = new Map();
  const docListeners = {}, winListeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: Object.assign(makeEl(), { dataset: { role } }), activeElement: null,
      querySelector: s => { if (!elements.has(s)) elements.set(s, makeEl()); return elements.get(s); },
      querySelectorAll: () => [], addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
      createElement: () => makeEl(), getElementById: () => null },
    location: { search, href: 'http://localhost/publishing.html' + search }, history: { replaceState() {} },
    addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
    URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
    confirm: confirmFn || (() => true) });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const clickBtn = dataset => {
    const btn = { dataset, hasAttribute: n => n === 'data-close' ? false : false };
    (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
    return elements.get('#editor').innerHTML;
  };
  return { ctx, ls, store, elements, clickBtn,
    openReview: id => clickBtn({ review: id }),
    storage: e => (winListeners.storage || []).forEach(fn => fn(e)),
    eff: ctx.window.PublishingEffective, bridge: ctx.window.PublishingBridge };
}
const MEMBERS = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }];
const studio = (id, extra = {}) => ({ id, name: 'Studio ' + id, type: 'Game studio', roles: { publishing: 'Game studio' }, last: '', ...extra });
const gameRec = (id, extra = {}) => ({ id, title: 'Game ' + id, own: 'partner', company: 'c1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', ...extra });
const crmBase = (games, companies, leads = []) => ({ members: MEMBERS, companies, games, deals: [], leads, tasks: [], activities: [] });
const req = (kind, entityId, extra = {}) => ({ id: 'R-' + entityId + '-' + (extra.__n || '1'), kind, entityId, requestedBy: 'linh', assignee: 'mai', due: '2026-11-01', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-10-30T00:00:00.000Z', current: null, revisions: [], revision: 0, ...extra });

/* ================= A1/C13 ================= */
test('A1: cả 3 chỗ chọn request trong publishing.js đi qua PublishingBridge.selectRequest (canonical = cuối mảng)', () => {
  assert.ok(pub.includes('window.PublishingBridge.selectRequest'), 'thiếu delegation selectRequest');
  assert.ok(pub.includes('canonicalRequest(s.requests,kind,entityId)'), 'submitRequest chưa dùng canonical');
  assert.ok(pub.includes('canonicalRequest(read().requests,kind,id)'), 'boot deep-link chưa dùng canonical');
  assert.ok(pub.includes("canonicalRequest(allRequests||[],'game',g.id)"), 'companyNavHTML chưa dùng canonical');
  assert.ok(!/requests\.find\(r=>r\.kind/.test(pub) && !/requests\.find\(x=>x\.kind/.test(pub), 'còn .find() chọn request theo kind+entityId');
  const { eff } = loadPub({ crmState: crmBase([], []), requests: [] });
  const a = { kind: 'game', entityId: 'g1', id: 'first' }, b = { kind: 'game', entityId: 'g1', id: 'last' };
  assert.equal(eff.canonicalRequest([a, b], 'game', 'g1').id, 'last');
});

test('A1 chức năng: deep-link boot mở request CUỐI mảng (canonical), không mở bản đầu tiên', () => {
  const oldR = req('game', 'g1', { __n: 'old', requestNote: 'NOTE-CU-DAU-MANG' });
  const newR = req('game', 'g1', { __n: 'new', requestNote: 'NOTE-MOI-CUOI-MANG' });
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [oldR, newR], search: '?tab=reviews&kind=game&id=g1' });
  const dlg = env.elements.get('#editor').innerHTML;
  assert.ok(dlg.includes('NOTE-MOI-CUOI-MANG'), 'boot phải mở request canonical (cuối mảng)');
  assert.ok(!dlg.includes('NOTE-CU-DAU-MANG'));
});

/* ================= A3 + A11 (lead) + B10 ================= */
test('A3: dialog game có dòng Studio sở hữu kèm link ?open=company; A11: lead của công ty là link ?open=lead theo id thật', () => {
  const co = studio('c1', { name: 'Studio Alpha' });
  const lead = { id: 'lead-99', company: 'c1', name: 'An Đầu Mối', person: 'An Đầu Mối', phone: '090123', mainContact: true };
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [co], [lead]), requests: [req('game', 'g1'), req('company', 'c1')], role: 'bd' });
  const dlgGame = env.openReview('R-g1-1');
  assert.ok(dlgGame.includes('Studio sở hữu'), 'dialog game thiếu dòng Studio sở hữu');
  assert.ok(dlgGame.includes('index.html?open=company&amp;id=c1') && dlgGame.includes('Studio Alpha'), 'link studio sở hữu phải trỏ ?open=company&id=c1 kèm tên studio');
  const dlgCo = env.openReview('R-c1-1');
  assert.ok(dlgCo.includes('index.html?open=lead&amp;id=lead-99'), 'lead phải bấm được sang ?open=lead&id=<id lead>');
  assert.ok(dlgCo.includes('An Đầu Mối') && dlgCo.includes('090123'), 'lead link vẫn kèm thông tin lead');
});

/* ================= A11 (member) ================= */
test('A11: requestedBy/assignee/reviewer trong dialog review là link ?open=member', () => {
  const rev = { entries: {}, reviewer: 'mai', role: 'mkt', at: '2026-10-30T00:00:00.000Z', status: 'Đang đánh giá' };
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [req('game', 'g1', { current: rev, revisions: [rev], revision: 1 })], role: 'bd' });
  const dlg = env.openReview('R-g1-1');
  assert.ok(dlg.includes('index.html?open=member&amp;id=linh'), 'requestedBy (BD) phải là link member');
  assert.ok(dlg.includes('index.html?open=member&amp;id=mai'), 'assignee/reviewer phải là link member');
  assert.ok(env.eff.memberLinkHTML('linh').includes('open=member'));
  assert.equal(env.eff.memberLinkHTML(''), '');
});

/* ================= A12 ================= */
test('A12: publishing.js xoá bản sao isStudio, dùng isStudioCompany toàn cục ở mọi call site; ca biên roles.publishing rỗng bị loại', () => {
  assert.ok(!pub.includes('Object.hasOwn(c.roles'), 'bản sao isStudio (có-key) vẫn còn');
  assert.ok(!/const isStudio =/.test(pub), 'còn định nghĩa isStudio riêng');
  assert.ok((pub.match(/isStudioCompany/g) || []).length >= 3, 'chưa dùng isStudioCompany ở requestForm/submitRequest/handler kind');
  const edge = studio('cedge', { name: 'Edge Falsy Studio', roles: { publishing: '' } });
  const good = studio('cgood', { name: 'Good Studio' });
  const env = loadPub({ crmState: crmBase([], [edge, good]), requests: [], role: 'bd', search: '?kind=company&id=cedge' });
  const form = env.elements.get('#editor').innerHTML;
  assert.ok(form.includes('Good Studio'), 'studio hợp lệ phải có trong picker company');
  assert.ok(!form.includes('Edge Falsy Studio'), 'roles.publishing falsy/rỗng -> KHÔNG còn là studio theo định nghĩa thống nhất');
});

/* ================= A14 ================= */
test('A14: picker request — game đối tác kèm tên studio sở hữu, game Sava giữ "· Sava"', () => {
  const co = studio('c1', { name: 'Studio Alpha' });
  const gP = gameRec('g1', { title: 'Game Đối Tác' });
  const gO = gameRec('g2', { title: 'Game Nhà', own: 'ours', company: undefined });
  const env = loadPub({ crmState: crmBase([gP, gO], [co]), requests: [], role: 'bd', search: '?tab=reviews&kind=game&id=g1' });
  const form = env.elements.get('#editor').innerHTML;
  assert.ok(form.includes('Game Đối Tác') && form.includes('Studio: Studio Alpha'), 'option game đối tác phải kèm tên studio sở hữu');
  assert.ok(form.includes('Game Nhà') && form.includes('· Sava'), 'game của Sava giữ dấu hiệu · Sava');
});

/* ================= B1 (bridge) ================= */
test('B1: legacyThresholdNote của bridge làm tròn điểm thô về 1 chữ số (fmtLegacyFinal), không in float dài', () => {
  const seg = bridgeSrc.slice(bridgeSrc.indexOf('function fmtLegacyFinal'), bridgeSrc.indexOf('/* ===== Partner:'));
  assert.ok(!seg.includes('String(n)'), 'bridge còn in String(n) thô trong ghi chú ngưỡng');
  const api = new Function(seg + '\n;return { fmtLegacyFinal, legacyThresholdNote };')();
  const note = api.legacyThresholdNote(64.96000000000001);
  assert.ok(note.includes('65.0') && note.includes('chưa qua ngưỡng 65'), 'ghi chú phải hiện điểm thô đã làm tròn 65.0: ' + note);
  assert.ok(!note.includes('64.96000000000001'), 'không được in float dài');
  assert.equal(api.legacyThresholdNote(70.2), '');
  assert.equal(api.fmtLegacyFinal(79.975), '80.0');
});

/* ================= B4 view-first ================= */
test('B4: khối BD mặc định là bản xem (summary + nút Sửa hồ sơ, không có input khối BD); bấm Sửa mới hiện form; Hủy quay về xem', () => {
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [req('game', 'g1', { build: 'build-da-luu' })], role: 'bd' });
  let dlg = env.openReview('R-g1-1');
  assert.ok(dlg.includes('Sửa hồ sơ'), 'chế độ xem phải có nút Sửa hồ sơ');
  assert.ok(dlg.includes('build-da-luu'), 'bản xem phải hiện build đã lưu');
  assert.ok(!dlg.includes('name="build"'), 'chế độ xem KHÔNG được có input build của khối BD');
  assert.ok(!dlg.includes('name="mechanicId"'), 'chế độ xem KHÔNG được có form intake (mechanicId)');
  dlg = env.clickBtn({ action: 'bd-edit' });
  assert.ok(dlg.includes('name="build"'), 'bấm Sửa hồ sơ phải hiện form Build');
  assert.ok(dlg.includes('name="mechanicId"'), 'bấm Sửa hồ sơ phải hiện form intake');
  assert.ok(dlg.includes('Hủy sửa hồ sơ'), 'chế độ sửa phải có nút Hủy');
  dlg = env.clickBtn({ action: 'bd-cancel-edit' });
  assert.ok(!dlg.includes('name="build"') && dlg.includes('Sửa hồ sơ'), 'Hủy phải bỏ thay đổi và quay về chế độ xem');
});

/* ================= B8 + B17 + B14 (nguồn + chức năng) ================= */
test('B8: form quan sát thị trường dùng headTyped với badge 📊 Mechanic / Thị trường', () => {
  const seg = pub.slice(pub.indexOf('function marketForm'), pub.indexOf('function submitMarket'));
  assert.ok(seg.includes("headTyped(") && seg.includes("'market'"), 'marketForm chưa dùng headTyped(..., market)');
  const env = loadPub({ crmState: crmBase([], []), requests: [], role: 'bd' });
  const dlg = env.clickBtn({ action: 'market-new' });
  assert.ok(dlg.includes('📊 Mechanic / Thị trường') && dlg.includes('data-type="market"'), 'dialog thêm quan sát phải có badge loại market');
});

test('B17: nhãn tiến độ -> "Trạng thái" ở bộ lọc reviews + dialog review; giá trị dữ liệu không đổi', () => {
  assert.ok(!pub.includes('Tiến độ xử lý'), 'còn nhãn Tiến độ xử lý');
  assert.ok(!pub.includes('Tất cả tiến độ'), 'còn nhãn Tất cả tiến độ ở bộ lọc');
  assert.ok(pub.includes("'Tất cả trạng thái'") && pub.includes('aria-label="Lọc trạng thái"'), 'bộ lọc reviews chưa đổi sang Trạng thái');
  assert.ok(pub.includes("select('status','Trạng thái'"), 'label status trong dialog review chưa đổi sang Trạng thái');
});

test('B14: confirm xoá request in nhãn tiếng Việt theo kind', () => {
  const seg = pub.slice(pub.indexOf('function deleteRequest'), pub.indexOf('function deleteMarketObs'));
  assert.ok(seg.includes("'Đánh giá Partner'") && seg.includes("'Đánh giá Game'"), 'deleteRequest chưa dùng nhãn Việt');
  assert.ok(!seg.includes("'company' : 'game'"), 'deleteRequest còn in mã tiếng Anh');
  let msg = '';
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [req('game', 'g1')], role: 'bd', confirmFn: m => { msg = m; return false; } });
  env.clickBtn({ deleteRequest: 'R-g1-1' });
  assert.ok(msg.includes('(Đánh giá Game)'), 'confirm xoá game phải ghi (Đánh giá Game): ' + msg);
});

/* ================= B10 (bridge summary + companyNav) ================= */
test('B10: "Chưa đánh giá" thống nhất — bridge summary game chưa có request + hàng điều hướng company trong publishing', () => {
  assert.ok(!bridgeSrc.includes('Chưa gửi yêu cầu đánh giá'), 'bridge còn dùng nhãn cũ');
  assert.ok(!pub.includes('Chưa gửi yêu cầu đánh giá'), 'publishing còn dùng nhãn cũ');
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [req('company', 'c1')], role: 'bd' });
  const sum = env.bridge.summary('game', 'g1');
  assert.ok(sum.includes('Chưa đánh giá'), 'summary game chưa có request phải ghi Chưa đánh giá');
  const dlg = env.openReview('R-c1-1');
  assert.ok(dlg.includes('Chưa đánh giá — mở game trong CRM'), 'companyNav phải ghi Chưa đánh giá cho game chưa có request');
});

/* ================= B15 + C1 (nguồn + helper) ================= */
test('B15: requeue chỉ confirm khi build khác + có điểm; confirm nằm TRƯỚC mọi mutate trong submitReview', () => {
  const seg = pub.slice(pub.indexOf('function submitReview'), pub.indexOf('function renderFramework'));
  const iConfirm = seg.indexOf('currentHasScores(r.current)');
  assert.ok(iConfirm >= 0 && seg.includes('confirm('), 'submitReview requeue chưa có confirm theo điều kiện có điểm');
  assert.ok(seg.includes('làm TRỐNG điểm hiện tại') && seg.includes('lịch sử'), 'nội dung confirm phải nêu rõ điểm bị làm trống + revision cũ giữ trong lịch sử');
  assert.ok(iConfirm < seg.indexOf('structuredClone(r.current'), 'confirm phải chạy trước khi clone/mutate revision hiện tại');
  const { eff } = loadPub({ crmState: crmBase([], []), requests: [] });
  assert.equal(eff.currentHasScores(null), false);
  assert.equal(eff.currentHasScores({ entries: {} }), false);
  assert.equal(eff.currentHasScores({ entries: { size: { score: 4, status: 'Đã xác minh', note: 'n', source: 's' } } }), true);
  assert.equal(eff.currentHasScores({ quality: 3, entries: {} }), true);
});

test('C1: đồng bộ mechanicId vào intake chỉ khi KHÔNG phải MKT', () => {
  const seg = pub.slice(pub.indexOf('function submitReview'), pub.indexOf('function renderFramework'));
  assert.ok(/effMechBeforeSave = role !== 'mkt'/.test(seg), 'effMechBeforeSave phải bị chặn với vai MKT');
  assert.ok(seg.includes("role !== 'mkt' && r.kind==='game'"), 'điều kiện đồng bộ mechanic phải gồm role !== mkt');
});

/* ================= C4 ================= */
test('C4: __savaOnDataRefreshed reset baseline pubPrevSnap theo dữ kiện vừa nạp', () => {
  const env = loadPub({ crmState: crmBase([], []), requests: [req('game', 'g1')] });
  assert.equal(env.eff.pubPrevSnapSize(), 1);
  /* Đồng đội thêm 1 request ở nơi khác -> dữ liệu mới về cache */
  env.ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests: [req('game', 'g1'), req('game', 'g2', { __n: '2' })] }));
  env.ctx.window.__savaOnDataRefreshed();
  assert.equal(env.eff.pubPrevSnapSize(), 2, 'baseline phải là bản chụp của state VỪA NẠP, không phải state cũ');
});

test('C4: storage từ tab khác khi dialog đang mở -> stale + chặn; pubReloadLatest nạp lại và mở khoá', () => {
  const env = loadPub({ crmState: crmBase([gameRec('g1')], [studio('c1')]), requests: [req('game', 'g1')] });
  env.openReview('R-g1-1');
  assert.equal(env.elements.get('#editor').open, true);
  env.storage({ key: 'sava_publishing_v1' });
  assert.equal(env.eff.isPubStale(), true, 'tab khác ghi kho Publishing trong lúc đang sửa -> phải đánh dấu stale');
  env.ctx.window.pubReloadLatest();
  assert.equal(env.eff.isPubStale(), false, 'tải lại dữ liệu mới nhất phải mở khoá lưu');
});

/* ================= C6 (bridge) ================= */
function loadBridgeDeferred() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  let ready = false;
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {},
    document: { readyState: 'complete', addEventListener: () => {} } });
  ctx.window = ctx;
  ctx.SavaData = { isReady: () => ready };
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  vm.runInContext(read('publishing-score.js'), ctx, { filename: 'publishing-score.js' });
  const legacyCo = { id: 'cmig6', name: 'Studio Mig6', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '',
    partnerEval: { scores: { track: 4 }, evidence: {}, hardGate: {}, reviewer: 'linh' } };
  /* partnerEval có dữ kiện thật tối thiểu qua partnerEvalHasData: dùng scores hợp lệ */
  legacyCo.partnerEval = { scores: {}, evidence: {}, hardGate: {}, notesWeak: 'điểm yếu đã ghi', reviewer: 'linh' };
  ctx.S = { members: [], deals: [], games: [], leads: [], tasks: [], activities: [], companies: [legacyCo] };
  vm.runInContext(read('publishing-bridge.js'), ctx, { filename: 'publishing-bridge.js' });
  return { ctx, store, ls, setReady: v => { ready = v; }, legacyCo };
}

test('C6: có SavaData chưa sẵn sàng -> migration bị HOÃN; sau loadAll ghi đè cache + __savaOnReady, migration chạy và request còn nguyên qua chu trình loadAll+sync mô phỏng', () => {
  const env = loadBridgeDeferred();
  /* Bridge nạp xong: chưa migrate (không có request, không cờ) */
  assert.equal(env.store.get('sava_publishing_v1') == null || JSON.parse(env.store.get('sava_publishing_v1')).requests.length === 0, true);
  assert.ok(!env.legacyCo.partnerEvalMigrated, 'chưa data-ready thì không được đặt cờ');
  /* loadAll mô phỏng: máy chủ ghi đè cache bằng state máy chủ (CRM vẫn chứa partnerEval legacy qua archive, chưa có cờ; Publishing trống) */
  env.ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [], marketUpdates: [] }));
  env.ls.setItem('sava_crm_shared_v1', JSON.stringify(env.ctx.S));
  env.setReady(true);
  env.ctx.window.__savaOnReady();
  const pubAfter = JSON.parse(env.store.get('sava_publishing_v1'));
  assert.equal(pubAfter.requests.filter(r => r.kind === 'company' && r.entityId === 'cmig6').length, 1, 'migration sau data-ready phải tạo request canonical');
  assert.equal(env.legacyCo.partnerEvalMigrated, true, 'cờ chỉ đặt sau khi request canonical tồn tại');
  /* Sync mô phỏng đẩy local lên máy chủ, rồi loadAll lần nữa ghi máy chủ về cache: request vẫn còn */
  const serverPub = env.store.get('sava_publishing_v1');
  env.ls.setItem('sava_publishing_v1', serverPub);
  const pubFinal = JSON.parse(env.store.get('sava_publishing_v1'));
  assert.equal(pubFinal.requests.filter(r => r.kind === 'company' && r.entityId === 'cmig6').length, 1, 'request migrate phải còn nguyên sau loadAll + sync');
});

test('C6: ghi kho Publishing thất bại -> KHÔNG đặt cờ partnerEvalMigrated', () => {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (k === 'sava_publishing_v1') throw new Error('quota'); store.set(k, String(v)); },
    removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  vm.runInContext(read('publishing-score.js'), ctx, { filename: 'publishing-score.js' });
  const co = { id: 'cfail', name: 'Studio Fail', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '', partnerEval: { scores: {}, evidence: {}, hardGate: {}, notesWeak: 'yếu', reviewer: 'linh' } };
  ctx.S = { members: [], deals: [], games: [], leads: [], tasks: [], activities: [], companies: [co] };
  vm.runInContext(read('publishing-bridge.js'), ctx, { filename: 'publishing-bridge.js' });
  const r = ctx.window.PublishingBridge.migratePartnerLegacy();
  assert.equal(r.error, 'write-failed');
  assert.ok(!co.partnerEvalMigrated, 'ghi thất bại thì cờ không được đặt (không thể lên server khi chưa có request)');
});

/* ================= Mục đã biết: lệch mechanic ở bridge.summary ================= */
test('Mục đã biết: bridge.summary hiện ghi chú lệch mechanic cho bản ĐÃ HOÀN THÀNH, so mechanic đã chấm với mechanic suy từ genre CRM hiện tại (không dùng intake)', () => {
  const F = require('../publishing-score.js');
  const full = { version: 'market-v2', fromMechanicId: 'MECH-008',
    market: Object.fromEntries(F.market.map(([k]) => [k, { score: 5 }])), prototype: Object.fromEntries(F.prototype.map(([k]) => [k, { score: 5 }])) };
  const revDone = { scoresV2: full, entries: {}, reviewer: 'mai', role: 'mkt', at: '2026-10-30T00:00:00.000Z', status: 'Hoàn tất' };
  /* intake GIỮ mechanic đã chấm (MECH-008) — nếu bridge chỉ so với intake thì không lệch;
     genre CRM nay là Merge (MECH-004) -> phải lệch theo CRM hiện tại. */
  const rDone = req('game', 'g1', { status: 'Hoàn tất', intake: { mechanicId: 'MECH-008' }, current: revDone, revisions: [revDone], revision: 1 });
  const gNow = gameRec('g1', { genre: 'Puzzle / Merge' });
  const env = loadPub({ crmState: crmBase([gNow], [studio('c1')]), requests: [rDone], role: 'bd' });
  const sum = env.bridge.summary('game', 'g1');
  assert.ok(sum.includes('Mechanic hiện tại khác mechanic đã chấm'), 'summary drawer BD phải hiện ghi chú lệch mechanic theo genre CRM hiện tại: ' + sum);
  assert.ok(sum.includes('giữ nguyên theo mechanic đã chấm'), 'ghi chú phải nói rõ điểm/kết luận giữ nguyên, không tính lại');
  const stored = JSON.parse(env.ls.getItem('sava_publishing_v1'));
  assert.deepEqual(stored.requests[0].revisions, [revDone], 'hiển thị ghi chú không được sửa revision');
});
