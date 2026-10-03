import { listMyPins, listPublicPins, removePin, setPin } from '../services/pin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getMyPins = asyncHandler(async (req, res) => sendSuccess(res, { data: await listMyPins(req.user.id, req.validated.query) }));
export const getUserPins = asyncHandler(async (req, res) => sendSuccess(res, { data: await listPublicPins(req.validated.params.id) }));

export const putPin = asyncHandler(async (req, res) => {
  const data = await setPin(req.user.id, req.validated.params.placeId, req.validated.body);
  return sendSuccess(res, { message: data.status === 'visited' ? 'Đã ghim vào danh sách Đã đi' : 'Đã ghim vào danh sách Muốn đi', data });
});

export const deletePin = asyncHandler(async (req, res) => {
  await removePin(req.user.id, req.validated.params.placeId);
  return sendSuccess(res, { message: 'Đã bỏ ghim' });
});
