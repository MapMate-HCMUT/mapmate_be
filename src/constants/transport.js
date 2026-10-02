/**
 * BẢNG GIÁ & THÔNG SỐ DI CHUYỂN TẠI TP.HCM — cập nhật ngày 02/10/2026.
 * 👉 Khi giá đổi, chỉ cần sửa file này (frontend lấy qua GET /api/places/filter-options).
 *
 * Nguồn:
 * - Metro số 1: vé lượt 7.000–20.000đ (tiền mặt), 6.000–19.000đ (không tiền mặt) theo quãng đường;
 *   vé ngày 40.000đ, 3 ngày 90.000đ, tháng 300.000đ (HSSV 150.000đ) — thông báo của HURC1 (01/2025), vẫn áp dụng 2026.
 * - Xe buýt: MIỄN PHÍ 134 tuyến trợ giá từ 01/07/2026 đến hết 31/12/2026; từ 01/01/2027: 7.000/8.000/9.000đ theo cự ly.
 * - Grab: giá tham khảo (GrabBike 12.500đ/2km đầu + 4.300đ/km; GrabCar 4 chỗ 29.000đ/2km đầu + 10.000đ/km),
 *   chưa gồm phụ phí giờ cao điểm — số thực tế xem trên ứng dụng.
 * - Xe cá nhân: ước tính xăng + phí gửi xe.
 */
export const FARES_UPDATED_AT = '2026-10-02';

export const TRANSPORT_MODES = {
  walk: { label: 'Đi bộ', emoji: '🚶', speedKmh: 4.5, waitMinutes: 0 },
  bike: { label: 'Xe máy', emoji: '🛵', speedKmh: 25, waitMinutes: 0, fuelPerKm: 500, parkingPerStop: 5000, seats: 2 },
  car: { label: 'Ô tô', emoji: '🚗', speedKmh: 22, waitMinutes: 0, fuelPerKm: 2000, parkingPerStop: 25000, seats: 4 },
  bus: { label: 'Xe buýt', emoji: '🚌', speedKmh: 15, waitMinutes: 8, accessMinutes: 5 },
  metro: { label: 'Metro', emoji: '🚇', speedKmh: 35, waitMinutes: 6, stationMinutes: 4 },
  grab_bike: { label: 'Grab xe máy', emoji: '🏍️', speedKmh: 25, waitMinutes: 4, baseFare: 12500, baseKm: 2, perKm: 4300, platformFee: 3000, seats: 1 },
  grab_car: { label: 'Grab ô tô', emoji: '🚕', speedKmh: 22, waitMinutes: 5, baseFare: 29000, baseKm: 2, perKm: 10000, platformFee: 0, seats: 4 },
};

// Giá vé xe buýt theo thời kỳ (đ/lượt/người), theo cự ly: [dưới 15km, 15–25km, trên 25km]
export const BUS_FARE_PERIODS = [
  { from: '2027-01-01', fares: [7000, 8000, 9000], note: 'Giá mới từ 01/01/2027 (giảm 1.000đ nếu không dùng tiền mặt)' },
  { from: '2026-07-01', fares: [0, 0, 0], note: 'Miễn phí 134 tuyến đến hết 31/12/2026' },
  { from: '2019-05-01', fares: [5000, 6000, 7000], note: 'Giá vé trợ giá' },
];
export const BUS_DISTANCE_BANDS_KM = [15, 25];

// Tuyến Metro số 1 Bến Thành – Suối Tiên (tuyến duy nhất đang chạy). km = lý trình tính từ ga Bến Thành.
export const METRO_LINE_1 = {
  name: 'Metro số 1 (Bến Thành – Suối Tiên)',
  fare: { min: 7000, max: 20000, flatUntilKm: 7, perKm: 1000, cashlessDiscount: 1000 },
  passes: { day: 40000, threeDays: 90000, month: 300000, monthStudent: 150000 },
  stations: [
    { name: 'Bến Thành', lat: 10.7719, lng: 106.6983, km: 0 },
    { name: 'Nhà hát Thành phố', lat: 10.7755, lng: 106.7019, km: 0.6 },
    { name: 'Ba Son', lat: 10.7813, lng: 106.7069, km: 2.3 },
    { name: 'Công viên Văn Thánh', lat: 10.7961, lng: 106.7155, km: 3.5 },
    { name: 'Tân Cảng', lat: 10.7985, lng: 106.7233, km: 4.4 },
    { name: 'Thảo Điền', lat: 10.8003, lng: 106.7338, km: 5.5 },
    { name: 'An Phú', lat: 10.8021, lng: 106.7422, km: 6.5 },
    { name: 'Rạch Chiếc', lat: 10.8085, lng: 106.7553, km: 8.2 },
    { name: 'Phước Long', lat: 10.8214, lng: 106.7582, km: 9.7 },
    { name: 'Bình Thái', lat: 10.8325, lng: 106.7638, km: 11.0 },
    { name: 'Thủ Đức', lat: 10.8463, lng: 106.7716, km: 12.8 },
    { name: 'Khu Công nghệ cao', lat: 10.859, lng: 106.7889, km: 15.2 },
    { name: 'Đại học Quốc gia', lat: 10.866, lng: 106.8011, km: 16.7 },
    { name: 'Bến xe Suối Tiên', lat: 10.8795, lng: 106.814, km: 19.7 },
  ],
};

export const WALK_MAX_LEG_KM = 1.2; // quá xa thì không gợi ý đi bộ nếu còn phương tiện khác
export const WALK_MAX_STATION_KM = 0.8; // đi bộ tới ga / trạm
export const MIN_METRO_RIDE_KM = 1; // ngắn hơn thì đi metro không có lợi
export const BUS_MIN_KM = 0.6;
// Quy đổi để so sánh phương án: 1 phút ≈ 1.000đ (nhanh hơn 10 phút đáng giá thêm 10.000đ).
export const VND_PER_MINUTE = 1000;

/**
 * Lựa chọn "Phương tiện" trên bộ lọc. `modes` = các phương tiện được phép kết hợp trong 1 chuyến.
 * `hidden: true` = không hiện trên giao diện nhưng vẫn hợp lệ cho lộ trình đã lưu:
 * 'bus' đã gộp vào "Công cộng"; 'metro_grab' giờ chọn qua "Tuỳ chỉnh" (Metro + Grab xe máy).
 */
export const VEHICLES = [
  { value: 'bike', label: 'Xe máy', emoji: '🛵', description: 'Xe máy cá nhân (xăng + gửi xe)', modes: ['bike'] },
  { value: 'car', label: 'Ô tô', emoji: '🚗', description: 'Ô tô cá nhân (xăng + gửi xe)', modes: ['car'] },
  { value: 'walk', label: 'Đi bộ', emoji: '🚶', description: 'Chỉ đi bộ', modes: ['walk'] },
  { value: 'public', label: 'Công cộng', emoji: '🚍', description: 'Xe buýt (đang miễn phí) + Metro + đi bộ', modes: ['walk', 'bus', 'metro'] },
  { value: 'metro_grab', label: 'Metro + Grab', emoji: '🚇', description: 'Metro khi tiện, còn lại gọi Grab xe máy', modes: ['walk', 'metro', 'grab_bike'], hidden: true },
  { value: 'custom', label: 'Tuỳ chỉnh', emoji: '⚙️', description: 'Tự chọn các phương tiện muốn kết hợp', modes: null },
  { value: 'bus', label: 'Xe buýt', emoji: '🚌', description: 'Xe buýt + đi bộ', modes: ['walk', 'bus'], hidden: true },
];
export const VEHICLE_VALUES = VEHICLES.map((vehicle) => vehicle.value);
export const DEFAULT_VEHICLE = 'bike';
export const CUSTOM_VEHICLE = 'custom';

// Phương tiện được chọn trong chế độ "Tuỳ chỉnh" (đi bộ luôn được phép cho đoạn ngắn).
export const CUSTOM_MODE_VALUES = ['bus', 'metro', 'grab_bike', 'grab_car'];
export const DEFAULT_CUSTOM_MODES = ['bus', 'metro', 'grab_bike'];
