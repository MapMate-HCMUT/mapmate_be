// Gắn các điểm bên trong mall vào mall (Place.parent_place_id) — chạy sau mỗi lần nhập dữ liệu.
// Quy tắc (không cần người kiểm tra từng quán):
//   1. Địa chỉ / tên ghi tên mall ("Tầng 3 Vincom Center...") + cách mall ≤ 250 m  => chắc chắn ở trong
//   1b. Cùng số nhà + tên đường với mall ("72 Lê Thánh Tôn") + cách ≤ 150 m
//   2. Địa chỉ có "Tầng / Lầu / L3 / B1 / Kiosk..." + cách mall ≤ 40 m             => gần như chắc chắn
//   3. Nhiều bản ghi cùng 1 mall (cùng thương hiệu, cách ≤ 150 m) => gộp làm 1, bản phụ trỏ về bản chính
// Nhập lại nhiều lần được: tính lại toàn bộ, gỡ liên kết cũ không còn đúng.
import { INSIDE_BUILDING_ADDRESS, VENUE_LINK } from '../../constants/venues.js';
import { PLACE_STATUS } from '../../constants/places.js';
import Place from '../../models/Place.model.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { addressHasStreet, isMall, mallBrandOf, streetKeyOf } from '../../utils/venue.js';

const METERS_PER_KM = 1000;
const EARTH_RADIUS_M = 6378100;
const distanceM = (a, b) => haversineKm(a.location.coordinates, b.location.coordinates) * METERS_PER_KM;

// Mall chính: mỗi nhóm trùng giữ bản có nhiều đánh giá nhất
const pickMainMalls = (malls) => {
  const sorted = [...malls].sort((a, b) => (b.review_count ?? 0) - (a.review_count ?? 0));
  const main = [];
  const duplicates = new Map(); // id bản phụ -> mall chính
  for (const mall of sorted) {
    const same = main.find((kept) => mallBrandOf(kept.name) === mallBrandOf(mall.name) && distanceM(kept, mall) <= VENUE_LINK.DUPLICATE_DISTANCE_M);
    if (same) duplicates.set(String(mall._id), same);
    else main.push(mall);
  }
  return { main, duplicates };
};

const insideMall = (place, mall) => {
  const distance = distanceM(place, mall);
  const brand = mallBrandOf(mall.name);
  const text = normalizeSearchText(`${place.name} ${place.address ?? ''}`);
  if (brand && text.includes(brand) && distance <= VENUE_LINK.BRAND_DISTANCE_M) return distance;
  if (addressHasStreet(place.address, streetKeyOf(mall.address)) && distance <= VENUE_LINK.STREET_DISTANCE_M) return distance; // cùng số nhà + đường
  if (distance <= VENUE_LINK.INSIDE_DISTANCE_M && INSIDE_BUILDING_ADDRESS.test(normalizeSearchText(place.address ?? ''))) return distance;
  return null;
};

/** Tính liên kết (không ghi DB) => { main: mall chính[], duplicates, links: Map<id điểm, { mall, distance }> } */
export const collectVenueLinks = async () => {
  const fields = { name: 1, address: 1, category: 1, kind: 1, location: 1, review_count: 1, parent_place_id: 1 };
  const shopping = await Place.find({ category: 'shopping', status: { $ne: PLACE_STATUS.CLOSED } }, fields).lean();
  const { main, duplicates } = pickMainMalls(shopping.filter((place) => isMall({ ...place, parent_place_id: null })));

  const links = new Map([...duplicates].map(([id, mall]) => [id, { mall, distance: 0 }])); // id điểm -> mall gần nhất thoả quy tắc
  for (const mall of main) {
    const nearby = await Place.find(
      {
        _id: { $ne: mall._id },
        category: { $in: VENUE_LINK.CHILD_CATEGORIES },
        location: { $geoWithin: { $centerSphere: [mall.location.coordinates, VENUE_LINK.BRAND_DISTANCE_M / EARTH_RADIUS_M] } },
      },
      fields,
    ).lean();
    for (const place of nearby) {
      if (main.some((other) => String(other._id) === String(place._id))) continue; // mall khác đứng sát bên
      const distance = insideMall(place, mall);
      const current = links.get(String(place._id));
      if (distance != null && (!current || distance < current.distance)) links.set(String(place._id), { mall, distance });
    }
  }

  return { main, duplicates, links };
};

/** @returns {{ malls, duplicates, linked, unlinked, by_mall }} */
export const linkVenues = async ({ dryRun = false } = {}) => {
  const { main, duplicates, links } = await collectVenueLinks();
  const byMall = main.map((mall) => ({ name: mall.name, address: mall.address, count: [...links.values()].filter((link) => link.mall === mall).length }));
  const stale = await Place.countDocuments({ parent_place_id: { $ne: null }, _id: { $nin: [...links.keys()] } });
  if (!dryRun) {
    await Place.updateMany({ parent_place_id: { $ne: null }, _id: { $nin: [...links.keys()] } }, { $set: { parent_place_id: null, parent_place_name: null } });
    await Place.bulkWrite(
      [...links].map(([id, { mall }]) => ({ updateOne: { filter: { _id: id }, update: { $set: { parent_place_id: mall._id, parent_place_name: mall.name } } } })),
      { ordered: false },
    );
  }
  return { malls: main.length, duplicates: duplicates.size, linked: links.size - duplicates.size, unlinked: stale, by_mall: byMall };
};
