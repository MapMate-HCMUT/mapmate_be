# MapMate Backend

Node.js + Express 5 + MongoDB Atlas (Mongoose). Kiến trúc theo [AGENT.md](AGENT.md).

## Chạy local

```bash
npm install
cp .env.example .env   # điền MONGO_URI, JWT_SECRET
npm run dev            # http://localhost:3000/api/health
npm run seed:users     # (tuỳ chọn) tạo 7 tài khoản demo, mật khẩu: Mapmate123
```

## Chuẩn response

```jsonc
// Thành công
{ "success": true, "message": "...", "data": { ... } }
// Lỗi
{ "success": false, "message": "...", "errorCode": "EMAIL_TAKEN", "details": [ ... ] }
```

## User & Gamification API

| Method | Endpoint | Auth | Body / Query | `data` trả về |
|---|---|---|---|---|
| POST | `/api/auth/register` | — | `{ email, password, username }` | `{ userId, token, user }` |
| POST | `/api/auth/login` | — | `{ email, password }` | `{ token, user }` |
| GET | `/api/users/me` | Bearer | — | `{ profile, stats, achievements }` |
| GET | `/api/users/check-username` | Tuỳ chọn | `?username=` | `{ available, reason }` |
| PATCH | `/api/users/me` | Bearer | `{ username?, avatar_url?, birth_date?, home_area? }` | `{ profile }` |
| PUT | `/api/users/me/avatar` | Bearer | `{ image: "data:image/webp;base64,..." }` (≤256KB) | `{ profile }` |
| DELETE | `/api/users/me/avatar` | Bearer | — | `{ profile }` |
| GET | `/api/users/:id/avatar` | — | — | File ảnh (cache 1 năm, URL có `?v=`) |
| GET | `/api/users/me/area-from-location` | Bearer | `?lat=&lng=` | `{ street, district, city, country }` (không số nhà) |
| PATCH | `/api/users/me/password` | Bearer | `{ current_password, new_password }` | — |
| GET | `/api/users/me/xp-history` | Bearer | `?limit=15&before=<next_cursor>` | `{ items, next_cursor }` |
| GET | `/api/users/:id` | — | — | Hồ sơ công khai (không có email) |
| GET | `/api/notifications` | Bearer | `?limit=15&before=<next_cursor>` | `{ items, next_cursor, unread_count }` |
| GET | `/api/notifications/unread-count` | Bearer | — | `{ unread_count }` |
| PATCH | `/api/notifications/:id/read` | Bearer | — | `{ unread_count }` |
| PATCH | `/api/notifications/read-all` | Bearer | — | `{ updated, unread_count }` |
| GET | `/api/leaderboard` | Tuỳ chọn | `?period=week\|month\|all&limit=20` | `{ period, period_start, rankings, me }` |

- Token JWT hết hạn sau 7 ngày, gửi qua header `Authorization: Bearer <token>`.
- `password`: 8–72 ký tự, có chữ và số.
- **Quy định `username`**: 3–20 ký tự; chỉ chữ cái không dấu, số, `.`, `_`; bắt đầu bằng chữ cái; không kết thúc bằng `.`/`_`; không có 2 dấu liền nhau; không trùng (không phân biệt hoa/thường); không dùng tên dành riêng (`admin`, `mapmate`, `support`...); đổi tối đa 1 lần / 14 ngày. Cấu hình tại [src/constants/auth.js](src/constants/auth.js).
- **Thông tin cá nhân**: `birth_date` (`YYYY-MM-DD`, ≥13 tuổi), `home_area` `{ street, district, city, country }` — không chấp nhận số nhà, không lưu toạ độ. Người khác chỉ thấy `city` + `country`.
- **Thông báo** tự tạo khi: đăng ký, mở huy hiệu, lên level, đổi mật khẩu. Tự xoá sau 90 ngày.
- `/api/auth/*` giới hạn 20 request / 15 phút / IP.
- `/api/users/me` đồng thời ghi nhận **streak** (mở app mỗi ngày, giờ VN) và thưởng +5 XP/ngày.
- `/api/leaderboard` được cache 10 phút. Gửi kèm token thì `me` chứa hạng của bạn (kể cả ngoài top).

| errorCode | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Input sai định dạng (chi tiết trong `details`) |
| `EMAIL_TAKEN` / `USERNAME_TAKEN` | 409 | Đăng ký trùng |
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `WRONG_CURRENT_PASSWORD` / `SAME_PASSWORD` | 400 | Đổi mật khẩu: sai mật khẩu cũ / mật khẩu mới trùng cũ |
| `USER_NOT_FOUND` | 404 | Không có người dùng với id này |
| `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED` | 401 | Thiếu / sai / hết hạn token |
| `TOO_MANY_REQUESTS` | 429 | Vượt rate limit |

## Cộng điểm từ các tính năng khác (check-in, báo cáo đường...)

Không tự `$inc` XP trong service khác — luôn gọi `rewardAction`:

```js
import { XP_ACTIONS } from '../constants/gamification.js';
import { rewardAction } from '../services/gamification.service.js';

const result = await rewardAction(userId, XP_ACTIONS.CHECK_IN, {
  refKey: `stop:${itineraryId}:${placeId}`, // cùng refKey => chỉ thưởng 1 lần
});
// { awarded, xp_earned, stars_earned, total_xp, level, level_up, new_badges }
// hoặc { awarded: false, reason: 'ALREADY_REWARDED' }
```

`rewardAction` chạy trong 1 transaction: ghi sổ XP → cộng XP/sao/bộ đếm → mở huy hiệu → cập nhật level.
Bảng điểm, level, huy hiệu cấu hình tại [src/constants/gamification.js](src/constants/gamification.js).

## Dữ liệu (MongoDB — database `mapmate`)

| Collection | Vai trò | Index chính |
|---|---|---|
| `users` | Hồ sơ, xp, stars, level, streak, bộ đếm `stats` | `email` unique · `username` unique (không phân biệt hoa/thường) · `{ xp: -1 }` |
| `user_achievements` | Huy hiệu đã mở | `{ user_id, badge_code }` unique |
| `notifications` | Thông báo của từng người | `{ user_id, created_at }` · chưa đọc (partial) · TTL 90 ngày |
| `user_avatars` | Ảnh đại diện tự tải lên (tách khỏi `users`) | `user_id` unique |
| `xp_transactions` | Sổ cái XP (mỗi lần cộng điểm 1 dòng) | `{ user_id, created_at }` · `{ created_at, user_id, xp }` (covering cho leaderboard) · `{ user_id, action, ref_key }` unique |

## Khám phá: Địa điểm & Lộ trình

```bash
npm run seed:places   # nạp 44 địa điểm mẫu tại TP.HCM (chạy lại được, không tạo trùng)
npm run seed:social   # (tuỳ chọn) bạn bè, ghim, lộ trình, bài viết demo — cần seed:users + seed:places trước
```

| Method | Endpoint | Auth | Body / Query | `data` trả về |
|---|---|---|---|---|
| GET | `/api/places/filter-options` | — | — | Mọi lựa chọn của bộ lọc: `categories`, `tags`, `vehicles`, `sorts`, `price`, `districts`... |
| GET | `/api/places/nearby` | Tuỳ chọn | `lat, lng, radius_km, categories, tags, price_min, price_max, min_rating, district, q, open_at, vehicle, sort (mặc định recommended), page, limit` | `{ items, total, total_capped, has_more }` (kèm `distance_km`, `travel_minutes`, `my_pin`, `source`, `hours_known`, `price_estimated`). Đếm tối đa 1.000 (`total_capped = true` => hiện "1.000+") |
| GET | `/api/places/:id` | Tuỳ chọn | — | Chi tiết 1 địa điểm (kèm `status`, `report_counts`, `my_report`, `data_updated_at`) |
| POST | `/api/places/:id/reports` | Bearer | `{ type: 'closed' \| 'open' }` | `{ status, report_counts, my_report }` — báo nơi này đã đóng cửa / vẫn mở |
| POST | `/api/itineraries/suggest` | Tuỳ chọn | `{ criteria, place_ids? }` | `{ criteria, candidate_count, options[≤3] }` — mỗi option có `stops[]` + `summary` |
| POST | `/api/itineraries/preview` | — | `{ criteria, place_ids }` | `{ stops, summary }` cho đúng các điểm đang chọn |
| POST | `/api/itineraries` | Bearer | `{ name, place_ids, vehicle, people, start_time, origin, criteria, tags, visibility }` | Lộ trình đã lưu |
| GET | `/api/itineraries` | Bearer | — | `{ items }` |
| GET | `/api/itineraries/:id` | Tuỳ chọn | — | Lộ trình (theo quyền xem) |
| PATCH / DELETE | `/api/itineraries/:id` | Bearer | `{ name?, visibility?, tags?, status? }` | — |
| POST | `/api/itineraries/:id/clone` | Bearer | — | Bản sao về tài khoản mình |

- **`criteria` (tiêu chí chuyến đi)** = bộ lọc người dùng chọn: `origin, categories, tags, price_min, price_max (≤2.000k), trip_budget (50k–2.000k hoặc null), people, vehicle, transport_modes, radius_km, min_rating, start_time, duration_hours (1–12), open_only, district`. Được lưu trong `itineraries.criteria` → dùng làm đầu vào cho AI Planner. Schema: [itinerary.validator.js](src/middlewares/validators/itinerary.validator.js).
- **Gợi ý lộ trình** ([itineraryPlanner.service.js](src/services/itineraryPlanner.service.js)): mỗi chiến lược (tiết kiệm / được yêu thích / gần nhất / cân bằng) chấm điểm địa điểm theo trọng số khác nhau → tối đa 3 lộ trình. Có xét ngân sách, giờ mở cửa, đa dạng loại hình. `place_ids` = các điểm người dùng tự chọn, luôn được giữ.
- **Phương tiện** (`vehicle`): `bike`, `car`, `walk`, `public` (buýt + metro + đi bộ), `metro_grab` (metro + Grab xe máy), `custom` (tự chọn trong `transport_modes`: `bus`, `metro`, `grab_bike`, `grab_car`). Mỗi chặng, [utils/transport.js](src/utils/transport.js) so sánh các cách đi được phép (kể cả đi bộ/buýt/Grab tới ga metro) và chọn cách tốt nhất theo thời gian + chi phí.
- **Bảng giá** nằm ở [constants/transport.js](src/constants/transport.js) (cập nhật 02/10/2026): Metro số 1 7.000–20.000đ/lượt theo quãng đường (ước tính trong khung giá), xe buýt miễn phí đến hết 31/12/2026 rồi 7.000–9.000đ từ 2027 (tự đổi theo ngày), Grab và xe cá nhân là giá tham khảo. Đổi giá chỉ cần sửa file này.
- **`summary`** của mỗi lộ trình: `total_minutes`, `travel_minutes`, `visit_minutes`, `total_distance_km`, `places_cost_per_person`, `transport_cost_per_person`, `cost_per_person`, `total_cost`, `budget_left`, `time_left_minutes`, `within_budget`, `within_duration`, `avg_rating`, `all_open`, `transport[]` (theo từng phương tiện). Được lưu vào `itineraries.summary`.
- Khoảng cách/thời gian là **ước lượng** (đường chim bay × 1.3, tốc độ trung bình từng phương tiện). Khi tích hợp Goong Directions / Distance Matrix chỉ cần thay hàm `planLeg` trong [utils/transport.js](src/utils/transport.js).
- `Place` và `Itinerary` là model có sẵn, chỉ **thêm trường** (`tags`, `review_count`, `opening_hours`, `avg_visit_minutes`, `search_text`; `criteria`, `visibility`, `people`...) và thêm loại hình `entertainment`.

## Dữ liệu địa điểm từ nguồn mở (Overture Maps + OpenStreetMap)

~25.700 quán ăn, cà phê, điểm tham quan, giải trí, mua sắm ở TP.HCM — giấy phép cho phép **lưu vào DB** (khác Google Places), chỉ cần ghi nguồn (frontend đã hiện dưới danh sách).

```bash
pip install overturemaps            # 1 lần (Python ≥ 3.10) — công cụ tải chính thức của Overture
npm run places:fetch-overture       # -> data/open/overture_hcmc.geojsonseq (~450 MB, ~30 giây)
npm run places:fetch-osm            # -> data/open/osm_hcmc.json (~2 MB, qua Overpass API)
npm run places:import -- --dry-run  # chỉ thống kê, KHÔNG ghi DB
npm run places:import               # ghi vào `places` (~2 phút). Thêm --prune khi làm mới định kỳ (xem bên dưới)
npm run places:link-venues -- --dry-run  # gắn quán / rạp nằm trong mall vào mall (places:import tự chạy bước này)
```

- Chạy `seed:places` **trước** để 44 địa điểm nhóm tự nhập được giữ nguyên (dữ liệu mở trùng tên sẽ bị bỏ qua).
- Nhập lại nhiều lần được: cập nhật theo `source_ref`, **không ghi đè** `rating`, `review_count`, `price_range`, `is_trending` (để dành cho cộng đồng sửa). `--prune` không xoá nơi đang được ghim / đăng bài / có trong lộ trình.
- Kết quả chi tiết của mỗi lần nhập: `data/open/import-report.json`. Thư mục `data/open/` không đưa lên git.
- Trường mới của `Place`: `source` (`mapmate` / `overture` / `osm` / `community`), `source_ref`, `osm_ref`, `confidence`, `price_estimated`, `hours_known`, `cuisines`, `contact { phone, website, facebook }`.
- Dữ liệu mở **không có đánh giá** (`rating = 0`, hiện "Chưa có đánh giá"), **giá là ước tính theo loại hình** (`price_estimated = true`), phần lớn **chưa rõ giờ** (`hours_known = false` — khác với `opening_hours = null` của dữ liệu nhóm nghĩa là mở cả ngày).
- Loại hình **Công viên** (`park`): công viên cây xanh, khu vui chơi (Suối Tiên, Đầm Sen), công viên nước, sở thú.

### Giữ dữ liệu luôn mới (quán đóng cửa)

| Cơ chế | Khi nào | Kết quả |
|---|---|---|
| **Làm mới hằng tháng** — [.github/workflows/refresh-places.yml](.github/workflows/refresh-places.yml) | 03:00 ngày 26 hằng tháng (sau khi Overture ra bản mới) hoặc bấm *Run workflow* | Thêm nơi mới, cập nhật thông tin. Nơi biến mất khỏi nguồn: **xoá**; nếu đang được ghim / đăng bài / có trong lộ trình thì chuyển `status = closed` (ẩn). Xuất hiện lại => tự mở lại |
| **Cộng đồng báo** — `POST /api/places/:id/reports` | Bất cứ lúc nào | Điểm = số người báo "đã đóng" − số người báo "vẫn mở" (phiếu trong 180 ngày): ≥ 1 => `maybe_closed` (cảnh báo, planner tránh), ≥ 3 => `closed` (ẩn) + người báo đúng được +20 XP |

- `Place.status`: `active` · `maybe_closed` · `closed`; `closed_by`: `source` (nguồn gỡ — lần nhập sau có thể mở lại) hoặc `community` (cộng đồng báo — nhập lại **không** mở lại). Nơi `closed` không hiện trong tìm kiếm / gợi ý lộ trình nhưng bài viết cũ vẫn xem được.
- Bật workflow: repo GitHub → Settings → Secrets and variables → Actions → thêm `MONGO_URI`; MongoDB Atlas → Network Access phải cho phép `0.0.0.0/0` (máy GitHub đổi IP mỗi lần chạy).
- Báo cáo mỗi lần chạy: tab Actions → lần chạy → Artifacts → `import-report`.
- Code: [src/scripts/importOpenPlaces.js](src/scripts/importOpenPlaces.js) + [src/scripts/openData/](src/scripts/openData) (ánh xạ loại hình + giá ước tính ở `placeKinds.js`, gộp trùng ở `placeMerger.js`, chuẩn hoá quận ở `districts.js`).

## AI Planner (Groq) — `/ai-planner`

Người dùng gõ yêu cầu tự do ("Tối nay 2 người đi hẹn hò Quận 1, 500k/người") → các Agent xử lý → lộ trình từ **dữ liệu thật** trong DB + lời tư vấn.

| Bước | File | Việc làm |
|---|---|---|
| 0. Bộ lọc đầu vào | [inputGuard.js](src/services/ai/inputGuard.js) | Cắt ≤ 1.000 ký tự, che SĐT / email trước khi gửi ra ngoài, đánh dấu prompt injection |
| 1. Hiểu yêu cầu | [interpreter.agent.js](src/services/ai/interpreter.agent.js) | Model **nhanh**, temperature 0, schema `mapmate_trip_request`: ý định, tiêu chí, thứ tự điểm dừng (`sequence`), bữa (`meals`), `food_tour`, `stop_count`, chất lượng yêu cầu (`ok / needs_info / unrealistic / not_allowed`), câu hỏi về địa điểm |
| 2. Quyết định | [aiPlanner.service.js](src/services/ai/aiPlanner.service.js) | Không được phép → từ chối. Quá chung chung (chưa biết làm gì **và** ở đâu) → hỏi lại ≤ 2 câu kèm nút trả lời, **tối đa 1 lượt** ([pendingRequest.js](src/services/ai/pendingRequest.js) ghép câu trả lời vào yêu cầu cũ). Hỏi về 1 địa điểm → bước 2b |
| 2b. Hỏi về địa điểm | [placeAnswer.agent.js](src/services/ai/placeAnswer.agent.js) | Giờ / giá / địa chỉ từ **DB**; bối cảnh từ **Wikipedia vi** (chỉ địa danh, bài phải cách ≤ 500 m); thời tiết **Open-Meteo**; ước tính đường đi. Mỗi ý ghi nguồn |
| 3. Chuẩn hoá & neo vào DB | [criteriaBuilder.js](src/services/ai/criteriaBuilder.js) | Kẹp giới hạn, đổi "tối nay" / "ăn trưa" thành giờ, ước lượng thời lượng theo khuôn, tìm địa danh / món trong DB, ghi **giả định** |
| 4. Kiểm tra khả thi | [feasibility.js](src/services/ai/feasibility.js) | "8 chỗ trong 1 tiếng", "buffet 50k", "ăn trưa + tối trong 2 tiếng" → từ chối kèm **con số** + phương án gần nhất (nút bấm) |
| 5. Lên lộ trình | [itineraryPlanner.service.js](src/services/itineraryPlanner.service.js) | Khuôn theo vai trò ([tripComposer.js](src/services/tripComposer.js)) → lấp quán thật → kiểm tra luật ăn uống ([itineraryValidator.js](src/services/itineraryValidator.js)). Đi trong 48 giờ → kèm dự báo thời tiết |
| 6. Tư vấn | [advisor.agent.js](src/services/ai/advisor.agent.js) | Model người dùng chọn, schema `mapmate_advice`: `option_key` / `place_id` chỉ được chọn trong dữ liệu thật => không bịa |
| Dự phòng | [ruleInterpreter.js](src/services/ai/ruleInterpreter.js), [adviceTemplates.js](src/services/ai/adviceTemplates.js) | Chưa có key / Groq lỗi => hiểu câu theo luật + lời khuyên theo mẫu, vẫn chạy đủ các bước trên |

**Luật ăn uống** ([constants/tripRules.js](src/constants/tripRules.js)) — mỗi điểm dừng có vai trò `meal` (bữa chính) / `snack` (ăn vặt) / `drink` (đồ uống) / `activity` (vui chơi), suy từ `Place.kind` + tên ([utils/visitRole.js](src/utils/visitRole.js)):
- 2 bữa chính cách nhau ≥ 4 tiếng và nằm trong khung giờ ăn (sáng 6–10h, trưa 10:30–14:30, tối 17–21h, khuya 21–24h); tới sớm → "thời gian tự do" ≤ 90′ hoặc ở điểm vui chơi trước lâu hơn.
- Tối đa 2 điểm ăn vặt (food tour: 4), cách nhau ≥ 45′; tối đa 2 điểm đồ uống, không liền nhau.
- "Tìm chỗ ăn 400k" = 1 bữa chính + tráng miệng; "ăn trưa rồi cà phê" giữ đúng thứ tự người dùng nói.

**Thời gian ở lại** ([utils/stayTime.js](src/utils/stayTime.js)) là 1 khoảng quanh `avg_visit_minutes`, không cố định: bún bò 40′ (30–60′), buffet 90′ (70–120′), mall 90′ (tới ~4 tiếng), rạp phim cố định theo suất. Nhóm đông +10′ mỗi 2 người (bữa chính tối đa +30′). Planner kéo dài trong khoảng này khi chờ tới giờ ăn hoặc khi người dùng chọn thời lượng dài hơn lộ trình; người dùng tự chỉnh ±15′ từng điểm (`/preview` với `keep_order` + `stay_overrides`, lưu kèm `stay_overrides`).

**Điểm trong mall** ([constants/venues.js](src/constants/venues.js), [scripts/openData/venueLinker.js](src/scripts/openData/venueLinker.js)): quán / rạp nằm trong trung tâm thương mại được gắn `parent_place_id` (địa chỉ ghi tên mall ≤ 250 m, cùng số nhà + đường ≤ 150 m, hoặc "Tầng / Lầu..." ≤ 40 m). Hai điểm cùng mall => đi bộ 5′, 0đ. "Đi Vincom / đi mall chơi" => chuyến đi mall (`criteria.venue_id`): chọn mall (gọi tên, hoặc mall gần mà có nhiều quán bên trong), ưu tiên ăn / uống / xem phim bên trong, chờ giờ ăn = dạo mall.

**Groq** (API tương thích OpenAI): structured outputs `strict: true` chỉ có ở `openai/gpt-oss-20b` (nhanh) và `openai/gpt-oss-120b` (thông minh). Chế độ strict không nhận `minLength / maxLength / pattern / minimum / maximum` → [aiSchemas.js](src/services/ai/aiSchemas.js) gỡ khỏi schema gửi đi, server vẫn kiểm tra đủ bằng Zod (sai khuôn → yêu cầu sửa 1 lần). 429 → chờ theo `retry-after` (≤ 8 giây) rồi thử lại 1 lần, sau đó chuyển dự phòng ([llmClient.js](src/services/ai/llmClient.js)). Gói miễn phí: 30 lượt / phút, 8.000 token / phút, 1.000 lượt / ngày.
- Biến môi trường: `GROQ_API_KEY` (lấy ở console.groq.com/keys), tuỳ chọn `GROQ_MODEL_FAST`, `GROQ_MODEL_SMART`, `GROQ_BASE_URL`.
- Nguồn ngoài (miễn phí, không cần key — [constants/externalSources.js](src/constants/externalSources.js)): Wikipedia vi (CC BY-SA 4.0, cache 7 ngày, **không** dùng cho giờ / giá), Open-Meteo (CC BY 4.0, phi thương mại < 10.000 lượt / ngày, cache theo ô ~1 km mỗi giờ). Giao diện luôn hiện nguồn + link.
- Không ghi log nội dung câu chat. Giới hạn 20 lượt / 10 phút / IP. Test: `npm test`.

**An toàn nội dung** ([constants/aiSafety.js](src/constants/aiSafety.js), [services/ai/safety/](src/services/ai/safety)) — 3 lớp, chặn quyền riêng tư (tìm nhà / SĐT / vị trí / theo dõi 1 người), người lớn, chất cấm, bạo lực, xúc phạm, tự hại và "bẻ khoá" (jailbreak):
1. Luật trong code (tức thì, so cả chữ bỏ dấu + chữ viết tách "c.ầ.n s.a") — bắt được thì không gửi gì cho Groq.
2. `meta-llama/llama-prompt-guard-2-86m` (chống jailbreak) + 3. `openai/gpt-oss-safeguard-20b` (theo chính sách MapMate) — chạy song song với bước hiểu yêu cầu. Safeguard gói miễn phí chỉ 2.000 token/phút => hết hạn mức thì bước hiểu yêu cầu tự gắn `safety_category` (không hở).
Bị chặn => lý do rõ ràng + câu hỏi thay thế (ưu tiên theo ghi nhớ); tự hại => trả lời quan tâm + đường dây hỗ trợ.

**Ghi nhớ của AI** ([services/ai/memory.service.js](src/services/ai/memory.service.js), collection `aimemories`, chỉ người đã đăng nhập): tự học phương tiện / số người / ngân sách / khu vực / món / phong cách (lặp lại ≥ 2 lần mới ghi nhớ) + ghi chú khi người dùng nói "nhớ giúp mình là…" ("quên hết" để xoá). Dùng để điền chỗ trống (ghi chú "Theo ghi nhớ: …"), cho model bối cảnh (VD ăn chay => chỉ chọn quán chay) và gợi ý câu hỏi. Người dùng xem / xoá từng mục / tắt ở trang AI Planner.

**Giọng nói** (`POST /api/ai/transcribe`, body là file âm thanh thô `audio/*` ≤ 4 MB): Groq `whisper-large-v3-turbo`, tự nhận tiếng Việt / tiếng Anh; âm thanh không lưu lại. Bỏ kết quả "bịa" khi không có tiếng nói.

**Giới hạn tần suất** ([constants/rateLimits.js](src/constants/rateLimits.js)) — theo tài khoản (đã đăng nhập) hoặc IP: mọi `/api` 300/phút; tìm địa điểm 90/phút; gợi ý / xem trước lộ trình 40/phút; AI chat 20 / 10 phút; giọng nói 20 / 10 phút. Thêm "ngân sách" Groq cho cả server (~25 lượt/phút/model) — sắp hết thì dùng bản dự phòng ngay thay vì để Groq trả 429. Chạy sau reverse proxy => đặt `TRUST_PROXY=1`.

| Method | Endpoint | Auth | Body | `data` trả về |
|---|---|---|---|---|
| GET | `/api/ai/options` | — | — | `{ llm_enabled, default_model, models[], examples[], prompt_max_length }` |
| POST | `/api/ai/chat` | Tuỳ chọn | `{ message, session_id?, context?: { criteria, must_visit_ids, pending }, origin?, model: 'fast' \| 'smart' }` | `{ session_id, intent, reply, request_quality, clarifying_questions[], refusal: { kind, reasons, alternatives } \| null, place_answer \| null, weather \| null, understood, options[] (+ ai_note), places[] (+ ai_recommended), tips, warnings, follow_up_suggestions, pending, sources, trace[] }` |
| POST | `/api/ai/recommend` | Tuỳ chọn | `{ message, location?, budget?, vehicle?, people?, model }` (Milestone 2) | Như `/chat` |
| GET | `/api/ai/sessions` | Bearer | — | `{ items }` |
| GET / DELETE | `/api/ai/sessions/:id` | Bearer | — | Lịch sử tin nhắn + tiêu chí đã nhớ |
| GET / PATCH / DELETE | `/api/ai/memory` | Bearer | PATCH `{ enabled }` | `{ enabled, facts, notes[], summary, suggestions[] }` (DELETE = xoá hết) |
| DELETE | `/api/ai/memory/facts/:key`, `/api/ai/memory/notes/:id` | Bearer | — | Ghi nhớ sau khi xoá 1 mục |
| POST | `/api/ai/transcribe` | Tuỳ chọn | file âm thanh (`Content-Type: audio/webm`…) | `{ text, language }` |

- Đã đăng nhập: lưu phiên vào `aisessions` (`criteria`, `must_visit_ids`, `pending` = bộ nhớ để lượt sau hiểu "rẻ hơn", "Quận 1"). Khách: frontend gửi lại `context` mỗi lượt (`pending` được kiểm tra lại đúng schema).
- `understood.criteria` đúng chuẩn `tripCriteriaSchema` => dùng chung với `/api/itineraries/*` và bộ lọc Khám phá ("Chỉnh trong Khám phá").

## Xe buýt, Metro số 1, buýt đường sông — `/api/transit`

Dữ liệu **công khai** của Trung tâm Quản lý Giao thông công cộng TP.HCM (API mà trang buyttphcm.com.vn dùng): ~180 tuyến (gồm Metro số 1 `MRT1`, buýt đường sông `SWB1`), trạm có toạ độ, lộ trình 2 chiều, giờ xuất bến từng chuyến, dự đoán xe tới trạm theo GPS. Tuyến đưa rước học sinh (`HS-..`) không được gợi ý; buýt đường sông tạm chưa dùng (`ENABLED_TRANSIT_MODES`).

```bash
npm run transit:import -- --dry-run   # thử: tải + thống kê (lần đầu ~1.600 request, ~15–20 phút; cache data/transit/cache 7 ngày)
npm run transit:import                # ghi vào MongoDB (transitroutes, transitstops) — nên chạy lại hằng tuần
```

- **Tìm cách đi** (`services/transit/transitPlanner.js`, mạng lưới nạp vào bộ nhớ, tự nạp lại khi có dữ liệu mới): đi thẳng 1 tuyến hoặc đổi tuyến 1 lần (đi bộ ≤ 300 m sang trạm khác). Ra / rời trạm theo lựa chọn `connector`: `walk` (chỉ đi bộ ≤ `max_walk_m`), `ride` (gọi xe máy công nghệ, trừ đoạn < 300 m), `auto` (gần đi bộ, xa gọi xe ≤ 5 km). Tuyến đã có trạm đi bộ tới được thì không gọi xe tới trạm khác của tuyến đó; gọi xe > 60% quãng đường => bỏ (gọi xe đi thẳng còn hơn).
- **Gộp tuyến** lên / xuống cùng trạm thành 1 phương án (giống Google: `03 / 36 / 93`, mỗi chặng có `alternatives` — chỉ tuyến có xe tới ≤ 20 phút sau xe chính).
- **Đường đi bộ** để vẽ: `POST /api/transit/walk-path` (OSRM foot của FOSSGIS trên OpenStreetMap, cache 7 ngày; lỗi => đường thẳng) — Goong không có chế độ đi bộ, mượn đường xe máy bị vòng theo đường một chiều.
- Luôn so cùng **gọi xe đi thẳng** và **đi bộ** (≤ 2,5 km) => không có tuyến nào phù hợp vẫn có phương án. Xếp hạng theo `priority`: `fastest` · `least_walk` · `cheapest` (thời gian + phạt đổi tuyến 5 phút + đi bộ / chi phí theo trọng số); phương án đầu = gợi ý, kèm nhãn nhanh nhất / ít đi bộ / rẻ nhất.
- **Giờ chờ** theo giờ xuất bến thật của lịch đang áp dụng đúng thứ trong tuần (cộng thời gian xe chạy tới trạm); hết chuyến => không gợi ý tuyến đó. Không có lịch => nửa giãn cách, trong giờ hoạt động. Giá: xe buýt trợ giá / metro theo `constants/transport.js`, gọi xe là giá tham khảo.

| Method | Endpoint | Body / Query | Trả về |
|---|---|---|---|
| GET | `/api/transit/stops` | `bbox` (≤ 0,3°) | trạm trong khung bản đồ |
| GET | `/api/transit/stops/:stopId` | — | trạm + các tuyến dừng (hướng đi) |
| GET | `/api/transit/stops/:stopId/arrivals` | — | xe sắp tới theo GPS (cache 20 giây) |
| GET | `/api/transit/routes` · `/routes/:routeId` | — | danh sách tuyến · chi tiết (các lượt: đường đi, trạm, chuyến đầu / cuối) |
| GET | `/api/transit/lines` | — | metro (đường + ga) để vẽ sẵn |
| POST | `/api/transit/walk-path` | `{ from, to }` (≤ 6 km) | đường đi bộ thật |
| POST | `/api/transit/plan` | `{ from, to, priority?, connector?, max_walk_m?, depart_at? }` | các phương án A → B |
| POST | `/api/transit/trip-plan` | `{ waypoints: [lng, lat][], stays?: phút[], ...ưu tiên }` | phương án từng chặng của cả chuyến |

Luôn hiển thị nguồn: "Dữ liệu xe buýt & metro: Trung tâm Quản lý Giao thông công cộng TP.HCM — buyttphcm.com.vn".

## Kết nối: Bạn bè, Bảng tin, Ghim

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/friends` · `/api/friends/requests` · `/api/friends/suggestions` | Bạn bè · lời mời đến/đi · gợi ý |
| POST | `/api/friends/requests` `{ user_id }` | Gửi lời mời (người kia đã mời trước → thành bạn luôn) |
| POST | `/api/friends/requests/:id/accept` | Đồng ý |
| DELETE | `/api/friends/requests/:id` · `/api/friends/:userId` | Từ chối / thu hồi · huỷ kết bạn |
| GET | `/api/users/search?q=` | Tìm người theo username, kèm quan hệ |
| GET | `/api/posts?scope=public\|friends\|mine&tag=&author_id=&place_id=&before=&limit=` | Bảng tin (cursor) |
| GET | `/api/posts/trending-tags` · `/api/posts/:id` | Hashtag nổi bật 14 ngày · 1 bài viết |
| POST | `/api/posts` `{ type: place\|itinerary\|text, content, place_id?, itinerary_id?, rating?, visited?, tags[], tagged_user_ids[], visibility }` | Đăng bài |
| POST / DELETE | `/api/posts/:id/like` · `/api/posts/:id/repost` | Thích · đăng lại (chỉ bài công khai) |
| POST | `/api/posts/:id/share` `{ friend_ids[], message }` | Gửi cho bạn bè (qua thông báo) |
| DELETE | `/api/posts/:id` | Xoá bài của mình (xoá luôn các bài đăng lại) |
| GET / PUT / DELETE | `/api/pins` · `/api/pins/:placeId` `{ status: visited\|wishlist, note?, rating?, visited_on? }` | Ghim địa điểm |
| GET | `/api/users/:id/pins` | Những nơi 1 người đã đi (công khai) |

- Quyền xem: bài `friends` chỉ tác giả + bạn bè thấy; không có quyền → trả 404. Chỉ gắn thẻ / gửi bài cho **bạn bè**.
- Thông báo mới: lời mời kết bạn, được đồng ý, được gắn thẻ, bài được đăng lại, được chia sẻ bài viết.
- Collection mới: `friendships` (unique `pair_key`), `posts`, `post_likes` (unique `{post_id, user_id}`), `place_pins` (unique `{user_id, place_id}`).
