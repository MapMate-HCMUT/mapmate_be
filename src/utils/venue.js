// Mall & các điểm bên trong (xem constants/venues.js). Dùng chung cho script gắn dữ liệu và bộ lên lộ trình.
import { ADDRESS_FILLER, MALL_BRANDS, MALL_NAME_PREFIX, NOT_MALL_NAME } from '../constants/venues.js';
import { normalizeSearchText } from './text.js';

export const mallBrandOf = (text = '') => {
  const plain = normalizeSearchText(text);
  return MALL_BRANDS.find((brand) => plain.includes(brand)) ?? null;
};

// Tên của chính 1 mall: thương hiệu đứng đầu (cho phép "Trung tâm thương mại / Siêu thị ..." phía trước)
const isMallName = (name = '') => {
  const plain = normalizeSearchText(name);
  const brand = mallBrandOf(name);
  return Boolean(brand) && MALL_NAME_PREFIX.test(plain.slice(0, plain.indexOf(brand)).trim()) && !NOT_MALL_NAME.test(plain);
};

// Mall "gốc" (không phải bản ghi trùng đã gắn vào mall khác)
export const isMall = (place) =>
  !place.parent_place_id && (place.kind === 'mall' || (place.category === 'shopping' && isMallName(place.name))) && !NOT_MALL_NAME.test(normalizeSearchText(place.name ?? ''));

// "72 Lê Thánh Tôn, Phường Bến Nghé" -> "72 le thanh ton" — để nhận quán cùng số nhà với mall
const cleanAddress = (address = '') => normalizeSearchText(address).replace(/[.,/-]/g, ' ').replace(ADDRESS_FILLER, ' ').replace(/\s+/g, ' ').trim();
const ADMIN_AREA = /\b(phuong|quan|huyen|thanh pho|tp|ward|district|p|q)\b.*$/;
// Số nhà + tên đường của mall, lấy trước dấu phẩy đầu tiên, bỏ phường / quận: "72 Lê Thánh Tôn, Phường Bến Nghé" -> "72 le thanh ton".
// Cần ≥ 2 chữ tên đường; "3 thang 2" (tên đường có số) không đủ phân biệt => null
export const streetKeyOf = (address = '') =>
  cleanAddress(address.split(',')[0]).replace(ADMIN_AREA, '').trim().match(/\b\d+[a-z]?\s+[a-z]{2,}(?:\s+[a-z]{2,}){1,3}/)?.[0] ?? null;
export const addressHasStreet = (address, streetKey) => Boolean(streetKey) && ` ${cleanAddress(address)} `.includes(` ${streetKey} `);

// Id của "nơi chứa" 1 điểm: mall chứa nó, chính nó nếu là mall, hoặc null
export const venueOf = (place) => {
  if (place.parent_place_id) return { id: String(place.parent_place_id), name: place.parent_place_name ?? null };
  return isMall(place) ? { id: String(place._id), name: place.name } : null;
};

export const sameVenue = (a, b) => {
  const venueA = a && venueOf(a);
  return Boolean(venueA) && venueA.id === venueOf(b)?.id;
};
