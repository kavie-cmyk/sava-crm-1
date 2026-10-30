/* Edge Function invite-member — chạy HANDLER THẬT trong Node:
   - Nạp supabase/functions/invite-member/index.ts, strip types bằng
     node:module.stripTypeScriptTypes (Node >= 22.13), trỏ import
     "jsr:@supabase/supabase-js@2" sang module MOCK viết ra thư mục tạm.
   - Mock supabase-js: createClient phân biệt user client (anon key +
     header Authorization) và admin client (service_role key) qua key;
     DB là bảng trong bộ nhớ (members/profiles) + auth.users trong bộ
     nhớ; mọi lời gọi admin (deleteUser, updateUserById...) được ghi lại.
   - Deno được giả lập tối thiểu: Deno.env.get (3 biến Supabase cố định
     cho test) + Deno.serve (bắt handler).
   Không mạng thật, không đụng project Supabase thật.
   Bao phủ: các action cũ ở mức khói (list_status/revoke vẫn chạy) và
   action MỚI delete_member với đủ ca yêu cầu:
     không phải Admin -> 403 · Admin inactive -> 403 · tự xoá mình -> 400
     · member có tài khoản -> deleteUser đúng id + xoá dòng profiles,
       dòng members VẪN CÒN (app xoá qua diff-sync) · member không tài
       khoản -> KHÔNG gọi auth admin · member không tồn tại -> 404
     · thiếu member_id -> 400 · deleteUser lỗi -> 500 + profile còn nguyên
     · không JWT -> 401. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');

const FN_DIR = path.join(__dirname, '..', 'supabase', 'functions', 'invite-member');

/* ---------- mock supabase-js (ghi ra file .mjs trong thư mục tạm) ---------- */
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
  rows() { return this.b.tables[this.table]; }
  match(row) { return this.filters.every(([c, v]) => row[c] === v); }
  filtered() { let r = this.rows().filter(row => this.match(row)); if (this.limitN) r = r.slice(0, this.limitN); return r; }
  async exec() {
    if (this.mode === 'select') return { data: this.filtered().map(r => ({ ...r })), error: null };
    if (this.mode === 'insert') { this.rows().push({ ...this.row }); return { data: null, error: null }; }
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
  const b = globalThis.__savaFnBackend;
  if (!b) throw new Error('mock backend chưa được cài');
  if (key === 'SERVICE-KEY-TEST') {
    return {
      from: table => new QB(b, table),
      auth: { admin: {
        listUsers: async ({ page = 1, perPage = 100 } = {}) => ({ data: { users: b.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }),
        getUserById: async id => { const u = b.authUsers.find(x => x.id === id); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'User not found' } }; },
        inviteUserByEmail: async (email, o) => { const u = { id: 'u-' + email, email, email_confirmed_at: null }; b.authUsers.push(u); b.calls.invite.push(email); return { data: { user: u }, error: null }; },
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

/* ---------- nạp handler thật (1 lần; backend thay theo từng ca) ----------
   Specifier trong source là "jsr:@supabase/supabase-js@2": thay bằng URL
   file của mock TRƯỚC, rồi strip types, ghi ra index.mjs tạm và import.
   createClient của mock đọc backend từ globalThis.__savaFnBackend tại
   thời điểm function gọi (mỗi request) nên đổi backend theo ca là đủ,
   handler chỉ nạp 1 lần. */
let handlerCache = null;
async function getHandler() {
  if (handlerCache) return handlerCache;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sava-invite-member-'));
  const mockPath = path.join(dir, 'mock-supabase.mjs');
  fs.writeFileSync(mockPath, MOCK_SRC);
  let src = fs.readFileSync(path.join(FN_DIR, 'index.ts'), 'utf8');
  src = src.replaceAll('jsr:@supabase/supabase-js@2', pathToFileURL(mockPath).href);
  src = stripTypeScriptTypes(src);
  const fnPath = path.join(dir, 'index.mjs');
  fs.writeFileSync(fnPath, src);
  globalThis.Deno = {
    env: { get: k => ({ SUPABASE_URL: 'https://proj-test.supabase.co', SUPABASE_ANON_KEY: 'ANON-KEY-TEST', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE-KEY-TEST' })[k] || '' },
    serve: fn => { globalThis.__savaFnHandler = fn; },
  };
  await import(pathToFileURL(fnPath).href);
  assert.equal(typeof globalThis.__savaFnHandler, 'function', 'function phải đăng ký handler qua Deno.serve');
  handlerCache = globalThis.__savaFnHandler;
  return handlerCache;
}

/* ---------- backend mẫu theo ca ---------- */
function makeBackend(over = {}) {
  const members = [
    { id: 'zac', name: 'Zac', role: 'Admin', active: true },
    { id: 'zac2', name: 'Zac Hai', role: 'Admin', active: false },
    { id: 'linh', name: 'Linh', role: 'BD', active: true },
    { id: 'tuan', name: 'Tuấn', role: 'BD', active: true },
    { id: 'binh', name: 'Bình', role: 'BD', active: true },
  ];
  const profiles = [
    { id: 'u-zac', member_id: 'zac', email: 'zac@example.com' },
    { id: 'u-zac2', member_id: 'zac2', email: 'zac2@example.com' },
    { id: 'u-linh', member_id: 'linh', email: 'linh@example.com' },
    { id: 'u-binh', member_id: 'binh', email: 'binh@example.com' },
    /* tuan: KHÔNG có profile (chưa có tài khoản) */
  ];
  const authUsers = profiles.map(p => ({ id: p.id, email: p.email, email_confirmed_at: '2026-01-01T00:00:00Z' }));
  const usersByToken = {
    'JWT-ADMIN': authUsers[0], 'JWT-ADMIN-INACTIVE': authUsers[1], 'JWT-BD': authUsers[2],
  };
  return Object.assign({
    tables: { members, profiles },
    authUsers, usersByToken,
    calls: { deleteUser: [], updateUser: [], invite: [], reset: [] },
    failDeleteUser: false,
  }, over);
}

async function call(backend, token, payload) {
  globalThis.__savaFnBackend = backend;
  const handler = await getHandler();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await handler(new Request('https://proj-test.supabase.co/functions/v1/invite-member', {
    method: 'POST', headers, body: JSON.stringify(payload),
  }));
  return { status: res.status, body: await res.json() };
}

/* ---------- khói: action cũ vẫn chạy ---------- */
test('khói: list_status bằng Admin -> 200 + statuses đủ member', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'list_status' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.statuses.binh.has_account, true);
  assert.equal(r.body.statuses.tuan.has_account, false);
});

test('khói: revoke bằng Admin vẫn đổi active + ban user như cũ', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'revoke', member_id: 'tuan' });
  assert.equal(r.status, 200);
  assert.equal(b.tables.members.find(m => m.id === 'tuan').active, false);
});

/* ---------- delete_member ---------- */
test('delete_member: người gọi KHÔNG phải Admin (BD) -> 403, không xoá gì', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-BD', { action: 'delete_member', member_id: 'binh' });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Chỉ Admin đang hoạt động/);
  assert.deepEqual(b.calls.deleteUser, []);
  assert.ok(b.tables.profiles.some(p => p.member_id === 'binh'), 'profile của Bình phải còn nguyên');
});

test('delete_member: Admin đã NGỪNG HOẠT ĐỘNG -> 403', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN-INACTIVE', { action: 'delete_member', member_id: 'binh' });
  assert.equal(r.status, 403);
  assert.deepEqual(b.calls.deleteUser, []);
});

test('delete_member: không có JWT -> 401', async () => {
  const b = makeBackend();
  const r = await call(b, null, { action: 'delete_member', member_id: 'binh' });
  assert.equal(r.status, 401);
});

test('delete_member: Admin tự xoá chính mình -> 400, tài khoản còn nguyên', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member', member_id: 'zac' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /chính bạn/);
  assert.deepEqual(b.calls.deleteUser, []);
  assert.ok(b.tables.profiles.some(p => p.member_id === 'zac'));
  assert.ok(b.tables.members.some(m => m.id === 'zac'));
});

test('delete_member: member CÓ tài khoản -> deleteUser đúng id + xoá dòng profiles; dòng members VẪN CÒN (app xoá qua diff-sync)', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member', member_id: 'binh' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.had_account, true);
  assert.equal(r.body.accounts_deleted, 1);
  assert.deepEqual(b.calls.deleteUser, ['u-binh'], 'phải gọi admin deleteUser đúng id của auth user gắn với Bình');
  assert.ok(!b.authUsers.some(u => u.id === 'u-binh'), 'auth user phải bị xoá');
  assert.ok(!b.tables.profiles.some(p => p.member_id === 'binh'), 'dòng profiles phải bị xoá');
  assert.ok(b.tables.members.some(m => m.id === 'binh'), 'function KHÔNG xoá dòng members — app xoá qua save/diff-sync');
});

test('delete_member: member KHÔNG có tài khoản -> 200 had_account=false, KHÔNG gọi auth admin', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member', member_id: 'tuan' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.had_account, false);
  assert.equal(r.body.accounts_deleted, 0);
  assert.deepEqual(b.calls.deleteUser, [], 'không được gọi deleteUser khi member chưa có tài khoản');
  assert.ok(b.tables.members.some(m => m.id === 'tuan'), 'dòng members vẫn còn cho app xoá');
});

test('delete_member: member không tồn tại -> 404 rõ ràng', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member', member_id: 'khongco' });
  assert.equal(r.status, 404);
  assert.match(r.body.error, /Không tìm thấy thành viên/);
  assert.deepEqual(b.calls.deleteUser, []);
});

test('delete_member: thiếu member_id -> 400', async () => {
  const b = makeBackend();
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /member_id/);
});

test('delete_member: deleteUser lỗi phía Auth -> 500 partial, profile + member còn nguyên', async () => {
  const b = makeBackend({ failDeleteUser: true });
  const r = await call(b, 'JWT-ADMIN', { action: 'delete_member', member_id: 'binh' });
  assert.equal(r.status, 500);
  assert.equal(r.body.partial, true);
  assert.ok(b.tables.profiles.some(p => p.member_id === 'binh'), 'profile phải còn khi xoá auth user thất bại');
  assert.ok(b.tables.members.some(m => m.id === 'binh'));
});
