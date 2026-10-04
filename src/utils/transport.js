import {
  BUS_DISTANCE_BANDS_KM,
  BUS_FARE_PERIODS,
  BUS_MIN_KM,
  CUSTOM_VEHICLE,
  DEFAULT_CUSTOM_MODES,
  DEFAULT_VEHICLE,
  METRO_LINE_1,
  MIN_METRO_RIDE_KM,
  TRANSPORT_MODES,
  VEHICLES,
  VND_PER_MINUTE,
  WALK_MAX_LEG_KM,
  WALK_MAX_STATION_KM,
} from '../constants/transport.js';
import { haversineKm, roundTo } from './geo.js';

const MINUTES_PER_HOUR = 60;
const ROAD_DETOUR_FACTOR = 1.3; // đường đi thực tế dài hơn đường chim bay ~30% trong nội đô
const FARE_ROUNDING = 500;
const ACCESS_MODES = ['walk', 'bus', 'grab_bike', 'grab_car']; // cách tới / rời ga metro

const roundFare = (amount) => Math.round(amount / FARE_ROUNDING) * FARE_ROUNDING;
const rideMinutes = (distanceKm, mode) => (distanceKm / TRANSPORT_MODES[mode].speedKmh) * MINUTES_PER_HOUR;
const roadDistanceKm = (from, to) => haversineKm(from, to) * ROAD_DETOUR_FACTOR;

// Danh sách phương tiện được phép dùng cho 1 chuyến, từ lựa chọn trên bộ lọc.
export const resolveModes = (vehicle = DEFAULT_VEHICLE, customModes = []) => {
  if (vehicle === CUSTOM_VEHICLE) return ['walk', ...(customModes.length ? customModes : DEFAULT_CUSTOM_MODES)];
  return (VEHICLES.find((item) => item.value === vehicle) ?? VEHICLES.find((item) => item.value === DEFAULT_VEHICLE)).modes;
};

// ── Giá vé / cước (đ / người) ──

export const getBusFare = (distanceKm, date = new Date()) => {
  const today = date.toISOString().slice(0, 10);
  const { fares } = BUS_FARE_PERIODS.find((period) => today >= period.from) ?? BUS_FARE_PERIODS.at(-1);
  const band = BUS_DISTANCE_BANDS_KM.findIndex((limit) => distanceKm < limit);
  return fares[band === -1 ? fares.length - 1 : band];
};

// Ước tính theo quãng đường trong khung 7.000–20.000đ (giá tiền mặt): 7.000đ cho 7 km đầu, sau đó ~1.000đ/km.
export const getMetroFare = (rideKm) => {
  const { min, max, flatUntilKm, perKm } = METRO_LINE_1.fare;
  return rideKm <= flatUntilKm ? min : Math.min(max, Math.ceil(rideKm) * perKm);
};

const getGrabFare = (distanceKm, mode, people) => {
  const { baseFare, baseKm, perKm, platformFee, seats } = TRANSPORT_MODES[mode];
  const perVehicle = baseFare + Math.max(0, distanceKm - baseKm) * perKm + platformFee;
  return (perVehicle * Math.ceil(people / seats)) / people; // chia đều cho cả nhóm
};

const getOwnVehicleCost = (distanceKm, mode, people) => {
  const { fuelPerKm, parkingPerStop, seats } = TRANSPORT_MODES[mode];
  return ((distanceKm * fuelPerKm + parkingPerStop) * Math.ceil(people / seats)) / people; // xăng + gửi xe ở điểm đến
};

// ── Các phương án cho 1 chặng ──

const segment = (mode, distanceKm, minutes, cost, label) => ({
  mode,
  label: label ?? TRANSPORT_MODES[mode].label,
  emoji: TRANSPORT_MODES[mode].emoji,
  distance_km: roundTo(distanceKm, 2),
  minutes: Math.max(1, Math.round(minutes)),
  cost_per_person: roundFare(cost),
});

const directSegment = (mode, distanceKm, { people, date }) => {
  const { waitMinutes, accessMinutes = 0 } = TRANSPORT_MODES[mode];
  const minutes = waitMinutes + accessMinutes + rideMinutes(distanceKm, mode);
  if (mode === 'walk') return segment(mode, distanceKm, minutes, 0);
  if (mode === 'bus') return segment(mode, distanceKm, minutes, getBusFare(distanceKm, date));
  if (mode.startsWith('grab')) return segment(mode, distanceKm, minutes, getGrabFare(distanceKm, mode, people));
  return segment(mode, distanceKm, minutes, getOwnVehicleCost(distanceKm, mode, people));
};

const isDirectModeUsable = (mode, distanceKm, modes) => {
  if (mode === 'metro') return false;
  if (mode === 'walk') return distanceKm <= WALK_MAX_LEG_KM || modes.length === 1;
  if (mode === 'bus') return distanceKm >= BUS_MIN_KM;
  return true;
};

const toOption = (segments, label) => ({
  segments,
  label,
  minutes: segments.reduce((sum, item) => sum + item.minutes, 0),
  cost: segments.reduce((sum, item) => sum + item.cost_per_person, 0),
  distanceKm: segments.reduce((sum, item) => sum + item.distance_km, 0),
});
const scoreOf = (option) => option.minutes + option.cost / VND_PER_MINUTE;
const pickBest = (options) => options.reduce((best, option) => (scoreOf(option) < scoreOf(best) ? option : best));

const nearestStation = (point) =>
  METRO_LINE_1.stations.reduce((best, station) =>
    haversineKm(point, [station.lng, station.lat]) < haversineKm(point, [best.lng, best.lat]) ? station : best,
  );

// Chặng ngắn tới / rời ga: đi bộ nếu gần, không thì xe buýt / Grab (nếu được phép).
const accessSegment = (point, station, modes, context) => {
  const distanceKm = roadDistanceKm(point, [station.lng, station.lat]);
  const usable = ACCESS_MODES.filter((mode) => modes.includes(mode)).filter((mode) =>
    mode === 'walk' ? distanceKm <= WALK_MAX_STATION_KM : isDirectModeUsable(mode, distanceKm, modes),
  );
  if (usable.length === 0) return null;
  return pickBest(usable.map((mode) => toOption([directSegment(mode, distanceKm, context)]))).segments[0];
};

const metroOption = (from, to, modes, context) => {
  const boarding = nearestStation(from);
  const alighting = nearestStation(to);
  const rideKm = Math.abs(boarding.km - alighting.km);
  if (rideKm < MIN_METRO_RIDE_KM) return null;

  const access = accessSegment(from, boarding, modes, context);
  const egress = accessSegment(to, alighting, modes, context);
  if (!access || !egress) return null;

  const { waitMinutes, stationMinutes } = TRANSPORT_MODES.metro;
  const ride = segment('metro', rideKm, waitMinutes + stationMinutes + rideMinutes(rideKm, 'metro'), getMetroFare(rideKm), `Metro ${boarding.name} → ${alighting.name}`);
  return toOption([access, ride, egress], ride.label);
};

/**
 * Lên phương án di chuyển cho 1 chặng A → B với các phương tiện được phép: so sánh đi thẳng (đi bộ, buýt, Grab, xe riêng)
 * và đi metro (kèm chặng tới/rời ga), chọn phương án tốt nhất theo thời gian + chi phí.
 * 👉 Điểm thay thế khi tích hợp Goong Directions / Distance Matrix: giữ nguyên kiểu trả về.
 * @returns {{ mode, label, emoji, minutes, distanceKm, costPerPerson, segments }}
 */
export const planLeg = (from, to, { modes, people = 1, date = new Date() }) => {
  const distanceKm = roadDistanceKm(from, to);
  const context = { people, date };

  const options = modes
    .filter((mode) => isDirectModeUsable(mode, distanceKm, modes))
    .map((mode) => toOption([directSegment(mode, distanceKm, context)]));
  if (modes.includes('metro')) {
    const metro = metroOption(from, to, modes, context);
    if (metro) options.push(metro);
  }
  // Không phương tiện nào dùng được (VD chỉ chọn metro nhưng ở xa ga) => đành đi bộ.
  const best = options.length ? pickBest(options) : toOption([directSegment('walk', distanceKm, context)]);

  const main = best.segments.reduce((longest, item) => (item.distance_km > longest.distance_km ? item : longest));
  return {
    mode: main.mode,
    label: best.label ?? main.label,
    emoji: main.emoji,
    minutes: best.minutes,
    distanceKm: roundTo(best.distanceKm),
    costPerPerson: best.cost,
    segments: best.segments,
  };
};

// Đi giữa 2 điểm trong CÙNG 1 mall (ăn ở tầng 3 rồi xuống tầng 1 uống trà sữa): đi bộ vài phút, 0đ, không gửi xe lại.
export const insideVenueLeg = (venueName, minutes) => {
  const item = { ...segment('walk', 0, minutes, 0), label: `Đi bộ trong ${venueName}` };
  return { mode: 'walk', label: item.label, emoji: item.emoji, minutes: item.minutes, distanceKm: 0, costPerPerson: 0, segments: [item] };
};
