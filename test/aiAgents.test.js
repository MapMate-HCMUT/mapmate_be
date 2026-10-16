// AI Planner multi-agent — phần không dùng LLM / DB: Agent điều phối, hiểu câu theo luật (giờ về, thao tác sửa),
// khuôn lộ trình 2 bữa, Agent kiểm tra. Các ca ở đây là lỗi người dùng đã gặp khi trò chuyện thật.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PENDING_KINDS } from '../src/services/ai/pendingRequest.js';
import { ACTIONS, answerPending, decideAction, memoryOffer, summarizeUnderstanding } from '../src/services/ai/orchestrator.js';
import { extractEdits, extractEndBy, interpretWithRules } from '../src/services/ai/ruleInterpreter.js';
import { composeSlots } from '../src/services/tripComposer.js';
import { checkOption, tradeoffQuestion, verifyOptions } from '../src/services/ai/verifier.agent.js';

const previous = { origin: { lat: 10.77, lng: 106.7 }, start_time: '18:30', people: 2 };
const read = (text, options) => interpretWithRules(text, options);
const basePlan = { source: 'ai_option', name: 'Cân bằng', place_ids: ['a'], is_mine: false };

describe('hiểu câu theo luật — giờ về & sửa lộ trình', () => {
  it('"kết thúc trước 22h" là giờ VỀ, không phải giờ đi (lỗi cũ: lộ trình bắt đầu 22:00, xong 00:01)', () => {
    const { criteria, intent, edits } = read('đổi quán ăn thành quán chay được không, mà mình muốn kết thúc trước 22h', { previousCriteria: previous });
    assert.equal(criteria.end_by, '22:00');
    assert.equal(criteria.start_time, null);
    assert.equal(intent, 'refine_trip');
    assert.deepEqual(edits.map(({ action, target_role: role, keyword }) => [action, role, keyword]), [['replace', 'meal', 'chay']]);
  });
  it('giờ về theo buổi', () => {
    assert.equal(extractEndBy('về trước 10h tối nhé').endBy, '22:00');
    assert.equal(extractEndBy('xong trước 9 giờ').endBy, '09:00');
    assert.equal(extractEndBy('ăn tối lúc 7h').endBy, null);
  });
  it('thao tác: bỏ điểm N / thêm món / đổi điểm N', () => {
    assert.deepEqual(extractEdits('bỏ điểm 2').map((edit) => [edit.action, edit.stop_number]), [['remove', 2]]);
    assert.deepEqual(extractEdits('thêm 1 quán trà sữa').map((edit) => [edit.action, edit.new_role, edit.keyword]), [['add', 'drink', 'trà sữa']]);
    assert.deepEqual(extractEdits('đổi điểm 3 thành quán lẩu').map((edit) => [edit.action, edit.stop_number, edit.keyword]), [['replace', 3, 'lẩu']]);
    assert.equal(read('sắp xếp lại cho đỡ chạy vòng', { previousCriteria: previous }).reorder, true);
  });
  it('"bỏ điểm 2" không phải tên địa danh; "đi buýt" là xe công cộng', () => {
    assert.deepEqual(read('bỏ điểm 2', { previousCriteria: previous }).places_mentioned, []);
    assert.equal(read('ở Thủ Đức có chỗ nào ngắm hoàng hôn đẹp không, đi buýt').criteria.vehicle, 'public');
  });
  it('chưa có lộ trình thì không có gì để sửa', () => {
    assert.deepEqual(read('bỏ điểm 2').edits, []);
  });
});

describe('Agent điều phối', () => {
  const understood = (text, options) => read(text, options);
  const decide = (text, extra = {}) => decideAction({ interpretation: understood(text, { previousCriteria: extra.basePlan ? previous : null }), source: 'llm', llmConfigured: true, askedBefore: false, continued: false, text, ...extra }).action;

  it('từ chối / hỏi địa điểm / trò chuyện / hỏi lại khi quá chung chung', () => {
    assert.equal(decide('chỉ chỗ mua cần sa'), ACTIONS.REFUSE);
    assert.equal(decide('Dinh Độc Lập mở cửa mấy giờ?'), ACTIONS.PLACE);
    assert.equal(decide('chào bạn'), ACTIONS.CHAT);
    assert.equal(decide('đi chơi'), ACTIONS.CLARIFY);
  });
  it('có lộ trình gốc + thao tác sửa => sửa; "lộ trình khác đi" => lên mới', () => {
    assert.equal(decide('bỏ điểm 2', { basePlan }), ACTIONS.EDIT);
    assert.equal(decide('về trước 10h tối nhé', { basePlan }), ACTIONS.EDIT);
    assert.equal(decide('thôi gợi ý lộ trình khác đi', { basePlan }), ACTIONS.PLAN);
  });
  it('vừa đưa 1 lộ trình đã lưu cho AI => mọi yêu cầu là sửa lộ trình đó', () => {
    assert.equal(decide('lộ trình này ổn không, thêm chỗ ăn vặt', { basePlan: { ...basePlan, source: 'itinerary' }, attachedNow: true }), ACTIONS.EDIT);
  });
  it('LLM lỗi, đoán bằng luật với câu dài => nhắc lại ý hiểu, hỏi xác nhận (đã hỏi rồi thì làm luôn)', () => {
    const text = 'Tối nay 2 người đi hẹn hò ở Quận 1, khoảng 500k/người, về trước 22h';
    const interpretation = understood(text);
    assert.equal(decideAction({ interpretation, source: 'rules', llmConfigured: true, askedBefore: false, continued: false, text }).action, ACTIONS.CONFIRM);
    assert.equal(decideAction({ interpretation, source: 'rules', llmConfigured: true, askedBefore: true, continued: false, text }).action, ACTIONS.PLAN);
    assert.equal(decideAction({ interpretation, source: 'rules', llmConfigured: false, askedBefore: false, continued: false, text }).action, ACTIONS.PLAN); // chưa có key => luật là chính, không hỏi
    assert.match(summarizeUnderstanding(interpretation), /về trước 22:00/);
  });
  it('trả lời câu hỏi xác nhận / chọn điểm không cần gọi LLM', () => {
    const interpretation = understood('đổi quán ăn thành quán lẩu', { previousCriteria: previous });
    assert.equal(answerPending({ kind: PENDING_KINDS.CONFIRM, interpretation }, 'Đúng rồi, làm luôn').interpretation, interpretation);
    assert.equal(answerPending({ kind: PENDING_KINDS.CONFIRM, interpretation }, 'không phải, nói lại'), null);
    const chosen = answerPending({ kind: PENDING_KINDS.EDIT_TARGET, interpretation, edit_index: 0, options: ['Nôm', 'Quán 5 Ngon'] }, 'Quán 5 Ngon');
    assert.equal(chosen.interpretation.edits[0].target_name, 'Quán 5 Ngon');
  });
  it('tìm "quán chay" 1 lần => chỉ GỢI Ý lưu ghi nhớ; tự nói "mình ăn chay" => không cần hỏi', () => {
    const asked = understood('tìm quán chay ở Quận 3');
    assert.equal(memoryOffer({ userId: 'u', memory: null, interpretation: asked, text: 'tìm quán chay ở Quận 3' }), 'Nhớ giúp mình là mình ăn chay');
    assert.equal(memoryOffer({ userId: 'u', memory: null, interpretation: asked, text: 'mình ăn chay, tìm quán ở Quận 3' }), null);
    assert.equal(memoryOffer({ userId: null, memory: null, interpretation: asked, text: 'tìm quán chay' }), null);
  });
});

describe('khuôn lộ trình 2 bữa', () => {
  it('"ăn trưa, đi chơi, rồi ăn tối" => chèn thêm điểm buổi chiều, bữa tối không bị bỏ', () => {
    const slots = composeSlots({ criteria: { sequence: ['meal', 'activity', 'meal'], start_time: '11:30', categories: [] } });
    assert.ok(slots.length >= 4);
    assert.equal(slots.at(-1).role, 'meal');
    assert.ok(slots.at(-1).estimated_time >= '16:00');
  });
  it('thứ tự ngắn không bị chèn thêm', () => {
    assert.equal(composeSlots({ criteria: { sequence: ['meal', 'drink'], start_time: '11:30', categories: [] } }).length, 2);
  });
});

describe('Agent kiểm tra', () => {
  const stop = (name, arrival, extra = {}) => ({ place: { id: name, name, category: 'food', cuisines: [] }, role: 'meal', arrival_time: arrival, open_on_arrival: true, distance_km: 1, travel: { segments: [] }, ...extra });
  const option = (end, stops = [stop('A', '18:30'), stop('B', '20:00')]) => ({ key: 'x', stops, summary: { start_time: '18:30', end_time: end, within_budget: true } });

  it('trễ giờ về (kể cả qua nửa đêm) => lỗi hard + hỏi đánh đổi', () => {
    const criteria = { end_by: '22:00', vehicle: 'bike' };
    const late = checkOption(option('00:01'), criteria);
    assert.equal(late[0].code, 'ENDS_TOO_LATE');
    assert.equal(late[0].minutes, 121);
    assert.deepEqual(checkOption(option('21:40'), criteria), []);
    const question = tradeoffQuestion({ ...option('22:20'), checks: checkOption(option('22:20'), criteria) }, criteria);
    assert.deepEqual(question.options, ['Bỏ điểm 2', 'Đi sớm hơn, lúc 18:00', 'Về trước 22:30 cũng được']);
  });
  it('bỏ phương án vi phạm nếu còn phương án đạt', () => {
    const result = verifyOptions([{ ...option('22:30'), key: 'late' }, { ...option('21:30'), key: 'ok' }], { end_by: '22:00', vehicle: 'bike' });
    assert.deepEqual(result.options.map((item) => item.key), ['ok']);
    assert.equal(result.failed, false);
  });
  it('nói "ăn trưa ... rồi ăn tối" mà phương án thiếu bữa tối => loại nếu còn phương án đủ bữa', () => {
    const lunch = stop('Phở', '11:30', { meal: 'lunch' });
    const dinner = stop('Lẩu', '17:00', { meal: 'dinner' });
    const criteria = { meals: ['lunch', 'dinner'], vehicle: 'bike' };
    const result = verifyOptions([{ ...option('14:00', [lunch]), key: 'thiếu' }, { ...option('18:00', [lunch, dinner]), key: 'đủ' }], criteria);
    assert.deepEqual(result.options.map((item) => item.key), ['đủ']);
    assert.equal(checkOption(option('14:00', [lunch]), criteria)[0].code, 'MEAL_MISSING');
  });
  it('ăn chay mà còn quán mặn / quán đóng cửa => cảnh báo (không loại)', () => {
    const codes = checkOption(option('21:00', [stop('Quán Chay Rêu', '18:30'), stop('Bún bò', '19:30', { open_on_arrival: false })]), { diet: 'chay', vehicle: 'bike' }).map((issue) => issue.code);
    assert.deepEqual(codes.sort(), ['CLOSED_ON_ARRIVAL', 'DIET_MISMATCH']);
  });
});
