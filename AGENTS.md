# Steam sale

Tuân theo [AGENTS.md gốc](../../AGENTS.md). Đọc README.md trước khi sửa.

- Kiểm: `npm run verify`; Worker: `npm run db:local`, `npm run deploy:check`.
- Chỉ mô phỏng D1/R2/Workflows trên máy khi phát triển. Production do người dùng tự deploy.
- Không commit dữ liệu người dùng; không đặt API key vào code, URL công khai hoặc log.
- Dữ liệu `public/data/deals.json` (gitignore) có thời điểm lấy thật, không được đổi timestamp để trông như vừa cập nhật.
- Giao diện theo [DESIGN.md](DESIGN.md): đọc phần "Mục của checker không áp dụng" trước khi sửa theo báo cáo ui-taste.
- Triển khai, trạng thái và việc người dùng phải làm: [README.md](README.md).
- Hai API Steam đang dùng không có tài liệu chính thức; mọi thay đổi parse phải giữ kiểm schema ở `src/worker/steam.ts` (thiếu trường thì lượt đồng bộ dừng, không publish).
