// Gộp địa điểm từ nhiều nguồn thành 1 (luật chi tiết ở isSamePlace).
// Thứ tự thêm quyết định bản nào làm gốc: dữ liệu MapMate (khoá, không bị thay) -> Overture -> OSM (bổ sung giờ mở cửa, món).
import { CURATED_SAME_NAME_RADIUS_M, DUPLICATE_RADIUS_M, SAME_NAME_RADIUS_M } from '../../constants/openData.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { SpatialGrid } from './spatialGrid.js';

const METERS_PER_KM = 1000;
const SAME_NAME_RATIO = 0.8;
// Tượng đài / TTTM cùng loại sát nhau ≤ 60 m là 1 nơi (dù khác tên). Công viên, khu vui chơi rộng hơn nhiều => ≤ 200 m
// nhưng phải chung ≥ 50% từ khoá ("Dam Sen Water Park" = "Công viên Nước Đầm Sen"), để không nuốt công viên nhỏ bên cạnh.
const SAME_SPOT_RULES = { attraction: { meters: 60, minRatio: 0 }, shopping: { meters: 60, minRatio: 0 }, park: { meters: 200, minRatio: 0.5 } };
const SEARCH_RADIUS_M = Math.max(SAME_NAME_RADIUS_M, ...Object.values(SAME_SPOT_RULES).map((rule) => rule.meters)); // ô lưới phủ bán kính lớn nhất
// Tên chính của khu vui chơi (ưu tiên giữ khi gộp với trò chơi / khu con bên trong: "Roller Coaster (Suoi Tien Park)")
const MAIN_PARK_NAME = /^(khu du lịch|công viên|thảo cầm viên|khu vui chơi|vườn)/i;
// Từ chung chung không giúp phân biệt quán: "Quán", "Cà phê", "Nhà hàng"...
// "Chợ An Đông" = "An Dong Market", "Phố đi bộ Bùi Viện" = "Bui Vien Walking Street".
const GENERIC_WORDS = new Set([
  'quan', 'nha', 'hang', 'cafe', 'ca', 'phe', 'coffee', 'tiem', 'restaurant', 'shop', 'cua', 'the', 'and', 'va', 'saigon', 'sai', 'gon',
  'cho', 'market', 'dem', 'night', 'di', 'bo', 'walking', 'street', 'food',
]);

export const nameTokens = (name) => {
  const words = normalizeSearchText(name).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !GENERIC_WORDS.has(word));
  return new Set(meaningful.length ? meaningful : words);
};

const sharedRatio = (a, b) => [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
const isIdenticalName = (a, b) => a.size === b.size && sharedRatio(a, b) === 1;

/**
 * 2 bản ghi là 1 địa điểm khi:
 * - tên giống hệt (sau chuẩn hoá) và cách ≤ 150 m (2 nguồn hay lệch toạ độ), hoặc
 * - tên gần giống (≥ 80% từ khoá) + CÙNG loại hình + cách ≤ 80 m ("Kem Hồ Thị Kỷ" ≠ "Chợ đêm Hồ Thị Kỷ"), hoặc
 * - tượng đài / TTTM cùng loại sát nhau ≤ 60 m; công viên / khu vui chơi ≤ 200 m + chung ≥ 50% từ khoá (nhiều tên Việt / Anh).
 */
const isSamePlace = (record, other, meters) => {
  if (isIdenticalName(record.tokens, other.tokens)) return meters <= SAME_NAME_RADIUS_M;
  if (record.category !== other.category) return false;
  if (meters <= DUPLICATE_RADIUS_M && sharedRatio(record.tokens, other.tokens) >= SAME_NAME_RATIO) return true;
  const rule = SAME_SPOT_RULES[record.category]; // quán ăn / cà phê: không có luật này (nhiều quán chung 1 toạ độ trong TTTM)
  return Boolean(rule) && meters <= rule.meters && sharedRatio(record.tokens, other.tokens) >= rule.minRatio;
};

// Bổ sung trường còn thiếu của bản gốc từ bản trùng (không ghi đè dữ liệu bản gốc đã có).
const mergeInto = (base, extra) => {
  if (base.category === 'park' && MAIN_PARK_NAME.test(extra.name) && !MAIN_PARK_NAME.test(base.name)) base.name = extra.name;
  if (extra.source_ref?.startsWith('osm:') && !base.osm_ref) base.osm_ref = extra.source_ref;
  base.hours ??= extra.hours;
  base.address ||= extra.address;
  base.district ??= extra.district;
  base.cuisines = [...new Set([...base.cuisines, ...extra.cuisines])];
  base.extraTags = [...new Set([...base.extraTags, ...extra.extraTags])];
  base.contact = {
    phone: base.contact.phone ?? extra.contact.phone,
    website: base.contact.website ?? extra.contact.website,
    facebook: base.contact.facebook ?? extra.contact.facebook,
  };
  base.confidence = Math.max(base.confidence, extra.confidence);
};

export class PlaceMerger {
  constructor() {
    this.grid = new SpatialGrid(SEARCH_RADIUS_M);
    this.curatedGrid = new SpatialGrid(CURATED_SAME_NAME_RADIUS_M); // địa điểm MapMate: tìm trong phạm vi rộng hơn
    this.places = [];
    this.stats = { added: 0, mergedIntoOpenData: 0, matchedCurated: 0 };
  }

  findDuplicate(record) {
    const curated = this.curatedGrid.nearby(record.coordinates).find(({ coordinates, value }) =>
      isIdenticalName(record.tokens, value.tokens) && haversineKm(record.coordinates, coordinates) * METERS_PER_KM <= CURATED_SAME_NAME_RADIUS_M,
    );
    if (curated) return curated.value;
    return this.grid
      .nearby(record.coordinates)
      .find(({ coordinates, value }) => isSamePlace(record, value, haversineKm(record.coordinates, coordinates) * METERS_PER_KM))?.value;
  }

  // locked = địa điểm MapMate đã có trong DB: chỉ dùng để chặn trùng, không xuất ra lại.
  add(record, { locked = false } = {}) {
    const entry = { ...record, tokens: nameTokens(record.name), locked };
    const duplicate = this.findDuplicate(entry);
    if (duplicate) {
      if (duplicate.locked) this.stats.matchedCurated += 1;
      else {
        mergeInto(duplicate, entry);
        this.stats.mergedIntoOpenData += 1;
      }
      return;
    }
    this.grid.add(entry.coordinates, entry);
    if (locked) this.curatedGrid.add(entry.coordinates, entry);
    if (!locked) {
      this.places.push(entry);
      this.stats.added += 1;
    }
  }
}
