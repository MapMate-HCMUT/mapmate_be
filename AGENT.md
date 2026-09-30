# 🤖 AGENT GUIDELINES — BACKEND ARCHITECTURE (`mapmate_be`)

> **Mục tiêu:** Bản hướng dẫn kỹ thuật chuẩn mực dành cho AI Agent và Developer khi đọc, tạo mới hoặc refactor mã nguồn Backend của dự án **MapMate**.  
> **Kiến trúc:** Layered MVC / Clean Modular Architecture (Node.js & Express). Hỗ trợ linh hoạt cả **JavaScript (ES6+)** hoặc **TypeScript**.

---

## 📂 1. CẤU TRÚC THƯ MỤC CHUẨN (FOLDER STRUCTURE)

Mọi mã nguồn Backend bắt buộc phải tuân thủ đúng cây thư mục sau:

```
mapmate_be/
├── .github/              # CI/CD Workflows & Actions
├── .husky/               # Git commit hooks (linting, formatting)
├── src/
│   ├── config/           # Cấu hình môi trường (DB, Gemini AI, Goong Maps, JWT, Cloudinary)
│   ├── constants/        # Các hằng số hệ thống, Mã lỗi HTTP, Enum (Flood Severity, User Roles)
│   ├── controllers/      # Tầng tiếp nhận Request & trả về Response (KHÔNG viết logic nặng ở đây)
│   ├── middlewares/      # Middleware: Auth JWT, Error Handler, Request Validation, Rate Limiter
│   ├── models/           # Mongoose Models (7 Collections: User, Place, Itinerary, FloodAlert...)
│   ├── routes/           # Định nghĩa các Endpoint Express Router
│   ├── scripts/          # Script Seeding dữ liệu, kiểm thử hoặc migration
│   ├── services/         # Tầng XỬ LÝ LOGIC NGHIỆP VỤ CỐT LÕI (Gemini AI, Goong API, GeoIntersects)
│   ├── types/            # Type definitions / JSDoc typedef (nếu dùng TS hoặc Document)
│   ├── utils/            # Hàm tiện ích chung: response formatter, async handler, geo calculations
│   ├── app.js (hoặc .ts) # Khởi tạo Express App, middleware toàn cục, routes
│   └── server.js (.ts)   # Kết nối MongoDB Atlas và khởi động HTTP Server
├── .dockerignore
├── .env.example          # Mẫu biến môi trường (PORT, MONGO_URI, GEMINI_API_KEY, GOONG_KEY...)
├── .gitignore
├── package.json
└── AGENT.md              # File hướng dẫn này
```

---

## 🏗️ 2. QUY TẮC PHÂN TÁCH TẦNG NGHIỆP VỤ (SEPARATION OF CONCERNS)

### ❌ KHÔNG ĐƯỢC LÀM (Anti-patterns):
1. **KHÔNG viết Business Logic hoặc truy vấn DB trực tiếp trong `controllers/`:** Controller chỉ làm nhiệm vụ: parse input `req.body/req.params`, gọi `service`, và trả về `res.status().json()`.
2. **KHÔNG `try-catch` thủ công lặp lại ở mọi controller:** Dùng `asyncHandler` wrapper hoặc centralized error middleware.
3. **KHÔNG hardcode giá trị số / chuỗi (Magic Numbers/Strings):** Đưa hết vào `constants/`.

### ✅ BẮT BUỘC PHẢI LÀM (Best Practices):
1. **Controller (`controllers/`):**
   ```javascript
   // Ví dụ controller chuẩn: Gọn gàng, chỉ điều phối
   const itineraryService = require('../services/itinerary.service');
   const { OK } = require('../constants/httpStatus');

   const getItineraryDetail = async (req, res, next) => {
     try {
       const { id } = req.params;
       const data = await itineraryService.getItineraryById(id, req.user.id);
       return res.status(OK).json({ success: true, data });
     } catch (error) {
       next(error);
     }
   };
   ```
2. **Service (`services/`):** Chứa 100% logic nghiệp vụ:
   * Gọi Gemini AI API (với Structured JSON schema).
   * Gọi Goong Maps API (Directions, Geocoding).
   * Thuật toán hình học không gian `$geoIntersects` kiểm tra né ngập.
   * Tính toán XP Gamification và cập nhật CSDL.
3. **Mongoose Models (`models/`):**
   * Phải khai báo đầy đủ chỉ mục: `2dsphere` cho tọa độ, `TTL Index` cho bảng `community_reports` / `flood_alerts`.

---

## 📡 3. CHUẨN ĐỊNH DẠNG RESPONSE & ERROR HANDLING

Mọi API response gửi về Client phải luôn tuân thủ chuẩn JSON đồng nhất:

* **Thành công:**
  ```json
  {
    "success": true,
    "message": "Tạo lịch trình thành công",
    "data": { ... }
  }
  ```
* **Thất bại (Error):**
  ```json
  {
    "success": false,
    "message": "Mô tả lỗi thân thiện",
    "errorCode": "INVALID_BUDGET_RANGE",
    "stack": "..." // Chỉ hiện ở môi trường development
  }
  ```

---

## 🔒 4. QUY TẮC BẢO MẬT & HIỆU NĂNG
1. **Bảo mật:** Luôn sanitize dữ liệu đầu vào. Băm mật khẩu bằng `bcrypt` (10 rounds). Xác thực bằng `JWT`.
2. **Hiệu năng:** Mọi truy vấn địa điểm POI và vùng ngập phải tận dụng chỉ mục `2dsphere` để đạt tốc độ dưới `50ms`. Không query toàn bộ database về bộ nhớ để filter thủ công.
