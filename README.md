# Steam sale

Trang xem game Steam đang giảm giá tại Việt Nam, giá VNĐ, có tìm kiếm, bộ lọc, danh sách yêu thích lưu trên máy và lịch sử giá tự ghi nhận. Chạy hoàn toàn trên gói Free của Cloudflare. Tên site và tên miền chưa chốt.

Kế hoạch, số đo và lý do chọn thiết kế: [KE-HOACH.md](KE-HOACH.md). Quy tắc giao diện: [DESIGN.md](DESIGN.md).

## Trạng thái (07/11/2026)

| Phần | Trạng thái |
|---|---|
| Giao diện: danh sách, tìm kiếm, bộ lọc, sắp xếp, yêu thích, chi tiết game, biểu đồ giá | Xong, chạy được với dữ liệu Steam thật |
| Worker: `/api/deals` (ETag 304), `/api/history/:appid`, `/api/health` | Xong |
| PWA & Tối ưu: Cache API Stale-While-Revalidate, Manifest, robots.txt, sitemap, OpenGraph | Xong |
| Workflow đồng bộ giá mỗi giờ, ghi D1 chỉ khi giá đổi, snapshot R2 | Xong, test bằng Miniflare. **Chưa chạy trên Cloudflare thật** (Giai đoạn 0 của kế hoạch) |
| Canh giá qua Telegram | Chưa làm (Giai đoạn 4) |
| Tách file dữ liệu theo độ phổ biến | Chưa làm. Đo ngày 07/11: toàn bộ 9.610 game 713 KB gzip; nhóm hiện mặc định (3.832 game) 278 KB. Tách khi đo thời gian tải trên điện thoại thấy chậm |

## Chạy trên máy

Cần Node 22.23.4 trở lên.

```bash
npm install
npm run data:refresh     # lấy giá thật từ Steam vào public/data/deals.json (không commit)
npm run db:local         # tạo D1 giả lập
npm run build && npm run preview   # http://127.0.0.1:8787, Worker + D1 + R2 + Workflow giả lập
npm run verify           # kiểm kiểu, test, build
```

`npm run data:fixture` dựng danh sách từ ảnh chụp đã lưu trong `fixtures/` (không có ảnh game), dùng khi không có mạng.

Kiểm giao diện bằng skill ui-taste (cần Chrome và bản skill tải ở `$TASTE_SKILL_PATH`, preview chạy ở cổng 4321): `node checks/run-taste.mjs`. Đọc DESIGN.md trước khi xem kết quả: nhiều mục của checker dành cho trang giới thiệu, không áp dụng cho trang tra cứu.

## Triển khai (người dùng tự làm, theo AGENTS.md gốc)

1. Tự động khởi tạo hạ tầng Cloudflare (D1, R2, migration, cập nhật database_id):
   ```bash
   npm run cf:setup
   ```
2. Mặc định `workers_dev: true` cho phép truy cập ngay trên `steam-sale.<subdomain>.workers.dev`. Thêm `routes` vào `wrangler.jsonc` nếu gắn domain riêng.
3. Deploy ứng dụng:
   ```bash
   npm run deploy
   ```
4. **Giai đoạn 0, đo trước khi bật đồng bộ:**
   ```bash
   npx wrangler workflows trigger steam-sale-sync '{"probe":true}'
   ```
   Xem Workers Logs: Steam có trả lời từ IP Cloudflare không, CPU mỗi bước dưới 7 ms không, `probe/<id>.json` trong R2 có 250 game không.
5. Đạt thì đổi `SYNC_ENABLED` thành `"true"` trong `wrangler.jsonc` và deploy lại (`npm run deploy`). Cron chạy phút 7 mỗi giờ.

Steam trả 429 hoặc `x-eresult` 25/84 thì lượt đó dừng, snapshot cũ vẫn được phục vụ.

## Dữ liệu

- Nguồn: `IStoreQueryService/Query` và `IStoreBrowseService/GetItems` của `api.steampowered.com`, `country_code = VN`. Hai API này không có trong tài liệu chính thức của Valve và có thể đổi bất cứ lúc nào.
- Giá đọc từ `final_price_in_cents` (chia 100). Giá khác VNĐ hoặc thiếu giá bị loại, không đoán.
- "Thấp nhất đã ghi nhận" chỉ tính từ lúc bắt đầu theo dõi, không phải toàn bộ lịch sử giá.
- Dữ liệu Steam trong `public/data/` bị gitignore. `fixtures/` là ảnh chụp thật dùng làm dữ liệu thử; điều khoản Steam Web API yêu cầu xoá bản sao khi Valve chấm dứt quyền dùng, nên cân nhắc trước khi đẩy lên GitHub.
- Footer ghi trang độc lập, không liên kết với Valve, giá nguyên trạng, theo điều khoản đã đọc (KE-HOACH.md mục 12). Chưa đọc Steam Subscriber Agreement và Network Branding Requirements.

## Bảo mật

CSP chỉ cho `'self'` và ảnh từ `shared.*.steamstatic.com` (`public/_headers`), nên font và CSS phải là file riêng (đã cấu hình trong `astro.config.mjs`). Không có tài khoản người dùng, không có cookie. Danh sách yêu thích nằm trong localStorage. `STEAM_KEY`, nếu dùng, đặt bằng `wrangler secret put`.
