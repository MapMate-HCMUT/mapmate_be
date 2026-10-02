import { z } from 'zod';
import { AVATAR_URL_MAX_LENGTH, HOME_AREA_FIELD_MAX_LENGTH, MAX_USER_AGE, MIN_USER_AGE } from '../../constants/auth.js';
import { XP_HISTORY_DEFAULT_LIMIT, XP_HISTORY_MAX_LIMIT } from '../../constants/gamification.js';
import { passwordRules, usernameRules } from './auth.validator.js';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
// "123 Nguyễn Huệ", "12/3A Lê Lợi", "số 5 ..." => có số nhà => từ chối
const HOUSE_NUMBER_PATTERN = /^\s*(số\s*(nhà\s*)?)?\d+[a-z]?([/-]\d+[a-z]?)*[\s,]/i;

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'ID không hợp lệ');
export const userIdParamSchema = z.object({ id: objectIdSchema });

const yearsAgo = (years) => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
};

const birthDateSchema = z
  .iso.date('Ngày sinh không hợp lệ (định dạng YYYY-MM-DD)')
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => date <= yearsAgo(MIN_USER_AGE), `Bạn cần ít nhất ${MIN_USER_AGE} tuổi`)
  .refine((date) => date >= yearsAgo(MAX_USER_AGE), 'Ngày sinh không hợp lệ');

const areaText = (label) =>
  z
    .string(`${label} phải là chuỗi ký tự`)
    .trim()
    .max(HOME_AREA_FIELD_MAX_LENGTH, `${label} tối đa ${HOME_AREA_FIELD_MAX_LENGTH} ký tự`)
    .transform((value) => value || null)
    .nullable()
    .optional();

// Chỉ khu vực — không số nhà, không toạ độ.
const homeAreaSchema = z.strictObject({
  street: areaText('Tên đường').refine((value) => !value || !HOUSE_NUMBER_PATTERN.test(value), 'Chỉ nhập tên đường, không nhập số nhà'),
  district: areaText('Quận / Phường'),
  city: areaText('Thành phố'),
  country: areaText('Quốc gia'),
});

export const updateProfileSchema = z.strictObject(
  {
    username: usernameRules.optional(),
    avatar_url: z
      .url({ protocol: /^https?$/, error: 'Link ảnh phải bắt đầu bằng http:// hoặc https://' })
      .max(AVATAR_URL_MAX_LENGTH, 'Link ảnh quá dài')
      .nullable()
      .optional(),
    birth_date: birthDateSchema.nullable().optional(),
    home_area: homeAreaSchema.nullable().optional(),
  },
  { error: (issue) => (issue.code === 'unrecognized_keys' ? 'Có trường không được phép sửa' : undefined) },
);

export const avatarUploadSchema = z.object({
  image: z.string('Thiếu dữ liệu ảnh').startsWith('data:image/', 'Dữ liệu ảnh không hợp lệ'),
});

export const checkUsernameQuerySchema = z.object({ username: usernameRules });

export const changePasswordSchema = z.object({
  current_password: z.string('Vui lòng nhập mật khẩu hiện tại').min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  new_password: passwordRules,
});

export const xpHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(XP_HISTORY_MAX_LIMIT).default(XP_HISTORY_DEFAULT_LIMIT),
  before: z.coerce.date('Cursor không hợp lệ').optional(),
});

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
