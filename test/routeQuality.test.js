// Lộ trình gợi ý không "giết thời gian", không chạy vòng; lời tư vấn không lọt tên kỹ thuật. Chạy: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTripTips, buildTripWarnings } from '../src/services/ai/adviceTemplates.js';
import { STRETCH } from '../src/constants/tripRules.js';

// Planner kéo theo cấu hình server (bắt buộc JWT_SECRET) dù không dùng tới => đặt giá trị giả rồi mới nạp
process.env.JWT_SECRET ??= 'test-only-secret';
const { cleanAdvice } = await import('../src/services/ai/advisor.agent.js');
const { buildPlan, optimizeOrder, toPlanInput } = await import('../src/services/itineraryPlanner.service.js');

const CENTER = { lng: 106.7009, lat: 10.7769, label: 'Q1' };
const KM_IN_DEG = 0.009;
let nextId = 0;
const place = (name, { east = 0, north = 0, category = 'park', kind = null, minutes = 60, hours = { open: null, close: null } } = {}) => ({
  _id: `p${(nextId += 1)}`,
  name,
  category,
  kind,
  location: { type: 'Point', coordinates: [CENTER.lng + east * KM_IN_DEG, CENTER.lat + north * KM_IN_DEG] },
  price_range: { min: 0, max: 0 },
  avg_visit_minutes: minutes,
  opening_hours: hours,
  rating: 4.5,
  review_count: 100,
});
const planInput = (overrides = {}) => toPlanInput({ origin: CENTER, vehicle: 'bike', people: 2, start_time: '09:00', duration_hours: 6, fill_duration: false, ...overrides });

describe('optimizeOrder — không chạy vòng', () => {
  it('đông → tây → đông thì sắp lại để 2 điểm phía đông đi liền nhau', () => {
    const eastA = place('Đông A', { east: 3 });
    const west = place('Tây', { east: -3 });
    const eastB = place('Đông B', { east: 3.5 });
    const input = planInput();
    const zigzag = buildPlan([eastA, west, eastB], input).summary.total_distance_km;
    const { places } = optimizeOrder([eastA, west, eastB], [null, null, null], input);
    const names = places.map((item) => item.name);
    assert.equal(Math.abs(names.indexOf('Đông A') - names.indexOf('Đông B')), 1, names.join(' → '));
    assert.ok(buildPlan(places, input).summary.total_distance_km < zigzag);
  });

  it('không dời bữa trưa sang chiều chỉ để đỡ vài trăm mét', () => {
    const museum = place('Bảo tàng', { east: 0.5, category: 'attraction', kind: 'museum', minutes: 90, hours: { open: '08:00', close: '17:00' } });
    const lunch = place('Cơm trưa', { east: 2, category: 'food', kind: 'restaurant', minutes: 60 });
    const park = place('Công viên', { east: 2.2, minutes: 60 });
    const { places, targetMeals } = optimizeOrder([museum, lunch, park], [null, 'lunch', null], planInput({ start_time: '10:00' }));
    const plan = buildPlan(places, planInput({ start_time: '10:00' }), { targetMeals });
    const meal = plan.stops.find((stop) => stop.role === 'meal');
    assert.ok(meal.arrival_time >= '10:30' && meal.arrival_time <= '14:30', meal.arrival_time);
  });
});

describe('không "giết thời gian"', () => {
  it('thời lượng là giới hạn trên: mỗi điểm chỉ dài thêm tối đa 30 phút', () => {
    const cafe = place('Cà phê', { east: 0.5, category: 'cafe', kind: 'coffee', minutes: 60 });
    const plan = buildPlan([cafe], planInput({ duration_hours: 3, fill_duration: true }));
    const [stop] = plan.stops;
    assert.ok(stop.stay_minutes <= stop.stay_typical + STRETCH.MAX_EXTRA_MINUTES, `${stop.stay_minutes} phút`);
    assert.ok(plan.summary.time_left_minutes > 0, 'còn dư thì về sớm, không kéo dài cho đủ');
  });

  it('food tour: ăn xong đi quán kế luôn, không bắt chờ 45 phút', () => {
    const snackA = place('Bánh mì', { east: 0.3, category: 'food', kind: 'bakery', minutes: 15 });
    const snackB = place('Chè', { east: 0.5, category: 'cafe', kind: 'dessert', minutes: 20 });
    const plan = buildPlan([snackA, snackB], planInput({ start_time: '19:00', food_tour: true }));
    assert.equal(plan.summary.free_minutes, 0);
  });

  it('chùa / bảo tàng chưa rõ giờ => coi như đóng cửa buổi tối', () => {
    const church = place('Nhà thờ Đức Bà', { east: 0.2, category: 'attraction', kind: 'worship', minutes: 30 });
    const night = buildPlan([church], planInput({ start_time: '21:00' }));
    const day = buildPlan([church], planInput({ start_time: '09:00' }));
    assert.equal(night.stops[0].open_on_arrival, false);
    assert.equal(day.stops[0].open_on_arrival, true);
  });
});

describe('lời tư vấn', () => {
  const options = [{ key: 'budget', label: 'Tiết kiệm nhất' }, { key: 'top_rated', label: 'Được yêu thích nhất' }];

  it('đổi tên kỹ thuật thành tên lộ trình, bỏ lời chào thừa, không "chúng tôi"', () => {
    const advice = cleanAdvice(
      { reply: 'Chào bạn! Chúng tôi gợi ý chọn lộ trình budget; muốn ngon hơn thì top_rated.', option_notes: [{ option_key: 'budget', headline: 'Rẻ hơn top_rated', why: 'x' }] },
      { options, text: 'đi chơi tối nay' },
    );
    assert.equal(advice.reply, 'Mình gợi ý chọn lộ trình "Tiết kiệm nhất"; muốn ngon hơn thì "Được yêu thích nhất".');
    assert.equal(advice.option_notes[0].headline, 'Rẻ hơn "Được yêu thích nhất"');
    assert.ok(cleanAdvice({ reply: 'Chào bạn! Bạn muốn đi đâu?', option_notes: [] }, { options, text: 'xin chào' }).reply.startsWith('Chào bạn'));
  });

  it('"xong sớm" / "dài hơn thời lượng" chỉ khi người dùng tự nói thời lượng', () => {
    const option = { label: 'Tiết kiệm nhất', summary: { start_time: '09:00', end_time: '12:00', time_left_minutes: -40, within_duration: false, within_budget: true, all_open: true, unknown_hours_stops: 0, issues: [] } };
    assert.equal(buildTripWarnings({ criteria: { fill_duration: false }, options: [option] }).length, 0);
    assert.equal(buildTripWarnings({ criteria: { fill_duration: true }, options: [option] }).length, 1);
    const early = { ...option, summary: { ...option.summary, time_left_minutes: 90 } };
    assert.ok(!buildTripTips({ criteria: { vehicle: 'walk', fill_duration: false }, option: early }).some((tip) => tip.includes('xong sớm')));
    assert.ok(buildTripTips({ criteria: { vehicle: 'walk', fill_duration: true }, option: early }).some((tip) => tip.includes('xong sớm')));
  });
});
