-- ============================================================================
-- Sava Meta CRM — Module SỰ KIỆN (events + event_links + mở rộng audit_log)
-- ============================================================================
-- *** FILE MỚI — việc chạy file này lên project thật do điều phối viên /
--     quản trị quyết định riêng sau khi duyệt nội dung. ***
-- Tiền điều kiện (thứ tự chạy): schema.sql + policies.sql + audit-log.sql
--   (+ audit-log-tighten.sql) đã chạy — tức các bảng/hàm sau đã tồn tại:
--   public.audit_log (kèm constraint audit_log_entity_type_known_check),
--   helper public.has_crm_role(text[]) và trigger helper
--   public.set_updated_at() (đều ở schema.sql).
-- File này chạy SAU các file trên và TRƯỚC khi bật module Sự kiện ở
-- frontend (tầng dữ liệu supabase-data.js đã fetch/upsert 2 bảng này qua
-- qSafe: bảng chưa tồn tại / RLS từ chối phía MKT được nuốt êm như tasks).
--
-- BỐI CẢNH / HỢP ĐỒNG DỮ LIỆU (đã chốt):
--   * State app: S.events = [{ id, name, date, location, note,
--     attendees:[memberId...], companies:[companyId...],
--     leads:[leadId...], deals:[dealId...], createdAt, updatedAt,
--     updatedBy }].
--   * `date` của app là chuỗi lẫn lộn ISO + chữ tự do -> cặp cột
--     event_date (date, chỉ khi parse được ISO) + date_raw (text, giữ
--     nguyên chuỗi gốc) như mọi field ngày khác (lead.when, deal.due).
--   * attendees, note và 3 trường hệ thống (createdAt/updatedAt/
--     updatedBy) KHÔNG có cột riêng: chúng đi qua legacy_extra của bảng
--     events (adapter: EVENT_KNOWN = id/name/date/location/companies/
--     leads/deals) — đúng tiền lệ lead.phone/mainContact, deal.vertical.
--   * Nguồn sự thật của liên kết Event<->{Company,Lead,Deal} là 3 mảng
--     id TRÊN event (đúng tiền lệ deal.leads) -> vật hoá thành dòng ở
--     bảng nối event_links. KHÔNG lưu ngược phía company/lead/deal.
--   * event_links.entity_id KHÔNG đặt FK: app tự dọn liên kết khi xoá
--     entity đích (tiền lệ task link qua legacy_extra), và loại đối tượng
--     đích thay đổi theo entity_type nên FK đa hình không đặt được.
--     Riêng event_id CÓ FK cascade: xoá event là DB tự xoá links của nó.
--   * Quyền: chỉ Admin + BD (như deals/deal_leads). MKT và anon KHÔNG có
--     policy nào trên 2 bảng này — không đọc/ghi được kể cả gọi API trực
--     tiếp. Bảng tạo SAU blanket grant ở policies.sql nên grant ở đây
--     phải tường minh.
--   * audit_log: mở rộng CHECK entity_type thêm 'event' để lịch sử chỉnh
--     sửa của sự kiện (stampCollection qua CRM_ENTITY_TYPES trong
--     shared.js) ghi được; các loại cũ giữ nguyên.
--
-- MỌI LỆNH ĐỀU AN TOÀN KHI CHẠY LẠI: create table/index if not exists,
-- drop policy/trigger/constraint if exists trước khi tạo lại.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bảng public.events
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id           text primary key,                      -- app: events[].id
  name         text not null,                         -- app: name
  event_date   date,                                  -- app: date khi parse được ISO
  date_raw     text not null default '',              -- app: date (chuỗi gốc)
  location     text not null default '',              -- app: location
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text,                                  -- member id người tạo
  legacy_extra jsonb not null default '{}'::jsonb     -- app: attendees, note, createdAt, updatedAt, updatedBy + khoá lạ
);
comment on table public.events is 'Sự kiện của CRM (S.events trong sava_crm_shared_v1). attendees/note/trường hệ thống nằm ở legacy_extra; liên kết công ty/lead/deal nằm ở event_links.';

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Bảng nối public.event_links (Event <-> Company/Lead/Deal)
-- ----------------------------------------------------------------------------
create table if not exists public.event_links (
  event_id    text not null references public.events (id) on delete cascade, -- app: events[].id
  entity_type text not null
              check (entity_type in ('company', 'lead', 'deal')),            -- loại đối tượng đích
  entity_id   text not null,                        -- id của company/lead/deal (KHÔNG FK — xem header)
  created_at  timestamptz not null default now(),
  created_by  text,
  primary key (event_id, entity_type, entity_id)
);
comment on table public.event_links is 'Liên kết Event<->{Company,Lead,Deal}, vật hoá từ 3 mảng companies/leads/deals trên event (nguồn sự thật phía app).';

create index if not exists event_links_entity_idx
  on public.event_links (entity_type, entity_id);
create index if not exists event_links_event_id_idx
  on public.event_links (event_id);

-- ----------------------------------------------------------------------------
-- 3) RLS + policy: chỉ Admin + BD toàn quyền (mẫu deal_leads_all_bd trong
--    policies.sql). MKT/anon: không policy nào.
-- ----------------------------------------------------------------------------
alter table public.events      enable row level security;
alter table public.event_links enable row level security;

drop policy if exists events_all_bd on public.events;
create policy events_all_bd on public.events
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

drop policy if exists event_links_all_bd on public.event_links;
create policy event_links_all_bd on public.event_links
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- Bảng tạo sau blanket grant ở policies.sql -> grant tường minh.
grant select, insert, update, delete on public.events, public.event_links to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Mở rộng CHECK audit_log.entity_type: thêm 'event'
--    drop-if-exists + add: chạy lại luôn đưa constraint về đúng định
--    nghĩa này (idempotent), giữ nguyên tập loại cũ của
--    audit-log-tighten.sql.
-- ----------------------------------------------------------------------------
alter table public.audit_log
  drop constraint if exists audit_log_entity_type_known_check;
alter table public.audit_log
  add constraint audit_log_entity_type_known_check
  check (entity_type in ('deal', 'company', 'lead', 'game', 'task', 'member', 'activity', 'request', 'event'));

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (các SELECT vô hại dưới đây — chạy file xong thì
-- xem kết quả, hoặc chạy tay lại từng câu):
--   1) Hai bảng tồn tại kèm cột đúng hợp đồng:
--        select table_name, column_name, data_type, is_nullable
--        from information_schema.columns
--        where table_schema = 'public' and table_name in ('events', 'event_links')
--        order by table_name, ordinal_position;
--   2) Policy tồn tại đúng 2 policy *_all_bd (kết quả dưới đây):
--   3) Constraint audit chứa 'event' (câu cuối cùng — định nghĩa in ra
--      phải chứa 'event' trong danh sách entity_type).
-- ============================================================================
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('events', 'event_links')
order by tablename, policyname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'audit_log_entity_type_known_check';
