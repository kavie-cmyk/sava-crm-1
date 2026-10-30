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

Endpoint deploy function (tạo mới hoặc cập nhật):

```
POST https://api.supabase.com/v1/projects/vaegwvawlwpckfkmjzsj/functions
Authorization: Bearer <PERSONAL_ACCESS_TOKEN>
```

Định dạng body hiện hành của Management API cho Edge Functions:

- `Content-Type: multipart/form-data` với:
  - field `metadata`: JSON string, vd
    `{"name":"invite-member","entrypoint_path":"index.ts","verify_jwt":true}`
  - các field file: mỗi file nguồn của function là một part (tên part =
    đường dẫn tương đối, vd `index.ts`) chứa nội dung file.
- (API cũng chấp nhận biến thể JSON `{slug, name, body, verify_jwt}`
  dạng "esm" một file cho function đơn giản; với function này chỉ có
  đúng 1 file `index.ts` nên cả hai cách đều được — multipart là cách
  tổng quát và là cách CLI dùng.)

Cập nhật function đã tồn tại: `PATCH` cùng endpoint + `/<function-slug>`
với định dạng body tương tự.

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
