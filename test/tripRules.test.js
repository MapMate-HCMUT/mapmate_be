// Luật ăn uống của lộ trình: vai trò điểm dừng, dựng khuôn, kiểm tra lộ trình. Chạy: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeSlots, preferredStartForMeals, waitBeforeStop } from '../src/services/tripComposer.js';
import { PLAN_ISSUES, validatePlanStops } from '../src/services/itineraryValidator.js';
import { getVisitRole } from '../src/utils/visitRole.js';

const roles = (criteria) => composeSlots({ criteria: { start_time: '18:30', duration_hours: 4, ...criteria } }).map((slot) => slot.role);
const stop = (id, role, time) => ({ role, arrival_time: time, place: { id, name: id } });

describe('getVisitRole', () => {
  it('suy vai trò từ kind + tên', () => {
    assert.equal(getVisitRole({ category: 'food', kind: 'restaurant', name: 'Phở Hòa Pasteur' }), 'meal');
    assert.equal(getVisitRole({ category: 'food', kind: 'street_food', name: 'Bánh mì Huỳnh Hoa' }), 'snack');
    assert.equal(getVisitRole({ category: 'cafe', kind: 'coffee', name: 'Cộng Cà Phê' }), 'drink');
    assert.equal(getVisitRole({ category: 'cafe', kind: 'dessert', name: 'Chè Hiển Khánh' }), 'snack');
    assert.equal(getVisitRole({ category: 'entertainment', kind: 'bar', name: 'Saigon Outcast' }), 'drink');
    assert.equal(getVisitRole({ category: 'entertainment', kind: null, name: 'Bia Tươi Tiệp Gammer' }), 'drink');
    assert.equal(getVisitRole({ category: 'attraction', kind: 'museum', name: 'Bảo tàng Mỹ thuật' }), 'activity');
  });
});

describe('composeSlots', () => {
  it('"tìm chỗ ăn" = 1 bữa chính + tráng miệng, không phải nhiều quán ăn liền nhau', () => {
    assert.deepEqual(roles({ categories: ['food'] }), ['meal', 'snack']);
    assert.deepEqual(roles({ categories: ['food'], duration_hours: 1 }), ['meal']);
  });
  it('giữ đúng thứ tự người dùng nói', () => {
    assert.deepEqual(roles({ sequence: ['activity', 'meal', 'drink'] }), ['activity', 'meal', 'drink']);
  });
  it('food tour = nhiều điểm ăn vặt', () => {
    const tour = roles({ categories: ['food'], food_tour: true, start_time: '19:00', duration_hours: 3 });
    assert.ok(tour.length >= 3 && tour.every((role) => role === 'snack'));
  });
  it('cả ngày: tối đa 1 bữa chính mỗi khung, 2 bữa cách ≥ 4 tiếng, không 2 đồ uống liền nhau', () => {
    const slots = composeSlots({ criteria: { start_time: '09:00', duration_hours: 10 } });
    const meals = slots.filter((slot) => slot.role === 'meal');
    assert.ok(meals.length <= 2);
    if (meals.length === 2) {
      const [a, b] = meals.map((slot) => Number(slot.estimated_time.slice(0, 2)) * 60 + Number(slot.estimated_time.slice(3)));
      assert.ok(b - a >= 240);
    }
    slots.forEach((slot, index) => assert.ok(!(slot.role === 'drink' && slots[index - 1]?.role === 'drink')));
    assert.ok(slots.filter((slot) => slot.role === 'drink').length <= 2);
  });
  it('không thêm bữa sáng khi đi lúc 9h', () => {
    assert.ok(!composeSlots({ criteria: { start_time: '09:00', duration_hours: 4 } }).some((slot) => slot.meal === 'breakfast'));
  });
});

describe('giờ ăn', () => {
  it('chờ tới khung giờ ăn và cách bữa trước ≥ 4 tiếng', () => {
    assert.equal(waitBeforeStop('meal', '16:30', { targetMeal: 'dinner' }), 30);
    assert.equal(waitBeforeStop('meal', '12:00', { lastMealMinutes: 11 * 60 }), 180);
    assert.equal(waitBeforeStop('snack', '12:00', { lastSnackMinutes: 11 * 60 + 40 }), 25);
    assert.equal(waitBeforeStop('activity', '12:00'), 0);
  });
  it('giờ đi theo bữa: "đi bảo tàng xong ăn tối" lùi giờ để kịp bữa tối', () => {
    assert.equal(preferredStartForMeals(['lunch']), '11:30');
    assert.equal(preferredStartForMeals(['dinner'], ['activity', 'meal']), '16:45');
  });
});

describe('validatePlanStops', () => {
  it('2 bữa chính cách 1 tiếng => lỗi nặng (lỗi gốc người dùng báo)', () => {
    const { hard } = validatePlanStops([stop('a', 'meal', '18:30'), stop('b', 'meal', '19:30')]);
    assert.equal(hard[0].code, PLAN_ISSUES.MEALS_TOO_CLOSE);
  });
  it('đồ uống liền nhau / quá nhiều ăn vặt => lỗi nặng', () => {
    assert.equal(validatePlanStops([stop('a', 'drink', '14:00'), stop('b', 'drink', '15:00')]).hard[0].code, PLAN_ISSUES.CONSECUTIVE_DRINKS);
    const snacks = [stop('a', 'snack', '14:00'), stop('b', 'snack', '15:00'), stop('c', 'snack', '16:00')];
    assert.equal(validatePlanStops(snacks).hard[0].code, PLAN_ISSUES.TOO_MANY_SNACKS);
    assert.equal(validatePlanStops(snacks, { foodTour: true }).hard.length, 0);
  });
  it('điểm người dùng tự chọn chỉ bị cảnh báo, không bị loại', () => {
    const result = validatePlanStops([stop('a', 'meal', '18:30'), stop('b', 'meal', '19:30')], { lockedIds: new Set(['b']) });
    assert.equal(result.hard.length, 0);
    assert.equal(result.soft[0].code, PLAN_ISSUES.MEALS_TOO_CLOSE);
  });
  it('lộ trình hợp lý => không có lỗi', () => {
    const { hard, soft } = validatePlanStops([stop('a', 'activity', '16:45'), stop('b', 'meal', '18:30'), stop('c', 'drink', '19:45')]);
    assert.equal(hard.length + soft.length, 0);
  });
});
