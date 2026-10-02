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

## Cộng điểm từ các tính năng khác (check-in, báo ngập...)

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
| GET | `/api/places/nearby` | Tuỳ chọn | `lat, lng, radius_km, categories, tags, price_min, price_max, min_rating, district, q, open_at, vehicle, sort, page, limit` | `{ items, total, has_more }` (kèm `distance_km`, `travel_minutes`, `my_pin`) |
| GET | `/api/places/:id` | Tuỳ chọn | — | Chi tiết 1 địa điểm |
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
