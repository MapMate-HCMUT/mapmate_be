import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PIN_STATUS } from '../constants/social.js';
import Place from '../models/Place.model.js';
import { PlacePin } from '../models/placePin.model.js';
import { AppError } from '../utils/AppError.js';
import { toPlaceView } from './place.service.js';

const toPinView = (pin) => ({
  id: pin._id,
  status: pin.status,
  note: pin.note,
  rating: pin.rating,
  visited_on: pin.visited_on,
  updated_at: pin.updated_at,
  place: pin.place_id?.name ? toPlaceView(pin.place_id) : null,
});

const loadPins = async (filter) => {
  const pins = await PlacePin.find(filter).sort({ updated_at: -1 }).populate('place_id').lean();
  return pins.map(toPinView).filter((pin) => pin.place); // bỏ ghim của địa điểm đã bị xoá
};

// PUT /api/pins/:placeId — ghim mới hoặc đổi trạng thái/ghi chú (mỗi người 1 ghim / địa điểm).
export const setPin = async (userId, placeId, changes) => {
  if (!(await Place.exists({ _id: placeId }))) {
    throw new AppError('Không tìm thấy địa điểm', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  }
  const pin = await PlacePin.findOneAndUpdate(
    { user_id: userId, place_id: placeId },
    { $set: changes },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).populate('place_id').lean();
  return toPinView(pin);
};

export const removePin = async (userId, placeId) => {
  await PlacePin.deleteOne({ user_id: userId, place_id: placeId });
};

export const listMyPins = async (userId, { status }) => ({ items: await loadPins({ user_id: userId, ...(status && { status }) }) });

// Hồ sơ công khai chỉ hiện những nơi ĐÃ ĐI (danh sách "muốn đi" là riêng tư).
export const listPublicPins = async (targetUserId) => ({ items: await loadPins({ user_id: targetUserId, status: PIN_STATUS.VISITED }) });
