# Bootstrap tài khoản đầu tiên — Sava CRM trên Supabase (Giai đoạn 2b)

> Dành cho Zac (không cần rành kỹ thuật). Project Supabase `sava-crm` đã có
> sẵn schema + RLS + 23 record thị trường. Tài liệu này hướng dẫn: tắt đăng
> ký tự do → tạo tài khoản Admin đầu tiên → gắn tài khoản với thành viên
> `zac` (vai Admin) → nạp dữ liệu cũ bằng công cụ import → tạo tài khoản
> cho Linh/Tuấn/Mai sau này.
> Nguyên tắc an toàn: chỉ dùng **anon key** trong app (đã nhúng sẵn trong
> `supabase-client.js`). **service_role key tuyệt đối không dán vào chat,
> không đưa vào app.**

## Bước 0 — Chuẩn bị

- Đăng nhập <https://supabase.com> → mở project **sava-crm**.
- Chuẩn bị sẵn: email Zac muốn dùng đăng nhập CRM + một mật khẩu mạnh
  (lưu vào trình quản lý mật khẩu).

## Bước 1 — Tắt đăng ký tự do

CRM chỉ dành cho người được cấp tài khoản:

1. Menu trái: **Authentication → Providers** (hoặc **Authentication →
   Configuration** tuỳ giao diện mới).
2. Mở nhà cung cấp **Email**.
3. Tắt mục **Allow new users to sign up** (không cho người lạ tự đăng ký).
4. Giữ nguyên: đăng nhập bằng **Email + mật khẩu** đang bật.
5. Bấm **Save** nếu có nút lưu.

## Bước 2 — Tạo tài khoản Admin đầu tiên (của Zac)

1. Menu trái: **Authentication → Users**.
2. Bấm **Add user → Create new user**.
3. Điền:
   - **Email:** email của Zac (dùng đúng email này ở Bước 3).
   - **Password:** mật khẩu Zac tự đặt (KHÔNG gửi mật khẩu này cho ai qua chat).
   - Bật **Auto Confirm User** (để tài khoản dùng được ngay, khỏi chờ email xác nhận).
4. Bấm **Create user**.

## Bước 3 — Gắn tài khoản vừa tạo với thành viên `zac` (vai Admin)

Lần gắn đầu tiên phải chạy bằng **SQL Editor** (quyền chủ project, bỏ qua
RLS — đây là việc một lần; sau này app tự phân quyền).

1. Menu trái: **SQL Editor → New query**.
2. Dán đoạn dưới đây, **thay đúng 1 chỗ**: `thay-email-cua-zac@example.com`
   → email vừa tạo ở Bước 2. Chạy (**Run**):

```sql
-- 1) Tạo sẵn 4 thành viên của team (id giữ đúng id app đang dùng)
insert into public.members (id, name, role, active) values
  ('zac',  'Zac',  'Admin', true),
  ('linh', 'Linh', 'BD',    true),
  ('tuan', 'Tuấn', 'BD',    true),
  ('mai',  'Mai',  'MKT',   true)
on conflict (id) do update
  set name = excluded.name, role = excluded.role, active = excluded.active;

-- 2) Gắn tài khoản Admin (theo email) với thành viên 'zac'
insert into public.profiles (id, member_id, email)
select u.id, 'zac', u.email
from auth.users u
where lower(u.email) = lower('thay-email-cua-zac@example.com')
on conflict (id) do update
  set member_id = excluded.member_id, email = excluded.email;
```

3. Kiểm tra — chạy đoạn này, phải ra **1 dòng**: email của Zac · `zac` ·
   `Zac` · `Admin` · `true`:

```sql
select p.email, p.member_id, m.name, m.role, m.active
from public.profiles p join public.members m on m.id = p.member_id;
```

Nếu ra 0 dòng: email trong SQL chưa khớp email tài khoản đã tạo — kiểm tra
lại Bước 2/3 (gõ thừa dấu cách, sai chính tả) rồi chạy lại mục 2.

## Bước 4 — Đăng nhập thử + nạp dữ liệu cũ

1. Mở app CRM (trang BD) → màn hình đăng nhập hiện ra → đăng nhập bằng
   email + mật khẩu ở Bước 2. Vào được app và góc phải hiện
   “Zac · Admin” là xong phần tài khoản (lúc này dữ liệu có thể còn trống —
   bình thường, vì chưa nạp dữ liệu cũ).
2. Nạp dữ liệu cũ từ trình duyệt đang chứa dữ liệu thật:
   - Mở trang **`import.html`** cùng gốc với app (đăng nhập Admin như trên).
   - Bấm **Đọc & phân tích** → xem báo cáo số bản ghi theo bảng + danh sách
     **request mồ côi** (sẽ KHÔNG được nạp — gửi danh sách đó cho Miso/Zac
     chốt riêng nếu cần).
   - Tick ô xác nhận → bấm **Nạp lên Supabase** → xem bảng kết quả từng nhóm.
   - Quay lại trang BD/Publishing kiểm tra dữ liệu; đối chiếu số lượng theo
     mục 7 của `MIGRATION.md` nếu muốn chắc chắn.
3. **Không xoá dữ liệu localStorage** trên máy cho tới khi nghiệm thu xong
   (đó là đường quay lui cuối cùng — xem MIGRATION.md mục 8).

## Bước 5 — Tạo tài khoản cho Linh / Tuấn / Mai (làm sau, cùng mẫu)

Mỗi người làm đúng 3 việc như Zac:

1. **Authentication → Users → Add user → Create new user**: email thật của
   từng người, mật khẩu ban đầu, bật **Auto Confirm User**. Gửi mật khẩu
   ban đầu cho từng người qua kênh riêng; dặn họ giữ ở nơi an toàn.
2. **SQL Editor**: chạy đoạn gắn tài khoản (thay email + member id tương
   ứng — `linh` cho Linh, `tuan` cho Tuấn, `mai` cho Mai; 4 thành viên đã
   tạo sẵn ở Bước 3 nên không cần insert lại members):

```sql
insert into public.profiles (id, member_id, email)
select u.id, m.member_id, u.email
from auth.users u
join (values
  ('thay-email-cua-linh@example.com', 'linh'),
  ('thay-email-cua-tuan@example.com', 'tuan'),
  ('thay-email-cua-mai@example.com',  'mai')
) as m(email, member_id) on lower(m.email) = lower(u.email)
on conflict (id) do update
  set member_id = excluded.member_id, email = excluded.email;
```

3. Kiểm tra bằng câu `select` ở Bước 3 — phải đủ 4 dòng:
   Zac/Admin, Linh/BD, Tuấn/BD, Mai/MKT, tất cả `active = true`.

Từ đây về sau: thêm/tắt thành viên làm trong app (mục **Thành viên**).
**Tắt `active` của một thành viên = người đó mất quyền truy cập dữ liệu
ngay ở tầng database**, kể cả khi tài khoản đăng nhập vẫn còn — không cần
xoá tài khoản Auth.

## Gặp lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Đăng nhập báo “Email hoặc mật khẩu không đúng” | Kiểm tra lại email/mật khẩu ở Authentication → Users; đặt lại mật khẩu cho user đó trong dashboard nếu quên. |
| Đăng nhập được nhưng app báo “chưa được gắn với thành viên” | Chưa chạy Bước 3 (hoặc email không khớp) — chạy lại SQL gắn tài khoản rồi đăng nhập lại. |
| App báo “đã bị ngừng hoạt động” | Thành viên bị tắt `active` trong mục Thành viên — Admin mở lại là vào được. |
| Mai (MKT) mở trang BD bị chuyển về trang Marketing | Đúng thiết kế phân quyền — MKT chỉ dùng trang Marketing. |
