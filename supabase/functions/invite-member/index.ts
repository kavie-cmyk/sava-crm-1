// Sava Meta CRM — Edge Function `invite-member` (quản trị tài khoản thành viên).
//
// CHỈ Admin (members.role='Admin' VÀ members.active=true, suy ra qua
// profiles -> members từ JWT của người gọi) mới dùng được. Mọi thao tác
// cần quyền máy chủ (mời user, ban user, đọc auth.users) chạy bằng
// service_role key lấy từ biến môi trường Supabase TỰ CẤP cho Edge
// Function (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).
// TUYỆT ĐỐI không hardcode key nào vào file này.
//
// verify_jwt: BẬT (mặc định của Supabase + khai báo tường minh trong
// supabase/config.toml — xem README.md cùng thư mục). Kể cả khi gateway
// đã kiểm JWT, function vẫn tự resolve user + vai Admin ở tầng code
// (lớp chặn chính là kiểm tra role/active ở đây + RLS ở DB).
//
// Actions (POST JSON {action, ...}):
//   invite     {email, member_id}  -> gắn tài khoản cho member có sẵn
//              {email, name, role} -> tạo member mới rồi mời
//   resend     {member_id}         -> gửi lại email đặt mật khẩu cho user
//                                     đang chờ (qua luồng khôi phục —
//                                     xem ghi chú ở handler)
//   revoke     {member_id}         -> members.active=false + BAN user
//                                     (ban_duration '876000h' ≈ 100 năm)
//   unrevoke   {member_id}         -> members.active=true + gỡ ban
//   list_status {}                 -> map member_id -> trạng thái tài khoản
//
// Quy ước response: thành công {ok:true, ...}; lỗi {error:'...'} với
// HTTP status đúng (400 input sai, 401 chưa/không xác thực được JWT,
// 403 không phải Admin đang hoạt động, 404 không tìm thấy, 409 trùng,
// 405 sai method, 500 lỗi server). Message lỗi bằng tiếng Việt để UI
// hiển thị trực tiếp.

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "jsr:@supabase/supabase-js@2";

const APP_URL = "https://kavie-cmyk.github.io/sava-crm-1/";
const ALLOWED_ORIGINS = [
  "https://kavie-cmyk.github.io",
  // Dev local (chỉ tiện khi tự chạy thử — production chỉ dùng origin trên):
  "http://localhost:8000",
  "http://localhost:3000",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:3000",
];
const ROLES = ["Admin", "BD", "MKT", "Khác"];
const BAN_DURATION = "876000h"; // ≈ 100 năm — ban "vĩnh viễn" thực tế; gỡ bằng unrevoke (ban_duration 'none')

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
const fail = (req: Request, status: number, message: string, extra: Record<string, unknown> = {}) =>
  json(req, { error: message, ...extra }, status);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/* Sinh id member mới theo đúng quy ước app (shared.js/index.html):
   slug không dấu của tên (vd "Nguyễn An" -> "nguyenan"); tên toàn ký tự
   đặc biệt -> "u" + timestamp base36 như saveMember() phía frontend.
   Tính duy nhất kiểm tra ở DB (vòng lặp thêm "x" như frontend). */
function memberIdBase(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return slug || ("u" + Date.now().toString(36));
}

/* Trạng thái tài khoản suy từ dữ kiện THẬT của GoTrue (auth.users):
   - User do inviteUserByEmail tạo có invited_at được đặt và
     email_confirmed_at = null cho tới khi họ bấm link mời + đặt mật
     khẩu (GoTrue xác nhận email khi link mời được chấp nhận).
   - Vì vậy: email_confirmed_at có giá trị -> 'active' (đã vào được app);
     chưa có -> 'invited' (đã mời, chờ đặt mật khẩu).
   last_sign_in_at chỉ dùng làm thông tin phụ, KHÔNG quyết định trạng thái
   (user có thể đã xác nhận email nhưng phiên đăng nhập bị ghi nhận trễ). */
function userStatus(u: User | null | undefined): "invited" | "active" {
  return u && u.email_confirmed_at ? "active" : "invited";
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  // Team nhỏ (vài người) — quét tối đa 10 trang x 100 user là thừa đủ;
  // dừng ngay khi thấy. listUsers là API admin chính thức để tra email
  // (không có endpoint tra trực tiếp theo email).
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Không đọc được danh sách tài khoản Auth: " + error.message);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 100) break;
  }
  return null;
}

async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Không đọc được danh sách tài khoản Auth: " + error.message);
    const users = data?.users || [];
    all.push(...users);
    if (users.length < 100) break;
  }
  return all;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return fail(req, 405, "Chỉ hỗ trợ POST.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return fail(req, 500, "Máy chủ chưa cấu hình đủ biến môi trường Supabase.");
  }

  /* --- Xác thực người gọi: JWT -> auth user -> profiles -> members --- */
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ") || authHeader.length <= 8) {
    return fail(req, 401, "Thiếu mã đăng nhập (JWT). Hãy đăng nhập CRM rồi thử lại.");
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return fail(req, 401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Đăng nhập lại rồi thử.");
  }
  const caller = userData.user;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile, error: profErr } = await admin
    .from("profiles")
    .select("id,member_id,email")
    .eq("id", caller.id)
    .maybeSingle();
  if (profErr) return fail(req, 500, "Không đọc được hồ sơ người gọi: " + profErr.message);
  if (!callerProfile) return fail(req, 403, "Tài khoản chưa được gắn với thành viên nào trong CRM.");
  const { data: callerMember, error: memErr } = await admin
    .from("members")
    .select("id,name,role,active")
    .eq("id", callerProfile.member_id)
    .maybeSingle();
  if (memErr) return fail(req, 500, "Không đọc được thông tin thành viên: " + memErr.message);
  if (!callerMember || callerMember.role !== "Admin" || callerMember.active !== true) {
    return fail(req, 403, "Chỉ Admin đang hoạt động mới quản lý được tài khoản thành viên.");
  }

  /* --- Đọc body --- */
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "Nội dung gửi lên không phải JSON hợp lệ.");
  }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    /* ================= invite ================= */
    if (action === "invite") {
      const email = cleanEmail(body.email);
      if (!EMAIL_RE.test(email)) return fail(req, 400, "Email không đúng định dạng.");
      const memberIdIn = typeof body.member_id === "string" ? body.member_id.trim() : "";
      const nameIn = typeof body.name === "string" ? body.name.trim() : "";
      const roleIn = typeof body.role === "string" ? body.role.trim() : "";

      let member: { id: string; name: string; role: string; active: boolean } | null = null;
      let createdMember = false;

      if (memberIdIn) {
        const { data, error } = await admin.from("members").select("id,name,role,active").eq("id", memberIdIn).maybeSingle();
        if (error) return fail(req, 500, "Không đọc được thành viên: " + error.message);
        if (!data) return fail(req, 404, "Không tìm thấy thành viên cần gắn tài khoản.");
        member = data;
      } else if (nameIn && roleIn) {
        if (!ROLES.includes(roleIn)) return fail(req, 400, "Vai trò không hợp lệ (chỉ Admin / BD / MKT / Khác).");
        // Tạo member TRƯỚC: profiles.member_id có FK -> members.id, nên
        // member phải tồn tại trước khi gắn profile. Nếu bước mời sau đó
        // lỗi, member vẫn còn (chưa có tài khoản) — Admin mời lại bằng
        // chế độ "thành viên có sẵn", không mất dữ liệu, không trùng lặp.
        let nid = memberIdBase(nameIn);
        for (let i = 0; i < 50; i++) {
          const { data: clash } = await admin.from("members").select("id").eq("id", nid).maybeSingle();
          if (!clash) break;
          nid += "x";
        }
        const { data, error } = await admin
          .from("members")
          .insert({ id: nid, name: nameIn, role: roleIn, active: true })
          .select("id,name,role,active")
          .single();
        if (error) return fail(req, 500, "Không tạo được thành viên mới: " + error.message);
        member = data;
        createdMember = true;
      } else {
        return fail(req, 400, "Thiếu thông tin: cần member_id (thành viên có sẵn) hoặc name + role (thành viên mới).");
      }
      if (!member) return fail(req, 500, "Không xác định được thành viên.");

      // Member đã gắn tài khoản của user khác?
      const { data: linked, error: linkErr } = await admin
        .from("profiles")
        .select("id,member_id,email")
        .eq("member_id", member.id);
      if (linkErr) return fail(req, 500, "Không kiểm tra được hồ sơ tài khoản: " + linkErr.message);
      if (linked && linked.length) {
        return fail(req, 409, "Thành viên " + member.name + " đã có tài khoản (" + (linked[0].email || "đã gắn") + "). Muốn mời lại hãy dùng nút Gửi lại lời mời.");
      }

      // Email đã tồn tại trong Auth?
      const existing = await findUserByEmail(admin, email);
      if (existing) {
        return fail(req, 409, "Email " + email + " đã có tài khoản trong hệ thống. Nếu đó là tài khoản của chính thành viên này, dùng nút Gửi lại lời mời; nếu gắn nhầm người, kiểm tra lại danh sách tài khoản.");
      }

      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: APP_URL,
        data: { member_id: member.id },
      });
      if (invErr || !invited?.user) {
        const msg = invErr?.message || "không rõ lỗi";
        if (/already|registered|exists/i.test(msg)) {
          return fail(req, 409, "Email " + email + " đã được đăng ký trong hệ thống Auth.", { member_created: createdMember, member_id: member.id });
        }
        return fail(req, 500, "Gửi lời mời thất bại: " + msg, { member_created: createdMember, member_id: member.id });
      }
      const newUser = invited.user;

      const { error: upErr } = await admin
        .from("profiles")
        .upsert({ id: newUser.id, member_id: member.id, email }, { onConflict: "id" });
      if (upErr) {
        // KHÔNG nuốt lỗi: user + email mời ĐÃ được tạo/gửi, chỉ còn thiếu
        // dòng profiles. Trả rõ trạng thái để Admin xử lý (gắn profile
        // bằng SQL theo BOOTSTRAP.md hoặc liên hệ kỹ thuật).
        return fail(req, 500,
          "Đã tạo tài khoản và gửi email mời cho " + email + ", nhưng gắn hồ sơ (profiles) thất bại: " + upErr.message +
          " — Tài khoản đã tồn tại trên hệ thống; hãy gắn profiles cho user này (member_id=" + member.id + ") rồi mới dùng được.",
          { partial: true, user_id: newUser.id, member_id: member.id, member_created: createdMember });
      }

      return json(req, {
        ok: true,
        member_id: member.id,
        member_created: createdMember,
        user_id: newUser.id,
        email,
        message: "Đã gửi email mời tới " + email + ". Người được mời bấm liên kết trong email để đặt mật khẩu và vào CRM.",
      });
    }

    /* ================= resend ================= */
    if (action === "resend") {
      const memberId = typeof body.member_id === "string" ? body.member_id.trim() : "";
      if (!memberId) return fail(req, 400, "Thiếu member_id.");
      const { data: profile, error: pErr } = await admin
        .from("profiles")
        .select("id,member_id,email")
        .eq("member_id", memberId)
        .limit(1)
        .maybeSingle();
      if (pErr) return fail(req, 500, "Không đọc được hồ sơ tài khoản: " + pErr.message);
      if (!profile) return fail(req, 400, "Thành viên này chưa có tài khoản — hãy dùng Mời thành viên trước.");
      const { data: got, error: gErr } = await admin.auth.admin.getUserById(profile.id);
      if (gErr || !got?.user) return fail(req, 404, "Không tìm thấy tài khoản Auth gắn với thành viên này.");
      const user = got.user;
      if (userStatus(user) === "active") {
        return json(req, {
          ok: true, resent: false, member_id: memberId, email: profile.email || user.email || "",
          message: "Tài khoản đã được kích hoạt (đã đặt mật khẩu) — không cần gửi lại lời mời. Nếu người này quên mật khẩu, họ dùng luồng khôi phục mật khẩu.",
        });
      }
      // User đang chờ: Supabase Auth KHÔNG có API "gửi lại thư mời" cho
      // invite đang pending (inviteUserByEmail lần 2 với email đã tồn
      // tại sẽ lỗi trùng). Cơ chế đúng và an toàn nhất: gửi email KHÔI
      // PHỤC mật khẩu (resetPasswordForEmail) về đúng app — người nhận
      // bấm link (type=recovery) -> app hiện màn hình Đặt mật khẩu (luồng
      // đã có sẵn trong supabase-auth.js) -> đặt mật khẩu là vào được.
      // Không xoá/tạo lại user nên id + profiles giữ nguyên.
      const email = (profile.email || user.email || "").toLowerCase();
      if (!email) return fail(req, 500, "Tài khoản không có email để gửi lại.");
      const { error: rErr } = await userClient.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
      if (rErr) return fail(req, 500, "Gửi lại email thất bại: " + rErr.message);
      return json(req, {
        ok: true, resent: true, via: "recovery_email", member_id: memberId, email,
        message: "Đã gửi lại email đặt mật khẩu tới " + email + ". Người nhận bấm liên kết mới nhất trong email để đặt mật khẩu.",
      });
    }

    /* ================= revoke / unrevoke ================= */
    if (action === "revoke" || action === "unrevoke") {
      const memberId = typeof body.member_id === "string" ? body.member_id.trim() : "";
      if (!memberId) return fail(req, 400, "Thiếu member_id.");
      if (memberId === callerProfile.member_id) {
        return fail(req, 400, action === "revoke"
          ? "Không thể thu hồi quyền của chính bạn — hãy nhờ một Admin khác, tránh tự khoá quyền quản trị."
          : "Tài khoản của chính bạn không cần kích hoạt lại từ đây.");
      }
      const { data: member, error: mErr } = await admin.from("members").select("id,name,role,active").eq("id", memberId).maybeSingle();
      if (mErr) return fail(req, 500, "Không đọc được thành viên: " + mErr.message);
      if (!member) return fail(req, 404, "Không tìm thấy thành viên.");
      const targetActive = action === "unrevoke";

      // Chốt chặn CHÍNH là members.active=false (mọi RLS policy đều qua
      // is_active_member()/has_crm_role()). Ban Auth là lớp cộng thêm để
      // chặn cả đăng nhập. Thứ tự: đổi active TRƯỚC (chặn dữ liệu ngay),
      // ban/unban sau; lỗi bước sau được báo rõ kèm trạng thái đã đổi.
      const { error: uErr } = await admin.from("members").update({ active: targetActive }).eq("id", memberId);
      if (uErr) return fail(req, 500, "Không đổi được trạng thái hoạt động của thành viên: " + uErr.message);

      const { data: profile } = await admin
        .from("profiles")
        .select("id,member_id,email")
        .eq("member_id", memberId)
        .limit(1)
        .maybeSingle();
      let banned: boolean | null = null;
      if (profile) {
        const { error: bErr } = await admin.auth.admin.updateUserById(profile.id, {
          ban_duration: targetActive ? "none" : BAN_DURATION,
        });
        if (bErr) {
          return fail(req, 500,
            "Đã " + (targetActive ? "kích hoạt lại" : "ngừng hoạt động") + " thành viên " + member.name + " trong CRM (quyền dữ liệu đã đổi ngay), nhưng " +
            (targetActive ? "gỡ khoá đăng nhập" : "khoá đăng nhập") + " thất bại: " + bErr.message + " — thử lại thao tác này.",
            { partial: true, member_id: memberId, active: targetActive });
        }
        banned = !targetActive;
      }
      return json(req, {
        ok: true, member_id: memberId, active: targetActive, banned,
        message: targetActive
          ? "Đã kích hoạt lại " + member.name + (profile ? " và gỡ khoá đăng nhập." : " (thành viên chưa có tài khoản).")
          : "Đã thu hồi quyền của " + member.name + ": ngừng hoạt động trong CRM" + (profile ? " và khoá đăng nhập." : " (thành viên chưa có tài khoản)."),
      });
    }

    /* ================= list_status ================= */
    if (action === "list_status") {
      const [{ data: members, error: mErr }, { data: profiles, error: pErr }, users] = await Promise.all([
        admin.from("members").select("id"),
        admin.from("profiles").select("id,member_id,email"),
        listAllUsers(admin),
      ]);
      if (mErr) return fail(req, 500, "Không đọc được danh sách thành viên: " + mErr.message);
      if (pErr) return fail(req, 500, "Không đọc được hồ sơ tài khoản: " + pErr.message);
      const userById = new Map(users.map((u) => [u.id, u]));
      const profileByMember = new Map<string, { id: string; email: string }>();
      (profiles || []).forEach((p) => {
        if (p && p.member_id && !profileByMember.has(p.member_id)) {
          profileByMember.set(p.member_id, { id: p.id, email: p.email || "" });
        }
      });
      const statuses: Record<string, { has_account: boolean; status: "invited" | "active" | "none"; email: string | null }> = {};
      (members || []).forEach((m) => {
        const prof = profileByMember.get(m.id);
        if (!prof) {
          statuses[m.id] = { has_account: false, status: "none", email: null };
          return;
        }
        const u = userById.get(prof.id) || null;
        statuses[m.id] = {
          has_account: true,
          // Profile tồn tại nhưng user không thấy trong Auth (bất thường)
          // -> coi như 'invited' (chưa dùng được), email lấy từ profile.
          status: u ? userStatus(u) : "invited",
          email: prof.email || (u && u.email) || null,
        };
      });
      return json(req, { ok: true, statuses });
    }

    return fail(req, 400, "Action không được hỗ trợ: " + (action || "(trống)"));
  } catch (e) {
    return fail(req, 500, "Lỗi máy chủ: " + ((e as Error)?.message || String(e)));
  }
});
