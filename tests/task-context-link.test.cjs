/* Thêm việc ngay từ ngữ cảnh (Company / Lead / Deal / Game):
   - Một việc gắn TỐI ĐA MỘT đối tượng nguồn: Deal qua t.deal (cơ chế cũ,
     adapter -> cột tasks.deal_id); Company/Lead/Game qua t.company /
     t.lead / t.game — field mở rộng CỐ Ý không nằm trong TASK_KNOWN của
     adapter nên đi qua tasks.legacy_extra (mẫu deal.vertical /
     lead.mainContact), KHÔNG cột/SQL mới, và tasks vẫn không cấp cho MKT.
   - UI: drawer Company/Lead/Deal/Game (phía BD trong index.html) có mục
     "Việc liên quan" + nút "+ Thêm việc" mở ĐÚNG form editTask sẵn có với
     liên kết điền sẵn (chip trên form + ô chọn liên kết hợp nhất
     e_tlink "<type>:<id>"); view Công việc hiện chip liên kết bấm về được
     chi tiết đối tượng qua taskRow/taskLinkChipHTML.
   - Sửa việc ở view Công việc giữ nguyên liên kết (saveTask chuẩn hoá:
     xoá cả 4 khoá rồi đặt đúng 1 khoá theo ô chọn).
   - Xoá company/lead/game có việc gắn: gỡ liên kết, KHÔNG xoá việc —
     cùng quy ước xoá deal sẵn có (performDeleteDeal gỡ t.deal).
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const base = over => Object.assign({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] }, over || {});
const task = over => Object.assign({ id: 'tx', title: 'Việc X', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false }, over || {});

/* ---------- Adapter round-trip qua legacy_extra ---------- */
test('adapter: company/lead/game của task round-trip qua tasks.legacy_extra; deal vẫn qua cột deal_id', () => {
  const A = require('../supabase-adapter.js');
  const s = base({ tasks: [
    task({ id: 't1', company: 'c1' }),
    task({ id: 't2', lead: 'l1' }),
    task({ id: 't3', game: 'g1' }),
    task({ id: 't4', deal: 'd1' }),
    task({ id: 't5' }),
  ] });
  const rows = A.crmStateToRows(s);
  const byId = id => rows.tasks.find(r => r.id === id);
  assert.equal(byId('t1').legacy_extra.company, 'c1');
  assert.equal(byId('t2').legacy_extra.lead, 'l1');
  assert.equal(byId('t3').legacy_extra.game, 'g1');
  assert.equal(byId('t1').deal_id, null, 'việc gắn công ty không được bịa deal_id');
  assert.equal(byId('t4').deal_id, 'd1', 'deal giữ cơ chế cột cũ');
  assert.ok(!('deal' in byId('t4').legacy_extra) && !('company' in byId('t5').legacy_extra), 'không sinh khoá thừa');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  const b = id => back.tasks.find(t => t.id === id);
  assert.equal(b('t1').company, 'c1'); assert.equal(b('t2').lead, 'l1');
  assert.equal(b('t3').game, 'g1'); assert.equal(b('t4').deal, 'd1');
  assert.deepEqual(['deal', 'company', 'lead', 'game'].filter(k => k in b('t5')), [], 'việc không gắn gì đọc lại không bịa liên kết');
});

/* ---------- Harness index.html THẬT ---------- */
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: 'Anh Một — CEO', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01' }],
    tasks: [
      { id: 'tc1', title: 'Việc của công ty', assignee: 'linh', due: '', dueDate: '2026-10-01', done: false, overdue: false, company: 'c1' },
      { id: 'tl1', title: 'Việc của lead', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false, lead: 'l1' },
      { id: 'tg1', title: 'Việc của game', assignee: 'linh', due: '', dueDate: '', done: true, overdue: false, game: 'g1' },
      { id: 'td1', title: 'Việc của deal', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false, deal: 'd1' },
      { id: 'tn1', title: 'Việc tự do', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false },
    ],
    activities: [],
  };
}
function loadIndex(state) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(state || fixtureState()));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
function fillTaskForm(getEl, linkVal) {
  getEl('e_ttitle').value = 'Việc mới từ ngữ cảnh';
  getEl('e_tassignee').value = 'linh';
  getEl('e_tdueDate').value = '2026-11-05';
  getEl('e_tlink').value = linkVal;
  getEl('e_tdone').checked = false;
}
const LINK_KEYS = ['deal', 'company', 'lead', 'game'];

test('index: taskRow hiện chip liên kết đúng đối tượng cho cả 4 loại + không chip cho việc tự do', () => {
  const { run } = loadIndex();
  const row = id => run(`taskRow(S.tasks.find(t=>t.id==='${id}'))`);
  assert.ok(row('tc1').includes('Công ty: Công ty Một') && row('tc1').includes("openCompany('c1')"), 'chip công ty bấm về drawer công ty');
  assert.ok(row('tl1').includes('Lead: Người Một') && row('tl1').includes("openLead('l1')"));
  assert.ok(row('tg1').includes('Game: Game Một') && row('tg1').includes("openGame('g1')"));
  assert.ok(row('td1').includes('Deal: Deal Một') && row('td1').includes("openDeal('d1')"), 'chip deal giữ cơ chế cũ');
  assert.ok(!row('tn1').includes('chip'), 'việc không gắn gì không có chip');
});

test('index: view Công việc (vTasks) hiện chip liên kết của việc gắn Company/Lead/Game', () => {
  const { run, getEl } = loadIndex();
  run('curView = "tasks"; render();');
  const view = getEl('view').innerHTML;
  for (const s of ['Công ty: Công ty Một', 'Lead: Người Một', 'Game: Game Một', 'Deal: Deal Một']) assert.ok(view.includes(s), 'thiếu chip: ' + s);
});

test('index: 4 drawer đều có mục Việc liên quan + nút + Thêm việc điền sẵn đúng ngữ cảnh', () => {
  const { run, getEl } = loadIndex();
  const cases = [
    ["openCompany('c1')", 'company', 'c1', 'Việc của công ty'],
    ["openLead('l1')", 'lead', 'l1', 'Việc của lead'],
    ["openGame('g1')", 'game', 'g1', 'Việc của game'],
    ["openDeal('d1')", 'deal', 'd1', 'Việc của deal'],
  ];
  for (const [open, type, id, title] of cases) {
    run(open);
    const html = getEl('drawer').innerHTML;
    assert.ok(html.includes('Việc liên quan (1)'), open + ': thiếu mục Việc liên quan');
    assert.ok(html.includes(`editTask(null,'${type}','${id}')`), open + ': nút + Thêm việc phải mở form với liên kết điền sẵn');
    assert.ok(html.includes(title), open + ': thiếu việc đã gắn');
    assert.ok(html.includes("editTask('"), open + ': việc liên quan phải mở được form sửa việc');
  }
  run("openCompany('c1')");
  assert.ok(getEl('drawer').innerHTML.includes('Quá hạn'), 'việc quá hạn trong mục Việc liên quan phải hiện nhãn Quá hạn (dueDate 2026-10-01)');
});

test('index: drawer rỗng việc -> dòng trống nhẹ nhàng + vẫn có nút thêm việc', () => {
  const st = fixtureState(); st.tasks = [];
  const { run, getEl } = loadIndex(st);
  run("openGame('g1')");
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('Việc liên quan (0)') && html.includes('Chưa có việc nào gắn với game này'));
  assert.ok(html.includes("editTask(null,'game','g1')"));
});

test('index: tạo việc từ từng ngữ cảnh qua ĐÚNG form editTask/saveTask -> đúng 1 liên kết, hiện lại ở view Công việc', () => {
  const cases = [['company', 'c1', 'Công ty: Công ty Một'], ['lead', 'l1', 'Lead: Người Một'], ['game', 'g1', 'Game: Game Một'], ['deal', 'd1', 'Deal: Deal Một']];
  for (const [type, id, chip] of cases) {
    const { run, getEl, ls } = loadIndex();
    run(`editTask(null,'${type}','${id}')`);
    const form = getEl('editBox').innerHTML;
    assert.ok(form.includes(chip.replace(': ', ': ')), type + ': form phải hiện chip đối tượng điền sẵn');
    assert.ok(form.includes(`<option value="${type}:${id}" selected>`), type + ': ô chọn liên kết phải chọn sẵn đối tượng');
    assert.ok(form.includes('defaultOwnerId') === false); /* mặc định người làm nằm ở state, kiểm ở dưới qua assignee khi không đổi */
    fillTaskForm(getEl, `${type}:${id}`);
    run('saveTask(null)');
    const created = run("S.tasks[S.tasks.length-1]");
    assert.equal(created.title, 'Việc mới từ ngữ cảnh');
    assert.equal(created.assignee, 'linh');
    assert.equal(created[type], id, type + ': liên kết phải lưu đúng');
    assert.deepEqual(LINK_KEYS.filter(k => k in created), [type], 'việc mới chỉ có đúng 1 khoá liên kết');
    assert.ok(run(`taskRow(S.tasks[S.tasks.length-1])`).includes(chip), 'việc mới phải hiện chip đúng ở view Công việc');
    assert.ok(run(`relatedTasksHTML('${type}','${id}')`).includes('Việc mới từ ngữ cảnh'), 'việc mới phải hiện trong Việc liên quan của đối tượng');
    const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
    assert.equal(saved.tasks[saved.tasks.length - 1][type], id, 'liên kết phải ghi xuống kho qua save()');
  }
});

test('index: tạo việc từ view Công việc như cũ — không gắn gì, hoặc gắn deal — vẫn chạy nguyên vẹn', () => {
  const { run, getEl } = loadIndex();
  run('editTask(null)');
  assert.ok(getEl('editBox').innerHTML.includes('id="e_tlink"'), 'form cũ nay là ô chọn liên kết hợp nhất');
  fillTaskForm(getEl, '');
  run('saveTask(null)');
  let created = run('S.tasks[S.tasks.length-1]');
  assert.deepEqual(LINK_KEYS.filter(k => k in created), [], 'không chọn liên kết -> việc tự do như cũ');
  run('editTask(null)');
  fillTaskForm(getEl, 'deal:d1');
  run('saveTask(null)');
  created = run('S.tasks[S.tasks.length-1]');
  assert.equal(created.deal, 'd1');
  assert.deepEqual(LINK_KEYS.filter(k => k in created), ['deal']);
});

test('index: sửa việc ở view Công việc giữ nguyên liên kết; đổi liên kết thì chỉ còn liên kết mới', () => {
  const { run, getEl } = loadIndex();
  run("editTask('tg1')");
  assert.ok(getEl('editBox').innerHTML.includes('<option value="game:g1" selected>'), 'mở sửa phải chọn sẵn liên kết game hiện tại');
  fillTaskForm(getEl, 'game:g1');
  getEl('e_ttitle').value = 'Việc của game (đã sửa)';
  run("saveTask('tg1')");
  let t = run("S.tasks.find(t=>t.id==='tg1')");
  assert.equal(t.game, 'g1'); assert.deepEqual(LINK_KEYS.filter(k => k in t), ['game']);
  run("editTask('tg1')");
  fillTaskForm(getEl, 'lead:l1');
  run("saveTask('tg1')");
  t = run("S.tasks.find(t=>t.id==='tg1')");
  assert.equal(t.lead, 'l1'); assert.ok(!('game' in t), 'đổi liên kết phải gỡ khoá cũ');
  assert.deepEqual(LINK_KEYS.filter(k => k in t), ['lead']);
});

test('index: xoá company/lead/game có việc gắn -> gỡ liên kết, việc VẪN CÒN (không âm thầm xoá việc)', () => {
  {
    const { run } = loadIndex();
    run("deleteCompany('c1')");
    const t = run("S.tasks.find(t=>t.id==='tc1')");
    assert.ok(t, 'việc gắn công ty phải còn sau khi xoá công ty');
    assert.ok(!('company' in t), 'liên kết công ty phải được gỡ');
  }
  {
    const { run } = loadIndex();
    run("deleteLead('l1')");
    const t = run("S.tasks.find(t=>t.id==='tl1')");
    assert.ok(t && !('lead' in t));
  }
  {
    const { run } = loadIndex();
    run("deleteGame('g1')");
    const t = run("S.tasks.find(t=>t.id==='tg1')");
    assert.ok(t && !('game' in t));
  }
  {
    const { run } = loadIndex();
    run("performDeleteDeal('d1')");
    const t = run("S.tasks.find(t=>t.id==='td1')");
    assert.ok(t && !('deal' in t), 'quy ước cũ cho deal giữ nguyên');
  }
});

test('tĩnh: chỉ MỘT form việc (editTask) trong index.html; phía MKT không có bề mặt việc nào', () => {
  const idx = read('index.html');
  assert.equal((idx.match(/function editTask\(/g) || []).length, 1, 'không được dựng form việc song song');
  assert.ok(!idx.includes('e_tdeal'), 'ô chọn deal riêng cũ đã thay bằng ô liên kết hợp nhất e_tlink');
  for (const f of ['mkt.html', 'publishing.js', 'publishing.html']) {
    const src = read(f);
    assert.ok(!src.includes('editTask') && !src.includes('Việc liên quan') && !src.includes('taskLink'), f + ' không được render việc cho MKT');
  }
  const policies = read('supabase/policies.sql');
  assert.ok(/create policy tasks_select[\s\S]*?has_crm_role\(array\['admin', 'bd'\]\)/.test(policies), 'policy tasks vẫn chỉ admin+bd');
});
