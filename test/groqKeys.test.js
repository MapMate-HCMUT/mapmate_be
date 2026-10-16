// Xoay vòng nhiều key Groq: key bị 429 nghỉ tới khi được gọi lại, lượt sau dùng key khác; hết key => lỗi để pipeline dùng bản dự phòng.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.JWT_SECRET ??= 'test-only-secret'; // env.js bắt buộc có — test này không đụng tới đăng nhập
const { env } = await import('../src/config/env.js');
const { acquireGroqSlot, coolDownGroqKey, LlmError } = await import('../src/services/ai/llmClient.js');

describe('xoay vòng key Groq', () => {
  it('chia đều lượt gọi cho các key, key bị 429 thì bỏ qua tới khi hết thời gian nghỉ', () => {
    env.llm.apiKeys = ['key-a', 'key-b'];
    const model = 'test-model-rotation';
    const first = acquireGroqSlot(model);
    const second = acquireGroqSlot(model);
    assert.notEqual(first.index, second.index);
    coolDownGroqKey(first.index, model, 60000);
    assert.equal(acquireGroqSlot(model).index, second.index);
    assert.equal(acquireGroqSlot(model).index, second.index);
    coolDownGroqKey(second.index, model, 60000);
    assert.throws(() => acquireGroqSlot(model), LlmError);
  });
  it('bỏ qua key đã thử trong cùng 1 lượt gọi', () => {
    env.llm.apiKeys = ['key-a', 'key-b'];
    const slot = acquireGroqSlot('test-model-exclude', { exclude: new Set([0]) });
    assert.equal(slot.index, 1);
  });
});
