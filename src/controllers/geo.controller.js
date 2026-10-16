import { direction, geocode, reverseGeocode } from '../services/goong.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getGeocode = asyncHandler(async (req, res) => sendSuccess(res, { data: await geocode(req.validated.query.address) }));
export const getReverseGeocode = asyncHandler(async (req, res) => sendSuccess(res, { data: await reverseGeocode(req.validated.query) }));
export const getDirection = asyncHandler(async (req, res) => {
  const { origin_lat: originLat, origin_lng: originLng, dest_lat: destLat, dest_lng: destLng, vehicle } = req.validated.query;
  return sendSuccess(res, { data: await direction({ origin: { lat: originLat, lng: originLng }, destination: { lat: destLat, lng: destLng }, vehicle }) });
});
