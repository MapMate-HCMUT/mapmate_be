// Giao thông công cộng: hình học lộ trình, giờ chờ xe, tìm cách đi (đi thẳng / đổi tuyến / gọi xe / đi bộ) — không cần mạng / DB.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildNetwork } from '../src/services/transit/transitNetwork.js';
import { metersBetween, parseHeadway, parseOperationTime, projectStopsOnPath, slicePath } from '../src/services/transit/transitGeometry.js';
import { localTime, nextDeparture, planTransit } from '../src/services/transit/transitPlanner.js';

const departuresEvery = (from, to, step) => {
  const times = [];
  for (let minute = from; minute <= to; minute += step) times.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  return times;
};
const stop = (id, lng, lat) => ({ stop_id: id, name: `Trạm ${id}`, location: { coordinates: [lng, lat] } });
const variant = (varId, stops, extra = {}) => {
  const path = stops.map((item) => item.location.coordinates);
  const { offsets, indices } = projectStopsOnPath(path, path);
  return { var_id: varId, short_name: `Hướng ${varId}`, stop_ids: stops.map((item) => item.stop_id), stop_offsets_m: offsets, stop_path_index: indices, path, distance_m: offsets.at(-1), timetables: [], ...extra };
};

// Tuyến A chạy ngang (vĩ độ 10.78) qua 5 trạm cách ~1,1 km; tuyến B chạy dọc lên từ gần trạm A3
const A = [stop(1, 106.68, 10.78), stop(2, 106.69, 10.78), stop(3, 106.7, 10.78), stop(4, 106.71, 10.78), stop(5, 106.72, 10.78)];
const B = [stop(11, 106.7005, 10.781), stop(12, 106.7005, 10.79), stop(13, 106.7005, 10.8)];
const ROUTES = [
  { route_id: 100, number: 'A1', name: 'Tuyến A', mode: 'bus', type: 'Phổ thông - Có trợ giá', variants: [variant(1, A, { running_min: 20, timetables: [{ apply_days: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], departures: departuresEvery(300, 1260, 10) }] })] },
  { route_id: 200, number: 'B2', name: 'Tuyến B', mode: 'bus', type: 'Phổ thông - Có trợ giá', headway_text: '10', operation_time: '05:00 - 21:00', variants: [variant(2, B, { running_min: 10 })] },
];
const network = buildNetwork(ROUTES, [...A, ...B]);
const TUESDAY_8AM = new Date('2026-10-06T01:00:00Z'); // 08:00 giờ Việt Nam, thứ Ba
const LATE_NIGHT = new Date('2026-10-06T16:30:00Z'); // 23:30

describe('hình học lộ trình', () => {
  it('chiếu trạm lên lộ trình theo thứ tự, kể cả tuyến đi rồi quay lại cùng đường', () => {
    const path = [[106.7, 10.78], [106.71, 10.78], [106.71, 10.781], [106.7, 10.781]]; // đi sang phải rồi quay về song song
    const { offsets, indices } = projectStopsOnPath(path, [[106.702, 10.78], [106.708, 10.781]]);
    assert.equal(indices[0], 0);
    assert.equal(indices[1], 2); // trạm thứ 2 nằm trên chiều về, không bị gán nhầm lên chiều đi
    assert.ok(offsets[1] > offsets[0]);
  });
  it('cắt đoạn đường giữa 2 trạm', () => {
    assert.deepEqual(slicePath([[0, 0], [1, 0], [2, 0], [3, 0]], 0, 2, [0.5, 0], [2.5, 0]), [[0.5, 0], [1, 0], [2, 0], [2.5, 0]]);
  });
  it('đọc giãn cách, giờ hoạt động', () => {
    assert.equal(parseHeadway('6 - 14'), 10);
    assert.equal(parseHeadway('15'), 15);
    assert.equal(parseHeadway(''), null);
    assert.deepEqual(parseOperationTime('05:00 - 21:00'), [300, 1260]);
  });
});

describe('giờ chờ xe', () => {
  const [patternA, patternB] = network.patterns;
  it('theo giờ xuất bến thật (cộng thời gian xe chạy tới trạm)', () => {
    // A3 nằm giữa tuyến => xe xuất bến 08:00 tới A3 lúc 08:10; tới trạm 08:05 => chờ 5 phút
    const result = nextDeparture(patternA, 2, 485, 'T3');
    assert.equal(result.scheduled, true);
    assert.ok(Math.abs(result.wait - 5) < 0.5, `chờ ${result.wait}`);
  });
  it('hết chuyến => không đi được', () => {
    assert.equal(nextDeparture(patternA, 0, 23 * 60, 'T3'), null);
    assert.equal(nextDeparture(patternB, 0, 22 * 60, 'T3'), null);
  });
  it('không có giờ xuất bến => chờ nửa giãn cách', () => {
    assert.equal(nextDeparture(patternB, 0, 480, 'T3').wait, 5);
  });
  it('giờ Việt Nam + thứ', () => {
    assert.deepEqual(localTime(TUESDAY_8AM), { minutes: 480, day: 'T3' });
  });
});

describe('tìm cách đi', () => {
  it('đi thẳng 1 tuyến: ra trạm gần, xuống trạm gần đích', () => {
    const plan = planTransit(network, { from: [106.6801, 10.7805], to: [106.7199, 10.7805], departAt: TUESDAY_8AM });
    const best = plan.options.find((option) => option.kind === 'transit');
    assert.equal(best.title, 'A1');
    const ride = best.legs.find((leg) => leg.route);
    assert.equal(ride.from.stop_id, 1);
    assert.equal(ride.to.stop_id, 5);
    assert.equal(ride.stops_count, 4);
    assert.ok(ride.geometry.length >= 2);
    assert.equal(best.cost_vnd, 0); // xe buýt trợ giá đang miễn phí (constants/transport.js)
  });
  it('đổi tuyến 1 lần khi không có tuyến đi thẳng', () => {
    const plan = planTransit(network, { from: [106.6801, 10.7805], to: [106.7006, 10.8001], departAt: TUESDAY_8AM });
    const transfer = plan.options.find((option) => option.title === 'A1 → B2');
    assert.ok(transfer, plan.options.map((option) => option.title).join(', '));
    assert.equal(transfer.transfers, 1);
    assert.ok(transfer.legs.some((leg) => leg.mode === 'walk' && leg.from.stop_id === 3 && leg.to.stop_id === 11)); // đi bộ ~110 m sang trạm B
  });
  it('luôn có phương án gọi xe; chặng ngắn có thêm đi bộ; phương án đầu là gợi ý', () => {
    const plan = planTransit(network, { from: [106.6801, 10.7805], to: [106.69, 10.781], departAt: TUESDAY_8AM });
    const kinds = plan.options.map((option) => option.kind);
    assert.ok(kinds.includes('ride'));
    assert.ok(kinds.includes('walk'));
    assert.ok(plan.options[0].tags.includes('recommended'));
  });
  it('xa trạm: tự gọi xe ra trạm; chỉ chịu đi bộ => không có tuyến, vẫn có gọi xe', () => {
    const far = [106.68, 10.765]; // cách trạm A1 ~1,7 km
    const auto = planTransit(network, { from: far, to: [106.7199, 10.7805], departAt: TUESDAY_8AM });
    const transit = auto.options.find((option) => option.kind === 'transit');
    assert.equal(transit.legs[0].mode, 'ride');
    assert.equal(transit.uses_ride, true);
    const walkOnly = planTransit(network, { from: far, to: [106.7199, 10.7805], departAt: TUESDAY_8AM, prefs: { connector: 'walk' } });
    assert.equal(walkOnly.options.filter((option) => option.kind === 'transit').length, 0);
    assert.ok(walkOnly.options.some((option) => option.kind === 'ride'));
  });
  it('ưu tiên ít đi bộ => chọn phương án đi bộ ít hơn', () => {
    const from = [106.6801, 10.7805];
    const to = [106.7006, 10.8001];
    const fastest = planTransit(network, { from, to, departAt: TUESDAY_8AM, prefs: { priority: 'fastest' } }).options[0];
    const leastWalk = planTransit(network, { from, to, departAt: TUESDAY_8AM, prefs: { priority: 'least_walk' } }).options[0];
    assert.ok(leastWalk.walk_m <= fastest.walk_m);
  });
  it('hết xe buýt ban đêm => chỉ còn gọi xe / đi bộ', () => {
    const plan = planTransit(network, { from: [106.6801, 10.7805], to: [106.7199, 10.7805], departAt: LATE_NIGHT });
    assert.equal(plan.options.filter((option) => option.kind === 'transit').length, 0);
    assert.equal(plan.options[0].kind, 'ride');
  });
  it('có tuyến => tuyến xếp trước, gọi xe đi thẳng chỉ là dự phòng ở cuối', () => {
    const plan = planTransit(network, { from: [106.6801, 10.7805], to: [106.7199, 10.7805], departAt: TUESDAY_8AM });
    assert.equal(plan.options[0].kind, 'transit');
    assert.equal(plan.options.at(-1).kind, 'ride');
    assert.equal(plan.options.at(-1).cost_vnd % 500, 0); // giá gọi xe làm tròn 500đ
  });
  it('các tuyến lên / xuống cùng trạm được gộp thành 1 phương án (giống Google)', () => {
    const twin = { route_id: 300, number: 'C3', name: 'Tuyến C', mode: 'bus', type: 'Phổ thông - Có trợ giá', variants: [variant(3, A, { running_min: 20, timetables: [{ apply_days: ['T3'], departures: departuresEvery(305, 1260, 10) }] })] };
    const merged = buildNetwork([...ROUTES, twin], [...A, ...B]);
    const plan = planTransit(merged, { from: [106.6801, 10.7805], to: [106.7199, 10.7805], departAt: TUESDAY_8AM });
    const transit = plan.options.filter((option) => option.kind === 'transit');
    assert.equal(transit.length, 1, transit.map((option) => option.title).join(', '));
    assert.match(transit[0].title, /^(A1 \/ C3|C3 \/ A1)$/);
    const ride = transit[0].legs.find((leg) => leg.route);
    assert.equal(ride.alternatives.length, 1);
    assert.ok(ride.alternatives[0].departure_time);
  });
  it('khoảng cách', () => {
    assert.ok(Math.abs(metersBetween([106.68, 10.78], [106.69, 10.78]) - 1094) < 5);
  });
});
