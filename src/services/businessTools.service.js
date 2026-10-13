// Công cụ của chủ doanh nghiệp: khuyến mãi (quảng cáo trên thẻ cửa hàng + báo cho khách đã lưu quán) và trả lời đánh giá.
import { BUSINESS_ERROR_CODES, BUSINESS_LIMITS, HUNT_KINDS, PROMOTION_KIND_LABELS, PROMOTION_KINDS, PROMOTION_LIMITS, PROMOTION_STATUS } from '../constants/business.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import { POST_VISIBILITY } from '../constants/social.js';
import Place from '../models/Place.model.js';
import { PlacePin } from '../models/placePin.model.js';
import { Post } from '../models/post.model.js';
import { Promotion } from '../models/promotion.model.js';
import { AppError } from '../utils/AppError.js';
import { toUserCard, USER_CARD_SELECT } from '../utils/userCard.js';
import { ACTIVE, businessError, getOwnBusiness, NO_REPLY, perksOf, reviewFilter } from './business.service.js';
import { toMediaView } from './media.service.js';
import { notifyUser, notifyUsers } from './notification.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const PLACE_PROMOTIONS_KEPT = 5;

// ── Khuyến mãi ──
/** Trạng thái theo thời gian (hàm thuần) */
export const promotionStatus = (promo, now = new Date()) =>
  promo.ends_at <= now ? PROMOTION_STATUS.ENDED : promo.starts_at > now ? PROMOTION_STATUS.SCHEDULED : PROMOTION_STATUS.ACTIVE;

const promotionView = (promo, now = new Date()) => ({
  id: promo._id,
  place_ids: promo.place_ids,
  title: promo.title,
  label: promo.label,
  description: promo.description ?? null,
  code: promo.code ?? null,
  starts_at: promo.starts_at,
  ends_at: promo.ends_at,
  status: promotionStatus(promo, now),
  notified_at: promo.notified_at ?? null,
  notified_count: promo.notified_count ?? 0,
  kind: promo.kind ?? PROMOTION_KINDS.DEAL,
  quantity: promo.quantity ?? null,
  claimed_count: promo.claimed_count ?? 0,
  used_count: promo.used_count ?? 0,
  prizes: (promo.prizes ?? []).map((prize) => ({ id: prize._id, label: prize.label, quantity: prize.quantity, claimed: prize.claimed ?? 0, weight: prize.weight })),
  lose_weight: promo.lose_weight ?? 0,
});

const promotionNotFound = () =>
  businessError('Không tìm thấy khuyến mãi này', HTTP_STATUS.NOT_FOUND, BUSINESS_ERROR_CODES.PROMOTION_NOT_FOUND);

// Chép các khuyến mãi chưa kết thúc vào từng cửa hàng (để danh sách địa điểm hiện nhãn ưu đãi mà không tra thêm)
export const syncPlacePromotions = async (placeIds) => {
  const ids = [...new Set(placeIds.map(String))];
  if (!ids.length) return;
  const now = new Date();
  const promos = await Promotion.find({ place_ids: { $in: ids }, ends_at: { $gt: now } }).sort({ starts_at: 1 }).lean();
  await Place.bulkWrite(ids.map((id) => {
    const snapshot = promos
      .filter((promo) => promo.place_ids.some((placeId) => String(placeId) === id))
      .slice(0, PLACE_PROMOTIONS_KEPT)
      .map((promo) => ({ id: promo._id, kind: promo.kind ?? 'deal', title: promo.title, label: promo.label, description: promo.description, code: promo.code, starts_at: promo.starts_at, ends_at: promo.ends_at }));
    return { updateOne: { filter: { _id: id }, update: snapshot.length ? { $set: { promotions: snapshot } } : { $unset: { promotions: 1 } } } };
  }));
};

// Số lần đã báo cho khách trong 7 ngày gần nhất
const notifiedThisWeek = (businessId) => Promotion.countDocuments({ business_id: businessId, notified_at: { $gte: new Date(Date.now() - WEEK_MS) } });

const quotaView = async (business) => {
  const perks = perksOf(business.tier);
  const [running, notified] = await Promise.all([
    Promotion.countDocuments({ business_id: business._id, ends_at: { $gt: new Date() } }),
    notifiedThisWeek(business._id),
  ]);
  return {
    max_promotions: perks.max_promotions,
    running,
    notify_per_week: perks.notify_per_week,
    notify_left: Math.max(0, perks.notify_per_week - notified),
    kinds: perks.promotion_kinds, // loại sự kiện gói này được tạo
  };
};

/** GET /api/businesses/me/promotions — đang chạy / hẹn giờ trước, rồi 20 cái đã kết thúc gần nhất */
export const listMyPromotions = async (userId) => {
  const business = await getOwnBusiness(userId);
  const now = new Date();
  const [current, ended, quota] = await Promise.all([
    Promotion.find({ business_id: business._id, ends_at: { $gt: now } }).sort({ starts_at: 1 }).lean(),
    Promotion.find({ business_id: business._id, ends_at: { $lte: now } }).sort({ ends_at: -1 }).limit(20).lean(),
    quotaView(business),
  ]);
  return { items: [...current, ...ended].map((promo) => promotionView(promo, now)), quota };
};

// Cửa hàng phải thuộc doanh nghiệp + còn hoạt động; thời gian hợp lệ (tối đa 30 ngày, chưa kết thúc)
const checkPromotionInput = async (business, { place_ids: placeIds, starts_at: startsAt, ends_at: endsAt }) => {
  if (placeIds) {
    const owned = await Place.countDocuments({ _id: { $in: placeIds }, business_id: business._id, status: ACTIVE });
    if (owned !== placeIds.length) throw businessError('Có cửa hàng không thuộc tài khoản của bạn', HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.BUSINESS_PLACE_NOT_FOUND);
  }
  if (endsAt <= new Date()) throw businessError('Ngày kết thúc đã qua', HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.PROMOTION_LIMIT);
  if (endsAt - startsAt > PROMOTION_LIMITS.MAX_DAYS * DAY_MS) {
    throw businessError(`Mỗi khuyến mãi chạy tối đa ${PROMOTION_LIMITS.MAX_DAYS} ngày`, HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.PROMOTION_LIMIT);
  }
};

/** POST /api/businesses/me/promotions */
export const createMyPromotion = async (userId, input) => {
  const business = await getOwnBusiness(userId);
  await checkPromotionInput(business, input);
  const quota = await quotaView(business);
  if (!quota.kinds.includes(input.kind)) {
    throw businessError(`"${PROMOTION_KIND_LABELS[input.kind]}" chưa có trong gói của bạn — nâng gói để dùng`, HTTP_STATUS.FORBIDDEN, BUSINESS_ERROR_CODES.PROMOTION_KIND_LOCKED);
  }
  if (quota.running >= quota.max_promotions) {
    throw businessError(`Gói của bạn chạy tối đa ${quota.max_promotions} khuyến mãi cùng lúc — kết thúc bớt hoặc nâng gói`, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.PROMOTION_LIMIT);
  }
  // Chỉ giữ trường của đúng loại (VD ưu đãi thường không có số lượng; loại săn voucher không có mã chung)
  const isHunt = HUNT_KINDS.includes(input.kind);
  const promo = await Promotion.create({
    ...input,
    code: isHunt ? null : input.code ?? null,
    quantity: isHunt && input.kind !== PROMOTION_KINDS.LUCKY_WHEEL ? input.quantity : null,
    prizes: input.kind === PROMOTION_KINDS.LUCKY_WHEEL ? input.prizes : undefined,
    lose_weight: input.kind === PROMOTION_KINDS.LUCKY_WHEEL ? input.lose_weight ?? 0 : 0,
    business_id: business._id,
  });
  await syncPlacePromotions(promo.place_ids);
  return { promotion: promotionView(promo.toObject()) };
};

const getOwnPromotion = async (business, promotionId) => {
  const promo = await Promotion.findOne({ _id: promotionId, business_id: business._id }).lean();
  if (!promo) throw promotionNotFound();
  return promo;
};

/** PATCH /api/businesses/me/promotions/:id */
export const updateMyPromotion = async (userId, promotionId, changes) => {
  const business = await getOwnBusiness(userId);
  const promo = await getOwnPromotion(business, promotionId);
  const merged = { ...promo, ...changes };
  await checkPromotionInput(business, { ...changes, starts_at: merged.starts_at, ends_at: merged.ends_at });
  // Đã phát mã thì không giảm số lượng dưới số đã phát, không sửa giải của vòng quay
  if (changes.quantity !== undefined && changes.quantity !== null && changes.quantity < (promo.claimed_count ?? 0)) {
    throw businessError(`Đã phát ${promo.claimed_count} mã — số lượng không được nhỏ hơn`, HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.PROMOTION_LIMIT);
  }
  if (changes.prizes && (promo.prizes ?? []).some((prize) => prize.claimed > 0)) {
    throw businessError('Vòng quay đã có người trúng — không sửa danh sách giải được nữa', HTTP_STATUS.BAD_REQUEST, BUSINESS_ERROR_CODES.PROMOTION_LIMIT);
  }
  if (promo.kind !== PROMOTION_KINDS.LUCKY_WHEEL) delete changes.prizes;
  if (HUNT_KINDS.includes(promo.kind)) delete changes.code;
  const updated = await Promotion.findOneAndUpdate({ _id: promo._id }, { $set: changes }, { returnDocument: 'after', runValidators: true }).lean();
  await syncPlacePromotions([...promo.place_ids, ...updated.place_ids]);
  return { promotion: promotionView(updated) };
};

/** DELETE /api/businesses/me/promotions/:id — kết thúc ngay (khuyến mãi đã chạy thì giữ lại để xem lịch sử) */
export const endMyPromotion = async (userId, promotionId) => {
  const business = await getOwnBusiness(userId);
  const promo = await getOwnPromotion(business, promotionId);
  const now = new Date();
  if (promo.starts_at > now) await Promotion.deleteOne({ _id: promo._id }); // chưa chạy => xoá luôn
  else if (promo.ends_at > now) await Promotion.updateOne({ _id: promo._id }, { $set: { ends_at: now } });
  await syncPlacePromotions(promo.place_ids);
  return { ended: true };
};

/**
 * POST /api/businesses/me/promotions/:id/notify — báo khuyến mãi cho người đã lưu ("Muốn đi" / "Đã đi") các cửa hàng áp dụng.
 * Gói trả phí mới có; giới hạn số lần / tuần; mỗi khuyến mãi báo 1 lần; tối đa 500 người / lần.
 */
export const notifyPromotionFollowers = async (userId, promotionId) => {
  const business = await getOwnBusiness(userId);
  const promo = await getOwnPromotion(business, promotionId);
  const quota = await quotaView(business);
  const deny = (message) => businessError(message, HTTP_STATUS.CONFLICT, BUSINESS_ERROR_CODES.NOTIFY_NOT_ALLOWED);
  if (!quota.notify_per_week) throw deny('Gói Cơ bản chưa có tính năng báo cho khách — nâng gói Tăng trưởng để dùng');
  if (promo.notified_at) throw deny('Khuyến mãi này đã được báo cho khách rồi');
  if (promotionStatus(promo) === PROMOTION_STATUS.ENDED) throw deny('Khuyến mãi đã kết thúc');
  if (!quota.notify_left) throw deny(`Tuần này bạn đã dùng hết ${quota.notify_per_week} lượt báo cho khách`);

  const followers = await PlacePin.distinct('user_id', { place_id: { $in: promo.place_ids }, user_id: { $ne: business.owner_id } });
  const recipients = followers.slice(0, PROMOTION_LIMITS.NOTIFY_MAX_RECIPIENTS);
  const [firstPlaceId] = promo.place_ids;
  await notifyUsers(recipients, {
    type: NOTIFICATION_TYPES.PROMOTION,
    icon: '🏷️',
    title: `${business.name}: ${promo.label} — ${promo.title}`.slice(0, 120),
    body: promo.description ?? 'Quán bạn đã lưu đang có ưu đãi, ghé xem nhé!',
    link: `/?place=${firstPlaceId}`,
  });
  // Ghi nhận cả khi chưa ai lưu quán (vẫn tính 1 lượt) để không bấm thử liên tục
  await Promotion.updateOne({ _id: promo._id }, { $set: { notified_at: new Date(), notified_count: recipients.length } });
  return { notified: recipients.length };
};

// ── Đánh giá của khách ──
const reviewNotFound = () => new AppError('Không tìm thấy bài đánh giá này', HTTP_STATUS.NOT_FOUND, BUSINESS_ERROR_CODES.REVIEW_NOT_FOUND);


const reviewView = (post, placeNames) => ({
  id: post._id,
  author: toUserCard(post.author_id),
  place: { id: post.place_id, name: placeNames.get(String(post.place_id)) ?? '' },
  rating: post.rating ?? null,
  content: post.content,
  media: (post.media ?? []).map(toMediaView),
  visited: Boolean(post.visited),
  created_at: post.created_at,
  owner_reply: post.owner_reply?.text ? post.owner_reply : null,
});

/** GET /api/businesses/me/reviews — bài đánh giá về các cửa hàng của doanh nghiệp + tổng quan điểm (trang đầu) */
export const listMyReviews = async (userId, { place_id: placeId, filter, before }) => {
  const business = await getOwnBusiness(userId);
  const places = await Place.find({ business_id: business._id, status: ACTIVE, ...(placeId && { _id: placeId }) }, { name: 1 }).lean();
  const placeIds = places.map((place) => place._id);
  const placeNames = new Map(places.map((place) => [String(place._id), place.name]));
  const base = reviewFilter(placeIds);
  const query = { ...base, ...(filter === 'unreplied' && NO_REPLY), ...(before && { created_at: { $lt: before } }) };
  const limit = BUSINESS_LIMITS.REVIEWS_PAGE;
  const [rows, summary] = await Promise.all([
    Post.find(query).sort({ created_at: -1 }).limit(limit + 1).populate({ path: 'author_id', select: USER_CARD_SELECT }).lean(),
    before ? null : reviewSummary(base),
  ]);
  const items = rows.slice(0, limit).map((post) => reviewView(post, placeNames));
  return { items, next_cursor: rows.length > limit ? items.at(-1).created_at : null, summary };
};

// Điểm trung bình, số bài, số bài chưa trả lời, phân bố 1–5 sao
const reviewSummary = async (filter) => {
  const [row] = await Post.aggregate([
    { $match: filter },
    {
      $facet: {
        totals: [{ $group: { _id: null, count: { $sum: 1 }, rated: { $sum: { $cond: [{ $ne: ['$rating', null] }, 1, 0] } }, average: { $avg: '$rating' } } }],
        unreplied: [{ $match: NO_REPLY }, { $count: 'count' }],
        stars: [{ $match: { rating: { $ne: null } } }, { $group: { _id: '$rating', count: { $sum: 1 } } }],
      },
    },
  ]);
  const totals = row.totals[0] ?? { count: 0, rated: 0, average: null };
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((star) => [star, row.stars.find((item) => item._id === star)?.count ?? 0]));
  return {
    count: totals.count,
    average: totals.average ? Math.round(totals.average * 10) / 10 : null,
    unreplied: row.unreplied[0]?.count ?? 0,
    distribution,
  };
};

/** PUT /api/businesses/me/reviews/:postId/reply — trả lời (text rỗng = xoá phản hồi). Lần đầu trả lời => báo cho người viết. */
export const replyToReview = async (userId, postId, text) => {
  const business = await getOwnBusiness(userId);
  const post = await Post.findOne({ _id: postId, visibility: POST_VISIBILITY.PUBLIC, is_repost: { $ne: true } }).lean();
  if (!post?.place_id) throw reviewNotFound();
  const owns = await Place.exists({ _id: post.place_id, business_id: business._id, status: ACTIVE });
  if (!owns) throw reviewNotFound();

  const reply = text ? { text, business_name: business.name, replied_at: new Date() } : null;
  await Post.updateOne({ _id: post._id }, reply ? { $set: { owner_reply: reply } } : { $unset: { owner_reply: 1 } });
  if (reply && !post.owner_reply?.text && String(post.author_id) !== String(business.owner_id)) {
    await notifyUser(post.author_id, {
      type: NOTIFICATION_TYPES.REVIEW_REPLY,
      icon: '💬',
      title: `${business.name} đã trả lời đánh giá của bạn`.slice(0, 120),
      body: text.slice(0, 200),
      link: `/explore?tab=feed&post=${post._id}`,
    });
  }
  return { owner_reply: reply };
};
