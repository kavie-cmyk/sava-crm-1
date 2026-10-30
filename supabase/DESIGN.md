# Thiết kế dữ liệu Supabase — Sava Meta CRM (Giai đoạn 1)

> Phạm vi giai đoạn 1: chỉ thiết kế + file SQL trong thư mục `supabase/`.
> Chưa nối frontend, chưa tạo project thật, chưa commit. App đang chạy
> (localStorage) không đổi một dòng nào.
> Nguồn đối chiếu: code tại HEAD `7dff2d5` — `shared.js`, `index.html`,
> `publishing.js`, `publishing-bridge.js`, `publishing-score.js`,
> `publishing-data.js`, `docs/PUBLISHING_INTEGRATION.md`.

## 1. Tổng quan kiến trúc

Hai kho localStorage hiện tại ánh xạ sang Postgres như sau:

| Kho hiện tại | Bảng chính trong Supabase |
|---|---|
| `sava_crm_shared_v1.members` | `members` + `profiles` (gắn `auth.users`) |
| `.companies` | `companies` (+ `company_partner_eval_archive` cho `partnerEval` legacy) |
| `.games` | `games` |
| `.deals` | `deals` + `deal_terms` + `deal_contracts` + `deal_leads` |
| `.leads` | `leads` (+ `deal_leads` từ `deal.leads`) |
| `.tasks` | `tasks` |
| `.activities` | `activities` |
| `sava_publishing_v1.requests` | `publishing_requests` + `publishing_revisions` (+ 2 bảng private) |
| `sava_publishing_v1.marketUpdates` | `market_observations` + `market_observation_audit` |
| `publishing-data.js` (tĩnh) | `market_datasets` + `market_records` (seed bằng `seed-market.sql`) |
| version/meta 2 kho | `app_state_meta` |

Nguyên tắc đã áp dụng:

- **Thực thể chính quan hệ hoá** (bảng + FK + index); phần lồng sâu biến thiên
  theo loại hồ sơ mới để JSONB (`custom` của deal, `entries`/`scores_v2` của
  revision, `intake`, payload của market record) — đúng ranh giới nhiệm vụ
  cho phép, và đúng hình dạng frontend đang tính điểm bằng JS.
- **Tính điểm không xuống DB**: PartnerEval (file 2), Game v2, khung legacy
  vẫn do JS tính như hiện tại. DB lưu dữ liệu gốc (điểm từng tiêu chí nằm
  trong `entries`/`scores_v2`), không lưu điểm tổng suy diễn — tránh hai
  nguồn sự thật cho điểm số, đúng bài học "một implementation duy nhất".
- **Giữ nguyên id text** (`c1`, `g3`, `d5`, `REV-<uuid>`, `MECH-001`…) làm
  khoá chính: liên kết cũ không vỡ, deep-link `publishing.html?kind=&id=`
  vẫn có ý nghĩa ở giai đoạn 2.
- **Không mất field**: cặp cột `<x>_date` + `<x>_raw` cho field ngày lẫn chữ
  tự do; cột `legacy_extra` jsonb làm túi dự phòng bắt buộc cho khoá lạ khi
  nạp (xem MIGRATION.md mục 5).

## 2. Cơ chế chặn field nhạy cảm cho MKT (phần quan trọng nhất)

### 2.1 Vấn đề kỹ thuật

Postgres RLS là **row-level**: một policy `SELECT` trên bảng cho phép đọc
**mọi cột** của dòng được phép. Nếu `gateNote`, `bdComment`, Deal Fit…
nằm cùng bảng với dữ liệu MKT được đọc, MKT chỉ cần gọi PostgREST trực
tiếp (`select=*`) là lấy được — ẩn ở UI hay qua view thường (view chạy
bằng quyền owner, mặc định **bỏ qua RLS** của bảng gốc trong Postgres)
đều không phải là chặn thật.

### 2.2 Cơ chế đã chọn: tách bảng phụ + RLS riêng (deny-by-absence)

Mọi field nhạy cảm nằm ở **bảng riêng**, và vai MKT **không có bất kỳ
policy nào** trên các bảng đó. Không policy = RLS chặn mặc định: truy vấn
qua API trả về rỗng (SELECT) hoặc lỗi 403 (ghi), bất kể frontend hiển thị
gì. Đây là chặn ở tầng dữ liệu thật, kiểm chứng được bằng tài khoản MKT
ở giai đoạn 2 (checklist trong SETUP.md).

| Field nhạy cảm (đối chiếu code) | Nơi chứa trong DB | Ai đọc được |
|---|---|---|
| `deal.amount`, `deal.cur`, `deal.custom` (index.html: MKT không có giao diện deal) | `deals` (cả bảng) | Admin + BD |
| `deal.term.*`, `deal.contract.*` | `deal_terms`, `deal_contracts` | Admin + BD |
| `deal.leads` (liên kết lead↔deal) | `deal_leads` | Admin + BD |
| `activities` của deal (timeline) | `activities` (cả bảng) | Admin + BD |
| `companies[].partnerEval` — chứa `dealFit`, `hardGate.*.note`, `notesWeak`… | `company_partner_eval_archive` | Admin + BD |
| Game revision: `gateNote`, `gateSource` (D1, publishing.js) | `publishing_revision_private.game_gate_note/source` | Admin + BD |
| Revision: `bdComment` (D5, publishing.js) | `publishing_revision_private.bd_comment` | Admin + BD |
| Company entries: `deal` (Deal Fit), `legalEvidence` (B3) | `publishing_revision_private.deal_entry/legal_entry` | Admin + BD |
| Company gates: `note`/`source` từng cổng (B3) | `publishing_revision_private.gate_details` | Admin + BD |
| Intake game: `expectations` (D4) | `publishing_request_intake_private.expectations` | Admin + BD |
| `productionPillarEvidence.source` (F5) | `publishing_revision_private.production_pillar_source` | Admin + BD |

Phần còn lại của revision ở bảng công khai `publishing_revisions` gồm
đúng những gì MKT đang thấy trong app: điểm/evidence các tiêu chí chuyên
môn, `strengths/risks/conditions/next`, `comment`, **giá trị** cổng
(`gates.*.value`, `gate_value` — MKT thấy nhãn Đạt/Không đạt/Chưa xác
minh), và `production_pillar_evidence` — nhưng chỉ phần `{status, note}`
(status MKT cần vì coverage hiển thị cho cả hai phía). `source` của field
này tách sang bảng private (F5): dữ liệu migration hiện tại luôn để nó
rỗng (`legacyToRevision()` trong bridge ghi `source: ''`), nhưng thiết kế
không dựa vào tính chất dữ liệu hiện tại — source là "nguồn/ngày xác
minh", cùng họ với `gateSource`/gates source mà MKT bị ẩn, nên tách theo
cấu trúc và có CHECK cấm khoá `source` xuất hiện trong cột công khai.

### 2.3 Vì sao không chọn các cơ chế khác

| Cơ chế thay thế | Vì sao không chọn |
|---|---|
| Column privileges (`GRANT SELECT (cột…)`) | Postgres/PostgREST: quyền cột trộn với `select *` rất dễ vỡ (frontend hiện tại và supabase-js thường select cả dòng); không kết hợp được điều kiện "theo vai + theo dòng" (vd MKT đọc được dòng nhưng trừ 3 cột); một lần `GRANT` nhầm là lộ toàn bộ và không có tín hiệu lỗi. Tách bảng cho ranh giới rõ, audit được bằng `\dp`/policy list. |
| View che cột (`security_barrier` / `security_invoker`) | View "an toàn" phải đặt đúng `security_invoker=true` (PG15+) trên **mọi** view và mọi đường truy cập; chỉ cần một view quên đặt là lộ. Đồng thời view làm tầng ghi (insert/update revision kèm field nhạy cảm) phức tạp hơn nhiều. Giai đoạn 2 vẫn có thể thêm view tiện ích trên các bảng **công khai**, nhưng ranh giới bảo mật không được phụ thuộc vào view. |
| RPC/security-definer cho từng thao tác đọc | Chặn được, nhưng biến mọi màn hình thành RPC riêng, frontend giai đoạn 2 phải viết lại toàn bộ data layer quanh RPC và mất khả năng truy vấn linh hoạt của PostgREST. Chỉ dùng definer cho helper phân quyền (điểm hẹp, kiểm chứng dễ). |
| Mã hoá phía client | Quá mức cho team 3 người nội bộ; khoá giải mã vẫn phải cấp cho BD nên không đổi bản chất quyền, chỉ thêm rủi ro mất dữ liệu. |

**Trade-off của cơ chế đã chọn** (chấp nhận có ý thức):

1. Frontend giai đoạn 2 phải **join 2 bảng** khi BD mở một revision (công
   khai + private) và khi mở request game (intake + expectations). Đổi lại
   MKT dùng đúng một bảng công khai, không cần biết private tồn tại.
2. Bộ nạp dữ liệu phải **tách field khi import** (gỡ `expectations` khỏi
   `intake`, gỡ `deal`/`legalEvidence` khỏi `entries`, tách note/source
   của gates…). MIGRATION.md có quy tắc tách từng field + truy vấn kiểm
   tra rò rỉ sau nạp (quét jsonb tìm khoá nhạy cảm).
3. Xoá request/revision phải dựa vào FK `ON DELETE CASCADE` từ bảng công
   khai sang private (referential action không qua RLS nên cascade chạy
   đúng ngay cả khi người xoá là MKT — người này không tự xoá được dòng
   private bằng lệnh trực tiếp, nhưng xoá request của mình thì phần
   private đi theo, đúng hành vi `deleteRequest` hiện tại).

### 2.4 Lớp bù cho giới hạn "RLS không tách cột khi UPDATE"

`publishing_requests` là bảng duy nhất BD và MKT **cùng ghi** nhưng khác
field (MKT: trạng thái + con trỏ revision; BD: intake/build/người giao…).
RLS chỉ chặn được mức dòng, nên `policies.sql` thêm trigger
`guard_publishing_request_update()`: role MKT mà đổi các cột gốc của BD
(`kind`, entity, `intake`, `build_label`, `source_url`, `assignee_id`,
hạn, `request_note`, `requested_by`, `requested_at`, `migrated_from`,
`legacy_extra`) thì lệnh UPDATE bị RAISE. Đây là chặn thật ở DB (không
phải UI), và danh sách cột khoá đối chiếu đúng những gì `submitReview`
phía MKT chạm/không chạm. Ngoài ra nhóm bất biến định danh
`id`/`created_at`/`created_by` bị khoá với **mọi** vai (F6):
`created_by` được ghi một lần lúc INSERT từ phiên đăng nhập rồi không
sửa lại — nhất quán với `id`/`created_at`; `legacy_extra` chỉ khoá thêm
với MKT vì BD/Admin còn cần sửa túi dự phòng khi xử lý dữ liệu nạp.

### 2.5 Chốt chặn JSONB công khai ở tầng DB (F3)

Tách bảng + bộ nạp gỡ field (mục 2.2) vẫn có một điểm yếu: nếu bộ nạp
hoặc frontend giai đoạn 2 sót một field khi tách, field nhạy cảm sẽ nằm
lại trong JSONB của bảng công khai và MKT đọc được ngay. Giai đoạn 1 bổ
sung chốt chặn ngay trong `schema.sql` để DB tự từ chối dữ liệu sai:

| Cột công khai | Ràng buộc |
|---|---|
| `publishing_requests.intake` | CHECK: không chứa khoá `expectations` (cả `legacy_extra` của bảng này cũng vậy) |
| `publishing_revisions.entries` | CHECK: không chứa khoá `deal` / `legalEvidence` |
| `publishing_revisions.gates` | CHECK qua hàm immutable `jsonb_gates_public_only()`: không cổng nào chứa `note`/`source` (CHECK không chứa được subquery nên phép quét `jsonb_each` nằm trong hàm) |
| `publishing_revisions.production_pillar_evidence` | CHECK: không chứa khoá `source` (F5) |
| `publishing_revisions.legacy_extra` | CHECK: không chứa `bdComment`/`gateNote`/`gateSource`/`productionPillarEvidence`/`deal`/`legalEvidence`/`hardGate` (NF1: `deal`/`legalEvidence` là 2 khoá `entries` tách sang private — trước đây mới cấm ở cột `entries`, chưa cấm ở túi này; `hardGate` là biến thể cũ thay `gates` chứa `note` từng cổng thuộc `gate_details` private, xem MIGRATION.md mục 4.2) |
| `companies.legacy_extra` | CHECK: không chứa `partnerEval` (NF1: toàn bộ `partnerEval` chỉ được ở `company_partner_eval_archive`) |

Đã rà các cột JSONB công khai còn lại: `entries.*.source` và
`scores_v2.*.source` là dữ liệu MKT **thấy trong app** (nguồn bằng chứng
từng tiêu chí chuyên môn; nhãn `auto/manual/override` của điểm v2) nên
giữ công khai có chủ đích; các JSONB nhạy cảm khác (`deals.custom`,
`companies.roles`…) hoặc nằm ở bảng BD-only, hoặc không chứa các field
trên theo cấu trúc app. Đã rà thêm (NF1) mọi cột `legacy_extra` ở bảng
MKT đọc được ngoài hai cột vừa vá — `members`, `games`, `leads`,
`market_observations` (và `publishing_requests`, vốn đã chặn
`expectations`): object gốc của chúng không có field nào tách sang bảng
private tương ứng (field nhạy cảm đã chốt của từng object đều có cột/
bảng riêng được liệt kê ở mục 2.2), nên không bổ sung khoá chặn nào —
chặn thêm sẽ chặn bừa khoá hợp lệ. Các bảng còn lại có `legacy_extra`
(`deals` và các bảng vệ tinh/private…) đều là bảng BD-only/admin-only,
không phải bề mặt MKT đọc được nên không tạo đường rò tương tự. Truy
vấn quét rò rỉ sau nạp ở MIGRATION.md mục 7.3 khớp đúng các ràng buộc
này.

## 3. Ma trận quyền tổng kết (chi tiết ở policies.sql)

| Bảng | Admin | BD | MKT | Member 'Khác' / inactive |
|---|---|---|---|---|
| `members` | đọc + ghi | đọc | đọc | đọc (khi active); inactive chỉ đọc dòng của chính mình |
| `profiles` | đọc + ghi | chỉ đọc dòng của chính mình | chỉ đọc dòng của chính mình | chỉ đọc dòng của chính mình (kể cả khi inactive) |
| `companies`, `games`, `leads` | đọc + ghi | đọc + ghi | đọc | đọc (khi active) |
| `deals`, `deal_terms`, `deal_contracts`, `deal_leads`, `activities` | toàn quyền | toàn quyền | **không policy** | không |
| `company_partner_eval_archive` | toàn quyền | toàn quyền | **không policy** | không |
| `tasks` | toàn quyền | toàn quyền | **không policy** (F4) | không |
| `publishing_requests` (công khai) | đọc + tạo + sửa + xoá | đọc + tạo + sửa + xoá | đọc + sửa (bị trigger khoá cột gốc) + xoá | không |
| `publishing_revisions` (công khai) | đọc + thêm | đọc + thêm | đọc + thêm | không |
| `publishing_request_intake_private` | toàn quyền | toàn quyền | **không policy** | không |
| `publishing_revision_private` | đọc + thêm (append-only, F11) | đọc + thêm | **không policy** | không |
| `market_records`, `market_datasets` | đọc + ghi | đọc | đọc | đọc (khi active) |
| `market_observations`, `market_observation_audit` | đọc + ghi | đọc + ghi | đọc + ghi | đọc (khi active) |
| `app_state_meta` | đọc | — | — | — |

Ghi chú theo đúng luồng app hiện tại:

- **Tạo request đánh giá**: chỉ BD (+Admin) — `submitRequest` trong app
  cũng chặn `role !== 'bd'`. MKT tạo request sẽ bị RLS chặn ở INSERT.
- **Xoá request**: nút xoá hiện ở cả hai phía BD/MKT trong app → cả ba vai
  đều xoá được request đang active của hệ thống (không giới hạn "chỉ
  người tạo") để giữ đúng hành vi hiện tại.
- **Revision bất biến**: không vai nào UPDATE/DELETE được revision (kể cả
  Admin) — sửa = thêm revision mới, đúng nguyên tắc của app.
- **Tasks**: mặc định an toàn của giai đoạn 1 là chỉ Admin + BD (F4).
  Task gắn deal mang `title` + `deal_id` — cho MKT đọc task "giao cho
  mình" cũng là lộ thông tin deal qua ngả khác, nên giai đoạn 1 MKT
  không đọc task nào cả (kể cả task giao cho chính mình); module việc
  phía MKT để trống ở giai đoạn 2. Nếu Zac muốn MKT có danh sách việc
  riêng thì phải thiết kế lại trường dữ liệu an toàn cho MKT (việc
  không kèm thông tin deal) ở giai đoạn 2 rồi mới mở policy — đây là
  điểm cần Zac quyết (mục 6), không tự nới trước.
- **Market observations**: cả BD và MKT đều thêm/bổ sung/xoá được như app
  (form quan sát không phân vai; `deleteMarketObs` ở cả hai trang).
  Riêng `market_records` tĩnh chỉ Admin sửa qua DB — bản chuẩn là file
  `publishing-data.js` + seed sinh lại, không sửa tay hai nơi.

## 4. Members / profiles / vòng đời tài khoản

- `members` giữ nguyên mô hình của app (`id` text, `role` văn bản
  `Admin/BD/MKT/Khác`, `active`). Role chuẩn hoá (admin/bd/mkt/other) chỉ
  tồn tại inside helper `current_member_role()`/`has_crm_role()` — một
  điểm dịch duy nhất, tránh lệch giữa DB và app.
- `profiles.id = auth.users.id`, `profiles.member_id -> members.id`:
  mỗi auth user đúng 1 member. Chủ đích **không** unique `member_id`
  (một người có thể có thêm tài khoản phụ/test mà không vỡ ràng buộc;
  quyền suy ra từ member nên hai tài khoản cùng member là tương đương).
- **Inactive = mất quyền thật**: mọi policy nghiệp vụ đều qua
  `is_active_member()`/`has_crm_role()` (cả hai đều đòi `members.active`).
  Tắt active trong trang Thành viên (giai đoạn 2) là thu hồi truy cập
  ngay ở tầng DB, không cần khoá tài khoản Auth; bật lại là khôi phục.
  Hai ngoại lệ duy nhất: user inactive vẫn đọc được dòng `members` và
  `profiles` **của chính mình** để frontend hiện đúng màn hình "đã ngừng
  hoạt động" thay vì lỗi trắng.
- **`members` và `profiles` khác nhau có chủ đích (F7)**: `members` là
  danh bạ nội bộ (tên/vai/trạng thái — không có email hay thông tin đăng
  nhập) nên mọi user active đều đọc được để hiển thị tên người phụ trách
  khắp app. `profiles` chứa **email** + liên kết tài khoản Auth nên chỉ
  chính chủ và Admin đọc được (`id = auth.uid() or role admin`); BD/MKT
  active cũng **không** đọc được profiles của người khác. Không nới
  policy `profiles` — frontend giai đoạn 2 cần tên/vai thì lấy từ
  `members`, cần email thì chỉ Admin có.
- Tài khoản do Admin tạo: tắt đăng ký công khai trong Supabase Auth
  (SETUP.md), Admin tạo user trong Dashboard rồi gắn `profiles`. Không
  có trigger tự tạo profile khi có user lạ đăng ký — user không có
  profile thì `has_crm_role()` = false và không đọc/ghi được gì.
- Helper là `SECURITY DEFINER` + `search_path=''` + tên bảng fully
  qualified: đọc được `profiles/members` bất chấp RLS của chính hai bảng
  đó → không đệ quy policy. Điều kiện đi kèm đã ghi trong schema: **không
  bật FORCE RLS** trên hai bảng này (mặc định Supabase không bật).

## 5. Các quyết định thiết kế đáng chú ý khác

1. **`publishing_requests.entity_id` là cột GENERATED**
   (`coalesce(game_id, company_id)`), với CHECK ép đúng một FK theo
   `kind`. Postgres không có FK đa hình; cách này vừa giữ truy vết 1-1
   với `entityId` của app, vừa có FK thật tới `games`/`companies`. Cả hai
   FK đều là `ON DELETE RESTRICT` (F2, lựa chọn bảo toàn dữ liệu của
   giai đoạn 1): xoá game/công ty **không** được âm thầm xoá theo
   request/revision/private — phải xoá request tường minh trước, đúng
   tinh thần app hiện tại (xoá entity và xoá request là hai thao tác
   riêng, `deleteCompany`/`deleteGame` chỉ cảnh báo chứ không xoá
   request). Hệ quả UX ở giai đoạn 2: nút xoá game/công ty sẽ bị DB từ
   chối khi còn request tham chiếu — frontend phải kiểm tra trước và
   hướng dẫn người dùng xoá/chuyển request trong module Publishing
   (khác app hiện tại ở điểm request không còn thành "mồ côi" nữa mà
   entity đơn giản là chưa xoá được).
   Ngược lại, `deals.company_id` là nullable + `ON DELETE SET NULL`
   (F1): app xoá công ty thì deal **vẫn tồn tại** chỉ mất liên kết
   (`delete d.company` trong `deleteCompany`) — hai quan hệ này khác
   nhau vì hành vi app khác nhau, không phải thiếu nhất quán.
   Canonical request khi trùng `kind + entity`: app chọn request **cuối
   mảng** (quy tắc A5 của bridge) — đây là quy tắc tầng app khi nạp/xem,
   DB không đặt unique (giữ cả dữ liệu trùng để đối chiếu, MIGRATION.md
   có truy vấn phát hiện trùng).
2. **`current` của request được chuẩn hoá** thành
   `current_revision_no` (FK vòng tròn DEFERRABLE sang revisions).
   Mọi đường ghi trong app đều đặt `current` = revision mới nhất nên
   chuẩn hoá này không đổi ngữ nghĩa; ca lệch nhau duy nhất (dữ liệu
   tay/hỏng) được bộ nạp vật hoá thành revision phụ — xem MIGRATION.md.
3. **Cột "người" không FK** (`deals.owner_id`, `tasks.assignee_id`,
   `publishing_requests.requested_by`, `reviewer_id`…): app cho phép giá
   trị là id cũ không còn trong `members` (hiển thị fallback chính id đó)
   và chuỗi rỗng. FK sẽ làm hỏng dữ liệu thật khi nạp. Thay vào đó có
   index + quy ước giai đoạn 2 luôn ghi member id đang active.
4. **Market records tĩnh vào DB nhưng giữ nguyên payload**: cột vô hướng
   cho phần list/lọc (name/category/downloads/revenue/top3/CPI median
   nằm trong payload), `payload jsonb` chứa **toàn bộ** record gốc vì
   `marketAuto`/`marketSuggest` cần các khối lồng (history, entry,
   uaBenchmark, topTitles…). Tách 10 bảng vệ tinh cho các khối này không
   đổi được kết quả tính, chỉ làm bộ nạp và frontend phức tạp hơn; payload
   là điểm cân bằng đã chọn. Quan sát của user là bảng riêng
   (`market_observations`) đúng mô hình overlay của app — **không** ghi
   đè vào `market_records`.
   View gộp sẵn (record + overlay) **không** được tạo ở giai đoạn 1:
   phép gộp của app là shallow-merge theo id kèm audit — để frontend
   giai đoạn 2 thực hiện từ 2 bảng (đúng code `observations()` hiện tại),
   tránh một view owner-rights trở thành đường rò dữ liệu tĩnh/RLS.
5. **`stage` của deal không CHECK**: danh sách stage theo từng line nằm
   ở `LINES` (shared.js) và app cố ý giữ giá trị cũ ngoài danh sách qua
   cơ chế "(dữ liệu cũ)". Đặt CHECK sẽ phá dữ liệu cũ; giai đoạn 2
   validate ở tầng app như hiện tại. Ngược lại các tập giá trị **đóng
   thật** (line, own, lead status, request status, gate value, member
   role) đều có CHECK.
6. **`overdue` của task chỉ lưu dạng `overdue_stored`**: app tính quá
   hạn động theo `dueDate`; cột lưu chỉ để đối chiếu bản gốc, tài liệu
   đã ghi rõ không dùng làm sự thật.
7. **Điểm số không có cột tổng ở DB** (Partner Fit, Final v2…): chúng là
   kết quả tính của một implementation JS duy nhất; lưu thêm ở DB sẽ tạo
   nguồn sự thật thứ hai — đúng lỗi hệ thống đã từng sửa ở vòng QA A7.
8. **GRANT tường minh trong `policies.sql` (F12)**: `authenticated` được
   grant đủ quyền bảng (điều kiện cần cho PostgREST — RLS vẫn quyết định
   từng dòng), `anon` bị revoke toàn bộ quyền trên schema `public` vì
   CRM không có bề mặt công khai nào. Không dựa hoàn toàn vào default
   privileges của project: bảng mới tạo ở giai đoạn 2 phải lặp lại
   grant/revoke này trong migration của nó. EXECUTE của các hàm helper
   chỉ cấp cho `authenticated` (kể cả hàm kiểm tra gates dùng trong
   CHECK, vì CHECK chạy bằng user đang ghi) — riêng hàm kiểm tra gates
   `jsonb_gates_public_only(jsonb)` cấp thêm EXECUTE cho `service_role`
   (NF2, ngay dưới định nghĩa hàm trong `schema.sql`) để bộ nạp giai
   đoạn 2 chạy bằng service_role qua API không bị CHECK từ chối; đây
   không phải quyền dữ liệu (service_role vốn bypass RLS ở backend tin
   cậy, và key của nó tuyệt đối không được lộ — xem SETUP.md). Hàm
   trigger không cần EXECUTE grant vì Postgres không kiểm tra quyền
   này khi trigger chạy.

## 6. Giới hạn đã biết / điểm cần chốt ở giai đoạn 2

1. RLS không phân biệt được *nội dung* UPDATE trên cùng một dòng ngoài
   trigger guard của `publishing_requests` — các bảng còn lại phân vai ở
   mức "vai nào được ghi bảng nào", đúng granularity của app hiện tại.
   Nếu sau này cần "MKT chỉ sửa field X của revision" thì revision vốn
   append-only nên không phát sinh nhu cầu đó.
2. `reviewer_id` của revision do người lưu chọn trong form (có thể chọn
   người khác) — DB không ép `reviewer = current_member_id()` để giữ
   đúng hành vi app; truy vết người ghi thật dựa vào `created_by` mà
   data layer giai đoạn 2 sẽ set từ phiên đăng nhập.
3. `profiles.email` chỉ là bản sao tiện đối chiếu; email thật nằm ở
   `auth.users`. Đổi email phải đổi ở Auth (Dashboard), không đổi ở đây.
4. FK `publishing_requests_current_fk` dùng `ON DELETE SET NULL
   (current_revision_no)` — cú pháp danh sách cột của **PostgreSQL 15+**.
   Project Supabase mới hiện nay chạy PG 15/17 nên hợp lệ; nếu sau này
   hạ cấp PG (không khuyến nghị) phải sửa constraint này.
5. Chưa có Storage bucket / Realtime / Edge Function nào trong thiết kế
   — app hiện tại không dùng; link hợp đồng/build vẫn là URL text như cũ.
6. **Cần Zac quyết ở giai đoạn 2 — việc cho MKT (F4)**: giai đoạn 1 chốt
   mặc định an toàn (MKT không đọc `tasks`). Nếu muốn Mai có danh sách
   việc riêng, phải thiết kế lại dữ liệu việc an toàn (không lộ
   `deal_id`/tiêu đề deal) rồi mới mở policy riêng — coordinator sẽ hỏi
   ý Zac khi vào giai đoạn 2, không tự mở quyền.
7. **UX xoá entity ở giai đoạn 2 (F2)**: FK RESTRICT từ
   `publishing_requests` buộc frontend xử lý ca "còn request tham chiếu"
   khi xoá game/công ty (thông báo + dẫn sang module Publishing để xoá
   request trước) thay vì để request thành mồ côi như app hiện tại.
