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
