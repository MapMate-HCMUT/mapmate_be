// Luật xếp lộ trình "hợp lý như người thật đi chơi" — dùng cho bộ dựng khuôn (services/tripComposer.js)
// và bộ kiểm tra lộ trình (services/itineraryValidator.js).

// Vai trò của 1 điểm dừng: đến đó để làm gì (khác Place.tags — phong cách / dịp đi).
export const VISIT_ROLES = {
  MEAL: 'meal', // bữa chính: nhà hàng, cơm, phở, bún, lẩu, buffet
  SNACK: 'snack', // ăn vặt / tráng miệng: bánh mì, chè, kem, bánh
  DRINK: 'drink', // đồ uống: cà phê, trà sữa, bar
  ACTIVITY: 'activity', // tham quan, công viên, giải trí, mua sắm
};
export const VISIT_ROLE_VALUES = Object.values(VISIT_ROLES);
export const VISIT_ROLE_LABELS = { meal: 'Bữa chính', snack: 'Ăn vặt', drink: 'Đồ uống', activity: 'Vui chơi' };

// Place.kind -> vai trò (kind không có ở đây => suy theo loại hình: food = bữa chính, cafe = đồ uống, còn lại = vui chơi)
export const KIND_ROLES = {
  restaurant: VISIT_ROLES.MEAL,
  fine_dining: VISIT_ROLES.MEAL,
  buffet: VISIT_ROLES.MEAL,
  fast_food: VISIT_ROLES.MEAL,
  street_food: VISIT_ROLES.MEAL,
  food_street: VISIT_ROLES.MEAL,
  bakery: VISIT_ROLES.SNACK,
  dessert: VISIT_ROLES.SNACK,
  coffee: VISIT_ROLES.DRINK,
  tea: VISIT_ROLES.DRINK,
  bar: VISIT_ROLES.DRINK,
};

// Bữa trong ngày + khung giờ hợp lý ("HH:mm"). preferred = giờ bắt đầu gợi ý khi người dùng chỉ nói "ăn trưa".
export const MEAL_WINDOWS = {
  breakfast: { label: 'bữa sáng', from: '06:00', to: '10:00', preferred: '07:30' },
  lunch: { label: 'bữa trưa', from: '10:30', to: '14:30', preferred: '11:30' },
  dinner: { label: 'bữa tối', from: '17:00', to: '21:00', preferred: '18:30' },
  late_night: { label: 'ăn khuya', from: '21:00', to: '23:59', preferred: '21:30' },
};
export const MEAL_VALUES = Object.keys(MEAL_WINDOWS);

export const MEAL_RULES = {
  MIN_GAP_MINUTES: 240, // 2 bữa chính cách nhau ít nhất 4 tiếng
  MAX_SNACKS: 2, // tối đa 2 điểm ăn vặt / chuyến (food tour được nhiều hơn)
  MAX_SNACKS_FOOD_TOUR: 4,
  MIN_SNACK_GAP_MINUTES: 45, // 2 điểm ăn vặt cách nhau ≥ 45 phút
  MIN_SNACK_GAP_FOOD_TOUR_MINUTES: 20, // food tour: ăn xong đi quán kế luôn, không bắt chờ
  MAX_DRINKS: 2, // tối đa 2 điểm đồ uống / chuyến (không ai uống cà phê 3 lần 1 buổi)
  // Tới sớm hơn giờ ăn hợp lý => chừa "thời gian tự do" tối đa 30 phút; lâu hơn thì ăn luôn + cảnh báo
  // (bắt người dùng chờ / lang thang cả tiếng chỉ để đúng giờ ăn là phí thời gian của họ)
  MAX_FREE_MINUTES: 30,
  // ...trước đó ưu tiên ở lại điểm VUI CHƠI ngay trước lâu hơn, tối đa +45 phút so với bình thường
  MAX_EXTEND_ACTIVITY_MINUTES: 45,
};

// Thời gian ở lại là 1 KHOẢNG quanh avg_visit_minutes (mức "bình thường"), không phải 1 con số cố định:
// planner kéo dài khi cần chờ tới giờ ăn hoặc còn dư thời lượng; người dùng chỉnh ±15′ trên giao diện.
export const STAY_RANGE = {
  MIN_FACTOR: 0.75, // ăn nhanh / ghé nhanh
  MAX_FACTOR: { meal: 1.5, snack: 1.3, drink: 2, activity: 2 }, // cà phê, công viên ngồi lâu được; bữa ăn thì có giới hạn
  // Loại có giới hạn riêng: buffet hay giới hạn giờ, mall dạo 3–4 tiếng được, phim / kịch dài cố định
  KIND_MAX_FACTOR: { buffet: 1.35, mall: 2.7, cinema: 1, theatre: 1, fast_food: 1.2, bakery: 1.2 },
  MIN_MINUTES: 10,
  MAX_MINUTES: 300,
  STEP_MINUTES: 15, // bước chỉnh trên giao diện
  ROUND_TO: 5,
};

// Nhóm đông ngồi lâu hơn: +10′ mỗi 2 người tính từ người thứ 3, tối đa theo vai trò
export const GROUP_STAY = { BASE_PEOPLE: 2, PEOPLE_PER_STEP: 2, MINUTES_PER_STEP: 10, MAX_EXTRA: { meal: 30, drink: 20, snack: 10, activity: 0 } };

// Lộ trình ngắn hơn thời lượng người dùng muốn quá 30′ => kéo dài các điểm (trong khoảng cho phép) cho vừa.
// Thời lượng là GIỚI HẠN TRÊN, không phải chỉ tiêu: mỗi điểm chỉ dài thêm tối đa 30′ so với bình thường —
// còn dư thì kết thúc sớm (báo "còn dư X phút"), không kéo 1 quán cà phê thành 2 tiếng.
// Thứ tự ưu tiên kéo dài: vui chơi (dạo mall, công viên) > đồ uống (ngồi cà phê) > bữa chính > ăn vặt
export const STRETCH = { MIN_SLACK_MINUTES: 30, MAX_EXTRA_MINUTES: 30, ROLE_PRIORITY: ['activity', 'drink', 'meal', 'snack'] };

// Ước lượng khi dựng khuôn (chưa biết quán cụ thể): thời gian ở lại + di chuyển trung bình mỗi điểm (phút)
export const ROLE_SLOT_MINUTES = { meal: 75, snack: 40, drink: 60, activity: 90 };
export const SLOT_TRAVEL_MINUTES = 15;
// Chi phí tối thiểu thực tế mỗi điểm (đ/người) — để phát hiện ngân sách phi thực tế
export const ROLE_MIN_COST = { meal: 30000, snack: 15000, drink: 20000, activity: 0 };
// Món / kiểu quán có giá sàn cao hơn bữa thường (đ/người) — để phát hiện "buffet hải sản 50k"
export const KEYWORD_MIN_COST = { buffet: 150000, 'hải sản': 120000, lẩu: 100000, nướng: 100000, bbq: 100000, sushi: 120000, rooftop: 120000 };
// Thời gian tối thiểu cho 1 điểm dừng kể cả di chuyển (phút) — để phát hiện "8 chỗ trong 1 tiếng"
export const MIN_STOP_MINUTES = 45;

// ── Điểm hệ thống TỰ chọn (không áp cho điểm người dùng gọi tên) ──
// Chùa, nhà thờ, bảo tàng... chưa rõ giờ => coi như chỉ mở ban ngày (không gợi ý "Nhà thờ Đức Bà lúc 21:40")
export const DAYTIME_ONLY = {
  KINDS: ['worship', 'museum', 'gallery'],
  NAME: /^(chùa|nhà thờ|thánh đường|bảo tàng|đình|đền|miếu|thiền viện|tịnh xá|di tích|nghĩa trang)|\b(museum|temple|pagoda|church|cathedral)\b/i,
  HOURS: { open: '07:00', close: '17:00' },
};
// Sân tập thể thao, chỗ làm việc / học nhóm không phải chỗ đi chơi thông thường — chỉ chọn khi người dùng gọi đúng tên
export const NOT_LEISURE_NAME = /(tennis|pickleball|gym|fitness|yoga|sân bóng|bóng đá|cầu lông|bóng rổ|golf|võ thuật|coworking|clb tiếng anh|câu lạc bộ tiếng anh)/i;
// Cửa hàng chưa rõ loại (điện máy, ô tô, tạp hoá...) không phải điểm "mua sắm dạo chơi" — chỉ lấy mall, chợ, nhà sách
export const LEISURE_SHOP_NAME = /(vincom|aeon|lotte|giga ?mall|crescent|takashimaya|parkson|thiso|vivo ?city|estella|saigon centre|plaza|mall|trung tâm thương mại|chợ|nhà sách|hiệu sách|đường sách|book)/i;
