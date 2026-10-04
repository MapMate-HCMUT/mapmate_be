// Gán quận cho địa điểm thiếu địa chỉ (chuẩn hoá tên quận nằm ở utils/district.js, dùng chung với AI Planner).
import { DISTRICT_MAX_DISTANCE_M, DISTRICT_NEIGHBORS } from '../../constants/openData.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeDistrict } from '../../utils/district.js';
import { SpatialGrid } from './spatialGrid.js';

export { normalizeDistrict };

const METERS_PER_KM = 1000;
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
