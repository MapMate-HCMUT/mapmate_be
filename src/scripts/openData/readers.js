// Đọc file dữ liệu mở đã tải về -> bản ghi chung { source, source_ref, name, coordinates, kind, ... }.
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { OSM_CONFIDENCE, PLACE_SOURCES } from '../../constants/openData.js';
import { normalizeDistrict } from './districts.js';
import { parseOsmOpeningHours } from './openingHours.js';
import { cuisinesFromOsm, cuisinesFromOverture, isJunkName, KINDS, kindFromOsm, kindFromOverture } from './placeKinds.js';

const FACEBOOK = /facebook\.com/i;

/**
 * Overture (GeoJSON mỗi dòng 1 địa điểm, ~450 MB) — đọc kiểu stream để không tốn RAM.
 * Giữ lại: thuộc loại hình đi chơi + đủ độ tin cậy + không đóng cửa + tên hợp lệ.
 */
export async function* readOverture(filePath, { minConfidence, stats }) {
  const lines = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    stats.read += 1;
    const { id, geometry, properties: place } = JSON.parse(line);
    const kind = kindFromOverture(place);
    const name = place.names?.primary;
    if (!kind) continue;
    if (place.confidence < minConfidence) { stats.lowConfidence += 1; continue; }
    if (place.operating_status && place.operating_status !== 'open') { stats.closed += 1; continue; }
    if (isJunkName(name) || geometry?.type !== 'Point') { stats.junk += 1; continue; }

    const address = place.addresses?.[0] ?? {};
    const socials = place.socials ?? [];
    stats.kept += 1;
    yield {
      source: PLACE_SOURCES.OVERTURE,
      source_ref: `overture:${id}`,
      osm_ref: null,
      name: name.trim(),
      coordinates: geometry.coordinates,
      kind,
      category: KINDS[kind].category,
      address: address.freeform?.trim() ?? '',
      district: normalizeDistrict(address.locality),
      confidence: place.confidence,
      hours: null, // Overture không có giờ mở cửa
      cuisines: cuisinesFromOverture(place.taxonomy?.primary),
      extraTags: [],
      contact: {
        phone: place.phones?.[0] ?? null,
        website: place.websites?.find((url) => !FACEBOOK.test(url)) ?? null,
        facebook: socials.find((url) => FACEBOOK.test(url)) ?? null,
      },
    };
  }
}

const osmCoordinates = (element) =>
  element.type === 'node' ? [element.lon, element.lat] : element.center ? [element.center.lon, element.center.lat] : null;

// OpenStreetMap (kết quả Overpass JSON). Không có tên => bỏ (công viên/tượng vô danh không gợi ý được).
export const readOsm = async (filePath, { stats }) => {
  const { elements } = JSON.parse(await readFile(filePath, 'utf8'));
  return elements.flatMap((element) => {
    stats.read += 1;
    const tags = element.tags ?? {};
    const kind = kindFromOsm(tags);
    const name = tags['name:vi'] ?? tags.name;
    const coordinates = osmCoordinates(element);
    if (!kind || !coordinates) return [];
    if (isJunkName(name)) { stats.junk += 1; return []; }

    stats.kept += 1;
    const extraTags = [];
    if (tags.outdoor_seating === 'yes') extraTags.push('ngoai-troi');
    if (tags.air_conditioning === 'yes') extraTags.push('may-lanh');
    return [{
      source: PLACE_SOURCES.OSM,
      source_ref: `osm:${element.type}/${element.id}`,
      osm_ref: `osm:${element.type}/${element.id}`,
      name: name.trim(),
      coordinates,
      kind,
      category: KINDS[kind].category,
      address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
      district: normalizeDistrict(tags['addr:district']),
      confidence: OSM_CONFIDENCE,
      hours: parseOsmOpeningHours(tags.opening_hours),
      cuisines: cuisinesFromOsm(tags.cuisine),
      extraTags,
      contact: {
        phone: tags.phone ?? tags['contact:phone'] ?? null,
        website: tags.website ?? tags['contact:website'] ?? null,
        facebook: tags['contact:facebook'] ?? null,
      },
    }];
  });
};
