// Thống kê cửa hàng của doanh nghiệp: lượt hiện trong kết quả tìm kiếm / mục Nổi bật, lượt xem chi tiết, lượt bấm chỉ đường.
// Ghi kiểu "bắn rồi quên" (không làm chậm trang của người dùng), mỗi người chỉ tính 1 lượt / cửa hàng / loại / ngày.
import mongoose from 'mongoose';
import { BUSINESS_STAT_EVENTS, BUSINESS_STAT_FIELDS } from '../constants/business.js';
import { BusinessStat } from '../models/businessStat.model.js';
import { toLocalDateKey } from '../utils/dateRange.js';

const DEDUPE_MAX_KEYS = 200_000; // ~ vài chục MB RAM tối đa; vượt thì làm lại từ đầu (chỉ đếm dư vài lượt)
let dedupe = { day: null, keys: new Set() };

// true = lượt này chưa tính hôm nay (và đánh dấu đã tính)
const isFirstToday = (key, day) => {
  if (dedupe.day !== day || dedupe.keys.size >= DEDUPE_MAX_KEYS) dedupe = { day, keys: new Set() };
  if (dedupe.keys.has(key)) return false;
  dedupe.keys.add(key);
  return true;
};

/** Người xem: tài khoản (đã đăng nhập) hoặc IP (khách) */
export const viewerKeyOf = (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`);

/**
 * Cộng 1 lượt `event` cho các cửa hàng (chỉ nơi có business_id). Không ném lỗi — thống kê hỏng không được làm hỏng trang.
 * @param {Array<{ _id, business_id }>} places
 */
export const recordBusinessEvent = (places, event, viewerKey) => {
  const field = BUSINESS_STAT_FIELDS[event];
  const day = toLocalDateKey();
  const counted = places.filter((place) => place?.business_id && field && isFirstToday(`${event}:${place._id}:${viewerKey}`, day));
  if (!counted.length) return;
  BusinessStat.bulkWrite(counted.map((place) => ({
    updateOne: {
      filter: { place_id: place._id, day },
      update: { $inc: { [field]: 1 }, $setOnInsert: { business_id: place.business_id, created_at: new Date() } },
      upsert: true,
    },
  })), { ordered: false }).catch((error) => console.warn('[business-stats]', error.message));
};

export const recordImpressions = (places, viewerKey) => recordBusinessEvent(places, BUSINESS_STAT_EVENTS.IMPRESSION, viewerKey);

const DAY_MS = 24 * 60 * 60 * 1000;
const emptyTotals = () => ({ views: 0, impressions: 0, directions: 0 });

/**
 * Thống kê `days` ngày gần nhất (tính cả hôm nay) của 1 doanh nghiệp: theo ngày (đủ mọi ngày, ngày trống = 0) + theo cửa hàng.
 */
export const getBusinessStats = async (businessId, days) => {
  const dayKeys = Array.from({ length: days }, (_, index) => toLocalDateKey(new Date(Date.now() - (days - 1 - index) * DAY_MS)));
  const rows = await BusinessStat.find(
    { business_id: new mongoose.Types.ObjectId(String(businessId)), day: { $gte: dayKeys[0] } },
    { place_id: 1, day: 1, views: 1, impressions: 1, directions: 1 },
  ).lean();

  const byDay = new Map(dayKeys.map((day) => [day, { day, ...emptyTotals() }]));
  const byPlace = new Map();
  const totals = emptyTotals();
  for (const row of rows) {
    const placeTotals = byPlace.get(String(row.place_id)) ?? emptyTotals();
    for (const field of Object.keys(totals)) {
      const value = row[field] ?? 0;
      totals[field] += value;
      placeTotals[field] += value;
      if (byDay.has(row.day)) byDay.get(row.day)[field] += value;
    }
    byPlace.set(String(row.place_id), placeTotals);
  }
  return { days, totals, daily: [...byDay.values()], by_place: Object.fromEntries(byPlace) };
};
