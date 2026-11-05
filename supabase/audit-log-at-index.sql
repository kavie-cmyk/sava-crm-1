-- ============================================================================
-- Sava Meta CRM — Index thời gian cho audit_log (tối ưu nhật ký, 05/11/2026)
-- ============================================================================
-- *** ĐÃ ÁP DỤNG LÊN PROJECT THẬT (sava-crm) + ĐÃ VERIFY qua pg_indexes ***
-- Chạy SAU supabase/audit-log.sql. Idempotent: chạy lại không tạo trùng.
--
-- LÝ DO: đường đọc "Lịch sử tổng" (Admin) trong app — SavaAudit.listRecent
-- ở supabase-data.js — đọc 200 mục MỚI NHẤT XUYÊN mọi loại đối tượng:
--   select ... from audit_log [where entity_type = ?] [where by_member_id = ?]
--   order by at desc limit 200;
-- Index sẵn có audit_log_entity_idx (entity_type, entity_id, at desc) chỉ
-- phục vụ đường đọc theo TỪNG đối tượng (drawer); truy vấn xuyên loại ở
-- trên không dùng hiệu quả được index đó cho bước sắp xếp theo `at`.
-- Index (at desc) này phục vụ đúng bước order by at desc limit 200.
--
-- KHÔNG đổi schema/policy/dữ kiện: chỉ thêm index (tổng số dòng giữ
-- nguyên 2.909 khi áp). Kiểm chứng 200 mục mới nhất: truy vấn của app chỉ
-- có "order by at desc" (không tiebreak) mà dữ kiện có NHÓM TRÙNG `at`
-- rất lớn (479 dòng cùng một mốc ở đúng biên cắt 200 — các đợt ghi hàng
-- loạt chung 1 now() của transaction), nên tập/trật tự trong nhóm trùng
-- ở biên vốn đã phụ thuộc execution plan từ trước. Sau khi thêm index,
-- ép plan cũ (set enable_indexscan = off) cho md5 tập 200 Y HỆT số đo
-- trước khi thêm (17f806de… theo thứ tự / b3b66464… theo tập) — dữ kiện
-- không đổi một dòng; plan mới dùng Index Scan using audit_log_at_idx
-- (EXPLAIN đã xác nhận).
-- ============================================================================

create index if not exists audit_log_at_idx
  on public.audit_log (at desc);
