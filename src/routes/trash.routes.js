import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { deleteTrashItem, emptyTrash, listTrash, restoreTrashItem } from '../services/trash.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

// Thùng rác của người đang đăng nhập: bài viết + ảnh / video đã xoá (giữ 30 ngày)
export const trashRouter = Router();
const itemId = validate({ params: idParam() });

trashRouter.use(requireAuth);
trashRouter.get('/', asyncHandler(async (req, res) => sendSuccess(res, { data: await listTrash(req.user.id) })));
trashRouter.delete('/', asyncHandler(async (req, res) => sendSuccess(res, { data: await emptyTrash(req.user.id), message: 'Đã dọn sạch thùng rác' })));
trashRouter.post('/:id/restore', itemId, asyncHandler(async (req, res) => sendSuccess(res, { data: await restoreTrashItem(req.user.id, req.validated.params.id), message: 'Đã khôi phục' })));
trashRouter.delete('/:id', itemId, asyncHandler(async (req, res) => {
  await deleteTrashItem(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã xoá vĩnh viễn' });
}));
