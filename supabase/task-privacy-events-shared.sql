-- ============================================================================
-- Sava Meta CRM — SIẾT QUYỀN XEM VIỆC theo người phụ trách + SỰ KIỆN xem chung
-- ============================================================================
-- Chỉ đạo của Zac (09/11/2026): "mỗi BD hay MKT chỉ thấy việc của người đó;
-- sự kiện có thể xem chung; nhưng việc cần làm thì chỉ người đó và Admin
-- xem được thôi."
--
-- Tiền điều kiện: schema.sql + policies.sql + events-module.sql đã chạy —
-- tức bảng public.tasks (cột assignee_id) + public.events/public.event_links
-- đã tồn tại, kèm helper sẵn có của schema.sql:
--   public.current_member_id()   -> member id của auth user đang đăng nhập
--                                   (qua profiles.member_id — ĐÚNG cơ chế map
--                                   user->member mà mọi policy cũ đang dùng)
--   public.has_crm_role(text[])  -> member còn active VÀ role chuẩn hoá
--                                   ('admin'|'bd'|'mkt'|'other') thuộc danh sách
-- File này KHÔNG invent cơ chế map mới — chỉ dùng lại hai helper trên.
--
-- TRẠNG THÁI TRƯỚC (đọc từ pg_policies trên project thật trước khi áp):
--   * tasks: 4 policy tasks_select/insert/update/delete — tất cả chỉ
--     has_crm_role(array['admin','bd']): MỌI BD đọc/sửa/xoá được việc của
--     MỌI người; MKT không có policy nào (không đọc được việc nào).
--   * events: 1 policy events_all_bd FOR ALL chỉ admin+bd; event_links:
--     event_links_all_bd FOR ALL chỉ admin+bd. MKT không đọc được sự kiện.
--
-- THAY ĐỔI:
--   1) tasks SELECT/UPDATE/DELETE: Admin thấy tất cả; BD/MKT chỉ thấy/sửa/
--      xoá việc có assignee_id = current_member_id() của chính mình. Việc
--      CHƯA GÁN (assignee_id NULL) không bao giờ khớp điều kiện người phụ
--      trách -> chỉ Admin thấy. Chặn ở tầng PostgREST: BD gọi API lấy việc
--      của người khác -> 0 dòng; UPDATE/DELETE việc người khác -> 0 dòng
--      (RLS USING lọc mất dòng đích).
--      UPDATE mang WITH CHECK cùng điều kiện: BD/MKT sửa việc của mình mà
--      đổi người phụ trách sang người khác sẽ bị RLS từ chối ở tầng dữ
--      liệu — bàn giao việc cho người khác đi qua đường TẠO việc mới gán
--      cho người đó (INSERT cho phép, xem dưới) rồi đóng/xoá việc cũ của
--      mình; Admin đổi người phụ trách tự do.
--   2) tasks INSERT: GIỮ NGUYÊN như hiện tại — has_crm_role(admin,bd),
--      KHÔNG kèm điều kiện trên assignee_id: người tạo gán việc cho bất kỳ
--      ai; sau khi gán, việc chỉ còn người được gán + Admin thấy (kể cả
--      người tạo không phải Admin cũng không còn thấy — hệ quả trực tiếp
--      của policy SELECT ở trên). MKT vẫn không tạo được việc (giữ nguyên).
--   3) events SELECT: nới cho MỌI member CRM đang active thuộc luồng
--      Admin/BD/MKT đọc được sự kiện (xem chung). INSERT/UPDATE/DELETE
--      events GIỮ NGUYÊN chỉ Admin+BD (tách policy theo operation thay cho
--      policy FOR ALL cũ). event_links GIỮ NGUYÊN chỉ Admin+BD: liên kết
--      sự kiện<->deal của MKT không được lộ qua bảng nối này (MKT vốn bị
--      chặn khỏi deals ở tầng dữ liệu); sự kiện tự thân (tên/ngày/địa
--      điểm) vẫn đọc được đầy đủ qua policy SELECT mới.
--
-- MỌI LỆNH ĐỀU AN TOÀN KHI CHẠY LẠI: drop policy if exists trước khi tạo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TASKS — riêng tư theo người phụ trách
-- ----------------------------------------------------------------------------
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.has_crm_role(array['admin'])
    or (public.has_crm_role(array['bd', 'mkt']) and assignee_id = public.current_member_id())
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.has_crm_role(array['admin', 'bd']));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.has_crm_role(array['admin'])
    or (public.has_crm_role(array['bd', 'mkt']) and assignee_id = public.current_member_id())
  )
  with check (
    public.has_crm_role(array['admin'])
    or (public.has_crm_role(array['bd', 'mkt']) and assignee_id = public.current_member_id())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.has_crm_role(array['admin'])
    or (public.has_crm_role(array['bd', 'mkt']) and assignee_id = public.current_member_id())
  );

-- ----------------------------------------------------------------------------
-- 2) EVENTS — SELECT xem chung (Admin/BD/MKT); ghi vẫn chỉ Admin+BD
-- ----------------------------------------------------------------------------
drop policy if exists events_all_bd on public.events;
drop policy if exists events_select_shared on public.events;
create policy events_select_shared on public.events
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd', 'mkt']));

drop policy if exists events_insert_bd on public.events;
create policy events_insert_bd on public.events
  for insert to authenticated
  with check (public.has_crm_role(array['admin', 'bd']));

drop policy if exists events_update_bd on public.events;
create policy events_update_bd on public.events
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

drop policy if exists events_delete_bd on public.events;
create policy events_delete_bd on public.events
  for delete to authenticated
  using (public.has_crm_role(array['admin', 'bd']));

-- event_links: KHÔNG đổi — policy event_links_all_bd (admin+bd) giữ nguyên.

-- ============================================================================
-- KIỂM CHỨNG SAU KHI CHẠY (SELECT vô hại):
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename in ('tasks', 'events', 'event_links')
--   order by tablename, policyname;
-- Kỳ vọng: tasks có 4 policy (select/update/delete mang điều kiện
-- assignee_id = current_member_id() cho bd/mkt + nhánh admin; insert chỉ
-- has_crm_role(admin,bd)); events có 4 policy (select_shared cho
-- admin/bd/mkt + insert/update/delete cho admin/bd); event_links vẫn 1
-- policy event_links_all_bd.
-- ============================================================================
