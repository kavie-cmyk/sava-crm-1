-- ============================================================================
-- Sava Meta CRM — Hoạt động gắn TRỰC TIẾP vào SỰ KIỆN (activities mở rộng chủ thứ 4)
-- ============================================================================
-- *** File này được áp lên project thật (vaegwvawlwpckfkmjzsj) ở đợt
--     2026-11-05 — xem bằng chứng trước/sau trong bàn giao: trước khi áp,
--     activities có 5 dòng (cả 5 gắn lead), chưa có cột event_id, CHECK
--     exactly-one-owner chỉ gồm 3 cột deal_id/lead_id/game_id, 1 policy
--     activities_all_bd. Snapshot trước khi áp:
--     goals/sava-meta-crm/hidden_files/2026-11-05-event-activity-snapshot-before.txt ***
-- Tiền điều kiện: schema.sql + policies.sql + activity-lead-game.sql +
--   events-module.sql đã chạy (bảng public.activities kèm CHECK
--   activities_exactly_one_owner 3 chủ + bảng public.events + policy
--   activities_all_bd đã tồn tại).
--
-- BỐI CẢNH / LÝ DO CHỌN MÔ HÌNH:
--   * Hoạt động đã có cơ chế chủ trực tiếp cho Deal/Lead/Game: 3 cột FK
--     trên activities + CHECK đúng-một-chủ (activity-lead-game.sql).
--     Sự kiện trở thành loại chủ thứ 4 bằng ĐÚNG cơ chế đó — thêm cột
--     event_id — KHÔNG gắn nhờ hoạt động của sự kiện vào lead/deal liên
--     kết của nó (sai mô hình: sự kiện chưa có deal/lead liên kết vẫn
--     phải ghi được hoạt động, và hoạt động của sự kiện không thuộc về
--     một lead/deal cụ thể nào).
--   * State app sau đợt này: activity mang ĐÚNG MỘT trong 4 khoá
--     {deal, lead, game, event} (khoá vắng = không phải chủ đó).
--   * Việc (task) gắn sự kiện KHÔNG dùng file này: task.event đi qua
--     tasks.legacy_extra như task.company/lead/game (tiền lệ task-context),
--     không cột/SQL mới cho tasks.
--
-- THAY ĐỔI (tất cả an toàn khi chạy lại, không mất dữ liệu):
--   1) event_id: cột mới nullable, FK -> events ON DELETE CASCADE (xoá
--      sự kiện thì hoạt động gắn trực tiếp vào nó bị xoá theo — cùng
--      ngữ nghĩa cascade của 3 chủ hiện tại; phía app deleteEvent cũng
--      tự lọc các hoạt động đó, còn VIỆC gắn sự kiện chỉ bị gỡ liên kết).
--   2) CHECK activities_exactly_one_owner: nới thành đúng một trong bốn
--      cột chủ (deal_id, lead_id, game_id, event_id) khác NULL — chặn ở
--      tầng DB cả 3 ca: 0 chủ, 2+ chủ. Dòng cũ thoả mãn ngay.
--   3) Index theo event_id (3 chủ cũ đã có index riêng).
--
-- KHÔNG THAY ĐỔI: RLS/policy của activities (activities_all_bd: chỉ
-- Admin + BD toàn quyền; MKT/anon không có policy nào — hoạt động gắn
-- sự kiện vẫn thuộc cụm dữ liệu BD, MKT không đọc được), policy của
-- events/event_links/tasks, grant, trigger updated_at, các cột còn lại.
-- ============================================================================

-- 1) Cột chủ mới (nullable, FK cascade như 3 chủ hiện tại).
alter table public.activities
  add column if not exists event_id text references public.events (id) on delete cascade;

-- 2) CHECK đúng-một-chủ trong 4 chủ: drop-if-exists + add để chạy lại
--    luôn về đúng định nghĩa này (như mẫu activity-lead-game.sql).
alter table public.activities
  drop constraint if exists activities_exactly_one_owner;
alter table public.activities
  add constraint activities_exactly_one_owner
  check (
    (case when deal_id is not null then 1 else 0 end
     + case when lead_id is not null then 1 else 0 end
     + case when game_id is not null then 1 else 0 end
     + case when event_id is not null then 1 else 0 end) = 1
  );

-- 3) Index cho chủ mới.
create index if not exists activities_event_id_idx on public.activities (event_id);

comment on column public.activities.event_id is 'Chủ của hoạt động khi gắn TRỰC TIẾP vào Sự kiện (app: activities[].event) — không qua deal/lead liên kết của sự kiện. Đúng một trong deal_id/lead_id/game_id/event_id khác NULL (CHECK activities_exactly_one_owner).';

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (SELECT vô hại — kết quả kỳ vọng: có thêm cột
-- event_id nullable, 4 FK cascade, CHECK exactly_one_owner chứa cả
-- event_id, tổng số dòng không đổi so với trước khi chạy):
-- ============================================================================
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
order by ordinal_position;
