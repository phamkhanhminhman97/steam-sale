# Thiết kế giao diện

Áp dụng skill **ui-taste** (`design-taste-frontend` 2.5.0, Leonxlnx/taste-skill): chọn bảng màu và cặp chữ bằng `start.mjs deal --page software`, kiểm bằng Chrome ở 1440, 1024, 768, 390 px.

## Quyết định

| Mục | Chọn | Lý do |
|---|---|---|
| Màu | Nền #0c0a08, mặt #181512, chữ trắng, nhấn vàng #c9a45a (`warm-black-gold`) | Ảnh bìa game là nguồn màu; giao diện 90% trung tính. Không dùng tím |
| Chữ | Manrope (biến thiên, có tiếng Việt) + số tabular cho giá | Số thẳng hàng khi so giá |
| Bo góc | `soft` (4–12 px) | Cùng một hệ cho nút, ô nhập, thẻ |
| Bố cục | Cột lọc trái 208 px, danh sách bên phải; điện thoại: lọc trượt từ phải, danh sách một cột | Trang tra cứu: người dùng so nhiều dòng |
| Chữ trên trang | Tên thứ + số liệu thật; nút là động từ + đối tượng ("Xem thêm game", "Mở trong Steam") | Quy tắc copy của skill |
| Chuyển động | Ảnh phóng 1,03 trong khung khi rê chuột; nút nhích 1 px rồi lún khi nhấn; viền lấy nét 2 px; tôn trọng `prefers-reduced-motion` | Quy tắc motion của skill |
| Khu vực chạm | Nút lưu, chọn, đóng cao tối thiểu 44 px; nhãn bộ lọc 13 px trở lên | Điện thoại |

## Lỗi của checker đã sửa

- CSP chặn font nhúng dạng `data:` → tắt nhúng font và CSS (`assetsInlineLimit: 0`).
- Điện thoại: dải nút nhanh bị nút Bộ lọc đè → dải co lại được, mờ dần ở mép; tên game cho phép 3 dòng.
- Dòng cuối mồ côi ở đoạn ngắn → `text-wrap: pretty`.
- Khoảng cách giữa danh sách và footer lệch → 48 px (40 px trên điện thoại).
- Thông báo "đã lưu" chỉ hiện bằng hình → thêm vùng `role="status"` cho trình đọc màn hình.

## Mục của checker không áp dụng

`consistency.mjs` viết cho trang giới thiệu công ty (SKILL.md: "company websites"). Với trang tra cứu, các mục sau lệch mục đích nên giữ nguyên:

- `hero-fill`, `hero-screen`, `one-section`, `section-height`, `section-air`: đòi mỗi mục chiếm một màn hình, phần đầu một mình. Trang này đưa danh sách lên màn hình đầu vì đó là việc người dùng đến làm.
- `cta`: đòi nút trong phần đầu. Hành động chính là chọn game trong danh sách, không có nút nào đáng đặt ở đó.
- `no-visual`: danh sách có ảnh bìa từng game; checker không nhận ra.
- `container-edges`, `row-lines`, `off-grid`, `flush`: đo theo bố cục một cột; cột lọc bên trái là chủ ý.
- `copy-length`: đếm cả các dòng game (dữ liệu) như chữ quảng cáo.
- `nav-covers`: thông báo "đã lưu" nổi tạm 2 giây.

Kiểm hành vi thay thế: `checks/browser-probe.js` (12 phép thử ở 1440, 1024, 768; 15 ở 390: tìm kiếm, ngân sách, lưu game, hộp chi tiết, bộ lọc điện thoại, ảnh tải).
