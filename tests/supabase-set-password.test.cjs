/* QA độc lập — luồng "Đặt mật khẩu" từ link mời / khôi phục (acdc7d8).
   Harness vm MỚI, tự viết: nạp supabase-auth.js với Supabase client MOCK
   (đúng bề mặt gate sử dụng: onAuthStateChange, setSession, getSession,
   updateUser, signInWithPassword, signOut, from().select().eq().maybeSingle())
   + DOM stub tối thiểu. Không gọi mạng thật, không dùng harness của bên
   triển khai.
   Ca bắt buộc:
     a. hash type=invite + token -> hiện thẻ đặt mật khẩu, KHÔNG vào app.
     b. mật khẩu <6 ký tự -> lỗi tiếng Việt, updateUser KHÔNG được gọi.
     c. hai ô không khớp -> lỗi tiếng Việt, updateUser KHÔNG được gọi.
     d. mật khẩu hợp lệ -> updateUser đúng 1 lần/đúng mật khẩu, hash bị
        xoá, gate vào app theo vai.
     e. sự kiện PASSWORD_RECOVERY (không qua hash) -> hiện thẻ.
     f. phiên thường / không hash -> KHÔNG hiện thẻ, luồng cũ chạy.
     g. updateUser trả lỗi server -> lỗi tiếng Việt, vẫn ở màn hình đặt
        mật khẩu, hash chưa bị xoá.
   Thêm: tĩnh 4 trang có thẻ + nạp supabase-auth.js; hash type=recovery. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- kiểm tra tĩnh: 4 trang ---------- */
test('tĩnh: cả 4 trang đều có thẻ đặt mật khẩu đầy đủ + nạp supabase-auth.js', () => {
  for (const f of ['index.html', 'publishing.html', 'mkt.html', 'import.html']) {
    const html = read(f);
    for (const needle of [
      'id="savaSetPasswordCard"', 'id="savaSetPasswordForm"',
      'id="savaNewPassword"', 'id="savaNewPasswordConfirm"',
      'id="savaSetPasswordError"', 'id="savaSetPasswordStatus"',
      'supabase-auth.js',
    ]) {
      assert.ok(html.includes(needle), f + ' thiếu: ' + needle);
    }
  }
});

test('tĩnh: supabase-client.js tạo client với detectSessionInUrl:false', () => {
  assert.match(read('supabase-client.js'), /detectSessionInUrl:\s*false/);
});

/* ---------- DOM stub ---------- */
function makeEl(id) {
  const classes = new Set(
    ['savaBlockedCard', 'savaUserBar', 'savaSetPasswordCard'].includes(id) ? ['sava-hidden'] : []
  );
  return {
    id, textContent: '', value: '', innerHTML: '', style: {},
    _listeners: {}, _classes: classes,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); }
        else force ? classes.add(c) : classes.delete(c);
      },
      contains: c => classes.has(c),
    },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    setAttribute() {}, focus() {}, remove() {},
    appendChild(child) { return child; },
  };
}

const IDS = [
  'savaAuthRoot', 'savaAuthStatus', 'savaLoginCard', 'savaBlockedCard',
  'savaBlockedMsg', 'savaUserBar', 'savaUserInfo', 'savaLogoutBtn',
  'savaBlockedLogout', 'savaLoginForm', 'savaEmail', 'savaPassword',
  'savaLoginError',
  'savaSetPasswordCard', 'savaSetPasswordForm', 'savaNewPassword',
  'savaNewPasswordConfirm', 'savaSetPasswordError', 'savaSetPasswordStatus',
  'savaSetPasswordTitle', 'savaSetPasswordSub',
];

function loadAuth(opts = {}) {
  const {
    session = null, profile = null, member = null,
    pathname = '/index.html', hash = '', bootHash = 'h-pw-test',
    updateUserImpl = null, setSessionImpl = null,
  } = opts;
  const els = {}; IDS.forEach(id => { els[id] = makeEl(id); });
  const docClasses = new Set(['sava-locked']);
  const store = new Map([['sava_boot_hash', bootHash]]);
  const calls = {
    replace: null, reload: 0, dataAttached: null,
    setSession: [], updateUser: [], getSession: 0, signIn: [], replaceState: [],
  };
  let authCallback = null;
  const client = {
    auth: {
      getSession: async () => { calls.getSession++; return { data: { session } }; },
      setSession: async tokens => {
        calls.setSession.push(tokens);
        if (setSessionImpl) return setSessionImpl(tokens);
        return { data: { session, user: session ? session.user : null }, error: null };
      },
      updateUser: async payload => {
        calls.updateUser.push(payload);
        if (updateUserImpl) return updateUserImpl(payload);
        return { data: { user: session ? session.user : null }, error: null };
      },
      onAuthStateChange: cb => { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async creds => { calls.signIn.push(creds); return { data: { session: null }, error: { message: 'Invalid login credentials' } }; },
      signOut: async () => ({}),
    },
    from(table) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'profiles' ? profile : member, error: null }),
          }),
        }),
      };
    },
  };
  const location = {
    pathname, search: '', hash,
    href: 'http://localhost' + pathname + hash,
    replace: u => { calls.replace = u; },
    reload: () => { calls.reload++; },
  };
  const sandbox = {
    console,
    // Timer trong sandbox chỉ phục vụ dọn thông báo phụ (showNotice) —
    // không để timer 5s giữ tiến trình test; tick ở ngoài dùng timer thật.
    setTimeout: () => 0, clearTimeout: () => {},
    document: {
      readyState: 'complete',
      documentElement: {
        classList: {
          add: c => docClasses.add(c), remove: c => docClasses.delete(c),
          contains: c => docClasses.has(c),
        },
      },
      getElementById: id => els[id] || null,
      createElement: () => makeEl('dyn'),
      body: { appendChild() {} },
      addEventListener() {},
    },
    location,
    history: {
      replaceState: (state, title, url) => {
        calls.replaceState.push(url);
        location.hash = '';
        location.href = 'http://localhost' + url;
      },
    },
    sessionStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
  };
  sandbox.window = sandbox;
  sandbox.window.savaSupabase = () => client;
  sandbox.window.SavaData = {
    attach: (c, role) => { calls.dataAttached = role; },
    installHook() {},
    loadAll: async () => ({ hash: bootHash }),
    setEnabled() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('supabase-auth.js'), sandbox);
  return {
    els, docClasses, calls, location, sandbox,
    auth: sandbox.window.SavaAuth,
    fireAuthEvent: (event, s) => { if (authCallback) return authCallback(event, s); },
    async submitSetPassword() {
      const fn = els.savaSetPasswordForm._listeners.submit;
      assert.equal(typeof fn, 'function', 'form đặt mật khẩu chưa được bind submit');
      await fn({ preventDefault() {} });
    },
  };
}
const tick = () => new Promise(r => setTimeout(r, 30));
const userSess = id => ({ user: { id } });
const INVITE_HASH = '#access_token=AT-123&refresh_token=RT-456&expires_in=3600&token_type=bearer&type=invite';
const BD = {
  profile: { id: 'u-linh', member_id: 'linh' },
  member: { id: 'linh', name: 'Linh', role: 'BD', active: true },
};

/* ---------- a ---------- */
test('a. hash type=invite + token -> thẻ đặt mật khẩu hiện, setSession đúng token, KHÔNG vào thẳng app', async () => {
  const h = loadAuth({ session: userSess('u-linh'), ...BD, hash: INVITE_HASH });
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false, 'thẻ đặt mật khẩu phải hiện');
  assert.equal(h.els.savaLoginCard.classList.contains('sava-hidden'), true, 'form đăng nhập phải ẩn');
  assert.equal(h.els.savaBlockedCard.classList.contains('sava-hidden'), true);
  assert.equal(h.docClasses.has('sava-locked'), true, 'app phải vẫn khoá');
  assert.equal(h.calls.dataAttached, null, 'chưa được nạp dữ liệu/vào app');
  assert.equal(JSON.stringify(h.calls.setSession), JSON.stringify([{ access_token: 'AT-123', refresh_token: 'RT-456' }]));
  assert.equal(h.auth._passwordFlowPending(), true);
  assert.equal(h.auth._pendingPasswordKind(), 'invite');
  assert.match(h.els.savaSetPasswordStatus.textContent, /Liên kết hợp lệ/);
});

/* ---------- b ---------- */
test('b. mật khẩu <6 ký tự -> lỗi tiếng Việt, updateUser KHÔNG được gọi', async () => {
  const h = loadAuth({ session: userSess('u-linh'), ...BD, hash: INVITE_HASH });
  await tick();
  h.els.savaNewPassword.value = '12345';
  h.els.savaNewPasswordConfirm.value = '12345';
  await h.submitSetPassword();
  assert.match(h.els.savaSetPasswordError.textContent, /ít nhất 6 ký tự/);
  assert.equal(h.calls.updateUser.length, 0);
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false);
});

/* ---------- c ---------- */
test('c. hai ô mật khẩu không khớp -> lỗi tiếng Việt, updateUser KHÔNG được gọi', async () => {
  const h = loadAuth({ session: userSess('u-linh'), ...BD, hash: INVITE_HASH });
  await tick();
  h.els.savaNewPassword.value = 'matkhau123';
  h.els.savaNewPasswordConfirm.value = 'matkhau124';
  await h.submitSetPassword();
  assert.match(h.els.savaSetPasswordError.textContent, /chưa khớp/);
  assert.equal(h.calls.updateUser.length, 0);
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false);
});

/* ---------- d ---------- */
test('d. mật khẩu hợp lệ -> updateUser đúng 1 lần/đúng mật khẩu, hash bị xoá, vào app theo vai BD', async () => {
  const h = loadAuth({ session: userSess('u-linh'), ...BD, hash: INVITE_HASH });
  await tick();
  h.els.savaNewPassword.value = 'matkhau123';
  h.els.savaNewPasswordConfirm.value = 'matkhau123';
  await h.submitSetPassword();
  await tick();
  assert.equal(JSON.stringify(h.calls.updateUser), JSON.stringify([{ password: 'matkhau123' }]));
  assert.equal(h.location.hash, '', 'hash chứa token phải bị xoá khỏi URL');
  assert.deepEqual(h.calls.replaceState, ['/index.html']);
  assert.equal(h.auth._passwordFlowPending(), false);
  assert.equal(h.docClasses.has('sava-locked'), false, 'app phải được mở khoá sau khi đặt mật khẩu');
  assert.equal(h.calls.dataAttached, 'bd');
  assert.equal(h.els.savaUserBar.classList.contains('sava-hidden'), false);
  assert.match(h.els.savaUserInfo.textContent, /Linh · BD/);
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), true, 'thẻ đặt mật khẩu phải ẩn sau khi vào app');
});

/* ---------- e ---------- */
test('e. sự kiện PASSWORD_RECOVERY (không qua hash) -> thẻ đặt mật khẩu hiện', async () => {
  const h = loadAuth({ session: null });
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), true, 'trước sự kiện không hiện thẻ');
  h.fireAuthEvent('PASSWORD_RECOVERY', userSess('u-linh'));
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false);
  assert.equal(h.els.savaLoginCard.classList.contains('sava-hidden'), true);
  assert.equal(h.docClasses.has('sava-locked'), true);
  assert.equal(h.auth._passwordFlowPending(), true);
  assert.equal(h.auth._pendingPasswordKind(), 'recovery');
  assert.equal(h.els.savaSetPasswordTitle.textContent, 'Đặt lại mật khẩu');
});

/* ---------- f ---------- */
test('f1. phiên đăng nhập bình thường, không hash -> KHÔNG hiện thẻ, vào app như luồng cũ', async () => {
  const h = loadAuth({ session: userSess('u-linh'), ...BD });
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), true);
  assert.equal(h.auth._passwordFlowPending(), false);
  assert.equal(h.calls.setSession.length, 0);
  assert.equal(h.docClasses.has('sava-locked'), false);
  assert.equal(h.calls.dataAttached, 'bd');
});

test('f2. mở app trực tiếp không hash, chưa đăng nhập -> chỉ hiện form đăng nhập, KHÔNG hiện thẻ', async () => {
  const h = loadAuth({ session: null });
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), true);
  assert.equal(h.els.savaLoginCard.classList.contains('sava-hidden'), false);
  assert.equal(h.docClasses.has('sava-locked'), true);
  assert.equal(h.calls.setSession.length, 0);
});

/* ---------- g ---------- */
test('g. updateUser trả lỗi server -> lỗi tiếng Việt hiện, vẫn ở màn hình đặt mật khẩu, hash chưa bị xoá', async () => {
  const h = loadAuth({
    session: userSess('u-linh'), ...BD, hash: INVITE_HASH,
    updateUserImpl: async () => ({ data: {}, error: { message: 'New password should be different from the old password' } }),
  });
  await tick();
  h.els.savaNewPassword.value = 'matkhau123';
  h.els.savaNewPasswordConfirm.value = 'matkhau123';
  await h.submitSetPassword();
  assert.equal(h.calls.updateUser.length, 1);
  assert.match(h.els.savaSetPasswordError.textContent, /Mật khẩu mới phải khác mật khẩu cũ/);
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false, 'phải vẫn ở màn hình đặt mật khẩu');
  assert.equal(h.calls.replaceState.length, 0, 'hash chưa được xoá khi thất bại');
  assert.equal(h.location.hash, INVITE_HASH);
  assert.equal(h.auth._passwordFlowPending(), true);
  assert.equal(h.docClasses.has('sava-locked'), true);
  assert.equal(h.calls.dataAttached, null);
});

/* ---------- bổ sung: hash type=recovery ---------- */
test('bổ sung: hash type=recovery + token -> thẻ hiện với tiêu đề Đặt lại mật khẩu, kind=recovery', async () => {
  const h = loadAuth({
    session: userSess('u-linh'), ...BD,
    hash: '#access_token=AT-9&refresh_token=RT-9&token_type=bearer&type=recovery',
  });
  await tick();
  assert.equal(h.els.savaSetPasswordCard.classList.contains('sava-hidden'), false);
  assert.equal(h.auth._pendingPasswordKind(), 'recovery');
  assert.equal(h.els.savaSetPasswordTitle.textContent, 'Đặt lại mật khẩu');
  assert.equal(JSON.stringify(h.calls.setSession), JSON.stringify([{ access_token: 'AT-9', refresh_token: 'RT-9' }]));
  assert.equal(h.calls.dataAttached, null);
});

/* ---------- bổ sung: expose kiểm thử tồn tại ---------- */
test('bổ sung: window.SavaAuth expose đủ hook kiểm thử của luồng đặt mật khẩu', async () => {
  const h = loadAuth({ session: null });
  await tick();
  for (const k of ['_showSetPassword', '_cleanAuthHash', '_passwordFlowPending', '_pendingPasswordKind']) {
    assert.equal(typeof h.auth[k], 'function', 'thiếu SavaAuth.' + k);
  }
  h.auth._cleanAuthHash();
  assert.equal(h.location.hash, '');
});
