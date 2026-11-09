/* Siết quyền XEM VIỆC theo người phụ trách (Zac chốt 09/11/2026):
   - Tầng dữ liệu (tĩnh): supabase/task-privacy-events-shared.sql +
     policies.sql — tasks SELECT/UPDATE/DELETE: Admin tất cả, BD/MKT chỉ
     việc assignee_id = current_member_id(); chưa gán chỉ Admin; INSERT
     giữ nguyên admin+bd không điều kiện assignee. events SELECT mở cho
     admin/bd/mkt; ghi events + event_links vẫn admin+bd.
   - Tầng giao diện (runtime): helper canViewTask/visibleTasks/
     taskPrivacyActive trong index.html — non-Admin đã đăng nhập chỉ
     render việc của mình ở Lịch/danh sách/drawer liên quan; Admin và
     môi trường chưa có danh tính (test/offline) giữ hành vi cũ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function iso(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
    ],
    companies: [], games: [], deals: [], leads: [],
    tasks: [
      { id: 'tHoang', title: 'Việc Của Hoàng', assignee: 'hoangdaden', due: '', dueDate: iso(1), done: false, overdue: false },
      { id: 'tYen', title: 'Việc Của Yến', assignee: 'yen', due: '', dueDate: iso(1), done: false, overdue: false },
      { id: 'tZac', title: 'Việc Của Zac', assignee: 'zac', due: '', dueDate: iso(-1), done: false, overdue: false },
      { id: 'tNone', title: 'Việc Chưa Gán', assignee: '', due: '', dueDate: iso(2), done: false, overdue: false },
      { id: 'tHoangLink', title: 'Việc Hoàng Gắn Deal', assignee: 'hoangdaden', deal: 'd1', due: '', dueDate: iso(3), done: false, overdue: false },
      { id: 'tYenLink', title: 'Việc Yến Gắn Deal', assignee: 'yen', deal: 'd1', due: '', dueDate: iso(3), done: false, overdue: false },
    ],
    activities: [], verticals: [],
    events: [
      { id: 'ev1', name: 'Expo Chung', status: 'planned', date: iso(1), endDate: iso(1), location: '', note: '', attendees: [], companies: [], leads: [], deals: [] },
    ],
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
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {},
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
function loginAs(h, memberId, role) {
  h.ctx.SavaAuth = { currentUser: () => ({ memberId, role, name: memberId }) };
}

/* ---------- Tĩnh: SQL migration + policies.sql ---------- */
test('SQL tĩnh: migration siết tasks theo assignee, INSERT giữ nguyên, events SELECT xem chung', () => {
  const mig = read('supabase/task-privacy-events-shared.sql');
  for (const pol of ['tasks_select', 'tasks_update', 'tasks_delete']) {
    const seg = mig.slice(mig.indexOf('create policy ' + pol));
    const body = seg.slice(0, seg.indexOf(';'));
    assert.ok(body.includes("has_crm_role(array['admin'])"), pol + ' phải có nhánh Admin');
    assert.ok(body.includes("has_crm_role(array['bd', 'mkt'])"), pol + ' phải có nhánh bd/mkt');
    assert.ok(body.includes('assignee_id = public.current_member_id()'), pol + ' phải khớp assignee với current_member_id()');
  }
  const ins = mig.slice(mig.indexOf('create policy tasks_insert'));
  const insBody = ins.slice(0, ins.indexOf(';'));
  assert.ok(insBody.includes("with check (public.has_crm_role(array['admin', 'bd']))"), 'INSERT giữ nguyên admin+bd');
  assert.ok(!insBody.includes('assignee_id'), 'INSERT không được kèm điều kiện assignee (gán cho người khác được)');
  const evSel = mig.slice(mig.indexOf('create policy events_select_shared'));
  assert.ok(evSel.slice(0, evSel.indexOf(';')).includes("has_crm_role(array['admin', 'bd', 'mkt'])"), 'events SELECT phải mở admin/bd/mkt');
  for (const pol of ['events_insert_bd', 'events_update_bd', 'events_delete_bd']) {
    const seg = mig.slice(mig.indexOf('create policy ' + pol));
    const body = seg.slice(0, seg.indexOf(';'));
    assert.ok(body.includes("has_crm_role(array['admin', 'bd'])") && !body.includes("'mkt'"), pol + ' ghi events vẫn chỉ admin+bd');
  }
  assert.ok(!mig.includes('drop policy if exists event_links'), 'migration không được đụng policy event_links');
  const pol = read('supabase/policies.sql');
  assert.ok(/create policy tasks_select[\s\S]*?assignee_id = public\.current_member_id\(\)/.test(pol), 'policies.sql phải khớp migration (tasks_select)');
  assert.ok(/create policy tasks_delete[\s\S]*?assignee_id = public\.current_member_id\(\)/.test(pol), 'policies.sql phải khớp migration (tasks_delete)');
});

/* ---------- Runtime: helper lọc theo người xem ---------- */
test('canViewTask/visibleTasks: BD chỉ thấy việc của mình; chưa gán chỉ Admin; Admin tất cả; chưa đăng nhập giữ hành vi cũ', () => {
  const h = loadIndex();
  assert.equal(h.run('visibleTasks().length'), 6, 'chưa có danh tính (test/offline) -> giữ hành vi cũ, thấy tất cả');
  loginAs(h, 'hoangdaden', 'bd');
  assert.deepEqual([...h.run('visibleTasks().map(t=>t.id)')].sort(), ['tHoang', 'tHoangLink'], 'BD Hoàng chỉ thấy 2 việc của mình');
  assert.equal(h.run("canViewTask(S.tasks.find(t=>t.id==='tNone'))"), false, 'việc chưa gán: BD không thấy');
  assert.equal(h.run("canViewTask(S.tasks.find(t=>t.id==='tYen'))"), false, 'việc của Yến: Hoàng không thấy');
  loginAs(h, 'zac', 'admin');
  assert.equal(h.run('visibleTasks().length'), 6, 'Admin thấy tất cả (kể cả chưa gán)');
  loginAs(h, 'yen', 'bd');
  assert.deepEqual([...h.run('visibleTasks().map(t=>t.id)')].sort(), ['tYen', 'tYenLink'], 'BD Yến chỉ thấy việc của mình');
});

/* ---------- Runtime: render view Việc + Lịch + drawer liên quan ---------- */
test('render: BD ở view Việc không thấy tiêu đề việc của người khác ở Lịch/danh sách; sự kiện vẫn hiện; drawer liên quan đã lọc', () => {
  const h = loadIndex();
  loginAs(h, 'hoangdaden', 'bd');
  h.run("calAnchor = todayStr(); curView = 'tasks'; query=''; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('Việc Của Hoàng'), 'việc của Hoàng phải hiện');
  assert.ok(!view.includes('Việc Của Yến') && !view.includes('Việc Của Zac') && !view.includes('Việc Chưa Gán'), 'việc người khác/chưa gán không được render cho BD');
  assert.ok(view.includes('Expo Chung'), 'sự kiện vẫn hiện chung trên lịch cho BD');
  assert.ok(view.includes('Việc của tôi'), 'tiêu đề danh sách của non-Admin là Việc của tôi');
  assert.deepEqual([...h.run("tasksForLink('deal','d1').map(t=>t.id)")], ['tHoangLink'], 'drawer liên quan: BD chỉ thấy việc của mình gắn deal');
  const items = h.run('calBuildItems()');
  assert.ok(items.dated.every(i => i.kind !== 'task' || i.ref.assignee === 'hoangdaden'), 'calBuildItems: việc dated chỉ của Hoàng');
  /* Admin: mọi thứ như cũ */
  loginAs(h, 'zac', 'admin');
  h.run("curView = 'tasks'; query=''; render();");
  const aview = h.getEl('view').innerHTML;
  assert.ok(aview.includes('Việc Của Yến') && aview.includes('Việc Chưa Gán'), 'Admin vẫn thấy việc của mọi người + chưa gán');
  assert.ok(aview.includes('Việc của cả team'), 'Admin giữ tiêu đề Việc của cả team');
});
