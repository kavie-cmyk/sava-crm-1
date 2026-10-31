-- ============================================================================
-- Sava Meta CRM — Lịch sử chỉnh sửa (audit_log) — APPEND-ONLY
-- ============================================================================
-- Chạy file này SAU schema.sql + policies.sql trên project Supabase.
-- File CHỈ chuẩn bị sẵn trong repo — việc chạy lên project thật do quản trị
-- quyết định riêng. Code frontend đã chạy an toàn khi bảng chưa tồn tại:
-- mọi thao tác đọc/ghi audit đều bắt lỗi và nuốt êm (drawer hiện "Lịch sử
-- chưa khả dụng", lưu dữ liệu chính không bị ảnh hưởng).
--
-- Thiết kế nhẹ cho database:
--   * 1 dòng / 1 entity / 1 lần lưu — chỉ lưu DIFF các trường thật sự đổi
--     dạng jsonb gọn: [{field, label, from, to}] (from/to là chuỗi hiển thị
--     đã resolve nhãn tại thời điểm ghi ở client, vd tên công ty/người phụ
--     trách — đối tượng đích bị xoá sau này vẫn đọc được).
--   * entity_type: 'deal' | 'company' | 'lead' | 'game' | 'task' |
--     'member' | 'activity' | 'request' (hồ sơ Publishing).
--   * action: 'create' | 'update' | 'delete'.
--   * id uuid tự sinh (pgcrypto đã bật ở schema.sql); `at` do client gửi
--     (thời điểm sửa trên máy người dùng) — mặc định now() khi thiếu.
-- ============================================================================

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    text not null,
  at           timestamptz not null default now(),
  by_member_id text,  -- member id người sửa (app: S.members[].id); KHÔNG đặt FK:
                      -- member bị xoá thì lịch sử vẫn phải đọc được (client hiện
                      -- nhãn dự phòng "thành viên đã xoá").
  action       text not null check (action in ('create', 'update', 'delete')),
  changes      jsonb not null default '[]'::jsonb
);
comment on table public.audit_log is 'Lịch sử chỉnh sửa append-only của mọi đối tượng CRM + hồ sơ Publishing. Chỉ hệ thống ghi (client insert qua RLS), KHÔNG ai sửa/xoá được: file này cố ý KHÔNG tạo policy UPDATE/DELETE cho bất kỳ vai nào.';

-- Đọc lịch sử luôn theo 1 đối tượng, mới nhất trước (drawer: limit 100).
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, at desc);

-- ============================================================================
-- RLS + POLICIES — dùng ĐÚNG helper phân quyền sẵn có của schema.sql:
--   public.current_member_id()  -> member id của người gọi
--   public.current_member_role()-> 'admin' | 'bd' | 'mkt' | 'other'
--   public.has_crm_role(text[]) -> đang active VÀ role thuộc danh sách
--   public.is_active_member()   -> đã gắn profile + member còn active
-- ============================================================================
alter table public.audit_log enable row level security;

-- GRANT tường minh như policies.sql: anon không có quyền gì; authenticated
-- cần quyền bảng ở mức privilege, dòng nào chạm được vẫn do RLS quyết.
revoke all on public.audit_log from anon;
grant select, insert on public.audit_log to authenticated;
-- (Cố ý KHÔNG grant update/delete cho authenticated.)

-- ----------------------------------------------------------------------------
-- SELECT:
--   * Admin/BD: đọc MỌI mục lịch sử.
--   * MKT: CHỈ đọc mục thuộc entity_type 'game' và 'request' (hồ sơ
--     Publishing) — khớp mô hình bảo mật hiện có (MKT xem game + hồ sơ
--     đánh giá, bị chặn ở tầng dữ liệu khỏi deal/company/lead/task/member).
--     MKT tuyệt đối KHÔNG đọc được mục của deal/company/lead/task/member/
--     activity qua policy này.
--   * Vai 'Khác' / member đã ngừng hoạt động: không đọc được mục nào
--     (has_crm_role đã gồm điều kiện member còn active).
-- ----------------------------------------------------------------------------
create policy audit_log_select_bd on public.audit_log
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd']));

create policy audit_log_select_mkt on public.audit_log
  for select to authenticated
  using (
    public.has_crm_role(array['mkt'])
    and entity_type in ('game', 'request')
  );

-- ----------------------------------------------------------------------------
-- INSERT: mọi vai ĐANG HOẠT ĐỘNG (admin/bd/mkt) được ghi mục lịch sử, với
-- điều kiện by_member_id KHỚP member của chính người gọi
-- (by_member_id = public.current_member_id()). Nhờ vậy một user không thể
-- ghi lịch sử mạo danh người khác qua API trực tiếp.
-- GIỚI HẠN ĐÃ BIẾT: điều kiện khớp người gọi dựa trên profiles.member_id
-- của phiên đăng nhập — đúng cơ chế identity sẵn có của hệ thống. Client
-- luôn gửi by_member_id = member đang đăng nhập (SavaAuth.currentUser);
-- nếu phiên chưa gắn profile (current_member_id() = NULL) thì INSERT bị
-- từ chối và client nuốt lỗi êm (lịch sử thiếu mục đó, dữ liệu chính vẫn
-- lưu bình thường). entity_type/action không bị RLS giới hạn thêm: MKT
-- trong app chỉ sinh mục cho request/game qua đường lưu Publishing, và
-- dù MKT có insert được mục loại khác thì vẫn KHÔNG ĐỌC LẠI được chúng
-- (policy SELECT ở trên chặn) — bề mặt lộ dữ liệu vẫn đóng.
-- ----------------------------------------------------------------------------
create policy audit_log_insert_own on public.audit_log
  for insert to authenticated
  with check (
    public.is_active_member()
    and by_member_id = public.current_member_id()
  );

-- ----------------------------------------------------------------------------
-- UPDATE / DELETE: CỐ Ý KHÔNG TẠO BẤT KỲ POLICY NÀO.
-- Không có policy cho UPDATE/DELETE = RLS mặc định DENY với mọi vai
-- authenticated — đây là chốt "không ai sửa được lịch sử": kể cả Admin
-- cũng không sửa/xoá được mục lịch sử qua API. (service_role bỏ qua RLS
-- theo thiết kế Supabase chỉ dành cho thao tác quản trị phía server có
-- chủ đích, khoá này tuyệt đối không nằm trong frontend.)
-- ============================================================================
