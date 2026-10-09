// Kiểu hoạt động của 1 điểm dừng (bắn cung, dạo mall, xem phim, board game, bảo tàng...) — để 1 lộ trình phối nhiều kiểu
// chơi khác nhau thay vì 2–3 nơi na ná nhau. Suy từ dữ liệu Gen Z (genz_sub_category) > kind > tên quán; không lưu trong DB.
import { normalizeSearchText } from './text.js';

// Tên quán (không dấu) -> kiểu hoạt động. Thứ tự quan trọng: khớp mẫu đầu tiên.
const NAME_TYPES = [
  ['archery', /\b(ban cung|archery)\b/],
  ['shooting', /\b(ban sung|laser tag|paintball)\b/],
  ['escape_room', /\b(escape|phong thoat hiem|mat that)\b/],
  ['board_game', /\b(board ?game|boardgame|ma soi)\b/],
  ['bowling', /\bbowling\b/],
  ['billiard', /\b(bida|billiards?|bi-a)\b/],
  ['karaoke', /\bkaraoke\b/],
  ['arcade', /\b(arcade|game center|timezone|tiniworld|may gap thu|vr|thuc te ao)\b/],
  ['trampoline', /\b(trampoline|bat nhun|jump arena)\b/],
  ['climbing', /\b(leo nui|climbing|bouldering)\b/],
  ['cinema', /\b(cgv|galaxy|lotte cinema|bhd|beta cinema|cinestar|cinema|rap phim|rap chieu)\b/],
  ['theatre', /\b(nha hat|san khau|theatre|theater|kich)\b/],
  ['workshop', /\b(workshop|gom|tufting|ve tranh|nen thom|handmade|diy|cooking class)\b/],
  ['gallery', /\b(gallery|trien lam|phong tranh|art|nghe thuat)\b/],
  ['museum', /\b(bao tang|museum|di tich)\b/],
  ['worship', /\b(chua|nha tho|den|mieu|thien vien|tinh xa|pagoda|temple|church|cathedral)\b/],
  ['zoo', /\b(thao cam vien|so thu|thuy cung|zoo|aquarium)\b/],
  ['theme_park', /\b(dam sen|suoi tien|khu vui choi|khu du lich|theme park|water park|cong vien nuoc)\b/],
  ['walking_street', /\b(pho di bo|duong sach|walking street|ben bach dang|bo song)\b/],
  ['mall', /\b(vincom|aeon|lotte mart|giga ?mall|crescent|takashimaya|parkson|thiso|vivo ?city|estella|saigon centre|plaza|mall|trung tam thuong mai)\b/],
  ['market', /^cho\b|\b(cho dem|market|night market)\b/],
  ['bookstore', /\b(nha sach|hieu sach|book)\b/],
  ['park', /\b(cong vien|park|vuon)\b/],
  ['landmark', /\b(landmark|skydeck|sky ?view|buu dien|dinh doc lap)\b/],
];

const KIND_TYPES = {
  museum: 'museum', gallery: 'gallery', worship: 'worship', cinema: 'cinema', theatre: 'theatre', mall: 'mall', market: 'market',
  bookstore: 'bookstore', park: 'park', zoo: 'zoo', theme_park: 'theme_park', walking_street: 'walking_street', landmark: 'landmark', games: 'games',
};

export const activityTypeOf = (place) => {
  if (place.genz_sub_category) return place.genz_sub_category;
  const name = normalizeSearchText(place.name ?? '');
  const byName = NAME_TYPES.find(([, pattern]) => pattern.test(name));
  if (byName) return byName[0];
  return KIND_TYPES[place.kind] ?? place.genz_category ?? place.kind ?? place.category ?? 'other';
};

// Nhóm lớn của kiểu hoạt động: 3 điểm "tham quan" (nhà thờ, bưu điện, bảo tàng) khác kiểu nhưng vẫn na ná nhau
const ACTIVITY_GROUPS = {
  sightseeing: ['museum', 'worship', 'landmark', 'walking_street', 'historical', 'architecture', 'discovery_hidden'],
  play: ['archery', 'shooting', 'shooting_sport', 'escape_room', 'board_game', 'bowling', 'billiard', 'karaoke', 'arcade', 'video_game', 'vr_ar', 'trampoline', 'climbing', 'games', 'games_entertainment', 'amusement_park', 'sports_fitness'],
  show: ['cinema', 'theatre', 'cinema_immersive', 'music_performance'],
  shopping: ['mall', 'market', 'bookstore', 'shopping', 'shopping_lifestyle'],
  nature: ['park', 'zoo', 'theme_park', 'nature_outdoors'],
  creative: ['workshop', 'gallery', 'art_gallery', 'art_creative', 'pottery_workshop', 'tufting_workshop', 'candle_perfume_workshop', 'painting_workshop', 'handmade_workshop', 'creative_space', 'photography_studio', 'learning_workshop'],
};
const GROUP_OF = new Map(Object.entries(ACTIVITY_GROUPS).flatMap(([group, types]) => types.map((type) => [type, group])));

export const activityGroupOf = (place) => {
  const type = activityTypeOf(place);
  return GROUP_OF.get(type) ?? GROUP_OF.get(place.genz_category) ?? type;
};
