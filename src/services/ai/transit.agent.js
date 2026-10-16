// Agent xe buýt / metro — chuyến đi bằng phương tiện công cộng: thay thời gian ƯỚC LƯỢNG (15 km/h, chờ 8′) bằng tuyến THẬT
// từ dữ liệu buýt / metro TP.HCM đã nhập (services/transit — tìm đường trong bộ nhớ, không gọi mạng, không gọi LLM).
// Mỗi chặng lấy phương án tốt nhất của bộ tìm đường ("Đi bộ 300 m → Buýt 19 · Bến Thành → Chợ Lớn → Đi bộ 150 m"),
// rồi dựng lại giờ đến từng điểm theo thời gian thật của chặng đó.
import { TRANSPORT_MODES } from '../../constants/transport.js';
import { roundTo } from '../../utils/geo.js';
import { usesPublicTransit } from '../../utils/transport.js';
import { sameVenue } from '../../utils/venue.js';
import { buildPlan, legKey, toPlanInput } from '../itineraryPlanner.service.js';
import { getPlacesByIds } from '../place.service.js';
import { getNetwork } from '../transit/transitNetwork.js';
import { planTransit } from '../transit/transitPlanner.js';
import { toMinutes } from '../tripComposer.js';

const METERS_PER_KM = 1000;
const VN_OFFSET = '+07:00';
const RIDE_MODE = 'grab_bike';

const segment = (mode, label, minutes, meters, cost) => ({
  mode,
  label,
  emoji: TRANSPORT_MODES[mode].emoji,
  distance_km: roundTo(meters / METERS_PER_KM, 2),
  minutes: Math.max(1, Math.round(minutes)),
  cost_per_person: cost ?? 0,
});

// 1 phương án của bộ tìm đường => khuôn "chặng đi" của lộ trình (giao diện hiện sẵn: "Đến bằng: Đi bộ 4′ → Buýt 19 … 12′")
const toTravel = (option) => {
  const segments = option.legs.map((leg) => {
    if (leg.route) {
      const name = leg.mode === 'metro' ? 'Metro' : 'Buýt';
      return segment(leg.mode === 'metro' ? 'metro' : 'bus', `${name} ${leg.route.number} · ${leg.from.name} → ${leg.to.name}`, leg.duration_min, leg.distance_m, leg.cost_vnd);
    }
    if (leg.mode === 'ride') return segment(RIDE_MODE, 'Gọi xe máy', leg.duration_min, leg.distance_m, leg.cost_vnd);
    return segment('walk', `Đi bộ ${leg.distance_m} m`, leg.duration_min, leg.distance_m, 0);
  });
  const main = segments.find((item) => item.mode === 'bus' || item.mode === 'metro') ?? segments.reduce((longest, item) => (item.distance_km > longest.distance_km ? item : longest), segments[0]);
  return {
    mode: main.mode,
    label: option.kind === 'transit' ? `Tuyến ${option.title}` : main.label,
    emoji: main.emoji,
    minutes: Math.max(1, Math.round(option.duration_min)),
    distanceKm: roundTo(segments.reduce((sum, item) => sum + item.distance_km, 0)),
    costPerPerson: segments.reduce((sum, item) => sum + item.cost_per_person, 0),
    segments,
    // Agent kiểm tra dùng: chặng này có tuyến thật không, xe chạy lúc mấy giờ
    transit: { kind: option.kind, routes: option.legs.filter((leg) => leg.route).map((leg) => leg.route.number), departure_times: option.legs.filter((leg) => leg.departure_time).map((leg) => leg.departure_time), walk_m: option.walk_m, transfers: option.transfers },
  };
};

// Ngày đi (giờ Việt Nam) + "HH:mm" => Date; qua nửa đêm thì sang ngày hôm sau
const departureAt = (date, startTime, time) => {
  const base = new Date(`${date}T${time}:00${VN_OFFSET}`);
  return toMinutes(time) < toMinutes(startTime) ? new Date(base.getTime() + 24 * 60 * 60 * 1000) : base;
};

/**
 * Dựng lại 1 lộ trình với chặng đi bằng tuyến thật.
 * @returns {{ option, legs: number, transitLegs: number }} — option giữ nguyên các trường khác (key, nhãn, ghi chú...)
 */
const withRealTransit = async (option, { criteria, date, network, stayOverrides = {} }) => {
  const places = await getPlacesByIds(option.place_ids);
  const planInput = toPlanInput(criteria);
  const overrides = new Map();
  let from = [criteria.origin.lng, criteria.origin.lat];
  let transitLegs = 0;
  option.stops.forEach((_stop, index) => {
    const place = places[index];
    const previous = places[index - 1] ?? null;
    // Đi trong cùng 1 mall thì bộ dựng lịch tự tính đi bộ trong mall
    if (previous && sameVenue(previous, place)) {
      from = place.location.coordinates;
      return;
    }
    // Xe chạy theo giờ: chặng này khởi hành khi rời điểm trước (theo lịch hiện tại)
    const leaveAt = index === 0 ? option.summary.start_time : addStay(option.stops[index - 1]);
    const plan = planTransit(network, { from, to: place.location.coordinates, departAt: departureAt(date, option.summary.start_time, leaveAt) });
    const best = plan.options[0];
    if (best?.legs.length) {
      overrides.set(legKey(previous, place), toTravel(best));
      if (best.kind === 'transit') transitLegs += 1;
    }
    from = place.location.coordinates;
  });
  // Giữ đúng thời gian ở lại đã có (người dùng tự chỉnh hoặc bộ lên lịch đã kéo dài cho khớp giờ ăn)
  const stays = { ...Object.fromEntries(option.stops.map((stop) => [String(stop.place.id), stop.stay_minutes])), ...stayOverrides };
  const rebuilt = buildPlan(places, { ...planInput, fillDuration: false, legOverrides: overrides }, { targetMeals: option.stops.map((stop) => stop.meal), stayOverrides: stays });
  rebuilt.stops.forEach((stop, index) => {
    stop.stay_locked = option.stops[index].stay_locked; // khoá thời gian chỉ để dựng lại, không phải người dùng chỉnh
  });
  rebuilt.summary.issues = option.summary.issues ?? [];
  return { option: { ...option, ...rebuilt }, legs: option.stops.length, transitLegs };
};

const addStay = (stop) => {
  const minutes = toMinutes(stop.arrival_time) + stop.stay_minutes;
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

/**
 * Áp tuyến thật cho mọi phương án (chỉ khi chuyến đi dùng buýt / metro).
 * @param {{ options, criteria, date: 'YYYY-MM-DD', stayOverrides? }} input
 * @returns {{ options, trace: { status, detail } }}
 */
export const planWithRealTransit = async ({ options, criteria, date, stayOverrides = {} }) => {
  if (!options.length || !usesPublicTransit(criteria)) return { options, trace: { status: 'empty', detail: { applied: false } } };
  try {
    const network = await getNetwork();
    const results = await Promise.all(options.map((option) => withRealTransit(option, { criteria, date, network, stayOverrides })));
    return {
      options: results.map((result) => result.option),
      trace: { status: 'ok', detail: { applied: true, legs: results.reduce((sum, item) => sum + item.legs, 0), transit_legs: results.reduce((sum, item) => sum + item.transitLegs, 0) } },
    };
  } catch (error) {
    // Chưa nhập dữ liệu buýt / lỗi bất ngờ => giữ thời gian ước lượng, không làm hỏng câu trả lời
    return { options, trace: { status: 'fallback', detail: { applied: false }, error: error.message } };
  }
};
