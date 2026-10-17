// Câu thật người dùng gặp lỗi (17/10/2026): hỏi cà phê ra bún bò (ghi nhớ "thích bún bò" lọt vào), than phiền bị hiểu ngược,
// "dưới 40k đi" sau khi tìm quán bị hỏi lại từ đầu.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { continueFind, groundInterpretation, lockToMentionedKinds, mentionedKinds } from '../src/services/ai/requestGrounding.js';
import { interpretWithRules } from '../src/services/ai/ruleInterpreter.js';

// Giả lập output của model: thêm món + quận lấy từ ghi nhớ người dùng
const fromModel = (text, criteria) => {
  const base = interpretWithRules(text);
  return { ...base, criteria: { ...base.criteria, ...criteria } };
};

describe('chỉ giữ điều người dùng nói', () => {
  it('"cafe quanh tôi": bỏ "bún bò" + "Quận 5" model lấy từ ghi nhớ, chỉ còn cà phê', () => {
    const model = fromModel('cafe quanh tôi', { categories: ['cafe', 'food'], keywords: ['bún bò'], district: 'Quận 5' });
    const { interpretation, said } = groundInterpretation(model, 'cafe quanh tôi');
    const locked = lockToMentionedKinds(interpretation, said);
    assert.deepEqual(locked.criteria.keywords, []);
    assert.equal(locked.criteria.district, null);
    assert.deepEqual(locked.criteria.categories, ['cafe']);
  });
  it('giữ món / quận người dùng gõ (kể cả không dấu, viết tắt)', () => {
    const model = fromModel('bun bo q3', { keywords: ['bún bò'], district: 'Quận 3' });
    const { interpretation } = groundInterpretation(model, 'bun bo q3');
    assert.deepEqual(interpretation.criteria.keywords, ['bún bò']);
    assert.equal(interpretation.criteria.district, 'Quận 3');
  });
  it('than phiền "mắc gì cafe mà gợi ý bún bò v" => bỏ bún bò, chỉ tìm cà phê', () => {
    const text = 'mắc gì cafe mà dgoijw ý bún bò v';
    const model = fromModel(text, { categories: ['food', 'cafe'], keywords: ['bún bò'] });
    const { interpretation, said, unwanted } = groundInterpretation(model, text, { previousReply: 'Gợi ý: Bún bò Huế Đông Ba (bữa trưa) → Highlands Coffee' });
    assert.deepEqual(unwanted, ['bún bò']);
    const locked = lockToMentionedKinds(interpretation, said);
    assert.deepEqual(locked.criteria.categories, ['cafe']);
    assert.deepEqual(locked.criteria.keywords, []);
  });
  it('gọi tên cà phê => bỏ món ăn ghép từ yêu cầu đang chờ', () => {
    const merged = fromModel('không tôi đang cần đi cafe mà', { keywords: ['bún bò'], categories: ['food'] });
    assert.deepEqual(lockToMentionedKinds(merged, 'không tôi đang cần đi cafe mà').criteria, { ...merged.criteria, categories: ['cafe'], keywords: [] });
  });
  it('nhận đúng loại chỗ theo từ trọn vẹn', () => {
    assert.deepEqual(mentionedKinds('cafe quanh tôi'), ['cafe']);
    assert.deepEqual(mentionedKinds('xem phim rồi ăn lẩu'), ['food', 'entertainment']);
    assert.deepEqual(mentionedKinds('căn hộ gần đây'), []); // "ăn" trong "căn" không phải ăn uống
  });
});

describe('lọc tiếp kết quả vừa tìm', () => {
  const previousCriteria = { categories: ['cafe'], tags: ['yen-tinh'] };
  it('"dưới 40k đi" sau khi tìm cà phê => tìm tiếp cà phê ≤ 40k, không hỏi lại', () => {
    const model = { ...interpretWithRules('dưới 40k đi'), intent: 'plan_trip', request_quality: 'needs_info' };
    const next = continueFind(model, 'dưới 40k đi', { lastIntent: 'find_places', previousCriteria, lastKeywords: [] });
    assert.equal(next.intent, 'find_places');
    assert.equal(next.request_quality, 'ok');
    assert.deepEqual(next.criteria.categories, ['cafe']);
    assert.equal(next.criteria.budget_per_person, 40000);
  });
  it('giữ món của lượt trước ("bún bò gần tôi" => "rẻ hơn")', () => {
    const next = continueFind(interpretWithRules('rẻ hơn'), 'rẻ hơn', { lastIntent: 'find_places', previousCriteria: { categories: ['food'], tags: [] }, lastKeywords: ['bún bò'] });
    assert.deepEqual(next.criteria.keywords, ['bún bò']);
  });
  it('nói loại chỗ mới / muốn lên lộ trình => không phải lọc tiếp', () => {
    const options = { lastIntent: 'find_places', previousCriteria, lastKeywords: [] };
    assert.equal(continueFind(interpretWithRules('quán lẩu thì sao'), 'quán lẩu thì sao', options), null);
    assert.equal(continueFind(interpretWithRules('lên lộ trình luôn'), 'lên lộ trình luôn', options), null);
    assert.equal(continueFind(interpretWithRules('dưới 40k'), 'dưới 40k', { ...options, lastIntent: 'plan_trip' }), null);
  });
});
