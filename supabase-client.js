/* Sava Meta CRM — cấu hình Supabase phía frontend (Giai đoạn 2b).
   CHỈ chứa Project URL + anon key: đây là khoá CÔNG KHAI theo thiết kế của
   Supabase — nó chỉ mở được những gì RLS (supabase/policies.sql) cho phép
   theo JWT của người dùng đang đăng nhập. TUYỆT ĐỐI không đặt service_role
   hay bất kỳ khoá bí mật nào vào file này / frontend. */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://vaegwvawlwpckfkmjzsj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZWd3dmF3bHdwY2tma21qenNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzgxODEsImV4cCI6MjEwODkxNDE4MX0.9tjRnw5OyyA2Z9C6GZkt7HX_cgqvcSbndhYT7iNng7M';
  var client = null;
  /* Tạo (một lần) supabase client từ thư viện UMD @supabase/supabase-js@2
     (global `supabase.createClient`). Trả null nếu thư viện chưa tải được
     (mất mạng/CDN lỗi) để tầng auth hiển thị lỗi tử tế thay vì sập trang. */
  function savaSupabase() {
    if (client) return client;
    try {
      var lib = (typeof window !== 'undefined' && window.supabase) || (typeof globalThis !== 'undefined' && globalThis.supabase) || null;
      if (!lib || typeof lib.createClient !== 'function') return null;
      client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      return client;
    } catch (e) { return null; }
  }
  var api = { SUPABASE_URL: SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_ANON_KEY, savaSupabase: savaSupabase };
  if (typeof window !== 'undefined') { window.SAVA_SUPABASE_URL = SUPABASE_URL; window.SAVA_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY; window.savaSupabase = savaSupabase; window.SavaSupabaseConfig = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
