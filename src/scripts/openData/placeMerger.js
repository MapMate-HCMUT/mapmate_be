// Gộp địa điểm từ nhiều nguồn thành 1 (luật chi tiết ở isSamePlace).
// Thứ tự thêm quyết định bản nào làm gốc: dữ liệu MapMate (khoá, không bị thay) -> Overture -> OSM (bổ sung giờ mở cửa, món).
import { CURATED_SAME_NAME_RADIUS_M, DUPLICATE_RADIUS_M, SAME_NAME_RADIUS_M } from '../../constants/openData.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { SpatialGrid } from './spatialGrid.js';

const METERS_PER_KM = 1000;
const SAME_NAME_RATIO = 0.8;
const LANDMARK_SAME_SPOT_M = 60;
const LANDMARK_CATEGORIES = new Set(['attraction', 'shopping']);
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
 * - tượng đài / công viên / TTTM cùng loại, sát nhau ≤ 60 m (hay có nhiều tên Việt / Anh / tên cũ).
 */
const isSamePlace = (record, other, meters) => {
  if (isIdenticalName(record.tokens, other.tokens)) return meters <= SAME_NAME_RADIUS_M;
  if (meters > DUPLICATE_RADIUS_M || record.category !== other.category) return false;
  if (sharedRatio(record.tokens, other.tokens) >= SAME_NAME_RATIO) return true;
  return meters <= LANDMARK_SAME_SPOT_M && LANDMARK_CATEGORIES.has(record.category);
};

// Bổ sung trường còn thiếu của bản gốc từ bản trùng (không ghi đè dữ liệu bản gốc đã có).
const mergeInto = (base, extra) => {
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
    this.grid = new SpatialGrid(SAME_NAME_RADIUS_M);
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
