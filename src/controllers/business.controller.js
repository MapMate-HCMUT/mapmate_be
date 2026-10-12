import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  addMyPlace,
  changeMyTier,
  findPossibleDuplicates,
  getFeaturedPlaces,
  getMyBusiness,
  getMyStats,
  listTiers,
  registerBusiness,
  removeMyPlace,
  trackPlaceEvent,
  updateMyBusiness,
  updateMyPlace,
} from '../services/business.service.js';
import { viewerKeyOf } from '../services/businessStats.service.js';
import {
  createMyPromotion,
  endMyPromotion,
  listMyPromotions,
  listMyReviews,
  notifyPromotionFollowers,
  replyToReview,
  updateMyPromotion,
} from '../services/businessTools.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const tiers = (_req, res) => sendSuccess(res, { data: listTiers() });

export const featured = asyncHandler(async (req, res) => sendSuccess(res, { data: await getFeaturedPlaces(req.validated.query, viewerKeyOf(req)) }));

export const duplicates = asyncHandler(async (req, res) => sendSuccess(res, { data: await findPossibleDuplicates(req.validated.query) }));

export const placeEvent = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await trackPlaceEvent(req.validated.params.id, req.validated.body.type, { userId: req.user?.id, viewerKey: viewerKeyOf(req) }) }));

export const register = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đăng ký doanh nghiệp thành công', data: await registerBusiness(req.user.id, req.validated.body) }));

export const me = asyncHandler(async (req, res) => sendSuccess(res, { data: await getMyBusiness(req.user.id) }));

export const updateMe = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã cập nhật hồ sơ doanh nghiệp', data: await updateMyBusiness(req.user.id, req.validated.body) }));

export const changeTier = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã đổi gói', data: await changeMyTier(req.user.id, req.validated.body.tier) }));

export const stats = asyncHandler(async (req, res) => sendSuccess(res, { data: await getMyStats(req.user.id, req.validated.query.days) }));

export const addPlace = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã thêm cửa hàng', data: await addMyPlace(req.user.id, req.validated.body) }));

export const updatePlace = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã lưu cửa hàng', data: await updateMyPlace(req.user.id, req.validated.params.id, req.validated.body) }));

export const removePlace = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã gỡ cửa hàng khỏi bản đồ', data: await removeMyPlace(req.user.id, req.validated.params.id) }));

export const promotions = asyncHandler(async (req, res) => sendSuccess(res, { data: await listMyPromotions(req.user.id) }));

export const createPromotion = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã tạo khuyến mãi', data: await createMyPromotion(req.user.id, req.validated.body) }));

export const updatePromotion = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã lưu khuyến mãi', data: await updateMyPromotion(req.user.id, req.validated.params.id, req.validated.body) }));

export const endPromotion = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã kết thúc khuyến mãi', data: await endMyPromotion(req.user.id, req.validated.params.id) }));

export const notifyPromotion = asyncHandler(async (req, res) => {
  const data = await notifyPromotionFollowers(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: data.notified ? `Đã báo cho ${data.notified} khách đã lưu quán` : 'Chưa có khách nào lưu quán của bạn', data });
});

export const reviews = asyncHandler(async (req, res) => sendSuccess(res, { data: await listMyReviews(req.user.id, req.validated.query) }));

export const replyReview = asyncHandler(async (req, res) => {
  const data = await replyToReview(req.user.id, req.validated.params.id, req.validated.body.text);
  return sendSuccess(res, { message: data.owner_reply ? 'Đã gửi phản hồi' : 'Đã xoá phản hồi', data });
});
