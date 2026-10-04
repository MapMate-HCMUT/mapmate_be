// Thời gian ở lại theo khoảng + nhóm đông, nhận diện mall và quán bên trong mall.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampStayOverride, getStayRange, groupExtraMinutes } from '../src/utils/stayTime.js';
import { addressHasStreet, isMall, sameVenue, streetKeyOf, venueOf } from '../src/utils/venue.js';

const mall = { _id: 'm1', name: 'Vincom Center Đồng Khởi', category: 'shopping', address: '72 Lê Thánh Tôn, Phường Bến Nghé' };
const dookki = { _id: 'p1', name: 'Dookki', category: 'food', kind: 'buffet', avg_visit_minutes: 90, parent_place_id: 'm1', parent_place_name: mall.name };
const cgv = { _id: 'p2', name: 'CGV Vincom Đồng Khởi', category: 'entertainment', avg_visit_minutes: 150, parent_place_id: 'm1', parent_place_name: mall.name };

describe('getStayRange', () => {
  it('khoảng theo loại: buffet có giới hạn, mall dạo lâu được, rạp phim cố định', () => {
    assert.deepEqual(getStayRange(dookki, 'meal'), { min: 70, typical: 90, max: 120 });
    const mallRange = getStayRange({ ...mall, avg_visit_minutes: 90 }, 'activity');
    assert.ok(mallRange.max >= 240, 'dạo mall 3–4 tiếng');
    assert.equal(getStayRange(cgv, 'activity').max, 150);
  });
  it('nhóm đông ngồi lâu hơn (tối đa theo vai trò)', () => {
    assert.equal(groupExtraMinutes('meal', 2), 0);
    assert.equal(groupExtraMinutes('meal', 4), 10);
    assert.equal(groupExtraMinutes('meal', 20), 30);
    assert.equal(groupExtraMinutes('activity', 10), 0);
    assert.equal(getStayRange(dookki, 'meal', 6).typical, 110);
  });
  it('thời gian người dùng tự chỉnh được làm tròn + kẹp giới hạn', () => {
    assert.equal(clampStayOverride(122), 120);
    assert.equal(clampStayOverride(1), 10);
    assert.equal(clampStayOverride(999), 300);
  });
});

describe('venue', () => {
  it('nhận đúng mall, loại tên không phải mall', () => {
    assert.ok(isMall(mall));
    assert.ok(isMall({ name: 'Trung Tâm Thương Mại Vincom Plaza Gò Vấp', category: 'shopping' }));
    for (const name of ['PNJ Vạn Hạnh Mall', 'Lotteria Pandora City', 'Wink Hotel Saigon Centre', 'Nhà đậu xe Aeon Mall Tân Phú']) assert.ok(!isMall({ name, category: 'shopping' }), name);
  });
  it('quán và rạp cùng 1 mall => cùng nơi', () => {
    assert.deepEqual(venueOf(dookki), { id: 'm1', name: mall.name });
    assert.ok(sameVenue(dookki, cgv));
    assert.ok(sameVenue(mall, dookki));
    assert.ok(!sameVenue({ _id: 'x', name: 'Phở Hòa', category: 'food' }, dookki));
  });
  it('khoá số nhà + tên đường', () => {
    assert.equal(streetKeyOf(mall.address), '72 le thanh ton');
    assert.ok(addressHasStreet('Đồng Khởi/72 Lê Thánh Tôn', '72 le thanh ton'));
    assert.ok(addressHasStreet('70-72 Đ. Lê Thánh Tôn', '72 le thanh ton'));
    assert.ok(!addressHasStreet('172 Lê Thánh Tôn', '72 le thanh ton'));
    assert.equal(streetKeyOf('3C 3 Tháng 2'), null); // tên đường có số => không đủ phân biệt
  });
});
