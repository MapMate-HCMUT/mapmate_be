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
  // ── Giải Trí & Hoạt Động Trải Nghiệm Gen Z (Bắn Cung, Workshop, Bowling, Boardgame, Bida, Thể Thao...) ──
  [
    'CLB Bắn Cung Nhà Văn Hóa Thanh Niên', '35 Nguyễn Thị Minh Khai, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.699512, 10.781845, 4.6, 1450, 70000, 150000, '08:00', '21:00', 60, true, ['nhom-ban', 'song-ao', 'ngoai-troi'], ['Bắn cung truyền thống', 'Huấn luyện viên hướng dẫn'],
    'https://images.unsplash.com/photo-1511067007772-9da28c5accf0?w=600&auto=format&fit=crop',
  ],
  [
    'Archery Tag Vietnam - Bắn Cung Đối Kháng', '1017 Bình Quới, Phường 28', 'Bình Thạnh', 'entertainment', 106.745620, 10.828510, 4.7, 880, 120000, 220000, '09:00', '20:00', 90, true, ['nhom-ban', 'ngoai-troi'], ['Bắn cung đối kháng', 'Trò chơi đồng đội'],
    'https://images.unsplash.com/photo-1544919982-b61976f0ba43?w=600&auto=format&fit=crop',
  ],
  [
    'CLB Bắn Cung Tinh Võ', '01 Lão Tử, Phường 11', 'Quận 5', 'entertainment', 106.657820, 10.751630, 4.5, 620, 60000, 130000, '08:30', '20:30', 60, false, ['nhom-ban', 'binh-dan'], ['Bắn cung bia', 'Cho thuê dụng cụ'],
    'https://images.unsplash.com/photo-1511067007772-9da28c5accf0?w=600&auto=format&fit=crop',
  ],
  [
    'Thủy Cung Đầm Sen', '03 Hòa Bình, Phường 3', 'Quận 11', 'park', 106.640150, 10.767210, 4.4, 3400, 70000, 120000, '08:30', '17:30', 75, false, ['gia-dinh', 'song-ao', 'may-lanh'], ['Hầm thủy cung', 'Cá mập & sinh vật biển'],
    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&auto=format&fit=crop',
  ],
  [
    'Bảo Tàng Tranh 3D Artinus', '02-04 Đường số 9, KDC Him Lam, Phường Tân Hưng', 'Quận 7', 'attraction', 106.697520, 10.743140, 4.5, 4100, 150000, 250000, '09:00', '18:00', 90, true, ['song-ao', 'nhom-ban', 'may-lanh', 'gia-dinh'], ['Tranh đánh lừa thị giác', 'Không gian check-in'],
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop',
  ],
  [
    'Triển Lãm Nghệ Thuật Đa Giác Quan Van Gogh - Gigamall', '240-242 Phạm Văn Đồng, Hiệp Bình Chánh', 'Thủ Đức', 'attraction', 106.726540, 10.828230, 4.7, 5300, 250000, 400000, '09:30', '22:00', 90, true, ['song-ao', 'hen-ho', 'may-lanh', 'sang-trong'], ['Trình chiếu tương tác 360 độ', 'Không gian hoa hướng dương'],
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=600&auto=format&fit=crop',
  ],
  [
    'Lạc Concept - Workshop Tufting & Làm Gấu Bông', '236/1/7 Nguyễn Thái Bình, Phường 12', 'Tân Bình', 'entertainment', 106.651520, 10.793810, 4.8, 920, 150000, 450000, '09:00', '21:30', 120, true, ['hen-ho', 'song-ao', 'nhom-ban', 'may-lanh'], ['Bắn len Tufting', 'Custom gấu Bearbrick', 'Tô tượng & làm vòng tay'],
    'https://images.unsplash.com/photo-1582562124811-c09040d0a901?w=600&auto=format&fit=crop',
  ],
  [
    'Gốm Sài Gòn Workshop', '26 Lý Tự Trọng, Phường Bến Nghé', 'Quận 1', 'entertainment', 106.701140, 10.778210, 4.7, 1150, 180000, 380000, '09:00', '21:00', 90, true, ['hen-ho', 'yen-tinh', 'song-ao', 'may-lanh'], ['Tự tay xoay gốm bàn xoay', 'Tô màu men gốm'],
    'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&auto=format&fit=crop',
  ],
  [
    'Tipsy Art - Vẽ Tranh Thư Giãn & Rượu Vang', '6B Nguyễn Cảnh Chân, Phường Cầu Kho', 'Quận 1', 'entertainment', 106.689210, 10.758920, 4.8, 1600, 350000, 450000, '14:00', '21:30', 150, false, ['hen-ho', 'sang-trong', 'may-lanh', 'mot-minh'], ['Vẽ tranh Acrylic', 'Thưởng thức rượu vang'],
    'https://images.unsplash.com/photo-1460661419200-fd435f3032b4?w=600&auto=format&fit=crop',
  ],
  [
    'Heny Garden - Workshop Làm Nến Thơm & Nước Hoa', '370/24 Hòa Hảo, Phường 5', 'Quận 10', 'entertainment', 106.666240, 10.762130, 4.8, 840, 150000, 350000, '09:30', '20:30', 90, false, ['hen-ho', 'yen-tinh', 'may-lanh'], ['Tự phối mùi hương nến thơm', 'Pha chế nước hoa cá nhân'],
    'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&auto=format&fit=crop',
  ],
  [
    'Haru Craft Studio - Gốm Thủ Công Hàn Quốc', 'Khu Panorama, Đường Tôn Dật Tiên', 'Quận 7', 'entertainment', 106.712310, 10.724520, 4.7, 730, 200000, 400000, '09:30', '19:30', 120, false, ['hen-ho', 'song-ao', 'yen-tinh', 'may-lanh'], ['Nặn gốm phong cách Hàn', 'Tạo hình cốc chén gốm'],
    'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600&auto=format&fit=crop',
  ],
  [
    'Dream Games Bowling Vạn Hạnh Mall', '11 Sư Vạn Hạnh, Phường 12', 'Quận 10', 'entertainment', 106.669810, 10.770540, 4.6, 2850, 80000, 180000, '09:30', '22:30', 90, true, ['nhom-ban', 'may-lanh', 'song-ao'], ['Đường lane bowling chuẩn quốc tế', 'Ánh sáng neon bowling'],
    'https://images.unsplash.com/photo-1538388177566-7320c5c610b4?w=600&auto=format&fit=crop',
  ],
  [
    'PowerBowl 388 Crescent Mall', '101 Tôn Dật Tiên, Phường Tân Phú', 'Quận 7', 'entertainment', 106.718710, 10.729010, 4.5, 1920, 70000, 160000, '10:00', '22:00', 90, false, ['nhom-ban', 'gia-dinh', 'may-lanh'], ['Bowling chuẩn 10 pin', 'Khu máy gắp thú'],
    'https://images.unsplash.com/photo-1538388177566-7320c5c610b4?w=600&auto=format&fit=crop',
  ],
  [
    'Megabowl The Garden Mall', '190 Hồng Bàng, Phường 12', 'Quận 5', 'entertainment', 106.660120, 10.753820, 4.4, 1340, 60000, 140000, '09:30', '22:00', 75, false, ['nhom-ban', 'binh-dan', 'may-lanh'], ['Bowling giá học sinh sinh viên', 'Khu game thùng'],
    'https://images.unsplash.com/photo-1538388177566-7320c5c610b4?w=600&auto=format&fit=crop',
  ],
  [
    'Cafe Cinema HD 3D Sư Vạn Hạnh', '646G Sư Vạn Hạnh, Phường 12', 'Quận 10', 'entertainment', 106.667520, 10.772840, 4.6, 1780, 60000, 150000, '08:30', '23:30', 120, true, ['hen-ho', 'may-lanh', 'nhom-ban'], ['Phòng chiếu riêng tư Netflix & HD', 'Bắp rang bơ & đồ uống'],
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop',
  ],
  [
    'Couple Cinema Nguyễn Trãi', '114 Nguyễn Trãi, Phường 3', 'Quận 5', 'entertainment', 106.681120, 10.761210, 4.5, 1260, 70000, 160000, '09:00', '23:00', 120, false, ['hen-ho', 'may-lanh'], ['Phòng chiếu cặp đôi riêng tư', 'Kho phim đa dạng'],
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600&auto=format&fit=crop',
  ],
  [
    'Kha Cinema Box Phan Văn Trị', '353/7A Phan Văn Trị, Phường 11', 'Bình Thạnh', 'entertainment', 106.693410, 10.812320, 4.5, 940, 50000, 120000, '08:30', '23:00', 120, false, ['hen-ho', 'nhom-ban', 'binh-dan', 'may-lanh'], ['Box phim riêng tư', 'Máy chiếu màn hình lớn'],
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop',
  ],
  [
    'The Guild Board Game Cafe', '140 Pasteur, Phường Bến Nghé', 'Quận 1', 'cafe', 106.698510, 10.778840, 4.7, 1820, 45000, 120000, '09:00', '23:00', 120, true, ['nhom-ban', 'may-lanh', 'mot-minh'], ['Hơn 300 tựa board game', 'Game Master hướng dẫn luật'],
    'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&auto=format&fit=crop',
  ],
  [
    'Board Game Station Huỳnh Tịnh Của', '30/1 Huỳnh Tịnh Của, Phường 8', 'Quận 3', 'cafe', 106.687230, 10.790120, 4.6, 1450, 40000, 100000, '08:30', '22:30', 120, false, ['nhom-ban', 'may-lanh', 'binh-dan'], ['Ma sói, Catan, Avalon', 'Không gian nhóm rộng rãi'],
    'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&auto=format&fit=crop',
  ],
  [
    'Cashflow Board Game Cafe', '7A/19 Thành Thái, Phường 14', 'Quận 10', 'cafe', 106.660520, 10.771240, 4.5, 1120, 40000, 95000, '09:00', '22:30', 120, false, ['nhom-ban', 'binh-dan', 'may-lanh'], ['Trò chơi tài chính Cashflow', 'Board game chiến thuật'],
    'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&auto=format&fit=crop',
  ],
  [
    'Lost Game - Escape Room Bùi Viện', '183 Bùi Viện, Phường Phạm Ngũ Lão', 'Quận 1', 'entertainment', 106.691240, 10.766120, 4.8, 2100, 180000, 290000, '09:30', '23:30', 75, true, ['nhom-ban', 'may-lanh', 've-dem'], ['Phòng giải đố kinh dị', 'Hiệu ứng âm thanh ánh sáng chân thực'],
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop',
  ],
  [
    'WeXcape Thoát Hiểm Thực Tế', '214/19 Nguyễn Văn Nguyễn, Phường Tân Định', 'Quận 1', 'entertainment', 106.692130, 10.793210, 4.7, 1380, 160000, 280000, '09:00', '23:00', 75, false, ['nhom-ban', 'may-lanh'], ['Chủ đề trinh thám & mật mã', 'Nhập vai giải đố'],
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop',
  ],
  [
    'Inside X Escape Room Cao Thắng', '24 Cao Thắng, Phường 5', 'Quận 3', 'entertainment', 106.683520, 10.771140, 4.6, 980, 150000, 260000, '09:30', '22:30', 75, false, ['nhom-ban', 'may-lanh'], ['Phòng giải đố cốt truyện phong phú', 'Không gian bí ẩn'],
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop',
  ],
  [
    'Timezone Estella Place', 'Tầng 4 Estella Place, 88 Song Hành, Phường An Phú', 'Thủ Đức', 'entertainment', 106.746820, 10.801640, 4.7, 3600, 100000, 300000, '09:30', '22:00', 90, true, ['nhom-ban', 'gia-dinh', 'may-lanh'], ['Game tương tác VR', 'Bắn súng & đua xe thế hệ mới', 'Đổi quà lưu niệm'],
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop',
  ],
  [
    'Timezone Thiso Mall Sala', 'Tầng 4 Thiso Mall, 10 Mai Chí Thọ, Phường Thủ Thiêm', 'Thủ Đức', 'entertainment', 106.721240, 10.773510, 4.7, 2900, 100000, 300000, '10:00', '22:00', 90, true, ['nhom-ban', 'gia-dinh', 'may-lanh', 'sang-trong'], ['Khu đua xe Drift mini', 'Trò chơi ném bóng rổ & đập búa'],
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop',
  ],
  [
    'Hero VR Game Hub Crescent Mall', 'Tầng 5 Crescent Mall, 101 Tôn Dật Tiên, Phường Tân Phú', 'Quận 7', 'entertainment', 106.718710, 10.729010, 4.6, 1750, 120000, 280000, '10:00', '22:00', 60, false, ['nhom-ban', 'may-lanh', 'song-ao'], ['Kính thực tế ảo VR không dây', 'Game nhập vai chiến đấu'],
    'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=600&auto=format&fit=crop',
  ],
  [
    'Kiss Billiards & Lounge Thảo Điền', '118 Nguyễn Văn Hưởng, Phường Thảo Điền', 'Thủ Đức', 'entertainment', 106.734520, 10.812240, 4.7, 1520, 90000, 220000, '09:00', '02:00', 120, true, ['nhom-ban', 've-dem', 'sang-trong', 'may-lanh'], ['Bàn bida chuẩn quốc tế Min & Hollywood', 'Lounge cocktail & đồ ăn nhẹ'],
    'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=600&auto=format&fit=crop',
  ],
  [
    'The One Billiards Club Nguyễn Thị Thập', '207 Nguyễn Thị Thập, Phường Tân Phú', 'Quận 7', 'entertainment', 106.719240, 10.738820, 4.6, 1890, 60000, 150000, null, null, 120, false, ['nhom-ban', 've-dem', 'may-lanh'], ['Mở 24/7', 'Bàn bida lỗ & bida carom cao cấp'],
    'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=600&auto=format&fit=crop',
  ],
  [
    'Hoàng Gia Billiards Club Phan Đăng Lưu', '127 Phan Đăng Lưu, Phường 7', 'Phú Nhuận', 'entertainment', 106.687410, 10.800520, 4.5, 1430, 55000, 130000, null, null, 120, false, ['nhom-ban', 'binh-dan', 've-dem', 'may-lanh'], ['Bida bida libre, 3 băng, pool', 'Không gian máy lạnh thông thoáng'],
    'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=600&auto=format&fit=crop',
  ],
  [
    'Master Billiards Club Tô Hiến Thành', '180 Tô Hiến Thành, Phường 15', 'Quận 10', 'entertainment', 106.664210, 10.776520, 4.5, 1670, 50000, 120000, '08:00', '02:00', 120, false, ['nhom-ban', 'binh-dan', 've-dem', 'may-lanh'], ['Bàn Aileex chất lượng cao', 'Nước uống giải khát'],
    'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=600&auto=format&fit=crop',
  ],
  [
    'D-Pickleball Club Sân Bay', '02 Hoàng Minh Giám, Phường 9', 'Phú Nhuận', 'entertainment', 106.674510, 10.809520, 4.7, 1210, 90000, 200000, '06:00', '23:00', 90, true, ['nhom-ban', 'ngoai-troi', 'song-ao'], ['Cụm sân Pickleball chuẩn thi đấu', 'Dịch vụ cho thuê vợt & bóng'],
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=600&auto=format&fit=crop',
  ],
  [
    'CLB Lan Anh Tennis & Pickleball', '291 Cách Mạng Tháng 8, Phường 12', 'Quận 10', 'entertainment', 106.678120, 10.777210, 4.6, 2450, 100000, 250000, '06:00', '22:30', 90, false, ['nhom-ban', 'ngoai-troi'], ['Sân tennis & pickleball cao cấp', 'Hồ bơi thư giãn'],
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=600&auto=format&fit=crop',
  ],
  [
    'Sân Cầu Lông Ga Trực Thăng', '46/24 Nguyễn Cửu Vân, Phường 17', 'Bình Thạnh', 'entertainment', 106.709520, 10.791530, 4.5, 1680, 60000, 140000, '06:00', '23:00', 90, false, ['nhom-ban', 'may-lanh'], ['Thảm sân cầu lông tiêu chuẩn BWF', 'Hệ thống đèn chống chói'],
    'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&auto=format&fit=crop',
  ],
  [
    'Sân Cầu Lông Kỳ Hòa', '796 Sư Vạn Hạnh, Phường 12', 'Quận 10', 'entertainment', 106.668540, 10.773210, 4.4, 1950, 55000, 130000, '05:30', '23:00', 90, false, ['nhom-ban'], ['Cụm 12 sân cầu lông thoáng mát', 'Khu căn tin giải khát'],
    'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&auto=format&fit=crop',
  ],
  [
    'Vincom Ice Rink Landmark 81 - Sân Trượt Băng', 'Tầng B1 Landmark 81, 720A Điện Biên Phủ', 'Bình Thạnh', 'entertainment', 106.721910, 10.794920, 4.6, 4300, 150000, 260000, '10:00', '22:00', 90, true, ['hen-ho', 'song-ao', 'may-lanh', 'gia-dinh'], ['Sân trượt băng tự nhiên lớn nhất', 'Cho thuê giày trượt & chim cánh cụt'],
    'https://images.unsplash.com/photo-1517178355260-8f9f30e8d975?w=600&auto=format&fit=crop',
  ],
  [
    'Jump Arena Trampoline Park Thảo Điền', '63 Xa lộ Hà Nội, Phường Thảo Điền', 'Thủ Đức', 'entertainment', 106.741210, 10.803520, 4.6, 3100, 120000, 250000, '09:00', '21:00', 90, true, ['nhom-ban', 'gia-dinh', 'may-lanh'], ['Bạt nhún liên hoàn Trampoline', 'Bóng rổ nhún bạt & hố xốp khổng lồ'],
    'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&auto=format&fit=crop',
  ],
  [
    'Push Climbing - Tường Leo Núi Thảo Điền', '188/1 Nguyễn Văn Hưởng, Phường Thảo Điền', 'Thủ Đức', 'entertainment', 106.729830, 10.816940, 4.6, 1820, 150000, 300000, '10:00', '22:00', 90, false, ['nhom-ban', 'ngoai-troi'], ['Tường leo núi nhân tạo nhiều cấp độ', 'Bouldering & Top-rope'],
    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=600&auto=format&fit=crop',
  ],
  [
    'Hachiko Coffee Cún Cưng', '14 Hoa Sữa, Phường 7', 'Phú Nhuận', 'cafe', 106.691240, 10.797820, 4.6, 2100, 50000, 95000, '09:00', '22:00', 75, true, ['song-ao', 'nhom-ban', 'may-lanh'], ['Chơi đùa với cún Corgi, Samoyed, Poodle', 'Đồ uống thơm ngon'],
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop',
  ],
  [
    'Katholic Cat Cafe', '93/11 Trần Khắc Chân, Phường Tân Định', 'Quận 1', 'cafe', 106.689510, 10.792340, 4.7, 2750, 60000, 110000, '09:00', '22:00', 75, true, ['hen-ho', 'yen-tinh', 'song-ao', 'may-lanh'], ['Cà phê mèo cứu hộ thân thiện', 'Không gian ấm cúng phong cách vintage'],
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop',
  ],
];

// Loại chi tiết (Place.kind) — cùng bộ giá trị với dữ liệu mở (scripts/openData/placeKinds.js), để suy ra vai trò điểm dừng.
const KIND_BY_NAME = {
  'Phở Hòa Pasteur': 'restaurant', 'Bánh mì Huỳnh Hoa': 'street_food', 'Cơm tấm Ba Ghiền': 'street_food', 'Bún bò Huế Đông Ba': 'restaurant',
  'Ốc Đào': 'street_food', 'Phố ẩm thực Vĩnh Khánh': 'food_street', "Pizza 4P's Lê Thánh Tôn": 'restaurant', 'Quán Bụi Garden': 'restaurant',
  'Hủ tiếu Nam Vang Thành Đạt': 'street_food', 'Lẩu dê Trương Định': 'restaurant', 'Bánh xèo 46A': 'street_food', 'Chợ đêm Hồ Thị Kỷ': 'food_street',
  'The Workshop Coffee': 'coffee', 'Cộng Cà Phê Lý Tự Trọng': 'coffee', 'Cà phê Chung cư 42 Nguyễn Huệ': 'coffee', 'Okkio Caffe Bến Thành': 'coffee',
  'Cà phê Vợt Phan Đình Phùng': 'coffee', 'Bâng Khuâng Café': 'coffee', 'Oromia Coffee & Lounge': 'coffee', 'Là Việt Coffee': 'coffee',
  'Dinh Độc Lập': 'museum', 'Nhà thờ Đức Bà': 'worship', 'Bưu điện Trung tâm Sài Gòn': 'landmark', 'Bitexco Saigon Skydeck': 'landmark',
  'Bảo tàng Chứng tích Chiến tranh': 'museum', 'Chùa Ngọc Hoàng': 'worship', 'Bảo tàng Mỹ thuật TP.HCM': 'museum', 'Landmark 81 SkyView': 'landmark',
  'Chùa Bà Thiên Hậu': 'worship', 'Nhà hát Thành phố': 'theatre', 'Phố đi bộ Nguyễn Huệ': 'walking_street', 'Phố đi bộ Bùi Viện': 'walking_street',
  'CGV Vincom Đồng Khởi': 'cinema', 'Công viên Tao Đàn': 'park', 'Thảo Cầm Viên Sài Gòn': 'zoo', 'Saigon Outcast': 'bar',
  'Công viên văn hoá Đầm Sen': 'theme_park', 'Chợ Bến Thành': 'market', 'Saigon Centre': 'mall', 'Vincom Center Đồng Khởi': 'mall',
  'Crescent Mall': 'mall', 'Chợ An Đông': 'market', 'Đường sách Nguyễn Văn Bình': 'bookstore', 'Chợ Tân Định': 'market',
  // Gen Z entertainment & activities
  'CLB Bắn Cung Nhà Văn Hóa Thanh Niên': 'games',
  'Archery Tag Vietnam - Bắn Cung Đối Kháng': 'games',
  'CLB Bắn Cung Tinh Võ': 'games',
  'Thủy Cung Đầm Sen': 'zoo',
  'Bảo Tàng Tranh 3D Artinus': 'gallery',
  'Triển Lãm Nghệ Thuật Đa Giác Quan Van Gogh - Gigamall': 'gallery',
  'Lạc Concept - Workshop Tufting & Làm Gấu Bông': 'games',
  'Gốm Sài Gòn Workshop': 'games',
  'Tipsy Art - Vẽ Tranh Thư Giãn & Rượu Vang': 'gallery',
  'Heny Garden - Workshop Làm Nến Thơm & Nước Hoa': 'games',
  'Haru Craft Studio - Gốm Thủ Công Hàn Quốc': 'games',
  'Dream Games Bowling Vạn Hạnh Mall': 'games',
  'PowerBowl 388 Crescent Mall': 'games',
  'Megabowl The Garden Mall': 'games',
  'Cafe Cinema HD 3D Sư Vạn Hạnh': 'cinema',
  'Couple Cinema Nguyễn Trãi': 'cinema',
  'Kha Cinema Box Phan Văn Trị': 'cinema',
  'The Guild Board Game Cafe': 'coffee',
  'Board Game Station Huỳnh Tịnh Của': 'coffee',
  'Cashflow Board Game Cafe': 'coffee',
  'Lost Game - Escape Room Bùi Viện': 'games',
  'WeXcape Thoát Hiểm Thực Tế': 'games',
  'Inside X Escape Room Cao Thắng': 'games',
  'Timezone Estella Place': 'games',
  'Timezone Thiso Mall Sala': 'games',
  'Hero VR Game Hub Crescent Mall': 'games',
  'Kiss Billiards & Lounge Thảo Điền': 'games',
  'The One Billiards Club Nguyễn Thị Thập': 'games',
  'Hoàng Gia Billiards Club Phan Đăng Lưu': 'games',
  'Master Billiards Club Tô Hiến Thành': 'games',
  'D-Pickleball Club Sân Bay': 'games',
  'CLB Lan Anh Tennis & Pickleball': 'games',
  'Sân Cầu Lông Ga Trực Thăng': 'games',
  'Sân Cầu Lông Kỳ Hòa': 'games',
  'Vincom Ice Rink Landmark 81 - Sân Trượt Băng': 'games',
  'Jump Arena Trampoline Park Thảo Điền': 'theme_park',
  'Push Climbing - Tường Leo Núi Thảo Điền': 'games',
  'Hachiko Coffee Cún Cưng': 'coffee',
  'Katholic Cat Cafe': 'coffee',
};

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
    kind: KIND_BY_NAME[name] ?? null,
  }),
);
