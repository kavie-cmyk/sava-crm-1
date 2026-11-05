/* Đợt SỰ KIỆN 5/11/2026 — drawer Sự kiện thêm "+ Thêm việc" và "+ Thêm note":
   - Việc gắn sự kiện dùng ĐÚNG cơ chế task-context sẵn có: t.event là field
     mở rộng thứ 5 (sau deal/company/lead/game), CỐ Ý không nằm trong
     TASK_KNOWN của adapter nên đi qua tasks.legacy_extra, không cột/SQL
     mới cho tasks. relatedTasksHTML("event", id) + editTask(null,'event',id)
     là đường tạo duy nhất; chip ở view Việc / Việc theo người nhảy về
     drawer sự kiện (openEvent) + deep-link ?open=event.
   - Hoạt động gắn TRỰC TIẾP vào sự kiện là loại chủ thứ 4: state mang đúng
     một khoá {deal, lead, game, event}; DB thêm cột activities.event_id
     (FK -> events ON DELETE CASCADE) + nới CHECK exactly-one-owner thành
     đúng-1-trong-4 (file supabase/activity-event.sql). KHÔNG gắn nhờ vào
     lead/deal liên kết của sự kiện.
   - Xoá sự kiện: việc gắn sự kiện bị GỠ liên kết (việc còn nguyên, như mọi
     đối tượng khác); hoạt động trực tiếp bị xoá theo (FK CASCADE, như
     lead/game); hoạt động qua deal/lead liên kết giữ nguyên.
   Harness vm nạp index.html THẬT như task-context-link.test.cjs. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const adapter = require('../supabase-adapter.js');

/* ---------- Fixture + harness index.html (mẫu task-context-link) ---------- */
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['l1'] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: 'Anh Một — CEO', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'converted', note: '', when: '2026-10-01' }],
    tasks: [
      { id: 'tev1', title: 'Việc của sự kiện', assignee: 'linh', due: '', dueDate: '2026-10-01', done: false, overdue: false, event: 'ev1' },
      { id: 'td1', title: 'Việc của deal', assignee: 'zac', due: '', dueDate: '', done: false, overdue: false, deal: 'd1' },
    ],
    activities: [
      { id: 'aev1', event: 'ev1', who: 'zac', type: 'Meeting', text: 'Gặp trực tiếp tại sự kiện', when: '2026-10-20', url: 'https://www.messenger.com/t/999' },
      { id: 'ad1', deal: 'd1', who: 'linh', type: 'Email', text: 'Hoạt động qua deal liên kết', when: '2026-10-21', url: '' },
    ],
    events: [
      { id: 'ev1', name: 'Expo Một', date: '2026-10-20', endDate: '2026-10-20', location: 'HCMC', note: '', attendees: ['zac'], companies: ['c1'], leads: ['l1'], deals: ['d1'], status: 'attended' },
      { id: 'evSolo', name: 'Expo Chưa Deal', date: '2026-11-10', endDate: '2026-11-10', location: 'HN', note: '', attendees: [], companies: [], leads: [], deals: [], status: 'planned' },
    ],
    verticals: [],
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
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
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
  getEl('e_ttitle').value = 'Việc mới từ sự kiện';
  getEl('e_tassignee').value = 'linh';
  getEl('e_tdueDate').value = '05-11-2026';
  getEl('e_tlink').value = linkVal;
  getEl('e_tdone').checked = false;
}
function fillEventAct(getEl, over) {
  const vals = Object.assign({ type: 'Note', who: 'zac', text: 'Hoạt động mới của sự kiện', url: 'https://drive.google.com/file/d/abc/view' }, over || {});
  getEl('na_event_type').value = vals.type;
  getEl('na_event_who').value = vals.who;
  getEl('na_event_text').value = vals.text;
  getEl('na_event_url').value = vals.url;
  if (over && over.target !== undefined) getEl('na_event_target').value = over.target;
  if (over && over.deal !== undefined) getEl('na_event_deal').value = over.deal;
  return vals;
}
const LINK_KEYS = ['deal', 'company', 'lead', 'game', 'event'];
const OWNER_KEYS = ['deal', 'lead', 'game', 'event'];

/* ---------- Việc gắn sự kiện ---------- */
test('task: taskRow hiện chip Sự kiện bấm về openEvent; view Việc hiện chip đó', () => {
  const { run, getEl } = loadIndex();
  const row = run("taskRow(S.tasks.find(t=>t.id==='tev1'))");
  assert.ok(row.includes('Sự kiện: Expo Một') && row.includes("openEvent('ev1')"), 'chip sự kiện phải bấm về drawer sự kiện');
  run('curView = "tasks"; render();');
  assert.ok(getEl('view').innerHTML.includes('Sự kiện: Expo Một'), 'view Việc phải hiện chip sự kiện');
});

test('task: drawer sự kiện có mục Việc liên quan + nút + Thêm việc điền sẵn + việc mở sửa được', () => {
  const { run, getEl } = loadIndex();
  run("openEvent('ev1')");
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('Việc liên quan (1)'), 'thiếu mục Việc liên quan trong drawer sự kiện');
  assert.ok(html.includes("editTask(null,'event','ev1')"), 'nút + Thêm việc phải mở form editTask với sự kiện điền sẵn');
  assert.ok(html.includes('Việc của sự kiện'), 'thiếu việc đã gắn với sự kiện');
  assert.ok(html.includes("editTask('tev1')"), 'việc liên quan phải mở được form sửa');
});

test('task: tạo việc từ drawer sự kiện qua ĐÚNG form editTask/saveTask -> đúng 1 liên kết event, hiện lại ở khối + view Việc', () => {
  const { run, getEl, ls } = loadIndex();
  run("editTask(null,'event','ev1')");
  const form = getEl('editBox').innerHTML;
  assert.ok(form.includes('Sự kiện: Expo Một'), 'form phải hiện chip sự kiện điền sẵn');
  assert.ok(form.includes('<option value="event:ev1" selected>'), 'ô chọn liên kết phải chọn sẵn sự kiện');
  fillTaskForm(getEl, 'event:ev1');
  run('saveTask(null)');
  const created = run('S.tasks[S.tasks.length-1]');
  assert.equal(created.title, 'Việc mới từ sự kiện');
  assert.equal(created.event, 'ev1');
  assert.deepEqual(LINK_KEYS.filter(k => k in created), ['event'], 'việc mới chỉ có đúng 1 khoá liên kết');
  assert.ok(run('taskRow(S.tasks[S.tasks.length-1])').includes('Sự kiện: Expo Một'));
  assert.ok(run("relatedTasksHTML('event','ev1')").includes('Việc mới từ sự kiện'));
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.tasks[saved.tasks.length - 1].event, 'ev1', 'liên kết phải ghi xuống kho qua save()');
});

test('task: sửa việc giữ liên kết event; đổi sang lead thì chỉ còn lead; ô chọn liên kết có nhóm Sự kiện', () => {
  const { run, getEl } = loadIndex();
  run("editTask('tev1')");
  assert.ok(getEl('editBox').innerHTML.includes('<option value="event:ev1" selected>'), 'mở sửa phải chọn sẵn sự kiện hiện tại');
  assert.ok(getEl('editBox').innerHTML.includes('Sự kiện'), 'ô chọn liên kết phải có nhóm Sự kiện');
  fillTaskForm(getEl, 'lead:l1');
  run("saveTask('tev1')");
  const t = run("S.tasks.find(t=>t.id==='tev1')");
  assert.equal(t.lead, 'l1'); assert.ok(!('event' in t), 'đổi liên kết phải gỡ khoá event cũ');
  assert.deepEqual(LINK_KEYS.filter(k => k in t), ['lead']);
});

test('adapter: task.event round-trip qua tasks.legacy_extra (không cột mới); task.deal vẫn qua deal_id', () => {
  const s = { members: [], companies: [], games: [], deals: [{ id: 'd1', line: 'publishing', title: 'D', leads: [] }], leads: [], tasks: [
    { id: 't1', title: 'Việc sự kiện', assignee: 'zac', event: 'ev1', done: false },
    { id: 't2', title: 'Việc deal', assignee: 'zac', deal: 'd1', done: false },
  ], activities: [], events: [{ id: 'ev1', name: 'Expo', date: '2026-10-20', location: '', companies: [], leads: [], deals: [] }], verticals: [] };
  const rows = adapter.crmStateToRows(s);
  const byId = id => rows.tasks.find(r => r.id === id);
  assert.equal(byId('t1').legacy_extra.event, 'ev1', 'event của task phải đi qua legacy_extra');
  assert.equal(byId('t1').deal_id, null);
  assert.equal(byId('t2').deal_id, 'd1');
  const back = adapter.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.tasks.find(t => t.id === 't1').event, 'ev1', 'đọc lại phải khôi phục t.event');
});

/* ---------- Hoạt động gắn trực tiếp sự kiện ---------- */
test('activity: drawer sự kiện có khối hoạt động TRỰC TIẾP riêng + khối qua liên kết riêng; nút + Thêm note kèm hint link', () => {
  const { run, getEl } = loadIndex();
  run("openEvent('ev1')");
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('Hoạt động trực tiếp của sự kiện này (1)'), 'thiếu khối hoạt động trực tiếp với số đếm');
  assert.ok(html.includes('Gặp trực tiếp tại sự kiện'), 'thiếu hoạt động gắn trực tiếp');
  assert.ok(html.includes('Hoạt động qua liên kết (1)') && html.includes('Hoạt động qua deal liên kết'), 'khối qua liên kết phải tách riêng, không trộn với trực tiếp');
  assert.ok(html.includes('Thêm note'), 'thiếu nút + Thêm note');
  assert.ok(html.includes('Cách lấy link'), 'form thêm hoạt động phải có hint Cách lấy link như các drawer khác');
  assert.ok(html.includes('event:ev1'), 'form phải có đích gắn trực tiếp vào sự kiện (event:ev1)');
});

test('activity: sự kiện CHƯA có deal vẫn thêm được hoạt động trực tiếp (hidden event:<id>)', () => {
  const { run, getEl } = loadIndex();
  run("openEvent('evSolo')");
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('type="hidden" id="na_event_deal" value="event:evSolo"'), '0 deal -> hidden mang đích trực tiếp event:evSolo');
  fillEventAct(getEl, { deal: 'event:evSolo' }); /* harness: giá trị của hidden na_event_deal trong HTML thật là event:evSolo — harness không parse HTML nên set tay như activity-add-blocks */
  run("addActivityScoped('event')");
  const na = run("S.activities.find(a=>a.text==='Hoạt động mới của sự kiện')");
  assert.ok(na && na.event === 'evSolo', 'hoạt động mới phải mang đúng khoá event');
  assert.deepEqual(OWNER_KEYS.filter(k => k in na), ['event'], 'hoạt động mới chỉ có đúng 1 khoá chủ');
  assert.ok(getEl('drawer').innerHTML.includes('Hoạt động mới của sự kiện'), 'thêm xong phải hiện lại trong drawer sự kiện');
});

test('activity: sự kiện CÓ deal — mặc định theo deal như cũ; chọn đích trực tiếp thì gắn vào sự kiện', () => {
  {
    const { run, getEl } = loadIndex();
    run("openEvent('ev1')");
    fillEventAct(getEl, { deal: 'd1', text: 'Hoạt động mặc định theo deal' });
    run("addActivityScoped('event')");
    const na = run("S.activities.find(a=>a.text==='Hoạt động mặc định theo deal')");
    assert.ok(na && na.deal === 'd1' && !('event' in na), 'không chọn đích trực tiếp -> theo deal như Việc 7');
  }
  {
    const { run, getEl } = loadIndex();
    run("openEvent('ev1')");
    fillEventAct(getEl, { deal: 'd1', target: 'event:ev1', text: 'Hoạt động chọn trực tiếp sự kiện' });
    run("addActivityScoped('event')");
    const na = run("S.activities.find(a=>a.text==='Hoạt động chọn trực tiếp sự kiện')");
    assert.ok(na && na.event === 'ev1' && !('deal' in na), 'chọn đích trực tiếp -> gắn vào sự kiện, không qua deal');
  }
});

test('activity: sửa hoạt động đổi chủ deal -> event luôn đúng 1 chủ; nhãn chủ hiện ở hàng tổng hợp + Dashboard', () => {
  const { run, getEl } = loadIndex();
  run("editActivity('ad1')");
  const form = getEl('editBox').innerHTML;
  assert.ok(form.includes('value="event:ev1"') && form.includes('Sự kiện: Expo Một'), 'form sửa phải có tuỳ chọn chủ Sự kiện');
  getEl('ea_deal').value = 'event:ev1';
  getEl('ea_type').value = 'Email';
  getEl('ea_who').value = 'linh';
  getEl('ea_when').value = '';
  getEl('ea_text').value = 'Hoạt động qua deal liên kết';
  getEl('ea_url').value = '';
  run("saveActivity('ad1')");
  const a = run("S.activities.find(x=>x.id==='ad1')");
  assert.equal(a.event, 'ev1'); assert.ok(!('deal' in a));
  assert.deepEqual(OWNER_KEYS.filter(k => k in a), ['event']);
  const row = run("activityRowHTML(S.activities.find(x=>x.id==='ad1'), {showDeal:true})");
  assert.ok(row.includes('Sự kiện:') && row.includes("openEvent('ev1')"), 'hàng tổng hợp phải hiện nhãn chủ Sự kiện bấm mở được');
  run("curView='dash'; curLine='all'; query=''; render();");
  assert.ok(getEl('view').innerHTML.includes('Sự kiện: Expo Một'), 'Dashboard Hoạt động gần nhất phải nhận diện chủ Sự kiện');
});

test('activity: createActivity validate — chủ event mồ côi / 0 chủ bị chặn; createActivityFor(event) chạy', () => {
  const { run } = loadIndex();
  assert.equal(run("createActivity('event:evKhongCo', {text:'x', who:'zac'})"), null, 'chủ sự kiện không tồn tại phải bị chặn');
  assert.equal(run("createActivity('', {text:'x', who:'zac'})"), null, '0 chủ phải bị chặn');
  const a = run("createActivityFor('event','ev1', {text:'Qua createActivityFor', who:'zac'})");
  assert.ok(a && a.event === 'ev1');
  assert.equal(run("activityOwnerLabel(activityOwnerOf(S.activities.find(x=>x.id==='" + a.id + "')))"), 'Expo Một');
});

test('activity: xoá hoạt động trực tiếp ngay trong drawer sự kiện -> mất khỏi drawer, drawer vẫn ở sự kiện', () => {
  const { run, getEl } = loadIndex();
  run("openEvent('ev1')");
  run("deleteActivity('aev1')");
  assert.ok(!run("S.activities.some(a=>a.id==='aev1')"));
  const html = getEl('drawer').innerHTML;
  assert.ok(html.includes('Expo Một') && !html.includes('Gặp trực tiếp tại sự kiện'), 'drawer sự kiện phải dựng lại không còn hoạt động đã xoá');
});

/* ---------- Xoá sự kiện ---------- */
test('xoá sự kiện: việc còn nguyên nhưng mất liên kết; hoạt động trực tiếp bị xoá theo; hoạt động qua deal giữ nguyên', () => {
  const { run } = loadIndex();
  run("deleteEvent('ev1')");
  assert.ok(!run("S.events.some(e=>e.id==='ev1')"), 'sự kiện phải mất');
  const t = run("S.tasks.find(t=>t.id==='tev1')");
  assert.ok(t, 'việc gắn sự kiện phải CÒN sau khi xoá sự kiện');
  assert.ok(!('event' in t), 'liên kết event của việc phải được gỡ');
  assert.ok(!run("S.activities.some(a=>a.id==='aev1')"), 'hoạt động trực tiếp phải bị xoá theo sự kiện (CASCADE)');
  assert.ok(run("S.activities.some(a=>a.id==='ad1' && a.deal==='d1')"), 'hoạt động qua deal liên kết phải giữ nguyên');
  assert.ok(run("S.deals.some(d=>d.id==='d1') && S.leads.some(l=>l.id==='l1') && S.companies.some(c=>c.id==='c1')"), 'entity liên kết giữ nguyên như tiền lệ');
});

/* ---------- Adapter hoạt động event ---------- */
test('adapter: activity gắn event ra row event_id (3 cột chủ còn lại null) + round-trip; chặn 0 chủ / 2 chủ / event mồ côi', () => {
  const base = { members: [], companies: [], games: [{ id: 'g1', title: 'G', own: 'partner' }], deals: [{ id: 'd1', line: 'publishing', title: 'D', leads: [] }], leads: [{ id: 'l1', name: 'L', company: '', line: 'publishing' }], tasks: [], events: [{ id: 'ev1', name: 'Expo', date: '2026-10-20', location: '', companies: [], leads: [], deals: [] }] };
  const s = Object.assign({}, base, { activities: [
    { id: 'aEv', event: 'ev1', type: 'Note', who: 'zac', when: '2026-11-05', text: 'Trực tiếp sự kiện', url: '' },
    { id: 'aDeal', deal: 'd1', type: 'Note', who: 'zac', when: '2026-11-05', text: 'Qua deal', url: '' },
    { id: 'aNone', type: 'Note', who: 'zac', when: '2026-11-05', text: 'Không chủ', url: '' },
    { id: 'aTwo', event: 'ev1', deal: 'd1', type: 'Note', who: 'zac', when: '2026-11-05', text: 'Hai chủ', url: '' },
    { id: 'aOrphan', event: 'evX', type: 'Note', who: 'zac', when: '2026-11-05', text: 'Event mồ côi', url: '' },
  ] });
  const rows = adapter.crmStateToRows(s);
  assert.deepEqual(rows.activities.map(r => r.id).sort(), ['aDeal', 'aEv'], 'chỉ activity đúng-1-chủ-tồn-tại thành row');
  const rEv = rows.activities.find(r => r.id === 'aEv');
  assert.equal(rEv.event_id, 'ev1');
  assert.equal(rEv.deal_id, null); assert.equal(rEv.lead_id, null); assert.equal(rEv.game_id, null);
  const back = adapter.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  const bEv = back.activities.find(a => a.id === 'aEv');
  assert.equal(bEv.event, 'ev1'); assert.deepEqual(OWNER_KEYS.filter(k => k in bEv), ['event']);
});

/* ---------- SQL migration ---------- */
test('SQL: activity-event.sql thêm event_id FK cascade + CHECK đúng-1-trong-4 + index; KHÔNG đổi policy nào', () => {
  const sql = read('supabase/activity-event.sql');
  assert.ok(/add column if not exists event_id text references public\.events \(id\) on delete cascade/.test(sql), 'thiếu cột event_id FK cascade -> events');
  assert.ok(/activities_exactly_one_owner/.test(sql) && /event_id is not null/.test(sql), 'CHECK phải nới gồm event_id');
  assert.ok(/create index if not exists activities_event_id_idx on public\.activities \(event_id\)/.test(sql), 'thiếu index event_id');
  assert.ok(!/create policy|drop policy|alter policy/.test(sql), 'migration KHÔNG được đụng policy (MKT giữ nguyên bị chặn)');
  assert.ok(!/mkt/i.test(sql.replace(/MKT/g, '')), 'không mở quyền cho vai nào khác');
});

/* ---------- Tĩnh: deep-link + MKT ---------- */
test('tĩnh: deep-link ?open=event mở drawer sự kiện; MKT không có bề mặt việc/hoạt động sự kiện', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('__open === "event") openEvent(__oid)'), 'thiếu nhánh deep-link ?open=event');
  for (const f of ['mkt.html', 'publishing.js', 'publishing.html']) {
    const src = read(f);
    assert.ok(!src.includes('relatedTasksHTML') && !src.includes('activityAddBlockHTML'), f + ' không được render việc/hoạt động cho MKT');
  }
});

/* ---------- Mock sync: FK thật + CHECK đúng-1-trong-4 (mẫu activity-lead-game LG-FK) ---------- */
const FKX = [
  ["games", "companies", "games_company_id_fkey"],
  ["leads", "companies", "leads_company_id_fkey"],
  ["deals", "companies", "deals_company_id_fkey"], ["deals", "games", "deals_game_id_fkey"],
  ["deal_leads", "deals", "deal_leads_deal_id_fkey"], ["deal_leads", "leads", "deal_leads_lead_id_fkey"],
  ["deal_terms", "deals", "deal_terms_deal_id_fkey"], ["deal_contracts", "deals", "deal_contracts_deal_id_fkey"],
  ["activities", "deals", "activities_deal_id_fkey"], ["activities", "leads", "activities_lead_id_fkey"], ["activities", "games", "activities_game_id_fkey"], ["activities", "events", "activities_event_id_fkey"],
  ["event_links", "events", "event_links_event_id_fkey"],
  ["publishing_requests", "games", "publishing_requests_game_id_fkey"], ["publishing_requests", "companies", "publishing_requests_company_id_fkey"],
  ["publishing_revisions", "publishing_requests", "publishing_revisions_request_id_fkey"],
  ["market_observation_audit", "market_observations", "market_observation_audit_observation_id_fkey"],
];
const COLX = { games: "company_id", leads: "company_id", deals: "company_id", deal_leads: "deal_id", deal_terms: "deal_id", deal_contracts: "deal_id", activities: "deal_id", event_links: "event_id", publishing_requests: "game_id", publishing_revisions: "request_id", publishing_revision_private: "request_id", publishing_request_intake_private: "request_id", market_observation_audit: "observation_id" };
const PARENT_COL = { deals_game_id_fkey: "game_id", deal_leads_lead_id_fkey: "lead_id", activities_lead_id_fkey: "lead_id", activities_game_id_fkey: "game_id", activities_event_id_fkey: "event_id", publishing_requests_company_id_fkey: "company_id" };
const PKX = { members: ["id"], companies: ["id"], company_partner_eval_archive: ["company_id"], games: ["id"], leads: ["id"], deals: ["id"], deal_terms: ["deal_id"], deal_contracts: ["deal_id"], deal_leads: ["deal_id", "lead_id"], tasks: ["id"], activities: ["id"], events: ["id"], event_links: ["event_id", "entity_type", "entity_id"], publishing_requests: ["id"], publishing_revisions: ["request_id", "revision_no"], publishing_revision_private: ["request_id", "revision_no"], publishing_request_intake_private: ["request_id"], market_observations: ["id"], market_observation_audit: ["observation_id", "seq"] };
const HAS_UPDATED_AT_X = new Set(["members", "companies", "games", "leads", "deals", "deal_terms", "deal_contracts", "tasks", "activities", "events", "publishing_requests", "publishing_request_intake_private", "publishing_revision_private", "market_observations"]);
const PARENT_TABLE_BY_KEY = {};
FKX.forEach(([t, p, fk]) => { if (fk) PARENT_TABLE_BY_KEY[fk] = p; });
function makeFkClient(seed) {
  const db = JSON.parse(JSON.stringify(seed));
  const attempts = [];
  function checkRow(t, row) {
    if (t === "activities") {
      const n = [row.deal_id, row.lead_id, row.game_id, row.event_id].filter(x => x !== null && x !== undefined).length;
      if (n !== 1) return { code: "23514", message: 'new row for relation "activities" violates check constraint "activities_exactly_one_owner"' };
    }
    for (const [ct, , fk] of FKX.filter(x => x[0] === t && x[2])) {
      const col = PARENT_COL[fk] || COLX[ct];
      const val = row[col];
      if (val === null || val === undefined || val === "") continue;
      const parent = PARENT_TABLE_BY_KEY[fk];
      if (!((db[parent] || []).some(r => String(r.id) === String(val)))) return { code: "23503", message: `insert or update on table "${ct}" violates foreign key constraint "${fk}"` };
    }
    return null;
  }
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === "select") { let out = rows.slice(); if (b.inFilter) out = out.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))); return { data: out.map(r => ({ ...r })), error: null }; }
    if (b.op === "upsert" || b.op === "insert") {
      for (const row of b.rows) { const err = checkRow(t, row); if (err) { attempts.push({ op: b.op, table: t, fkError: err.message }); return { data: null, error: err }; } }
      const saved = [];
      for (const row of b.rows) {
        const rec = { ...row };
        if (t === "publishing_requests") rec.entity_id = rec.game_id || rec.company_id;
        if (HAS_UPDATED_AT_X.has(t)) rec.updated_at = rec.updated_at || new Date().toISOString();
        const pk = PKX[t];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (b.op === "insert" && idx >= 0) return { data: null, error: { message: "duplicate key" } };
        if (idx >= 0) { if (!(b.opts && b.opts.ignoreDuplicates)) rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      attempts.push({ op: b.op, table: t, rows: b.rows.map(r => r.id || r.deal_id || r.event_id || r.request_id) });
      return { data: saved, error: null };
    }
    if (b.op === "delete") { db[t] = rows.filter(r => !(b.inFilter && b.inFilter.values.map(String).includes(String(r[b.inFilter.col])))); return { data: null, error: null }; }
    if (b.op === "update") { rows.forEach(r => { if (String(r[b.eqFilter.col]) === String(b.eqFilter.val)) Object.assign(r, b.patch); }); return { data: null, error: null }; }
    return { data: [], error: null };
  }
  function builder(table) {
    const b = { table, op: "select", rows: null, opts: null, inFilter: null, eqFilter: null, patch: null };
    b.select = () => b; b.order = () => b;
    b.upsert = (rows, opts) => { b.op = "upsert"; b.rows = rows; b.opts = opts; return b; };
    b.insert = rows => { b.op = "insert"; b.rows = rows; return b; };
    b.delete = () => { b.op = "delete"; return b; };
    b.update = patch => { b.op = "update"; b.patch = patch; return b; };
    b.in = (col, values) => { b.inFilter = { col, values }; return b; };
    b.eq = (col, val) => { b.eqFilter = { col, val }; return b; };
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _db: db, _attempts: attempts };
}
function makeLS2() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m }; }
function makeEl2() { return { style: {}, textContent: "", innerHTML: "", setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }
async function setupFk() {
  const seedState = {
    members: [{ id: "zac", name: "Zac", role: "Admin", active: true }],
    companies: [{ id: "c1", name: "Studio Alpha", type: "Game studio", roles: { publishing: "Game studio" }, contact: "", phone: "", last: "" }],
    games: [], leads: [], deals: [], tasks: [], activities: [], events: [],
  };
  const tables = {};
  for (const [k, v] of Object.entries(adapter.crmStateToRows(seedState))) tables[k] = v;
  tables.publishing_requests = []; tables.publishing_revisions = []; tables.publishing_revision_private = []; tables.publishing_request_intake_private = []; tables.company_partner_eval_archive = []; tables.market_observations = []; tables.market_observation_audit = [];
  const client = makeFkClient(tables);
  const localStorage = makeLS2();
  const sandbox = { console, setTimeout, clearTimeout, structuredClone, localStorage,
    document: { getElementById: () => null, createElement: () => makeEl2(), body: { appendChild() {} } } };
  sandbox.window = sandbox; sandbox.window.SavaAdapter = adapter;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read("supabase-data.js"), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, "bd"); D.installHook();
  await D.loadAll();
  D.setEnabled(true);
  const getState = () => JSON.parse(localStorage.getItem("sava_crm_shared_v1"));
  const putState = s => localStorage.setItem("sava_crm_shared_v1", JSON.stringify(s));
  const drain = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 900)); };
  return { client, localStorage, D, getState, putState, drain };
}

test("EV-FK-1: sự kiện MỚI + activity gắn trực tiếp sinh CÙNG một lần lưu -> cha (events) trước con (activities), 0 lỗi FK/CHECK", async () => {
  const { client, getState, putState, drain } = await setupFk();
  const s = getState();
  s.events.push({ id: "evNew", name: "Sự kiện Mới", date: "2026-11-05", location: "", companies: [], leads: [], deals: [] });
  s.activities.push({ id: "aEvNew", event: "evNew", type: "Note", who: "zac", when: "2026-11-05", text: "Gắn sự kiện mới", url: "" });
  putState(s);
  await drain();
  const fkErrs = client._attempts.filter(a => a.fkError);
  assert.equal(fkErrs.length, 0, "không attempt nào lỗi FK/CHECK: " + JSON.stringify(fkErrs));
  const row = (client._db.activities || []).find(r => r.id === "aEvNew");
  assert.ok(row && row.event_id === "evNew" && row.deal_id === null && row.lead_id === null && row.game_id === null, "row activity-event đúng trên DB");
  const idx = (tbl, id) => client._attempts.findIndex(a => a.table === tbl && (a.rows || []).includes(id));
  assert.ok(idx("events", "evNew") >= 0 && idx("events", "evNew") < idx("activities", "aEvNew"), "event cha upsert TRƯỚC activity con");
});

test("EV-FK-2: event cha bị xoá trên server, local thêm activity gắn event đó -> tự upsert lại cha trước con (ensureParentRows cho event_id)", async () => {
  const { client, getState, putState, drain } = await setupFk();
  const s0 = getState();
  s0.events.push({ id: "evP", name: "Sự kiện Cha", date: "2026-11-05", location: "", companies: [], leads: [], deals: [] });
  putState(s0);
  await drain();
  assert.ok((client._db.events || []).some(r => r.id === "evP"), "event đã lên server ở lần lưu đầu");
  client._db.events = client._db.events.filter(r => r.id !== "evP");
  client._attempts.length = 0;
  const s = getState();
  s.activities.push({ id: "aEvP", event: "evP", type: "Note", who: "zac", when: "2026-11-05", text: "Hoạt động sau khi cha bị xoá server", url: "" });
  putState(s);
  await drain();
  const fkErrs = client._attempts.filter(a => a.fkError);
  assert.equal(fkErrs.length, 0, "0 lỗi FK nhờ ensure-parent: " + JSON.stringify(fkErrs));
  assert.ok((client._db.events || []).some(r => r.id === "evP"), "event cha được upsert lại");
  assert.ok((client._db.activities || []).some(r => r.id === "aEvP" && r.event_id === "evP"), "activity con lên DB sau cha");
});
