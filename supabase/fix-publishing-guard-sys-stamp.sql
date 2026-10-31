-- ============================================================================
-- Sava Meta CRM — FIX C1: guard_publishing_request_update vs sys-stamp
-- ============================================================================
-- *** FILE CHỈ CHUẨN BỊ — CHƯA CHẠY LÊN PROJECT THẬT ***
-- Việc chạy file này do điều phối viên / quản trị quyết định riêng sau khi
-- duyệt nội dung. Code frontend/adapter đã tái hiện được lỗi ở tầng harness.
--
-- BỐI CẢNH / LỖI:
--   Trigger guard_publishing_request_update (supabase/policies.sql) cấm vai
--   MKT đổi legacy_extra của public.publishing_requests — túi legacy_extra
--   phải khoá với MKT vì nó là "túi dự phòng" của bộ nạp, MKT không có lý
--   do chạm vào.
--   NHƯNG 3 trường hệ thống createdAt / updatedAt / updatedBy (đợt "thời
--   gian cập nhật + lịch sử chỉnh sửa", xem shared.js SYS_FIELDS) cũng sống
--   trong legacy_extra của publishing_requests qua adapter (không có cột
--   riêng). Mỗi lần MKT lưu (kể cả chỉ đổi status / lưu revision),
--   stampCollection đóng dấu updatedAt/updatedBy mới vào legacy_extra ->
--   phép so sánh legacy_extra toàn phần của guard thấy khác -> RAISE
--   'MKT không được sửa thông tin gốc...' -> đồng bộ của MKT chết, revision
--   không lên được server.
--
-- THAY ĐỔI DUY NHẤT CỦA FILE NÀY:
--   Định nghĩa lại (CREATE OR REPLACE) hàm
--   public.guard_publishing_request_update() sao cho phép so sánh
--   legacy_extra LOẠI TRỪ đúng 3 khoá hệ thống 'createdAt', 'updatedAt',
--   'updatedBy' ở CẢ HAI phía old/new:
--       (new.legacy_extra - 'createdAt' - 'updatedAt' - 'updatedBy')
--         is distinct from
--       (old.legacy_extra - 'createdAt' - 'updatedAt' - 'updatedBy')
--   (toán tử '-' trên jsonb xoá khoá; legacy_extra là jsonb not null
--   default '{}' nên biểu thức an toàn, is distinct from xử lý được cả
--   trường hợp NULL nếu có dòng cũ lệch chuẩn.)
--
-- GIỮ NGUYÊN TUYỆT ĐỐI (đối chiếu policies.sql, không nới lỏng thêm):
--   * Nhóm bất biến định danh với MỌI vai: id / created_at / created_by.
--   * Với MKT, mọi cột gốc khác vẫn khoá y nguyên: kind, game_id,
--     company_id, requested_by, requested_at, intake, build_label,
--     source_url, assignee_id, due_date, due_raw, request_note,
--     migrated_from — và legacy_extra NGOÀI 3 khoá hệ thống ở trên.
--   * status / current_revision_no / legacy_revision_counter / updated_at
--     vẫn được MKT đổi như trước (không nằm trong danh sách khoá).
--   * BD/Admin không bị trigger này hạn chế ở các cột nghiệp vụ (như cũ).
--   Hệ quả có chủ đích: MKT có thể khiến 3 khoá hệ thống trong
--   legacy_extra thay đổi (đó chính là dấu updatedAt/updatedBy do app tự
--   đóng khi lưu) — nhưng KHÔNG đọc/ghi được bất kỳ khoá legacy_extra nào
--   khác, và 3 khoá đó chỉ là siêu dữ liệu thời gian/người sửa, không chứa
--   dữ liệu gốc hay field nhạy cảm nào (expectations nằm ở bảng private,
--   không nằm ở legacy_extra của bảng này — CHECK
--   publishing_requests_legacy_extra_no_expectations vẫn nguyên hiệu lực).
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION chạy lại vô hại; trigger được
-- drop-if-exists + tạo lại để file tự sửa được cả trạng thái "hàm đã thay
-- nhưng trigger chưa gắn" nếu lần chạy trước dở dang.
-- ============================================================================

create or replace function public.guard_publishing_request_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'publishing_requests: id/created_at/created_by là bất biến';
  end if;
  if public.current_member_role() = 'mkt' then
    if new.kind is distinct from old.kind
       or new.game_id is distinct from old.game_id
       or new.company_id is distinct from old.company_id
       or new.requested_by is distinct from old.requested_by
       or new.requested_at is distinct from old.requested_at
       or new.intake is distinct from old.intake
       or new.build_label is distinct from old.build_label
       or new.source_url is distinct from old.source_url
       or new.assignee_id is distinct from old.assignee_id
       or new.due_date is distinct from old.due_date
       or new.due_raw is distinct from old.due_raw
       or new.request_note is distinct from old.request_note
       or new.migrated_from is distinct from old.migrated_from
       -- FIX C1: so legacy_extra SAU KHI LOẠI 3 khoá hệ thống ở cả hai
       -- phía — chỉ 3 khoá này được phép khác; mọi khoá khác khác là chặn.
       or (new.legacy_extra - 'createdAt' - 'updatedAt' - 'updatedBy')
          is distinct from
          (old.legacy_extra - 'createdAt' - 'updatedAt' - 'updatedBy') then
      raise exception 'MKT không được sửa thông tin gốc của yêu cầu đánh giá (chỉ lưu revision + trạng thái)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists publishing_requests_guard_update on public.publishing_requests;
create trigger publishing_requests_guard_update
  before update on public.publishing_requests
  for each row execute function public.guard_publishing_request_update();
