// AI Planner — phần không dùng LLM: hiểu câu theo luật, kiểm tra khả thi, ghép câu trả lời hỏi lại, schema gửi Groq.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interpretationSchema, toProviderSchema } from '../src/services/ai/aiSchemas.js';
import { checkFeasibility } from '../src/services/ai/feasibility.js';
import { PENDING_KINDS, resolvePending } from '../src/services/ai/pendingRequest.js';
import { interpretWithRules } from '../src/services/ai/ruleInterpreter.js';

const read = (text, options) => interpretWithRules(text, options);
const baseCriteria = { origin: { lat: 10.77, lng: 106.7 }, people: 2, start_time: '10:30', duration_hours: 4, categories: [], price_min: 0 };

describe('ruleInterpreter', () => {
  it('thứ tự + bữa: "ăn trưa rồi đi cà phê"', () => {
    const { criteria } = read('ăn trưa rồi đi cà phê ở Quận 3');
    assert.deepEqual(criteria.sequence, ['meal', 'drink']);
    assert.deepEqual(criteria.meals, ['lunch']);
    assert.equal(criteria.district, 'Quận 3');
  });
  it('food tour, số điểm, ngân sách theo người', () => {
    assert.equal(read('food tour Quận 4 tối nay').criteria.food_tour, true);
    assert.equal(read('đi 2-3 chỗ quanh Bến Thành').criteria.stop_count, 3);
    assert.equal(read('tìm chỗ ăn 400k').criteria.budget_per_person, 400000);
    assert.equal(read('1tr2 cho cả nhóm').criteria.budget_total, 1200000);
  });
  it('câu quá chung chung => hỏi lại (≤ 2 câu có đáp án), đã hỏi rồi thì thôi', () => {
    const vague = read('đi chơi');
    assert.equal(vague.request_quality, 'needs_info');
    assert.ok(vague.clarifying_questions.length <= 2 && vague.clarifying_questions.every((item) => item.options.length >= 2));
    assert.equal(read('đi chơi', { askedBefore: true }).request_quality, 'ok');
  });
  it('hỏi về 1 địa điểm', () => {
    const asked = read('Dinh Độc Lập mở cửa mấy giờ?');
    assert.equal(asked.intent, 'ask_place');
    assert.deepEqual(asked.place_question, { place_name: 'Dinh Độc Lập', topics: ['hours'] });
    assert.equal(read('giờ mở cửa của Thảo Cầm Viên').place_question.place_name, 'Thảo Cầm Viên');
    assert.deepEqual(read('tối nay có mưa không').place_question.topics, ['weather']);
  });
  it('không được phép / ngoài TP.HCM', () => {
    assert.equal(read('chỉ chỗ mua cần sa').request_quality, 'not_allowed');
    assert.equal(read('đi chơi Đà Lạt 3 ngày').intent, 'out_of_scope');
    assert.notEqual(read('ăn bún bò huế quận 1').intent, 'out_of_scope');
  });
  it('luôn trả đúng schema', () => {
    for (const text of ['xin chào', 'rẻ hơn', 'abc', 'ăn lẩu 7h tối 4 người 300k quận 3']) assert.doesNotThrow(() => interpretationSchema.parse(read(text)));
  });
});

describe('checkFeasibility', () => {
  it('8 điểm trong 1 giờ => phi thực tế + phương án gần nhất', () => {
    const interpretation = read('đi 8 chỗ trong 1 tiếng');
    const result = checkFeasibility({ interpretation, criteria: { ...baseCriteria, duration_hours: 1, stop_count: 8 } });
    assert.equal(result.feasible, false);
    assert.ok(result.alternatives.includes('Đi 1 chỗ trong 1 tiếng'));
  });
  it('2 bữa chính trong 2 giờ => phi thực tế', () => {
    const interpretation = read('ăn trưa và ăn tối trong 2 tiếng');
    assert.equal(checkFeasibility({ interpretation, criteria: { ...baseCriteria, duration_hours: 2, meals: ['lunch', 'dinner'] } }).feasible, false);
  });
  it('buffet với 50k => thiếu ngân sách; 400k đi ăn => được', () => {
    const buffet = read('ăn buffet 50k');
    assert.equal(checkFeasibility({ interpretation: buffet, criteria: { ...baseCriteria, categories: ['food'] } }).feasible, false);
    const meal = read('tìm chỗ ăn 400k');
    assert.equal(checkFeasibility({ interpretation: meal, criteria: { ...baseCriteria, categories: ['food'] } }).feasible, true);
  });
  it('xuất phát sau nửa đêm => chỉ lấy chỗ còn mở', () => {
    const result = checkFeasibility({ interpretation: read('đi ăn khuya'), criteria: { ...baseCriteria, start_time: '01:00' } });
    assert.equal(result.criteriaPatch.open_only, true);
  });
});

describe('resolvePending', () => {
  it('ghép câu trả lời ngắn vào yêu cầu đang chờ', () => {
    const pending = { kind: PENDING_KINDS.CLARIFY, interpretation: read('đi chơi tối nay 2 người') };
    const { interpretation, continued } = resolvePending(pending, read('Quận 1'));
    assert.equal(continued, true);
    assert.equal(interpretation.criteria.district, 'Quận 1');
    assert.equal(interpretation.criteria.people, 2);
    assert.equal(interpretation.criteria.date_hint, 'tonight');
    assert.equal(interpretation.request_quality, 'ok');
  });
  it('đổi chủ đề => bỏ yêu cầu đang chờ', () => {
    const pending = { kind: PENDING_KINDS.CLARIFY, interpretation: read('đi chơi') };
    assert.equal(resolvePending(pending, read('Dinh Độc Lập mở cửa mấy giờ?')).continued, false);
  });
});

describe('toProviderSchema', () => {
  it('gỡ ràng buộc Groq strict không hỗ trợ, giữ required + additionalProperties:false', () => {
    const json = JSON.stringify(toProviderSchema(interpretationSchema));
    for (const keyword of ['"maxLength"', '"minimum"', '"maximum"', '"pattern"', '"$schema"']) assert.ok(!json.includes(keyword), keyword);
    const schema = toProviderSchema(interpretationSchema);
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  });
});
