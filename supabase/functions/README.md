# Supabase Edge Functions — Sava Meta CRM

## `invite-member` — quản trị tài khoản thành viên (chỉ Admin)

Function duy nhất hiện có: `supabase/functions/invite-member/index.ts`.

Nó làm những việc frontend **không tự làm được** vì cần quyền máy chủ
(service_role): mời user qua Supabase Auth, gửi lại email đặt mật khẩu,
ban/gỡ ban tài khoản đăng nhập, và đọc trạng thái user trong `auth.users`.

**Bảo mật:**

- Chạy bằng `SUPABASE_SERVICE_ROLE_KEY` lấy từ biến môi trường — Supabase
  **tự cấp** cả 3 biến `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` trong môi trường chạy Edge Function.
  **Không cần set thêm biến môi trường nào, và tuyệt đối không hardcode
  key vào code / không đưa service_role key vào frontend.**
- `verify_jwt` = **bật**: mọi request phải có JWT đăng nhập hợp lệ của
  CRM, gateway từ chối request không có JWT trước khi vào code. Khai báo
  tường minh trong `supabase/config.toml`:

  ```toml
  [functions.invite-member]
  verify_jwt = true
  ```

  (Nếu repo chưa có `config.toml` vì chưa từng chạy `supabase init/link`
  ở máy này, đoạn trên là nội dung cần có trong file đó; khi deploy bằng
  CLI, Supabase mặc định cũng bật verify_jwt cho function mới.)
- Bên trong code, function **tự kiểm tra thêm**: JWT → `auth.users` →
  `profiles` → `members`, chỉ cho qua khi `role = 'Admin'` và
  `active = true`. Không đạt → `403`; thiếu/sai JWT → `401`.
- CORS: chỉ chấp nhận origin `https://kavie-cmyk.github.io` (kèm
  `localhost:8000/3000` cho dev) và xử lý preflight `OPTIONS`.

**Các action** (POST JSON `{action, ...}`, response `{ok:true,...}` /
`{error:'...'}`):

| Action | Input | Hành vi |
|---|---|---|
| `invite` | `{email, member_id}` hoặc `{email, name, role}` | Kiểm tra member chưa gắn tài khoản + email chưa tồn tại trong Auth (trùng → 409). Tạo member trước nếu là member mới (id = slug không dấu của tên, trùng thì thêm `x`, giống quy ước app), gọi `inviteUserByEmail` với `redirectTo` về app, rồi upsert `profiles`. Lỗi ở bước gắn profile sau khi đã mời → trả 500 kèm ghi chú "tài khoản đã tạo" + `user_id`/`member_id` để Admin xử lý, không nuốt lỗi. |
| `resend` | `{member_id}` | User đang chờ (chưa xác nhận email): gửi email **khôi phục mật khẩu** (`resetPasswordForEmail`, redirect về app) — Supabase Auth không có API gửi lại thư mời cho invite đang pending, và link khôi phục đưa người nhận tới đúng màn hình Đặt mật khẩu đã có trong app; không xoá/tạo lại user nên id + profile giữ nguyên. User đã kích hoạt → trả `resent:false` + thông báo không cần gửi lại. |
| `revoke` | `{member_id}` | `members.active = false` (chốt chặn chính — RLS dựa vào `active`) + **ban** user qua `updateUserById(id, {ban_duration: '876000h'})` (≈100 năm) để chặn cả đăng nhập. Chặn tự thu hồi chính mình (400). |
| `unrevoke` | `{member_id}` | Nghịch đảo: `members.active = true` + `ban_duration: 'none'`. |
| `list_status` | `{}` | Trả `statuses`: map `member_id → {has_account, status, email}`. `status` suy từ `auth.users`: `email_confirmed_at` có giá trị → `active`; chưa có → `invited` (đã mời, chờ đặt mật khẩu); không có profile → `none`. |
| `delete_member` | `{member_id}` | Xoá **tài khoản** của thành viên để app xoá hẳn thành viên: chỉ Admin đang hoạt động gọi được (cùng cơ chế kiểm Admin như mọi action); tự xoá chính mình → `400`. Member không tồn tại → `404`. Member **có** `profiles` (đã có tài khoản): xoá từng auth user qua admin API (`deleteUser`) rồi xoá dòng `profiles` tương ứng — bắt buộc theo thứ tự này vì `profiles.member_id` có FK `ON DELETE RESTRICT` tới `members`. Member **không có** tài khoản: không gọi auth admin, trả `{ok:true, had_account:false}` để app tự xoá. Function **không** xoá dòng `members` — app xoá dòng đó qua đường save/diff-sync hiện có sau khi action này thành công (app cũng đã chặn xoá khi thành viên còn tham chiếu nghiệp vụ trước khi gọi). Lỗi giữa chừng (xoá auth user / xoá profile thất bại) → `500` kèm `partial:true` và message nói rõ trạng thái, để Admin xử lý thay vì xoá dở dang trong im lặng. |

## Cách deploy

### Cách 1 — Supabase CLI (khuyên dùng)

```bash
# 1) Cài CLI (nếu chưa có): https://supabase.com/docs/guides/cli
# 2) Đăng nhập + link đúng project (ref của project sava-crm):
supabase login
supabase link --project-ref vaegwvawlwpckfkmjzsj
# 3) Deploy function này:
supabase functions deploy invite-member --project-ref vaegwvawlwpckfkmjzsj
```

Xong là function sống tại
`https://vaegwvawlwpckfkmjzsj.supabase.co/functions/v1/invite-member`
và app CRM (đã có sẵn code gọi ở `supabase-auth.js` + view Thành viên)
dùng được ngay mục Mời thành viên.

### Cách 2 — Management API (không cần CLI)

Cần **Personal Access Token** của chủ project (Supabase Dashboard →
Account → Access Tokens). Token này là bí mật cá nhân — không dán vào
chat, không commit.

Endpoint deploy function (tạo mới hoặc cập nhật) — ĐÃ KIỂM CHỨNG THẬT
ngày 30/10/2026: deploy `invite-member` thành công (HTTP 201, ACTIVE)
bằng đúng endpoint và định dạng dưới đây:

```
POST https://api.supabase.com/v1/projects/vaegwvawlwpckfkmjzsj/functions/deploy?slug=invite-member
Authorization: Bearer <PERSONAL_ACCESS_TOKEN>
```

- `Content-Type: multipart/form-data` với:
  - field `metadata`: JSON string
    `{"name":"invite-member","entrypoint_path":"index.ts","verify_jwt":true}`
  - field file: part tên là `file` (filename `index.ts`) chứa nội dung
    file nguồn.

Lưu ý: biến thể `POST .../functions` với part file đặt tên theo đường
dẫn (`index.ts`) trả HTTP 500 — không dùng. Cập nhật function đã có:
gọi lại chính endpoint `/functions/deploy?slug=...` ở trên.

## Kiểm tra sống sau deploy

Thay `<ANON_KEY>` bằng anon key công khai trong `supabase-client.js`.

1. **Không JWT → kỳ vọng 401** (gateway chặn vì `verify_jwt`, hoặc
   function trả 401 JSON):

```bash
curl -i -X POST 'https://vaegwvawlwpckfkmjzsj.supabase.co/functions/v1/invite-member' \
  -H 'Content-Type: application/json' \
  -H "apikey: <ANON_KEY>" \
  -d '{"action":"list_status"}'
```

2. **JWT của user KHÔNG phải Admin** (đăng nhập CRM bằng tài khoản
   BD/MKT, lấy `access_token` từ phiên Supabase) → kỳ vọng **403** với
   JSON `{error: "Chỉ Admin đang hoạt động mới quản lý được tài khoản thành viên."}`:

```bash
curl -i -X POST 'https://vaegwvawlwpckfkmjzsj.supabase.co/functions/v1/invite-member' \
  -H 'Content-Type: application/json' \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <JWT_CUA_USER_KHONG_PHAI_ADMIN>" \
  -d '{"action":"list_status"}'
```

3. Kiểm tra nhanh bằng tài khoản Admin: cùng lệnh 2 nhưng JWT của Admin
   → kỳ vọng `200` và `{ok:true, statuses:{...}}`.

Nếu chưa deploy function, app CRM vẫn chạy bình thường: view Thành viên
phía Admin tự rơi về trạng thái suy từ `profiles` ("Đã gắn tài khoản" /
"Chưa có tài khoản") kèm ghi chú nhẹ, không sập view.
