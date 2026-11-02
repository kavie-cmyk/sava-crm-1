/* Module SỰ KIỆN — tầng dữ liệu (chưa có UI):
   - shared.js: emptyState có `events: []` (sau activities, trước
     verticals), CRM_ENTITY_TYPES có cặp ["events","event"], FIELD_LABELS
     event + TYPE_BADGE_META event; migrateState chuẩn hoá S.events cho
     cache cũ (thiếu -> [], phần tử không phải object bị loại, 3 mảng
     liên kết luôn là mảng).
   - supabase-adapter.js: event <-> rows của events + event_links.
     name/date (cặp event_date + date_raw)/location đi cột; attendees,
     note và createdAt/updatedAt/updatedBy đi qua legacy_extra (EVENT_KNOWN
     cố ý không chứa chúng); 3 mảng companies/leads/deals KHÔNG vào
     legacy_extra mà vật hoá thành dòng event_links (entity_type tương
     ứng company/lead/deal) và gom lại đúng 3 mảng khi đọc.
   - supabase/events-module.sql (tĩnh): 2 bảng + trigger + index, RLS
     admin+bd cho cả hai, grant tường minh, CHECK audit_log thêm 'event'.
   - supabase-data.js (tĩnh): loadAll fetch events + event_links qua
     qSafe và truyền vào crmRowsToState; syncCrm có ['events','id'] trong
     order + 'events' trong CONFLICT_TABLES + khối xử lý event_links
     theo mẫu deal_leads (group theo event, so deep, chỉ event còn sống).
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- shared.js qua vm ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout, structuredClone });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('shared: emptyState có events đúng vị trí; CRM_ENTITY_TYPES/FIELD_LABELS/TYPE_BADGE_META có event', () => {
  const ctx = loadShared();
  assert.deepEqual(Object.keys(ctx.emptyState()),
    ['members', 'companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'events', 'verticals']);
  assert.deepEqual([...ctx.emptyState().events], []);
  const pairs = ctx.window.SavaSys.CRM_ENTITY_TYPES.map(p => [...p]);
  assert.ok(pairs.some(p => p[0] === 'events' && p[1] === 'event'), 'CRM_ENTITY_TYPES thiếu cặp ["events","event"]: ' + JSON.stringify(pairs));
  const labels = ctx.window.SavaSys.FIELD_LABELS.event;
  assert.deepEqual({ ...labels }, {
    name: 'Tên sự kiện', date: 'Ngày diễn ra', location: 'Địa điểm', attendees: 'Người tham dự',
    note: 'Ghi chú', companies: 'Công ty từ sự kiện', leads: 'Lead từ sự kiện', deals: 'Deal từ sự kiện',
  });
  const badge = ctx.window.TYPE_BADGE_META.event;
  assert.deepEqual({ ...badge }, { icon: '🎪', noun: 'Sự kiện', color: '#db2777' });
  assert.ok(ctx.typeBadgeHTML('event').includes('🎪 Sự kiện'));
});

test('shared: migrateState bổ sung events cho cache cũ + lọc phần tử hỏng + chuẩn hoá 3 mảng liên kết', () => {
  const ctx = loadShared();
  const s = ctx.migrateState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] });
  assert.deepEqual([...s.events], [], 'cache cũ thiếu events -> migrateState phải bổ sung []');
  const s2 = ctx.migrateState({
    members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [],
    events: [null, 'rác', { id: 'ev1', name: 'X', companies: 'không-phải-mảng', leads: [7], deals: [] }],
  });
  assert.equal(s2.events.length, 1, 'phần tử events không phải object phải bị loại như mọi entity khác');
  assert.deepEqual([...s2.events[0].companies], [], 'companies không phải mảng -> []');
  assert.deepEqual([...s2.events[0].leads], ['7'], 'id số trong mảng liên kết -> ép chuỗi');
  assert.deepEqual([...s2.events[0].attendees], [], 'attendees thiếu -> []');
});

/* ---------- adapter: round-trip ---------- */
const NOW = '2026-11-02T03:00:00.000Z', NOW2 = '2026-11-02T04:00:00.000Z';
const eventFixture = {
  id: 'ev1', name: 'Hội chợ Game 2026', date: '2026-11-15', location: 'SECC, TP.HCM',
  note: 'Mang booth + standee', attendees: ['zac', 'hoang'],
  companies: ['c1', 'c2'], leads: ['l1'], deals: ['d1', 'd2'],
  createdAt: NOW, updatedAt: NOW2, updatedBy: 'zac',
};
function stateWith(events) {
  return { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events, verticals: [] };
}

test('adapter: event -> rows — cột date cặp raw/ISO, attendees/note/sys qua legacy_extra, links vật hoá', () => {
  const rows = A.crmStateToRows(stateWith([eventFixture, { id: 'ev2', name: 'Gặp gỡ đối tác', date: 'Tuần sau', location: '', companies: ['c1'], leads: [], deals: [] }]));
  assert.equal(rows.events.length, 2);
  const r = rows.events[0];
  assert.equal(r.name, 'Hội chợ Game 2026');
  assert.equal(r.event_date, '2026-11-15');
  assert.equal(r.date_raw, '2026-11-15');
  assert.equal(r.location, 'SECC, TP.HCM');
  assert.deepEqual(r.legacy_extra, {
    note: 'Mang booth + standee', attendees: ['zac', 'hoang'],
    createdAt: NOW, updatedAt: NOW2, updatedBy: 'zac',
  }, 'legacy_extra chỉ chứa attendees/note/3 trường hệ thống (+ khoá lạ nếu có)');
  for (const k of ['companies', 'leads', 'deals']) {
    assert.equal(k in r.legacy_extra, false, 'legacy_extra của events không được rò mảng liên kết: ' + k);
    assert.equal(k in r, false, 'row events không có cột mảng liên kết: ' + k);
  }
  assert.equal(rows.events[1].event_date, null, 'date chữ tự do -> event_date NULL');
  assert.equal(rows.events[1].date_raw, 'Tuần sau', 'date chữ tự do -> date_raw giữ nguyên văn');
  assert.deepEqual(rows.event_links, [
    { event_id: 'ev1', entity_type: 'company', entity_id: 'c1' },
    { event_id: 'ev1', entity_type: 'company', entity_id: 'c2' },
    { event_id: 'ev1', entity_type: 'lead', entity_id: 'l1' },
    { event_id: 'ev1', entity_type: 'deal', entity_id: 'd1' },
    { event_id: 'ev1', entity_type: 'deal', entity_id: 'd2' },
    { event_id: 'ev2', entity_type: 'company', entity_id: 'c1' },
  ]);
});

test('adapter: round-trip state -> rows -> state giữ nguyên event (kể cả date chữ tự do + event không links)', () => {
  const src = stateWith([eventFixture,
    { id: 'ev2', name: 'Gặp gỡ đối tác', date: 'Tuần sau', location: '', companies: [], leads: [], deals: [] },
    { id: 'ev3', name: 'Sự kiện trần', date: '', location: '' }]);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(A.crmStateToRows(src))));
  assert.deepEqual(Object.keys(back),
    ['members', 'companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'events', 'verticals'],
    'state đọc lại phải khớp đúng hình dạng emptyState (events sau activities, trước verticals)');
  const ev = back.events[0];
  assert.equal(ev.name, eventFixture.name);
  assert.equal(ev.date, '2026-11-15');
  assert.equal(ev.location, 'SECC, TP.HCM');
  assert.deepEqual(ev.attendees, ['zac', 'hoang']);
  assert.equal(ev.note, 'Mang booth + standee');
  assert.equal(ev.createdAt, NOW); assert.equal(ev.updatedAt, NOW2); assert.equal(ev.updatedBy, 'zac');
  assert.deepEqual(ev.companies, ['c1', 'c2']);
  assert.deepEqual(ev.leads, ['l1']);
  assert.deepEqual(ev.deals, ['d1', 'd2']);
  assert.equal(back.events[1].date, 'Tuần sau', 'date_raw phải thắng khi đọc lại (pairBack)');
  assert.deepEqual(back.events[1].companies, []);
  assert.deepEqual(back.events[2].companies, [], 'event không có links -> 3 mảng rỗng, không undefined');
  assert.deepEqual(back.events[2].leads, []);
  assert.deepEqual(back.events[2].deals, []);
  assert.equal(back.events[2].date, '');
});

test('adapter: rows thiếu events/event_links (DB chưa chạy SQL) -> state vẫn hợp lệ với events []', () => {
  const back = A.crmRowsToState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] });
  assert.deepEqual(back.events, []);
  const rows = A.crmStateToRows({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] });
  assert.deepEqual(rows.events, []);
  assert.deepEqual(rows.event_links, []);
});

/* ---------- SQL tĩnh ---------- */
test('SQL: events-module.sql có đúng 2 bảng + cột + trigger + index theo hợp đồng', () => {
  const sql = read('supabase/events-module.sql');
  assert.ok(/create table if not exists public\.events \(/.test(sql), 'thiếu create table events (if not exists)');
  assert.ok(/create table if not exists public\.event_links \(/.test(sql), 'thiếu create table event_links (if not exists)');
  for (const col of ['id           text primary key', 'name         text not null', 'event_date   date',
    "date_raw     text not null default ''", "location     text not null default ''",
    'legacy_extra jsonb not null default \'{}\'::jsonb']) {
    assert.ok(sql.includes(col), 'bảng events thiếu cột theo hợp đồng: ' + col.trim());
  }
  assert.ok(sql.includes('event_id    text not null references public.events (id) on delete cascade'),
    'event_links.event_id phải FK cascade về events');
  assert.ok(sql.includes("check (entity_type in ('company', 'lead', 'deal'))"), 'event_links thiếu CHECK entity_type');
  assert.ok(sql.includes('primary key (event_id, entity_type, entity_id)'), 'event_links thiếu PK hợp thành');
  assert.ok(!/entity_id\s+text not null references/.test(sql), 'entity_id KHÔNG được đặt FK (app tự dọn liên kết)');
  assert.ok(/on public\.event_links \(entity_type, entity_id\)/.test(sql), 'thiếu index (entity_type, entity_id)');
  assert.ok(/on public\.event_links \(event_id\)/.test(sql), 'thiếu index (event_id)');
  assert.ok(/drop trigger if exists events_set_updated_at on public\.events/.test(sql), 'trigger phải drop-if-exists');
  assert.ok(/create trigger events_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\)/.test(sql),
    'trigger events_set_updated_at phải dùng lại public.set_updated_at()');
});

test('SQL: RLS admin+bd cho cả hai bảng (mẫu deal_leads_all_bd), grant tường minh, không policy cho mkt/anon', () => {
  const sql = read('supabase/events-module.sql');
  assert.ok(sql.includes('alter table public.events      enable row level security;'), 'events chưa bật RLS');
  assert.ok(sql.includes('alter table public.event_links enable row level security;'), 'event_links chưa bật RLS');
  for (const [policy, table] of [['events_all_bd', 'public.events'], ['event_links_all_bd', 'public.event_links']]) {
    assert.ok(new RegExp('drop policy if exists ' + policy + ' on ' + table.replace('.', '\\.')).test(sql),
      policy + ' phải drop-if-exists trước khi tạo');
    const seg = sql.slice(sql.indexOf('create policy ' + policy));
    const body = seg.slice(0, seg.indexOf(';'));
    assert.ok(body.includes('for all to authenticated'), policy + ' phải for all to authenticated');
    assert.ok(body.includes("using (public.has_crm_role(array['admin', 'bd']))"), policy + ' thiếu using has_crm_role(admin,bd)');
    assert.ok(body.includes("with check (public.has_crm_role(array['admin', 'bd']))"), policy + ' thiếu with check has_crm_role(admin,bd)');
    assert.ok(!body.includes("'mkt'"), policy + ' không được cấp cho mkt');
  }
  assert.ok(sql.includes('grant select, insert, update, delete on public.events, public.event_links to authenticated;'),
    'thiếu grant tường minh cho 2 bảng mới');
});

test('SQL: mở rộng CHECK audit_log thêm event, giữ nguyên tập cũ + có truy vấn kiểm chứng cuối file', () => {
  const sql = read('supabase/events-module.sql');
  assert.ok(/alter table public\.audit_log\s+drop constraint if exists audit_log_entity_type_known_check/.test(sql),
    'CHECK audit phải drop-if-exists trước khi add lại');
  assert.ok(sql.includes("check (entity_type in ('deal', 'company', 'lead', 'game', 'task', 'member', 'activity', 'request', 'event'))"),
    'CHECK audit_log phải là tập cũ + event, đúng thứ tự/ký tự hợp đồng');
  assert.ok(sql.includes('pg_policies'), 'thiếu truy vấn kiểm chứng policy ở cuối file');
  assert.ok(sql.includes('audit_log_entity_type_known_check'), 'thiếu kiểm chứng constraint (ít nhất ở phần audit)');
  assert.ok(sql.includes('pg_get_constraintdef'), 'thiếu truy vấn kiểm chứng định nghĩa constraint ở cuối file');
});

/* ---------- supabase-data.js tĩnh ---------- */
test('data tĩnh: loadAll fetch events + event_links qua qSafe và truyền vào crmRowsToState', () => {
  const src = read('supabase-data.js');
  assert.ok(src.includes("qSafe('events', byCreated)"), 'loadAll phải fetch events qua qSafe (RLS phía MKT bị nuốt êm như tasks)');
  assert.ok(src.includes("qSafe('event_links')"), 'loadAll phải fetch event_links qua qSafe');
  assert.ok(src.includes('events, event_links: eventLinks'), 'loadAll phải truyền events + event_links vào crmRowsToState');
  assert.ok(src.includes("['events', events]"), 'loadAll phải noteUpdated cho events (phục vụ phát hiện xung đột)');
});

test('data tĩnh: syncCrm wiring events (order + CONFLICT_TABLES) + event_links theo mẫu deal_leads', () => {
  const src = read('supabase-data.js');
  assert.ok(src.includes("['events', 'id']"), "order của syncCrm thiếu ['events','id']");
  const conflictSeg = src.slice(src.indexOf('const CONFLICT_TABLES'), src.indexOf(';', src.indexOf('const CONFLICT_TABLES')));
  assert.ok(conflictSeg.includes("'events'"), "CONFLICT_TABLES thiếu 'events'");
  assert.ok(src.includes('groupEventLinks'), 'thiếu group theo event cho event_links');
  assert.ok(src.includes('linkChangedEvents'), 'thiếu tập event đổi links (so deep như deal_leads)');
  const seg = src.slice(src.indexOf('if (linkChangedEvents.size)'));
  const body = seg.slice(0, seg.indexOf('return conflicts;'));
  assert.ok(body.includes("ctx.client.from('event_links').delete().in('event_id', targets)"),
    'event đổi links -> phải xoá links cũ của event đó theo event_id');
  assert.ok(body.includes("insertRows('event_links', ins)"), 'phải nạp lại links mới bằng insertRows');
  assert.ok(body.includes('aliveEvents'), 'chỉ xử lý links cho event còn sống (event đã xoá -> cascade DB tự dọn)');
  assert.ok(src.indexOf("insertRows('event_links', ins)") > src.indexOf('for (const [table] of order) {'),
    'nạp event_links phải chạy SAU vòng upsert cha (events) để không vi phạm FK với event mới');
});
