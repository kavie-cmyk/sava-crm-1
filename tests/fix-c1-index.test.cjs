/* FIX-C1 (chỉ index.html) — khoá từng mục của cụm fix:
   A2 A4 A5 A8 A9 A10 A11 A13 A14 A15 A16, B1 B3 B5 B7 B8 B9 B10 B11 B12
   B13 B16 B17 B18, C2 C9 C11. Harness vm nạp index.html THẬT như các
   test sẵn có (task-context-link / game-deal-attach). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'm1', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'c1', name: 'Studio Partner', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Publisher Co', type: 'Publisher', roles: { game_studio: 'Publisher' }, last: 'Hôm nay' },
      { id: 'cEmpty', name: 'Empty Co', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: '' },
      { id: 'cDel', name: 'Del Co', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '' },
    ],
    games: [
      { id: 'gPartner', title: 'Game Partner A', own: 'partner', company: 'c1', genre: '', platform: '', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: 'Đang chấm', mktEval: null },
      { id: 'gOurs', title: 'Game Sava A', own: 'ours', genre: '', platform: '', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', mktEval: null },
      { id: 'gNoReq', title: 'Game NoReq', own: 'partner', company: 'c1', genre: '', platform: '', stage: '', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '', mktEval: null },
      { id: 'gDel', title: 'Game Del', own: 'partner', company: 'cDel', genre: '', platform: '', stage: '', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '', mktEval: null },
    ],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Pub One', company: 'c1', game: 'gPartner', stage: 'sourcing', owner: 'm1', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1', 'lMain'] },
      { id: 'd2', line: 'ai', title: 'Deal AI One', company: 'c1', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 100, cur: 'VND', leads: [] },
      { id: 'dGS', line: 'game_studio', title: 'Deal GS One', company: 'c2', game: 'gOurs', stage: 'target', owner: 'm1', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dHidden', line: 'ai', title: 'Deal Hidden Game', company: 'c2', game: 'gPartner', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 1, cur: 'VND', leads: [] },
      { id: 'dMoney', line: 'publishing', title: 'Deal Money', company: 'c1', game: 'gPartner', stage: 'sourcing', owner: 'zac', due: '', idle: 0, custom: { planned_investment: 'TextLegacy500' }, term: {}, contract: {}, leads: [] },
    ],
    leads: [
      { id: 'l1', name: 'Lead One', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-01' },
      { id: 'lMain', name: 'Lead Main', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'converted', note: '', when: '2026-10-01', mainContact: true },
      { id: 'lWeird', name: 'Lead Weird', company: 'c1', person: '', phone: '', line: 'ai', source: '', status: 'weird_status', note: '', when: '' },
    ],
    tasks: [
      { id: 'tDirect', title: 'Task Direct Company', assignee: 'm1', due: '', dueDate: '', done: false, overdue: false, company: 'c1' },
      { id: 'tDeal', title: 'Task Via Deal', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false, deal: 'd1' },
      { id: 'tBoth', title: 'Task Both Links', assignee: 'm1', due: '', dueDate: '', done: false, overdue: false, company: 'c1', deal: 'd1' },
      { id: 'tDone', title: 'Task Done Company', assignee: 'm1', due: '', dueDate: '', done: true, overdue: false, company: 'c1' },
      { id: 'tFree', title: 'Task Free NoDeal', assignee: 'm1', due: '', dueDate: '', done: false, overdue: false },
      { id: 'tGhost', title: 'Task Ghost Member', assignee: 'ghost-member', due: '', dueDate: '', done: false, overdue: false },
      { id: 'tNone', title: 'Task Unassigned', assignee: '', due: '', dueDate: '', done: false, overdue: false },
    ],
    activities: [
      { id: 'a1', deal: 'd1', who: 'm1', type: 'Call', text: 'Act One Text', when: '2026-10-01', url: '' },
      { id: 'a2', deal: 'd2', who: 'm1', type: 'Note', text: 'Act Two Text', when: '2026-10-02', url: '' },
      { id: 'a3', deal: 'd1', who: 'zac', type: 'Meeting', text: 'Act Zac Text', when: '2026-10-03', url: '' },
    ],
    verticals: [],
  };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(fixtureState()));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, requests: [
    { id: 'r1', kind: 'game', entityId: 'gPartner', requestedBy: 'm1', assignee: '', status: 'Chờ đánh giá', revisions: [], current: null },
    { id: 'r2', kind: 'company', entityId: 'c1', requestedBy: 'zac', assignee: 'm1', status: 'Chờ đánh giá', revisions: [], current: null },
    { id: 'r3', kind: 'company', entityId: 'c1', requestedBy: 'zac', assignee: '', status: 'Đã xong', revisions: [{ reviewer: 'm1' }], current: null },
    { id: 'rDelC', kind: 'company', entityId: 'cDel', requestedBy: 'zac', assignee: '', status: 'Chờ đánh giá', revisions: [], current: null },
    { id: 'rDelG', kind: 'game', entityId: 'gDel', requestedBy: 'zac', assignee: '', status: 'Chờ đánh giá', revisions: [], current: null },
  ], marketUpdates: [] }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  let confirmAnswer = true; const confirmMsgs = [];
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: msg => { confirmMsgs.push(String(msg)); return confirmAnswer; },
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx), confirmMsgs, setConfirm: v => { confirmAnswer = v; } };
}
const sliceBetween = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'thiếu mốc: ' + a); const j = b ? s.indexOf(b, i + a.length) : s.length; return s.slice(i, j === -1 ? s.length : j); };

/* ---------- A2 ---------- */
test('A2: openMember có section Hoạt động đã ghi (bấm mở deal) + Đánh giá liên quan (requestedBy/assignee/reviewer)', () => {
  const { run, getEl } = loadIndex();
  run("openMember('m1')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Hoạt động đã ghi (2)'), 'thiếu section hoạt động của m1');
  const acts = sliceBetween(d, 'Hoạt động đã ghi', 'Đánh giá liên quan');
  assert.ok(acts.includes('Act One Text') && acts.includes('Act Two Text'));
  assert.ok(acts.includes("openDeal('d1')") && acts.includes("openDeal('d2')"), 'hoạt động phải bấm mở deal liên quan');
  assert.ok(d.includes('Đánh giá liên quan (3)'), 'r1 requestedBy + r2 assignee + r3 reviewer = 3');
  const reqs = sliceBetween(d, 'Đánh giá liên quan', 'Đây là tóm tắt');
  assert.ok(reqs.includes('Game Partner A') && reqs.includes('Studio Partner'));
  assert.ok(reqs.includes('Reviewer'), 'r3 phải ghi vai Reviewer');
});

/* ---------- A4 + A5 + A9 + A10 + B16 (drawer công ty) ---------- */
test('A4/A5/A9/A10/B16: drawer công ty — game qua dealVisibleGame, việc treo hợp nhất khử trùng, hoạt động bấm được, section luôn hiện + nút thêm game', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c2')");
  let d = getEl('drawer').innerHTML;
  const gamesSec = sliceBetween(d, 'Games liên quan', 'Việc đang treo');
  assert.ok(gamesSec.includes('Game Sava A'), 'deal GS của c2 gắn gOurs (hiển thị được) phải hiện');
  assert.ok(!gamesSec.includes('Game Partner A'), 'dHidden (mảng AI, game giữ ẩn) KHÔNG được tính là game liên quan của c2');
  run("openCompany('c1')");
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('3 việc chưa xong'), 'kv việc treo = direct(1) + qua deal(2, tBoth trùng chỉ tính 1) = 3, việc done không tính');
  const treo = sliceBetween(d, '✅ Việc đang treo', '🕘 Hoạt động gần nhất');
  assert.ok(treo.includes('Task Direct Company') && treo.includes('Task Via Deal'));
  assert.equal(treo.split('Task Both Links').length - 1, 1, 'việc gắn cả company + deal chỉ hiện 1 lần trong section treo');
  const actsSec = sliceBetween(d, '🕘 Hoạt động gần nhất', 'Đã sửa + xóa được công ty');
  assert.ok(actsSec.includes('Deal Pub One') && actsSec.includes("openDeal('d1')"), 'hoạt động trong drawer công ty phải có tên deal + bấm mở deal');
  run("openCompany('cEmpty')");
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Games liên quan') && d.includes('+ Thêm game cho công ty này') && d.includes("editGame(null, 'cEmpty')"), 'công ty chưa có game vẫn hiện section + nút thêm game theo ngữ cảnh');
  assert.ok(d.includes('Chưa có game nào liên quan'));
  assert.ok(d.includes('Không có việc đang treo nào.') && d.includes('Chưa có hoạt động nào.'), 'B16: section rỗng hiện dòng trống rõ ràng');
});

/* ---------- A8 ---------- */
test('A8: editActivity có ô chọn deal (kèm Không gắn deal), saveActivity ghi a.deal mới và giữ nguyên khi không đổi', () => {
  const { run, getEl } = loadIndex();
  run("editActivity('a1')");
  let form = getEl('editBox').innerHTML;
  assert.ok(form.includes('id="ea_deal"') && form.includes('— Không gắn deal —'));
  assert.ok(/<option value="d1" selected>/.test(form), 'deal hiện tại phải được chọn sẵn');
  const fill = deal => { getEl('ea_type').value = 'Call'; getEl('ea_who').value = 'm1'; getEl('ea_when').value = ''; getEl('ea_text').value = 'Act One Text'; getEl('ea_url').value = ''; getEl('ea_deal').value = deal; };
  fill('d1'); run("saveActivity('a1')");
  assert.equal(run("S.activities.find(a=>a.id==='a1').deal"), 'd1', 'không đổi ô chọn -> giữ nguyên deal');
  run("editActivity('a1')"); fill('d2'); run("saveActivity('a1')");
  assert.equal(run("S.activities.find(a=>a.id==='a1').deal"), 'd2', 'đổi ô chọn -> a.deal cập nhật');
});

/* ---------- A10 (form game) + B12b + C11a ---------- */
function fillGameForm(getEl, over) {
  const vals = Object.assign({ e_gtitle: 'Game X', e_gemoji: '🎮', e_gown: 'partner', e_gcompany: 'c1', e_gnewCompany: '', e_ggenre_main: '', e_ggenre_sub: '', e_gstage: '', e_gdesc: '', e_gnote: '', e_gbuild: '', e_gtrailer: '', e_gverdict: '' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
  for (const k of ['Gameplay', 'Đồ họa', 'Monetization', 'Tiềm năng TT', 'Kỹ thuật']) getEl('e_gs_' + k).value = '';
}
test('A10/B12b/C11a: editGame preset công ty + own theo ngữ cảnh + tạo công ty mới trong form; verdict chỉ mặc định khi tạo mới', () => {
  const { run, getEl } = loadIndex();
  run("editGame(null, 'c1')");
  let form = getEl('editBox').innerHTML;
  assert.ok(/<option value="c1" selected>/.test(form), 'preset công ty phải được chọn sẵn ở ô Studio');
  assert.ok(form.includes('＋ Tạo công ty mới…') && form.includes('id="e_gnewCompany"'), 'ô Studio phải có option tạo công ty mới');
  run("curLine='game_studio'; editGame(null)");
  assert.ok(getEl('editBox').innerHTML.includes('<option value="ours" selected>'), 'ngữ cảnh Game Studio -> own mặc định ours');
  run("curLine='publishing'; editGame(null)");
  assert.ok(getEl('editBox').innerHTML.includes('<option value="partner" selected>'), 'ngữ cảnh Publishing -> own mặc định partner');
  /* Tạo công ty mới ngay trong form game */
  fillGameForm(getEl, { e_gtitle: 'Game New Studio', e_gcompany: '__new__', e_gnewCompany: 'Studio New XYZ' });
  run('saveGame(null)');
  const ng = run("S.games.find(g=>g.title==='Game New Studio')");
  assert.ok(ng && ng.company, 'game mới phải gắn công ty vừa tạo');
  assert.equal(run(`S.companies.find(c=>c.id==='${ng.company}').name`), 'Studio New XYZ');
  /* C11a: sửa game verdict rỗng -> giữ rỗng; tạo mới verdict rỗng -> Đang chấm */
  run("editGame('gNoReq')"); fillGameForm(getEl, { e_gtitle: 'Game NoReq', e_gcompany: 'c1', e_gverdict: '' });
  run("saveGame('gNoReq')");
  assert.equal(run("S.games.find(g=>g.id==='gNoReq').verdict"), '', 'sửa game cũ verdict rỗng không được tự ghi Đang chấm');
  fillGameForm(getEl, { e_gtitle: 'Game Verdict Default', e_gcompany: 'c1', e_gverdict: '' });
  run('saveGame(null)');
  assert.equal(run("S.games.find(g=>g.title==='Game Verdict Default').verdict"), 'Đang chấm', 'tạo mới vẫn mặc định Đang chấm');
});

/* ---------- A11 ---------- */
test('A11: helper member/lead bấm được + dùng ở owner/assignee/who/lead-công ty; deep-link lead/member', () => {
  assert.ok(html.includes('__open === "lead"') && html.includes('__open === "member"'), 'handler ?open= phải có lead + member');
  const { run, getEl } = loadIndex();
  assert.ok(run("memberLinkHTML('m1')").includes("openMember('m1')"));
  assert.ok(!run("memberLinkHTML('ghost-member')").includes('openMember'), 'member đã xoá -> text thuần, không link chết');
  assert.ok(run("leadLinkHTML('l1')").includes("openLead('l1')"));
  assert.ok(run("companyLeadsHTML('c1')").includes("openLead('l1')"), 'tên lead trong companyLeadsHTML bấm được');
  assert.ok(run("taskRow(S.tasks.find(t=>t.id==='tFree'))").includes("openMember('m1')"), 'assignee trong taskRow bấm được');
  assert.ok(run("relatedTaskRow(S.tasks.find(t=>t.id==='tFree'))").includes("openMember('m1')"), 'assignee trong relatedTaskRow bấm được');
  run("openDeal('d1')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes("openMember('m1')"), 'owner trong openDeal + who trong timeline bấm được');
  run("curView='dash'; curLine='all'; query=''; render()");
  assert.ok(getEl('view').innerHTML.includes("openMember('m1')"), 'who trong dashboard bấm được');
  assert.ok(run('partnerPagerHTML(S.companies.find(c=>c.id==="c1"))').includes("openLead('l1')"), 'tên lead trong one-pager Partner bấm được');
});

/* ---------- A13 ---------- */
test('A13: confirm xoá lead kê khai số deal sẽ gỡ + cảnh báo mất đầu mối chính', () => {
  const { run, confirmMsgs } = loadIndex();
  run("deleteLead('lMain')");
  const msg = confirmMsgs.join('\n');
  assert.ok(msg.includes('1 deal'), 'phải kê số deal bị gỡ lead: ' + msg);
  assert.ok(msg.includes('Đầu mối chính') && msg.includes('mất đầu mối chính'), 'phải cảnh báo mất đầu mối chính');
  assert.equal(run("S.leads.some(l=>l.id==='lMain')"), false);
});

/* ---------- A14 ---------- */
test('A14: picker deal trong form việc + khối gắn deal của drawer lead có tên công ty', () => {
  const { run, getEl } = loadIndex();
  assert.ok(run("taskLinkSelectHTML('')").includes('Deal Pub One · Studio Partner'), 'option deal phải kèm tên công ty');
  run("openLead('lWeird')");
  assert.ok(getEl('drawer').innerHTML.includes('Deal Pub One — Publishing · Studio Partner'), 'option deal ở drawer lead phải kèm tên công ty');
});

/* ---------- A15 + B5 ---------- */
test('A15/B5: drawer deal — Game Studio có tóm tắt đánh giá game, mọi deal có dòng Partner của công ty; stage confirm + form hoạt động thu gọn', () => {
  const { run, getEl, setConfirm, confirmMsgs } = loadIndex();
  run("openDeal('dGS')");
  let d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Đánh giá của game'), 'deal Game Studio có game phải hiện tóm tắt đánh giá game');
  assert.ok(d.includes('Đánh giá Partner của công ty') && d.includes("openCompany('c2')"), 'mọi deal phải có dòng Partner của công ty deal + link sang công ty');
  run("openDeal('d2')");
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Đánh giá Partner của công ty') && d.includes('Chưa đánh giá Partner'), 'deal AI của studio chưa có đánh giá -> dòng Partner hiện Chưa đánh giá Partner');
  /* B5a: confirm chuyển stage */
  run("openDeal('d1')");
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes("confirmMoveStage('d1', this)"), 'select stage phải đi qua confirm');
  setConfirm(false);
  run("selStub={value:'screening'}; confirmMoveStage('d1', selStub)");
  assert.equal(run("S.deals.find(x=>x.id==='d1').stage"), 'sourcing', 'huỷ confirm -> stage không đổi');
  assert.equal(run('selStub.value'), 'sourcing', 'huỷ confirm -> select khôi phục giá trị cũ');
  assert.ok(confirmMsgs.some(m => m.includes('Tìm kiếm / Tiếp nhận') && m.includes('Sơ tuyển')), 'confirm phải nêu nhãn stage cũ → mới');
  setConfirm(true);
  run("selStub={value:'screening'}; confirmMoveStage('d1', selStub)");
  assert.equal(run("S.deals.find(x=>x.id==='d1').stage"), 'screening', 'đồng ý -> stage đổi qua moveStage');
  /* B5b: form thêm hoạt động thu gọn */
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('id="dealActForm" style="display:none'), 'form thêm hoạt động mặc định thu gọn');
  assert.ok(d.includes('toggleDealActivityForm()'), 'phải có nút bấm mở form');
  getEl('na_type').value = 'Note'; getEl('na_who').value = 'zac'; getEl('na_text').value = 'Ghi chú B5'; getEl('na_url').value = '';
  run("addActivity('d1')");
  d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Ghi chú B5'), 'lưu xong hoạt động hiện ở timeline');
  assert.ok(d.includes('id="dealActForm" style="display:none'), 'lưu xong form thu lại (drawer dựng lại)');
});

/* ---------- A16 + B11 ---------- */
test('A16/B11: vGames tên deal bấm mở được; taskRow không gắn deal thì tiêu đề bấm sửa việc', () => {
  const { run, getEl } = loadIndex();
  run("curView='games'; curLine='all'; query=''; render()");
  const v = getEl('view').innerHTML;
  assert.ok(v.includes(`openDeal('dGS')`) && v.includes('>Deal GS One</a>'), 'tên deal liên quan trong thẻ game phải là link mở deal');
  const free = run("taskRow(S.tasks.find(t=>t.id==='tFree'))");
  assert.ok(free.includes(`onclick="editTask('tFree')" title="Bấm để sửa việc"`), 'việc không gắn deal: tiêu đề bấm để sửa việc');
  const withDeal = run("taskRow(S.tasks.find(t=>t.id==='tDeal'))");
  assert.ok(withDeal.includes("openDeal('d1')"), 'việc có deal: tiêu đề vẫn mở deal như cũ');
});

/* ---------- B1 + B13 ---------- */
test('B1/B13: ghi chú điểm thô không còn float dài; fmtPctVal + scoreText làm tròn 1 thập phân ở hiển thị', () => {
  const { run } = loadIndex();
  const note = run('legacyThresholdNote(64.96000000000001)');
  assert.ok(!note.includes('64.96000000000001'), 'không in float dài thô');
  assert.ok(note.includes('65.0'), 'phải kèm giá trị làm tròn 1 thập phân khớp fmtLegacyFinal');
  assert.ok(note.includes('64.96'), 'điểm thô đã làm sạch vẫn đọc được');
  assert.equal(run('fmtPctVal(63.6363636)'), '63.6%');
  assert.equal(run('fmtPctVal(100)'), '100%');
  assert.equal(run("fmtPctVal('abc')"), '—');
  assert.equal(run('scoreText(64.96)'), '65');
  assert.equal(run("scoreText('x')"), '—');
});

/* ---------- B3 ---------- */
test('B3: gỡ liên kết có confirm — detachLeadFromDeal (nêu hồi contacted) + detachDealFromGame nhánh Game Studio', () => {
  const { run, setConfirm, confirmMsgs } = loadIndex();
  setConfirm(false);
  run("detachLeadFromDeal('lMain','d1')");
  assert.deepEqual([...run("S.deals.find(d=>d.id==='d1').leads")], ['l1', 'lMain'], 'huỷ confirm -> không gỡ');
  assert.ok(confirmMsgs.some(m => m.includes('hồi về "contacted"')), 'lead converted + deal cuối -> confirm phải nêu hồi contacted');
  setConfirm(true);
  run("detachLeadFromDeal('lMain','d1')");
  assert.equal(run("S.leads.find(l=>l.id==='lMain').status"), 'contacted', 'gỡ deal cuối -> hồi contacted qua revertLeadIfOrphaned');
  setConfirm(false);
  run("detachDealFromGame('dGS','gOurs')");
  assert.equal(run("S.deals.find(d=>d.id==='dGS').game"), 'gOurs', 'huỷ confirm -> giữ liên kết game');
  setConfirm(true);
  run("detachDealFromGame('dGS','gOurs')");
  assert.equal(run("S.deals.find(d=>d.id==='dGS').game"), undefined, 'đồng ý -> gỡ liên kết game');
  run("detachDealFromGame('d1','gPartner')");
  assert.equal(run("S.deals.find(d=>d.id==='d1').game"), 'gPartner', 'nhánh Publishing vẫn bị chặn như cũ');
});

/* ---------- B7 + B17 ---------- */
test('B7/B17: empty-state việc/game phân biệt trống thật vs không khớp lọc; bảng công ty dùng chữ "công ty"', () => {
  const a = loadIndex();
  a.run("S.tasks=[]; curView='tasks'; query=''; render()");
  assert.ok(a.getEl('view').innerHTML.includes('Chưa có việc nào'));
  a.run("S.tasks=[{id:'tx',title:'Việc X',assignee:'',done:false}]; query='zzz-khong-khop'; render()");
  assert.ok(a.getEl('view').innerHTML.includes('Không có việc nào khớp tìm kiếm'));
  const b = loadIndex();
  b.run("curView='games'; curLine='game_studio'; query=''; render()");
  assert.ok(!b.getEl('view').innerHTML.includes('Không có game nào'), 'đang có game thì không hiện empty-state');
  b.run("query='zzz-khong-khop'; render()");
  assert.ok(b.getEl('view').innerHTML.includes('Không có game nào khớp tìm kiếm'), 'mọi mảng phải có empty-state khi không khớp (trước đây chỉ ai/metaverse)');
  const c = loadIndex();
  c.run("curView='companies'; curLine='all'; query='zzz-khong-khop'; render()");
  /* F4 (vòng QA sau): đang có tìm kiếm mà không khớp -> câu khớp tìm kiếm,
     KHÔNG còn câu duy nhất "Không có công ty nào ở mảng này." cho mọi ca. */
  assert.ok(c.getEl('view').innerHTML.includes('Không có công ty nào khớp tìm kiếm hiện tại.'));
  assert.ok(!c.getEl('view').innerHTML.includes('Không có khách nào'));
});

/* ---------- B8 ---------- */
test('B8: badge loại ở tiêu đề mọi form sửa; one-pager Partner badge ở vùng tiêu đề, không còn ở dòng kv Công ty', () => {
  const { run, getEl } = loadIndex();
  const cases = [["editDeal('d1')", 'deal'], ["editCompany('c1')", 'company'], ["editGame('gPartner')", 'game'], ["editLead('l1')", 'lead'], ["editMember('m1')", 'member'], ["editActivity('a1')", 'activity']];
  for (const [call, type] of cases) { run(call); assert.ok(getEl('editBox').innerHTML.includes(`data-type="${type}"`), call + ' thiếu badge ' + type); }
  const pager = run("partnerPagerHTML(S.companies.find(c=>c.id==='c1'))");
  assert.ok(pager.includes('data-type="company"'));
  assert.ok(pager.indexOf('data-type="company"') < pager.indexOf('A. Tổng quan công ty'), 'badge phải ở vùng tiêu đề, trước mục A');
  assert.ok(!sliceBetween(pager, '<div class="k">Công ty</div>', '<div class="k">Đầu mối').includes('type-badge'), 'dòng kv Công ty không còn badge');
});

/* ---------- B9 + B10 + B16 (lead) ---------- */
test('B9/B10/B16: drawer lead hiện nguyên trạng thái lạ; game chưa có request -> "Chưa đánh giá"; hết deal chưa gắn hiện dòng rõ ràng', () => {
  const { run, getEl } = loadIndex();
  run("openLead('lWeird')");
  assert.ok(getEl('drawer').innerHTML.includes('>weird_status</span>'), 'trạng thái lạ phải hiện nguyên giá trị đã lưu, không nuốt thành —');
  assert.equal(run("gameEvalSummaryText('gNoReq')"), 'Chưa đánh giá');
  run("S.deals.forEach(d=>{ d.leads=[...(d.leads||[]),'lAll']; }); S.leads.push({id:'lAll',name:'Lead All',company:'c1',line:'ai',status:'new',note:'',when:''}); openLead('lAll')");
  /* P1 (đợt 7 quyết định): dropdown gắn deal của drawer lead chỉ liệt kê deal
     CÙNG CÔNG TY -> câu trống đổi thành "Không còn deal nào cùng công ty…". */
  assert.ok(getEl('drawer').innerHTML.includes('Không còn deal nào cùng công ty chưa gắn để chọn.'));
});

/* ---------- B12 (a/c/d) ---------- */
test('B12: form tạo deal/lead ở "Tất cả" có placeholder mảng + chặn lưu; form mời thành viên có placeholder + chặn gửi khi chưa chọn', () => {
  const { run, getEl } = loadIndex();
  run("curLine='all'; openAdd()");
  assert.ok(getEl('f_line').innerHTML.includes('— Chọn mảng —'), 'openAdd ở curLine=all phải có option placeholder mảng');
  const nDeals = run('S.deals.length');
  getEl('f_title').value = 'Deal No Line'; getEl('f_line').value = '';
  run('saveDeal()');
  assert.equal(run('S.deals.length'), nDeals, 'chưa chọn mảng -> saveDeal chặn, không tạo deal');
  assert.ok(getEl('toast').textContent.includes('Chọn mảng'));
  run("curLine='publishing'; openAdd()");
  assert.ok(!getEl('f_line').innerHTML.includes('— Chọn mảng —'), 'mở từ mảng cụ thể giữ chọn sẵn như cũ');
  /* lead */
  const b = loadIndex();
  b.run("curLine='all'; editLead(null)");
  assert.ok(b.getEl('editBox').innerHTML.includes('— Chọn mảng —'), 'editLead tạo mới ở curLine=all không cứng publishing nữa');
  const nLeads = b.run('S.leads.length');
  b.getEl('e_lname').value = 'Lead No Line'; b.getEl('e_lline').value = '';
  b.run('saveLead(null)');
  assert.equal(b.run('S.leads.length'), nLeads, 'chưa chọn mảng -> saveLead chặn');
  /* invite */
  const c = loadIndex();
  c.run("window.SavaAuth={currentUser:()=>({role:'admin',memberId:'zac'}), isValidEmail:()=>true, callMemberAdmin:async()=>({})}");
  c.run('openInviteMember()');
  const form = c.getEl('editBox').innerHTML;
  assert.ok(form.includes('— Chọn thành viên —'), 'ô chọn thành viên gắn-có-sẵn phải có placeholder');
  assert.ok(!/<option value="zac" selected>/.test(form), 'không mặc định chọn thành viên đầu tiên nữa');
  const submit = html.slice(html.indexOf('async function submitInviteMember'), html.indexOf('async function resendMemberInvite'));
  assert.ok(submit.includes('if (!mid)'), 'submitInviteMember phải chặn gửi khi chưa chọn thành viên');
});

/* ---------- B18 ---------- */
test('B18: KPI Việc theo người dùng class kpis-3 (không inline repeat(3,1fr)); CSS pager cho phép wrap ở màn hẹp', () => {
  const fn = html.slice(html.indexOf('function vTasksByMember'), html.indexOf('/* ===== Thành viên'));
  assert.ok(fn.includes('class="kpis kpis-3"') && !fn.includes('grid-template-columns:repeat(3,1fr)'), 'overview KPI không còn inline thắng media query');
  assert.ok(html.includes('.kpis-3{grid-template-columns:repeat(2,1fr)}'), 'media <=900px phải đưa kpis-3 về 2 cột');
  assert.ok(html.includes('#partnerPagerBox .score{flex-wrap:wrap}') && html.includes('#partnerPagerBox .score .lb{width:auto !important'), 'CSS pager phải cho wrap + thu nhãn pillar ở màn hẹp');
});

/* ---------- C2 ---------- */
test('C2: xoá Company/Game còn request Publishing tham chiếu -> CHẶN xoá, báo số request + hướng dẫn; hết tham chiếu xoá như cũ', () => {
  const { run, getEl } = loadIndex();
  run("deleteCompany('cDel')");
  assert.ok(run("S.companies.some(c=>c.id==='cDel')"), 'còn request company -> không xoá local');
  assert.ok(getEl('toast').textContent.includes('1 yêu cầu') && getEl('toast').textContent.includes('module Publishing trước'));
  run("deleteGame('gDel')");
  assert.ok(run("S.games.some(g=>g.id==='gDel')"), 'còn request game -> không xoá local');
  assert.ok(getEl('toast').textContent.includes('Không xoá được game'));
  run("deleteCompany('cEmpty')");
  assert.ok(!run("S.companies.some(c=>c.id==='cEmpty')"), 'không còn request tham chiếu -> xoá như cũ');
});

/* ---------- C9 ---------- */
test('C9: Việc theo người — assignee là member đã xoá tách nhóm riêng, "Chưa gán" chỉ cho assignee rỗng', () => {
  const { run, getEl } = loadIndex();
  run("curView='tasksByMember'; taskMemberFilter='all'; query=''; render()");
  const v = getEl('view').innerHTML;
  const ghostSec = sliceBetween(v, 'Thành viên đã xoá', 'Chưa gán');
  assert.ok(ghostSec.includes('Task Ghost Member') && !ghostSec.includes('Task Unassigned'));
  const noneSec = v.slice(v.indexOf('Chưa gán'));
  assert.ok(noneSec.includes('Task Unassigned') && !noneSec.includes('Task Ghost Member'));
});

/* ---------- C11b ---------- */
test('C11b: field tiền custom dạng text legacy giữ nguyên cấu trúc custom[k] khi ô nhập không đổi (cfReadValue + saveEditDeal)', () => {
  const { run, getEl } = loadIndex();
  const r = run("cfReadValue('publishing','planned_investment', { planned_investment: 'TextLegacy500' })");
  assert.equal(r.value, 'TextLegacy500', 'không đổi -> value giữ ở custom[k]');
  assert.ok(!r.extra || !('planned_investment_text' in r.extra), 'không sinh custom[k+_text]');
  run("editDeal('dMoney')");
  getEl('e_title').value = 'Deal Money'; getEl('e_company').value = 'c1'; getEl('e_line').value = 'publishing';
  getEl('e_stage').value = 'sourcing'; getEl('e_owner').value = 'zac'; getEl('e_due').value = '';
  getEl('e_game').value = 'gPartner'; getEl('e_cf_planned_investment').value = ''; getEl('e_cf_planned_investment_cur').value = 'VND';
  run("saveEditDeal('dMoney')");
  const cu = run("S.deals.find(d=>d.id==='dMoney').custom");
  assert.equal(cu.planned_investment, 'TextLegacy500', 'lưu không đổi -> text legacy còn nguyên ở custom[k]');
  assert.ok(!('planned_investment_text' in cu), 'không bị chuyển cấu trúc sang _text');
});
