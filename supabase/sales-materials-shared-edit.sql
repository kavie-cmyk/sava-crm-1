-- ============================================================================
-- Sava Meta CRM — sales_materials: NỚI QUYỀN SỬA/XOÁ CHO MỌI BD/ADMIN
-- ============================================================================
-- Zac chốt 10/11/2026 17:00 ICT: "không cần ghi tên người tạo đâu, BD nào
-- cũng sửa được đi vì tài liệu dùng chung mà".
--
-- Thay đổi so với sales-materials.sql (đợt tạo module 10/11/2026):
--   * UPDATE/DELETE: BỎ điều kiện người tạo (created_by =
--     current_member_id()) — policy mới khớp đúng mẫu policy INSERT
--     hiện hành: mọi member đang active có vai admin/bd đều sửa/xoá
--     được MỌI tài liệu. Tên policy đổi *_own -> *_bd để phản ánh đúng
--     bản chất (không còn "own").
--   * SELECT giữ nguyên (xem chung admin/bd/mkt — MKT đọc được).
--   * INSERT giữ nguyên (admin/bd). MKT ghi vẫn bị chặn như cũ.
--   * Cột created_by GIỮ NGUYÊN: app vẫn ghi người tạo khi thêm tài
--     liệu như lệ hệ thống; cột chỉ không còn dùng để phân quyền hay
--     hiển thị nữa. KHÔNG siết thêm điều kiện created_by cho INSERT
--     (đề xuất cũ đã bị quyết định này thay thế hẳn).
--
-- An toàn chạy lại: drop policy if exists (cả tên cũ lẫn tên mới)
-- trước khi tạo lại.
-- ============================================================================

-- UPDATE: admin/bd sửa được mọi tài liệu (bỏ sales_materials_update_own).
drop policy if exists sales_materials_update_own on public.sales_materials;
drop policy if exists sales_materials_update_bd on public.sales_materials;
create policy sales_materials_update_bd on public.sales_materials
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- DELETE: admin/bd xoá được mọi tài liệu (bỏ sales_materials_delete_own).
drop policy if exists sales_materials_delete_own on public.sales_materials;
drop policy if exists sales_materials_delete_bd on public.sales_materials;
create policy sales_materials_delete_bd on public.sales_materials
  for delete to authenticated
  using (public.has_crm_role(array['admin', 'bd']));

-- Kiểm chứng sau khi chạy: đúng 4 policy (select_shared / insert_bd /
-- update_bd / delete_bd), UPDATE/DELETE không còn nhắc created_by.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'sales_materials'
order by policyname;
