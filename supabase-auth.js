/* Sava Meta CRM — Cổng đăng nhập + phân quyền theo vai (Giai đoạn 2b).
   - Cả 3 trang (index / publishing / mkt) đều nạp file này. <html> mang
     class 'sava-locked' ngay từ đầu (auth.css ẩn toàn bộ app, chỉ hiện
     #savaAuthRoot) cho tới khi phiên đăng nhập + dữ liệu Supabase sẵn sàng.
   - NGOẠI LỆ boot mở-nhanh (xem khối "Boot nhanh" dưới đây): nếu máy đã
     có phiên còn hạn + cache đã từng đồng bộ từ máy chủ cho đúng user +
     danh tính đã kiểm chứng khớp vai–trang, khoá được gỡ NGAY khi file
     này nạp (trước khung hình đầu tiên) và kiểm chứng + tải dữ liệu
     chuyển sang chạy NGẦM, cập nhật giao diện tại chỗ, không reload.
     Thiếu một điều kiện bất kỳ -> cổng đầy đủ như cũ.
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
     Nếu loadAll vừa thay nội dung cache (cache cũ khác dữ liệu máy chủ
     theo nội dung) VÀ phiên này chưa từng nạp lại trang cho đúng phiên
     bản dữ liệu đó (hash) -> nạp lại trang đúng 1 lần để app render từ
     dữ liệu máy chủ và loại bỏ hẳn state cũ còn trong bộ nhớ (đường hồi
     sinh dữ liệu mẫu/test duy nhất qua save() + diff-sync); các trường
     hợp còn lại (cache đã là dữ liệu máy chủ, hoặc đã nạp lại cho hash
     này rồi) -> mở khoá ngay, không nạp lại nữa. Mất kết nối khi nạp -> mở app bằng cache
     trên máy kèm banner cảnh báo, đồng bộ ghi bị TẮT (tránh đẩy dữ liệu
     cũ lên khi chưa có snapshot từ server).
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
  function lock() {
    document.documentElement.classList.add('sava-locked');
    /* Khoá lại thì bỏ hẳn chế độ mở-nhanh: thẻ auth phải hiện lại được
       (auth.css ẩn các thẻ khi còn class sava-optimistic). */
    try { document.documentElement.classList.remove('sava-optimistic'); } catch (e) {}
  }
  function unlock() { document.documentElement.classList.remove('sava-locked'); }

  /* ---------- Boot nhanh (optimistic unlock) ----------
     Mục tiêu: Back / F5 / chuyển trang KHÔNG hiện cổng chờ toàn màn hình
     nữa khi máy này đã có (a) phiên Supabase còn hạn được lưu trong
     localStorage, (b) cache gương đã từng được đồng bộ từ máy chủ cho
     ĐÚNG user đó (khoá sava_cache_synced_v1 — chỉ ghi sau một lần
     loadAll() thành công ở luồng cổng đầy đủ), và (c) danh tính đã kiểm
     chứng được lưu kèm (sava_identity_cache_v1) khớp vai với trang.
     Đủ 3 điều kiện -> gỡ khoá NGAY khi file này được nạp (script nằm ở
     <head>, trước khi <body> kịp vẽ khung hình đầu tiên) và gắn class
     'sava-optimistic' để auth.css giấu các thẻ đăng nhập/chặn. App render
     từ cache như bình thường; kiểm tra quyền + loadAll() vẫn chạy NGẦM ở
     proceed(): sai lệch thì cập nhật tại chỗ, bị thu hồi thì đăng xuất.
     THIẾU bất kỳ điều kiện nào -> optimisticBoot = null, luồng cổng cũ
     chạy nguyên vẹn (gồm đường reload-1-lần của bản vá vòng lặp).
     An toàn: quyết định mở-nhanh chỉ dựa trên dữ liệu VỐN ĐÃ có trên máy
     người dùng này; RLS/policy không đổi; đồng bộ GHI vẫn chỉ bật sau
     khi loadAll() ngầm thành công (xem proceed). */
  const SYNCED_KEY = 'sava_cache_synced_v1';
  const IDENTITY_KEY = 'sava_identity_cache_v1';
  const CRM_CACHE_KEY = 'sava_crm_shared_v1';
  const PUB_CACHE_KEY = 'sava_publishing_v1';
  function lsGet(k) { try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(k, v); } catch (e) {} }
  function lsRemove(k) { try { if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(k); } catch (e) {} }
  function lsJson(k) {
    const raw = lsGet(k);
    if (!raw) return null;
    try { const v = JSON.parse(raw); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; } catch (e) { return null; }
  }
  function storedSession() {
    /* Phiên do supabase-js lưu (persistSession:true) ở khoá
       sb-<project-ref>-auth-token. Đọc TRỰC TIẾP theo khoá suy từ URL
       cấu hình; dự phòng quét khoá khi localStorage liệt kê được. */
    const keys = [];
    try {
      const url = (typeof window !== 'undefined' && window.SAVA_SUPABASE_URL) || '';
      const m = String(url).match(/^https:\/\/([^.]+)\.supabase\.co/);
      if (m) keys.push('sb-' + m[1] + '-auth-token');
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.key === 'function' && typeof localStorage.length === 'number') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /^sb-.+-auth-token$/.test(k) && keys.indexOf(k) < 0) keys.push(k);
        }
      }
    } catch (e) {}
    for (const k of keys) {
      const v = lsJson(k);
      if (!v) continue;
      const s = v.access_token ? v : (v.currentSession && v.currentSession.access_token ? v.currentSession : null);
      if (s && s.access_token && s.user && s.user.id) return s;
    }
    return null;
  }
  function computeOptimisticBoot() {
    try {
      if (passwordFlowPending || authLinkError) return null;
      const page = pageName();
      if (page === 'import.html') return null; /* công cụ Admin giữ cổng đầy đủ */
      const sess = storedSession();
      if (!sess) return null;
      /* Access token phải CÒN HẠN tại máy này; hết hạn -> cổng cũ (getSession
         có thể tự làm mới rồi proceed bình thường, không mở-nhanh mù). */
      if (!(typeof sess.expires_at === 'number' && sess.expires_at * 1000 > Date.now())) return null;
      const synced = lsJson(SYNCED_KEY);
      if (!synced || synced.userId !== sess.user.id) return null;
      const identity = lsJson(IDENTITY_KEY);
      if (!identity || identity.userId !== sess.user.id || !identity.memberId || !identity.role) return null;
      if (!lsJson(CRM_CACHE_KEY) || !lsJson(PUB_CACHE_KEY)) return null;
      /* Khớp vai–trang như proceed(): lệch vai thì để cổng cũ điều hướng. */
      if (identity.role === 'mkt' && page !== 'mkt.html') return null;
      if ((identity.role === 'bd' || identity.role === 'admin' || identity.role === 'other') && page === 'mkt.html') return null;
      return { userId: sess.user.id, identity };
    } catch (e) { return null; }
  }
  let optimisticBoot = computeOptimisticBoot();
  let optimisticActive = !!optimisticBoot;
  if (optimisticBoot) {
    try { document.documentElement.classList.add('sava-optimistic'); } catch (e) {}
    unlock();
  }
  function persistBootCaches(session, hash) {
    if (session && session.user && session.user.id) {
      lsSet(SYNCED_KEY, JSON.stringify({ userId: session.user.id, hash: hash || null, at: new Date().toISOString() }));
      if (currentIdentity) {
        lsSet(IDENTITY_KEY, JSON.stringify({ userId: session.user.id, memberId: currentIdentity.memberId, name: currentIdentity.name, role: currentIdentity.role, memberRole: currentIdentity.memberRole, email: currentIdentity.email || '' }));
      }
    }
  }
  function clearBootCaches() { lsRemove(SYNCED_KEY); lsRemove(IDENTITY_KEY); }
  function refreshAppInPlace() {
    /* Dữ liệu ngầm mới đã ghi vào cache (loadAll): nhờ trang tự nạp lại
       state trong bộ nhớ + render lại TẠI CHỖ (cả 3 trang đều gắn hook
       __savaOnDataRefreshed). Trang nào thiếu hook thì nhận sự kiện
       'sava:data-refreshed'; tệ nhất dữ liệu mới hiện ở lần chuyển trang
       kế tiếp (vẫn mở-nhanh từ cache) — KHÔNG reload ở đường này. */
    try {
      if (typeof window !== 'undefined' && typeof window.__savaOnDataRefreshed === 'function') { window.__savaOnDataRefreshed(); return; }
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('sava:data-refreshed'));
      }
    } catch (e) {}
  }
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
      if (event === 'SIGNED_OUT' && booted) { booted = false; currentIdentity = null; optimisticActive = false; optimisticBoot = null; clearBootCaches(); showLogin('Phiên đăng nhập đã hết hoặc bạn đã đăng xuất. Đăng nhập lại để tiếp tục.'); }
    });
    const doLogout = async () => {
      try { await client.auth.signOut(); } catch (e) {}
      try { sessionStorage.removeItem('sava_boot_hash'); } catch (e) {}
      booted = false;
      optimisticActive = false; optimisticBoot = null; clearBootCaches();
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

    if (!optimisticActive) setStatus('Đang kiểm tra phiên đăng nhập…');
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
    if (!session) { optimisticActive = false; optimisticBoot = null; clearBootCaches(); showLogin(''); return; }
    proceed(client, session);
  }

  /* Kiểm chứng ngầm (đường mở-nhanh) phát hiện tài khoản bị thu hồi /
     ngừng hoạt động / mất profile: ĐĂNG XUẤT THẬT + xoá mọi dấu vết
     mở-nhanh trên máy + khoá về màn hình đăng nhập kèm lý do. booted
     được hạ TRƯỚC khi signOut để sự kiện SIGNED_OUT không ghi đè
     thông điệp này bằng thông điệp hết phiên chung chung. */
  async function forceSignOutToLogin(client, msg) {
    optimisticActive = false; optimisticBoot = null;
    booted = false;
    currentIdentity = null;
    clearBootCaches();
    try { await client.auth.signOut(); } catch (e) {}
    try { sessionStorage.removeItem('sava_boot_hash'); } catch (e) {}
    showLogin(msg);
  }

  async function proceed(client, session) {
    if (passwordFlowPending) { showSetPassword(pendingPasswordKind); return; }
    if (booted) return;
    booted = true;
    /* Mở-nhanh chỉ áp dụng khi phiên server vừa lấy khớp user đã mở
       khoá lạc quan; lệch user (đăng nhập tài khoản khác) -> cổng cũ. */
    const optimistic = !!(optimisticActive && optimisticBoot && session && session.user && session.user.id === optimisticBoot.userId);
    if (!optimistic) {
      optimisticActive = false;
      setStatus('Đã đăng nhập — đang kiểm tra quyền…');
      showCard('login');
    } else {
      /* App đã hiện từ cache: điền thanh người dùng bằng danh tính đã
         kiểm chứng lưu trên máy, giấu hẳn các thẻ auth. Kiểm chứng
         server bên dưới sẽ thay bằng danh tính thật khi trả về. */
      const ci = optimisticBoot.identity;
      currentIdentity = { memberId: ci.memberId, name: ci.name, role: ci.role, memberRole: ci.memberRole || ci.role, email: ci.email || '' };
      showCard('none');
      const ub = $('savaUserBar'), inf = $('savaUserInfo');
      if (inf) inf.textContent = ci.name + ' · ' + (ROLE_LABEL[ci.role] || ci.memberRole || ci.role);
      if (ub) ub.classList.remove('sava-hidden');
    }
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
      if (optimistic) { await forceSignOutToLogin(client, 'Không đọc được thông tin phân quyền từ máy chủ (' + (e.message || e) + '). Đã đăng xuất để an toàn — đăng nhập lại để tiếp tục.'); return; }
      showBlocked('Không đọc được thông tin phân quyền từ máy chủ (' + (e.message || e) + '). Thử tải lại trang; nếu vẫn lỗi, liên hệ quản trị.');
      return;
    }
    if (!profile || !member) {
      if (optimistic) { await forceSignOutToLogin(client, 'Tài khoản này không còn được gắn với thành viên nào trong CRM nên đã bị đăng xuất. Liên hệ quản trị (Zac) để được gắn lại rồi đăng nhập.'); return; }
      showBlocked('Tài khoản này chưa được gắn với thành viên nào trong CRM nên chưa xem được dữ liệu. Liên hệ quản trị (Zac) để được gắn tài khoản với đúng thành viên rồi đăng nhập lại.');
      return;
    }
    if (!member.active) {
      if (optimistic) { await forceSignOutToLogin(client, 'Tài khoản của ' + member.name + ' đã bị ngừng hoạt động trong CRM nên đã bị đăng xuất. Liên hệ quản trị (Zac) nếu cần mở lại.'); return; }
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

    /* Nạp dữ liệu Supabase vào cache.
       - Đường MỞ-NHANH (optimistic): app đang hiện bằng cache — loadAll
         chạy NGẦM, đồng bộ GHI vẫn TẮT cho tới khi loadAll xong (tính
         chất dfbe2cd/9a68dad giữ nguyên: không gì từ cache bị đẩy lên
         trong cửa sổ này). Xong: dữ liệu không đổi -> không đụng giao
         diện; có đổi -> trang tự render lại tại chỗ qua hook; người
         dùng vừa sửa trong lúc nạp (localDirty) -> bật đồng bộ và đẩy
         diff ngay, không ghi đè bản sửa. KHÔNG reload ở đường này.
       - Đường cổng cũ: nạp xong mới mở app (kèm reload-1-lần bên dưới). */
    const userBar = $('savaUserBar'), info = $('savaUserInfo');
    if (info) info.textContent = member.name + ' · ' + (ROLE_LABEL[role] || member.role) + (page === 'import.html' ? ' · Công cụ nạp dữ liệu' : '');
    if (window.SavaData && typeof window.SavaData.attach === 'function') {
      window.SavaData.attach(client, role);
      window.SavaData.installHook();
      if (!optimistic) setStatus('Đang tải dữ liệu từ Supabase…');
      try {
        const { hash, changed, localDirty } = await window.SavaData.loadAll();
        if (optimistic && page !== 'import.html') {
          try { sessionStorage.setItem('sava_boot_hash', hash); } catch (e) {}
          persistBootCaches(session, hash);
          window.SavaData.setEnabled(true);
          unlock();
          showCard('none');
          if (userBar) userBar.classList.remove('sava-hidden');
          try { document.documentElement.classList.remove('sava-optimistic'); } catch (e) {}
          if (localDirty) {
            if (typeof window.SavaData.scheduleSync === 'function') window.SavaData.scheduleSync(0);
          } else if (changed) {
            refreshAppInPlace();
          }
          showNotice(takeNotice());
          if (typeof window.__savaOnReady === 'function') { try { window.__savaOnReady({ member, role }); } catch (e) {} }
          return;
        }
        let prevHash = null;
        try { prevHash = sessionStorage.getItem('sava_boot_hash'); } catch (e) {}
        /* Tải lại trang TỐI ĐA 1 LẦN cho mỗi phiên bản dữ liệu máy chủ
           (hash), và CHỈ khi loadAll vừa phải THAY nội dung cache
           (changed):
           - changed + chưa từng tải lại cho đúng hash này: chặn cứng
             đường hồi sinh dữ liệu cũ/mẫu — trang đã parse state trong
             bộ nhớ từ cache cũ TRƯỚC khi loadAll ghi đè cache bằng dữ
             liệu máy chủ; nếu mở khoá luôn, lần save() đầu tiên sẽ ghi
             state cũ đó đè lên cache máy chủ và diff-sync đẩy ngược nó
             lên Supabase như dữ liệu mới. Đánh dấu hash TRƯỚC khi tải
             lại, đồng bộ ghi CHƯA được bật ở lần mở này.
           - changed + ĐÃ tải lại cho đúng hash này: state trong bộ nhớ
             của lần mở hiện tại đã được parse từ chính cache máy chủ mà
             lần loadAll trước ghi — phần khác biệt còn lại chỉ là lớp
             migrate của app chạy trên dữ liệu máy chủ, trong bộ nhớ
             không còn bản ghi cũ/mẫu nào để đẩy ngược. Mở khoá và bật
             đồng bộ luôn; tải lại nữa sẽ thành vòng lặp vô hạn (đây
             chính là sự cố 30/10/2026: changed bị tính bằng so chuỗi
             JSON thô nên luôn true dù cache đã là dữ liệu máy chủ).
           - Không changed: bộ nhớ đã là dữ liệu máy chủ — không tải
             lại, kể cả khi hash khác lần mở trước (phiên/tab mới). */
        if (page !== 'import.html' && changed && prevHash !== hash) {
          try { sessionStorage.setItem('sava_boot_hash', hash); } catch (e) {}
          location.reload();
          return;
        }
        try { sessionStorage.setItem('sava_boot_hash', hash); } catch (e) {}
        persistBootCaches(session, hash);
        window.SavaData.setEnabled(true);
      } catch (e) {
        /* Offline / lỗi nạp: mở app từ cache trên máy, TẮT đồng bộ ghi
           (chưa có snapshot server thì không đẩy gì lên). Ở đường
           mở-nhanh app vốn đang hiện bằng cache — giữ nguyên như vậy,
           chỉ tắt ghi + cảnh báo, không khoá lại. */
        window.SavaData.setEnabled(false);
        unlock();
        showCard('none');
        try { document.documentElement.classList.remove('sava-optimistic'); } catch (e) {}
        if (userBar) userBar.classList.remove('sava-hidden');
        showNotice('Không tải được dữ liệu mới nhất từ Supabase (' + (e.message || e) + '). Đang hiển thị dữ liệu đã lưu trên máy này; thay đổi lúc này CHƯA được đồng bộ lên máy chủ.');
        return;
      }
    }
    unlock();
    showCard('none');
    try { document.documentElement.classList.remove('sava-optimistic'); } catch (e) {}
    if (userBar) userBar.classList.remove('sava-hidden');
    showNotice(takeNotice());
    if (typeof window.__savaOnReady === 'function') { try { window.__savaOnReady({ member, role }); } catch (e) {} }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  if (typeof window !== 'undefined') window.SavaAuth = { _proceed: proceed, _showLogin: showLogin, _showBlocked: showBlocked, _showSetPassword: showSetPassword, _cleanAuthHash: cleanAuthHash, _passwordFlowPending: () => passwordFlowPending, _pendingPasswordKind: () => pendingPasswordKind, _optimisticBoot: () => (optimisticBoot ? { userId: optimisticBoot.userId, identity: { ...optimisticBoot.identity } } : null), _refreshAppInPlace: refreshAppInPlace, currentUser: () => (currentIdentity ? { ...currentIdentity } : null), callMemberAdmin, fetchMemberProfiles, accountStatusFor, isValidEmail };
})();
