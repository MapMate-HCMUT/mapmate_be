import { z } from 'zod';
import { AI_DEFAULT_TIER, AI_MAX_MUST_VISIT, AI_MODEL_TIERS, AI_PROMPT_MAX_LENGTH, AI_VEHICLE_VALUES } from '../../constants/ai.js';
import { PEOPLE_FILTER } from '../../constants/places.js';
import { objectId, objectIdList } from './common.validator.js';
import { tripCriteriaSchema } from './itinerary.validator.js';
import { interpretationSchema } from '../../services/ai/aiSchemas.js';
import { PENDING_KINDS } from '../../services/ai/pendingRequest.js';
import { latitude, longitude, priceAmount } from './place.validator.js';

// Người dùng gõ tự do; dài quá thì bộ lọc đầu vào tự cắt — ở đây chỉ chặn request bất thường (gấp đôi giới hạn).
const message = z.string('Bạn hãy nhập yêu cầu').trim().min(1, 'Bạn hãy nhập yêu cầu').max(AI_PROMPT_MAX_LENGTH * 2, `Yêu cầu tối đa ${AI_PROMPT_MAX_LENGTH} ký tự`);
const origin = z.object({ lat: latitude, lng: longitude, label: z.string().trim().max(120).optional() });
const tier = z.enum(Object.values(AI_MODEL_TIERS), 'Chế độ AI không hợp lệ').default(AI_DEFAULT_TIER);

// POST /api/ai/chat — Milestone 2: { message, sessionId, context }
export const aiChatSchema = z.object({
  message,
  session_id: objectId('Cuộc trò chuyện').nullable().optional(),
  // Khách chưa đăng nhập: không lưu phiên => gửi lại tiêu chí lượt trước để AI hiểu "rẻ hơn", "gần hơn"
  context: z
    .object({
      criteria: tripCriteriaSchema.nullable().optional(),
      must_visit_ids: objectIdList(AI_MAX_MUST_VISIT).optional(),
      // Yêu cầu đang chờ (lượt trước hỏi lại / từ chối) — kiểm tra lại đúng schema của Agent hiểu yêu cầu
      pending: z.object({ kind: z.enum(Object.values(PENDING_KINDS)), interpretation: interpretationSchema }).nullable().optional(),
    })
    .nullable()
    .optional(),
  origin: origin.nullable().optional(),
  model: tier,
});

// POST /api/ai/recommend — Milestone 2: { message, location, budget, vehicle, people }
export const aiRecommendSchema = z.object({
  message,
  location: origin.nullable().optional(),
  budget: priceAmount.nullable().optional(),
  vehicle: z.enum(AI_VEHICLE_VALUES).nullable().optional(),
  people: z.coerce.number().int().min(PEOPLE_FILTER.min).max(PEOPLE_FILTER.max).nullable().optional(),
  model: tier,
});
