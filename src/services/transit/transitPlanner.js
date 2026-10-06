// Tìm cách đi A -> B bằng phương tiện công cộng (xe buýt, Metro, buýt đường sông): đi thẳng 1 tuyến hoặc đổi tuyến 1 lần.
// Ra / rời trạm: đi bộ hoặc gọi xe (Grab / Be...) tuỳ người dùng chọn. Luôn so cùng phương án đi bộ cả chặng và gọi xe đi thẳng,
// xếp hạng theo ưu tiên (nhanh nhất / ít đi bộ / rẻ nhất) => phương án đầu tiên là gợi ý.
// Giờ chờ tính theo giờ xuất bến thật (không có thì theo giãn cách / 2). Hàm thuần trên `network` (có test).
import { TRANSIT_MODES, TRANSIT_PLANNER } from '../../constants/transit.js';
import { getBusFare, getGrabFare, getMetroFare } from '../../utils/transport.js';
import { metersBetween, minutesToTime, slicePath } from './transitGeometry.js';
import { stopsNear, transferStops } from './transitNetwork.js';

const P = TRANSIT_PLANNER;
const MINUTES_PER_HOUR = 60;
const MODE_SPEED_KMH = { bus: 15, metro: 35, waterbus: 15 }; // khi lượt không có thời gian chạy
const UNKNOWN_FARE_VND = 7000;
const FARE_ROUNDING = 500;
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Giờ Việt Nam: { minutes trong ngày, day: 'T2'..'CN' } */
export const localTime = (date) => {
  const parts = Object.fromEntries(clock.formatToParts(date).map((part) => [part.type, part.value]));
  return { minutes: Number(parts.hour) * 60 + Number(parts.minute), day: WEEKDAYS[WEEKDAY_INDEX[parts.weekday]] };
};

const walkMinutes = (meters) => (meters / 1000 / P.WALK_SPEED_KMH) * MINUTES_PER_HOUR;
const roadMeters = (from, to) => metersBetween(from, to) * P.ROAD_DETOUR;
const roundMin = (value) => Math.max(1, Math.round(value));

// ── Chặng ra / rời trạm ──
const rideLeg = (from, to, meters) => ({
  mode: 'ride',
  meters,
  minutes: P.RIDE.waitMinutes + (meters / 1000 / P.RIDE.speedKmh) * MINUTES_PER_HOUR,
  cost: Math.round(getGrabFare(meters / 1000, P.RIDE.mode, 1) / FARE_ROUNDING) * FARE_ROUNDING,
  from,
  to,
});
const walkLeg = (from, to, meters) => ({ mode: 'walk', meters, minutes: walkMinutes(meters), cost: 0, from, to });

/** Cách ra trạm theo lựa chọn: walk = chỉ đi bộ; ride = gọi xe (trừ đoạn rất ngắn); auto = gần đi bộ, xa gọi xe */
const connectorLeg = (from, to, meters, { connector, maxWalkM }) => {
  if (connector === 'walk') return meters <= maxWalkM ? walkLeg(from, to, meters) : null;
  if (meters <= (connector === 'ride' ? P.RIDE_SHORT_WALK_M : maxWalkM)) return walkLeg(from, to, meters);
  return meters <= P.MAX_RIDE_ACCESS_M ? rideLeg(from, to, meters) : null;
};

// Trạm xuất phát / đích: trạm gần nhất + mọi ga metro / bến buýt sông trong tầm gọi xe (ga xa vẫn có thể đáng đi)
const endpointStops = (network, point, prefs) => {
  const radius = prefs.connector === 'walk' ? prefs.maxWalkM : P.MAX_RIDE_ACCESS_M;
  const near = stopsNear(network, point, radius, P.NEAREST_STOPS);
  const seen = new Set(near.map((item) => item.id));
  const stations = stopsNear(network, point, radius).filter(
    (item) => !seen.has(item.id) && network.stopPatterns.get(item.id).some(({ p }) => network.patterns[p].mode !== TRANSIT_MODES.BUS),
  );
  return [...near, ...stations];
};

/**
 * Trạm đầu / cuối theo từng pattern: p -> [{ pos, leg }]. Tuyến đã có trạm đi bộ tới được thì không gọi xe tới trạm khác của
 * chính tuyến đó (tránh "gọi xe 3 km ra trạm xa rồi đi buýt 1 trạm" trong khi trạm cùng tuyến ở ngay cạnh).
 */
const connectorsByPattern = (network, stops, makeLeg) => {
  const byPattern = new Map();
  for (const { id, meters } of stops) {
    const leg = makeLeg(stopPoint(network, id), meters * P.ROAD_DETOUR);
    if (!leg) continue;
    for (const { p, pos } of network.stopPatterns.get(id)) {
      if (!byPattern.has(p)) byPattern.set(p, []);
      byPattern.get(p).push({ pos, leg });
    }
  }
  for (const [p, entries] of byPattern) {
    if (entries.some((entry) => entry.leg.mode === 'walk')) byPattern.set(p, entries.filter((entry) => entry.leg.mode === 'walk'));
  }
  return byPattern;
};

// ── Thời gian trên tuyến ──
const rideMinutesBetween = (pattern, i, j) => {
  const meters = pattern.offsets[j] - pattern.offsets[i];
  return pattern.runningMin ? (meters / pattern.distance) * pattern.runningMin : (meters / 1000 / MODE_SPEED_KMH[pattern.mode]) * MINUTES_PER_HOUR;
};
const offsetMinutes = (pattern, pos) => rideMinutesBetween(pattern, 0, pos);

const lowerBound = (sorted, value) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Chuyến kế tiếp qua trạm thứ `pos` khi tới trạm lúc `arrival` (phút trong ngày).
 * @returns {{ wait, scheduled, headway } | null} null = hết chuyến / chờ quá lâu
 */
export const nextDeparture = (pattern, pos, arrival, day) => {
  const offset = offsetMinutes(pattern, pos);
  const timetable = pattern.timetables.find((tt) => tt.days.has(day)) ?? pattern.timetables[0];
  const headway = timetable?.headwayMin ?? pattern.headwayMin ?? P.DEFAULT_HEADWAY_MIN;
  if (timetable) {
    const index = lowerBound(timetable.departures, arrival - offset);
    if (index >= timetable.departures.length) return null;
    const wait = timetable.departures[index] + offset - arrival;
    return wait <= P.SEARCH_HORIZON_MIN ? { wait, scheduled: true, headway } : null;
  }
  if (pattern.operation) {
    const [start, end] = pattern.operation;
    if (arrival > end + offset) return null;
    if (arrival < start + offset) return start + offset - arrival <= P.SEARCH_HORIZON_MIN ? { wait: start + offset - arrival, scheduled: false, headway } : null;
  }
  return { wait: headway / 2, scheduled: false, headway };
};

// ── Giá vé ──
const ticketPrice = (pattern) => {
  const line = pattern.tickets.find((text) => /vé lượt/i.test(text) && !/HSSV|học sinh/i.test(text));
  const amount = line?.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:VNĐ|đ)/i)?.[1];
  return amount ? Number(amount.replace(/[.,]/g, '')) : null;
};
const fareOf = (pattern, meters, date) => {
  if (pattern.mode === TRANSIT_MODES.METRO) return getMetroFare(meters / 1000);
  if (pattern.mode === TRANSIT_MODES.BUS && /có trợ giá/i.test(pattern.type ?? '')) return getBusFare(meters / 1000, date);
  return ticketPrice(pattern);
};

// ── Ghép 1 phương án: [ra trạm] -> tuyến 1 -> [đi bộ đổi trạm] -> tuyến 2 -> [rời trạm] ──
const evaluate = (network, context, access, rides, egress) => {
  const { start, day } = context;
  let time = start + access.minutes;
  const legs = [{ ...access, startAt: start }];
  for (const [index, ride] of rides.entries()) {
    if (index > 0 && ride.transferWalk) {
      legs.push({ ...ride.transferWalk, startAt: time });
      time += ride.transferWalk.minutes;
    }
    const pattern = network.patterns[ride.p];
    const station = P.STATION_MINUTES[pattern.mode] ?? 0;
    const departure = nextDeparture(pattern, ride.i, time + station, day);
    if (!departure) return null;
    const minutes = rideMinutesBetween(pattern, ride.i, ride.j);
    legs.push({ mode: pattern.mode, p: ride.p, i: ride.i, j: ride.j, startAt: time, wait: departure.wait + station, scheduled: departure.scheduled, headway: departure.headway, minutes, station });
    time += station + departure.wait + minutes + station;
  }
  legs.push({ ...egress, startAt: time });
  time += egress.minutes;
  return { legs, arrive: time };
};

const summarize = (network, candidate, context) => {
  const transitLegs = candidate.legs.filter((leg) => leg.p != null);
  const walkM = candidate.legs.filter((leg) => leg.mode === 'walk').reduce((sum, leg) => sum + leg.meters, 0);
  const walkMin = candidate.legs.filter((leg) => leg.mode === 'walk').reduce((sum, leg) => sum + leg.minutes, 0);
  const fares = transitLegs.map((leg) => fareOf(network.patterns[leg.p], network.patterns[leg.p].offsets[leg.j] - network.patterns[leg.p].offsets[leg.i], context.date));
  const rideCost = candidate.legs.filter((leg) => leg.mode === 'ride').reduce((sum, leg) => sum + leg.cost, 0);
  const cost = fares.some((fare) => fare == null) ? null : fares.reduce((sum, fare) => sum + fare, 0) + rideCost;
  const duration = candidate.arrive - context.start;
  const weights = P.PRIORITIES[context.prefs.priority];
  const comparableCost = cost ?? rideCost + UNKNOWN_FARE_VND; // tuyến chưa rõ giá vé => coi như 1 vé thường
  const score =
    duration + transitLegs.length * P.BOARDING_PENALTY_MIN + Math.max(0, transitLegs.length - 1) * P.TRANSFER_PENALTY_MIN + walkMin * weights.walk + (comparableCost / P.VND_PER_COST_UNIT) * weights.cost;
  return { ...candidate, walkM, duration, cost, fares, score, transfers: Math.max(0, transitLegs.length - 1) };
};

// ── Định dạng trả về cho giao diện ──
const point = (name, coordinates, extra = {}) => ({ name, coordinates, ...extra });
const stopPoint = (network, id) => {
  const stop = network.stops.get(id);
  return point(stop.name, stop.coord, { stop_id: id, code: stop.code });
};
const formatLeg = (network, leg, context, fare) => {
  const base = { start_time: minutesToTime(leg.startAt) };
  if (leg.p == null) {
    return {
      ...base,
      mode: leg.mode,
      from: leg.from,
      to: leg.to,
      distance_m: Math.round(leg.meters),
      duration_min: roundMin(leg.minutes),
      cost_vnd: leg.mode === 'ride' ? leg.cost : 0,
      geometry: [leg.from.coordinates, leg.to.coordinates],
    };
  }
  const pattern = network.patterns[leg.p];
  const board = stopPoint(network, pattern.stopIds[leg.i]);
  const alight = stopPoint(network, pattern.stopIds[leg.j]);
  const departAt = leg.startAt + leg.wait;
  return {
    ...base,
    mode: pattern.mode,
    route: { id: pattern.routeId, number: pattern.number, name: pattern.name, color: pattern.color, var_id: pattern.varId },
    headsign: pattern.headsign,
    from: board,
    to: alight,
    stops_count: leg.j - leg.i,
    stops: pattern.stopIds.slice(leg.i, leg.j + 1).map((id) => network.stops.get(id).name),
    wait_min: Math.round(leg.wait),
    departure_time: minutesToTime(departAt),
    departAt, // phút trong ngày (nội bộ, bỏ khi trả về)
    arrival_time: minutesToTime(departAt + leg.minutes),
    scheduled: leg.scheduled,
    headway_min: leg.headway ? Math.round(leg.headway) : null,
    distance_m: Math.round(pattern.offsets[leg.j] - pattern.offsets[leg.i]),
    duration_min: roundMin(leg.wait + leg.minutes + leg.station),
    cost_vnd: fare,
    geometry: slicePath(pattern.path, pattern.pathIndex[leg.i], pattern.pathIndex[leg.j], board.coordinates, alight.coordinates),
  };
};

// ── Gộp tuyến cùng trạm lên / xuống ──
const ridesOf = (candidate) => candidate.legs.filter((leg) => leg.p != null);
const stopPairKey = (network, candidate) =>
  ridesOf(candidate)
    .map((leg) => `${network.patterns[leg.p].stopIds[leg.i]}>${network.patterns[leg.p].stopIds[leg.j]}`)
    .join('|');

/** Các phương án đi cùng dãy trạm lên / xuống => 1 phương án đại diện (điểm tốt nhất) + `others` (tuyến thay thế) */
const groupBySameStops = (network, candidates) => {
  const groups = new Map();
  for (const candidate of [...candidates].sort((a, b) => a.score - b.score)) {
    const key = stopPairKey(network, candidate);
    if (groups.has(key)) groups.get(key).others.push(candidate);
    else groups.set(key, { ...candidate, others: [] });
  }
  return [...groups.values()];
};

/** Mỗi chặng xe của phương án gộp: các tuyến khác cũng đi được (số tuyến, màu, giờ xe qua trạm), xe sớm nhất trước */
const withAlternatives = (network, option, candidate) => {
  if (!candidate.others?.length) return option;
  let rideIndex = 0;
  const legs = option.legs.map((leg) => {
    if (!leg.route) return leg;
    const index = rideIndex++;
    const seen = new Set([leg.route.number]);
    const alternatives = candidate.others
      .map((other) => ridesOf(other)[index])
      // chỉ tuyến có xe tới không quá 20 phút sau xe của phương án chính (xe 1 tiếng nữa mới tới thì không đáng gộp)
      .filter((ride) => ride && ride.startAt + ride.wait <= leg.departAt + P.GROUP_MAX_EXTRA_WAIT_MIN)
      .filter((ride) => !seen.has(network.patterns[ride.p].number) && seen.add(network.patterns[ride.p].number))
      .map((ride) => {
        const pattern = network.patterns[ride.p];
        return {
          route: { id: pattern.routeId, number: pattern.number, name: pattern.name, color: pattern.color, var_id: pattern.varId },
          headsign: pattern.headsign,
          departure_time: minutesToTime(ride.startAt + ride.wait),
          wait_min: Math.round(ride.wait),
          scheduled: ride.scheduled,
        };
      })
      .sort((a, b) => a.wait_min - b.wait_min);
    return alternatives.length ? { ...leg, alternatives } : leg;
  });
  const title = legs
    .filter((leg) => leg.route)
    .map((leg) => [leg.route.number, ...(leg.alternatives ?? []).map((alt) => alt.route.number)].join(' / '))
    .join(' → ');
  return { ...option, title, legs: legs.map(({ departAt: _departAt, ...leg }) => leg) };
};

const formatOption = (network, candidate, context, kind) => {
  let fareIndex = 0;
  const legs = candidate.legs.filter((leg) => leg.p != null || leg.meters >= 20).map((leg) => formatLeg(network, leg, context, leg.p != null ? candidate.fares[fareIndex++] : null));
  const transit = legs.filter((leg) => leg.route);
  return {
    id: kind === 'transit' ? `transit:${transit.map((leg) => `${leg.from.stop_id}>${leg.to.stop_id}`).join('|')}` : kind,
    kind,
    title: kind === 'walk' ? 'Đi bộ' : kind === 'ride' ? 'Gọi xe máy (Grab / Be...)' : transit.map((leg) => leg.route.number).join(' → '),
    duration_min: roundMin(candidate.duration),
    depart_time: minutesToTime(context.start),
    arrive_time: minutesToTime(candidate.arrive),
    walk_m: Math.round(candidate.walkM),
    transfers: candidate.transfers ?? 0,
    cost_vnd: candidate.cost,
    uses_ride: legs.some((leg) => leg.mode === 'ride'),
    score: Math.round(candidate.score * 10) / 10,
    legs,
  };
};

/**
 * @param {object} network từ getNetwork()
 * @param {{ from: [lng, lat], to: [lng, lat], departAt?: Date, prefs?: { priority, connector, maxWalkM } }} request
 * @returns {{ options: object[], depart_time }}
 */
export const planTransit = (network, { from, to, departAt = new Date(), prefs: rawPrefs = {} }) => {
  const prefs = { priority: 'fastest', connector: 'auto', maxWalkM: P.MAX_WALK_ACCESS_M.DEFAULT, ...rawPrefs };
  const { minutes: start, day } = localTime(departAt);
  const context = { start, day, prefs, date: departAt };
  const origin = point('Điểm đi', from);
  const destination = point('Điểm đến', to);
  const directMeters = roadMeters(from, to);

  // Đầu trạm đích theo pattern: p -> [{ pos, egress }]
  const egressByPattern = connectorsByPattern(network, endpointStops(network, to, prefs), (stop, meters) => connectorLeg(stop, destination, meters, prefs));
  const accessByPattern = connectorsByPattern(network, endpointStops(network, from, prefs), (stop, meters) => connectorLeg(origin, stop, meters, prefs));
  const maxRideMeters = directMeters * P.MAX_RIDE_SHARE;

  const best = new Map(); // khoá = chuỗi tuyến => phương án tốt nhất
  const consider = (candidate) => {
    if (!candidate) return;
    // Gọi xe gần hết quãng đường thì gọi xe đi thẳng luôn cho rồi
    if (candidate.legs.filter((leg) => leg.mode === 'ride').reduce((sum, leg) => sum + leg.meters, 0) > maxRideMeters) return;
    const result = summarize(network, candidate, context);
    const key = result.legs.filter((leg) => leg.p != null).map((leg) => network.patterns[leg.p].number).join('>');
    if (!best.has(key) || best.get(key).score > result.score) best.set(key, result);
  };

  for (const [p1, starts] of accessByPattern) {
    for (const { pos: i, leg: access } of starts) {
      const pattern1 = network.patterns[p1];
      // Đi thẳng 1 tuyến
      for (const end of egressByPattern.get(p1) ?? []) {
        if (end.pos > i) consider(evaluate(network, context, access, [{ p: p1, i, j: end.pos }], end.leg));
      }
      // Đổi tuyến 1 lần ở trạm k của tuyến 1 (hoặc trạm gần đó)
      for (let k = i + 1; k < pattern1.stopIds.length; k += 1) {
        for (const near of transferStops(network, pattern1.stopIds[k])) {
          for (const { p: p2, pos: m } of network.stopPatterns.get(near.id)) {
            const pattern2 = network.patterns[p2];
            if (pattern2.routeId === pattern1.routeId) continue;
            const ends = egressByPattern.get(p2);
            if (!ends) continue;
            const transferWalk = near.meters > 0 ? walkLeg(stopPoint(network, pattern1.stopIds[k]), stopPoint(network, near.id), near.meters * P.ROAD_DETOUR) : null;
            for (const end of ends) {
              if (end.pos > m) consider(evaluate(network, context, access, [{ p: p1, i, j: k }, { p: p2, i: m, j: end.pos, transferWalk }], end.leg));
            }
          }
        }
      }
    }
  }

  // Gộp các tuyến lên / xuống cùng trạm thành 1 phương án (giống Google: "03 / 36 / 93"), rồi mới loại phương án thua hẳn
  const transit = withoutDominated(groupBySameStops(network, [...best.values()]))
    .sort((a, b) => a.score - b.score)
    .slice(0, P.MAX_TRANSIT_OPTIONS)
    .map((candidate) => withAlternatives(network, formatOption(network, candidate, context, 'transit'), candidate))
    .map((option) => ({ ...option, legs: option.legs.map(({ departAt: _departAt, ...leg }) => leg) }));
  // Không phải đi xe công cộng nào: so cùng gọi xe đi thẳng và đi bộ (nếu không quá xa)
  const alternatives = [];
  const ride = rideLeg(origin, destination, directMeters);
  alternatives.push(formatOption(network, summarize(network, { legs: [{ ...ride, startAt: start }], arrive: start + ride.minutes }, context), context, 'ride'));
  if (directMeters <= Math.max(P.WALK_ONLY_MAX_M, prefs.connector === 'walk' ? prefs.maxWalkM * 2 : 0)) {
    const walk = walkLeg(origin, destination, directMeters);
    alternatives.push(formatOption(network, summarize(network, { legs: [{ ...walk, startAt: start }], arrive: start + walk.minutes }, context), context, 'walk'));
  }
  // Chế độ công cộng: có tuyến thì tuyến (và đi bộ nếu gần) xếp trước; gọi xe đi thẳng chỉ là phương án dự phòng
  const rideOption = alternatives.find((option) => option.kind === 'ride');
  const ranked = [...transit, ...alternatives.filter((option) => option.kind !== 'ride')];
  // Bỏ phương án chậm quá xa so với phương án nhanh nhất (gấp đôi và hơn 20 phút) — VD vòng 98 phút cho chặng 800 m
  const quickest = Math.min(...ranked.map((option) => option.duration_min));
  const reasonable = ranked.filter((option) => option.duration_min <= Math.max(quickest * P.MAX_SLOWDOWN_FACTOR, quickest + P.MAX_SLOWDOWN_MIN));
  const options = transit.length ? [...reasonable.sort((a, b) => a.score - b.score), rideOption] : alternatives.sort((a, b) => a.score - b.score);
  tagOptions(options);
  return { depart_time: minutesToTime(start), direct_distance_m: Math.round(directMeters), options };
};

// Bỏ phương án thua hẳn 1 phương án khác ở mọi mặt (lâu hơn, đi bộ nhiều hơn, đổi tuyến nhiều hơn, không rẻ hơn)
// VD "đi buýt 1 trạm rồi đổi metro" khi đi bộ thẳng ra ga còn nhanh hơn
const DURATION_TOLERANCE_MIN = 1; // nhanh hơn vài giây không đáng thêm 1 lần đổi tuyến
const withoutDominated = (candidates) => {
  const costOf = (candidate) => candidate.cost ?? Infinity;
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.duration <= candidate.duration + DURATION_TOLERANCE_MIN &&
          other.walkM <= candidate.walkM &&
          other.transfers <= candidate.transfers &&
          costOf(other) <= costOf(candidate) &&
          (other.duration < candidate.duration - DURATION_TOLERANCE_MIN || other.walkM < candidate.walkM || other.transfers < candidate.transfers || costOf(other) < costOf(candidate)),
      ),
  );
};

// Nhãn: gợi ý (điểm tốt nhất theo ưu tiên), nhanh nhất, ít đi bộ nhất, rẻ nhất
const tagOptions = (options) => {
  options.forEach((option) => (option.tags = []));
  if (!options.length) return;
  options[0].tags.push('recommended');
  const pick = (better) => options.reduce((best, option) => (better(option, best) ? option : best));
  pick((a, b) => a.duration_min < b.duration_min).tags.push('fastest');
  const transit = options.filter((option) => option.kind === 'transit');
  if (transit.length) {
    transit.reduce((best, option) => (option.walk_m < best.walk_m ? option : best)).tags.push('least_walk');
    const priced = transit.filter((option) => option.cost_vnd != null);
    if (priced.length) priced.reduce((best, option) => (option.cost_vnd < best.cost_vnd ? option : best)).tags.push('cheapest');
  }
};
