// Tài khoản khách: bị chặn mọi tính năng AI, thành viên thì không. Chạy: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.JWT_SECRET ??= 'test-only-secret';
const { requireAuth, requireMember } = await import('../src/middlewares/auth.middleware.js');
const { aiRouter } = await import('../src/routes/ai.routes.js');
const { USER_ROLES } = await import('../src/constants/business.js');
const { ERROR_CODES } = await import('../src/constants/errorCodes.js');

const runMember = (user) => {
  let passed = false;
  requireMember({ user }, {}, () => {
    passed = true;
  });
  return passed;
};

describe('requireMember', () => {
  it('chặn tài khoản khách với mã GUEST_NOT_ALLOWED (403)', () => {
    assert.throws(() => runMember({ id: 'g1', role: USER_ROLES.GUEST }), (error) => error.statusCode === 403 && error.errorCode === ERROR_CODES.GUEST_NOT_ALLOWED);
  });

  it('cho thành viên thường và doanh nghiệp đi tiếp', () => {
    assert.equal(runMember({ id: 'u1', role: USER_ROLES.USER }), true);
    assert.equal(runMember({ id: 'b1', role: USER_ROLES.BUSINESS }), true);
  });
});

describe('route AI', () => {
  it('mọi endpoint gọi AI / dữ liệu AI đều cần đăng nhập thành viên (trừ danh sách tuỳ chọn)', () => {
    const routes = aiRouter.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, handlers: layer.route.stack.map((item) => item.handle) }));
    const guarded = routes.filter((route) => route.path !== '/options');
    assert.ok(guarded.length >= 10);
    for (const route of guarded) {
      assert.equal(route.handlers[0], requireAuth, route.path);
      assert.equal(route.handlers[1], requireMember, route.path);
    }
  });
});
