# Sava Meta CRM (Prototype)

CRM nội bộ cho team 3 người của Sava Meta — 4 mảng kinh doanh, mỗi mảng một pipeline riêng:

1. **Game Studio** — tìm publisher phát hành mobile game của Sava (deal theo term rev-share)
2. **Publishing** — tìm game studio / indie dev để hợp tác phát hành game của họ
3. **AI** — tìm doanh nghiệp ứng dụng giải pháp AI
4. **Metaverse** — tìm doanh nghiệp ứng dụng giải pháp metaverse

## Hai giao diện

| Trang | Dành cho | Thấy gì |
|-------|----------|---------|
| `index.html` | **BD** | Toàn bộ CRM: dashboard, pipeline 4 mảng, khách hàng, games, leads, công việc; deal game có khối **Term rev-share + link hợp đồng**; xem được kết quả đánh giá của MKT trong chi tiết game |
| `mkt.html` | **Marketing** | **Chỉ** các game đối tác BD mang về (mảng Publishing) để đánh giá tiềm năng thị trường: 5 tiêu chí chấm điểm + kết luận Nên nhận / Cân nhắc / Không nên nhận + nhận xét. Không thấy deal, term, hợp đồng hay các mảng khác |

Hai trang dùng chung dữ liệu qua `shared.js` (+ localStorage khi chạy prototype):
game BD mang về xuất hiện trong hàng chờ của MKT; MKT chấm xong, BD thấy kết quả ngay trong CRM.

## Trạng thái

Prototype tương tác được (kéo-thả pipeline, chuyển stage, chuyển lead thành deal,
sửa term + link HĐ, chấm điểm game) với **dữ liệu mẫu**, chưa nối backend.
Thiết kế bản thật (Supabase Free): xem thư mục tài liệu đi kèm ngoài repo —
`CRM-PHAC-THAO.md`, `schema.sql`, `schema-v02-addon.sql`, `schema-v03-addon.sql`.

## Chạy thử

Mở site GitHub Pages của repo, hoặc phục vụ tĩnh tại thư mục này:

```bash
python3 -m http.server 8000
# BD:  http://localhost:8000/index.html
# MKT: http://localhost:8000/mkt.html
```

Lưu ý: hai giao diện chỉ chia sẻ dữ liệu khi chạy **cùng một origin**
(cùng site Pages hoặc cùng server local như trên).
