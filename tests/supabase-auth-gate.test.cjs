/* Giai đoạn 2b — cổng đăng nhập:
   (1) khẳng định tĩnh: cả 3 trang + import.html nạp đúng bộ script Supabase
       + có #savaAuthRoot với form đăng nhập; không file frontend nào chứa
       khoá khác ngoài anon key công khai trong supabase-client.js.
   (2) harness vm: nạp supabase-auth.js với Supabase client MOCK (không gọi
       mạng thật) + DOM stub — kiểm: chưa đăng nhập chỉ hiện form; MKT ở
       index bị chuyển về mkt.html; tài khoản chưa gắn member bị chặn;
       member inactive bị chặn; BD hợp lệ được mở khoá. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('3 trang + import: nạp CDN supabase-js + client/adapter/data/auth + auth root + khoá trang từ đầu', () => {
  for (const f of ['index.html', 'publishing.html', 'mkt.html', 'import.html']) {
    const html = read(f);
    for (const needle of ['@supabase/supabase-js@2', 'supabase-client.js', 'supabase-adapter.js', 'supabase-data.js', 'supabase-auth.js', 'id="savaAuthRoot"', 'id="savaLoginForm"', 'id="savaEmail"', 'id="savaPassword"', 'id="savaLogoutBtn"', "classList.add('sava-locked')"]) {
      assert.ok(html.includes(needle), f + ' thiếu: ' + needle);
    }
    assert.ok(!/type="submit"[^>]*>\s*Đăng ký/.test(html), f + ' không được có nút đăng ký');
  }
});

test('chỉ anon key công khai xuất hiện trong frontend (không service_role key / JWT lạ)', () => {
  const files = ['supabase-client.js', 'supabase-adapter.js', 'supabase-data.js', 'supabase-auth.js', 'index.html', 'publishing.html', 'mkt.html', 'import.html', 'shared.js', 'publishing.js', 'publishing-bridge.js'];
  for (const f of files) {
    const src = read(f);
    const jwts = src.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [];
    if (f === 'supabase-client.js') assert.equal(jwts.length, 1, 'client chỉ chứa đúng 1 JWT (anon key)');
    else assert.equal(jwts.length, 0, f + ' chứa JWT lạ: ' + jwts.length);
  }
});

/* ---------- harness vm cho supabase-auth.js ---------- */
function makeEl(id) {
  const classes = new Set(id === 'savaBlockedCard' || id === 'savaUserBar' ? ['sava-hidden'] : []);
  return {
    id, textContent: '', value: '', _listeners: {},
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      toggle: (c, force) => { if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else force ? classes.add(c) : classes.delete(c); },
      contains: c => classes.has(c),
    },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
  };
}
function loadAuth({ session = null, profile = null, member = null, pathname = '/index.html', bootHash = 'h-test' }) {
  const ids = ['savaAuthStatus', 'savaLoginCard', 'savaBlockedCard', 'savaBlockedMsg', 'savaUserBar', 'savaUserInfo', 'savaLogoutBtn', 'savaBlockedLogout', 'savaLoginForm', 'savaEmail', 'savaPassword', 'savaLoginError'];
  const els = {}; ids.forEach(id => { els[id] = makeEl(id); });
  const docClasses = new Set(['sava-locked']);
  const store = new Map([['sava_boot_hash', bootHash]]);
  const calls = { replace: null, reload: 0, dataAttached: null };
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => {},
      signInWithPassword: async () => ({ data: { session: null }, error: { message: 'Invalid login credentials' } }),
      signOut: async () => {},
    },
    from(table) {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'profiles' ? profile : member, error: null }) }) }) };
    },
  };
  const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
      readyState: 'complete',
      documentElement: { classList: { add: c => docClasses.add(c), remove: c => docClasses.delete(c), contains: c => docClasses.has(c) } },
      getElementById: id => els[id] || null,
      createElement: () => makeEl('dyn'),
      body: { appendChild() {} },
      addEventListener() {},
    },
    location: { pathname, href: 'http://localhost' + pathname, replace: u => { calls.replace = u; }, reload: () => { calls.reload++; } },
    sessionStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
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
  return { els, docClasses, calls };
}
const tick = () => new Promise(r => setTimeout(r, 30));
const user = id => ({ user: { id } });

test('auth: chưa có session -> chỉ hiện form đăng nhập, app vẫn khoá', async () => {
  const h = loadAuth({ session: null });
  await tick();
  assert.equal(h.docClasses.has('sava-locked'), true);
  assert.equal(h.els.savaLoginCard.classList.contains('sava-hidden'), false);
  assert.equal(h.els.savaBlockedCard.classList.contains('sava-hidden'), true);
  assert.equal(h.calls.dataAttached, null);
});

test('auth: MKT mở index.html -> chuyển về mkt.html', async () => {
  const h = loadAuth({ session: user('u-mai'), profile: { id: 'u-mai', member_id: 'mai' }, member: { id: 'mai', name: 'Mai', role: 'MKT', active: true } });
  await tick();
  assert.equal(h.calls.replace, 'mkt.html');
});

test('auth: BD mở mkt.html -> chuyển về index.html', async () => {
  const h = loadAuth({ session: user('u-linh'), profile: { id: 'u-linh', member_id: 'linh' }, member: { id: 'linh', name: 'Linh', role: 'BD', active: true }, pathname: '/mkt.html' });
  await tick();
  assert.equal(h.calls.replace, 'index.html');
});

test('auth: tài khoản chưa gắn member -> màn hình chặn có lý do', async () => {
  const h = loadAuth({ session: user('u-x'), profile: null, member: null });
  await tick();
  assert.equal(h.docClasses.has('sava-locked'), true);
  assert.equal(h.els.savaBlockedCard.classList.contains('sava-hidden'), false);
  assert.match(h.els.savaBlockedMsg.textContent, /chưa được gắn với thành viên/);
});

test('auth: member đã ngừng hoạt động -> chặn + nêu rõ', async () => {
  const h = loadAuth({ session: user('u-mai'), profile: { id: 'u-mai', member_id: 'mai' }, member: { id: 'mai', name: 'Mai', role: 'MKT', active: false } });
  await tick();
  assert.equal(h.els.savaBlockedCard.classList.contains('sava-hidden'), false);
  assert.match(h.els.savaBlockedMsg.textContent, /ngừng hoạt động/);
});

test('auth: BD hợp lệ -> mở khoá app, hiện thanh người dùng', async () => {
  const h = loadAuth({ session: user('u-linh'), profile: { id: 'u-linh', member_id: 'linh' }, member: { id: 'linh', name: 'Linh', role: 'BD', active: true }, pathname: '/publishing.html' });
  await tick();
  assert.equal(h.docClasses.has('sava-locked'), false);
  assert.equal(h.els.savaUserBar.classList.contains('sava-hidden'), false);
  assert.match(h.els.savaUserInfo.textContent, /Linh · BD/);
  assert.equal(h.calls.dataAttached, 'bd');
});
