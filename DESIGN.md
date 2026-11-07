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

## Báo cáo Anti-Slop (Delivery Gate)

Áp dụng bộ quy tắc [anti-slop](https://github.com/miqdadbadjuber/anti-slop) loại bỏ các khuôn mẫu AI sáo rỗng:

- **Liveliness Dials**: ENERGY 2 / RHYTHM 2 / MOTION 2.
- **Block 1: Hard Gate (100% PASS)**:
  - R-02 PASS: Đã gỡ bỏ hoàn toàn ký tự em dash `—` trong toàn bộ giao diện, metadata và mã nguồn client; thay bằng dấu hai chấm, dấu phẩy hoặc câu văn tự nhiên.
  - R-03 PASS: Responsive hoàn thiện ở mọi kích thước màn hình (1440, 1024, 768, 390px); tap targets đạt tối thiểu 44px; không tràn ngang.
  - R-04 & R-08 PASS: Đã loại bỏ các ký tự mũi tên trang trí vô cớ (`↗`, `↘`, `↓`, `☷`); thay thế bằng icon SVG ngữ cảnh thực tế (kính lúp tìm kiếm, biểu tượng bộ lọc, tay cầm game).
  - R-09 PASS: Đã loại bỏ badge capsule "bản đầu" (beta) và nhãn eyebrow lặp lại trên tiêu đề hero.
  - R-17 & R-18 PASS: 100% số liệu giá và game lấy trực tiếp từ Steam Web API, không có số liệu ước lượng hay testimonial giả định.
  - R-24 PASS: Toàn bộ điều hướng có đích đến thực tế (`/`, `Đã lưu`, `/gioi-thieu/`).
  - R-25 PASS: Độ tương phản màu đạt chuẩn WCAG AA: chữ trắng 19.7:1, chữ phụ `--muted` 8.2:1, nhãn giữ chỗ 5.16:1 (đều vượt ngưỡng tối thiểu 4.5:1).
  - R-26 PASS: Mọi nút, liên kết, lựa chọn đều có hành vi rõ ràng.
  - R-27 PASS: Đầy đủ 4 trạng thái giao diện: Loading (spinner + text), Data (danh sách game), Empty (icon gamepad + gợi ý hành động), Error (thông báo + nút thử lại).
  - R-32 PASS: Điều hướng bàn phím hoàn chỉnh: phím `/` lấy nét ô tìm kiếm, phím `Escape` đóng bộ lọc mobile và dialog, Tab trap trong drawer mobile.
  - R-34 & R-37 PASS: Thiết kế bảng màu warm-black-gold có chủ ý cho thư viện game, có tài liệu hướng dẫn và lý do rõ ràng.
  - R-35 PASS: Kiểm tra thực tế trên môi trường live https://steam-sale.phamkhanhminhman.com/.
- **Block 2: Purpose-Gate (100% PASS)**: Không dùng gradient xanh tím AI mặc định, không glassmorphism tràn lan, không glow mù mịt, không buzzwords sáo rỗng.
- **Block 3 & 4: Liveliness & Craftsmanship (100% PASS)**: Tiêu điểm thị giác tập trung vào ảnh game và mức giảm giá VNĐ; viền và bố cục nhất quán.
