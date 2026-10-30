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
   - Sau đăng nhập, #savaUserBar hiện tên + vai + nút Đăng xuất ở cả 3 trang. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ROLE_LABEL = { admin: 'Admin', bd: 'BD', mkt: 'MKT', other: 'Khác' };
  function pageName() {
    const p = (location.pathname || '').split('/').pop() || 'index.html';
    return ['index.html', 'publishing.html', 'mkt.html', 'import.html', ''].includes(p) ? (p || 'index.html') : p;
  }
  function lock() { document.documentElement.classList.add('sava-locked'); }
  function unlock() { document.documentElement.classList.remove('sava-locked'); }
  function setStatus(msg) { const el = $('savaAuthStatus'); if (el) el.textContent = msg || ''; }
  function showCard(which) {
    const login = $('savaLoginCard'), blocked = $('savaBlockedCard');
    if (login) login.classList.toggle('sava-hidden', which !== 'login');
    if (blocked) blocked.classList.toggle('sava-hidden', which !== 'blocked');
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
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:9998;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:92vw;text-align:center';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 5000);
  }

  let booted = false;
  async function init() {
    const client = typeof window.savaSupabase === 'function' ? window.savaSupabase() : null;
    if (!client) {
      showLogin('Không tải được thư viện đăng nhập (kiểm tra kết nối mạng) — tải lại trang để thử lại.');
      return;
    }
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && booted) { booted = false; showLogin('Phiên đăng nhập đã hết hoặc bạn đã đăng xuất. Đăng nhập lại để tiếp tục.'); }
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

    setStatus('Đang kiểm tra phiên đăng nhập…');
    let session = null;
    try {
      const res = await client.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (e) { session = null; }
    if (!session) { showLogin(''); return; }
    proceed(client, session);
  }

  async function proceed(client, session) {
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
  if (typeof window !== 'undefined') window.SavaAuth = { _proceed: proceed, _showLogin: showLogin, _showBlocked: showBlocked };
})();
