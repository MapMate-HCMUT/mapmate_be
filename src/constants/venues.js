// "Địa điểm trong địa điểm": quán ăn, cà phê, rạp phim... nằm TRONG trung tâm thương mại.
// Dữ liệu mở (Overture) đã có sẵn quán trong mall (địa chỉ ghi "Tầng 3, Vincom Center...") nhưng chưa gắn với mall
// => script places:link-venues gắn `parent_place_id` để lộ trình biết "ăn Dookki rồi dạo Vincom" là CÙNG 1 nơi.

// Thương hiệu / tên mall ở TP.HCM (so trên chữ đã bỏ dấu, viết thường)
export const MALL_BRANDS = [
  'vincom', 'aeon', 'crescent mall', 'saigon centre', 'sai gon centre', 'takashimaya', 'giga mall', 'gigamall', 'vivocity', 'vivo city',
  'estella', 'lotte mart', 'parkson', 'diamond plaza', 'van hanh mall', 'nowzone', 'now zone', 'landmark 81', 'thiso mall', 'emart',
  'union square', 'saigon square', 'pearl plaza', 'hung vuong plaza', 'sense city', 'pandora city', 'menas mall', 'bitexco',
];
// Tên mall chỉ được có các tiền tố này đứng trước thương hiệu — loại "Lotteria Pandora City", "Wink Hotel Saigon Centre"
export const MALL_NAME_PREFIX = /^(trung tam thuong mai|tttm|sieu thi|sc|toa nha)?$/;
// Tên có chữ của mall nhưng KHÔNG phải mall (tiệm vàng, bãi xe, câu lạc bộ bên trong...)
export const NOT_MALL_NAME = /\b(pnj|doji|dau xe|giu xe|parking|bai xe|c club|atm|ngan hang|bank|nha thuoc|pharmacy|cua hang|store|shop|hotel|khach san)\b/;
// Từ thừa trong địa chỉ khi so số nhà + tên đường ("72 Đ. Lê Thánh Tôn" = "72 Lê Thánh Tôn")
export const ADDRESS_FILLER = /\b(duong|dg|d|so|street|st)\b\.?/g;
// Dấu hiệu địa chỉ nằm trong toà nhà: "Tầng 3", "Lầu 2", "L3-05", "B1", "Lô F29B", "Kiosk", "Food court"
export const INSIDE_BUILDING_ADDRESS = /\b(tang|lau|floor|tttm|kiosk|gian hang|food ?court)\b|\b[lb]\d{1,2}\b|\blo [a-z]?\d/;

export const VENUE_LINK = {
  BRAND_DISTANCE_M: 250, // địa chỉ ghi tên mall + cách ≤ 250 m (mall lớn, toạ độ quán lệch tâm)
  STREET_DISTANCE_M: 150, // cùng số nhà + tên đường với mall (cùng số nhà mà xa hơn thường là toà / khuôn viên khác)
  INSIDE_DISTANCE_M: 40, // địa chỉ không ghi tên mall nhưng có "Tầng / Lầu..." — khu trung tâm toà nhà san sát nên phải rất gần
  DUPLICATE_DISTANCE_M: 150, // 2 bản ghi cùng tên mall gần nhau => 1 mall
  CHILD_CATEGORIES: ['food', 'cafe', 'entertainment', 'shopping'],
};
// Đi giữa 2 điểm trong cùng 1 mall: đi bộ vài phút, không tốn tiền, không gửi xe lại
export const VENUE_WALK_MINUTES = 5;
// Chọn điểm kế tiếp trong cùng mall với điểm trước => ưu tiên ("ăn luôn trong mall")
export const SAME_VENUE_BONUS = 0.25;
// Chuyến đi mall ("đi Vincom chơi", "đi mall") => các điểm trong mall đó được ưu tiên mạnh
export const VENUE_TRIP_BONUS = 1;
export const MALL_TRIP_KEYWORD = 'mall';
export const MALL_TRIP_WORDS = /(mall|trung tâm thương mại|tttm|trung tâm mua sắm|vincom|aeon|crescent|vivocity|giga ?mall|saigon centre|estella)/;
