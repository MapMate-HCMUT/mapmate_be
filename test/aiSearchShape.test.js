// AI Planner — lỗi người dùng báo (10/2026): hỏi cà phê ra bún bò, 40k vẫn vượt ngân sách, chỉ muốn 1 chỗ lại nhận cả lộ trình,
// hỏi y hệt nhiều lần thì AI cứ trả lời cứng 1 kiểu.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PENDING_KINDS } from '../src/services/ai/pendingRequest.js';
import { ACTIONS, answerPending, decideAction, isRepeatedAsk, isSingleStopRequest, REPEAT_OPTIONS, repeatTurn } from '../src/services/ai/orchestrator.js';
import { interpretWithRules } from '../src/services/ai/ruleInterpreter.js';
import { composeSlots } from '../src/services/tripComposer.js';

const criteriaOf = (overrides) => ({ categories: [], tags: [], meals: [], sequence: [], food_tour: false, stop_count: null, start_time: '11:00', duration_hours: 3, ...overrides });
const decide = (text, options = {}) => decideAction({ interpretation: interpretWithRules(text), source: 'llm', llmConfigured: true, askedBefore: false, continued: false, text, ...options });

describe('chỉ cà phê => chỉ quán cà phê', () => {
  it('"cà phê chill" lúc 11h không bị chèn bữa trưa (lỗi cũ: ra bún bò)', () => {
    assert.deepEqual(composeSlots({ criteria: criteriaOf({ categories: ['cafe'], tags: ['yen-tinh'] }) }).map((slot) => slot.role), ['drink']);
  });
  it('vẫn giữ khuôn ăn uống khi có chọn quán ăn', () => {
    assert.equal(composeSlots({ criteria: criteriaOf({ categories: ['food', 'cafe'] }) })[0].role, 'meal');
  });
  it('"quán cà phê nào gần tôi" không bị hiểu thành quán ăn', () => {
    assert.deepEqual(interpretWithRules('quán cafe nào gần tôi').criteria.categories, ['cafe']);
  });
});

describe('chỉ muốn tới 1 chỗ => gợi ý quán, không dựng lộ trình', () => {
  it('nhận ra yêu cầu 1 chỗ', () => {
    assert.equal(isSingleStopRequest(interpretWithRules('mình muốn đi uống cafe'), 'mình muốn đi uống cafe'), true);
    assert.equal(isSingleStopRequest(interpretWithRules('chỉ cần 1 chỗ ăn tối thôi'), 'chỉ cần 1 chỗ ăn tối thôi'), true);
  });
  it('nhiều điểm / có thứ tự / đi chơi chung chung => vẫn là lộ trình', () => {
    for (const text of ['ăn trưa rồi đi cà phê', 'lên lộ trình đi cà phê quận 3', 'đi 3 chỗ ở quận 1', 'cả nhà đi chơi cuối tuần']) {
      assert.equal(isSingleStopRequest(interpretWithRules(text), text), false, text);
    }
  });
  it('bộ điều phối đổi sang tìm quán', () => {
    assert.equal(decide('mình muốn đi uống cafe').reason, 'single_stop');
  });
  it('model nói "tìm quán" nhưng câu là đi chơi => vẫn lên lộ trình', () => {
    const asFind = (text) => ({ ...interpretWithRules(text), intent: 'find_places' });
    const decideFind = (text) => decideAction({ interpretation: asFind(text), source: 'llm', llmConfigured: true, askedBefore: false, continued: false, text }).reason;
    assert.equal(decideFind('Nhóm 5 đứa sinh viên, đi chơi đêm ở Quận 4 ăn ốc, rẻ thôi'), 'general_outing');
    assert.equal(decideFind('tối nay 2 người đi hẹn hò ở quận 1'), 'general_outing');
    assert.equal(decideFind('quán ốc nào ngon ở quận 4'), 'find_places');
  });
});

describe('hỏi lại y hệt nhiều lần => hỏi xem cần đổi gì', () => {
  const ask = 'quán cafe nào gần tôi';
  it('lần thứ 3 mới hỏi lại (bỏ qua dấu, hoa thường, dấu câu)', () => {
    assert.equal(isRepeatedAsk(ask, [ask]), false);
    assert.equal(isRepeatedAsk('Quán cafe nào gần tôi?', [ask, 'quan cafe nao gan toi']), true);
    assert.equal(isRepeatedAsk('gợi ý lộ trình khác', ['gợi ý lộ trình khác', 'gợi ý lộ trình khác']), false); // cố ý xin cái khác
  });
  it('câu hỏi có đáp án bấm được, chọn "chỉ 1 chỗ" thì giữ đúng lựa chọn', () => {
    const interpretation = interpretWithRules('cả nhà đi chơi cuối tuần');
    const turn = repeatTurn(interpretation);
    assert.equal(turn.pending.kind, PENDING_KINDS.REPEAT);
    assert.ok(turn.questions[0].options.includes(REPEAT_OPTIONS.ONE));
    const answered = answerPending(turn.pending, REPEAT_OPTIONS.ONE);
    assert.equal(answered.interpretation.intent, 'find_places');
    const decision = decideAction({ interpretation: answered.interpretation, source: 'pending', llmConfigured: true, askedBefore: true, continued: true, text: REPEAT_OPTIONS.ONE });
    assert.equal(decision.action, ACTIONS.PLAN);
    assert.notEqual(decision.reason, 'general_outing');
  });
  it('"gần mình hơn" / "rẻ hơn" chỉnh đúng tiêu chí', () => {
    const pending = repeatTurn(interpretWithRules('quán cà phê 100k/người')).pending;
    assert.equal(answerPending(pending, REPEAT_OPTIONS.NEAR).interpretation.criteria.radius_km, 2);
    const cheaper = answerPending(pending, REPEAT_OPTIONS.CHEAP).interpretation.criteria;
    assert.equal(cheaper.price_level, 'cheap');
    assert.equal(cheaper.budget_per_person, 70000);
  });
});
