// Bản ghi đã gộp -> document của collection `places`.
import { buildPlaceSearchText } from '../../models/Place.model.js';
import { PLACE_STATUS } from '../../constants/places.js';
import { roundTo } from '../../utils/geo.js';
import { isLateNight } from './openingHours.js';
import { brandPrice, KINDS } from './placeKinds.js';

const CONFIDENCE_DIGITS = 2;

/**
 * Chia làm 2 phần khi upsert:
 * - `source`: lấy từ nguồn mở, nhập lại thì cập nhật (tên, địa chỉ, toạ độ, giờ...).
 * - `initial`: chỉ ghi lần đầu — sau này cộng đồng sửa (rating, giá thực tế, hot) thì nhập lại KHÔNG ghi đè.
 */
export const toPlaceDocument = (record) => {
  const kind = KINDS[record.kind];
  const [priceMin, priceMax] = brandPrice(record.name) ?? kind.price;
  const tags = new Set([...kind.tags, ...record.extraTags]);
  if (isLateNight(record.hours)) tags.add('ve-dem');

  const source = {
    source: record.source,
    source_ref: record.source_ref,
    osm_ref: record.osm_ref,
    name: record.name,
    address: record.address,
    district: record.district ?? '',
    category: kind.category,
    kind: record.kind,
    location: { type: 'Point', coordinates: record.coordinates },
    opening_hours: { open: record.hours?.open ?? null, close: record.hours?.close ?? null },
    hours_known: Boolean(record.hours),
    avg_visit_minutes: kind.visit,
    tags: [...tags],
    cuisines: record.cuisines,
    contact: record.contact,
    confidence: roundTo(record.confidence, CONFIDENCE_DIGITS),
    cached_at: new Date(),
  };
  source.search_text = buildPlaceSearchText(source);

  const initial = {
    status: PLACE_STATUS.ACTIVE, // sau đó do cộng đồng báo / lần nhập sau quyết định
    report_counts: { closed: 0, open: 0 },
    rating: 0,
    review_count: 0,
    price_range: { min: priceMin, max: priceMax },
    price_estimated: true,
    is_trending: false,
    specialties: [],
  };
  return { source, initial };
};
