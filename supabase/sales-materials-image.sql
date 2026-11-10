-- ============================================================================
-- Sava Meta CRM — sales_materials: thêm cột ẢNH ĐẠI DIỆN (image_url)
-- ============================================================================
-- Zac chốt đợt nạp demo 10/11/2026: MỌI tài liệu bán hàng có thêm ảnh
-- đại diện TUỲ CHỌN (URL ảnh). Quyết định schema: CỘT THẬT image_url —
-- bảng sales_materials vốn dùng cột thật cho mọi trường nội dung chính
-- (title/kind/url/description/line/created_by); legacy_extra chỉ chứa 3
-- trường HỆ THỐNG (createdAt/updatedAt/updatedBy) + khoá lạ, nên ảnh —
-- một trường nội dung do người dùng nhập — đi cột thật như url/description,
-- KHÔNG nhét vào legacy_extra.
--   * State app: salesMaterials[].imageUrl  <->  cột image_url.
--   * Adapter: 'imageUrl' nằm trong SALES_KNOWN (supabase-adapter.js),
--     ghi String(imageUrl||''), đọc image_url||''.
--   * Trống ('') = không có ảnh: thẻ hiển thị nền/huy hiệu loại dự phòng.
-- An toàn chạy lại: add column if not exists.
-- ============================================================================
alter table public.sales_materials
  add column if not exists image_url text not null default '';

comment on column public.sales_materials.image_url is 'URL ảnh đại diện tuỳ chọn của tài liệu (app: salesMaterials[].imageUrl); trống = không có ảnh, thẻ dùng nền/huy hiệu loại dự phòng.';

-- Kiểm chứng sau khi chạy:
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sales_materials'
order by ordinal_position;
