-- ============================================================================
-- Sava Meta CRM — FIX C5: siết audit_log (chạy SAU supabase/audit-log.sql)
-- ============================================================================
-- *** ĐÃ ÁP DỤNG LÊN PROJECT THẬT + ĐÃ VERIFY (điều phối viên đã chạy và kiểm chứng ở đợt trước) ***
-- Việc chạy file này do điều phối viên / quản trị quyết định riêng sau khi
-- duyệt nội dung. Tiền điều kiện: schema.sql + policies.sql + audit-log.sql
-- đã chạy (bảng public.audit_log + helper public.has_crm_role(text[]) /
-- public.current_member_id() đã tồn tại).
--
-- HIỆN TRẠNG (supabase/audit-log.sql) VÀ LÝ DO SIẾT:
--   1) Policy INSERT audit_log_insert_own chỉ yêu cầu is_active_member()
--      + by_member_id = current_member_id() -> vai 'Khác' ('other', member
--      active nhưng không thuộc luồng CRM nào) cũng ghi được lịch sử.
--   2) entity_type không có CHECK -> client khai loại đối tượng tuỳ ý.
--   3) Cột `at` do CLIENT gửi (mặc định now() chỉ khi thiếu) -> member có
--      thể bịa mục lịch sử cho bất kỳ đối tượng nào với thời gian tuỳ ý
--      (kết hợp by_member_id khớp chính mình là qua được policy cũ).
--
-- THAY ĐỔI CỦA FILE NÀY (3 mục, tất cả đều an toàn khi chạy lại):
--
--   (a) THAY POLICY INSERT: yêu cầu has_crm_role(array['admin','bd','mkt'])
--       — has_crm_role đã bao gồm điều kiện member còn active (xem
--       schema.sql) — VÀ by_member_id = public.current_member_id() như cũ.
--       Hệ quả: vai 'other' mất quyền insert audit; admin/bd/mkt active
--       vẫn ghi như cũ; mạo danh người khác vẫn bị chặn bởi điều kiện khớp
--       current_member_id(). Tên policy giữ nguyên audit_log_insert_own.
--
--   (b) CHECK entity_type thuộc tập app THẬT SỰ sinh — đối chiếu:
--       shared.js CRM_ENTITY_TYPES = deal, company, lead, game, task,
--       member, activity (qua stampCollection ở index.html save()) +
--       'request' của kho Publishing (publishing.js write()). Không có
--       loại nào khác được sinh ở bất kỳ đường lưu nào.
--       Hệ quả: dòng audit CÓ SẴN với entity_type ngoài tập này (nếu có)
--       sẽ khiến lệnh ADD CONSTRAINT thất bại — khi đó cần dọn dữ liệu lạ
--       trước rồi chạy lại file; app hiện tại không sinh loại lạ nên kho
--       thật dự kiến không vướng.
--
--   (c) TRIGGER BEFORE INSERT ép at = now() bất kể client gửi gì.
--       Hệ quả: client gửi `at` (supabase-data.js vẫn gửi thời điểm sửa
--       trên máy người dùng) sẽ bị GHI ĐÈ bằng thời gian server. App không
--       phụ thuộc `at` của client cho thứ tự hiển thị nào ngoài việc drawer
--       sắp xếp giảm dần theo `at` (auditListFor order by at desc) — thứ
--       tự theo thời gian server vẫn đúng và còn nhất quán hơn khi đồng hồ
--       các máy lệch nhau. Độ phân giải thời gian của các mục trong cùng
--       một lần lưu (cùng now() theo transaction... thực tế now() là thời
--       gian bắt đầu transaction nên các dòng insert trong cùng 1 lệnh/
--       transaction có thể trùng `at`) — drawer chỉ hiển thị, không phân
--       trang theo `at`, nên trùng mốc trong cùng một đợt lưu là chấp
--       nhận được.
--       Lưu ý: trigger chỉ ép khi INSERT; audit_log vốn không có policy
--       UPDATE cho ai nên `at` không đổi được sau khi ghi (như cũ).
--
-- KHÔNG THAY ĐỔI: policy SELECT (bd/admin đọc tất cả; mkt chỉ game +
-- request), việc không có policy/grant UPDATE+DELETE (append-only),
-- grant select,insert cho authenticated, index theo đối tượng.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) Policy INSERT: chỉ admin/bd/mkt đang active + khớp người gọi
-- ----------------------------------------------------------------------------
drop policy if exists audit_log_insert_own on public.audit_log;
create policy audit_log_insert_own on public.audit_log
  for insert to authenticated
  with check (
    public.has_crm_role(array['admin', 'bd', 'mkt'])
    and by_member_id = public.current_member_id()
  );

-- ----------------------------------------------------------------------------
-- (b) CHECK entity_type thuộc tập đã biết
--     drop-if-exists + add: chạy lại luôn đưa constraint về đúng định
--     nghĩa này (idempotent), kể cả khi lần chạy trước đã thêm dở.
-- ----------------------------------------------------------------------------
alter table public.audit_log
  drop constraint if exists audit_log_entity_type_known_check;
alter table public.audit_log
  add constraint audit_log_entity_type_known_check
  check (entity_type in ('deal', 'company', 'lead', 'game', 'task', 'member', 'activity', 'request'));

-- ----------------------------------------------------------------------------
-- (c) Trigger BEFORE INSERT: ép at = now() của server
-- ----------------------------------------------------------------------------
create or replace function public.audit_log_force_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.at = now();
  return new;
end;
$$;

drop trigger if exists audit_log_force_at on public.audit_log;
create trigger audit_log_force_at
  before insert on public.audit_log
  for each row execute function public.audit_log_force_at();
