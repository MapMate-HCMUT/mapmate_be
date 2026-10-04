import { DEFAULT_ORIGIN } from '../constants/places.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ITINERARY_LIST_LIMIT, ITINERARY_VISIBILITY } from '../constants/social.js';
import Itinerary from '../models/Itinerary.model.js';
import { AppError } from '../utils/AppError.js';
import { areFriends } from './friend.service.js';
import { resolveModes } from '../utils/transport.js';
import { buildPlan } from './itineraryPlanner.service.js';
import { getPlacesByIds } from './place.service.js';

const notFound = () => new AppError('Không tìm thấy lộ trình', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.ITINERARY_NOT_FOUND);
// Mức độ công khai tăng dần — dùng khi chia sẻ lộ trình lên bảng tin.
const VISIBILITY_RANK = { [ITINERARY_VISIBILITY.PRIVATE]: 0, [ITINERARY_VISIBILITY.FRIENDS]: 1, [ITINERARY_VISIBILITY.PUBLIC]: 2 };

export const toItineraryView = (itinerary, viewerId) => ({
  id: itinerary._id,
  user_id: itinerary.user_id,
  name: itinerary.name,
  status: itinerary.status,
  vehicle: itinerary.vehicle,
  people: itinerary.people ?? 1,
  start_time: itinerary.start_time ?? '',
  total_cost: itinerary.total_cost,
  total_duration: itinerary.total_duration,
  total_distance_km: itinerary.total_distance_km ?? 0,
  visibility: itinerary.visibility ?? ITINERARY_VISIBILITY.PRIVATE,
  tags: itinerary.tags ?? [],
  criteria: itinerary.criteria ?? null,
  cloned_from: itinerary.cloned_from ?? null,
  transport_modes: itinerary.transport_modes ?? [],
  summary: itinerary.summary ?? null,
  created_at: itinerary.created_at,
  is_mine: viewerId ? String(itinerary.user_id) === String(viewerId) : false,
  stops: (itinerary.stops ?? []).map((stop) => ({
    id: stop._id,
    place_id: stop.place_id,
    place_name: stop.place_name,
    category: stop.category,
    address: stop.address,
    coordinates: stop.coordinates?.length === 2 ? { lng: stop.coordinates[0], lat: stop.coordinates[1] } : null,
    arrival_time: stop.arrival_time,
    stay_minutes: stop.stay_minutes,
    travel_minutes: stop.travel_minutes,
    distance_km: stop.distance_km,
    est_cost: stop.est_cost,
    travel: stop.travel ?? null,
    checked_in: stop.checked_in,
  })),
});

const planToStops = (plan) =>
  plan.stops.map((stop) => ({
    place_id: stop.place.id,
    place_name: stop.place.name,
    category: stop.place.category,
    address: stop.place.address,
    coordinates: [stop.place.coordinates.lng, stop.place.coordinates.lat],
    arrival_time: stop.arrival_time,
    stay_minutes: stop.stay_minutes,
    travel_minutes: stop.travel_minutes,
    distance_km: stop.distance_km,
    est_cost: stop.est_cost,
    travel: stop.travel,
  }));

// POST /api/itineraries — client chỉ gửi danh sách địa điểm theo thứ tự; giờ giấc & chi phí do server tính lại.
export const createItinerary = async (userId, input) => {
  const { name, place_ids: placeIds, vehicle, transport_modes: transportModes, people, start_time: startTime, origin, criteria, tags, visibility, stay_overrides: stayOverrides = {} } = input;
  const places = await getPlacesByIds(placeIds);
  // stay_overrides = thời gian ở lại người dùng đang thấy (gợi ý đã kéo dài / tự chỉnh ±15′) => lưu đúng như vậy
  const plan = buildPlan(places, {
    origin, startTime, people,
    modes: resolveModes(vehicle, transportModes),
    tripBudget: criteria?.trip_budget ?? null,
    durationHours: criteria?.duration_hours ?? null,
  }, { stayOverrides });

  const itinerary = await Itinerary.create({
    user_id: userId, name, vehicle, people, tags, visibility,
    transport_modes: transportModes,
    start_time: startTime,
    criteria: criteria ?? null,
    stops: planToStops(plan),
    summary: plan.summary,
    total_cost: plan.summary.total_cost,
    total_duration: plan.summary.total_minutes,
    total_distance_km: plan.summary.total_distance_km,
  });
  return toItineraryView(itinerary.toObject(), userId);
};

export const listMyItineraries = async (userId) => {
  const rows = await Itinerary.find({ user_id: userId }).sort({ created_at: -1 }).limit(ITINERARY_LIST_LIMIT).lean();
  return { items: rows.map((row) => toItineraryView(row, userId)) };
};

const canView = async (itinerary, viewerId) => {
  if (viewerId && String(itinerary.user_id) === String(viewerId)) return true;
  if (itinerary.visibility === ITINERARY_VISIBILITY.PUBLIC) return true;
  return itinerary.visibility === ITINERARY_VISIBILITY.FRIENDS && Boolean(viewerId) && areFriends(itinerary.user_id, viewerId);
};

// Trả 404 (không phải 403) khi không có quyền xem => không lộ việc lộ trình riêng tư có tồn tại.
export const getItinerary = async (itineraryId, viewerId) => {
  const itinerary = await Itinerary.findById(itineraryId).lean();
  if (!itinerary || !(await canView(itinerary, viewerId))) throw notFound();
  return toItineraryView(itinerary, viewerId);
};

export const updateItinerary = async (userId, itineraryId, input) => {
  const existing = await Itinerary.findOne({ _id: itineraryId, user_id: userId });
  if (!existing) throw notFound();

  const changes = { ...input };

  if (input.place_ids?.length) {
    const placeIds = input.place_ids;
    const places = await getPlacesByIds(placeIds);
    const vehicle = input.vehicle ?? existing.vehicle;
    const transportModes = input.transport_modes ?? existing.transport_modes ?? [];
    const people = input.people ?? existing.people ?? 1;
    const startTime = input.start_time ?? existing.start_time ?? '09:00';
    const origin = input.origin ?? input.criteria?.origin ?? existing.criteria?.origin ?? DEFAULT_ORIGIN;
    const criteria = input.criteria !== undefined ? input.criteria : existing.criteria;
    const stayOverrides = input.stay_overrides ?? {};

    const plan = buildPlan(places, {
      origin, startTime, people,
      modes: resolveModes(vehicle, transportModes),
      tripBudget: criteria?.trip_budget ?? null,
      durationHours: criteria?.duration_hours ?? null,
    }, { stayOverrides });

    changes.stops = planToStops(plan);
    changes.summary = plan.summary;
    changes.total_cost = plan.summary.total_cost;
    changes.total_duration = plan.summary.total_minutes;
    changes.total_distance_km = plan.summary.total_distance_km;
    if (input.criteria !== undefined) changes.criteria = criteria;
    if (input.vehicle) changes.vehicle = vehicle;
    if (input.transport_modes) changes.transport_modes = transportModes;
    if (input.people) changes.people = people;
    if (input.start_time) changes.start_time = startTime;
  }
  delete changes.place_ids;
  delete changes.stay_overrides;
  delete changes.origin;

  const itinerary = await Itinerary.findOneAndUpdate(
    { _id: itineraryId, user_id: userId },
    { $set: changes },
    { returnDocument: 'after', runValidators: true }
  ).lean();

  if (!itinerary) throw notFound();
  return toItineraryView(itinerary, userId);
};

export const deleteItinerary = async (userId, itineraryId) => {
  const result = await Itinerary.deleteOne({ _id: itineraryId, user_id: userId });
  if (result.deletedCount === 0) throw notFound();
};

// "Dùng lộ trình này": sao chép lộ trình người khác chia sẻ về tài khoản mình (riêng tư, chưa check-in).
export const cloneItinerary = async (userId, itineraryId) => {
  const source = await Itinerary.findById(itineraryId).lean();
  if (!source || !(await canView(source, userId))) throw notFound();

  const copy = await Itinerary.create({
    user_id: userId,
    name: source.name,
    vehicle: source.vehicle,
    transport_modes: source.transport_modes,
    summary: source.summary,
    people: source.people,
    start_time: source.start_time,
    criteria: source.criteria,
    tags: source.tags,
    total_cost: source.total_cost,
    total_duration: source.total_duration,
    total_distance_km: source.total_distance_km,
    visibility: ITINERARY_VISIBILITY.PRIVATE,
    cloned_from: source._id,
    stops: source.stops.map(({ _id, checked_in: _checkedIn, ...stop }) => stop),
  });
  return toItineraryView(copy.toObject(), userId);
};

// Khi đăng lộ trình lên bảng tin: nâng mức công khai của lộ trình cho bằng bài viết (không bao giờ hạ xuống).
export const ensureItineraryShareable = async (userId, itineraryId, postVisibility) => {
  const itinerary = await Itinerary.findOne({ _id: itineraryId, user_id: userId });
  if (!itinerary) throw notFound();
  if (VISIBILITY_RANK[itinerary.visibility] < VISIBILITY_RANK[postVisibility]) {
    itinerary.visibility = postVisibility;
    await itinerary.save();
  }
  return itinerary;
};
