# Kế hoạch: web game Steam đang giảm giá trên Cloudflare, chi phí 0đ

Lập 07/11/2026 (codex). Trạng thái cuối ngày 07/11: **đã dựng bản chạy được trên máy** (Giai đoạn 1–3, xem README.md); Giai đoạn 0 (đo trên Cloudflare thật) và Giai đoạn 4 (Telegram) chưa làm. Tên site, subdomain và tên repo là tạm.
Mọi số liệu Steam đo ngày 07/11/2026, khoảng 10:30–11:15 giờ VN, từ MacBook; giới hạn Cloudflare đọc từ
developers.cloudflare.com cùng ngày. Thứ chưa đo được ghi rõ "chưa kiểm".

## 0. Kết luận

- **Làm được với 0đ chi phí mới** nếu dùng: Workers Free, Workers Static Assets, Workflows, D1, R2 (trong mức miễn phí),
  Cache API và một subdomain của phamkhanhminhman.com. Không mua thêm gì.
- Hai thứ **không** nằm trong 0đ: tên miền riêng mới (phải mua); gửi email tới người dùng bất kỳ (Cloudflare Email Sending
  cần gói Paid). Kênh canh giá dùng Telegram bot.
- Workers, D1, KV gói Free khi vượt giới hạn thì **báo lỗi, không tính tiền** (Workers trả lỗi 1027; D1/KV ngừng thao tác
  tới khi hạn mức ngày đặt lại). Workflows gói Free không bị tính tiền step (changelog 07/07/2026); vượt 3.000 step/ngày
  thì chuyện gì xảy ra chưa có trong tài liệu. **R2 thì khác: vượt mức miễn phí tháng sẽ bị tính tiền** (tài khoản đã bật R2 cho moments,
  battlecats). Thiết kế dưới đây chỉ đọc R2 qua Worker có cache, nên số lần đọc R2 bị chặn trên.
- Nguồn dữ liệu chính: **IStoreQueryService/Query** trên api.steampowered.com. Không cần key, lọc được game đang giảm ở Việt Nam,
  trả giá VNĐ, % giảm, ngày hết hạn, đánh giá. Endpoint này **không có trong tài liệu Steamworks Web API công khai** → có thể
  đổi bất cứ lúc nào; đây là rủi ro lớn nhất.
- Hai điểm phải đo trên Cloudflare trước khi viết nhiều code (Giai đoạn 0): Steam có trả lời Worker không, và mỗi bước xử lý
  500 game có nằm dưới **10 ms CPU** không.

## 1. Đã kiểm ngày 07/11

### 1.1. Mạng Việt Nam (máy này)

| Kiểm | Kết quả |
|---|---|
| DNS máy phân giải store.steampowered.com | 127.0.0.1 (bị chặn ở DNS); DNS Cloudflare (DoH) trả 23.15.142.182 |
| Kết nối thẳng tới IP thật đó (curl --resolve) | Hết giờ sau 25 s (chặn cả đường mạng); steamcommunity.com cũng bị từ chối |
| api.steampowered.com | 200, không bị chặn |
| Ảnh shared.akamai.steamstatic.com, shared.fastly.steamstatic.com, cdn.akamai.steamstatic.com | 200 |

Hệ quả: Worker chạy trên mạng Cloudflare nên không gặp chặn này (chưa kiểm thật, Giai đoạn 0). Nút "xem trên Steam" bản web
có thể không mở được với người dùng VN; cần nút mở ứng dụng Steam (steam://store/<appid>). Mới đo một nhà mạng.

### 1.2. Nguồn dữ liệu Steam

| Endpoint (api.steampowered.com) | Không key | Dùng cho | Đo được |
|---|---|---|---|
| IStoreQueryService/Query/v1 | Chạy | Danh sách game đang giảm ở VN | Tối đa 1.000 mục/lần (xin 2.000 trả 1.000) |
| IStoreBrowseService/GetItems/v1 | Chạy | Ảnh, tag, ngôn ngữ, đánh giá theo lô appid | 100 appid/lần chạy được, 426 KB khi lấy đủ trường |
| IStoreService/GetTagList/v1?language=vietnamese | Chạy | Tên tag tiếng Việt | 18 KB |
| IStoreBrowseService/GetStoreCategories/v1?language=vietnamese | Chạy | Tên chế độ chơi tiếng Việt: 2 Chơi đơn, 1 Nhiều người chơi, 9 Phối hợp, 38 Phối hợp trực tuyến, 39 Phối hợp chung/chia màn hình, 24 Chung/chia màn hình | 16,7 KB |
| IStoreService/GetAppList/v1 | 403, cần key | Không dùng | |

Lọc giảm giá: price_filters.min_discount_percent = 1, type_filters.include_games = true, context.country_code = "VN".
Giá trả về dạng final_price_in_cents: "17100000" = 171.000₫ (chia 100).
Vùng giá do context.country_code quyết định, không theo IP người gọi: gọi từ IP Việt Nam, Portal 2 trả 140.000₫ (VN), $9.99 (US),
¥1,400 (JP). Từ IP Cloudflare chưa kiểm.

**Phân trang:** cùng điều kiện, lấy 10 trang × 1.000:

| sort | Số dòng | Số appid khác nhau |
|---|---|---|
| bỏ trống | 9.610 | 6.790 |
| 0 | 9.610 | 7.350 |
| 10 | 9.610 | 8.974 |
| 11 | 9.610 | 8.892 |
| 1, 2, 12 | 9.610 | **9.610** |

sort = 2 trả theo appid tăng dần, sort = 1 theo tên (suy ra từ thứ tự trả về, không có tài liệu). **Dùng sort = 2**, mỗi lượt
kiểm số appid khác nhau bằng total_matching_records.

**Kích thước và thời gian parse** (Node 22, M1 Pro; CPU Workers chưa đo):

| Gói dữ liệu | Byte/game | Parse |
|---|---|---|
| Chỉ giá (data_request rỗng) | 992 B | 2,64 ms / 1.000 game |
| Giá + đánh giá | ~1.100 B | (chưa đo riêng) |
| Đủ ảnh, tag, ngôn ngữ, đánh giá | 3.985 B | 5,20 ms / 500 game |

Phần nặng là assets (~1.086 B) và supported_languages (~1.031 B) → tách: lấy giá + đánh giá mỗi giờ; ảnh, tag, ngôn ngữ chỉ
lấy một lần cho game mới.

**Ảnh:** game mới không có ảnh ở đường dẫn cũ steam/apps/<appid>/<tên file> (2 game mới × 3 tên file: 6/6 lần trả 404;
Portal 2 thì 200). Phải lưu đường dẫn assets.small_capsule (ảnh 231×87) từ GetItems. Thử 8/8 game mới: tải được qua
https://shared.akamai.steamstatic.com/store_item_assets/ + asset_url_format, mỗi ảnh 5,7–14,8 KB (trung vị ~11 KB).

**Tiếng Việt:** supported_languages chỉ trả mã số. Mã 28 có ở Dota 2 và CS2, không có ở Stardew Valley, nhưng **chưa có nguồn
xác nhận 28 là tiếng Việt** (không thấy trong kho protobuf của SteamDatabase và SteamKit). Chưa bật bộ lọc "Có tiếng Việt" tới
khi đối chiếu ≥ 20 game với trang cửa hàng.

### 1.3. Hiện trạng giảm giá ở VN (sort = 2, đủ 9.610 game)

| Chỉ số | Giá trị |
|---|---|
| Game đang giảm / DLC đang giảm | 9.610 / 8.781 |
| Có ≥ 10 / ≥ 50 / ≥ 500 đánh giá | 6.226 / 3.996 / 1.483 |
| ≥ 500 đánh giá và ≥ 80% tích cực | 1.075 |
| Mức giảm trung vị; giảm ≥ 50%; ≥ 75% | 50%; 5.033; 1.807 |
| Giá sau giảm trung vị; ≤ 100.000₫ | 52.250₫; 7.287 |
| Có ngày hết hạn | 9.606 |
| Hết hạn trong 24 giờ / 72 giờ / 7 ngày | 618 / 3.998 / 6.856 |
| Chơi co-op (category 9) / co-op online (38) | 1.049 / 739 |
| Loại giảm giá (ảnh chụp 10:48 giờ VN) | special 5.704; weeklong 1.898; **launch 1.794**; daily 174; midweek 23; prepurchase 7; weekend 5; promotion 1; không rõ 4 |
| Giảm giá ra mắt (launch + prepurchase) | 1.801 game, 18,7%: trung vị 1 đánh giá, giảm trung vị 20%, chỉ 5 game giảm ≥ 50%; 160 game trong số đó có ≥ 50 đánh giá |
| Biến động trong 13,6 phút (10:34 → 10:48 giờ VN, giờ yên) | 1 game vào, 1 game ra, 0 đổi giá, 1/9.609 đổi số đánh giá |

Cờ hide_discount_pct_for_compliance và price_cannot_be_displayed_as_discount đang là 0 ở cả 9.610 game; vẫn phải tôn trọng.

### 1.4. Giới hạn Cloudflare gói Free (tài liệu, 07/11)

| Dịch vụ | Giới hạn dùng tới |
|---|---|
| Workers | 100.000 request/ngày; **10 ms CPU** mỗi lần chạy (kể cả cron); 50 subrequest ra ngoài, 1.000 tới dịch vụ Cloudflare |
| Static assets | Request miễn phí, không giới hạn (trừ khi bật Workers Cache: khi đó static cũng bị tính request → **không bật**) |
| Cron Triggers | 5 / tài khoản (repo trong workspace chưa dùng cái nào; Worker ngoài workspace chưa kiểm) |
| Workflows | 3.000 step/ngày; 10 ms CPU mỗi step; 100 instance chạy cùng lúc; kết quả step ≤ 1 MiB; schedules tới 100 biểu thức cron/tài khoản; gói Free không bị tính tiền step/storage vượt mức (changelog 07/07/2026), hành vi khi vượt chưa có trong tài liệu |
| D1 | 5 triệu dòng đọc, 100.000 dòng ghi mỗi ngày; 500 MB/database; 50 truy vấn mỗi lần chạy (batch tính 1); **100 tham số mỗi truy vấn** (truyền danh sách appid bằng một chuỗi JSON qua json_each, cách tài liệu D1 hướng dẫn) |
| R2 | Mỗi tháng 10 GB-tháng, 1 triệu Class A, 10 triệu Class B; **vượt thì tính tiền** |
| KV | 100.000 đọc, 1.000 ghi mỗi ngày (kế hoạch không cần KV) |
| Workers Logs | 200.000 dòng/ngày, giữ 3 ngày |
| Email Sending | Gói Free không gửi được tới địa chỉ bất kỳ |
| CDN | Không cache JSON theo mặc định; Cache Rules có ở gói Free; nén application/json khi trả cho trình duyệt |

## 2. Kiến trúc

~~~mermaid
flowchart LR
  Steam["api.steampowered.com<br/>Query + GetItems"] --> WF
  subgraph CF["Cloudflare, gói Free"]
    WF["Workflow SyncDeals<br/>mỗi giờ"] -->|chỉ ghi khi giá đổi| D1[("D1")]
    WF -->|part + all.json| R2[("R2 riêng tư")]
    API["Worker /api/*<br/>+ Cache API"] --> R2
    API --> D1
    SA["Static assets<br/>HTML, JS, CSS"]
  end
  U["Trình duyệt"] --> SA
  U -->|"/api/deals: 1 request"| API
  U -->|ảnh| CDN["shared.akamai.steamstatic.com"]
  U -->|"Mở trong Steam"| SC["steam://store/appid"]
~~~

| Thành phần | Vai trò | Vì sao chọn |
|---|---|---|
| Một Worker steam-sale | Phát frontend tĩnh; xử lý /api/*; chứa class Workflow | Static assets miễn phí; chỉ /api/* tốn request |
| Workflow SyncDeals | Mỗi giờ lấy toàn bộ game đang giảm theo từng trang | Mỗi step có 10 ms CPU riêng; một lần cron 10 ms không đủ cho 9.610 game |
| D1 | Thông tin game, giá hiện tại, lịch sử giá, nhật ký đồng bộ, canh giá | Cần SQL theo appid; ghi có thể giữ ở vài nghìn dòng/ngày |
| R2 (không mở public) | Ảnh chụp danh sách đã nén gọn cho frontend | Ghi file 2 MB không tốn CPU parse; đọc qua Worker nên chặn được số lần đọc |
| Cache API | Giữ /api/deals 5 phút, lịch sử 1 giờ tại mỗi PoP | Giảm đọc R2/D1; không bật Workers Cache để static vẫn miễn phí |
| Steam CDN | Ảnh game, dẫn thẳng | Đo được từ VN; không tốn request Worker |
| Telegram Bot API | Canh giá (giai đoạn 4) | Miễn phí, không cần gói Paid như email |

Một hostname: sale.phamkhanhminhman.com (tạm). Không cần hostname thứ hai cho dữ liệu vì R2 đọc qua Worker.

## 3. Đồng bộ dữ liệu

### 3.1. Lịch

Workflow binding có schedules ["7 * * * *"]: phút 7 mỗi giờ (UTC). Cách này không chiếm Cron Trigger; nếu gói Free không
nhận schedules thì dùng 1 Cron Trigger gọi env.SYNC.create(). Steam thường đổi giảm giá lúc 10:00 giờ Thái Bình Dương
(Steamworks ghi cho Midweek/Weekend Deal), tức 0:00–1:00 giờ VN; chạy mỗi giờ là đủ.

### 3.2. Các step của một lượt

| Step | Việc | Gọi ngoài | Ghi |
|---|---|---|---|
| lock | meta.sync_lock còn hiệu lực (< 20 phút) thì bỏ lượt này, nếu không đặt khoá mới; xoá khoá ở cuối | | D1 2 dòng |
| count | Query count = 1 lấy total | 1 Steam | |
| page-00 … page-19 | Query start = p×500, count = 500, sort = 2, include_reviews; đổi sang dạng gọn; so với prices_current; ghi phần đổi; ghi part | 1 Steam, 3 truy vấn D1 (đọc giá, ghi đổi, đọc thông tin game; mỗi truy vấn nhận cả lô qua json_each), 1 R2 | D1: 2 dòng mỗi game đổi giá; R2: snapshot/<run>/part-NN.json |
| verify | Gộp các trang, bỏ trùng appid; so số appid với total đọc **ở đầu và cuối lượt**. Lệch chỉ ghi vào sync_runs (skew), không huỷ lượt | | sync_runs |
| reconcile | Mọi appid đang on_sale trong D1 mà không có trong lượt này (hết giảm **hoặc** bị trượt do phân trang): GetItems 100/lô lấy giá thật. discount_pct rỗng → hết giảm, ghi 1 dòng lịch sử; còn giảm → giữ nguyên | Mỗi lượt 0 đến vài lô khi yên; nhiều hơn ở giờ chuyển sale (618 game hết giảm trong 24 giờ tới) | D1 |
| publish | Nối các part thành all.json bằng stream (không parse); cập nhật meta.current_run | | R2 1 put; D1 1 dòng |
| enrich | appid chưa có trong games: GetItems 2 lô × 100 mỗi step | 2 Steam/step | games |

Mỗi step trả về kết quả nhỏ (số dòng, số đổi, mảng appid ~4 KB), dưới mức 1 MiB. Lỗi Steam/429: retry 3 lần, backoff mũ.
Lượt lỗi giữ nguyên snapshot cũ; frontend hiện "cập nhật lúc …".

**Phân trang theo offset khi dữ liệu đang đổi.** Query không có con trỏ, chỉ có start/count. Một game hết giảm ở trang đã đọc làm game
đứng sau nó dồn lên một chỗ và bị trượt qua ranh giới trang; một game mới vào làm trùng một game. Đo giờ yên: 4 game vào và 4 game ra
mỗi giờ (suy ra từ 1 + 1 trong 13,6 phút), nên một lượt dài 1–2 phút có khả năng gặp thay đổi khoảng 10–20% (ước tính, 1 lần so
sánh); giờ chuyển sale (hàng trăm game đổi cùng lúc) nhiều khả năng trượt gần như mọi lượt. Vì vậy lệch số lượng không được dùng làm
điều kiện huỷ lượt, nếu không snapshot sẽ đứng đúng lúc cần mới nhất. Chỗ sửa là bước reconcile.

Phác thảo một step trang:

~~~ts
const r = await step.do(`page-${p}`, { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" } }, async () => {
  const items = await queryOnSale(p * 500, 500);        // sort = 2, country_code VN, include_reviews
  const rows = items.flatMap(toCompact);                // bỏ game không có best_purchase_option (4/9.610 ngày 07/11)
  const prev = await getCurrent(env.DB, rows.map(x => x.i));
  // getCurrent: SELECT … FROM prices_current WHERE app_id IN (SELECT value FROM json_each(?1))
  const changed = rows.filter(x => differs(x, prev.get(x.i)));   // differs: chỉ so giá sau giảm, giá gốc, %; số đánh giá đổi không ghi D1
  await env.DB.batch(writeChanges(env.DB, changed, now));   // 2 câu: UPSERT prices_current, INSERT price_history, đều đọc từ json_each(?1)
  const meta = await getGames(env.DB, rows.map(x => x.i)); // ảnh, tag, has_vi; cũng qua json_each
  await env.DATA.put(`snapshot/${run}/part-${pad(p)}.json`, rows.map(x => JSON.stringify(join(x, meta))).join(","));
  return { n: rows.length, changed: changed.length, ids: rows.map(x => x.i) };
});
~~~

### 3.3. Quy tắc ghi lịch sử

- Chỉ ghi khi (giá sau giảm, giá gốc, %) khác dòng hiện tại. Không lưu "last_seen" mỗi giờ (9.610 dòng/giờ = 230.640 dòng/ngày,
  vượt 100.000).
- Game xuất hiện lần đầu hoặc trở lại giảm: một dòng lịch sử.
- Game vắng mặt trong lượt: chỉ đặt on_sale = 0 sau khi GetItems xác nhận giá thật đã hết giảm (thường về giá gốc) và ghi một dòng;
  còn giảm thì bỏ qua (bị trượt phân trang).
- low_vnd, low_at cập nhật khi giá mới thấp hơn. Trang ghi "thấp nhất **từ khi bắt đầu theo dõi (07/11/2026)**", không ghi
  "thấp nhất lịch sử".
- Giá gốc của game không giảm thì không thấy (Query chỉ trả game đang giảm); đổi giá gốc chỉ lộ ra ở lần giảm sau.

## 4. Lược đồ D1

~~~sql
-- Ít đổi, lấy bằng GetItems khi gặp game mới
CREATE TABLE games (
  app_id      INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  capsule     TEXT,             -- assets.small_capsule, vd "b34b…/capsule_231x87.jpg"
  asset_t     INTEGER,          -- tham số t trong asset_url_format
  tags        TEXT,             -- JSON, tối đa 8 tagid
  players     TEXT,             -- JSON supported_player_categoryids
  has_vi      INTEGER,          -- mã 28 chưa có nguồn xác nhận là tiếng Việt (mục 1.2)
  release_ts  INTEGER,
  enriched_at INTEGER NOT NULL
);

-- Giá hiện tại; chỉ UPDATE khi đổi
CREATE TABLE prices_current (
  app_id     INTEGER PRIMARY KEY,
  final_vnd  INTEGER NOT NULL,
  orig_vnd   INTEGER NOT NULL,
  pct        INTEGER NOT NULL,
  ends_at    INTEGER,
  on_sale    INTEGER NOT NULL,
  low_vnd    INTEGER NOT NULL,
  low_at     INTEGER NOT NULL,
  changed_at INTEGER NOT NULL
);

-- Mỗi lần giá đổi một dòng; không thêm index phụ (mỗi index cộng thêm một dòng ghi)
CREATE TABLE price_history (
  app_id    INTEGER NOT NULL,
  ts        INTEGER NOT NULL,
  final_vnd INTEGER NOT NULL,
  orig_vnd  INTEGER NOT NULL,
  pct       INTEGER NOT NULL,
  PRIMARY KEY (app_id, ts)
) WITHOUT ROWID;

CREATE TABLE sync_runs (
  run_id TEXT PRIMARY KEY, started_at INTEGER, finished_at INTEGER,
  total INTEGER, fetched INTEGER, unique_ids INTEGER,
  changed INTEGER, ended INTEGER, status TEXT, note TEXT
);

CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);   -- current_run, tracking_since

-- Giai đoạn 4
CREATE TABLE alerts (
  chat_id INTEGER NOT NULL, app_id INTEGER NOT NULL, target_vnd INTEGER NOT NULL,
  created_at INTEGER NOT NULL, last_sent_at INTEGER,
  PRIMARY KEY (chat_id, app_id)
) WITHOUT ROWID;
~~~

## 5. Dữ liệu cho frontend

- Một dòng gọn mỗi game: {i, n, f, o, d, e, k, r, c, p, t, h, v, l} = appid, tên, giá sau giảm, giá gốc, %, hết hạn, loại giảm giá
  (special, weeklong, launch, daily…), % tích cực, số đánh giá, chế độ chơi, tag, ảnh, có tiếng Việt, thấp nhất từ khi theo dõi.
- Đo trên một trang 500 game thật (tag và ảnh là giá trị giả cùng kích thước): 202 B/game → 9.606 game ≈ 1,94 MB JSON. Hash ảnh thật nén
  kém hơn, nên 0,31 MB gzip ở bản dựng thử đầu là cận dưới → đo lại ở GĐ 1.
- Nếu GĐ 2 đo thấy màn hình đầu tải chậm: tách main.json (≥ 50 đánh giá, ~3.990 game ≈ 0,8 MB) và rest.json (≈ 1,1 MB, chỉ tải khi bật
  "hiện cả game ít đánh giá"). Cần mỗi trang ghi hai part; chưa đưa vào bản gốc để giữ đơn giản.
- GET /api/deals: Worker tra Cache API theo khoá cố định (bỏ query string để không bị phá cache); trượt thì đọc meta.current_run
  (1 dòng D1) rồi stream snapshot/<run>/all.json từ R2. Cache-Control: public, max-age=300.
- Snapshot cũ: R2 lifecycle xoá tiền tố snapshot/ sau 2 ngày.

## 6. Frontend

Astro tĩnh như science-lab; phần danh sách là một module TypeScript chạy trên trình duyệt.

| Màn | Nội dung | Giai đoạn |
|---|---|---|
| Danh sách | Ảnh nhỏ, tên, giá gốc gạch, giá giảm, −%, đánh giá, còn bao lâu; danh sách ảo (chỉ dựng dòng đang thấy) | 2 |
| Lọc | Tên; giá tối đa (50k/100k/200k/500k); giảm tối thiểu (50/75/90%); đánh giá (% và số lượt); co-op / co-op online / chơi chung màn hình; có tiếng Việt; tag | 2 |
| Sắp xếp | Giảm sâu, giá thấp, đánh giá tốt, sắp hết hạn, nhiều đánh giá | 2 |
| Mặc định | Ẩn game < 50 đánh giá (còn ~3.990) và giảm giá ra mắt (còn ~3.830 game giảm thật); bật lại được; giảm giá ra mắt luôn có nhãn riêng | 2 |
| URL | Trạng thái lọc nằm trên URL để gửi link | 2 |
| Đã lưu | Tim lưu localStorage; trang riêng xem giá hiện tại các game đã lưu | 2 |
| Chi tiết | Nút "Mở trong Steam" (steam://store/id) và "Trang Steam (web)"; ngày hết giảm | 2 |
| Lịch sử | Biểu đồ giá VNĐ, nhãn thấp nhất từ khi theo dõi | 3 |
| Canh giá | Đặt giá mục tiêu, nhận tin Telegram | 4 |
| Chân trang | Cập nhật lúc …; link tới Steam không gắn nofollow; "Không liên kết với Valve"; miễn trừ "nguyên trạng": giá lấy từ Steam, có thể chậm hoặc sai, kiểm lại trước khi mua (mục 12) | 2 |

## 7. API Worker

| Route | Giai đoạn | Đọc | Cache |
|---|---|---|---|
| GET /api/deals | 1 | D1 1 dòng + R2 1 object khi trượt cache | 5 phút |
| GET /api/history/:appid | 3 | price_history theo khoá chính (số dòng của game đó) | 1 giờ |
| POST /api/telegram | 4 | Webhook Telegram, kiểm header secret token | không |

wrangler.jsonc phác thảo (giống science-lab: tắt workers.dev và preview URL):

~~~jsonc
{
  "name": "steam-sale",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-11-01",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "sale.phamkhanhminhman.com", "custom_domain": true }],
  "assets": { "directory": "./dist", "run_worker_first": ["/api/*"], "not_found_handling": "404-page" },
  "d1_databases": [{ "binding": "DB", "database_name": "steam-sale", "database_id": "<tạo ở giai đoạn 0>" }],
  "r2_buckets": [{ "binding": "DATA", "bucket_name": "steam-sale-data" }],
  "workflows": [{ "name": "sync-deals", "binding": "SYNC", "class_name": "SyncDeals", "schedules": ["7 * * * *"] }],
  "observability": { "enabled": true }
}
~~~

## 8. Ngân sách gói Free (ngày thường, 9.610 game, trang 500)

| Tài nguyên | Ước tính | Giới hạn | Tỉ lệ |
|---|---|---|---|
| Gọi Steam (giá + đếm) | 504/ngày | 100.000/ngày (Steam Web API Terms) | 0,50% |
| Workflow step (25 step/lượt) | 600/ngày | 3.000/ngày | 20,0% |
| D1 dòng đọc (so giá, ghép thông tin, tìm game hết giảm) | 691.920/ngày | 5.000.000/ngày | 13,8% |
| D1 dòng ghi, ngày thường (1.500 lần đổi giá) | 3.000/ngày | 100.000/ngày | 3% |
| D1 dòng ghi, ngày đầu đợt sale lớn (30.000 lần đổi) | 60.000/ngày | 100.000/ngày | 60% |
| R2 Class A (part + all.json) | 15.840/tháng | 1.000.000/tháng | 1,58% |
| R2 Class B (bước publish đọc 20 part mỗi lượt; chưa gồm đọc khi trượt cache) | 14.400/tháng | 10.000.000/tháng | 0,14% |
| Worker request | ~600/ngày cho đồng bộ + mỗi lần tải /api/* (kể cả khi trúng Cache API, vì cache chạy trong Worker) | 100.000/ngày | ~99.000 lượt tải dữ liệu/ngày; vượt thì /api/* lỗi, trang tĩnh vẫn phát (theo tài liệu static assets) |

Tính bằng Python ngày 07/11. Số lần đổi giá mỗi ngày là **giả định**: 618 game hết giảm trong 24 giờ tới (đo được); số đợt mới
bắt đầu chưa đo. Giờ yên (10:34 → 10:48 giờ VN) chỉ 2 game đổi trạng thái và 0 đổi giá, nên lượng ghi dồn vào vài giờ chuyển sale;
chưa đo giờ 01:00 giờ VN (10:00 giờ Thái Bình Dương). Chạm ~50.000 lần đổi/ngày thì vượt ghi D1; khi gần ngưỡng, bỏ ghi lịch sử cho
game < 10 đánh giá. Ngày đầu chạy ghi ~28.800 dòng (9.610 prices_current + 9.610 price_history + 9.610 games).

CPU một bước trang, đo bằng Node 22 trên M1 với dữ liệu thật (parse 533 KB, đổi dạng gọn, so giá, JSON hoá tham số D1, ghép thông tin,
mã hoá UTF-8 phần ghi R2): lần chạy đầu 2,7–3,1 ms, các lần sau 1,9–2,0 ms, kể cả khi cả 499 game đều "đổi" (2,8–3,1 ms). Chưa gồm CPU
gọi D1/R2, và CPU Workers có thể chậm hơn: dư địa khoảng 3 lần so với 10 ms trên máy này. Nếu GĐ 0 đo sát ngưỡng thì giảm còn 250 game
mỗi trang (39 trang, 1.056 step/ngày = 35,2%). Số dòng đọc khi dùng json_each cần đo lại bằng meta.rows_read ở GĐ 1.

## 9. Lộ trình

Mỗi giai đoạn chỉ xong khi đạt tiêu chí đo được.

| GĐ | Việc | Xong khi |
|---|---|---|
| 0 | Repo, wrangler.jsonc, một Workflow thử: 1 step lấy 500 game trên Cloudflare, ghi log CPU; thêm: (a) một step nối 20 file nhỏ trong R2 bằng stream (R2 put cần biết trước độ dài, kiểm FixedLengthStream), (b) gọi Query có và không kèm key, (c) so giá country_code = VN từ IP Cloudflare với giá đo từ VN | 3 lượt liên tiếp: Steam 200; CPU mỗi step < 7 ms (Workers Logs); step nối R2 < 7 ms; schedules chạy trên gói Free; giá từ IP Cloudflare khớp 20 game kiểm |
| 1 | Đồng bộ đủ (mục 3), D1 migration, R2 snapshot, /api/deals; test parse/so giá/hết giảm/trượt trang bằng hai ảnh chụp thật trong fixtures/ (10:34 và 10:48 giờ VN ngày 07/11) | 24 lượt/ngày hoàn tất; sau reconcile không còn game on_sale có ends_at quá 2 giờ; rows written/ngày ghi vào sync_runs; test qua |
| 2 | Frontend MVP (mục 6, các dòng GĐ 2) | Dùng được trên iPhone và Android thật; đo dung lượng tải và Lighthouse mobile; nút Steam thử trên máy có ứng dụng Steam |
| 3 | /api/history, biểu đồ, nhãn thấp nhất từ khi theo dõi | Biểu đồ khớp dòng D1 của 5 game kiểm tay; nhãn ghi ngày bắt đầu theo dõi |
| 4 | Telegram bot canh giá | Đặt mục tiêu → tin đến khi giá chạm; huỷ được; không gửi lặp cùng mức giá |
| 5 (tuỳ) | DLC, gói, trang từng game cho SEO, PWA | Làm sau khi có người dùng quay lại |

## 10. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|:--:|---|
| Endpoint Steam không tài liệu đổi hoặc bị khoá | Cao | Kiểm schema mỗi lượt; thiếu trường thì không publish, giữ snapshot cũ; dự phòng appdetails/search trên store (gọi từ Cloudflare, chưa kiểm) |
| Steam chặn/429 IP Cloudflare | Chưa biết | Giới hạn theo từng method không công bố (theo steamapi.xpaw.me); khi vượt Steam trả HTTP 429 hoặc header x-eresult 25/84 → coi cả ba là bị giới hạn: dừng lượt, giữ snapshot cũ, lượt sau giãn ra 2 giờ. Header trả về ngày 07/11 không có thông tin hạn mức (chỉ x-eresult: 1). Đo ở GĐ 0 |
| CPU 10 ms | Thấp đến trung bình | Đo trên M1: 1,9–3,1 ms mỗi bước trang (mục 8); chưa đo trên Workers và chưa tính gọi D1/R2; trang 250 nếu cần |
| Phân trang theo offset khi dữ liệu đang đổi | Trung bình | sort = 2 đủ 9.610/9.610 khi dữ liệu đứng yên; game vào/ra giữa lượt làm trượt hoặc trùng; bỏ trùng + reconcile (mục 3.2); không huỷ lượt vì lệch |
| D1 ghi vượt trong mùa sale | Trung bình | Ngưỡng ~50.000 lần đổi/ngày; bỏ lịch sử game < 10 đánh giá khi gần ngưỡng |
| R2 tính tiền khi vượt | Thấp | Chỉ đọc qua Worker + Cache API với khoá cố định; R2 không public; theo dõi bảng R2 |
| Link store.steampowered.com bị chặn ở VN | Cao (đo được) | steam:// là nút chính |
| Điều khoản Steam Web API (mục 12) | Trung bình | Endpoint đang dùng không key và không có trong tài liệu; đăng ký key, khai tên ứng dụng; footer theo điều khoản; Valve có thể ngừng bất cứ lúc nào, không báo trước |
| Giảm giá ra mắt lẫn vào danh sách | Thấp | 18,7% "game giảm giá" là launch/prepurchase (trung vị 1 đánh giá); gắn nhãn k, ẩn mặc định |
| Mã tiếng Việt 28 chưa có nguồn | Thấp | Chưa bật bộ lọc "Có tiếng Việt" tới khi đối chiếu ≥ 20 game với trang cửa hàng |
| Ảnh Steam CDN ở nhà mạng khác | Chưa biết | Đo trên điện thoại 4G; nếu lỗi mới thêm proxy ảnh (tốn request Worker) |

## 11. Việc của người dùng

- Chốt tên site và subdomain; tạo repo GitHub private trên web (AGENTS.md: không có gh CLI).
- Đăng ký Steam Web API key và khai tên ứng dụng (trang đăng ký nằm trên steamcommunity.com, máy này không kết nối được tới tên miền đó,
  nên cần cách vào khác); nếu endpoint chấp nhận key thì wrangler secret put STEAM_KEY.
- Trước commit đầu, đặt core.sshCommand và user.email local (AGENTS.md §3).
- wrangler login nếu tài khoản thiếu quyền D1 (lần 07/11 ở moments, Wrangler D1 bị từ chối 7403).
- Tạo D1/R2 và deploy production (AGENTS.md §3: deploy production do người dùng làm). GĐ 4: wrangler secret put cho
  token Telegram bot.

## 12. Điều khoản Steam Web API (đọc đủ 11 mục, bản lưu web.archive.org của trang, ghi "Last updated July 2010")

| Điều khoản | Việc phải làm |
|---|---|
| Mục 1–2: giấy phép cấp cho người đăng ký key, cho ứng dụng khai trong form, theo tài liệu Web API | Kế hoạch đang gọi endpoint không key và không có trong tài liệu, nên đọc theo chữ là nằm ngoài giấy phép. Đăng ký key; GĐ 0 thử thêm key vào Query/GetItems |
| Mục 2, 5: không để trang có vẻ do Valve bảo trợ hoặc có ở bên thứ ba; không nêu quan hệ nào khác với Valve | Footer "Không liên kết với Valve"; không dùng logo Steam làm logo site |
| Mục 2, 7, 8: cung cấp dữ liệu "as is" kèm miễn trừ tương đương | Footer/trang Giới thiệu: giá lấy từ Steam, có thể chậm hoặc sai, kiểm lại trước khi mua |
| Mục 2: không gửi marketing không được yêu cầu | Telegram chỉ gửi cho người đã đặt cảnh báo |
| Mục 2: 100.000 lần gọi/ngày; không làm giảm hiệu năng Steam | 504 lần/ngày; dừng khi gặp 429 |
| Mục 2: chính sách riêng tư cho dữ liệu người dùng Steam không công khai | Kế hoạch không lấy dữ liệu người dùng Steam nên không áp dụng. Vẫn cần trang quyền riêng tư cho chat_id Telegram ở GĐ 4 (Valve không yêu cầu) |
| Mục 3: đặt tên/logo/link Valve trên trang có dữ liệu Steam, không gắn nofollow, theo "Steam Web API Network Branding Requirements" | Footer có link tới Steam; đọc tài liệu branding (chưa đọc) trước GĐ 2 |
| Mục 6: bồi thường Valve với khiếu nại của bên thứ ba | Rủi ro thuộc về người vận hành |
| Mục 10–11: Valve đổi điều khoản hoặc ngừng bất cứ lúc nào, không báo trước; khi chấm dứt phải xoá mọi bản sao dữ liệu Steam | Lịch sử giá tự ghi cũng là dữ liệu Steam: chấp nhận rủi ro mất, hoặc hỏi webapi@valvesoftware.com |

Phần đã đọc không có điều khoản cấm quảng cáo hay affiliate. **Chưa đọc:** Steam Subscriber Agreement, Network Branding Requirements.

## 13. Còn mở

- Tên site, subdomain.
- Có theo dõi DLC ngay (8.781 DLC đang giảm, gần gấp đôi lượng ghi) hay để GĐ 5.
- Ngưỡng mặc định ẩn game ít đánh giá: 50 là đề xuất.

## 14. Review lần 2 (07/11)

Sửa trong lần này, theo thứ tự quan trọng:

1. **Quy tắc huỷ lượt khi số appid lệch total** bị bỏ (mục 3.2): lệch xảy ra tự nhiên vì phân trang theo offset, nên snapshot sẽ đứng đúng lúc
   nhiều thay đổi nhất. Thay bằng bỏ trùng + bước reconcile bằng GetItems; thêm khoá chống hai lượt chạy chồng nhau.
2. **Thêm điều khoản Steam Web API** (mục 12), trước đó chỉ có con số 100.000 lần gọi/ngày: yêu cầu key, link Valve, miễn trừ.
3. **Giảm giá ra mắt** (18,7% danh sách): thêm trường k, nhãn riêng, ẩn mặc định.
4. **Gỡ khẳng định không có nguồn** "mã 28 là tiếng Việt, cả Dota 2 và CS2 đều có": giữ lại dưới dạng chưa xác nhận.
5. **Số liệu cập nhật:** ảnh trung vị 11 KB (không phải ~5 KB); CPU một bước trang đo được 1,9–3,1 ms; kích thước snapshot 202 B/game; thêm
   R2 Class B; trần 100.000 request/ngày tính cả lượt trúng Cache API; vùng giá theo country_code, không theo IP.
6. **Đã đo, không đổi kết luận:** ảnh game mới tải được từ CDN (8/8); mã chế độ chơi 9, 38, 39, 24 đúng nghĩa; kế hoạch không đụng Cron
   Trigger nào của workspace (không có wrangler.jsonc nào khai crons).

Hai ảnh chụp dữ liệu thật dùng làm fixture nằm ở fixtures/sale-vn-a.json.gz và sale-vn-b.json.gz (~270 KB mỗi tệp, các trường đã rút gọn).

