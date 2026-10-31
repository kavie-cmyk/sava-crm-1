/* Khối "Deal liên quan" trong DRAWER GAME + nút "+ Tạo deal cho game này":
   - Liên kết game <-> deal là field DUY NHẤT deal.game (adapter ghi xuống
     cột deals.game_id) — phía game quét ngược S.deals qua dealVisibleGame,
     KHÔNG có trường liên kết thứ hai ở phía game.
   - Game Studio (own='ours'): deal.game TUỲ CHỌN -> gỡ liên kết hợp lệ.
     Publishing (own='partner'): deal BẮT BUỘC gắn đúng 1 game của đúng
     công ty của deal -> gỡ trần bị CHẶN kèm hướng dẫn xoá deal / đổi game
     trong form sửa deal; ứng viên gắn chỉ là deal Publishing của đúng
     công ty sở hữu game.
   - "+ Tạo deal cho game này" mở ĐÚNG form tạo deal hiện có (openAdd) với
     mảng theo own của game, game điền sẵn, công ty suy ra từ game đối tác
     (game của Sava không suy ra được công ty — Publisher phải chọn);
     checkbox lead của form giữ nguyên hành vi (điền sẵn ★ Đầu mối chính
     của công ty); lưu xong saveDeal mở lại drawer game, deal mới nằm ở
     nhóm "Đã gắn với game này".
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'cPub', name: 'Publisher Co', type: 'Publisher', roles: { game_studio: 'Publisher' }, last: 'Hôm qua' },
      { id: 'cStudio', name: 'Studio Partner', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay' },
      { id: 'cOther', name: 'Studio Khác', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay' },
    ],
    games: [
      { id: 'gOurs', title: 'Game Sava A', own: 'ours', genre: '', platform: '', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', mktEval: null },
      { id: 'gOurs2', title: 'Game Sava B', own: 'ours', genre: '', platform: '', stage: 'Alpha', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', mktEval: null },
      { id: 'gPartner', title: 'Game Đối Tác A', own: 'partner', company: 'cStudio', genre: '', platform: '', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: 'Đang chấm', mktEval: null },
      { id: 'gPartner2', title: 'Game Đối Tác B', own: 'partner', company: 'cStudio', genre: '', platform: '', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: 'Đang chấm', mktEval: null },
      { id: 'gPartnerOther', title: 'Game Công Ty Khác', own: 'partner', company: 'cOther', genre: '', platform: '', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: 'Đang chấm', mktEval: null },
    ],
    deals: [
      { id: 'dGSAttached', line: 'game_studio', title: 'Deal GS Đã Gắn', company: 'cPub', game: 'gOurs', stage: 'target', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dGSFree', line: 'game_studio', title: 'Deal GS Chưa Gắn', company: 'cPub', stage: 'target', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dGSOther', line: 'game_studio', title: 'Deal GS Gắn Game Khác', company: 'cPub', game: 'gOurs2', stage: 'target', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dPubAttached', line: 'publishing', title: 'Deal Pub Đã Gắn', company: 'cStudio', game: 'gPartner', stage: 'sourcing', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dPubFree', line: 'publishing', title: 'Deal Pub Chưa Gắn', company: 'cStudio', stage: 'sourcing', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dPubOther', line: 'publishing', title: 'Deal Pub Gắn Game Khác', company: 'cStudio', game: 'gPartner2', stage: 'sourcing', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dPubOtherCo', line: 'publishing', title: 'Deal Pub Công Ty Khác', company: 'cOther', game: 'gPartnerOther', stage: 'sourcing', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dAI', line: 'ai', title: 'Deal AI Không Liên Quan', company: 'cStudio', stage: 'prospect', owner: 'linh', due: '', idle: 0, custom: {}, amount: 0, cur: 'VND', leads: [] },
    ],
    leads: [
      { id: 'lStudioMain', name: 'Main Studio', company: 'cStudio', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-01', mainContact: true },
      { id: 'lPubMain', name: 'Main Publisher', company: 'cPub', person: '', phone: '', line: 'game_studio', source: '', status: 'new', note: '', when: '2026-10-01', mainContact: true },
    ],
    tasks: [], activities: [],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  let confirmAnswer = true;
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => confirmAnswer,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx), setConfirm: v => { confirmAnswer = v; } };
}
function groupSlice(drawer, from, to) {
  const a = drawer.indexOf(from); assert.ok(a >= 0, 'thiếu mốc nhóm: ' + from);
  const b = to ? drawer.indexOf(to, a) : drawer.length;
  return drawer.slice(a, b === -1 ? drawer.length : b);
}
const ATTACHED_HEAD = 'Đã gắn với game này';
const CANDIDATE_HEAD = 'Deal có thể gắn';

/* ---------- Render drawer game: 2 nhóm + nút tạo ---------- */
test('drawer game của Sava: nhóm đã gắn chỉ chứa deal đang trỏ tới game (+ công ty + nút gỡ); nhóm có thể gắn chỉ chứa deal Game Studio chưa gắn game này', () => {
  const { run, getEl } = loadIndex();
  run("openGame('gOurs')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes("openAddForGame('gOurs')"), 'phải có nút tạo deal ngay trong drawer game');
  assert.ok(drawer.includes('+ Tạo deal cho game này'));
  const gA = groupSlice(drawer, ATTACHED_HEAD, CANDIDATE_HEAD);
  assert.ok(gA.includes("openDeal('dGSAttached')"), 'deal đã gắn phải bấm mở được drawer deal');
  assert.ok(gA.includes('Deal GS Đã Gắn') && gA.includes('Game Studio'), 'hiện tên deal + mảng (stage nằm trong dealMini)');
  assert.ok(gA.includes('Publisher Co'), 'hiện công ty/publisher của deal');
  assert.ok(gA.includes("detachDealFromGame('dGSAttached','gOurs')"), 'deal Game Studio có đường gỡ tại drawer');
  assert.ok(!gA.includes("openDeal('dGSFree')"), 'deal chưa gắn không được nằm ở nhóm đã gắn');
  const gB = groupSlice(drawer, CANDIDATE_HEAD, '✅ Việc liên quan');
  assert.ok(gB.includes("attachDealToGame('dGSFree','gOurs')"), 'deal Game Studio chưa gắn game nào là ứng viên gắn');
  assert.ok(gB.includes("attachDealToGame('dGSOther','gOurs')"), 'deal Game Studio đang gắn game khác cũng là ứng viên (gắn = thay, có xác nhận)');
  assert.ok(!gB.includes("openDeal('dAI')"), 'deal mảng khác không phải ứng viên');
  assert.ok(!gB.includes("openDeal('dPubAttached')"), 'deal Publishing không phải ứng viên của game Sava');
});

test('drawer game đối tác: ứng viên chỉ là deal Publishing của ĐÚNG công ty sở hữu game; deal đã gắn có ghi chú bắt buộc game', () => {
  const { run, getEl } = loadIndex();
  run("openGame('gPartner')");
  const drawer = getEl('drawer').innerHTML;
  const gA = groupSlice(drawer, ATTACHED_HEAD, CANDIDATE_HEAD);
  assert.ok(gA.includes("openDeal('dPubAttached')") && gA.includes('Studio Partner'), 'deal đã gắn + công ty của nó');
  assert.ok(gA.includes('bắt buộc gắn 1 game'), 'phải báo rõ deal Publishing không gỡ trần được');
  const gB = groupSlice(drawer, CANDIDATE_HEAD, '✅ Việc liên quan');
  assert.ok(gB.includes("attachDealToGame('dPubFree','gPartner')"), 'deal Publishing cùng công ty chưa có game là ứng viên');
  assert.ok(gB.includes("attachDealToGame('dPubOther','gPartner')"), 'deal Publishing cùng công ty đang gắn game khác là ứng viên thay thế');
  assert.ok(!gB.includes("openDeal('dPubOtherCo')"), 'deal Publishing của công ty khác KHÔNG phải ứng viên');
  assert.ok(!gB.includes("openDeal('dGSFree')"), 'deal Game Studio không phải ứng viên của game đối tác');
});

/* ---------- Gắn / gỡ qua đường lưu duy nhất deal.game ---------- */
test('gỡ deal Game Studio khỏi game: xoá deal.game qua save(), drawer dựng lại — deal rời nhóm đã gắn, sang nhóm có thể gắn', () => {
  const { run, getEl, ls } = loadIndex();
  run("detachDealFromGame('dGSAttached','gOurs')");
  assert.equal(run("S.deals.find(d=>d.id==='dGSAttached').game"), undefined, 'gỡ = xoá field game của deal');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.ok(!saved.deals.find(d => d.id === 'dGSAttached').game, 'gỡ phải ghi xuống kho qua save()');
  const drawer = getEl('drawer').innerHTML;
  assert.ok(!groupSlice(drawer, ATTACHED_HEAD, CANDIDATE_HEAD).includes("openDeal('dGSAttached')"), 'sau gỡ: deal rời nhóm đã gắn');
  assert.ok(groupSlice(drawer, CANDIDATE_HEAD, '✅ Việc liên quan').includes("attachDealToGame('dGSAttached','gOurs')"), 'sau gỡ: deal thành ứng viên gắn lại');
});

test('gỡ deal Publishing khỏi game: BỊ CHẶN — liên kết còn nguyên, không ghi gì, toast hướng dẫn xoá deal / đổi game trong form sửa deal', () => {
  const { run, getEl, ls } = loadIndex();
  const before = ls.getItem('sava_crm_shared_v1');
  run("detachDealFromGame('dPubAttached','gPartner')");
  assert.equal(run("S.deals.find(d=>d.id==='dPubAttached').game"), 'gPartner', 'deal Publishing bắt buộc có game -> gỡ trần không được mutate');
  assert.equal(ls.getItem('sava_crm_shared_v1'), before, 'bị chặn thì không được save() ghi đè gì');
  const toast = getEl('toast').textContent;
  assert.ok(toast.includes('bắt buộc gắn 1 game'), 'toast phải nêu lý do validate: ' + toast);
  assert.ok(toast.includes('xoá deal') && toast.includes('đổi sang game khác'), 'toast phải chỉ rõ 2 đường hợp lệ thay thế');
});

test('gắn deal chưa có game vào game: đặt deal.game qua save(); gắn thay game khác phải qua xác nhận — từ chối thì giữ nguyên', () => {
  const { run, ls, setConfirm } = loadIndex();
  run("attachDealToGame('dGSFree','gOurs')");
  assert.equal(run("S.deals.find(d=>d.id==='dGSFree').game"), 'gOurs');
  assert.equal(JSON.parse(ls.getItem('sava_crm_shared_v1')).deals.find(d => d.id === 'dGSFree').game, 'gOurs', 'gắn phải ghi xuống kho');
  /* Hai chiều nhất quán: mở deal ra phải thấy đúng game đã gắn. */
  assert.equal(run("dealVisibleGame(S.deals.find(d=>d.id==='dGSFree')).id"), 'gOurs');
  setConfirm(false);
  run("attachDealToGame('dPubOther','gPartner')");
  assert.equal(run("S.deals.find(d=>d.id==='dPubOther').game"), 'gPartner2', 'user từ chối xác nhận thay game -> giữ game cũ');
  setConfirm(true);
  run("attachDealToGame('dPubOther','gPartner')");
  assert.equal(run("S.deals.find(d=>d.id==='dPubOther').game"), 'gPartner', 'xác nhận thay -> deal.game trỏ sang game mới (vẫn đúng 1 field liên kết)');
  assert.equal(run("dealVisibleGame(S.deals.find(d=>d.id==='dPubOther')).id"), 'gPartner');
});

test('gắn sai quy tắc bị chặn: deal Publishing của công ty khác vào game đối tác; deal mảng khác vào game Sava', () => {
  const { run } = loadIndex();
  run("attachDealToGame('dPubOtherCo','gPartner')");
  assert.equal(run("S.deals.find(d=>d.id==='dPubOtherCo').game"), 'gPartnerOther', 'khác công ty -> không gắn được game của công ty khác');
  run("attachDealToGame('dAI','gOurs')");
  assert.equal(run("S.deals.find(d=>d.id==='dAI').game"), undefined, 'deal AI không gắn được vào game');
  assert.deepEqual([...run("gameAttachableDeals(game('gPartner')).map(d=>d.id)")].sort(), ['dPubFree', 'dPubOther'], 'tập ứng viên Publishing chỉ gồm deal cùng công ty chưa gắn game này');
  assert.deepEqual([...run("gameAttachableDeals(game('gOurs')).map(d=>d.id)")].sort(), ['dGSFree', 'dGSOther'], 'tập ứng viên Game Studio chỉ gồm deal game_studio chưa gắn game này');
});

/* ---------- Tạo deal điền sẵn từ game ---------- */
function fillCreateForm(getEl, over) {
  const vals = Object.assign({ f_title: 'Deal Từ Game', f_amount: '', f_cur: 'VND', f_stage: 'target', f_owner: 'zac' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
}

test('tạo deal từ game own=ours: form điền sẵn mảng Game Studio + game; công ty để trống (không suy ra được); chọn Publisher xong lưu -> deal gắn đúng game, mở deal thấy game, drawer game hiện deal mới ở nhóm đã gắn', () => {
  const { run, getEl, ls } = loadIndex();
  getEl('f_line').value = 'ai'; /* mẫu harness sẵn có: đặt trước f_line để openAdd dựng được stages (mock không tự chọn option đầu như trình duyệt) */
  run("openAddForGame('gOurs')");
  assert.equal(getEl('f_line').value, 'game_studio', 'game của Sava -> mảng Game Studio');
  assert.equal(getEl('f_game').value, 'gOurs', 'game phải được điền sẵn trong ĐÚNG form tạo deal hiện có');
  assert.equal(getEl('f_company').value, '', 'game của Sava không mang công ty -> không bịa công ty, để người dùng chọn Publisher');
  getEl('f_company').value = 'cPub';
  run('onDealCompanyChange()');
  assert.equal(getEl('f_game').value, 'gOurs', 'đổi/chọn công ty không làm rơi game điền sẵn của mảng Game Studio');
  assert.deepEqual([...run("dealFormLeadSelection('cPub')")], ['lPubMain'], 'ô chọn lead vẫn điền sẵn ★ Đầu mối chính của công ty như hành vi sẵn có');
  fillCreateForm(getEl);
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Deal Từ Game')");
  assert.ok(nd, 'deal mới phải được tạo');
  assert.equal(nd.line, 'game_studio');
  assert.equal(nd.game, 'gOurs', 'liên kết nằm ở field duy nhất deal.game');
  assert.equal(nd.company, 'cPub');
  assert.deepEqual([...nd.leads], ['lPubMain'], 'lead điền sẵn của form được giữ nguyên');
  assert.equal(run("dealVisibleGame(S.deals.find(d=>d.id==='" + nd.id + "')).id"), 'gOurs', 'mở deal ra phải thấy game đã gắn (nhất quán hai chiều)');
  assert.equal(JSON.parse(ls.getItem('sava_crm_shared_v1')).deals.find(d => d.title === 'Deal Từ Game').game, 'gOurs', 'liên kết ghi xuống kho');
  const drawer = getEl('drawer').innerHTML;
  assert.ok(groupSlice(drawer, ATTACHED_HEAD, CANDIDATE_HEAD).includes('Deal Từ Game'), 'lưu xong: drawer game mở lại, deal mới nằm ngay ở nhóm đã gắn');
});

test('tạo deal từ game own=partner: form điền sẵn mảng Publishing + công ty của game + game; lưu -> deal Publishing gắn đúng game/công ty + lead main của công ty', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run("openAddForGame('gPartner')");
  assert.equal(getEl('f_line').value, 'publishing', 'game đối tác -> mảng Publishing');
  assert.equal(getEl('f_company').value, 'cStudio', 'công ty suy ra từ game đối tác (studio sở hữu game)');
  assert.equal(getEl('f_game').value, 'gPartner', 'game điền sẵn');
  fillCreateForm(getEl, { f_stage: 'sourcing' });
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Deal Từ Game')");
  assert.ok(nd, 'deal mới phải được tạo');
  assert.equal(nd.line, 'publishing');
  assert.equal(nd.company, 'cStudio', 'công ty đúng studio sở hữu game');
  assert.equal(nd.game, 'gPartner');
  assert.deepEqual([...nd.leads], ['lStudioMain'], 'lead ★ Đầu mối chính của công ty được điền sẵn như hành vi sẵn có');
  assert.equal(run("dealVisibleGame(S.deals.find(d=>d.id==='" + nd.id + "')).id"), 'gPartner', 'nhất quán hai chiều qua dealVisibleGame');
  const drawer = getEl('drawer').innerHTML;
  assert.ok(groupSlice(drawer, ATTACHED_HEAD, CANDIDATE_HEAD).includes('Deal Từ Game'), 'lưu xong: deal mới hiện ngay ở nhóm đã gắn của drawer game');
});

test('openAdd chỉ với gameId (không kèm line/company): tự suy ra mảng + công ty từ game đối tác', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run("openAdd({ gameId: 'gPartner' })");
  assert.equal(getEl('f_line').value, 'publishing');
  assert.equal(getEl('f_company').value, 'cStudio');
  assert.equal(getEl('f_game').value, 'gPartner');
  run('closeAdd()');
  assert.equal(run('dealFormReturnGameId'), null, 'đóng form thì cờ quay về drawer game bị xoá (không mở lại game khi tạo thường)');
});

/* ---------- Tĩnh: phạm vi + một trường liên kết duy nhất ---------- */
test('tĩnh: chỉ MỘT form tạo deal; openAddForGame tái sử dụng openAdd; gắn/gỡ đi qua deal.game, không sinh field liên kết thứ hai', () => {
  const html = read('index.html');
  assert.equal((html.match(/id="modal"/g) || []).length, 1, 'không được dựng form tạo deal song song');
  const og = html.slice(html.indexOf('function openAddForGame'), html.indexOf('function openGame'));
  assert.ok(og.includes('openAdd({'), 'openAddForGame phải mở đúng form tạo deal hiện có');
  assert.ok(og.includes('returnGameId'), 'openAddForGame phải truyền ngữ cảnh quay về drawer game');
  assert.ok(html.includes("attachDealToGame('${d.id}','${g.id}')") && html.includes("detachDealFromGame('${d.id}','${g.id}')"), 'drawer game phải có nút gắn + gỡ tại chỗ');
  assert.ok(!/\.gameId\s*=/.test(html), 'không được gán field liên kết thứ hai kiểu deal.gameId');
  const adapter = read('supabase-adapter.js');
  assert.ok(adapter.includes("game_id: nullIfEmpty(d.game)"), 'adapter vẫn ghi liên kết qua field duy nhất d.game -> deals.game_id');
  const saveDeal = html.slice(html.indexOf('function saveDeal()'), html.indexOf('/* ===== CRUD'));
  assert.ok(saveDeal.includes('nd.game === returnGameId'), 'saveDeal chỉ mở lại drawer game khi deal vừa lưu thật sự gắn đúng game đó');
});
