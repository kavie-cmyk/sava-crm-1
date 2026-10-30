/* Sava Meta CRM — Cổng đăng nhập + phân quyền theo vai (Giai đoạn 2b).
   - Cả 3 trang (index / publishing / mkt) đều nạp file này. <html> mang
     class 'sava-locked' ngay từ đầu (auth.css ẩn toàn bộ app, chỉ hiện
     #savaAuthRoot) cho tới khi phiên đăng nhập + dữ liệu Supabase sẵn sàng.
   - Chưa có session -> CHỈ hiện form đăng nhập (email + mật khẩu), không
     có nút đăng ký. Lỗi đăng nhập dịch sang tiếng Việt tử tế.
   - Có session -> đọc profiles (theo auth user) -> members để lấy vai
     (Admin/BD/MKT/Khác) + active:
       * Không có profile/member, hoặc member đã ngừng hoạt động ->
         màn hình chặn rõ lý do + nút Đăng xuất.
       * Điều hướng theo vai: MKT chỉ ở mkt.html (mở index/publishing thì
         chuyển về mkt.html kèm thông báo); BD/Admin mở mkt.html thì
         chuyển về index.html kèm thông báo.
   - Sau khi vai hợp lệ: SavaData.loadAll() nạp dữ liệu Supabase vào cache.
     Nếu dữ liệu khác bản đang hiển thị (hash khác lần mở trước trong cùng
     phiên trình duyệt) -> nạp lại trang 1 lần để app render từ dữ liệu
     mới; trùng -> mở khoá ngay. Mất kết nối khi nạp -> mở app bằng cache
     trên máy kèm banner cảnh báo, đồng bộ ghi bị TẮT (tránh đẩy dữ liệu
     mẫu/dữ liệu cũ lên khi chưa có snapshot từ server).
   - Session hết hạn/mất giữa chừng (onAuthStateChange SIGNED_OUT) ->
     khoá lại về màn hình đăng nhập.
   - Sau đăng nhập, #savaUserBar hiện tên + vai + nút Đăng xuất ở cả 3 trang.
   - Link mời (type=invite) / khôi phục (type=recovery): client được tạo
     với detectSessionInUrl:false (supabase-client.js) nên supabase-js
     KHÔNG tự đọc token trong URL hash, cũng KHÔNG tự bắn PASSWORD_RECOVERY
     cho các link này. Gate vì vậy tự đọc hash NGAY khi file này được nạp
     (trước mọi lần tạo client / getSession), tự setSession bằng
     access_token + refresh_token trong hash, và hiện màn hình "Đặt mật
     khẩu" thay cho cả form đăng nhập lẫn app cho tới khi updateUser
     thành công. Sự kiện PASSWORD_RECOVERY (nếu có ở cấu hình khác) cũng
     được bắt để vào cùng màn hình này. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ROLE_LABEL = { admin: 'Admin', bd: 'BD', mkt: 'MKT', other: 'Khác' };

  /* ---------- Đặt mật khẩu từ link mời / khôi phục ---------- */
  /* Đọc hash MỘT LẦN ngay khi script được nạp — thời điểm sớm nhất phía
     app, trước khi client Supabase được tạo trong init(). Vì client dùng
     detectSessionInUrl:false nên hash sẽ còn nguyên cho tới lúc này. */
  function parseHashParams() {
    const out = {};
    try {
      const raw = (typeof location !== 'undefined' && location.hash) ? String(location.hash).replace(/^#/, '') : '';
      if (!raw) return out;
      raw.split('&').forEach(pair => {
        if (!pair) return;
        const i = pair.indexOf('=');
        const k = i >= 0 ? pair.slice(0, i) : pair;
        const v = i >= 0 ? pair.slice(i + 1) : '';
        try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { out[k] = v; }
      });
    } catch (e) {}
    return out;
  }
  const initialHash = parseHashParams();
  /* type=invite: user được mời, sự kiện auth đi kèm thường chỉ là
     SIGNED_IN nên phải dựa vào hash. type=recovery: khôi phục mật khẩu. */
  let pendingPasswordKind = (initialHash.type === 'invite' || initialHash.type === 'recovery') ? initialHash.type : null;
  let passwordFlowPending = !!pendingPasswordKind;
  let pendingPasswordSession = null;
  let authClient = null;
  /* Link hết hạn/không hợp lệ: Supabase trả về hash dạng
     #error=...&error_code=...&error_description=... thay vì token. */
  const authLinkError = initialHash.error_description || initialHash.error || null;

  function cleanAuthHash() {
    /* Xoá hash (chứa token tạm) khỏi URL mà không tải lại trang. */
    try {
      if (typeof history !== 'undefined' && history && typeof history.replaceState === 'function') {
        const clean = ((typeof location !== 'undefined' && location.pathname) || '') + ((typeof location !== 'undefined' && location.search) || '');
        history.replaceState(null, '', clean || String(location.href || '').split('#')[0]);
        return;
      }
    } catch (e) {}
    try { if (typeof location !== 'undefined' && location.hash) location.hash = ''; } catch (e) {}
  }
  function pageName() {
    const p = (location.pathname || '').split('/').pop() || 'index.html';
    return ['index.html', 'publishing.html', 'mkt.html', 'import.html', ''].includes(p) ? (p || 'index.html') : p;
  }
  function lock() { document.documentElement.classList.add('sava-locked'); }
  function unlock() { document.documentElement.classList.remove('sava-locked'); }
  function setStatus(msg) { const el = $('savaAuthStatus'); if (el) el.textContent = msg || ''; }
  function showCard(which) {
    const login = $('savaLoginCard'), blocked = $('savaBlockedCard'), pwCard = $('savaSetPasswordCard');
    if (login) login.classList.toggle('sava-hidden', which !== 'login');
    if (blocked) blocked.classList.toggle('sava-hidden', which !== 'blocked');
    if (pwCard) pwCard.classList.toggle('sava-hidden', which !== 'password');
  }
  function setPwError(msg) { const el = $('savaSetPasswordError'); if (el) el.textContent = msg || ''; }
  function setPwStatus(msg) { const el = $('savaSetPasswordStatus'); if (el) el.textContent = msg || ''; }
  function viSetPasswordError(err) {
    const m = String((err && err.message) || err || '');
    if (/should be different|same as|new password should/i.test(m)) return 'Mật khẩu mới phải khác mật khẩu cũ. Chọn mật khẩu khác rồi thử lại.';
    if (/at least|weak|pwned|too short|password.*(short|weak)/i.test(m)) return 'Mật khẩu chưa đạt yêu cầu của máy chủ (cần ít nhất 6 ký tự và đủ mạnh). Chọn mật khẩu khác rồi thử lại.';
    if (/session|not logged in|missing|jwt|expired/i.test(m)) return 'Phiên từ liên kết đã hết hạn hoặc không còn hợp lệ. Nhờ quản trị (Zac) gửi lại email mời / khôi phục rồi bấm liên kết mới nhất.';
    if (/network|fetch/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    return 'Đặt mật khẩu thất bại: ' + m;
  }
  function buildSetPasswordCard() {
    /* Dự phòng: trang nào thiếu sẵn thẻ đặt mật khẩu trong HTML (bản cache
       cũ) thì dựng thẻ bằng JS, gắn vào #savaAuthRoot như 2 thẻ còn lại. */
    try {
      const existing = $('savaSetPasswordCard');
      if (existing) return existing;
      const root = $('savaAuthRoot');
      if (!root || typeof root.appendChild !== 'function' || typeof document.createElement !== 'function') return null;
      const card = document.createElement('div');
      card.id = 'savaSetPasswordCard';
      card.className = 'sava-auth-card sava-hidden';
      card.innerHTML =
        '<div class="sava-auth-brand">SAVA <b>META</b> · CRM</div>' +
        '<h1 id="savaSetPasswordTitle">Đặt mật khẩu</h1>' +
        '<p class="sava-auth-sub" id="savaSetPasswordSub"></p>' +
        '<form id="savaSetPasswordForm">' +
        '<label for="savaNewPassword">Mật khẩu mới</label>' +
        '<input id="savaNewPassword" type="password" autocomplete="new-password" required>' +
        '<label for="savaNewPasswordConfirm">Nhập lại mật khẩu</label>' +
        '<input id="savaNewPasswordConfirm" type="password" autocomplete="new-password" required>' +
        '<div class="sava-auth-error" id="savaSetPasswordError" role="alert"></div>' +
        '<button type="submit">Đặt mật khẩu &amp; vào app</button>' +
        '</form>' +
        '<p class="sava-auth-status" id="savaSetPasswordStatus"></p>';
      root.appendChild(card);
      bindSetPasswordForm();
      return card;
    } catch (e) { return null; }
  }
  function showSetPassword(kind) {
    passwordFlowPending = true;
    if (kind === 'invite' || kind === 'recovery') pendingPasswordKind = kind;
    lock();
    const card = $('savaSetPasswordCard') || buildSetPasswordCard();
    if (!card) { showCard('login'); return; }
    showCard('password');
    const bar = $('savaUserBar'); if (bar) bar.classList.add('sava-hidden');
    const title = $('savaSetPasswordTitle'), sub = $('savaSetPasswordSub');
    if (pendingPasswordKind === 'recovery') {
      if (title) title.textContent = 'Đặt lại mật khẩu';
      if (sub) sub.textContent = 'Bạn vừa bấm liên kết khôi phục mật khẩu trong email. Đặt mật khẩu mới dưới đây để vào CRM — từ lần sau, đăng nhập bằng mật khẩu mới này.';
    } else {
      if (title) title.textContent = 'Đặt mật khẩu';
      if (sub) sub.textContent = 'Tài khoản của bạn vừa được mời vào CRM Sava Meta. Đặt mật khẩu cho tài khoản dưới đây để hoàn tất — từ lần sau, đăng nhập bằng email của bạn và mật khẩu này.';
    }
    setStatus('');
    const first = $('savaNewPassword');
    if (first && typeof first.focus === 'function') { try { first.focus(); } catch (e) {} }
  }
  let setPwFormBound = false;
  function bindSetPasswordForm() {
    const form = $('savaSetPasswordForm');
    if (!form || setPwFormBound || typeof form.addEventListener !== 'function') return;
    setPwFormBound = true;
    form.addEventListener('submit', onSetPasswordSubmit);
  }
  async function onSetPasswordSubmit(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const client = authClient;
    const pwEl = $('savaNewPassword'), cfEl = $('savaNewPasswordConfirm');
    const pw = pwEl ? (pwEl.value || '') : '';
    const cf = cfEl ? (cfEl.value || '') : '';
    setPwError('');
    /* Validate phía client trước — fail thì KHÔNG gọi updateUser. */
    if (!pw || pw.length < 6) { setPwError('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
    if (pw !== cf) { setPwError('Mật khẩu nhập lại chưa khớp. Kiểm tra lại hai ô rồi thử lại.'); return; }
    if (!client || !client.auth || typeof client.auth.updateUser !== 'function') {
      setPwError('Không kết nối được chức năng đăng nhập. Tải lại trang rồi thử lại.');
      return;
    }
    setPwStatus('Đang đặt mật khẩu…');
    let res = null;
    try { res = await client.auth.updateUser({ password: pw }); }
    catch (err) { setPwStatus(''); setPwError(viSetPasswordError(err)); return; }
    if (res && res.error) { setPwStatus(''); setPwError(viSetPasswordError(res.error)); return; }
    /* Thành công: xoá hash chứa token tạm, rồi chạy luồng gate bình
       thường (phân vai -> nạp dữ liệu -> mở app) bằng phiên hiện có. */
    setPwStatus('');
    cleanAuthHash();
    passwordFlowPending = false;
    setNotice('Đã đặt mật khẩu thành công — chào mừng bạn đến CRM Sava Meta.');
    let session = pendingPasswordSession;
    if (!session) {
      try { const r = await client.auth.getSession(); session = r && r.data ? r.data.session : null; } catch (err2) { session = null; }
    }
    if (!session) { showLogin('Đã đặt mật khẩu xong nhưng chưa lấy được phiên đăng nhập. Đăng nhập bằng mật khẩu vừa đặt để vào app.'); return; }
    proceed(client, session);
  }
  async function establishPasswordSession(client) {
    /* detectSessionInUrl:false -> phải tự nạp phiên từ token trong hash. */
    const at = initialHash.access_token, rt = initialHash.refresh_token;
    if (at && rt && client.auth && typeof client.auth.setSession === 'function') {
      try {
        const res = await client.auth.setSession({ access_token: at, refresh_token: rt });
        if (res && !res.error && res.data && res.data.session) { pendingPasswordSession = res.data.session; return pendingPasswordSession; }
        if (res && res.error) return null;
      } catch (e) { return null; }
    }
    /* Không có token trong hash (vd PASSWORD_RECOVERY ở cấu hình khác):
       dùng phiên đã lưu nếu có. */
    try {
      const r = await client.auth.getSession();
      const s = r && r.data ? r.data.session : null;
      if (s) pendingPasswordSession = s;
      return s;
    } catch (e) { return null; }
  }
  function showBlocked(msg) {
    lock(); showCard('blocked');
    const el = $('savaBlockedMsg'); if (el) el.textContent = msg;
    const bar = $('savaUserBar'); if (bar) bar.classList.add('sava-hidden');
  }
  function showLogin(statusMsg) {
    lock(); showCard('login');
    const bar = $('savaUserBar'); if (bar) bar.classList.add('sava-hidden');
    setStatus(statusMsg || '');
  }
  function viAuthError(err) {
    const m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử đăng nhập lại.';
    if (/email not confirmed/i.test(m)) return 'Tài khoản chưa được xác nhận email. Liên hệ quản trị (Zac) để được hỗ trợ.';
    if (/too many requests|rate limit/i.test(m)) return 'Đăng nhập quá nhiều lần liên tiếp. Đợi ít phút rồi thử lại.';
    if (/network|fetch/i.test(m)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
    return 'Đăng nhập thất bại: ' + m;
  }
  function setNotice(msg) { try { sessionStorage.setItem('sava_notice', msg); } catch (e) {} }
  function takeNotice() {
    try { const n = sessionStorage.getItem('sava_notice'); if (n) sessionStorage.removeItem('sava_notice'); return n; } catch (e) { return null; }
    return null;
  }
  function showNotice(msg) {
    if (!msg) return;
    /* Thông báo là phụ trợ — bất kỳ lỗi DOM nào ở đây cũng không được
       phép làm hỏng luồng vào app phía sau. */
    try {
      const el = document.createElement('div');
      if (typeof el.setAttribute === 'function') el.setAttribute('role', 'status');
      if (el.style) el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:9998;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:92vw;text-align:center';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch (e) {} }, 5000);
    } catch (e) {}
  }

  /* ---------- Quản trị tài khoản thành viên (chỉ Admin) ----------
     Mọi thao tác máy chủ (mời/gửi lại/thu hồi tài khoản) đi qua ĐÚNG MỘT
     helper callMemberAdmin() gọi Edge Function `invite-member` bằng JWT
     của phiên hiện tại — không rải fetch ra các trang. Function tự kiểm
     tra vai Admin ở phía server (lớp chặn chính); UI chỉ ẩn/hiện theo
     currentUser() để đúng trải nghiệm.
     accountStatusFor(): ánh xạ trạng thái hiển thị ở view Thành viên —
     có dữ kiện từ function (list_status) thì dùng trạng thái thật
     (active/invited/none); function chưa deploy/không gọi được thì rơi
     về trạng thái suy từ profiles (đã gắn / chưa có tài khoản). */
  let currentIdentity = null;
  const MEMBER_FN_PATH = '/functions/v1/invite-member';
  function memberAdminClient() {
    if (authClient) return authClient;
    try { return typeof window !== 'undefined' && typeof window.savaSupabase === 'function' ? window.savaSupabase() : null; } catch (e) { return null; }
  }
  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()); }
  function accountStatusFor(hasProfile, fnEntry) {
    if (fnEntry) {
      if (fnEntry.status === 'active') return { key: 'active', label: 'Đã có tài khoản' };
      if (fnEntry.status === 'invited') return { key: 'invited', label: 'Đã mời – chờ đặt mật khẩu' };
      return { key: 'none', label: 'Chưa có tài khoản' };
    }
    return hasProfile
      ? { key: 'linked', label: 'Đã gắn tài khoản' }
      : { key: 'none', label: 'Chưa có tài khoản' };
  }
  async function callMemberAdmin(payload) {
    const client = memberAdminClient();
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      throw new Error('Chưa sẵn sàng kết nối đăng nhập. Tải lại trang rồi thử lại.');
    }
    let session = null;
    try { const r = await client.auth.getSession(); session = r && r.data ? r.data.session : null; } catch (e) { session = null; }
    if (!session || !session.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử.');
    const cfg = (typeof window !== 'undefined' && window.SavaSupabaseConfig) || null;
    const baseUrl = (cfg && cfg.SUPABASE_URL) || (typeof window !== 'undefined' && window.SAVA_SUPABASE_URL) || '';
    const anonKey = (cfg && cfg.SUPABASE_ANON_KEY) || (typeof window !== 'undefined' && window.SAVA_SUPABASE_ANON_KEY) || '';
    if (!baseUrl) throw new Error('Thiếu cấu hình máy chủ Supabase.');
    if (typeof fetch !== 'function') throw new Error('Trình duyệt không hỗ trợ gọi máy chủ (fetch).');
    let res;
    try {
      res = await fetch(baseUrl + MEMBER_FN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': anonKey },
        body: JSON.stringify(payload || {}),
      });
    } catch (e) {
      throw new Error('Không kết nối được chức năng quản lý tài khoản trên máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 404) {
      const notDeployed = new Error('Chức năng quản lý tài khoản trên máy chủ chưa được triển khai (thiếu Edge Function invite-member).');
      notDeployed.status = 404;
      throw notDeployed;
    }
    if (!res.ok || !data || data.ok !== true) {
      const err = new Error(data && data.error ? String(data.error) : ('Máy chủ trả lỗi ' + res.status + '. Thử lại sau.'));
      err.status = res.status;
      if (data) err.data = data;
      throw err;
    }
    return data;
  }
  async function fetchMemberProfiles() {
    const client = memberAdminClient();
    if (!client || typeof client.from !== 'function') throw new Error('Chưa sẵn sàng kết nối dữ liệu.');
    const { data, error } = await client.from('profiles').select('id,member_id,email');
    if (error) throw new Error(error.message || 'Không đọc được hồ sơ tài khoản.');
    const map = {};
    (data || []).forEach(p => { if (p && p.member_id && !map[p.member_id]) map[p.member_id] = p; });
    return map;
  }

  let booted = false;
  async function init() {
    const client = typeof window.savaSupabase === 'function' ? window.savaSupabase() : null;
    if (!client) {
      showLogin('Không tải được thư viện đăng nhập (kiểm tra kết nối mạng) — tải lại trang để thử lại.');
      return;
    }
    authClient = client;
    client.auth.onAuthStateChange((event, eventSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        /* Khôi phục mật khẩu: chặn vào app, bắt đặt mật khẩu mới trước. */
        passwordFlowPending = true;
        pendingPasswordKind = 'recovery';
        if (eventSession) pendingPasswordSession = eventSession;
        booted = false;
        showSetPassword('recovery');
        return;
      }
      if (event === 'SIGNED_IN' && passwordFlowPending) {
        /* Invite thường chỉ bắn SIGNED_IN (kèm hash type=invite đã bắt ở
           trên) — giữ nguyên màn hình đặt mật khẩu, chỉ lưu lại phiên. */
        if (eventSession) pendingPasswordSession = eventSession;
        return;
      }
      if (event === 'SIGNED_OUT' && booted) { booted = false; currentIdentity = null; showLogin('Phiên đăng nhập đã hết hoặc bạn đã đăng xuất. Đăng nhập lại để tiếp tục.'); }
    });
    const doLogout = async () => {
      try { await client.auth.signOut(); } catch (e) {}
      try { sessionStorage.removeItem('sava_boot_hash'); } catch (e) {}
      booted = false;
      showLogin('Đã đăng xuất.');
    };
    const logoutBtn = $('savaLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    const blockedLogoutBtn = $('savaBlockedLogout');
    if (blockedLogoutBtn) blockedLogoutBtn.addEventListener('click', doLogout);
    const form = $('savaLoginForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = ($('savaEmail').value || '').trim();
      const password = $('savaPassword').value || '';
      const errEl = $('savaLoginError');
      if (errEl) errEl.textContent = '';
      setStatus('Đang đăng nhập…');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) { setStatus(''); if (errEl) errEl.textContent = viAuthError(error); return; }
      if (data && data.session) proceed(client, data.session);
    });
    bindSetPasswordForm();

    /* Link mời / khôi phục: vào thẳng màn hình đặt mật khẩu, không qua
       form đăng nhập, không vào app cho tới khi đặt mật khẩu xong. */
    if (passwordFlowPending) {
      showSetPassword(pendingPasswordKind);
      setPwStatus('Đang xác thực liên kết…');
      const pwSession = await establishPasswordSession(client);
      if (pwSession) setPwStatus('Liên kết hợp lệ — đặt mật khẩu để vào app.');
      else {
        setPwStatus('');
        setPwError('Liên kết đặt mật khẩu đã hết hạn hoặc không hợp lệ, hoặc phiên tạm đã mất. Nhờ quản trị (Zac) gửi lại email mời / khôi phục rồi bấm liên kết mới nhất trong email.');
      }
      return;
    }
    if (authLinkError) {
      showLogin('Liên kết đăng nhập đã hết hạn hoặc không hợp lệ. Nhờ quản trị (Zac) gửi lại email mời / khôi phục rồi bấm liên kết mới nhất trong email.');
      return;
    }

    setStatus('Đang kiểm tra phiên đăng nhập…');
    let session = null;
    try {
      const res = await client.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (e) { session = null; }
    if (passwordFlowPending) {
      /* PASSWORD_RECOVERY tới trong lúc đang kiểm tra phiên thường. */
      if (session) pendingPasswordSession = session;
      showSetPassword(pendingPasswordKind || 'recovery');
      return;
    }
    if (!session) { showLogin(''); return; }
    proceed(client, session);
  }

  async function proceed(client, session) {
    if (passwordFlowPending) { showSetPassword(pendingPasswordKind); return; }
    if (booted) return;
    booted = true;
    setStatus('Đã đăng nhập — đang kiểm tra quyền…');
    showCard('login');
    let profile = null, member = null;
    try {
      const pr = await client.from('profiles').select('id,member_id,email').eq('id', session.user.id).maybeSingle();
      if (pr.error) throw pr.error;
      profile = pr.data;
      if (profile && profile.member_id) {
        const mr = await client.from('members').select('id,name,role,active').eq('id', profile.member_id).maybeSingle();
        if (mr.error) throw mr.error;
        member = mr.data;
      }
    } catch (e) {
      showBlocked('Không đọc được thông tin phân quyền từ máy chủ (' + (e.message || e) + '). Thử tải lại trang; nếu vẫn lỗi, liên hệ quản trị.');
      return;
    }
    if (!profile || !member) {
      showBlocked('Tài khoản này chưa được gắn với thành viên nào trong CRM nên chưa xem được dữ liệu. Liên hệ quản trị (Zac) để được gắn tài khoản với đúng thành viên rồi đăng nhập lại.');
      return;
    }
    if (!member.active) {
      showBlocked('Tài khoản của ' + member.name + ' đã bị ngừng hoạt động trong CRM nên không còn quyền truy cập dữ liệu. Liên hệ quản trị (Zac) nếu cần mở lại.');
      return;
    }
    const role = member.role === 'Admin' ? 'admin' : member.role === 'BD' ? 'bd' : member.role === 'MKT' ? 'mkt' : 'other';
    currentIdentity = { memberId: member.id, name: member.name, role, memberRole: member.role, email: profile.email || (session.user && session.user.email) || '' };
    const page = pageName();
    /* Điều hướng theo vai */
    if (role === 'mkt' && page !== 'mkt.html') {
      setNotice('Tài khoản Marketing chỉ dùng trang Marketing — đã chuyển bạn về đúng trang.');
      location.replace('mkt.html');
      return;
    }
    if ((role === 'bd' || role === 'admin' || role === 'other') && page === 'mkt.html') {
      setNotice('Trang Marketing chỉ dành cho tài khoản MKT — đã chuyển bạn về trang BD.');
      location.replace('index.html');
      return;
    }
    if (page === 'import.html' && role !== 'admin') {
      showBlocked('Công cụ nạp dữ liệu chỉ dành cho Admin. Tài khoản của bạn (' + (ROLE_LABEL[role] || role) + ') không dùng được trang này.');
      return;
    }

    /* Nạp dữ liệu Supabase vào cache rồi mới mở app */
    const userBar = $('savaUserBar'), info = $('savaUserInfo');
    if (info) info.textContent = member.name + ' · ' + (ROLE_LABEL[role] || member.role) + (page === 'import.html' ? ' · Công cụ nạp dữ liệu' : '');
    if (window.SavaData && typeof window.SavaData.attach === 'function') {
      window.SavaData.attach(client, role);
      window.SavaData.installHook();
      setStatus('Đang tải dữ liệu từ Supabase…');
      try {
        const { hash } = await window.SavaData.loadAll();
        let prevHash = null;
        try { prevHash = sessionStorage.getItem('sava_boot_hash'); } catch (e) {}
        if (page !== 'import.html' && prevHash !== hash) {
          try { sessionStorage.setItem('sava_boot_hash', hash); } catch (e) {}
          location.reload();
          return;
        }
        window.SavaData.setEnabled(true);
      } catch (e) {
        /* Offline / lỗi nạp: mở app từ cache trên máy, TẮT đồng bộ ghi
           (chưa có snapshot server thì không đẩy gì lên). */
        window.SavaData.setEnabled(false);
        unlock();
        if (userBar) userBar.classList.remove('sava-hidden');
        showNotice('Không tải được dữ liệu mới nhất từ Supabase (' + (e.message || e) + '). Đang hiển thị dữ liệu đã lưu trên máy này; thay đổi lúc này CHƯA được đồng bộ lên máy chủ.');
        return;
      }
    }
    unlock();
    showCard('none');
    if (userBar) userBar.classList.remove('sava-hidden');
    showNotice(takeNotice());
    if (typeof window.__savaOnReady === 'function') { try { window.__savaOnReady({ member, role }); } catch (e) {} }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  if (typeof window !== 'undefined') window.SavaAuth = { _proceed: proceed, _showLogin: showLogin, _showBlocked: showBlocked, _showSetPassword: showSetPassword, _cleanAuthHash: cleanAuthHash, _passwordFlowPending: () => passwordFlowPending, _pendingPasswordKind: () => pendingPasswordKind, currentUser: () => (currentIdentity ? { ...currentIdentity } : null), callMemberAdmin, fetchMemberProfiles, accountStatusFor, isValidEmail };
})();
