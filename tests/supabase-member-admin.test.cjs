/* Triển khai — "Mời thành viên + phân quyền" (Edge Function invite-member
   + helper phía frontend + UI Admin ở view Thành viên).
   Harness vm theo đúng mẫu tests/supabase-set-password.test.cjs: nạp
   supabase-auth.js với Supabase client MOCK + fetch MOCK (không mạng
   thật). Kiểm:
     - tĩnh: index.html có đủ bề mặt UI mới + function/README tồn tại,
       function không hardcode key nào.
     - accountStatusFor: ánh xạ trạng thái tài khoản đủ các nhánh
       (function có dữ kiện / fallback profiles).
     - isValidEmail.
     - currentUser(): suy đúng vai từ profile+member sau đăng nhập.
     - callMemberAdmin: URL/header/body đúng, JWT lấy từ phiên hiện tại;
       map lỗi 403/404/mạng sang message tiếng Việt; không session -> lỗi.
     - fetchMemberProfiles: map theo member_id. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- tĩnh ---------- */
test('tĩnh: index.html có bề mặt quản trị tài khoản Admin ở view Thành viên', () => {
  const html = read('index.html');
  for (const needle of [
    'openInviteMember', 'submitInviteMember', 'inviteModeChange',
    'resendMemberInvite', 'revokeMemberAccess', 'unrevokeMemberAccess',
    'refreshMemberAccounts', 'memberAccountCell', 'isAdminViewer',
    '✉️ Mời thành viên', '<th>Tài khoản</th>', 'Gửi lại lời mời', 'Thu hồi quyền', 'Kích hoạt lại',
  ]) {
    assert.ok(html.includes(needle), 'index.html thiếu: ' + needle);
  }
  /* Nút Mời chỉ nằm trong nhánh admin (mẫu: ${admin ? `...Mời thành viên...` : ""}) */
  assert.match(html, /\$\{admin \? `[^`]*Mời thành viên[^`]*` : ""\}/);
});

test('tĩnh: Edge Function invite-member tồn tại, không hardcode key, đủ action', () => {
  const fnPath = path.join(__dirname, '..', 'supabase', 'functions', 'invite-member', 'index.ts');
  assert.ok(fs.existsSync(fnPath), 'thiếu supabase/functions/invite-member/index.ts');
  const src = fs.readFileSync(fnPath, 'utf8');
  assert.equal(src.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g), null, 'function chứa JWT hardcode!');
  assert.ok(!/service_role[^\n]*['"][A-Za-z0-9_-]{20,}['"]/.test(src), 'function có vẻ hardcode service_role key');
  for (const needle of [
    'SUPABASE_SERVICE_ROLE_KEY', 'Deno.env.get',
    'inviteUserByEmail', 'resetPasswordForEmail', 'ban_duration', '876000h',
    "action === \"invite\"", "action === \"resend\"", "action === \"revoke\"", "action === \"unrevoke\"", "action === \"list_status\"",
    "role !== \"Admin\"", 'kavie-cmyk.github.io',
    'email_confirmed_at',
  ]) {
    assert.ok(src.includes(needle), 'function thiếu: ' + needle);
  }
  const readme = read('supabase/functions/README.md');
  for (const needle of ['supabase functions deploy invite-member', 'vaegwvawlwpckfkmjzsj', 'api.supabase.com/v1/projects/vaegwvawlwpckfkmjzsj/functions', 'verify_jwt', '401', '403']) {
    assert.ok(readme.includes(needle), 'README functions thiếu: ' + needle);
  }
});

test('tĩnh: supabase-auth.js phơi helper chung callMemberAdmin/fetchMemberProfiles/accountStatusFor', () => {
  const src = read('supabase-auth.js');
  for (const needle of ['callMemberAdmin', 'fetchMemberProfiles', 'accountStatusFor', 'isValidEmail', 'currentUser', '/functions/v1/invite-member']) {
    assert.ok(src.includes(needle), 'supabase-auth.js thiếu: ' + needle);
  }
});

/* ---------- harness vm ---------- */
function makeEl(id) {
  const classes = new Set(['savaBlockedCard', 'savaUserBar', 'savaSetPasswordCard'].includes(id) ? ['sava-hidden'] : []);
  return {
    id, textContent: '', value: '', innerHTML: '', style: {}, _listeners: {}, _classes: classes,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      toggle: (c, force) => { if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else force ? classes.add(c) : classes.delete(c); },
      contains: c => classes.has(c),
    },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    setAttribute() {}, focus() {}, remove() {}, appendChild(c) { return c; },
  };
}
const IDS = [
  'savaAuthRoot', 'savaAuthStatus', 'savaLoginCard', 'savaBlockedCard', 'savaBlockedMsg',
  'savaUserBar', 'savaUserInfo', 'savaLogoutBtn', 'savaBlockedLogout', 'savaLoginForm',
  'savaEmail', 'savaPassword', 'savaLoginError', 'savaSetPasswordCard', 'savaSetPasswordForm',
  'savaNewPassword', 'savaNewPasswordConfirm', 'savaSetPasswordError', 'savaSetPasswordStatus',
  'savaSetPasswordTitle', 'savaSetPasswordSub',
];

function loadAuth(opts = {}) {
  const {
    session = null, profile = null, member = null, profilesList = [],
    fetchImpl = null, bootHash = 'h-member-admin',
  } = opts;
  const els = {}; IDS.forEach(id => { els[id] = makeEl(id); });
  const docClasses = new Set(['sava-locked']);
  const store = new Map([['sava_boot_hash', bootHash]]);
  const calls = { fetch: [], dataAttached: null };
  /* select() vừa thenable (fetchMemberProfiles await trực tiếp) vừa có
     .eq().maybeSingle() (luồng proceed) — mô phỏng đúng 2 cách gate dùng. */
  function query(single, list) {
    const p = Promise.resolve({ data: list, error: null });
    return {
      eq: () => ({ maybeSingle: async () => ({ data: single, error: null }) }),
      then: p.then.bind(p), catch: p.catch.bind(p),
    };
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      setSession: async () => ({ data: { session }, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session: null }, error: { message: 'Invalid login credentials' } }),
      signOut: async () => ({}),
    },
    from(table) {
      return { select: () => (table === 'profiles' ? query(profile, profilesList) : query(member, [])) };
    },
  };
  const fetchMock = async (url, init) => {
    calls.fetch.push({ url, init });
    if (fetchImpl) return fetchImpl(url, init);
    return { ok: true, status: 200, json: async () => ({ ok: true, statuses: {} }) };
  };
  const sandbox = {
    console, setTimeout: () => 0, clearTimeout: () => {}, fetch: fetchMock,
    document: {
      readyState: 'complete',
      documentElement: { classList: { add: c => docClasses.add(c), remove: c => docClasses.delete(c), contains: c => docClasses.has(c) } },
      getElementById: id => els[id] || null,
      createElement: () => makeEl('dyn'),
      body: { appendChild() {} },
      addEventListener() {},
    },
    location: { pathname: '/index.html', search: '', hash: '', href: 'http://localhost/index.html', replace: () => {}, reload: () => {} },
    history: { replaceState: () => {} },
    sessionStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  };
  sandbox.window = sandbox;
  sandbox.window.savaSupabase = () => client;
  sandbox.window.SavaSupabaseConfig = { SUPABASE_URL: 'https://vaegwvawlwpckfkmjzsj.supabase.co', SUPABASE_ANON_KEY: 'ANON-KEY' };
  sandbox.window.SavaData = { attach: (c, role) => { calls.dataAttached = role; }, installHook() {}, loadAll: async () => ({ hash: bootHash }), setEnabled() {} };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-auth.js'), sandbox);
  return { els, docClasses, calls, auth: sandbox.window.SavaAuth };
}
const tick = () => new Promise(r => setTimeout(r, 30));
const ADMIN = {
  session: { user: { id: 'u-zac', email: 'zac@example.com' }, access_token: 'JWT-ADMIN' },
  profile: { id: 'u-zac', member_id: 'zac', email: 'zac@example.com' },
  member: { id: 'zac', name: 'Zac', role: 'Admin', active: true },
};
const BD = {
  session: { user: { id: 'u-linh', email: 'linh@example.com' }, access_token: 'JWT-BD' },
  profile: { id: 'u-linh', member_id: 'linh', email: 'linh@example.com' },
  member: { id: 'linh', name: 'Linh', role: 'BD', active: true },
};

/* ---------- helper thuần ---------- */
test('accountStatusFor: đủ nhánh ánh xạ trạng thái', async () => {
  const h = loadAuth({ session: null });
  await tick();
  const f = h.auth.accountStatusFor;
  /* Object tạo trong vm realm khác prototype — so qua cặp key|label. */
  const pair = o => o.key + '|' + o.label;
  assert.equal(pair(f(false, { status: 'active' })), 'active|Đã có tài khoản');
  assert.equal(pair(f(true, { status: 'invited' })), 'invited|Đã mời – chờ đặt mật khẩu');
  assert.equal(pair(f(true, { status: 'none' })), 'none|Chưa có tài khoản');
  assert.equal(pair(f(true, null)), 'linked|Đã gắn tài khoản');
  assert.equal(pair(f(false, null)), 'none|Chưa có tài khoản');
  assert.equal(pair(f(false, undefined)), 'none|Chưa có tài khoản');
});

test('isValidEmail: nhận đúng định dạng, loại rác', async () => {
  const h = loadAuth({ session: null });
  await tick();
  assert.equal(h.auth.isValidEmail('linh@sava.vn'), true);
  assert.equal(h.auth.isValidEmail('  a.b@c.co '), true);
  assert.equal(h.auth.isValidEmail('khong-co-at'), false);
  assert.equal(h.auth.isValidEmail('a@b'), false);
  assert.equal(h.auth.isValidEmail(''), false);
  assert.equal(h.auth.isValidEmail(null), false);
});

/* ---------- currentUser ---------- */
test('currentUser: Admin sau đăng nhập -> role admin + memberId đúng; BD -> role bd', async () => {
  const ha = loadAuth(ADMIN);
  await tick();
  const cu = ha.auth.currentUser();
  assert.equal(cu.memberId, 'zac'); assert.equal(cu.name, 'Zac'); assert.equal(cu.role, 'admin');
  assert.equal(cu.memberRole, 'Admin'); assert.equal(cu.email, 'zac@example.com');
  const hb = loadAuth(BD);
  await tick();
  assert.equal(hb.auth.currentUser().role, 'bd');
  assert.equal(hb.auth.currentUser().memberId, 'linh');
  const hn = loadAuth({ session: null });
  await tick();
  assert.equal(hn.auth.currentUser(), null);
});

/* ---------- callMemberAdmin ---------- */
test('callMemberAdmin: gọi đúng URL function, header JWT phiên hiện tại, body JSON', async () => {
  const h = loadAuth({ ...ADMIN, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, statuses: { linh: { has_account: true, status: 'invited', email: 'linh@example.com' } } }) }) });
  await tick();
  const r = await h.auth.callMemberAdmin({ action: 'list_status' });
  assert.equal(r.ok, true);
  assert.equal(r.statuses.linh.status, 'invited');
  assert.equal(h.calls.fetch.length, 1);
  const { url, init } = h.calls.fetch[0];
  assert.equal(url, 'https://vaegwvawlwpckfkmjzsj.supabase.co/functions/v1/invite-member');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer JWT-ADMIN');
  assert.equal(init.headers.apikey, 'ANON-KEY');
  assert.deepEqual(JSON.parse(init.body), { action: 'list_status' });
});

test('callMemberAdmin: lỗi 403 từ function -> ném Error mang message + status', async () => {
  const h = loadAuth({ ...BD, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'Chỉ Admin đang hoạt động mới quản lý được tài khoản thành viên.' }) }) });
  await tick();
  await assert.rejects(h.auth.callMemberAdmin({ action: 'list_status' }), err => {
    assert.equal(err.message, 'Chỉ Admin đang hoạt động mới quản lý được tài khoản thành viên.');
    assert.equal(err.status, 403);
    return true;
  });
});

test('callMemberAdmin: 404 (chưa deploy) -> message tiếng Việt rõ ràng', async () => {
  const h = loadAuth({ ...ADMIN, fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  await tick();
  await assert.rejects(h.auth.callMemberAdmin({ action: 'list_status' }), /chưa được triển khai/);
});

test('callMemberAdmin: mất mạng -> message tiếng Việt, không lộ lỗi thô', async () => {
  const h = loadAuth({ ...ADMIN, fetchImpl: async () => { throw new Error('Failed to fetch'); } });
  await tick();
  await assert.rejects(h.auth.callMemberAdmin({ action: 'invite', email: 'a@b.co', member_id: 'linh' }), /Không kết nối được/);
});

test('callMemberAdmin: chưa đăng nhập (không session) -> lỗi phiên hết hạn, KHÔNG gọi fetch', async () => {
  const h = loadAuth({ session: null });
  await tick();
  await assert.rejects(h.auth.callMemberAdmin({ action: 'list_status' }), /Phiên đăng nhập đã hết hạn/);
  assert.equal(h.calls.fetch.length, 0);
});

/* ---------- fetchMemberProfiles ---------- */
test('fetchMemberProfiles: map theo member_id, giữ profile đầu tiên khi trùng', async () => {
  const h = loadAuth({
    ...ADMIN,
    profilesList: [
      { id: 'u-zac', member_id: 'zac', email: 'zac@example.com' },
      { id: 'u-linh', member_id: 'linh', email: 'linh@example.com' },
      { id: 'u-linh2', member_id: 'linh', email: 'dup@example.com' },
      { id: 'u-x', member_id: '', email: 'x@example.com' },
    ],
  });
  await tick();
  const map = await h.auth.fetchMemberProfiles();
  assert.deepEqual(Object.keys(map).sort(), ['linh', 'zac']);
  assert.equal(map.linh.email, 'linh@example.com');
  assert.equal(map.zac.id, 'u-zac');
});
