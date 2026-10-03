// Chuẩn hoá tên quận/huyện về cùng 1 kiểu với dữ liệu MapMate: "Quận 1", "Tân Bình", "Thủ Đức", "Hóc Môn".
// Lưu ý: từ 01/07/2025 cấp quận đã bị bỏ trong địa giới hành chính, nhưng người dùng + dữ liệu bản đồ vẫn dùng tên quận.
import { DISTRICT_MAX_DISTANCE_M, DISTRICT_NEIGHBORS } from '../../constants/openData.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { SpatialGrid } from './spatialGrid.js';

const METERS_PER_KM = 1000;
const NUMBERED_DISTRICTS = [1, 3, 4, 5, 6, 7, 8, 10, 11, 12]; // Q2 + Q9 + Thủ Đức cũ đã gộp thành TP Thủ Đức (2021)
const NAMED_DISTRICTS = [
  'Thủ Đức', 'Bình Thạnh', 'Tân Bình', 'Tân Phú', 'Gò Vấp', 'Phú Nhuận', 'Bình Tân',
  'Hóc Môn', 'Bình Chánh', 'Nhà Bè', 'Củ Chi', 'Cần Giờ',
  'Dĩ An', 'Thuận An', 'Thủ Dầu Một', 'Biên Hòa', 'Nhơn Trạch', // giáp ranh, nằm trong khung toạ độ
];
// Khoá không dấu -> tên chuẩn. "binh thanh" / "Bình thạnh" / "Binh Thanh district" đều ra "Bình Thạnh".
const CANONICAL = new Map([
  ...NUMBERED_DISTRICTS.map((number) => [`quan ${number}`, `Quận ${number}`]),
  ...NAMED_DISTRICTS.map((name) => [normalizeSearchText(name), name]),
  ['quan 2', 'Thủ Đức'], ['quan 9', 'Thủ Đức'], ['binh chanh', 'Bình Chánh'],
]);
const PREFIX = /^(thanh pho|tp\.?|quan|huyen|thi xa|district|d|q\.?)\s*/;
const SUFFIX = /\s+(district|city|town)$/;

// Không nhận ra (phường, mã bưu chính, tên tỉnh khác do dữ liệu nguồn sai...) => null để đoán theo vị trí.
export const normalizeDistrict = (raw) => {
  if (!raw) return null;
  const plain = normalizeSearchText(raw).replace(/[^a-z0-9 .]/g, ' ').replace(/\s+/g, ' ').trim().replace(SUFFIX, '');
  if (CANONICAL.has(plain)) return CANONICAL.get(plain);
  const stripped = plain.replace(PREFIX, '').trim();
  if (/^\d{1,2}$/.test(stripped)) return CANONICAL.get(`quan ${Number(stripped)}`) ?? null;
  return CANONICAL.get(stripped) ?? null;
};

/**
 * Gán quận cho địa điểm thiếu / sai địa chỉ: bỏ phiếu theo các địa điểm gần nhất đã biết quận.
 * Chính xác ở trong lòng quận; sát ranh giới 2 quận có thể lệch.
 */
export const createDistrictInferer = (knownPlaces) => {
  const grid = new SpatialGrid(DISTRICT_MAX_DISTANCE_M);
  knownPlaces.forEach((place) => grid.add(place.coordinates, place.district));

  return (coordinates) => {
    const neighbors = grid
      .nearby(coordinates)
      .map(({ coordinates: other, value }) => ({ value, meters: haversineKm(coordinates, other) * METERS_PER_KM }))
      .filter((item) => item.meters <= DISTRICT_MAX_DISTANCE_M)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, DISTRICT_NEIGHBORS);
    if (neighbors.length === 0) return null;
    const votes = Map.groupBy(neighbors, (item) => item.value);
    return [...votes.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  };
};
