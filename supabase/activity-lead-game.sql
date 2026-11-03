-- ============================================================================
-- Sava Meta CRM — Hoạt động gắn TRỰC TIẾP vào Lead / Game (activities mở rộng chủ)
-- ============================================================================
-- *** ĐÃ ÁP DỤNG LÊN PROJECT THẬT (vaegwvawlwpckfkmjzsj) ở đợt này — xem
--     bằng chứng trước/sau trong bàn giao: trước khi áp, activities có
--     0 dòng, deal_id NOT NULL + FK -> deals, 1 policy activities_all_bd. ***
-- Tiền điều kiện: schema.sql + policies.sql đã chạy (bảng public.activities
--   + FK activities_deal_id_fkey + policy activities_all_bd đã tồn tại).
--
-- BỐI CẢNH / LÝ DO CHỌN MÔ HÌNH:
--   * Trước đây hoạt động BẮT BUỘC gắn deal: activities.deal_id NOT NULL + FK,
--     state app là {id, deal, ...}. Lead/Game chưa có deal thì không ghi được
--     hoạt động trực tiếp (Việc 7 chỉ cho ghi qua deal liên kết).
--   * Phương án ĐÃ CHỌN — cột FK trực tiếp trên activities (lead_id, game_id),
--     KHÔNG dùng bảng nối: (1) đúng tiền lệ publishing_requests trong chính
--     schema này (game_id/company_id + CHECK ép đúng một chủ theo kind);
--     (2) một hoạt động luôn có ĐÚNG MỘT chủ nên bảng nối (mẫu event_links —
--     vốn dành cho quan hệ NHIỀU–NHIỀU của sự kiện) là thừa và kéo theo cả
--     một cơ chế đồng bộ bảng nối riêng; (3) adapter/diff-sync sẵn có xử lý
--     activities như một bảng đơn theo id — thêm 2 cột giữ nguyên đường đó,
--     chỉ cần nới validate + ensureParentRows cho 2 cha mới.
--   * State app sau đợt này: activity mang ĐÚNG MỘT trong 3 khoá
--     {deal, lead, game} (khoá vắng = không phải chủ đó — như deals.game /
--     tasks.deal vốn vắng khi không gắn).
--
-- THAY ĐỔI (tất cả an toàn khi chạy lại, không mất dữ liệu):
--   1) deal_id: bỏ NOT NULL (hoạt động gắn lead/game thì deal_id = NULL).
--      FK -> deals ON DELETE CASCADE giữ nguyên 100%.
--   2) lead_id: cột mới nullable, FK -> leads ON DELETE CASCADE (xoá lead
--      thì hoạt động gắn trực tiếp vào lead đó bị xoá theo — cùng ngữ nghĩa
--      cascade của deal_id; phía app deleteLead cũng tự lọc các hoạt động đó).
--   3) game_id: cột mới nullable, FK -> games ON DELETE CASCADE (như lead).
--   4) CHECK activities_exactly_one_owner: đúng một trong ba cột chủ
--      (deal_id, lead_id, game_id) khác NULL — chặn ở tầng DB cả 3 ca:
--      0 chủ, 2–3 chủ. Dòng cũ (deal_id có sẵn) thoả mãn ngay.
--   5) Index theo lead_id / game_id (deal_id đã có index sẵn).
--
-- KHÔNG THAY ĐỔI: RLS/policy của activities (activities_all_bd: chỉ
-- Admin + BD toàn quyền; MKT/anon không có policy nào — hoạt động gắn
-- lead/game vẫn thuộc cụm dữ liệu BD như cũ, MKT không đọc được kể cả
-- hoạt động gắn game), grant, trigger updated_at, các cột còn lại.
-- ============================================================================

-- 1) Nới NOT NULL của deal_id (idempotent: cột đã nullable thì là no-op).
alter table public.activities alter column deal_id drop not null;

-- 2) + 3) Hai cột chủ mới (nullable, FK cascade như deal_id).
alter table public.activities
  add column if not exists lead_id text references public.leads (id) on delete cascade;
alter table public.activities
  add column if not exists game_id text references public.games (id) on delete cascade;

-- 4) CHECK đúng-một-chủ: drop-if-exists + add để chạy lại luôn về đúng
--    định nghĩa này (như mẫu audit-log-tighten / events-module).
alter table public.activities
  drop constraint if exists activities_exactly_one_owner;
alter table public.activities
  add constraint activities_exactly_one_owner
  check (
    (case when deal_id is not null then 1 else 0 end
     + case when lead_id is not null then 1 else 0 end
     + case when game_id is not null then 1 else 0 end) = 1
  );

-- 5) Index cho hai chủ mới.
create index if not exists activities_lead_id_idx on public.activities (lead_id);
create index if not exists activities_game_id_idx on public.activities (game_id);

comment on column public.activities.deal_id is 'Chủ của hoạt động khi gắn Deal (app: activities[].deal). Đúng một trong deal_id/lead_id/game_id khác NULL (CHECK activities_exactly_one_owner).';
comment on column public.activities.lead_id is 'Chủ của hoạt động khi gắn TRỰC TIẾP vào Lead (app: activities[].lead) — không qua deal.';
comment on column public.activities.game_id is 'Chủ của hoạt động khi gắn TRỰC TIẾP vào Game (app: activities[].game) — không qua deal.';

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (SELECT vô hại — kết quả kỳ vọng: deal_id thành
-- is_nullable=YES, có thêm lead_id/game_id nullable, 3 FK cascade,
-- CHECK exactly_one_owner, tổng số dòng không đổi so với trước khi chạy):
-- ============================================================================
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
order by ordinal_position;
