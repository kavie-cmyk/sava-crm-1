-- ============================================================================
-- Sava Meta CRM — Bảng snapshot dashboard (dashboard_snapshots)
-- ============================================================================
-- *** FILE MỚI — chạy file này lên project sava-crm (vaegwvawlwpckfkmjzsj)
--     qua Supabase Management API (helper supa.py). ***
-- Tiền điều kiện: schema.sql đã chạy — helper public.has_crm_role(text[])
--   đã tồn tại (xem schema.sql mục 2).
--
-- MỤC ĐÍCH: số liệu tổng hợp cho dashboard (đợt đầu: "Biến động tuần" —
--   key 'weekly_movement') được tính SẴN định kỳ ở phía server/script
--   (1 lần/ngày), KHÔNG tính realtime ở client. Bảng là kho key -> payload
--   jsonb dùng chung cho các snapshot sau này:
--     key         text primary key  (vd 'weekly_movement')
--     payload     jsonb not null    (hình dạng do script tính quy định;
--                                    hợp đồng payload weekly_movement v1:
--                                    {version:1, weeks:[{weekStart, scopes}]})
--     computed_at timestamptz not null (mốc script tính xong)
--
-- QUYỀN:
--   * ĐỌC (SELECT): chỉ Admin + BD — đúng mẫu policy hiện hành
--     (public.has_crm_role(array['admin','bd']), vd deals_all_bd /
--     events_all_bd). MKT và anon KHÔNG có policy nào -> không đọc được.
--   * GHI: KHÔNG tạo policy INSERT/UPDATE/DELETE cho client và chỉ grant
--     SELECT cho authenticated. Việc ghi snapshot chỉ qua Management API
--     (vai postgres, bỏ qua RLS) bởi script tính phía server
--     (compute_weekly_snapshot.py) — frontend không bao giờ ghi bảng này.
--   * Bảng tạo SAU blanket grant ở policies.sql nên grant ở đây phải
--     tường minh: revoke hết của anon, chỉ grant select cho authenticated.
--
-- MỌI LỆNH ĐỀU AN TOÀN KHI CHẠY LẠI: create table if not exists,
-- drop policy if exists trước khi tạo lại.
-- ============================================================================

create table if not exists public.dashboard_snapshots (
  key         text primary key,                       -- vd 'weekly_movement'
  payload     jsonb not null,                         -- snapshot đã tính sẵn
  computed_at timestamptz not null                    -- thời điểm tính xong
);
comment on table public.dashboard_snapshots is 'Snapshot số liệu dashboard tính sẵn phía server (không realtime). Đọc: Admin+BD qua RLS. Ghi: chỉ qua Management API bởi script tính (không có policy ghi cho client).';

alter table public.dashboard_snapshots enable row level security;

-- Grant tường minh như policies.sql: anon không có quyền gì; authenticated
-- chỉ SELECT ở mức privilege, dòng nào đọc được vẫn do RLS quyết.
revoke all on public.dashboard_snapshots from anon;
revoke all on public.dashboard_snapshots from authenticated;
grant select on public.dashboard_snapshots to authenticated;
-- (Cố ý KHÔNG grant insert/update/delete cho authenticated: default
--  privileges của project cấp sẵn cả 4 quyền cho authenticated trên bảng
--  mới, nên phải revoke tường minh rồi chỉ grant lại select — lớp RLS
--  không-policy-ghi ở dưới là chốt thứ hai.)

drop policy if exists dashboard_snapshots_select_bd on public.dashboard_snapshots;
create policy dashboard_snapshots_select_bd on public.dashboard_snapshots
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd']));

-- (Cố ý KHÔNG tạo policy INSERT/UPDATE/DELETE cho bất kỳ vai nào:
--  không có policy = RLS mặc định DENY với mọi user authenticated.)

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (các SELECT vô hại — chạy lại từng câu qua
-- Management API để đối chiếu):
--   1) Bảng + cột + RLS bật:
--        select c.relname, c.relrowsecurity
--        from pg_class c where c.relname = 'dashboard_snapshots';
--        select column_name, data_type, is_nullable
--        from information_schema.columns
--        where table_schema = 'public' and table_name = 'dashboard_snapshots'
--        order by ordinal_position;
--   2) Đúng 1 policy SELECT cho admin/bd, không policy ghi nào:
--        select policyname, cmd, roles, qual from pg_policies
--        where schemaname = 'public' and tablename = 'dashboard_snapshots';
-- ============================================================================
