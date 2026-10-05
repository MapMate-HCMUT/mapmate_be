import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findBestTransitMatch,
  findNearbyStops,
  getTransitRouteById,
  getTransitRoutes,
} from '../../src/services/transit.service.js';

describe('transitService', () => {
  it('lấy danh sách các tuyến phương tiện công cộng (Metro & Bus)', () => {
    const routes = getTransitRoutes();
    assert.ok(routes.length >= 7, 'Cần có ít nhất 7 tuyến huyết mạch');

    const metro = routes.find((r) => r.type === 'metro');
    assert.ok(metro, 'Cần có tuyến Metro');
    assert.equal(metro.id, 'metro-line-1');

    const busList = getTransitRoutes({ type: 'bus' });
    assert.ok(busList.length >= 5, 'Có các tuyến xe buýt');
  });

  it('lấy chi tiết tuyến kèm toạ độ và danh sách trạm dừng', () => {
    const metro = getTransitRouteById('metro-line-1');
    assert.ok(metro);
    assert.equal(metro.stops.length, 14, 'Metro số 1 có 14 ga');
    assert.ok(metro.coordinates.length > 20, 'Tọa độ polyline chi tiết');
  });

  it('tìm trạm dừng gần vị trí người dùng (Chợ Bến Thành)', () => {
    // Tọa độ gần chợ Bến Thành: 106.6983, 10.7719
    const nearby = findNearbyStops(106.6983, 10.7719, 1.0);
    assert.ok(nearby.length > 0, 'Tìm thấy các trạm quanh Bến Thành');
    assert.ok(nearby.some((s) => s.name.includes('Bến Thành')));
  });

  it('gợi ý tuyến Metro hoặc Bus phù hợp giữa Bến Thành và Suối Tiên', () => {
    const benThanhCoord = [106.6983, 10.7719];
    const suoiTienCoord = [106.8028, 10.8654];

    const match = findBestTransitMatch(benThanhCoord, suoiTienCoord, 1.5);
    assert.ok(match, 'Tìm được phương án công cộng giữa Bến Thành và Suối Tiên');
    assert.ok(['metro-line-1', 'bus-19', 'bus-150'].includes(match.route_id));
  });
});
