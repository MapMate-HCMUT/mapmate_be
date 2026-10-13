// Săn voucher: chủ quán tạo sự kiện (voucher giới hạn / check-in nhận quà / vòng quay may mắn), người dùng săn mã riêng,
// tới quán đọc mã, quán nhập mã để xác nhận. Mọi giới hạn kiểm tra ở server và tăng số đếm nguyên tử (không phát quá số lượng
// dù nhiều người bấm cùng lúc); kết quả vòng quay bốc thăm ở server (trình duyệt chỉ quay cho đẹp).
import crypto from 'node:crypto';
import { BUSINESS_ERROR_CODES, HUNT_KINDS, PROMOTION_KINDS, PROMOTION_STATUS, VOUCHER_LIMITS, VOUCHER_STATUS } from '../constants/business.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PLACE_STATUS } from '../constants/places.js';
import { Business } from '../models/business.model.js';
import Place from '../models/Place.model.js';
import { Promotion } from '../models/promotion.model.js';
import { VoucherClaim } from '../models/voucherClaim.model.js';
import { AppError } from '../utils/AppError.js';
import { toLocalDateKey } from '../utils/dateRange.js';
import { haversineKm } from '../utils/geo.js';
import { getOwnBusiness } from './business.service.js';
import { promotionStatus } from './businessTools.service.js';

const METERS_PER_KM = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;
const fail = (message, status, code) => new AppError(message, status, code);

// ── Bốc thăm & sinh mã (hàm thuần, dễ kiểm thử) ──
/** Mã 8 ký tự dễ đọc cho quán (không có 0/O, 1/I) */
export const generateVoucherCode = (randomBytes = crypto.randomBytes) => {
  const { CODE_ALPHABET: alphabet, CODE_LENGTH: length } = VOUCHER_LIMITS;
  return [...randomBytes(length)].map((byte) => alphabet[byte % alphabet.length]).join('');
};

/**
 * Bốc 1 giải theo tỉ trọng, chỉ trong các giải còn mã; null = trượt ("chúc may mắn lần sau").
 * @param {number} roll số ngẫu nhiên trong [0, 1)
 */
export const drawPrize = (prizes, loseWeight, roll) => {
  const available = prizes.filter((prize) => (prize.claimed ?? 0) < prize.quantity);
  const total = available.reduce((sum, prize) => sum + prize.weight, 0) + loseWeight;
  if (!total || !available.length) return null;
  let cursor = roll * total;
  for (const prize of available) {
    cursor -= prize.weight;
    if (cursor < 0) return prize;
  }
  return null;
};

const remainingOf = (promo) =>
  promo.kind === PROMOTION_KINDS.LUCKY_WHEEL
    ? (promo.prizes ?? []).reduce((sum, prize) => sum + Math.max(0, prize.quantity - (prize.claimed ?? 0)), 0)
    : Math.max(0, (promo.quantity ?? 0) - (promo.claimed_count ?? 0));

const playKeyOf = (promo, userId) => (promo.kind === PROMOTION_KINDS.LUCKY_WHEEL ? `${userId}:${toLocalDateKey()}` : String(userId));

const claimView = (claim) => ({
  id: claim._id,
  promotion_id: claim.promotion_id,
  status: claim.status,
  code: claim.code,
  prize_label: claim.prize_label,
  title: claim.title,
  business_name: claim.business_name,
  place: claim.place_id ? { id: claim.place_id, name: claim.place_name } : null,
  claimed_at: claim.claimed_at,
  expires_at: claim.expires_at,
  used_at: claim.used_at,
  is_expired: claim.status === VOUCHER_STATUS.CLAIMED && claim.expires_at <= new Date(),
});

// ── Sự kiện gần bạn ──
/** GET /api/vouchers/events — sự kiện săn voucher đang chạy / sắp mở (3 ngày tới) quanh người dùng, kèm trạng thái của người xem */
export const listVoucherEvents = async ({ lat, lng }, userId = null) => {
  const now = new Date();
  const places = await Place.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance_m',
        maxDistance: VOUCHER_LIMITS.EVENTS_RADIUS_KM * METERS_PER_KM,
        query: { 'promotions.kind': { $in: HUNT_KINDS }, status: { $ne: PLACE_STATUS.CLOSED } },
        spherical: true,
      },
    },
    { $limit: 100 },
    { $project: { name: 1, address: 1, category: 1, location: 1, distance_m: 1, promotions: 1, business_id: 1 } },
  ]);
  const nearest = new Map(); // khuyến mãi -> cửa hàng gần nhất áp dụng
  for (const place of places) {
    for (const promo of place.promotions ?? []) if (!nearest.has(String(promo.id))) nearest.set(String(promo.id), place);
  }
  const promos = await Promotion.find({
    _id: { $in: [...nearest.keys()] },
    kind: { $in: HUNT_KINDS },
    ends_at: { $gt: now },
    starts_at: { $lte: new Date(now.getTime() + VOUCHER_LIMITS.EVENTS_UPCOMING_DAYS * DAY_MS) },
  }).lean();
  const [businesses, mine] = await Promise.all([
    Business.find({ _id: { $in: promos.map((promo) => promo.business_id) } }, { name: 1, tier: 1 }).lean(),
    userId ? VoucherClaim.find({ user_id: userId, promotion_id: { $in: promos.map((promo) => promo._id) } }).sort({ claimed_at: -1 }).lean() : [],
  ]);
  const businessById = new Map(businesses.map((business) => [String(business._id), business]));
  const today = toLocalDateKey();

  const items = promos.map((promo) => {
    const place = nearest.get(String(promo._id));
    const [lngPlace, latPlace] = place.location.coordinates;
    const myClaims = mine.filter((claim) => String(claim.promotion_id) === String(promo._id));
    const playedToday = myClaims.some((claim) => claim.play_key.endsWith(`:${today}`));
    const won = myClaims.find((claim) => claim.status !== VOUCHER_STATUS.LOST);
    return {
      id: promo._id,
      kind: promo.kind,
      title: promo.title,
      label: promo.label,
      description: promo.description ?? null,
      status: promotionStatus(promo, now),
      starts_at: promo.starts_at,
      ends_at: promo.ends_at,
      remaining: remainingOf(promo),
      total: promo.kind === PROMOTION_KINDS.LUCKY_WHEEL ? (promo.prizes ?? []).reduce((sum, prize) => sum + prize.quantity, 0) : promo.quantity,
      prizes: promo.kind === PROMOTION_KINDS.LUCKY_WHEEL ? promo.prizes.map((prize) => ({ id: prize._id, label: prize.label, left: Math.max(0, prize.quantity - (prize.claimed ?? 0)) })) : [],
      checkin_radius_m: promo.kind === PROMOTION_KINDS.CHECKIN ? VOUCHER_LIMITS.CHECKIN_RADIUS_M : null,
      business: { name: businessById.get(String(promo.business_id))?.name ?? '', tier: businessById.get(String(promo.business_id))?.tier ?? 'basic' },
      place: { id: place._id, name: place.name, address: place.address, category: place.category, coordinates: { lat: latPlace, lng: lngPlace }, distance_km: Math.round(place.distance_m / 10) / 100 },
      // Trạng thái của người xem: đã nhận (mã) / vòng quay: hôm nay đã quay chưa
      my_voucher: won ? claimView(won) : null,
      can_play: promo.kind === PROMOTION_KINDS.LUCKY_WHEEL ? !playedToday : !myClaims.length,
    };
  });
  // Đang chạy trước (sắp hết hạn trước), rồi sắp mở (mở sớm trước)
  items.sort((a, b) => (a.status === b.status ? (a.status === PROMOTION_STATUS.ACTIVE ? a.ends_at - b.ends_at : a.starts_at - b.starts_at) : a.status === PROMOTION_STATUS.ACTIVE ? -1 : 1));
  return { items: items.slice(0, VOUCHER_LIMITS.EVENTS_LIMIT) };
};

// ── Nhận / quay ──
const loadPlayableEvent = async (promotionId, userId) => {
  const promo = await Promotion.findById(promotionId).lean();
  if (!promo || !HUNT_KINDS.includes(promo.kind)) throw fail('Không tìm thấy sự kiện này', HTTP_STATUS.NOT_FOUND, BUSINESS_ERROR_CODES.PROMOTION_NOT_FOUND);
  const status = promotionStatus(promo);
  if (status === PROMOTION_STATUS.SCHEDULED) throw fail('Sự kiện chưa mở — quay lại đúng giờ nhé!', HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.VOUCHER_NOT_STARTED);
  if (status === PROMOTION_STATUS.ENDED) throw fail('Sự kiện đã kết thúc', HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.VOUCHER_SOLD_OUT);
  const business = await Business.findById(promo.business_id, { name: 1, owner_id: 1 }).lean();
  if (String(business?.owner_id) === String(userId)) throw fail('Bạn không săn voucher của chính quán mình được', HTTP_STATUS.FORBIDDEN, BUSINESS_ERROR_CODES.VOUCHER_OWN_SHOP);
  const places = await Place.find({ _id: { $in: promo.place_ids }, status: { $ne: PLACE_STATUS.CLOSED } }, { name: 1, location: 1 }).lean();
  return { promo, business, places };
};

// Check-in: phải đứng gần 1 trong các cửa hàng áp dụng (GPS của trình duyệt)
const nearestPlaceWithin = (places, { lat, lng }) => {
  const ranked = places.map((place) => ({ place, km: haversineKm([lng, lat], place.location.coordinates) })).sort((a, b) => a.km - b.km);
  return ranked[0] && ranked[0].km * METERS_PER_KM <= VOUCHER_LIMITS.CHECKIN_RADIUS_M ? ranked[0].place : null;
};

const alreadyPlayed = (promo) =>
  fail(promo.kind === PROMOTION_KINDS.LUCKY_WHEEL ? 'Hôm nay bạn đã quay rồi — mai quay tiếp nhé!' : 'Bạn đã nhận voucher này rồi — xem trong Ví voucher', HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.VOUCHER_ALREADY_CLAIMED);

const createClaim = async (fields) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await VoucherClaim.create({ ...fields, code: fields.status === VOUCHER_STATUS.LOST ? null : generateVoucherCode() });
    } catch (error) {
      if (error.code !== DUPLICATE_KEY) throw error;
      if (error.keyPattern?.play_key) throw Object.assign(new Error('played'), { played: true });
      // trùng mã (cực hiếm) => sinh mã khác
    }
  }
  throw new Error('Không sinh được mã voucher');
};

/** POST /api/vouchers/events/:id/claim — nhận voucher / check-in nhận quà / quay vòng quay (1 lượt / ngày) */
export const claimVoucher = async (userId, promotionId, location = {}) => {
  const { promo, business, places } = await loadPlayableEvent(promotionId, userId);
  let place = places[0];
  if (promo.kind === PROMOTION_KINDS.CHECKIN) {
    if (location.lat === undefined) throw fail('Cần bật vị trí để check-in tại quán', HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.VOUCHER_TOO_FAR);
    place = nearestPlaceWithin(places, location);
    if (!place) throw fail(`Bạn cần đến quán (cách dưới ${VOUCHER_LIMITS.CHECKIN_RADIUS_M} m) để mở quà check-in`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.VOUCHER_TOO_FAR);
  }
  const playKey = playKeyOf(promo, userId);
  if (await VoucherClaim.exists({ promotion_id: promo._id, play_key: playKey })) throw alreadyPlayed(promo);

  const base = {
    promotion_id: promo._id, business_id: promo.business_id, user_id: userId, play_key: playKey,
    business_name: business.name, place_id: place?._id, place_name: place?.name, title: promo.title, expires_at: promo.ends_at,
  };

  // Vòng quay: bốc thăm ở server, giữ chỗ giải bằng $inc có điều kiện (giải vừa hết do người khác => tính là trượt)
  if (promo.kind === PROMOTION_KINDS.LUCKY_WHEEL) {
    const prize = drawPrize(promo.prizes ?? [], promo.lose_weight ?? 0, crypto.randomInt(0, 1_000_000) / 1_000_000);
    const reserved = prize
      ? await Promotion.updateOne(
        { _id: promo._id, prizes: { $elemMatch: { _id: prize._id, claimed: { $lt: prize.quantity } } } },
        { $inc: { 'prizes.$.claimed': 1, claimed_count: 1 } },
      )
      : null;
    const won = Boolean(reserved?.modifiedCount);
    try {
      const claim = await createClaim({ ...base, status: won ? VOUCHER_STATUS.CLAIMED : VOUCHER_STATUS.LOST, prize_label: won ? prize.label : null });
      return { won, prize: won ? { id: prize._id, label: prize.label } : null, voucher: won ? claimView(claim) : null };
    } catch (error) {
      if (won) await Promotion.updateOne({ _id: promo._id, 'prizes._id': prize._id }, { $inc: { 'prizes.$.claimed': -1, claimed_count: -1 } });
      if (error.played) throw alreadyPlayed(promo);
      throw error;
    }
  }

  // Voucher giới hạn / check-in: giữ 1 suất bằng $inc có điều kiện => không bao giờ phát quá số lượng
  const reserved = await Promotion.updateOne({ _id: promo._id, $expr: { $lt: ['$claimed_count', '$quantity'] } }, { $inc: { claimed_count: 1 } });
  if (!reserved.modifiedCount) throw fail('Voucher đã được săn hết — lần sau nhanh tay hơn nhé!', HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.VOUCHER_SOLD_OUT);
  try {
    const claim = await createClaim({ ...base, status: VOUCHER_STATUS.CLAIMED, prize_label: promo.label });
    return { won: true, prize: { label: promo.label }, voucher: claimView(claim) };
  } catch (error) {
    await Promotion.updateOne({ _id: promo._id }, { $inc: { claimed_count: -1 } }); // trả lại suất
    if (error.played) throw alreadyPlayed(promo);
    throw error;
  }
};

/** GET /api/vouchers/me — ví voucher (không gồm lượt quay trượt) */
export const listMyVouchers = async (userId) => {
  const claims = await VoucherClaim.find({ user_id: userId, status: { $ne: VOUCHER_STATUS.LOST } }).sort({ claimed_at: -1 }).limit(VOUCHER_LIMITS.WALLET_LIMIT).lean();
  return { items: claims.map(claimView) };
};

// ── Quán xác nhận ──
/** POST /api/businesses/me/vouchers/redeem — khách đọc mã, quán nhập để đánh dấu đã dùng (mã của quán khác / đã dùng / hết hạn => từ chối) */
export const redeemVoucher = async (userId, code) => {
  const business = await getOwnBusiness(userId);
  const invalid = (message) => fail(message, HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.VOUCHER_INVALID);
  const claim = await VoucherClaim.findOne({ code, business_id: business._id }).lean();
  if (!claim) throw invalid('Mã không đúng hoặc không phải voucher của quán bạn');
  if (claim.status === VOUCHER_STATUS.USED) throw invalid(`Mã này đã dùng lúc ${claim.used_at.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
  if (claim.expires_at <= new Date()) throw invalid('Mã đã hết hạn (sự kiện đã kết thúc)');

  // Đổi trạng thái có điều kiện: 2 thu ngân nhập cùng 1 mã cùng lúc thì chỉ 1 người thành công
  const updated = await VoucherClaim.findOneAndUpdate(
    { _id: claim._id, status: VOUCHER_STATUS.CLAIMED },
    { $set: { status: VOUCHER_STATUS.USED, used_at: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) throw invalid('Mã này vừa được dùng');
  await Promotion.updateOne({ _id: claim.promotion_id }, { $inc: { used_count: 1 } });
  return { voucher: claimView(updated) };
};
