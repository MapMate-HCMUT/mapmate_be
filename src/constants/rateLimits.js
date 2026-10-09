// Giới hạn tần suất gọi API — chống spam / gọi liên tục làm sập server hoặc cạn hạn mức dịch vụ ngoài (Groq, Goong...).
// Đếm theo người dùng (đã đăng nhập) hoặc IP (khách). Đổi số ở đây, không sửa trong middleware.
const MINUTE_MS = 60 * 1000;

export const RATE_LIMITS = {
  // Mọi request /api: ~5 request/giây duy trì trong 1 phút là quá mức dùng bình thường
  GLOBAL: { WINDOW_MS: MINUTE_MS, MAX_REQUESTS: 300 },
  // Tìm địa điểm (gõ tìm kiếm đã debounce 350ms => người gõ nhanh ~1 request/giây)
  PLACE_SEARCH: { WINDOW_MS: MINUTE_MS, MAX_REQUESTS: 90 },
  // Tính lộ trình (gợi ý / xem trước / chỉnh ±15′) — mỗi lần chạy thuật toán + nhiều truy vấn DB
  ROUTE_COMPUTE: { WINDOW_MS: MINUTE_MS, MAX_REQUESTS: 40 },
  // Xe buýt / metro: trạm theo khung bản đồ, giờ xe tới trạm (tự làm mới 30 giây), tìm cách đi
  TRANSIT: { WINDOW_MS: MINUTE_MS, MAX_REQUESTS: 120 },
  // Xin chữ ký tải ảnh / video lên Cloudinary (mỗi file 1 chữ ký; 1 bài tối đa 6 file)
  MEDIA_UPLOAD: { WINDOW_MS: 10 * MINUTE_MS, MAX_REQUESTS: 30 },
  // Nhận dạng giọng nói (Groq Whisper, gói miễn phí 20 lượt/phút cho CẢ app)
  VOICE: { WINDOW_MS: 10 * MINUTE_MS, MAX_REQUESTS: 20 },
};

// Ngân sách gọi Groq của CẢ server mỗi phút theo model (gói miễn phí ~30 lượt/phút/model, Whisper 20) —
// chừa biên an toàn; vượt => dùng ngay bản dự phòng (luật / mẫu) thay vì chờ Groq trả 429.
export const GROQ_MODEL_RPM = { default: 25, 'whisper-large-v3-turbo': 18, 'whisper-large-v3': 18 };
