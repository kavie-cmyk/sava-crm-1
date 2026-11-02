-- ============================================================================
-- Sava Meta CRM — Mở rộng trạng thái tiếp cận của Lead (lead outreach status)
-- ============================================================================
-- *** FILE MỚI — việc chạy file này lên project thật do điều phối viên /
--     quản trị quyết định riêng sau khi duyệt nội dung. ***
-- Tiền điều kiện: schema.sql đã chạy (bảng public.leads đã tồn tại với
-- CHECK status ban đầu chỉ gồm 4 trạng thái vòng đời).
--
-- ĐIỀU KIỆN TIÊN QUYẾT: file này PHẢI được chạy TRƯỚC khi chạy payload
-- nạp Metaverse v2 (payload đó sinh lead mang các trạng thái tiếp cận
-- mới dưới đây — chưa nới CHECK thì mọi INSERT/UPDATE mang status mới
-- đều bị constraint chặn và payload nạp sẽ thất bại).
--
-- BỐI CẢNH: app (index.html, hằng LEAD_STATUSES — nguồn sự thật duy nhất
-- cho form select / chip / block view Lead) mở rộng trạng thái lead từ
-- 4 trạng thái vòng đời cũ thành 12 trạng thái hạng nhất:
--   cũ:  new, contacted, qualified, converted
--   mới: sent_connect, first_message, first_email, first_fu,
--        in_response, in_reply, discovery_meeting, not_yet_have_demand
-- Phía client KHÔNG có whitelist nào lọc status (adapter giữ nguyên
-- lead.status qua cột leads.status; migrateState không ép status lạ về
-- 'new') — ràng buộc DUY NHẤT chặn status mới là CHECK của bảng leads
-- trong schema.sql:
--   status text ... check (status in ('new','contacted','qualified','converted'))
-- File này nới đúng CHECK đó thành đủ 12 key. Không đổi cột, không đổi
-- dữ liệu sẵn có (mọi status cũ đều nằm trong tập mới).
--
-- TÊN CONSTRAINT: schema.sql khai CHECK ngay trong định nghĩa cột nên
-- Postgres tự đặt tên — với bảng leads, tên tự sinh dự kiến là
-- `leads_status_check`. TRƯỚC KHI CHẠY, đối chiếu tên thật bằng SELECT
-- ở cuối file này (mục KIỂM CHỨNG, câu 1): nếu tên thật KHÁC
-- `leads_status_check`, lệnh drop bên dưới sẽ không đụng được constraint
-- cũ và lệnh add sẽ tạo THÊM một CHECK thứ hai vẫn chặn status mới —
-- khi đó phải sửa tên trong lệnh drop cho khớp tên thật rồi mới chạy.
--
-- CHẠY LẠI AN TOÀN (idempotent): drop constraint if exists + add lại
-- luôn đưa CHECK về đúng định nghĩa này, kể cả khi lần chạy trước đã
-- thêm dở (đúng mẫu audit-log-tighten.sql / events-module.sql).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Nới CHECK status của public.leads thành đủ 12 trạng thái
-- ----------------------------------------------------------------------------
alter table public.leads
  drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in ('new','contacted','qualified','converted','sent_connect','first_message','first_email','first_fu','in_response','in_reply','discovery_meeting','not_yet_have_demand'));

-- ============================================================================
-- KIỂM CHỨNG (các SELECT vô hại — chạy TRƯỚC để đối chiếu tên constraint
-- thật, và chạy LẠI SAU để xác nhận định nghĩa cuối):
--   1) Tra tên + định nghĩa của MỌI CHECK constraint trên bảng leads có
--      nhắc tới cột status (tên thật phải là leads_status_check; nếu
--      khác, xem lưu ý ở header trước khi chạy phần nới CHECK ở trên):
--        select conname, pg_get_constraintdef(oid) as definition
--        from pg_constraint
--        where conrelid = 'public.leads'::regclass
--          and contype = 'c'
--          and pg_get_constraintdef(oid) ilike '%status%';
--   2) Sau khi chạy: định nghĩa in ra từ câu 1 phải chứa đủ 12 key
--      ('new','contacted','qualified','converted','sent_connect',
--      'first_message','first_email','first_fu','in_response',
--      'in_reply','discovery_meeting','not_yet_have_demand').
-- ============================================================================
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.leads'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%status%';
