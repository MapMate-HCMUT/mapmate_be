// Dữ liệu mẫu: 44 địa điểm vui chơi tại TP.HCM. Toạ độ [kinh độ, vĩ độ]. Giá: đ / người.
// Cột: [tên, địa chỉ, quận, loại, lng, lat, rating, lượt đánh giá, giá min, giá max, giờ mở, giờ đóng, phút ở lại, hot, tags, đặc sản]
// Giờ mở = null nghĩa là mở cả ngày.
const ROWS = [
  // ── Ăn uống ──
  ['Phở Hòa Pasteur', '260C Pasteur, Phường 8', 'Quận 3', 'food', 106.6893, 10.7869, 4.6, 2345, 60000, 120000, '05:30', '23:00', 45, true, ['dac-san', 'gia-dinh', 'may-lanh'], ['Phở bò tái nạm', 'Quẩy giòn']],
  ['Bánh mì Huỳnh Hoa', '26 Lê Thị Riêng, Phường Bến Thành', 'Quận 1', 'food', 106.6927, 10.7713, 4.5, 5120, 55000, 80000, '14:30', '23:00', 20, true, ['dac-san', 'binh-dan', 'mot-minh'], ['Bánh mì thập cẩm']],
  ['Cơm tấm Ba Ghiền', '84 Đặng Văn Ngữ, Phường 10', 'Phú Nhuận', 'food', 106.6731, 10.7959, 4.4, 1890, 50000, 90000, '07:00', '21:00', 45, false, ['dac-san', 'binh-dan', 'nhom-ban'], ['Cơm tấm sườn bì chả']],
  ['Bún bò Huế Đông Ba', '110A Nguyễn Du, Phường Bến Thành', 'Quận 1', 'food', 106.6968, 10.7745, 4.3, 870, 45000, 75000, '06:00', '22:00', 40, false, ['dac-san', 'binh-dan'], ['Bún bò giò heo']],
  ['Ốc Đào', '212B Nguyễn Trãi, Phường Nguyễn Cư Trinh', 'Quận 1', 'food', 106.6877, 10.7652, 4.4, 3100, 100000, 250000, '10:00', '22:00', 75, false, ['nhom-ban', 've-dem', 'dac-san'], ['Ốc hương rang muối', 'Sò điệp nướng']],
  ['Phố ẩm thực Vĩnh Khánh', 'Đường Vĩnh Khánh, Phường 8', 'Quận 4', 'food', 106.7036, 10.7600, 4.3, 4200, 80000, 200000, '16:00', '01:00', 90, true, ['nhom-ban', 've-dem', 'binh-dan', 'ngoai-troi'], ['Ốc', 'Hải sản nướng']],
  ["Pizza 4P's Lê Thánh Tôn", '8/15 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'food', 106.7050, 10.7812, 4.7, 6800, 200000, 450000, '10:00', '23:00', 90, true, ['hen-ho', 'sang-trong', 'may-lanh', 'gia-dinh'], ['Pizza burrata', 'Mì cua']],
  ['Quán Bụi Garden', '55A Ngô Quang Huy, Thảo Điền', 'Thủ Đức', 'food', 106.7333, 10.8033, 4.5, 2100, 150000, 350000, '08:00', '23:00', 90, false, ['gia-dinh', 'hen-ho', 'dac-san', 'may-lanh'], ['Món Việt gia đình']],
  ['Hủ tiếu Nam Vang Thành Đạt', '34 Cô Bắc, Phường Cầu Ông Lãnh', 'Quận 1', 'food', 106.6937, 10.7642, 4.2, 1500, 50000, 90000, null, null, 40, false, ['dac-san', 'binh-dan', 've-dem'], ['Hủ tiếu Nam Vang']],
  ['Lẩu dê Trương Định', '105 Trương Định, Phường 6', 'Quận 3', 'food', 106.6859, 10.7790, 4.3, 980, 150000, 300000, '15:00', '23:00', 90, false, ['nhom-ban', 've-dem'], ['Lẩu dê', 'Dê nướng']],
  ['Bánh xèo 46A', '46A Đinh Công Tráng, Phường Tân Định', 'Quận 1', 'food', 106.6904, 10.7907, 4.3, 2700, 90000, 180000, '10:00', '21:00', 60, false, ['dac-san', 'gia-dinh', 'nhom-ban'], ['Bánh xèo', 'Chả giò']],
  ['Chợ đêm Hồ Thị Kỷ', 'Hẻm 57 Hồ Thị Kỷ, Phường 1', 'Quận 10', 'food', 106.6757, 10.7655, 4.3, 6100, 30000, 120000, '16:00', '23:30', 75, true, ['ve-dem', 'binh-dan', 'nhom-ban', 'ngoai-troi', 'dac-san'], ['Ăn vặt', 'Món Campuchia']],
  // ── Cà phê ──
  ['The Workshop Coffee', '27 Ngô Đức Kế, Phường Bến Nghé', 'Quận 1', 'cafe', 106.7053, 10.7741, 4.6, 3210, 60000, 120000, '08:00', '21:00', 75, true, ['yen-tinh', 'mot-minh', 'may-lanh', 'hen-ho'], ['Pour over', 'Cold brew']],
  ['Cộng Cà Phê Lý Tự Trọng', '26 Lý Tự Trọng, Phường Bến Nghé', 'Quận 1', 'cafe', 106.7030, 10.7804, 4.5, 2760, 40000, 80000, '07:00', '23:00', 60, true, ['song-ao', 'nhom-ban', 'may-lanh'], ['Cà phê cốt dừa']],
  ['Cà phê Chung cư 42 Nguyễn Huệ', '42 Nguyễn Huệ, Phường Bến Nghé', 'Quận 1', 'cafe', 106.7046, 10.7738, 4.4, 4105, 50000, 100000, '08:00', '23:00', 60, false, ['song-ao', 'hen-ho', 'nhom-ban'], ['View phố đi bộ']],
  ['Okkio Caffe Bến Thành', '120 Lê Lợi, Phường Bến Thành', 'Quận 1', 'cafe', 106.6985, 10.7728, 4.5, 1200, 60000, 110000, '07:30', '22:00', 60, false, ['yen-tinh', 'mot-minh', 'may-lanh'], ['Espresso', 'Bánh ngọt']],
  ['Cà phê Vợt Phan Đình Phùng', '330/2 Phan Đình Phùng, Phường 1', 'Phú Nhuận', 'cafe', 106.6806, 10.7985, 4.5, 3900, 15000, 30000, null, null, 30, true, ['binh-dan', 've-dem', 'dac-san', 'ngoai-troi'], ['Cà phê vợt truyền thống']],
  ['Bâng Khuâng Café', '9 Thái Văn Lung, Phường Bến Nghé', 'Quận 1', 'cafe', 106.7054, 10.7797, 4.4, 1800, 50000, 95000, '07:30', '22:30', 60, false, ['hen-ho', 'yen-tinh', 'song-ao'], ['Trà trái cây']],
  ['Oromia Coffee & Lounge', '193A/D3 Nam Kỳ Khởi Nghĩa, Phường 7', 'Quận 3', 'cafe', 106.6905, 10.7858, 4.4, 5200, 70000, 150000, '07:00', '22:30', 75, false, ['hen-ho', 'song-ao', 'ngoai-troi', 'sang-trong'], ['Không gian sân vườn']],
  ['Là Việt Coffee', '193 Hai Bà Trưng, Phường 6', 'Quận 3', 'cafe', 106.6920, 10.7880, 4.5, 2300, 45000, 85000, '07:00', '22:00', 60, false, ['yen-tinh', 'mot-minh', 'may-lanh'], ['Cà phê Đà Lạt']],
  // ── Tham quan ──
  ['Dinh Độc Lập', '135 Nam Kỳ Khởi Nghĩa, Phường Bến Thành', 'Quận 1', 'attraction', 106.6953, 10.7770, 4.7, 18400, 40000, 65000, '08:00', '16:30', 90, true, ['gia-dinh', 'nhom-ban', 'ngoai-troi'], ['Di tích lịch sử']],
  ['Nhà thờ Đức Bà', '01 Công xã Paris, Phường Bến Nghé', 'Quận 1', 'attraction', 106.6990, 10.7798, 4.7, 21500, 0, 0, null, null, 30, false, ['song-ao', 'ngoai-troi', 'hen-ho'], ['Kiến trúc Pháp']],
  ['Bưu điện Trung tâm Sài Gòn', '02 Công xã Paris, Phường Bến Nghé', 'Quận 1', 'attraction', 106.7000, 10.7799, 4.6, 16300, 0, 0, '07:00', '19:00', 30, false, ['song-ao', 'gia-dinh', 'may-lanh'], ['Kiến trúc Pháp']],
  ['Bitexco Saigon Skydeck', '36 Hồ Tùng Mậu, Phường Bến Nghé', 'Quận 1', 'attraction', 106.7044, 10.7717, 4.4, 7900, 200000, 260000, '09:30', '21:30', 60, false, ['hen-ho', 'song-ao', 'may-lanh', 'sang-trong'], ['Ngắm thành phố từ tầng 49']],
  ['Bảo tàng Chứng tích Chiến tranh', '28 Võ Văn Tần, Phường Võ Thị Sáu', 'Quận 3', 'attraction', 106.6921, 10.7795, 4.6, 14200, 40000, 40000, '07:30', '17:30', 90, false, ['gia-dinh', 'mot-minh', 'may-lanh'], ['Triển lãm lịch sử']],
  ['Chùa Ngọc Hoàng', '73 Mai Thị Lựu, Phường Đa Kao', 'Quận 1', 'attraction', 106.6982, 10.7920, 4.5, 5100, 0, 0, '07:00', '18:00', 40, false, ['yen-tinh', 'mot-minh'], ['Chùa cổ hơn 100 năm']],
  ['Bảo tàng Mỹ thuật TP.HCM', '97A Phó Đức Chính, Phường Nguyễn Thái Bình', 'Quận 1', 'attraction', 106.6992, 10.7697, 4.4, 3800, 30000, 30000, '08:00', '17:00', 75, false, ['song-ao', 'yen-tinh', 'hen-ho', 'may-lanh'], ['Kiến trúc Đông Dương']],
  ['Landmark 81 SkyView', '720A Điện Biên Phủ, Phường 22', 'Bình Thạnh', 'attraction', 106.7220, 10.7950, 4.5, 9200, 300000, 420000, '10:00', '22:00', 75, true, ['hen-ho', 'song-ao', 'sang-trong', 'may-lanh'], ['Đài quan sát cao nhất Việt Nam']],
  ['Chùa Bà Thiên Hậu', '710 Nguyễn Trãi, Phường 11', 'Quận 5', 'attraction', 106.6612, 10.7528, 4.5, 4300, 0, 0, '06:30', '16:30', 40, false, ['song-ao', 'yen-tinh', 'gia-dinh'], ['Chợ Lớn', 'Kiến trúc người Hoa']],
  // ── Giải trí ──
  ['Nhà hát Thành phố', '07 Công trường Lam Sơn, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.7032, 10.7767, 4.7, 6400, 300000, 700000, '18:00', '22:00', 120, true, ['hen-ho', 'sang-trong', 'may-lanh'], ['À Ố Show']],
  ['Phố đi bộ Nguyễn Huệ', 'Đường Nguyễn Huệ, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.7034, 10.7752, 4.6, 25300, 0, 0, null, null, 60, true, ['nhom-ban', 've-dem', 'ngoai-troi', 'song-ao', 'hen-ho'], ['Nhạc nước', 'Biểu diễn đường phố']],
  ['Phố đi bộ Bùi Viện', 'Đường Bùi Viện, Phường Phạm Ngũ Lão', 'Quận 1', 'entertainment', 106.6928, 10.7675, 4.2, 19800, 80000, 300000, '18:00', '03:00', 120, false, ['nhom-ban', 've-dem', 'ngoai-troi'], ['Phố Tây', 'Nhạc sống']],
  ['CGV Vincom Đồng Khởi', '72 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.7020, 10.7781, 4.4, 5600, 90000, 180000, '09:00', '23:30', 150, false, ['hen-ho', 'nhom-ban', 'may-lanh', 'gia-dinh'], ['Rạp chiếu phim']],
  ['Công viên Tao Đàn', 'Đường Trương Định, Phường Bến Thành', 'Quận 1', 'entertainment', 106.6925, 10.7745, 4.4, 8700, 0, 0, '05:00', '22:00', 45, false, ['ngoai-troi', 'yen-tinh', 'gia-dinh', 'mot-minh'], ['Cây xanh', 'Đi dạo']],
  ['Thảo Cầm Viên Sài Gòn', '2 Nguyễn Bỉnh Khiêm, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.7053, 10.7875, 4.3, 15600, 60000, 60000, '07:00', '18:30', 150, false, ['gia-dinh', 'ngoai-troi', 'nhom-ban'], ['Vườn thú', 'Vườn bách thảo']],
  ['Saigon Outcast', '188/1 Nguyễn Văn Hưởng, Thảo Điền', 'Thủ Đức', 'entertainment', 106.7380, 10.8120, 4.4, 1900, 80000, 200000, '15:00', '23:00', 120, false, ['nhom-ban', 'ngoai-troi', 've-dem'], ['Leo núi nhân tạo', 'Chợ phiên']],
  ['Công viên văn hoá Đầm Sen', '3 Hoà Bình, Phường 3', 'Quận 11', 'entertainment', 106.6360, 10.7670, 4.3, 22000, 150000, 280000, '08:00', '18:00', 240, false, ['gia-dinh', 'nhom-ban', 'ngoai-troi'], ['Trò chơi cảm giác mạnh']],
  // ── Mua sắm ──
  ['Chợ Bến Thành', 'Đường Lê Lợi, Phường Bến Thành', 'Quận 1', 'shopping', 106.6981, 10.7725, 4.3, 30100, 50000, 300000, '06:00', '18:00', 60, true, ['dac-san', 'song-ao', 'nhom-ban'], ['Quà lưu niệm', 'Đặc sản']],
  ['Saigon Centre', '65 Lê Lợi, Phường Bến Nghé', 'Quận 1', 'shopping', 106.7012, 10.7731, 4.5, 9800, 100000, 1000000, '09:30', '22:00', 90, false, ['may-lanh', 'sang-trong', 'gia-dinh'], ['Takashimaya']],
  ['Vincom Center Đồng Khởi', '72 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'shopping', 106.7022, 10.7783, 4.5, 11000, 100000, 800000, '09:30', '22:00', 90, false, ['may-lanh', 'gia-dinh', 'hen-ho'], ['Thời trang']],
  ['Crescent Mall', '101 Tôn Dật Tiên, Phường Tân Phú', 'Quận 7', 'shopping', 106.7187, 10.7290, 4.5, 12400, 100000, 600000, '09:30', '22:00', 120, false, ['may-lanh', 'gia-dinh', 'hen-ho'], ['Hồ Bán Nguyệt gần bên']],
  ['Chợ An Đông', '34-36 An Dương Vương, Phường 9', 'Quận 5', 'shopping', 106.6728, 10.7578, 4.2, 5400, 50000, 400000, '06:00', '18:00', 60, false, ['binh-dan', 'dac-san'], ['Vải vóc', 'Khô, mắm']],
  ['Đường sách Nguyễn Văn Bình', 'Đường Nguyễn Văn Bình, Phường Bến Nghé', 'Quận 1', 'shopping', 106.6996, 10.7806, 4.6, 7400, 0, 150000, '08:00', '22:00', 45, false, ['yen-tinh', 'mot-minh', 'song-ao', 'ngoai-troi', 'hen-ho'], ['Sách', 'Cà phê sách']],
  ['Chợ Tân Định', '48 Mã Lộ, Phường Tân Định', 'Quận 1', 'shopping', 106.6899, 10.7895, 4.3, 3600, 40000, 250000, '06:00', '18:00', 50, false, ['dac-san', 'binh-dan', 'song-ao'], ['Vải', 'Ăn vặt']],
];

export const SEED_PLACES = ROWS.map(
  ([name, address, district, category, lng, lat, rating, reviewCount, min, max, open, close, visitMinutes, trending, tags, specialties]) => ({
    name,
    address,
    district,
    category,
    location: { type: 'Point', coordinates: [lng, lat] },
    rating,
    review_count: reviewCount,
    price_range: { min, max },
    opening_hours: { open, close },
    avg_visit_minutes: visitMinutes,
    is_trending: trending,
    tags,
    specialties,
  }),
);
