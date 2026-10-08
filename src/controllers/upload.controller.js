import { createUploadSignature, getUploadConfig } from '../services/media.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

// GET /api/uploads/config — có bật đăng ảnh / video không + giới hạn (để giao diện kiểm tra trước khi tải)
export const config = asyncHandler(async (_req, res) => sendSuccess(res, { data: getUploadConfig() }));

// POST /api/uploads/signature — chữ ký tải 1 file thẳng lên Cloudinary
export const signature = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: createUploadSignature(req.user.id, req.validated.body.resource_type) }));
