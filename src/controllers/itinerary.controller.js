import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  cloneItinerary,
  createItinerary,
  deleteItinerary,
  getItinerary,
  listMyItineraries,
  updateItinerary,
} from '../services/itinerary.service.js';
import { previewItinerary, suggestItineraries } from '../services/itineraryPlanner.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const suggest = asyncHandler(async (req, res) => {
  const { criteria, place_ids: placeIds } = req.validated.body;
  const data = await suggestItineraries(criteria, placeIds);
  return sendSuccess(res, { message: `Đã gợi ý ${data.options.length} lộ trình`, data });
});

export const preview = asyncHandler(async (req, res) => {
  const { criteria, place_ids: placeIds, keep_order: keepOrder, stay_overrides: stayOverrides } = req.validated.body;
  return sendSuccess(res, { data: await previewItinerary(criteria, placeIds, { keepOrder, stayOverrides }) });
});

export const create = asyncHandler(async (req, res) => {
  const data = await createItinerary(req.user.id, req.validated.body);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã lưu lộ trình', data });
});

export const listMine = asyncHandler(async (req, res) => sendSuccess(res, { data: await listMyItineraries(req.user.id) }));

export const getOne = asyncHandler(async (req, res) => sendSuccess(res, { data: await getItinerary(req.validated.params.id, req.user?.id) }));

export const update = asyncHandler(async (req, res) => {
  const data = await updateItinerary(req.user.id, req.validated.params.id, req.validated.body);
  return sendSuccess(res, { message: 'Đã cập nhật lộ trình', data });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteItinerary(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã xoá lộ trình' });
});

export const clone = asyncHandler(async (req, res) => {
  const data = await cloneItinerary(req.user.id, req.validated.params.id);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã lưu lộ trình về tài khoản của bạn', data });
});
