# Hướng dẫn setup Supabase cho Sava CRM — phần việc của Zac

> Giai đoạn 1 mới chỉ có **thiết kế + file SQL** trong thư mục này. File này
> mô tả phần Zac cần làm trên trang Supabase khi bắt đầu giai đoạn 2 (hoặc
> làm trước từ bây giờ cũng được — project tạo xong để đó không tốn gì,
> gói Free không dùng thì tự tạm dừng).
> Miso không có tài khoản Supabase của Zac và không tự làm các bước này được.

## Tóm tắt ai làm gì

| Việc | Ai làm |
|---|---|
| Tạo project Supabase, đặt mật khẩu database | **Zac** (mục 1) |
| Lấy Project URL + anon key, gửi cho Miso | **Zac** (mục 2) |
| Chạy 3 file SQL theo thứ tự | Zac chạy trong SQL Editor, hoặc gửi quyền rồi làm cùng Miso (mục 3) |
| Tắt đăng ký công khai + tạo 4 tài khoản (Zac/Linh/Tuấn/Mai) | **Zac** (mục 4) |
| Gắn mỗi tài khoản với đúng thành viên + vai | Làm bằng đoạn SQL mẫu ở mục 5 |
| Nối frontend, màn hình đăng nhập, nạp dữ liệu localStorage lên | Giai đoạn 2 — Miso làm, Zac chỉ cần xuất file JSON theo MIGRATION.md |

## 1. Tạo project Supabase

1. Vào <https://supabase.com> → đăng nhập → **New project**.
2. Điền:
   - **Name:** `sava-crm` (đặt đúng tên này cho dễ đối chiếu về sau).
   - **Region:** **Singapore (Southeast Asia — ap-southeast-1)** — gần
     Việt Nam nhất, độ trễ thấp nhất trong các region Free.
   - **Plan:** Free là đủ cho team hiện tại (4 người, dữ liệu nhỏ).
3. **Database password:** bấm **Generate** để Supabase tạo mật khẩu mạnh,
   rồi lưu ngay vào trình quản lý mật khẩu của Zac (hoặc Secure Vault nếu
   Miso có sẵn mục cho việc này).
   - Mật khẩu này là mật khẩu của database Postgres gốc. Về sau gần như
     không dùng tới (app dùng anon key + đăng nhập từng người), nhưng mất
     nó thì khôi phục rất phiền — **đừng để trôi trong lịch sử chat, đừng
     dán vào chat với Miso**.
4. Bấm **Create new project**, chờ khoảng 1–2 phút để project khởi tạo xong.

## 2. Lấy Project URL + anon key — gửi gì cho Miso, tuyệt đối không gửi gì

Trong project vừa tạo: **Settings → API** (menu trái). Ở đó có 3 giá trị:

| Giá trị | Gửi cho Miso? | Vì sao |
|---|---|---|
| **Project URL** (dạng `https://<mã-project>.supabase.co`) | ✅ Gửi được qua chat | Đây là địa chỉ công khai, app nào cũng phải biết |
| **anon public key** (khóa dài bắt đầu `eyJ…`, nhãn `anon` / `public`) | ✅ Gửi được qua chat | Đây là khóa *công khai theo thiết kế*: nó chỉ mở được những gì RLS cho phép. Toàn bộ phân quyền Admin/BD/MKT nằm ở RLS trong `policies.sql`, không nằm ở khóa này |
| **service_role key** (nhãn `service_role` / `secret`) | ⛔ **TUYỆT ĐỐI KHÔNG dán vào chat** | Khóa này **bỏ qua toàn bộ RLS** — ai có nó là đọc/ghi được mọi dữ liệu kể cả deal/term mà MKT bị cấm. Nếu giai đoạn nào thật sự cần dùng (vd chạy bộ nạp dữ liệu), Miso sẽ xin qua **Secure Vault** (trang thu thập bí mật riêng), không bao giờ qua tin nhắn |

Cách gửi: mở chat với Miso, dán đúng 2 dòng:

```
Supabase URL: https://<mã-project>.supabase.co
Anon key: eyJ...
```

Chỉ cần 2 giá trị đó là giai đoạn 2 nối được frontend.

## 3. Chạy các file SQL (thứ tự bắt buộc)

Trong project: **SQL Editor → New query**. Chạy lần lượt, mỗi file một
query riêng, chờ báo thành công mới chạy file tiếp theo:

| Thứ tự | File | Nội dung |
|---|---|---|
| 1 | `schema.sql` | Tạo toàn bộ bảng, khóa ngoại, index, hàm phân quyền, trigger |
| 2 | `policies.sql` | Bật RLS + policy Admin/BD/MKT + trigger chặn MKT sửa field gốc của request |
| 3 | `seed-market.sql` | Nạp sẵn 23 record thị trường tĩnh (file này sinh tự động từ `publishing-data.js` — dữ liệu giống hệt app đang hiển thị, không phải dữ liệu mới) |

Lưu ý:

- **Ba file không giống nhau về khả năng chạy lại**: chỉ
  `seed-market.sql` là idempotent (chạy lại an toàn — nó upsert theo khóa
  chính). `schema.sql` và `policies.sql` thì **KHÔNG** idempotent: chúng
  dùng `create table`/`create policy` thuần, nên chạy lại sau khi đã
  chạy (dù chỉ chạy dở) sẽ báo lỗi `already exists` ở ngay câu đầu tiên —
  đó là lỗi do chạy trùng, không phải lỗi mới.
- Nếu một file báo lỗi giữa chừng: **dừng lại ngay, chụp/gửi nguyên văn
  lỗi cho Miso, đừng tự sửa SQL, đừng chạy tiếp file sau và đừng tự chạy
  lại file đó**. Vì hai file đầu không chạy lại được, trạng thái lúc đó
  là "đã tạo được một phần" — Miso sẽ xem lỗi gốc và hướng dẫn cách xử
  lý đúng cho đúng phần còn thiếu (hoặc làm lại project mới nếu cần),
  thay vì chạy chồng lên nhau gây lỗi chồng lỗi.
- Sau khi chạy xong cả 3 file, vào **Table Editor** kiểm tra nhanh: phải
  thấy các bảng `members`, `profiles`, `companies`, `games`, `deals`,
  `deal_terms`, `deal_contracts`, `leads`, `deal_leads`, `tasks`,
  `activities`, `publishing_requests`, `publishing_revisions`,
  `publishing_request_intake_private`, `publishing_revision_private`,
  `company_partner_eval_archive`, `market_datasets`, `market_records`,
  `market_observations`, `market_observation_audit`, `app_state_meta`.
  Bảng `market_records` phải có **23 dòng**.
- Project Supabase mới chạy PostgreSQL 15/17 — schema đã thiết kế cho mức
  này (có dùng cú pháp `ON DELETE SET NULL (cột)` của PG 15+).

## 4. Tắt đăng ký công khai + tạo tài khoản cho team

CRM này chỉ dành cho người được cấp tài khoản — **không cho tự đăng ký**:

1. **Authentication → Providers → Email**: tắt mục **Allow new users to
   sign up** (không cho đăng ký mới). Giữ nguyên đăng nhập bằng
   email + mật khẩu.
2. **Authentication → Users → Add user → Create new user**: tạo lần lượt
   4 tài khoản cho **Zac, Linh, Tuấn, Mai** bằng email thật của từng
   người, đặt mật khẩu ban đầu và bật **Auto Confirm User** (để khỏi phải
   chờ email xác nhận). Mật khẩu ban đầu gửi cho từng người qua kênh
   riêng, dặn họ đổi sau lần đăng nhập đầu (giai đoạn 2 có màn hình đăng
   nhập rồi mới đổi được — trước mắt cứ giữ mật khẩu ban đầu ở nơi an
   toàn của từng người).

> Chưa cần gửi danh sách email/mật khẩu cho Miso. Khi vào giai đoạn 2,
> Miso chỉ cần biết **email nào ứng với thành viên nào** (Zac/Linh/Tuấn/
> Mai) để gắn quyền — email thì gửi qua chat được, mật khẩu thì không.

## 5. Gắn tài khoản ↔ thành viên ↔ vai (bootstrap)

Nguyên tắc: mỗi tài khoản (auth user) gắn đúng **1 thành viên** trong
bảng `members`, và **vai lấy từ thành viên** (Zac = `Admin`, Linh/Tuấn =
`BD`, Mai = `MKT`) — không gắn vai rời ở nơi khác.

Vướng một điểm khởi động: tài khoản Admin đầu tiên (của Zac) chưa có
quyền gì trong DB cho tới khi được gắn, nên lần gắn đầu tiên phải chạy
bằng **SQL Editor** (quyền chủ project, bỏ qua RLS — đây là việc một lần).
Chạy đoạn sau trong SQL Editor, thay 4 địa chỉ email mẫu bằng email thật
vừa tạo ở mục 4:

```sql
-- 1) Tạo 4 thành viên (id giữ đúng id app đang dùng: zac/linh/tuan/mai)
insert into public.members (id, name, role, active) values
  ('zac',  'Zac',  'Admin', true),
  ('linh', 'Linh', 'BD',    true),
  ('tuan', 'Tuấn', 'BD',    true),
  ('mai',  'Mai',  'MKT',   true)
on conflict (id) do update
  set name = excluded.name, role = excluded.role, active = excluded.active;

-- 2) Gắn mỗi auth user với đúng 1 thành viên theo email
insert into public.profiles (id, member_id, email)
select u.id, m.member_id, u.email
from auth.users u
join (values
  ('thay-email-cua-zac@example.com',  'zac'),
  ('thay-email-cua-linh@example.com', 'linh'),
  ('thay-email-cua-tuan@example.com', 'tuan'),
  ('thay-email-cua-mai@example.com',  'mai')
) as m(email, member_id) on lower(m.email) = lower(u.email)
on conflict (id) do update
  set member_id = excluded.member_id, email = excluded.email;
```

Kiểm tra sau khi chạy (vẫn trong SQL Editor):

```sql
select p.email, p.member_id, m.name, m.role, m.active
from public.profiles p join public.members m on m.id = p.member_id;
```

Phải ra đúng 4 dòng: Zac/Admin, Linh/BD, Tuấn/BD, Mai/MKT, tất cả
`active = true`. Nếu thiếu dòng nào nghĩa là email gõ chưa khớp tài khoản
đã tạo — kiểm tra lại mục 4.

Từ sau bước này, việc thêm/tắt thành viên làm trong app (giai đoạn 2) như
hiện tại; **tắt `active` của một thành viên là người đó mất quyền truy
cập dữ liệu ngay ở tầng database**, kể cả khi tài khoản đăng nhập vẫn còn
— không cần xóa tài khoản.

## 6. Giai đoạn 2b ĐÃ XONG (cập nhật 2026-10-30) — việc còn lại của Zac

Frontend đã nối Supabase xong: đăng nhập bắt buộc + phân quyền theo vai ở
cả 3 trang, tầng dữ liệu thật thay localStorage (localStorage chỉ còn là
cache gương + bản sao lưu gốc trên máy). Việc Zac cần làm chỉ còn:

1. **Bootstrap tài khoản đầu tiên** — làm theo **`BOOTSTRAP.md`** trong
   thư mục này (tắt đăng ký tự do, tạo user Admin, chạy SQL gắn
   profiles → member `zac`).
2. **Nạp dữ liệu cũ một lần** bằng trang **`import.html`** (đăng nhập
   Admin → Đọc & phân tích → xem danh sách request mồ côi → xác nhận →
   nạp). Chi tiết mapping + đối chiếu ở `MIGRATION.md`.

Phần mô tả giai đoạn 2 bên dưới giữ lại để tham khảo lịch sử kế hoạch.

## 7. Giai đoạn 2 sẽ làm gì (để Zac hình dung, chưa phải làm bây giờ)

1. **Nối frontend**: thêm thư viện Supabase vào 3 trang (`index.html`,
   `publishing.html`, `mkt.html`), thay tầng đọc/ghi localStorage bằng
   tầng dữ liệu gọi Supabase — cấu trúc dữ liệu giữ nguyên như thiết kế ở
   thư mục này. Tính điểm Partner/Game v2 vẫn tính bằng JS như hiện tại.
2. **Màn hình đăng nhập**: trang đăng nhập email + mật khẩu; phiên đăng
   nhập quyết định vai (Admin/BD/MKT) thật ở server, thay cho việc chọn
   trang như prototype.
3. **Nạp dữ liệu hiện có**: xuất JSON từ localStorage của trình duyệt
   đang chứa dữ liệu thật → nạp lên Supabase một lần theo **MIGRATION.md**
   (giữ nguyên id, có bước đối chiếu số lượng và cách quay lui). Dữ liệu
   mẫu trong app (công ty/deal mẫu) cũng đi theo đúng quy trình này nếu
   lúc đó vẫn còn trong kho thật.
4. **Kiểm thử phân quyền bằng 4 tài khoản thật**, đặc biệt các ca MKT bị
   chặn: đăng nhập bằng tài khoản Mai rồi gọi thử API lấy `deals`,
   `deal_terms`, `publishing_revision_private`,
   `publishing_request_intake_private` — kết quả phải rỗng/lỗi quyền;
   và mở app bằng tài khoản Mai phải không thấy deal/term như hiện tại.
5. Sau khi nghiệm thu xong mới tính chuyện bỏ localStorage; trước đó app
   cũ vẫn chạy độc lập, dữ liệu gốc vẫn còn nguyên trong trình duyệt.
