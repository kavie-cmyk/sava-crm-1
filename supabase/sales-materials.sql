-- ============================================================================
-- Sava Meta CRM — Module TÀI LIỆU BÁN HÀNG (sales_materials)
-- ============================================================================
-- Chỉ đạo của Zac (10/11/2026): tích hợp thêm phần tài liệu bán hàng — có
-- deck và demo — BD tự thêm được; nội dung XEM CHUNG cả team (kể cả MKT
-- đọc được ở tầng dữ liệu). Giao diện CHỈ ở app BD (index.html); KHÔNG
-- làm bề mặt hiển thị ở trang MKT (Zac chốt 10/11/2026 qua widget) —
-- MKT đọc được là nhờ policy SELECT bên dưới, không cần UI lần này.
--
-- Tiền điều kiện: schema.sql + policies.sql + audit-log.sql (+ tighten)
--   + events-module.sql đã chạy — tức helper public.has_crm_role(text[]),
--   public.current_member_id() và trigger helper public.set_updated_at()
--   đã tồn tại, và CHECK audit_log_entity_type_known_check đang là tập
--   ('deal','company','lead','game','task','member','activity',
--    'request','event') (đã đọc lại từ server trước khi áp file này).
--
-- HỢP ĐỒNG DỮ LIỆU:
--   * State app: S.salesMaterials = [{ id, title, kind, url, description,
--     line, createdBy, createdAt, updatedAt, updatedBy }].
--   * kind: 'deck' | 'demo' | 'other' (hiển thị Deck / Demo / Tài liệu khác).
--   * line: 'chung' (Dùng chung) hoặc một khoá mảng THẬT của app trong
--     shared.js LINES: 'game_studio' | 'publishing' | 'ai' | 'metaverse'.
--   * createdBy (member id người tạo) CÓ cột riêng created_by — app
--     vẫn ghi người tạo khi thêm tài liệu như lệ hệ thống. Từ quyết
--     định Zac 10/11/2026 17:00, cột này KHÔNG còn dùng để phân quyền
--     (mọi BD/Admin sửa/xoá được mọi tài liệu) hay hiển thị trên thẻ;
--     xem supabase/sales-materials-shared-edit.sql.
--   * 3 trường hệ thống createdAt/updatedAt/updatedBy KHÔNG có cột riêng:
--     chúng đi qua legacy_extra như mọi entity khác (mẫu events:
--     attendees/note/sys qua legacy_extra) — adapter SALES_KNOWN cố ý
--     không chứa chúng. Cột created_at/updated_at ở đây là mốc DB
--     (trigger set_updated_at lo updated_at), khác với dấu hệ thống app
--     trong legacy_extra.
--   * Quyền (mẫu "xem chung" của events — events_select_shared
--     09/11/2026; quyền ghi nới theo quyết định Zac 10/11/2026 17:00 —
--     tài liệu dùng chung nên BD nào cũng sửa/xoá được):
--       SELECT: mọi member đang active (admin/bd/mkt).
--       INSERT: admin/bd.
--       UPDATE/DELETE: admin/bd (mọi tài liệu, không điều kiện
--         người tạo — sales-materials-shared-edit.sql).
--       Anon/chưa đăng nhập: KHÔNG policy nào + revoke tường minh.
--   * Audit: TÍCH HỢP audit_log — nới CHECK entity_type thêm
--     'sales_material' (giữ nguyên tập cũ + 'event'), khớp
--     CRM_ENTITY_TYPES [["salesMaterials","sales_material"]] trong
--     shared.js: đường lưu save() đóng dấu + sinh mục lịch sử như mọi
--     entity khác, không kênh lưu riêng.
--
-- MỌI LỆNH ĐỀU AN TOÀN KHI CHẠY LẠI: create table if not exists,
-- drop policy/trigger/constraint if exists trước khi tạo lại.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Bảng public.sales_materials
-- ----------------------------------------------------------------------------
create table if not exists public.sales_materials (
  id           text primary key,                      -- app: salesMaterials[].id
  title        text not null,                         -- app: title
  kind         text not null default 'other'
               check (kind in ('deck', 'demo', 'other')), -- app: kind
  url          text not null default '',              -- app: url (link tài liệu)
  description  text not null default '',              -- app: description (mô tả)
  line         text not null default 'chung'
               check (line in ('chung', 'game_studio', 'publishing', 'ai', 'metaverse')), -- app: line ('chung' = Dùng chung; còn lại là khoá LINES của shared.js)
  created_by   text,                                  -- app: createdBy (member id người tạo; chỉ ghi nhận, không dùng phân quyền/hiển thị — Zac chốt 10/11/2026 17:00)
  image_url    text not null default '',              -- app: imageUrl (ảnh đại diện TUỲ CHỌN; đợt 10/11/2026 — xem sales-materials-image.sql)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  legacy_extra jsonb not null default '{}'::jsonb     -- app: createdAt, updatedAt, updatedBy + khoá lạ
);
comment on table public.sales_materials is 'Tài liệu bán hàng dùng chung của CRM (S.salesMaterials trong sava_crm_shared_v1): deck/demo/tài liệu khác, BD tự thêm, cả team (admin/bd/mkt) đọc được; Admin/BD nào cũng sửa/xoá được mọi tài liệu (Zac chốt 10/11/2026). Trường hệ thống app nằm ở legacy_extra; created_by chỉ ghi nhận người tạo, không dùng phân quyền.';

drop trigger if exists sales_materials_set_updated_at on public.sales_materials;
create trigger sales_materials_set_updated_at
  before update on public.sales_materials
  for each row execute function public.set_updated_at();

create index if not exists sales_materials_created_by_idx
  on public.sales_materials (created_by);

-- ----------------------------------------------------------------------------
-- 2) RLS + policy
-- ----------------------------------------------------------------------------
alter table public.sales_materials enable row level security;

-- SELECT: xem chung — mọi member đang active (admin/bd/mkt), đúng mẫu
-- events_select_shared.
drop policy if exists sales_materials_select_shared on public.sales_materials;
create policy sales_materials_select_shared on public.sales_materials
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd', 'mkt']));

-- INSERT: chỉ admin/bd (BD tự thêm được; MKT không thêm).
drop policy if exists sales_materials_insert_bd on public.sales_materials;
create policy sales_materials_insert_bd on public.sales_materials
  for insert to authenticated
  with check (public.has_crm_role(array['admin', 'bd']));

-- UPDATE: admin/bd sửa được MỌI tài liệu — Zac chốt 10/11/2026 17:00
-- (tài liệu dùng chung, bỏ điều kiện người tạo; đúng mẫu INSERT ở
-- trên). USING + WITH CHECK cùng điều kiện. Policy *_own cũ được
-- sales-materials-shared-edit.sql gỡ trên server đang chạy; cài mới
-- từ file này ra thẳng *_bd.
drop policy if exists sales_materials_update_own on public.sales_materials;
drop policy if exists sales_materials_update_bd on public.sales_materials;
create policy sales_materials_update_bd on public.sales_materials
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- DELETE: admin/bd xoá được MỌI tài liệu (như UPDATE).
drop policy if exists sales_materials_delete_own on public.sales_materials;
drop policy if exists sales_materials_delete_bd on public.sales_materials;
create policy sales_materials_delete_bd on public.sales_materials
  for delete to authenticated
  using (public.has_crm_role(array['admin', 'bd']));

-- Bảng tạo sau blanket grant ở policies.sql -> grant tường minh;
-- anon bị thu hồi tường minh (kèm việc không có policy nào cho anon).
revoke all on public.sales_materials from anon;
grant select, insert, update, delete on public.sales_materials to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Mở rộng CHECK audit_log.entity_type: thêm 'sales_material'
--    drop-if-exists + add: chạy lại luôn đưa constraint về đúng định
--    nghĩa này (idempotent), giữ nguyên tập cũ (gồm 'event' của
--    events-module.sql).
-- ----------------------------------------------------------------------------
alter table public.audit_log
  drop constraint if exists audit_log_entity_type_known_check;
alter table public.audit_log
  add constraint audit_log_entity_type_known_check
  check (entity_type in ('deal', 'company', 'lead', 'game', 'task', 'member', 'activity', 'request', 'event', 'sales_material'));

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (các SELECT vô hại dưới đây):
--   1) Bảng tồn tại kèm cột đúng hợp đồng:
--        select column_name, data_type, is_nullable
--        from information_schema.columns
--        where table_schema = 'public' and table_name = 'sales_materials'
--        order by ordinal_position;
--   2) Đúng 4 policy (select_shared / insert_bd / update_bd / delete_bd):
--   3) Constraint audit chứa 'sales_material' (câu cuối cùng).
-- ============================================================================
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'sales_materials'
order by policyname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'audit_log_entity_type_known_check';
