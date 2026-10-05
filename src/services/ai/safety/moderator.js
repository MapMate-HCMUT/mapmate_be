// Bộ kiểm duyệt nhiều lớp cho mỗi tin nhắn gửi AI Planner (xem constants/aiSafety.js):
//   1. Luật trong code — bắt được là chặn ngay, không gọi Groq
//   2. Prompt Guard (chống "bypass" / jailbreak) + 3. gpt-oss-safeguard (theo chính sách) — chạy SONG SONG với nhau
//      và với bước hiểu yêu cầu => gần như không làm chậm lượt chat
// Kết quả: { blocked, category, source, detail } — chỉ nhãn, không lưu nội dung tin nhắn.
import { SAFETY_CATEGORIES } from '../../../constants/aiSafety.js';
import { isLlmConfigured } from '../llmClient.js';
import { checkJailbreak, checkPolicy } from './llmModeration.js';
import { moderateByRules } from './ruleModeration.js';

const pass = (detail) => ({ blocked: false, category: SAFETY_CATEGORIES.NONE, source: null, detail });

// Lớp 2 + 3 (gọi sau khi lớp 1 — moderateByRules — đã cho qua)
export const moderateWithModels = async (text) => {
  if (!isLlmConfigured()) return pass({ rules: 'none', llm: 'skipped' });

  const [jailbreak, policy] = await Promise.all([checkJailbreak(text), checkPolicy(text)]);
  const detail = { rules: 'none', prompt_guard: jailbreak?.score ?? null, safeguard: policy?.category ?? null };
  // Vi phạm chính sách (quyền riêng tư, tự hại...) ưu tiên hơn jailbreak để trả lời đúng trọng tâm
  if (policy && policy.category !== SAFETY_CATEGORIES.NONE) return { blocked: true, category: policy.category, source: policy.source, detail };
  if (jailbreak?.category === SAFETY_CATEGORIES.JAILBREAK) return { blocked: true, category: SAFETY_CATEGORIES.JAILBREAK, source: jailbreak.source, detail };
  return pass(detail);
};

// Đủ 3 lớp (VD kiểm tra ghi chú trước khi lưu)
export const moderateMessage = async (text) => {
  const byRules = moderateByRules(text);
  if (byRules) return { blocked: true, category: byRules.category, source: byRules.source, detail: { rules: byRules.category } };
  return moderateWithModels(text);
};
