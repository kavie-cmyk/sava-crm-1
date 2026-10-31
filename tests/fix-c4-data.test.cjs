/* FIX-4 (cụm C4) — tầng dữ liệu + adapter + Edge Function:
   - C8 supabase-data.js flushAudit: chưa enabled thì GIỮ hàng đợi (không
     xoá trắng), insert lỗi thì giữ lại để thử sau, trần 500 bỏ cũ nhất,
     lỗi audit không bao giờ ném ra đường lưu chính.
   - C10 supabase-adapter.js task.dueDate: chữ tự do đi qua
     legacy_extra.dueDate_raw và round-trip nguyên vẹn; ISO đi cột
     due_date như cũ; rỗng -> rỗng.
   - C9 invite-member delete_member: function TỰ kiểm tra tham chiếu
     phía server (deals.owner_id / tasks.assignee_id / activities.actor_id
     / publishing_requests.requested_by+assignee_id /
     publishing_revisions.reviewer_id) -> còn tham chiếu thì 409 + counts,
     KHÔNG xoá gì; hết tham chiếu thì giữ luồng xoá cũ.
   Harness theo đúng mẫu các test đợt trước (vm + mock client cho
   supabase-data; strip-types + mock supabase-js cho Edge Function).
   Không mạng thật, không đụng project Supabase thật. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NOW = '2026-10-31T10:00:00.000Z';
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ==================================================================
   C10 — adapter task.dueDate raw/date
   ================================================================== */
const A = require('../supabase-adapter.js');
function taskRoundTrip(dueDate) {
  const s = { members: [], companies: [], games: [], deals: [], leads: [], activities: [], verticals: [],
    tasks: [{ id: 't1', title: 'Việc', assignee: 'zac', due: '', dueDate, done: false, overdue: false }] };
  const rows = A.crmStateToRows(s);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  return { row: rows.tasks[0], back: back.tasks[0] };
}

test('C10: dueDate chữ tự do "tuần sau" -> due_date=null + legacy_extra giữ nguyên văn + đọc lại nguyên vẹn', () => {
  const { row, back } = taskRoundTrip('tuần sau');
  assert.equal(row.due_date, null, 'chữ tự do không được ép vào cột date');
  assert.equal(row.legacy_extra.dueDate_raw, 'tuần sau', 'raw phải được giữ nguyên văn qua legacy_extra');
  assert.equal(back.dueDate, 'tuần sau', 'đọc lại phải nguyên vẹn, không thành ""');
  assert.equal('dueDate_raw' in back, false, 'khoá raw là chi tiết adapter, không rò lên state app');
});

test('C10: dueDate ISO -> đường cột như cũ, không lưu raw thừa, đọc lại đúng', () => {
  const { row, back } = taskRoundTrip('2026-11-02');
  assert.equal(row.due_date, '2026-11-02');
  assert.equal(row.legacy_extra.dueDate_raw, undefined, 'ISO thuần không cần raw');
  assert.deepEqual(row.legacy_extra, {});
  assert.equal(back.dueDate, '2026-11-02');
});

test('C10: dueDate rỗng / vắng -> due_date=null, không raw, đọc lại ""', () => {
  const empty = taskRoundTrip('');
  assert.equal(empty.row.due_date, null);
  assert.deepEqual(empty.row.legacy_extra, {});
  assert.equal(empty.back.dueDate, '');
  const s = { members: [], companies: [], games: [], deals: [], leads: [], activities: [], tasks: [{ id: 't9', title: 'X', assignee: '', due: '', done: false, overdue: false }] };
  const back2 = A.crmRowsToState(JSON.parse(JSON.stringify(A.crmStateToRows(s))));
  assert.equal(back2.tasks[0].dueDate, '', 'thiếu dueDate cũng đọc lại ""');
});

test('C10 tĩnh: các field raw/date cũ không đổi hành vi (deal.due vẫn cặp due_date/due_raw)', () => {
  const s = { members: [], companies: [], games: [], leads: [], tasks: [], activities: [],
    deals: [{ id: 'd1', line: 'ai', title: 'D', stage: 'x', owner: '', due: 'tuần sau', idle: 0, custom: {}, leads: [] }] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.deals[0].due_date, null);
  assert.equal(rows.deals[0].due_raw, 'tuần sau');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.deals[0].due, 'tuần sau');
});

/* ==================================================================
   C8 — supabase-data flushAudit giữ hàng đợi
   ================================================================== */
function auditMockClient(state) {
  const calls = [];
  return { calls, from(table) { return {
    insert(rows) { calls.push({ table, rows: JSON.parse(JSON.stringify(rows)) }); return Promise.resolve({ data: null, error: state.fail ? { message: 'relation "public.audit_log" does not exist' } : null }); },
    select() { const chain = { eq() { return chain; }, order() { return chain; }, limit() { return Promise.resolve({ data: [], error: null }); } }; return chain; },
  }; } };
}
function loadDataLayer(client) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const el = () => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout,
    document: { getElementById: () => null, createElement: () => el(), body: el() } });
  ctx.window = ctx;
  vm.runInContext(read('supabase-adapter.js'), ctx, { filename: 'supabase-adapter.js' });
  vm.runInContext(read('supabase-data.js'), ctx, { filename: 'supabase-data.js' });
  return ctx;
}
const entry = id => ({ entityType: 'deal', entityId: id, at: NOW, byMemberId: 'zac', action: 'update', changes: [] });

test('C8: enabled=false -> flush KHÔNG xoá hàng đợi; bật enabled -> flush được hết', async () => {
  const state = { fail: false };
  const client = auditMockClient(state);
  const ctx = loadDataLayer(client);
  ctx.window.SavaData.attach(client, 'bd');
  /* CHƯA setEnabled: mô phỏng cửa sổ boot-nhanh */
  ctx.window.SavaAudit.recordBatch([entry('d1'), entry('d2')]);
  await ctx.window.SavaAudit._flush();
  assert.equal(ctx.window.SavaAudit._queue.length, 2, 'chưa enabled thì hàng đợi phải được GIỮ nguyên, không xoá trắng');
  assert.equal(client.calls.length, 0, 'chưa enabled thì chưa được insert');
  ctx.window.SavaData.setEnabled(true);
  await ctx.window.SavaAudit._flush();
  await wait(30);
  assert.equal(ctx.window.SavaAudit._queue.length, 0, 'enabled rồi thì hàng đợi phải được flush hết');
  const inserted = client.calls.flatMap(c => c.rows);
  assert.deepEqual(inserted.map(r => r.entity_id), ['d1', 'd2'], 'đúng 2 mục của cửa sổ boot-nhanh, đúng thứ tự');
});

test('C8: insert lỗi (bảng chưa tồn tại) -> KHÔNG throw, mục được GIỮ lại và flush thành công ở lần sau', async () => {
  const state = { fail: true };
  const client = auditMockClient(state);
  const ctx = loadDataLayer(client);
  ctx.window.SavaData.attach(client, 'bd');
  ctx.window.SavaData.setEnabled(true);
  ctx.window.SavaAudit.recordBatch([entry('d1')]);
  await ctx.window.SavaAudit._flush(); /* không được throw */
  assert.equal(client.calls.length, 1, 'đã thử insert 1 lần');
  assert.equal(ctx.window.SavaAudit._queue.length, 1, 'insert lỗi thì mục phải còn trong hàng đợi để thử lần sau');
  assert.equal(ctx.window.SavaAudit._queue[0].entityId, 'd1');
  state.fail = false;
  await ctx.window.SavaAudit._flush();
  assert.equal(ctx.window.SavaAudit._queue.length, 0, 'lần flush sau thành công thì hàng đợi rỗng');
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].rows[0].entity_id, 'd1', 'mục được thử lại đúng là mục đã giữ');
});

test('C8: trần hàng đợi 500 — vượt thì bỏ mục CŨ NHẤT, giữ các mục mới nhất', async () => {
  const state = { fail: false };
  const client = auditMockClient(state);
  const ctx = loadDataLayer(client);
  ctx.window.SavaData.attach(client, 'bd');
  /* giữ ở trạng thái chưa enabled để không flush trong lúc nạp */
  const many = [];
  for (let i = 0; i < 600; i++) many.push(entry('e' + i));
  ctx.window.SavaAudit.recordBatch(many);
  assert.equal(ctx.window.SavaAudit._queueMax, 500);
  assert.equal(ctx.window.SavaAudit._queue.length, 500, 'hàng đợi không được phình quá trần 500');
  assert.equal(ctx.window.SavaAudit._queue[0].entityId, 'e100', '100 mục cũ nhất phải bị bỏ');
  assert.equal(ctx.window.SavaAudit._queue[499].entityId, 'e599', 'mục mới nhất phải còn');
  await ctx.window.SavaAudit._flush();
  assert.equal(ctx.window.SavaAudit._queue.length, 500, 'flush lúc chưa enabled vẫn giữ nguyên hàng đợi đã cắt trần');
});

test('C8 tĩnh: flushAudit không còn đường xoá trắng hàng đợi khi chưa enabled', () => {
  const src = read('supabase-data.js');
  assert.ok(!src.includes('if (!ctx.client || !ctx.enabled) { auditQueue.length = 0;'), 'đường xoá trắng cũ phải bị gỡ');
  assert.ok(src.includes('AUDIT_QUEUE_MAX = 500'));
});

/* ==================================================================
   C9 — Edge Function delete_member kiểm tra tham chiếu phía server
   ================================================================== */
const MOCK_SRC = `
class QB {
  constructor(backend, table) { this.b = backend; this.table = table; this.mode = 'select'; this.filters = []; this.limitN = null; this.row = null; this.patch = null; }
  select() { return this; }
  eq(c, v) { this.filters.push([c, v]); return this; }
  limit(n) { this.limitN = n; return this; }
  insert(row) { this.mode = 'insert'; this.row = row; return this; }
  update(patch) { this.mode = 'update'; this.patch = patch; return this; }
  upsert(row) { this.mode = 'upsert'; this.row = row; return this; }
  delete() { this.mode = 'delete'; return this; }
  rows() { return this.b.tables[this.table] || []; }
  match(row) { return this.filters.every(([c, v]) => row[c] === v); }
  filtered() { let r = this.rows().filter(row => this.match(row)); if (this.limitN) r = r.slice(0, this.limitN); return r; }
  async exec() {
    if (this.mode === 'select') return { data: this.filtered().map(r => ({ ...r })), error: null };
    if (this.mode === 'insert') { this.rows().push({ ...this.row }); if (!this.b.tables[this.table]) this.b.tables[this.table] = this.rows(); return { data: null, error: null }; }
    if (this.mode === 'update') { this.filtered().forEach(r => Object.assign(r, this.patch)); return { data: null, error: null }; }
    if (this.mode === 'upsert') { const i = this.rows().findIndex(r => r.id === this.row.id); if (i >= 0) Object.assign(this.rows()[i], this.row); else this.rows().push({ ...this.row }); return { data: null, error: null }; }
    if (this.mode === 'delete') { this.b.tables[this.table] = this.rows().filter(row => !this.match(row)); return { data: null, error: null }; }
    return { data: null, error: null };
  }
  then(res, rej) { return this.exec().then(res, rej); }
  catch(rej) { return this.exec().catch(rej); }
  async maybeSingle() { const { data, error } = await this.exec(); return { data: data && data.length ? data[0] : null, error }; }
  async single() { if (this.mode === 'insert') return { data: { ...this.row }, error: null }; const { data, error } = await this.exec(); return { data: data && data.length ? data[0] : null, error }; }
}
export function createClient(url, key, opts = {}) {
  const b = globalThis.__savaC4Backend;
  if (!b) throw new Error('mock backend chưa được cài');
  if (key === 'SERVICE-KEY-TEST') {
    return {
      from: table => new QB(b, table),
      auth: { admin: {
        listUsers: async ({ page = 1, perPage = 100 } = {}) => ({ data: { users: b.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }),
        getUserById: async id => { const u = b.authUsers.find(x => x.id === id); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'User not found' } }; },
        inviteUserByEmail: async (email) => { const u = { id: 'u-' + email, email, email_confirmed_at: null }; b.authUsers.push(u); b.calls.invite.push(email); return { data: { user: u }, error: null }; },
        updateUserById: async (id, patch) => { b.calls.updateUser.push({ id, patch }); return { data: { user: b.authUsers.find(x => x.id === id) || null }, error: null }; },
        deleteUser: async id => { b.calls.deleteUser.push(id); if (b.failDeleteUser) return { data: null, error: { message: 'boom delete' } }; b.authUsers = b.authUsers.filter(x => x.id !== id); return { data: {}, error: null }; },
      } },
    };
  }
  const header = (opts.global && opts.global.headers && opts.global.headers.Authorization) || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return {
    from: table => new QB(b, table),
    auth: {
      getUser: async () => { const u = b.usersByToken[token] || null; return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }; },
      resetPasswordForEmail: async email => { b.calls.reset.push(email); return { error: null }; },
    },
  };
}
`;
let handlerCache = null;
async function getHandler() {
  if (handlerCache) return handlerCache;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sava-c4-invite-'));
  const mockPath = path.join(dir, 'mock-supabase.mjs');
  fs.writeFileSync(mockPath, MOCK_SRC);
  let src = read('supabase/functions/invite-member/index.ts');
  src = src.replaceAll('jsr:@supabase/supabase-js@2', pathToFileURL(mockPath).href);
  src = stripTypeScriptTypes(src);
  const fnPath = path.join(dir, 'index.mjs');
  fs.writeFileSync(fnPath, src);
  globalThis.Deno = {
    env: { get: k => ({ SUPABASE_URL: 'https://proj-test.supabase.co', SUPABASE_ANON_KEY: 'ANON-KEY-TEST', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE-KEY-TEST' })[k] || '' },
    serve: fn => { globalThis.__savaC4Handler = fn; },
  };
  await import(pathToFileURL(fnPath).href);
  assert.equal(typeof globalThis.__savaC4Handler, 'function');
  handlerCache = globalThis.__savaC4Handler;
  return handlerCache;
}
function makeBackend() {
  const members = [
    { id: 'zac', name: 'Zac', role: 'Admin', active: true },
    { id: 'dealowner', name: 'Chủ Deal', role: 'BD', active: true },
    { id: 'worker', name: 'Người Việc', role: 'BD', active: true },
    { id: 'reviewer', name: 'Người Chấm', role: 'MKT', active: true },
    { id: 'bothreq', name: 'Hai Vai', role: 'BD', active: true },
    { id: 'free', name: 'Người Trống', role: 'BD', active: true },
  ];
  const profiles = members.map(m => ({ id: 'u-' + m.id, member_id: m.id, email: m.id + '@example.com' }));
  const authUsers = profiles.map(p => ({ id: p.id, email: p.email, email_confirmed_at: '2026-01-01T00:00:00Z' }));
  return {
    tables: {
      members, profiles,
      deals: [{ id: 'd1', owner_id: 'dealowner' }, { id: 'd2', owner_id: 'zac' }],
      tasks: [{ id: 't1', assignee_id: 'worker' }],
      activities: [{ id: 'a1', actor_id: 'worker' }, { id: 'a2', actor_id: 'zac' }],
      publishing_requests: [
        { id: 'r1', requested_by: 'reviewer', assignee_id: 'zac' },
        { id: 'r2', requested_by: 'bothreq', assignee_id: 'bothreq' },
        { id: 'r3', requested_by: 'zac', assignee_id: 'reviewer' },
      ],
      publishing_revisions: [{ request_id: 'r1', revision_no: 1, reviewer_id: 'reviewer' }],
    },
    authUsers,
    usersByToken: { 'JWT-ADMIN': authUsers[0] },
    calls: { deleteUser: [], updateUser: [], invite: [], reset: [] },
    failDeleteUser: false,
  };
}
async function callFn(backend, payload) {
  globalThis.__savaC4Backend = backend;
  const handler = await getHandler();
  const res = await handler(new Request('https://proj-test.supabase.co/functions/v1/invite-member', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer JWT-ADMIN' }, body: JSON.stringify(payload),
  }));
  return { status: res.status, body: await res.json() };
}

test('C9: member còn deal (owner_id) -> 409 + counts, KHÔNG xoá auth/profile/member', async () => {
  const b = makeBackend();
  const r = await callFn(b, { action: 'delete_member', member_id: 'dealowner' });
  assert.equal(r.status, 409);
  assert.equal(r.body.counts.deals, 1);
  assert.equal(r.body.references.deals, 1);
  assert.match(r.body.error, /deal đang phụ trách/);
  assert.deepEqual(b.calls.deleteUser, [], 'còn tham chiếu thì tuyệt đối không gọi deleteUser');
  assert.ok(b.tables.profiles.some(p => p.member_id === 'dealowner'), 'profile phải còn nguyên');
  assert.ok(b.tables.members.some(m => m.id === 'dealowner'), 'member phải còn nguyên');
});

test('C9: task assignee + activity actor -> 409 counts đúng từng loại', async () => {
  const b = makeBackend();
  const r = await callFn(b, { action: 'delete_member', member_id: 'worker' });
  assert.equal(r.status, 409);
  assert.equal(r.body.counts.tasks, 1);
  assert.equal(r.body.counts.activities, 1);
  assert.equal(r.body.counts.deals, 0);
  assert.deepEqual(b.calls.deleteUser, []);
});

test('C9: publishing requested_by/assignee + revision reviewer -> 409; request trùng hai vai chỉ đếm 1 dòng', async () => {
  const b = makeBackend();
  const r = await callFn(b, { action: 'delete_member', member_id: 'reviewer' });
  assert.equal(r.status, 409);
  assert.equal(r.body.counts.publishing_requests, 2, 'reviewer là requested_by của r1 + assignee của r3 = 2 dòng request');
  assert.equal(r.body.counts.publishing_revisions, 1);
  assert.deepEqual(b.calls.deleteUser, []);
  const b2 = makeBackend();
  const r2 = await callFn(b2, { action: 'delete_member', member_id: 'bothreq' });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.counts.publishing_requests, 1, 'r2 có requested_by = assignee = bothreq nhưng chỉ là 1 dòng');
});

test('C9: member KHÔNG còn tham chiếu -> giữ luồng xoá cũ (deleteUser + xoá profiles, members còn cho app)', async () => {
  const b = makeBackend();
  const r = await callFn(b, { action: 'delete_member', member_id: 'free' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.had_account, true);
  assert.deepEqual(b.calls.deleteUser, ['u-free']);
  assert.ok(!b.tables.profiles.some(p => p.member_id === 'free'));
  assert.ok(b.tables.members.some(m => m.id === 'free'), 'function vẫn không xoá dòng members');
});

test('C9 tĩnh: handler chứa đủ 5 nguồn tham chiếu theo đúng tên cột schema.sql', () => {
  const src = read('supabase/functions/invite-member/index.ts');
  const schema = read('supabase/schema.sql');
  for (const col of ['owner_id', 'assignee_id', 'actor_id', 'requested_by', 'reviewer_id']) {
    assert.ok(src.includes(col), 'function thiếu cột tham chiếu ' + col);
    assert.ok(schema.includes(col), 'schema.sql không có cột ' + col + ' — tên cột trong function phải đối chiếu schema');
  }
  assert.ok(src.includes('countMemberReferences'), 'thiếu helper kiểm tra tham chiếu phía server');
  assert.ok(src.includes('409'), 'còn tham chiếu phải trả 409');
});
