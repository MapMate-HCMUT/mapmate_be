// Ánh xạ loại hình của Overture / OpenStreetMap -> loại hình MapMate + phong cách + giá ước tính + thời gian ở lại.
// Nguồn mở KHÔNG có giá => dùng mức giá phổ biến ở TP.HCM theo loại hình (đ/người), gắn cờ price_estimated.
const K = 1000;

/**
 * "Kind" = nhóm địa điểm có cùng cách xử lý.
 * category: loại MapMate · tags: phong cách chắc chắn đúng với cả nhóm · price: [min, max] đ/người · visit: phút ở lại
 */
export const KINDS = {
  street_food: { category: 'food', tags: ['binh-dan'], price: [25 * K, 60 * K], visit: 40 },
  bakery: { category: 'food', tags: ['binh-dan'], price: [20 * K, 60 * K], visit: 20 },
  restaurant: { category: 'food', tags: [], price: [60 * K, 200 * K], visit: 60 },
  fine_dining: { category: 'food', tags: ['sang-trong', 'may-lanh'], price: [300 * K, 800 * K], visit: 90 },
  buffet: { category: 'food', tags: ['nhom-ban', 'gia-dinh'], price: [250 * K, 500 * K], visit: 90 },
  fast_food: { category: 'food', tags: ['may-lanh'], price: [50 * K, 120 * K], visit: 40 },
  dessert: { category: 'cafe', tags: [], price: [25 * K, 70 * K], visit: 40 },
  coffee: { category: 'cafe', tags: [], price: [30 * K, 70 * K], visit: 60 },
  tea: { category: 'cafe', tags: [], price: [25 * K, 60 * K], visit: 45 },
  bar: { category: 'entertainment', tags: ['ve-dem', 'nhom-ban'], price: [120 * K, 350 * K], visit: 90 },
  club: { category: 'entertainment', tags: ['ve-dem', 'nhom-ban'], price: [200 * K, 600 * K], visit: 120 },
  karaoke: { category: 'entertainment', tags: ['nhom-ban', 'may-lanh'], price: [100 * K, 300 * K], visit: 120 },
  cinema: { category: 'entertainment', tags: ['may-lanh'], price: [80 * K, 150 * K], visit: 150 },
  theatre: { category: 'entertainment', tags: [], price: [100 * K, 400 * K], visit: 120 },
  games: { category: 'entertainment', tags: ['nhom-ban', 'may-lanh'], price: [80 * K, 200 * K], visit: 90 },
  theme_park: { category: 'entertainment', tags: ['gia-dinh', 'ngoai-troi'], price: [100 * K, 300 * K], visit: 180 },
  zoo: { category: 'attraction', tags: ['gia-dinh', 'ngoai-troi'], price: [50 * K, 150 * K], visit: 120 },
  museum: { category: 'attraction', tags: [], price: [20 * K, 60 * K], visit: 90 },
  gallery: { category: 'attraction', tags: ['song-ao', 'yen-tinh'], price: [0, 50 * K], visit: 60 },
  park: { category: 'attraction', tags: ['ngoai-troi'], price: [0, 0], visit: 45 },
  landmark: { category: 'attraction', tags: ['song-ao'], price: [0, 0], visit: 30 },
  worship: { category: 'attraction', tags: ['yen-tinh'], price: [0, 0], visit: 40 },
  mall: { category: 'shopping', tags: ['may-lanh'], price: [0, 300 * K], visit: 90 },
  market: { category: 'shopping', tags: ['binh-dan'], price: [0, 150 * K], visit: 60 },
  bookstore: { category: 'shopping', tags: ['yen-tinh', 'may-lanh'], price: [0, 150 * K], visit: 45 },
};

// Overture: phân loại chi tiết (taxonomy.primary) được ưu tiên trước, sau đó tới basic_category.
// Cố ý BỎ: historic_site (phần lớn là chung cư bị gắn nhầm), music_venue chung chung (lẫn spam), food_and_drink / shopping chung chung.
const OVERTURE_PRIMARY = {
  diner: 'street_food', food_truck: 'street_food', food_stand: 'street_food', food_court: 'street_food',
  bakery: 'bakery', bagel_shop: 'bakery', donut_shop: 'bakery', sandwich_shop: 'street_food',
  ice_cream_shop: 'dessert', dessert_shop: 'dessert', frozen_yogurt_shop: 'dessert', gelato_shop: 'dessert', cupcake_shop: 'dessert',
  buffet_restaurant: 'buffet', steakhouse: 'fine_dining', french_restaurant: 'fine_dining',
  bubble_tea_shop: 'tea', tea_room: 'tea',
  karaoke_venue: 'karaoke', opera_and_ballet: 'theatre',
};
const OVERTURE_BASIC = {
  restaurant: 'restaurant', casual_eatery: 'street_food', food_truck_stand: 'street_food', food_court: 'street_food',
  fast_food_restaurant: 'fast_food',
  coffee_shop: 'coffee', cafe: 'coffee', non_alcoholic_beverage_venue: 'tea', smoothie_juice_bar: 'tea',
  bar: 'bar', lounge: 'bar', alcoholic_beverage_venue: 'bar', brewery: 'bar', dance_club: 'club',
  movie_theater: 'cinema', theatre_venue: 'theatre', performing_arts_venue: 'theatre',
  arcade: 'games', gaming_venue: 'games', skating_rink: 'games',
  amusement_park: 'theme_park', amusement_attraction: 'theme_park', zoo: 'zoo', aquarium: 'zoo', animal_attraction: 'zoo',
  museum: 'museum', art_gallery: 'gallery', cultural_center: 'gallery',
  park: 'park', garden: 'park', public_plaza: 'park',
  monument: 'landmark', sculpture_statue: 'landmark', castle: 'landmark',
  buddhist_place_of_worship: 'worship', christian_place_of_worship: 'worship', hindu_place_of_worship: 'worship', muslim_place_of_worship: 'worship',
  shopping_mall: 'mall', department_store: 'mall', superstore: 'mall',
  market: 'market', farmers_market: 'market',
  books_music_and_video_store: 'bookstore',
};

// Loại hình Overture hay bị gắn nhầm => tên phải chứa từ khoá phù hợp (+ độ tin cậy cao hơn nếu cần).
const MALL_NAME = /mall|plaza|center|centre|trung tâm thương mại|tttm|vincom|aeon|lotte|parkson|takashimaya|gigamall|vạn hạnh|crescent|estella|thiso|sc vivo|diamond|bitexco|nowzone|union square|co\.?op ?xtra|emart|go!/i;
const BOOK_NAME = /sách|book|fahasa|phương nam/i;
const ZOO_NAME = /thảo cầm viên|sở thú|vườn thú|zoo|safari|thủy cung|thuỷ cung|cá sấu/i;
const WORSHIP_NAME = /^(chùa|nhà thờ|đền|miếu|thiền viện|tu viện|thánh thất|hội quán|tổ đình|đình|pagoda|temple|church|cathedral|mosque)|(pagoda|temple|church|cathedral|mosque)$/i;
const WORSHIP_MIN_CONFIDENCE = 0.9;
const OVERTURE_NAME_RULES = {
  department_store: { pattern: MALL_NAME },
  superstore: { pattern: MALL_NAME },
  books_music_and_video_store: { pattern: BOOK_NAME },
  zoo: { pattern: ZOO_NAME },
  aquarium: { pattern: ZOO_NAME },
  animal_attraction: { pattern: ZOO_NAME },
  buddhist_place_of_worship: { pattern: WORSHIP_NAME, minConfidence: WORSHIP_MIN_CONFIDENCE },
  christian_place_of_worship: { pattern: WORSHIP_NAME, minConfidence: WORSHIP_MIN_CONFIDENCE },
  hindu_place_of_worship: { pattern: WORSHIP_NAME, minConfidence: WORSHIP_MIN_CONFIDENCE },
  muslim_place_of_worship: { pattern: WORSHIP_NAME, minConfidence: WORSHIP_MIN_CONFIDENCE },
};

export const kindFromOverture = ({ basic_category: basic, taxonomy, names, confidence }) => {
  const rule = OVERTURE_NAME_RULES[basic];
  if (rule && (!rule.pattern.test(names?.primary ?? '') || confidence < (rule.minConfidence ?? 0))) return null;
  return OVERTURE_PRIMARY[taxonomy?.primary] ?? (basic === 'music_venue' ? null : OVERTURE_BASIC[basic]) ?? null;
};

// OpenStreetMap: theo cặp key=value của thẻ (tag)
const OSM_TAGS = {
  amenity: {
    restaurant: 'restaurant', fast_food: 'fast_food', food_court: 'street_food', ice_cream: 'dessert', cafe: 'coffee',
    bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'club', karaoke_box: 'karaoke',
    cinema: 'cinema', theatre: 'theatre', arts_centre: 'gallery', marketplace: 'market',
  },
  tourism: { attraction: 'landmark', museum: 'museum', gallery: 'gallery', viewpoint: 'landmark', zoo: 'zoo', theme_park: 'theme_park', aquarium: 'zoo', artwork: 'landmark' },
  leisure: { park: 'park', garden: 'park', amusement_arcade: 'games', water_park: 'theme_park', bowling_alley: 'games', escape_game: 'games' },
  historic: { monument: 'landmark', memorial: 'landmark', building: 'landmark', castle: 'landmark', ruins: 'landmark' },
  shop: { mall: 'mall', department_store: 'mall', books: 'bookstore' },
};
export const OSM_KIND_KEYS = Object.keys(OSM_TAGS);
// Dùng để dựng câu truy vấn Overpass: [['amenity', ['restaurant', ...]], ...]
export const OSM_TAG_FILTERS = Object.entries(OSM_TAGS).map(([key, values]) => [key, Object.keys(values)]);

// OSM shop=department_store ở VN hay là tiệm tạp hoá => cũng phải có tên giống TTTM.
const OSM_NAME_RULES = { department_store: MALL_NAME };

export const kindFromOsm = (tags) => {
  for (const key of OSM_KIND_KEYS) {
    const kind = OSM_TAGS[key][tags[key]];
    const rule = OSM_NAME_RULES[tags[key]];
    if (kind && (!rule || rule.test(tags['name:vi'] ?? tags.name ?? ''))) return kind;
  }
  return null;
};

// Món / ẩm thực -> nhãn tiếng Việt (để tìm "lau" ra quán lẩu, hiển thị trên thẻ)
const CUISINE_LABELS = {
  vietnamese: 'Món Việt', japanese: 'Món Nhật', sushi: 'Sushi', ramen: 'Ramen', korean: 'Món Hàn', chinese: 'Món Hoa',
  dim_sum: 'Dimsum', taiwanese: 'Món Đài Loan', thai: 'Món Thái', indian: 'Món Ấn', italian: 'Món Ý', french: 'Món Pháp',
  pizza: 'Pizza', burger: 'Burger', chicken: 'Gà rán', seafood: 'Hải sản', barbecue: 'Nướng', bbq: 'Nướng',
  hot_pot: 'Lẩu', hotpot: 'Lẩu', vegetarian: 'Chay', vegan: 'Chay', noodle: 'Bún/Phở/Mì', pho: 'Phở',
  breakfast_and_brunch: 'Ăn sáng', steak: 'Bít tết', coffee_shop: 'Cà phê', bubble_tea: 'Trà sữa', tea: 'Trà',
  ice_cream: 'Kem', dessert: 'Tráng miệng', bakery: 'Bánh', sandwich: 'Bánh mì', asian: 'Món Á',
};

// Overture: "japanese_restaurant" -> "japanese" · OSM: "vietnamese;noodle"
export const cuisinesFromOverture = (primary = '') => {
  const label = CUISINE_LABELS[primary.replace(/_(restaurant|shop|room)$/, '')];
  return label ? [label] : [];
};
export const cuisinesFromOsm = (value = '') => [
  ...new Set(value.split(/[;,]/).map((item) => CUISINE_LABELS[item.trim().toLowerCase()]).filter(Boolean)),
];

// Chuỗi quen thuộc: giá thực tế khác hẳn mức chung của loại hình (đ/người).
const BRAND_PRICES = [
  [/starbucks/i, [70 * K, 130 * K]],
  [/highlands|phuc long|phúc long|the coffee house|katinat|cộng cà phê|cong caphe|trung nguyên|trung nguyen/i, [35 * K, 75 * K]],
  [/kfc|lotteria|jollibee|mcdonald|popeyes|burger king|texas chicken/i, [60 * K, 130 * K]],
  [/pizza hut|domino|pizza 4p/i, [150 * K, 350 * K]],
  [/buffet/i, [250 * K, 500 * K]],
  [/cgv|lotte cinema|galaxy|bhd|beta cinemas|cinestar/i, [80 * K, 150 * K]],
];
export const brandPrice = (name) => BRAND_PRICES.find(([pattern]) => pattern.test(name))?.[1] ?? null;

// Tên rác: spam cá cược, chung cư bị gắn nhầm loại... (so trên tên viết thường, CÒN dấu)
const JUNK_NAME = /kèo|k\.èo|nhà cái|cá cược|tài xỉu|nhận định|xổ số|lô đề|casino|\bbet\b|chung cư|căn hộ|apartment|khu dân cư|showroom|văn phòng|công ty|cho thuê|tin tức|\.com\b|\.net\b|dạy nghề|đào tạo|tuyển sinh|giáo xứ|giáo họ|vòng xoay|bùng binh|ngã (tư|ba|sáu|bảy)|tạp ho?á|bách ho?á xanh|đại lý|điểm đón|đón trả|bãi (giữ|đỗ) xe/i;
export const isJunkName = (name) => !name || name.trim().length < 2 || JUNK_NAME.test(name);
