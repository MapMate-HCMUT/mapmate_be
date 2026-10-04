import { AI_EXAMPLE_PROMPTS, AI_MODEL_DEFAULTS, AI_PROMPT_MAX_LENGTH, AI_DEFAULT_TIER } from '../constants/ai.js';
import { chatWithPlanner } from '../services/ai/aiPlanner.service.js';
import { deleteSession, getSession, listSessions } from '../services/ai/aiSession.service.js';
import { isLlmConfigured, resolveModelId } from '../services/ai/llmClient.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

// GET /api/ai/options — chế độ AI, câu mẫu, giới hạn (frontend không hardcode)
export const getAiOptions = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: {
      llm_enabled: isLlmConfigured(), // false => vẫn chạy bằng bộ hiểu câu theo luật
      default_model: AI_DEFAULT_TIER,
      models: Object.entries(AI_MODEL_DEFAULTS).map(([tier, model]) => ({ value: tier, label: model.label, description: model.description, model_id: resolveModelId(tier) })),
      examples: AI_EXAMPLE_PROMPTS,
      prompt_max_length: AI_PROMPT_MAX_LENGTH,
    },
  }),
);

export const chat = asyncHandler(async (req, res) => {
  const { message, session_id: sessionId, context, origin, model } = req.validated.body;
  const data = await chatWithPlanner({ userId: req.user?.id ?? null, message, sessionId, context, origin, tier: model });
  return sendSuccess(res, { data });
});

export const recommend = asyncHandler(async (req, res) => {
  const { message, location, budget, vehicle, people, model } = req.validated.body;
  const data = await chatWithPlanner({ userId: req.user?.id ?? null, message, origin: location, tier: model, hints: { budget, vehicle, people } });
  return sendSuccess(res, { data });
});

export const getMySessions = asyncHandler(async (req, res) => sendSuccess(res, { data: { items: await listSessions(req.user.id) } }));

export const getMySession = asyncHandler(async (req, res) => sendSuccess(res, { data: await getSession(req.user.id, req.validated.params.id) }));

export const removeMySession = asyncHandler(async (req, res) => {
  await deleteSession(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã xoá cuộc trò chuyện' });
});
