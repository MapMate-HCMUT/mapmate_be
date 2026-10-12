import { assertBusinessUploadAllowed } from '../services/business.service.js';
import { createUploadSignature, getUploadConfig } from '../services/media.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

// GET /api/uploads/config — có bật đăng ảnh / video không + giới hạn + lượt còn lại hôm nay (nếu đã đăng nhập)
export const config = asyncHandler(async (req, res) => sendSuccess(res, { data: await getUploadConfig(req.user?.id ?? null) }));

// POST /api/uploads/signature — chữ ký tải 1 file thẳng lên Cloudinary.
// Ảnh / video cửa hàng (purpose = business) tính theo dung lượng gói doanh nghiệp, không theo lượt mỗi ngày.
export const signature = asyncHandler(async (req, res) => {
  const { resource_type: resourceType, purpose } = req.validated.body;
  const isBusiness = purpose === 'business';
  if (isBusiness) await assertBusinessUploadAllowed(req.user.id);
  return sendSuccess(res, { data: await createUploadSignature(req.user.id, resourceType, { dailyQuota: !isBusiness }) });
});
