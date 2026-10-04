// Dữ liệu mẫu: 44 địa điểm vui chơi tại TP.HCM. Toạ độ [kinh độ, vĩ độ]. Giá: đ / người.
// Toạ độ lấy từ OpenStreetMap / Overture Maps (khớp tên + số nhà, 03/10/2026) — trước đó nhập tay, lệch 150–450 m.
// Cột: [tên, địa chỉ, quận, loại, lng, lat, rating, lượt đánh giá, giá min, giá max, giờ mở, giờ đóng, phút ở lại, hot, tags, đặc sản, image_url]
// Giờ mở = null nghĩa là mở cả ngày.
const ROWS = [
  // ── Ăn uống ──
  [
    'Phở Hòa Pasteur', '260C Pasteur, Phường 8', 'Quận 3', 'food', 106.689046, 10.786801, 4.6, 2345, 60000, 120000, '05:30', '23:00', 45, true, ['dac-san', 'gia-dinh', 'may-lanh'], ['Phở bò tái nạm', 'Quẩy giòn'],
    '/places/pho-hoa-pasteur.jpg',
  ],
  [
    'Bánh mì Huỳnh Hoa', '26 Lê Thị Riêng, Phường Bến Thành', 'Quận 1', 'food', 106.692371, 10.771469, 4.5, 5120, 55000, 80000, '14:30', '23:00', 20, true, ['dac-san', 'binh-dan', 'mot-minh'], ['Bánh mì thập cẩm'],
    '/places/banh-mi-huynh-hoa.jpg',
  ],
  [
    'Cơm tấm Ba Ghiền', '84 Đặng Văn Ngữ, Phường 10', 'Phú Nhuận', 'food', 106.669367, 10.794445, 4.4, 1890, 50000, 90000, '07:00', '21:00', 45, false, ['dac-san', 'binh-dan', 'nhom-ban'], ['Cơm tấm sườn bì chả'],
    '/places/com-tam-ba-ghien.jpg',
  ],
  [
    'Bún bò Huế Đông Ba', '110A Nguyễn Du, Phường Bến Thành', 'Quận 1', 'food', 106.695404, 10.774347, 4.3, 870, 45000, 75000, '06:00', '22:00', 40, false, ['dac-san', 'binh-dan'], ['Bún bò giò heo'],
    '/places/bun-bo-hue-dong-ba.jpg',
  ],
  [
    'Ốc Đào', '212B Nguyễn Trãi, Phường Nguyễn Cư Trinh', 'Quận 1', 'food', 106.684655, 10.765214, 4.4, 3100, 100000, 250000, '10:00', '22:00', 75, false, ['nhom-ban', 've-dem', 'dac-san'], ['Ốc hương rang muối', 'Sò điệp nướng'],
    '/places/oc-dao.jpg',
  ],
  [
    'Phố ẩm thực Vĩnh Khánh', 'Đường Vĩnh Khánh, Phường 8', 'Quận 4', 'food', 106.70537, 10.7612, 4.3, 4200, 80000, 200000, '16:00', '01:00', 90, true, ['nhom-ban', 've-dem', 'binh-dan', 'ngoai-troi'], ['Ốc', 'Hải sản nướng'],
    '/places/pho-am-thuc-vinh-khanh.jpg',
  ],
  [
    "Pizza 4P's Lê Thánh Tôn", '8/15 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'food', 106.705108, 10.781847, 4.7, 6800, 200000, 450000, '10:00', '23:00', 90, true, ['hen-ho', 'sang-trong', 'may-lanh', 'gia-dinh'], ['Pizza burrata', 'Mì cua'],
    '/places/pizza-4ps.jpg',
  ],
  [
    'Quán Bụi Garden', '55A Ngô Quang Huy, Thảo Điền', 'Thủ Đức', 'food', 106.735802, 10.805054, 4.5, 2100, 150000, 350000, '08:00', '23:00', 90, false, ['gia-dinh', 'hen-ho', 'dac-san', 'may-lanh'], ['Món Việt gia đình'],
    '/places/quan-bui-garden.jpg',
  ],
  [
    'Hủ tiếu Nam Vang Thành Đạt', '34 Cô Bắc, Phường Cầu Ông Lãnh', 'Quận 1', 'food', 106.695613, 10.765472, 4.2, 1500, 50000, 90000, null, null, 40, false, ['dac-san', 'binh-dan', 've-dem'], ['Hủ tiếu Nam Vang'],
    '/places/hu-tieu-nam-vang.jpg',
  ],
  [
    'Lẩu dê Trương Định', '105 Trương Định, Phường 6', 'Quận 3', 'food', 106.689169, 10.778136, 4.3, 980, 150000, 300000, '15:00', '23:00', 90, false, ['nhom-ban', 've-dem'], ['Lẩu dê', 'Dê nướng'],
    '/places/lau-de-truong-dinh.jpg',
  ],
  [
    'Bánh xèo 46A', '46A Đinh Công Tráng, Phường Tân Định', 'Quận 1', 'food', 106.691299, 10.789605, 4.3, 2700, 90000, 180000, '10:00', '21:00', 60, false, ['dac-san', 'gia-dinh', 'nhom-ban'], ['Bánh xèo', 'Chả giò'],
    '/places/banh-xeo-46a.jpg',
  ],
  [
    'Chợ đêm Hồ Thị Kỷ', 'Hẻm 57 Hồ Thị Kỷ, Phường 1', 'Quận 10', 'food', 106.676435, 10.765101, 4.3, 6100, 30000, 120000, '16:00', '23:30', 75, true, ['ve-dem', 'binh-dan', 'nhom-ban', 'ngoai-troi', 'dac-san'], ['Ăn vặt', 'Món Campuchia'],
    '/places/cho-dem-ho-thi-ky.jpg',
  ],
  // ── Cà phê ──
  [
    'The Workshop Coffee', '27 Ngô Đức Kế, Phường Bến Nghé', 'Quận 1', 'cafe', 106.705539, 10.773406, 4.6, 3210, 60000, 120000, '08:00', '21:00', 75, true, ['yen-tinh', 'mot-minh', 'may-lanh', 'hen-ho'], ['Pour over', 'Cold brew'],
    '/places/the-workshop-coffee.jpg',
  ],
  [
    'Cộng Cà Phê Lý Tự Trọng', '26 Lý Tự Trọng, Phường Bến Nghé', 'Quận 1', 'cafe', 106.701026, 10.778168, 4.5, 2760, 40000, 80000, '07:00', '23:00', 60, true, ['song-ao', 'nhom-ban', 'may-lanh'], ['Cà phê cốt dừa'],
    '/places/cong-ca-phe.jpg',
  ],
  [
    'Cà phê Chung cư 42 Nguyễn Huệ', '42 Nguyễn Huệ, Phường Bến Nghé', 'Quận 1', 'cafe', 106.70404, 10.77411, 4.4, 4105, 50000, 100000, '08:00', '23:00', 60, false, ['song-ao', 'hen-ho', 'nhom-ban'], ['View phố đi bộ'],
    '/places/chung-cu-42-nguyen-hue.jpg',
  ],
  [
    'Okkio Caffe Bến Thành', '120 Lê Lợi, Phường Bến Thành', 'Quận 1', 'cafe', 106.698948, 10.772524, 4.5, 1200, 60000, 110000, '07:30', '22:00', 60, false, ['yen-tinh', 'mot-minh', 'may-lanh'], ['Espresso', 'Bánh ngọt'],
    '/places/okkio-caffe.jpg',
  ],
  [
    'Cà phê Vợt Phan Đình Phùng', '330/2 Phan Đình Phùng, Phường 1', 'Phú Nhuận', 'cafe', 106.680848, 10.798524, 4.5, 3900, 15000, 30000, null, null, 30, true, ['binh-dan', 've-dem', 'dac-san', 'ngoai-troi'], ['Cà phê vợt truyền thống'],
    '/places/ca-phe-vot.jpg',
  ],
  [
    'Bâng Khuâng Café', '9 Thái Văn Lung, Phường Bến Nghé', 'Quận 1', 'cafe', 106.705101, 10.778733, 4.4, 1800, 50000, 95000, '07:30', '22:30', 60, false, ['hen-ho', 'yen-tinh', 'song-ao'], ['Trà trái cây'],
    '/places/bang-khuang-cafe.jpg',
  ],
  [
    'Oromia Coffee & Lounge', '193A/D3 Nam Kỳ Khởi Nghĩa, Phường 7', 'Quận 3', 'cafe', 106.686816, 10.786176, 4.4, 5200, 70000, 150000, '07:00', '22:30', 75, false, ['hen-ho', 'song-ao', 'ngoai-troi', 'sang-trong'], ['Không gian sân vườn'],
    '/places/oromia-coffee.jpg',
  ],
  [
    'Là Việt Coffee', '193 Hai Bà Trưng, Phường 6', 'Quận 3', 'cafe', 106.693611, 10.785794, 4.5, 2300, 45000, 85000, '07:00', '22:00', 60, false, ['yen-tinh', 'mot-minh', 'may-lanh'], ['Cà phê Đà Lạt'],
    '/places/la-viet-coffee.jpg',
  ],
  // ── Tham quan ──
  [
    'Dinh Độc Lập', '135 Nam Kỳ Khởi Nghĩa, Phường Bến Thành', 'Quận 1', 'attraction', 106.695403, 10.777017, 4.7, 18400, 40000, 65000, '08:00', '16:30', 90, true, ['gia-dinh', 'nhom-ban', 'ngoai-troi'], ['Di tích lịch sử'],
    '/places/dinh-doc-lap.jpg',
  ],
  [
    'Nhà thờ Đức Bà', '01 Công xã Paris, Phường Bến Nghé', 'Quận 1', 'attraction', 106.699058, 10.779771, 4.7, 21500, 0, 0, null, null, 30, false, ['song-ao', 'ngoai-troi', 'hen-ho'], ['Kiến trúc Pháp'],
    '/places/nha-tho-duc-ba.jpg',
  ],
  [
    'Bưu điện Trung tâm Sài Gòn', '02 Công xã Paris, Phường Bến Nghé', 'Quận 1', 'attraction', 106.700021, 10.779981, 4.6, 16300, 0, 0, '07:00', '19:00', 30, false, ['song-ao', 'gia-dinh', 'may-lanh'], ['Kiến trúc Pháp'],
    '/places/buu-dien-trung-tam.jpg',
  ],
  [
    'Bitexco Saigon Skydeck', '36 Hồ Tùng Mậu, Phường Bến Nghé', 'Quận 1', 'attraction', 106.704528, 10.771718, 4.4, 7900, 200000, 260000, '09:30', '21:30', 60, false, ['hen-ho', 'song-ao', 'may-lanh', 'sang-trong'], ['Ngắm thành phố từ tầng 49'],
    '/places/bitexco.jpg',
  ],
  [
    'Bảo tàng Chứng tích Chiến tranh', '28 Võ Văn Tần, Phường Võ Thị Sáu', 'Quận 3', 'attraction', 106.692192, 10.779379, 4.6, 14200, 40000, 40000, '07:30', '17:30', 90, false, ['gia-dinh', 'mot-minh', 'may-lanh'], ['Triển lãm lịch sử'],
    '/places/bao-tang-chung-tich-chien-tranh.jpg',
  ],
  [
    'Chùa Ngọc Hoàng', '73 Mai Thị Lựu, Phường Đa Kao', 'Quận 1', 'attraction', 106.69803, 10.791897, 4.5, 5100, 0, 0, '07:00', '18:00', 40, false, ['yen-tinh', 'mot-minh'], ['Chùa cổ hơn 100 năm'],
    '/places/chua-ngoc-hoang.jpg',
  ],
  [
    'Bảo tàng Mỹ thuật TP.HCM', '97A Phó Đức Chính, Phường Nguyễn Thái Bình', 'Quận 1', 'attraction', 106.699247, 10.769646, 4.4, 3800, 30000, 30000, '08:00', '17:00', 75, false, ['song-ao', 'yen-tinh', 'hen-ho', 'may-lanh'], ['Kiến trúc Đông Dương'],
    '/places/bao-tang-my-thuat.jpg',
  ],
  [
    'Landmark 81 SkyView', '720A Điện Biên Phủ, Phường 22', 'Bình Thạnh', 'attraction', 106.721865, 10.794953, 4.5, 9200, 300000, 420000, '10:00', '22:00', 75, true, ['hen-ho', 'song-ao', 'sang-trong', 'may-lanh'], ['Đài quan sát cao nhất Việt Nam'],
    '/places/landmark-81.jpg',
  ],
  [
    'Chùa Bà Thiên Hậu', '710 Nguyễn Trãi, Phường 11', 'Quận 5', 'attraction', 106.66119, 10.75309, 4.5, 4300, 0, 0, '06:30', '16:30', 40, false, ['song-ao', 'yen-tinh', 'gia-dinh'], ['Chợ Lớn', 'Kiến trúc người Hoa'],
    '/places/chua-ba-thien-hau.jpg',
  ],
  // ── Giải trí ──
  [
    'Nhà hát Thành phố', '07 Công trường Lam Sơn, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.703219, 10.776711, 4.7, 6400, 300000, 700000, '18:00', '22:00', 120, true, ['hen-ho', 'sang-trong', 'may-lanh'], ['À Ố Show'],
    '/places/nha-hat-thanh-pho.jpg',
  ],
  [
    'Phố đi bộ Nguyễn Huệ', 'Đường Nguyễn Huệ, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.701739, 10.775871, 4.6, 25300, 0, 0, null, null, 60, true, ['nhom-ban', 've-dem', 'ngoai-troi', 'song-ao', 'hen-ho'], ['Nhạc nước', 'Biểu diễn đường phố'],
    '/places/pho-di-bo-nguyen-hue.jpg',
  ],
  [
    'Phố đi bộ Bùi Viện', 'Đường Bùi Viện, Phường Phạm Ngũ Lão', 'Quận 1', 'entertainment', 106.692651, 10.766847, 4.2, 19800, 80000, 300000, '18:00', '03:00', 120, false, ['nhom-ban', 've-dem', 'ngoai-troi'], ['Phố Tây', 'Nhạc sống'],
    '/places/pho-di-bo-bui-vien.jpg',
  ],
  [
    'CGV Vincom Đồng Khởi', '72 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.702048, 10.77793, 4.4, 5600, 90000, 180000, '09:00', '23:30', 150, false, ['hen-ho', 'nhom-ban', 'may-lanh', 'gia-dinh'], ['Rạp chiếu phim'],
    '/places/cgv-vincom.jpg',
  ],
  [
    'Công viên Tao Đàn', 'Đường Trương Định, Phường Bến Thành', 'Quận 1', 'park', 106.693086, 10.774789, 4.4, 8700, 0, 0, '05:00', '22:00', 45, false, ['ngoai-troi', 'yen-tinh', 'gia-dinh', 'mot-minh'], ['Cây xanh', 'Đi dạo'],
    '/places/cong-vien-tao-dan.jpg',
  ],
  [
    'Thảo Cầm Viên Sài Gòn', '2 Nguyễn Bỉnh Khiêm, Phường Bến Nghé', 'Quận 1', 'park', 106.706457, 10.787808, 4.3, 15600, 60000, 60000, '07:00', '18:30', 150, false, ['gia-dinh', 'ngoai-troi', 'nhom-ban'], ['Vườn thú', 'Vườn bách thảo'],
    '/places/thao-cam-vien.jpg',
  ],
  [
    'Saigon Outcast', '188/1 Nguyễn Văn Hưởng, Thảo Điền', 'Thủ Đức', 'entertainment', 106.729829, 10.816942, 4.4, 1900, 80000, 200000, '15:00', '23:00', 120, false, ['nhom-ban', 'ngoai-troi', 've-dem'], ['Leo núi nhân tạo', 'Chợ phiên'],
    '/places/saigon-outcast.jpg',
  ],
  [
    'Công viên văn hoá Đầm Sen', '3 Hoà Bình, Phường 3', 'Quận 11', 'park', 106.638642, 10.765897, 4.3, 22000, 150000, 280000, '08:00', '18:00', 240, false, ['gia-dinh', 'nhom-ban', 'ngoai-troi'], ['Trò chơi cảm giác mạnh'],
    '/places/cong-vien-dam-sen.jpg',
  ],
  // ── Mua sắm ──
  [
    'Chợ Bến Thành', 'Đường Lê Lợi, Phường Bến Thành', 'Quận 1', 'shopping', 106.698017, 10.772571, 4.3, 30100, 50000, 300000, '06:00', '18:00', 60, true, ['dac-san', 'song-ao', 'nhom-ban'], ['Quà lưu niệm', 'Đặc sản'],
    '/places/cho-ben-thanh.jpg',
  ],
  [
    'Saigon Centre', '65 Lê Lợi, Phường Bến Nghé', 'Quận 1', 'shopping', 106.701059, 10.773104, 4.5, 9800, 100000, 1000000, '09:30', '22:00', 90, false, ['may-lanh', 'sang-trong', 'gia-dinh'], ['Takashimaya'],
    '/places/saigon-centre.jpg',
  ],
  [
    'Vincom Center Đồng Khởi', '72 Lê Thánh Tôn, Phường Bến Nghé', 'Quận 1', 'shopping', 106.70192, 10.778359, 4.5, 11000, 100000, 800000, '09:30', '22:00', 90, false, ['may-lanh', 'gia-dinh', 'hen-ho'], ['Thời trang'],
    '/places/vincom-dong-khoi.jpg',
  ],
  [
    'Crescent Mall', '101 Tôn Dật Tiên, Phường Tân Phú', 'Quận 7', 'shopping', 106.718688, 10.728987, 4.5, 12400, 100000, 600000, '09:30', '22:00', 120, false, ['may-lanh', 'gia-dinh', 'hen-ho'], ['Hồ Bán Nguyệt gần bên'],
    '/places/crescent-mall.jpg',
  ],
  [
    'Chợ An Đông', '34-36 An Dương Vương, Phường 9', 'Quận 5', 'shopping', 106.672245, 10.758137, 4.2, 5400, 50000, 400000, '06:00', '18:00', 60, false, ['binh-dan', 'dac-san'], ['Vải vóc', 'Khô, mắm'],
    '/places/cho-an-dong.jpg',
  ],
  [
    'Đường sách Nguyễn Văn Bình', 'Đường Nguyễn Văn Bình, Phường Bến Nghé', 'Quận 1', 'shopping', 106.699404, 10.780249, 4.6, 7400, 0, 150000, '08:00', '22:00', 45, false, ['yen-tinh', 'mot-minh', 'song-ao', 'ngoai-troi', 'hen-ho'], ['Sách', 'Cà phê sách'],
    '/places/duong-sach-nguyen-van-binh.jpg',
  ],
  [
    'Chợ Tân Định', '48 Mã Lộ, Phường Tân Định', 'Quận 1', 'shopping', 106.690051, 10.7899, 4.3, 3600, 40000, 250000, '06:00', '18:00', 50, false, ['dac-san', 'binh-dan', 'song-ao'], ['Vải', 'Ăn vặt'],
    '/places/cho-tan-dinh.jpg',
  ],
];

export const SEED_PLACES = ROWS.map(
  ([name, address, district, category, lng, lat, rating, reviewCount, min, max, open, close, visitMinutes, trending, tags, specialties, imageUrl]) => ({
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
    image_url: imageUrl || null,
  }),
);
