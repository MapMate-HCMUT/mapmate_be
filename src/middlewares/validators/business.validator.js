import { z } from 'zod';
import { BUSINESS_LIMITS, BUSINESS_PLACE_CATEGORIES, BUSINESS_TIER_VALUES, BUSINESS_DEFAULT_TIER, BUSINESS_STAT_EVENTS, PROMOTION_KIND_VALUES, PROMOTION_KINDS, PROMOTION_LIMITS, VOUCHER_LIMITS } from '../../constants/business.js';
import { cursorDate, objectId, objectIdList, timeOfDay } from './common.validator.js';
import { latitude, longitude } from './place.validator.js';
import { mediaItem } from './social.validator.js';
import { DAY_KEYS } from '../../utils/weeklyHours.js';

const L = BUSINESS_LIMITS;
const optionalText = (max, label) =>
  z.string(`${label} phải là chuỗi ký tự`).trim().max(max, `${label} tối đa ${max} ký tự`).transform((value) => value || null).nullable();

const name = z.string('Tên phải là chuỗi ký tự').trim().min(2, 'Tên tối thiểu 2 ký tự').max(L.NAME_MAX, `Tên tối đa ${L.NAME_MAX} ký tự`);
/**
 * Số điện thoại => chuẩn quốc tế E.164 ("+84901234567"). Nhận cả "0901 234 567", "84 90...", "+84 (0) 90...", "0084...".
 * Việt Nam: di động 9 số sau +84 (đầu 3/5/7/8/9), cố định 10 số (đầu 2). Nước khác: 8–15 chữ số.
 */
export const normalizePhone = (raw) => {
  let value = raw.replace(/[\s.()-]/g, '').replace(/^\+84\(?0\)?/, '+84').replace(/^\+840/, '+84');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (/^0\d+$/.test(value)) value = `+84${value.slice(1)}`;
  if (/^84\d{9,10}$/.test(value)) value = `+${value}`;
  return value;
};
const isValidPhone = (value) => (value.startsWith('+84') ? L.VN_PHONE_PATTERN.test(value) : L.PHONE_PATTERN.test(value));
const phone = z
  .string()
  .trim()
  .transform((value) => (value ? normalizePhone(value) : ''))
  .refine((value) => !value || isValidPhone(value), 'Số điện thoại không hợp lệ')
  .transform((value) => value || null)
  .nullable();
const website = z
  .string()
  .trim()
  .max(L.WEBSITE_MAX)
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .pipe(z.url({ protocol: /^https?$/, message: 'Website không hợp lệ' }).or(z.literal('')))
  .transform((value) => value || null)
  .nullable();
const tier = z.enum(BUSINESS_TIER_VALUES, 'Gói không hợp lệ');
const price = z.coerce.number().int().min(0).max(L.PRICE_MAX, 'Giá quá lớn');

const coordinates = z.object({ lat: latitude, lng: longitude });
const priceRange = z
  .object({ min: price, max: price })
  .refine((range) => range.max >= range.min, { message: 'Giá cao nhất phải ≥ giá thấp nhất', path: ['max'] })
  .nullable();
// Lịch theo ngày: mỗi ngày tối đa 3 khung, không chồng nhau; khung qua đêm (close < open) phải là khung cuối của ngày
const closeTime = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Giờ phải có dạng HH:mm');
const timeRange = z.object({ open: timeOfDay, close: closeTime }).refine((range) => range.open !== range.close, { message: 'Giờ mở và đóng phải khác nhau', path: ['close'] });
const dayRanges = z
  .array(timeRange)
  .max(L.RANGES_PER_DAY, `Mỗi ngày tối đa ${L.RANGES_PER_DAY} khung giờ`)
  .transform((ranges) => [...ranges].sort((a, b) => a.open.localeCompare(b.open)))
  .refine(
    (ranges) => ranges.every((range, index) => {
      const next = ranges[index + 1];
      const overnight = range.close < range.open;
      return !next || (!overnight && range.close <= next.open);
    }),
    'Các khung giờ trong ngày bị chồng nhau',
  )
  .default([]);
const weeklyHours = z.object(Object.fromEntries(DAY_KEYS.map((day) => [day, dayRanges]))).nullable();

const openingHours = z
  .object({ open: timeOfDay, close: timeOfDay })
  .refine((hours) => hours.open !== hours.close, { message: 'Giờ mở và đóng cửa phải khác nhau', path: ['close'] })
  .nullable();
const specialties = z
  .array(z.string().trim().min(1).max(L.SPECIALTY_MAX, `Mỗi món / dịch vụ tối đa ${L.SPECIALTY_MAX} ký tự`))
  .max(L.SPECIALTIES_MAX, `Tối đa ${L.SPECIALTIES_MAX} món / dịch vụ nổi bật`)
  .transform((items) => [...new Set(items)]);

// Thông tin 1 cửa hàng — vị trí do chủ quán chọn trên bản đồ (địa chỉ + quận gợi ý từ Goong, sửa lại được)
const placeFields = {
  name,
  category: z.enum(BUSINESS_PLACE_CATEGORIES, 'Loại hình không hợp lệ'),
  coordinates,
  address: z.string('Địa chỉ phải là chuỗi ký tự').trim().min(5, 'Nhập địa chỉ cửa hàng').max(L.ADDRESS_MAX),
  district: z.string().trim().max(60).nullable().optional(),
  description: optionalText(L.DESCRIPTION_MAX, 'Mô tả').optional(),
  specialties: specialties.optional(),
  price_range: priceRange.optional(),
  opening_hours: openingHours.optional(),
  weekly_hours: weeklyHours.optional(), // null = chưa công khai giờ
  phone: phone.optional(),
  website: website.optional(),
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Thông báo nhanh: bắt buộc có hạn (tối đa 30 ngày) để không bị treo mãi trên thẻ cửa hàng
const notice = z
  .object({
    text: z.string().trim().min(2, 'Nhập nội dung thông báo').max(L.NOTICE_MAX, `Thông báo tối đa ${L.NOTICE_MAX} ký tự`),
    until: z.coerce.date('Thời hạn không hợp lệ'),
  })
  .refine((value) => value.until > new Date(), { message: 'Thời hạn phải ở tương lai', path: ['until'] })
  .refine((value) => value.until - Date.now() <= L.NOTICE_MAX_DAYS * DAY_MS, { message: `Thông báo hiện tối đa ${L.NOTICE_MAX_DAYS} ngày`, path: ['until'] })
  .nullable();

export const placeCreateSchema = z.object(placeFields);
// Sửa: gửi trường nào sửa trường đó; dời vị trí thì gửi kèm địa chỉ mới
export const placeUpdateSchema = z
  .object({
    ...placeFields,
    gallery: z.array(mediaItem).max(100).optional(), // danh sách đầy đủ sau khi sửa (giới hạn thật theo gói ở service)
    notice,
  })
  .partial()
  .refine((body) => !body.coordinates || body.address, { message: 'Dời vị trí thì cập nhật luôn địa chỉ', path: ['address'] });

const profileFields = {
  name,
  description: optionalText(L.DESCRIPTION_MAX, 'Mô tả').optional(),
  phone: phone.optional(),
  website: website.optional(),
};

// POST /api/businesses — hồ sơ + cửa hàng đầu tiên + gói
export const businessRegisterSchema = z.object({ ...profileFields, tier: tier.default(BUSINESS_DEFAULT_TIER), place: placeCreateSchema });
export const businessUpdateSchema = z.object(profileFields).partial();
export const tierChangeSchema = z.object({ tier });
export const statsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).optional() });
export const featuredQuerySchema = z.object({
  lat: latitude,
  lng: longitude,
  limit: z.coerce.number().int().min(1).max(L.FEATURED_LIMIT).default(L.FEATURED_DEFAULT_LIMIT),
});
export const duplicatesQuerySchema = z.object({ lat: latitude, lng: longitude, name: z.string().trim().min(2).max(L.NAME_MAX) });
export const placeEventSchema = z.object({ type: z.enum([BUSINESS_STAT_EVENTS.VIEW, BUSINESS_STAT_EVENTS.DIRECTIONS], 'Loại sự kiện không hợp lệ') });

// ── Khuyến mãi ──
const P = PROMOTION_LIMITS;
const promotionFields = {
  place_ids: objectIdList(BUSINESS_LIMITS.DUPLICATE_LIMIT * 2, 1),
  title: z.string().trim().min(3, 'Nhập tên khuyến mãi').max(P.TITLE_MAX, `Tên tối đa ${P.TITLE_MAX} ký tự`),
  label: z.string().trim().min(1, 'Nhập nhãn ngắn, VD -20%').max(P.LABEL_MAX, `Nhãn tối đa ${P.LABEL_MAX} ký tự`),
  description: optionalText(P.DESCRIPTION_MAX, 'Mô tả').optional(),
  code: z.string().trim().max(P.CODE_MAX).regex(/^[A-Za-z0-9_-]*$/, 'Mã chỉ gồm chữ không dấu, số, "-" "_"').transform((value) => value.toUpperCase() || null).nullable().optional(),
  starts_at: z.coerce.date('Ngày bắt đầu không hợp lệ'),
  ends_at: z.coerce.date('Ngày kết thúc không hợp lệ'),
  quantity: z.coerce.number().int().min(1, 'Số lượng ít nhất 1').max(VOUCHER_LIMITS.QUANTITY_MAX, `Tối đa ${VOUCHER_LIMITS.QUANTITY_MAX} mã`).nullable().optional(),
  prizes: z
    .array(z.object({
      label: z.string().trim().min(1, 'Nhập tên giải').max(VOUCHER_LIMITS.PRIZE_LABEL_MAX, `Tên giải tối đa ${VOUCHER_LIMITS.PRIZE_LABEL_MAX} ký tự`),
      quantity: z.coerce.number().int().min(1).max(VOUCHER_LIMITS.QUANTITY_MAX),
      weight: z.coerce.number().int().min(1).max(VOUCHER_LIMITS.WEIGHT_MAX),
    }))
    .min(1, 'Thêm ít nhất 1 giải')
    .max(VOUCHER_LIMITS.PRIZES_MAX, `Tối đa ${VOUCHER_LIMITS.PRIZES_MAX} giải`)
    .optional(),
  lose_weight: z.coerce.number().int().min(0).max(VOUCHER_LIMITS.WEIGHT_MAX).optional(),
};
const promotionDates = (body) => !body.starts_at || !body.ends_at || body.ends_at > body.starts_at;
// Voucher / check-in cần số lượng; vòng quay cần danh sách giải
const kindFields = (body) =>
  body.kind === PROMOTION_KINDS.LUCKY_WHEEL ? Boolean(body.prizes?.length) : [PROMOTION_KINDS.VOUCHER, PROMOTION_KINDS.CHECKIN].includes(body.kind) ? Boolean(body.quantity) : true;
export const promotionCreateSchema = z
  .object({ ...promotionFields, kind: z.enum(PROMOTION_KIND_VALUES, 'Loại khuyến mãi không hợp lệ').default(PROMOTION_KINDS.DEAL) })
  .refine(promotionDates, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['ends_at'] })
  .refine(kindFields, { message: 'Nhập số lượng mã (voucher / check-in) hoặc danh sách giải (vòng quay)', path: ['quantity'] });
// Không đổi loại sau khi tạo
export const promotionUpdateSchema = z.object(promotionFields).partial().refine(promotionDates, { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['ends_at'] });

// ── Săn voucher (người dùng) + quán xác nhận mã ──
export const voucherEventsQuerySchema = z.object({ lat: latitude, lng: longitude });
export const voucherClaimSchema = z.object({ lat: latitude.optional(), lng: longitude.optional() });
export const voucherRedeemSchema = z.object({
  code: z.string().trim().toUpperCase().regex(new RegExp(`^[${VOUCHER_LIMITS.CODE_ALPHABET}]{${VOUCHER_LIMITS.CODE_LENGTH}}$`), `Mã gồm ${VOUCHER_LIMITS.CODE_LENGTH} ký tự chữ / số`),
});

// ── Đánh giá của khách ──
export const reviewsQuerySchema = z.object({
  place_id: objectId('Cửa hàng').optional(),
  filter: z.enum(['all', 'unreplied'], 'Bộ lọc không hợp lệ').default('all'),
  before: cursorDate,
});
export const reviewReplySchema = z.object({ text: z.string().trim().max(L.REPLY_MAX, `Phản hồi tối đa ${L.REPLY_MAX} ký tự`) });
