// Tài khoản doanh nghiệp: đăng ký, quản lý cửa hàng (vị trí chọn trên bản đồ, ảnh / video), đổi gói, thống kê.
// Quyền lợi từng gói nằm ở constants/business.js; Place.promo là bản chép quyền lợi để xếp hạng chỉ đọc 1 collection.
import { BUSINESS_BILLING_MODE, BUSINESS_ERROR_CODES, BUSINESS_LIMITS, BUSINESS_TIER_PERKS, BUSINESS_TIER_VALUES, USER_ROLES } from '../constants/business.js';
import { PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { OPEN_DATA_BBOX, PLACE_SOURCES } from '../constants/openData.js';
import { POST_VISIBILITY } from '../constants/social.js';
import { CLOSED_BY, PLACE_STATUS } from '../constants/places.js';
import { Business } from '../models/business.model.js';
import Place, { buildPlaceSearchText } from '../models/Place.model.js';
import { Post } from '../models/post.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { normalizeDistrict } from '../utils/district.js';
import { createMemoryCache } from '../utils/memoryCache.js';
import { normalizeSearchText } from '../utils/text.js';
import { summarizeWeek } from '../utils/weeklyHours.js';
import { getBusinessStats, recordBusinessEvent } from './businessStats.service.js';
import { attachGalleryMedia, deleteMedia, getBusinessStorageUsed, verifyNewMedia } from './media.service.js';
import { toPlaceView } from './place.service.js';
import { toPublicProfile } from './user.service.js';

const METERS_PER_KM = 1000;
const DISTRICT_LOOKUP_RADIUS_M = 2000;
const MB = 1024 * 1024;
const toMb = (bytes) => Math.ceil(bytes / MB);
export const ACTIVE = { $ne: PLACE_STATUS.CLOSED };

// Bài đánh giá về cửa hàng: chỉ bài công khai (bài "bạn bè" là riêng tư với chủ quán), không tính bài đăng lại
export const reviewFilter = (placeIds) => ({ place_id: { $in: placeIds }, visibility: POST_VISIBILITY.PUBLIC, is_repost: { $ne: true } });
export const NO_REPLY = { $or: [{ owner_reply: { $exists: false } }, { 'owner_reply.text': { $in: [null, ''] } }] };

export const perksOf = (tier) => BUSINESS_TIER_PERKS[tier] ?? BUSINESS_TIER_PERKS.basic;

/** Quyền lợi chép vào Place.promo (hàm thuần) */
export const promoFor = (tier) => {
  const perks = perksOf(tier);
  return { tier, boost: perks.boost, reach_m: perks.reach_km * METERS_PER_KM, featured: perks.featured, highlight: perks.highlight_marker };
};

export const businessError = (message, status, code, details) => new AppError(message, status, code, details);
const businessRequired = () =>
  businessError('Bạn cần đăng ký tài khoản doanh nghiệp trước', HTTP_STATUS.FORBIDDEN, BUSINESS_ERROR_CODES.BUSINESS_REQUIRED);
const placeNotFound = () =>
  businessError('Không tìm thấy cửa hàng này trong tài khoản của bạn', HTTP_STATUS.NOT_FOUND, BUSINESS_ERROR_CODES.BUSINESS_PLACE_NOT_FOUND);

// ── Bảng gói (công khai) ──
const tierView = (value) => {
  const perks = perksOf(value);
  return {
    value,
    label: perks.label,
    price_vnd: perks.price_vnd,
    max_places: perks.max_places,
    storage_bytes: perks.storage_bytes,
    gallery_items: perks.gallery_items,
    gallery_videos: perks.gallery_videos,
    reach_km: perks.reach_km,
    featured: perks.featured,
    highlight_marker: perks.highlight_marker,
    stats_days: perks.stats_days,
    max_promotions: perks.max_promotions,
    notify_per_week: perks.notify_per_week,
    highlights: perks.highlights,
  };
};
export const listTiers = () => ({ tiers: BUSINESS_TIER_VALUES.map(tierView), billing_mode: BUSINESS_BILLING_MODE });

// ── Kiểm tra dữ liệu cửa hàng ──
const isInServiceArea = ({ lat, lng }) =>
  lng >= OPEN_DATA_BBOX.west && lng <= OPEN_DATA_BBOX.east && lat >= OPEN_DATA_BBOX.south && lat <= OPEN_DATA_BBOX.north;

const assertInServiceArea = (coordinates) => {
  if (isInServiceArea(coordinates)) return;
  throw businessError('MapMate hiện chỉ phục vụ khu vực TP.HCM — bạn chọn lại vị trí cửa hàng giúp mình nhé', HTTP_STATUS.BAD_REQUEST,
    BUSINESS_ERROR_CODES.OUTSIDE_SERVICE_AREA, [{ field: 'coordinates', message: 'Vị trí nằm ngoài TP.HCM' }]);
};

// Quận: lấy từ địa chỉ (Goong) nếu nhận ra được, không thì theo địa điểm gần nhất đã biết quận
const resolveDistrict = async (rawDistrict, { lat, lng }) => {
  const named = normalizeDistrict(rawDistrict);
  if (named) return named;
  const nearest = await Place.findOne(
    { district: { $nin: [null, ''] }, location: { $nearSphere: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: DISTRICT_LOOKUP_RADIUS_M } } },
    { district: 1 },
  ).lean();
  return nearest?.district ?? '';
};

// Dữ liệu cửa hàng (đã qua validator) -> các trường của Place
const toPlaceFields = async (input, business) => {
  const fields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.category !== undefined) fields.category = input.category;
  if (input.description !== undefined) fields.description = input.description || null;
  if (input.specialties !== undefined) fields.specialties = input.specialties;
  if (input.price_range !== undefined) {
    fields.price_range = input.price_range ?? { min: 0, max: 0 };
    fields.price_estimated = false;
  }
  if (input.weekly_hours !== undefined) {
    // null = chưa công khai giờ (chưa rõ); có lịch => opening_hours = khung đại diện cho bộ lọc / AI
    fields.weekly_hours = input.weekly_hours;
    fields.opening_hours = (input.weekly_hours && summarizeWeek(input.weekly_hours)) ?? { open: null, close: null };
    fields.hours_known = Boolean(input.weekly_hours);
  } else if (input.opening_hours !== undefined) {
    fields.opening_hours = input.opening_hours ?? { open: null, close: null };
    fields.hours_known = Boolean(input.opening_hours); // chủ quán bỏ trống = chưa rõ, KHÔNG phải mở cả ngày
  }
  if (input.phone !== undefined || input.website !== undefined) {
    fields.contact = { phone: input.phone ?? business.phone ?? null, website: input.website ?? business.website ?? null, facebook: null };
  }
  if (input.coordinates) {
    assertInServiceArea(input.coordinates);
    fields.location = { type: 'Point', coordinates: [input.coordinates.lng, input.coordinates.lat] };
    fields.district = await resolveDistrict(input.district, input.coordinates);
  }
  if (input.address !== undefined) fields.address = input.address;
  if (input.notice !== undefined) fields.owner_notice = input.notice; // null = gỡ thông báo
  return fields;
};

const activePlaceCount = (businessId) => Place.countDocuments({ business_id: businessId, status: ACTIVE });

const assertPlaceSlot = async (business) => {
  const perks = perksOf(business.tier);
  if ((await activePlaceCount(business._id)) < perks.max_places) return;
  throw businessError(`Gói ${perks.label} có tối đa ${perks.max_places} cửa hàng — nâng gói để thêm cửa hàng`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_PLACE_LIMIT);
};

const createPlace = async (business, input) => {
  const fields = await toPlaceFields(input, business);
  return Place.create({
    ...fields,
    contact: fields.contact ?? { phone: business.phone, website: business.website, facebook: null },
    hours_known: fields.hours_known ?? false,
    source: PLACE_SOURCES.BUSINESS,
    confidence: 1,
    cached_at: new Date(),
    business_id: business._id,
    promo: promoFor(business.tier),
  });
};

export const getOwnBusiness = async (userId) => {
  const business = await Business.findOne({ owner_id: userId }).lean();
  if (!business) throw businessRequired();
  return business;
};

const getOwnPlace = async (business, placeId) => {
  const place = await Place.findOne({ _id: placeId, business_id: business._id, status: ACTIVE }).lean();
  if (!place) throw placeNotFound();
  return place;
};

// ── Đăng ký ──
/** POST /api/businesses — tạo hồ sơ doanh nghiệp + cửa hàng đầu tiên, đổi vai trò tài khoản thành "business" */
export const registerBusiness = async (userId, { place: placeInput, tier, ...profile }) => {
  if (await Business.exists({ owner_id: userId })) {
    throw businessError('Tài khoản này đã đăng ký doanh nghiệp', HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_EXISTS);
  }
  assertInServiceArea(placeInput.coordinates); // kiểm tra trước khi tạo gì => không để lại hồ sơ dở dang
  const business = (await Business.create({ owner_id: userId, ...profile, tier, tier_changed_at: new Date() })).toObject();
  try {
    await createPlace(business, placeInput);
  } catch (error) {
    await Business.deleteOne({ _id: business._id }); // tạo cửa hàng lỗi => huỷ hồ sơ để đăng ký lại được
    throw error;
  }
  const user = await User.findByIdAndUpdate(userId, { $set: { role: USER_ROLES.BUSINESS } }, { returnDocument: 'after' }).lean();
  return { ...(await getMyBusiness(userId)), profile: toPublicProfile(user) };
};

// ── Trang quản lý ──
const businessView = (business) => ({
  id: business._id,
  name: business.name,
  description: business.description ?? null,
  phone: business.phone ?? null,
  website: business.website ?? null,
  tier: business.tier,
  tier_changed_at: business.tier_changed_at ?? null,
  created_at: business.created_at,
});

/** GET /api/businesses/me — hồ sơ + gói + mức sử dụng + cửa hàng (kèm số liệu 7 ngày) */
export const getMyBusiness = async (userId) => {
  const business = await getOwnBusiness(userId);
  const perks = perksOf(business.tier);
  const [places, storageUsed, stats] = await Promise.all([
    Place.find({ business_id: business._id, status: ACTIVE }).sort({ created_at: 1 }).lean(),
    getBusinessStorageUsed(business._id),
    getBusinessStats(business._id, Math.min(7, perks.stats_days)),
  ]);
  const unreplied = places.length ? await Post.countDocuments({ ...reviewFilter(places.map((place) => place._id)), ...NO_REPLY }) : 0;
  return {
    business: businessView(business),
    tier: tierView(business.tier),
    billing_mode: BUSINESS_BILLING_MODE,
    usage: {
      places: places.length,
      max_places: perks.max_places,
      storage_used_bytes: storageUsed,
      storage_bytes: perks.storage_bytes,
    },
    places: places.map((place) => ({ ...toPlaceView(place), stats_7d: stats.by_place[String(place._id)] ?? { views: 0, impressions: 0, directions: 0 } })),
    stats_7d: stats.totals,
    unreplied_reviews: unreplied, // huy hiệu trên menu "Đánh giá"
  };
};

/** PATCH /api/businesses/me — tên, mô tả, liên hệ của doanh nghiệp */
export const updateMyBusiness = async (userId, changes) => {
  const business = await Business.findOneAndUpdate({ owner_id: userId }, { $set: changes }, { returnDocument: 'after', runValidators: true }).lean();
  if (!business) throw businessRequired();
  return { business: businessView(business) };
};

// ── Cửa hàng ──
/** POST /api/businesses/me/places */
export const addMyPlace = async (userId, input) => {
  const business = await getOwnBusiness(userId);
  await assertPlaceSlot(business);
  const place = await createPlace(business, input);
  return { place: toPlaceView(place.toObject()) };
};

// Bộ sưu tập mới = giữ lại file cũ có trong danh sách + kiểm tra file mới; file bị bỏ ra sẽ bị xoá khỏi Cloudinary
const planGallery = async (userId, business, place, wanted) => {
  const perks = perksOf(business.tier);
  if (wanted.length > perks.gallery_items) {
    throw businessError(`Gói ${perks.label}: tối đa ${perks.gallery_items} ảnh / video mỗi cửa hàng`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_GALLERY_LIMIT);
  }
  if (wanted.filter((item) => item.resource_type === 'video').length > perks.gallery_videos) {
    throw businessError(`Gói ${perks.label}: tối đa ${perks.gallery_videos} video mỗi cửa hàng`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_GALLERY_LIMIT);
  }
  const current = new Map((place.gallery ?? []).map((item) => [item.public_id, item]));
  const added = await verifyNewMedia(userId, wanted.filter((item) => !current.has(item.public_id)));
  const addedById = new Map(added.map((item) => [item.public_id, item]));
  const gallery = wanted.map((item) => current.get(item.public_id) ?? addedById.get(item.public_id));
  const keep = new Set(gallery.map((item) => item.public_id));
  const removed = [...current.values()].filter((item) => !keep.has(item.public_id));

  const addingBytes = added.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  if (addingBytes > 0) {
    const used = await getBusinessStorageUsed(business._id);
    const freed = removed.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
    if (used - freed + addingBytes > perks.storage_bytes) {
      const left = Math.max(0, perks.storage_bytes - used + freed);
      throw businessError(`Gói ${perks.label} còn trống ${toMb(left)}MB — bỏ bớt file hoặc nâng gói nhé`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_STORAGE_LIMIT);
    }
  }
  return { gallery, added, removed };
};

/** PATCH /api/businesses/me/places/:id — sửa thông tin, dời vị trí, cập nhật bộ sưu tập ảnh / video */
export const updateMyPlace = async (userId, placeId, { gallery: wantedGallery, ...input }) => {
  const business = await getOwnBusiness(userId);
  const place = await getOwnPlace(business, placeId);
  const fields = await toPlaceFields(input, business);
  const galleryPlan = wantedGallery ? await planGallery(userId, business, place, wantedGallery) : null;
  if (galleryPlan) fields.gallery = galleryPlan.gallery;
  if (!Object.keys(fields).length) {
    throw businessError('Không có thông tin nào để cập nhật', HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.NOTHING_TO_UPDATE);
  }
  const merged = { ...place, ...fields };
  fields.search_text = buildPlaceSearchText(merged); // findOneAndUpdate không chạy hook pre('save')
  fields.cached_at = new Date();

  const updated = await Place.findOneAndUpdate({ _id: place._id }, { $set: fields }, { returnDocument: 'after', runValidators: true }).lean();
  if (galleryPlan) {
    await attachGalleryMedia(place._id, business._id, galleryPlan.added);
    await deleteMedia(galleryPlan.removed);
  }
  return { place: toPlaceView(updated) };
};

/** DELETE /api/businesses/me/places/:id — gỡ cửa hàng khỏi bản đồ (giữ bản ghi vì lộ trình cũ có thể đang dùng) */
export const removeMyPlace = async (userId, placeId) => {
  const business = await getOwnBusiness(userId);
  const place = await getOwnPlace(business, placeId);
  await Place.updateOne({ _id: place._id }, {
    $set: { status: PLACE_STATUS.CLOSED, closed_by: CLOSED_BY.OWNER, status_changed_at: new Date(), gallery: [] },
    $unset: { promo: 1, promotions: 1, owner_notice: 1 },
  });
  await deleteMedia(place.gallery ?? []);
  return { removed: true };
};

// ── Đổi gói ──
/** Lý do không hạ được xuống gói `tier` với hiện trạng, hoặc null (hàm thuần — dễ kiểm thử) */
export const downgradeProblem = (tier, { places, storageUsed, galleries }) => {
  const perks = perksOf(tier);
  if (places > perks.max_places) return `Gói ${perks.label} chỉ có ${perks.max_places} cửa hàng — bạn đang có ${places}, gỡ bớt trước khi đổi gói`;
  if (storageUsed > perks.storage_bytes) return `Gói ${perks.label} có ${toMb(perks.storage_bytes)}MB — bạn đang dùng ${toMb(storageUsed)}MB, xoá bớt ảnh / video trước khi đổi gói`;
  const crowded = galleries.find((gallery) => gallery.items > perks.gallery_items || gallery.videos > perks.gallery_videos);
  if (crowded) return `Cửa hàng "${crowded.name}" có nhiều ảnh / video hơn mức của gói ${perks.label} (${perks.gallery_items} file, ${perks.gallery_videos} video)`;
  return null;
};

/** PATCH /api/businesses/me/tier — bản demo: đổi ngay, chưa thu tiền (BUSINESS_BILLING_MODE) */
export const changeMyTier = async (userId, tier) => {
  const business = await getOwnBusiness(userId);
  if (business.tier !== tier) {
    const [places, storageUsed] = await Promise.all([
      Place.find({ business_id: business._id, status: ACTIVE }, { name: 1, gallery: 1 }).lean(),
      getBusinessStorageUsed(business._id),
    ]);
    const galleries = places.map((place) => ({
      name: place.name,
      items: place.gallery?.length ?? 0,
      videos: (place.gallery ?? []).filter((item) => item.resource_type === 'video').length,
    }));
    const problem = downgradeProblem(tier, { places: places.length, storageUsed, galleries });
    if (problem) throw businessError(problem, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_DOWNGRADE_BLOCKED);

    await Business.updateOne({ _id: business._id }, { $set: { tier, tier_changed_at: new Date() } });
    await Place.updateMany({ business_id: business._id, status: ACTIVE }, { $set: { promo: promoFor(tier) } });
  }
  return getMyBusiness(userId);
};

// ── Thống kê ──
/** GET /api/businesses/me/stats?days= — tối đa theo gói (7 / 30 / 90 ngày) */
export const getMyStats = async (userId, days) => {
  const business = await getOwnBusiness(userId);
  const allowed = perksOf(business.tier).stats_days;
  return { ...(await getBusinessStats(business._id, Math.min(days ?? allowed, allowed))), max_days: allowed };
};

// ── Công khai ──
const placeOwnerCache = createMemoryCache(10 * 60 * 1000);
const getPlaceOwner = (placeId) =>
  placeOwnerCache.wrap(String(placeId), async () => {
    const place = await Place.findOne({ _id: placeId, business_id: { $ne: null } }, { business_id: 1 }).lean();
    if (!place) return null;
    const business = await Business.findById(place.business_id, { owner_id: 1 }).lean();
    return business ? { _id: place._id, business_id: place.business_id, owner_id: String(business.owner_id) } : null;
  });

/** POST /api/businesses/places/:id/events — người dùng mở thẻ chi tiết / bấm chỉ đường tới cửa hàng (chủ quán tự xem không tính) */
export const trackPlaceEvent = async (placeId, event, { userId, viewerKey }) => {
  const owner = await getPlaceOwner(placeId);
  if (owner && owner.owner_id !== String(userId)) recordBusinessEvent([owner], event, viewerKey);
  return { tracked: Boolean(owner) };
};

/** GET /api/businesses/featured — cửa hàng gói Nổi bật quanh người dùng (trong bán kính của gói), xoay vòng ngẫu nhiên */
export const getFeaturedPlaces = async ({ lat, lng, limit }, viewerKey) => {
  const maxReach = Math.max(...BUSINESS_TIER_VALUES.map((tier) => perksOf(tier).reach_km)) * METERS_PER_KM;
  const places = await Place.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance_m',
        maxDistance: maxReach,
        query: { 'promo.featured': true, status: PLACE_STATUS.ACTIVE },
        spherical: true,
      },
    },
    { $match: { $expr: { $lte: ['$distance_m', '$promo.reach_m'] } } },
    { $sample: { size: limit } },
  ]);
  recordBusinessEvent(places, 'impression', viewerKey);
  return { items: places.map((place) => toPlaceView({ ...place, _promoted: true })) };
};

/**
 * GET /api/businesses/duplicates — nơi tên gần giống quanh vị trí đang chọn (dữ liệu bản đồ có thể đã có quán này).
 * Chỉ để nhắc chủ quán, không chặn đăng ký.
 */
export const findPossibleDuplicates = async ({ lat, lng, name }) => {
  const needle = normalizeSearchText(name);
  const nearby = await Place.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance_m',
        maxDistance: BUSINESS_LIMITS.DUPLICATE_RADIUS_KM * METERS_PER_KM,
        query: { status: ACTIVE },
        spherical: true,
      },
    },
    { $limit: 50 },
    { $project: { name: 1, address: 1, category: 1, location: 1, distance_m: 1, business_id: 1 } },
  ]);
  const similar = nearby.filter((place) => {
    const plain = normalizeSearchText(place.name);
    return needle.length >= 2 && (plain.includes(needle) || needle.includes(plain));
  });
  return {
    items: similar.slice(0, BUSINESS_LIMITS.DUPLICATE_LIMIT).map((place) => ({
      id: place._id,
      name: place.name,
      address: place.address,
      category: place.category,
      distance_m: Math.round(place.distance_m),
      owned: Boolean(place.business_id),
    })),
  };
};

/** Trước khi cấp chữ ký tải ảnh / video cửa hàng: phải là doanh nghiệp và gói còn dung lượng */
export const assertBusinessUploadAllowed = async (userId) => {
  const business = await getOwnBusiness(userId);
  const perks = perksOf(business.tier);
  if ((await getBusinessStorageUsed(business._id)) < perks.storage_bytes) return;
  throw businessError(`Gói ${perks.label} đã dùng hết ${toMb(perks.storage_bytes)}MB — xoá bớt ảnh / video hoặc nâng gói nhé`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.BUSINESS_STORAGE_LIMIT);
};
