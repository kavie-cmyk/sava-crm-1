/* Hạng mục 2 (đợt sửa 5/11/2026):
   (1) Dialog review GAME hiện khối lead resolve LIVE từ CRM: lead đầu
       mối chính (mainContact) của công ty sở hữu game + lead gắn với mọi
       deal có deal.game = game này, khử trùng theo lead id — cho cả hai
       vai BD và MKT (đường render dùng chung liveInfoHTML).
   (2) entitySnapshot của request game MỚI chụp thêm companyName (tên
       công ty sở hữu); đường fallback của request mồ côi dùng được tên
       đó. Request đã tồn tại không bị đụng.
   Harness theo mẫu fix-c3-publishing / audit-history: vm + localStorage
   stub, mở dialog qua sự kiện click thật, tạo request qua sự kiện
   submit thật của form requestForm. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeEl() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    insertBefore(c) { this._inserted = c; return c; }, appendChild(c) { this._inserted = c; return c; },
    focus() {}, close() { this.open = false; }, showModal() { this.open = true; },
    scrollIntoView() {}, reportValidity: () => true,
    getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
class FakeFormData {
  constructor(form) { this.m = (form && form._fields) || new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  getAll(k) { const v = this.m.get(k); return v === undefined ? [] : [v]; }
}
function loadPub({ crmState, requests = [], role = 'bd', search = '' } = {}) {
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
    URLSearchParams, URL, structuredClone, FormData: FakeFormData,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
    confirm: () => true });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const clickBtn = dataset => {
    const btn = { dataset, hasAttribute: () => false };
    (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
    return elements.get('#editor').innerHTML;
  };
  const dispatchSubmit = fields => {
    const ev = { target: { id: 'requestForm', _fields: new Map(Object.entries(fields)) }, preventDefault() {} };
    (docListeners.submit || []).forEach(fn => fn(ev));
  };
  return { ctx, ls, store, elements, clickBtn, dispatchSubmit,
    openReview: id => clickBtn({ review: id }),
    eff: ctx.window.PublishingEffective, bridge: ctx.window.PublishingBridge };
}
const MEMBERS = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }];
const studio = (id, extra = {}) => ({ id, name: 'Studio ' + id, type: 'Game studio', roles: { publishing: 'Game studio' }, last: '', ...extra });
const gameRec = (id, extra = {}) => ({ id, title: 'Game ' + id, own: 'partner', company: 'c1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', ...extra });
const crmBase = (games, companies, leads = [], deals = []) => ({ members: MEMBERS, companies, games, deals, leads, tasks: [], activities: [] });
const req = (kind, entityId, extra = {}) => ({ id: 'R-' + entityId + '-' + (extra.__n || '1'), kind, entityId, requestedBy: 'linh', assignee: 'mai', due: '2026-11-01', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-10-30T00:00:00.000Z', current: null, revisions: [], revision: 0, ...extra });
const count = (hay, needle) => hay.split(needle).length - 1;

/* Fixture dùng chung: c1 sở hữu g1; lead-main là đầu mối chính của c1,
   lead-deal gắn qua deal của g1; lead-main cũng nằm trong deal (trùng
   nguồn) và lead-deal nằm ở 2 deal của g1 (trùng lặp chéo deal). */
function fixtureLeads() {
  const co = studio('c1', { name: 'Studio Alpha' });
  const co2 = studio('c2', { name: 'Studio Beta' });
  const leads = [
    { id: 'lead-main', company: 'c1', name: 'Main Person', person: 'CEO', phone: '090111', mainContact: true },
    { id: 'lead-deal', company: 'c1', name: 'Deal Person', person: 'Producer', phone: '090222', mainContact: false },
    { id: 'lead-plain', company: 'c1', name: 'Plain Person', person: 'Artist', phone: '090333', mainContact: false },
    { id: 'lead-other-co', company: 'c2', name: 'Other Co Main', person: 'CTO', phone: '090444', mainContact: true },
  ];
  const deals = [
    { id: 'd1', line: 'publishing', title: 'Deal 1', company: 'c1', game: 'g1', stage: 'screening', owner: 'linh', leads: ['lead-deal', 'lead-main'] },
    { id: 'd2', line: 'publishing', title: 'Deal 2', company: 'c1', game: 'g1', stage: 'screening', owner: 'linh', leads: ['lead-deal'] },
    { id: 'd3', line: 'publishing', title: 'Deal Game Khác', company: 'c2', game: 'g-khac', stage: 'screening', owner: 'linh', leads: ['lead-other-co', 'lead-plain'] },
  ];
  return { co, co2, leads, deals };
}

test('gameLeadsFor (helper thuần): mainContact của công ty sở hữu + lead qua deal.game, khử trùng theo id, loại lead không liên quan', () => {
  const { co, co2, leads, deals } = fixtureLeads();
  const crmState = crmBase([gameRec('g1')], [co, co2], leads, deals);
  const env = loadPub({ crmState, requests: [] });
  const got = env.eff.gameLeadsFor(crmState, crmState.games[0]);
  /* Object trả về thuộc realm vm nên so qua JSON/chuỗi thay cho deepStrictEqual trực tiếp */
  assert.equal(JSON.stringify(got.map(l => l.id)), JSON.stringify(['lead-main', 'lead-deal']), 'mainContact trước, lead deal sau, mỗi id đúng 1 lần dù trùng nhiều nguồn');
  /* State thiếu mảng / entity lạ -> an toàn, không throw */
  assert.equal(env.eff.gameLeadsFor({}, crmState.games[0]).length, 0);
  assert.equal(env.eff.gameLeadsFor(crmState, null).length, 0);
  assert.equal(env.eff.gameLeadsFor(null, crmState.games[0]).length, 0);
  assert.equal(env.eff.leadLinksHTML([]), '');
});

test('dialog review GAME (BD + MKT): hiện đủ mainContact + lead qua deal, không trùng, kèm chức danh + SĐT + nhãn đầu mối chính + link lead', () => {
  const { co, co2, leads, deals } = fixtureLeads();
  const crmState = crmBase([gameRec('g1')], [co, co2], leads, deals);
  for (const role of ['bd', 'mkt']) {
    const env = loadPub({ crmState, requests: [req('game', 'g1')], role });
    const dlg = env.openReview('R-g1-1');
    assert.ok(dlg.includes('Đầu mối liên hệ — lead liên quan game (CRM hiện tại)'), `[${role}] dialog game phải có khối lead của game`);
    assert.ok(dlg.includes('Main Person') && dlg.includes('CEO') && dlg.includes('090111'), `[${role}] mainContact phải hiện tên + chức danh (person) + SĐT`);
    assert.ok(dlg.includes('★ Đầu mối chính'), `[${role}] mainContact phải kèm nhãn đầu mối chính như dialog company`);
    assert.ok(dlg.includes('Deal Person') && dlg.includes('Producer') && dlg.includes('090222'), `[${role}] lead qua deal phải hiện tên + chức danh + SĐT`);
    assert.ok(dlg.includes('index.html?open=lead&amp;id=lead-main'), `[${role}] lead phải là link ?open=lead theo id thật`);
    assert.ok(dlg.includes('index.html?open=lead&amp;id=lead-deal'), `[${role}] lead qua deal phải là link ?open=lead theo id thật`);
    assert.equal(count(dlg, 'id=lead-main'), 1, `[${role}] lead-main chỉ được hiện 1 lần (khử trùng mainContact ∩ deal)`);
    assert.equal(count(dlg, 'id=lead-deal'), 1, `[${role}] lead-deal chỉ được hiện 1 lần (khử trùng giữa 2 deal)`);
    assert.ok(!dlg.includes('Plain Person'), `[${role}] lead cùng công ty nhưng không phải mainContact và không gắn deal của game này thì KHÔNG hiện ở dialog game`);
    assert.ok(!dlg.includes('Other Co Main'), `[${role}] mainContact của công ty khác không hiện`);
  }
});

test('dialog review GAME không có lead nào: khối lead hiện trạng thái trống gọn (—), không lỗi, dialog vẫn mở đủ', () => {
  const co = studio('c1', { name: 'Studio Trống' });
  const crmState = crmBase([gameRec('g1')], [co], [], []);
  for (const role of ['bd', 'mkt']) {
    const env = loadPub({ crmState, requests: [req('game', 'g1')], role });
    let dlg;
    assert.doesNotThrow(() => { dlg = env.openReview('R-g1-1'); });
    assert.ok(dlg.includes('Đầu mối liên hệ — lead liên quan game (CRM hiện tại)</dt><dd>—</dd>'), `[${role}] không lead -> hàng lead hiện "—" gọn như mẫu company`);
    assert.ok(dlg.includes('Game g1') && dlg.includes('Studio Trống'), `[${role}] phần còn lại của dialog vẫn nguyên vẹn`);
  }
  /* Game của Sava (không công ty sở hữu) + state thiếu mảng deals cũng trống gọn */
  const gOurs = gameRec('g-ours', { own: 'ours', company: undefined });
  const env2 = loadPub({ crmState: { members: MEMBERS, companies: [], games: [gOurs], leads: [] }, requests: [req('game', 'g-ours')], role: 'bd' });
  let dlg2;
  assert.doesNotThrow(() => { dlg2 = env2.openReview('R-g-ours-1'); });
  assert.ok(dlg2.includes('lead liên quan game (CRM hiện tại)</dt><dd>—</dd>'));
});

test('dialog review COMPANY: hành vi không đổi — vẫn hiện MỌI lead của công ty qua cùng mẫu hiển thị', () => {
  const { co, co2, leads, deals } = fixtureLeads();
  const crmState = crmBase([gameRec('g1')], [co, co2], leads, deals);
  const env = loadPub({ crmState, requests: [req('company', 'c1')], role: 'bd' });
  const dlg = env.openReview('R-c1-1');
  assert.ok(dlg.includes('Đầu mối liên hệ — lead của công ty (CRM hiện tại)'), 'nhãn khối lead company giữ nguyên');
  assert.ok(dlg.includes('Main Person') && dlg.includes('Deal Person') && dlg.includes('Plain Person'), 'dialog company vẫn hiện cả lead thường của công ty (không bị lọc như dialog game)');
  assert.ok(dlg.includes('index.html?open=lead&amp;id=lead-plain'), 'lead thường ở dialog company vẫn là link lead');
  assert.ok(!dlg.includes('Other Co Main'), 'lead công ty khác không hiện ở dialog company này');
});

test('submitRequest (submit thật): request game MỚI có entitySnapshot.companyName = tên công ty sở hữu; request cũ không bị đụng; snapshot company không đổi', () => {
  const co = studio('c1', { name: 'Studio Snap Name' });
  const g = gameRec('g1', { title: 'Game Snap Moi' });
  const oldReq = req('game', 'g-old', { __n: 'old', entitySnapshot: { name: 'Game Cu', genre: 'Puzzle', platform: 'Android', stage: 'Beta', desc: '', buildUrl: '', trailerUrl: '', companyName: 'Studio Cu Nguyen Ven' } });
  const oldBefore = JSON.parse(JSON.stringify(oldReq));
  const env = loadPub({ crmState: crmBase([g], [co]), requests: [oldReq], role: 'bd' });
  /* Helper thuần: cả hai dạng gọi (truyền state / tự resolve qua CRM) */
  assert.equal(env.eff.entitySnapshotFor('game', g, crmBase([g], [co])).companyName, 'Studio Snap Name');
  assert.equal(env.eff.entitySnapshotFor('game', g).companyName, 'Studio Snap Name', 'submitRequest gọi 2 tham số — helper tự resolve tên công ty từ CRM hiện tại');
  assert.equal(JSON.stringify(env.eff.entitySnapshotFor('company', co)), JSON.stringify({ name: 'Studio Snap Name', type: 'Game studio' }), 'snapshot company giữ nguyên, không thêm companyName');
  env.dispatchSubmit({ kind: 'game', entityId: 'g1', requestedBy: 'linh', assignee: 'mai', due: '', build: '', source: '', requestNote: 'Tạo mới để kiểm snapshot' });
  const stored = JSON.parse(env.ls.getItem('sava_publishing_v1'));
  assert.equal(stored.requests.length, 2, 'phải thêm đúng 1 request mới');
  const created = stored.requests.find(r => r.entityId === 'g1');
  assert.ok(created, 'request mới cho g1 phải tồn tại');
  assert.equal(created.entitySnapshot.companyName, 'Studio Snap Name', 'snapshot của request game mới phải chứa tên công ty sở hữu');
  assert.equal(created.entitySnapshot.name, 'Game Snap Moi');
  const oldAfter = stored.requests.find(r => r.entityId === 'g-old');
  /* Snapshot + định danh/trạng thái của request cũ phải nguyên vẹn.
     (Toàn object không so byte-đối-byte vì sanitizeRequest có sẵn của
     hệ thống chuẩn hoá current:null -> {} mỗi lần đọc kho — hành vi cũ,
     không thuộc hạng mục này và không đụng tới entitySnapshot.) */
  assert.equal(JSON.stringify(oldAfter.entitySnapshot), JSON.stringify(oldBefore.entitySnapshot), 'entitySnapshot của request đã tồn tại không được viết lại');
  assert.equal(oldAfter.id, oldBefore.id); assert.equal(oldAfter.status, oldBefore.status);
  assert.equal(oldAfter.requestNote, oldBefore.requestNote);
});

test('fallback snapshot: request game mồ côi hiện tên công ty từ snapshot.companyName; snapshot cũ thiếu companyName vẫn mở gọn, không lỗi', () => {
  const co = studio('c1', { name: 'Studio Con Song' });
  const snap = { name: 'Game Mo Coi Snap', genre: 'Puzzle / Merge', platform: 'Android', stage: 'Beta', desc: 'd', buildUrl: '', trailerUrl: '', companyName: 'Studio Snap Fallback' };
  const rOrphan = req('game', 'gx-da-xoa', { entitySnapshot: snap });
  const rOrphanOld = req('game', 'gy-da-xoa', { __n: 'old', entitySnapshot: { name: 'Game Cu Khong Co', genre: 'Puzzle', platform: 'Android', stage: '', desc: '', buildUrl: '', trailerUrl: '' } });
  const env = loadPub({ crmState: crmBase([], [co]), requests: [rOrphan, rOrphanOld], role: 'mkt' });
  let dlg;
  assert.doesNotThrow(() => { dlg = env.openReview(rOrphan.id); });
  assert.ok(dlg.includes('Game Mo Coi Snap'), 'mồ côi hiện tên game từ snapshot');
  assert.ok(dlg.includes('Studio sở hữu (snapshot)'), 'mồ côi phải có hàng studio từ snapshot');
  assert.ok(dlg.includes('Studio Snap Fallback'), 'tên công ty phải lấy được từ snapshot.companyName khi CRM không còn game');
  let dlgOld;
  assert.doesNotThrow(() => { dlgOld = env.openReview(rOrphanOld.id); });
  assert.ok(dlgOld.includes('Studio sở hữu (snapshot)</dt><dd>—</dd>'), 'snapshot cũ không có companyName -> hiện — gọn, không lỗi');
  assert.ok(!dlgOld.includes('undefined'), 'không được rò chữ undefined');
});

test('fallback companyName khi game còn nhưng công ty sở hữu đã bị gỡ: hiện tên công ty từ snapshot thay nhãn đã gỡ', () => {
  const g = gameRec('g1', { company: 'c-da-xoa' });
  const r = req('game', 'g1', { entitySnapshot: { name: 'Game g1', genre: 'Puzzle / Match-3', platform: 'Android', stage: 'Beta', desc: '', buildUrl: '', trailerUrl: '', companyName: 'Studio Da Xoa Snap' } });
  const env = loadPub({ crmState: crmBase([g], []), requests: [r], role: 'bd' });
  const dlg = env.openReview('R-g1-1');
  assert.ok(dlg.includes('Studio Da Xoa Snap'), 'công ty bị gỡ -> tên công ty lấy từ snapshot');
  assert.ok(dlg.includes('(snapshot)'), 'phải ghi rõ nguồn snapshot cho tên công ty fallback');
});
