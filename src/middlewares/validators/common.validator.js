import { z } from 'zod';
import { POST_MAX_TAGS, POST_TAG_MAX_LENGTH } from '../../constants/social.js';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const HASHTAG_PATTERN = new RegExp(`^[\\p{L}\\p{N}_]{1,${POST_TAG_MAX_LENGTH}}$`, 'u');

export const objectId = (label = 'ID') => z.string(`${label} không hợp lệ`).regex(OBJECT_ID_PATTERN, `${label} không hợp lệ`);
export const idParam = (name = 'id') => z.object({ [name]: objectId() });
export const timeOfDay = z.string().regex(TIME_PATTERN, 'Giờ phải có dạng HH:mm');
export const cursorDate = z.coerce.date('Cursor không hợp lệ').optional();

// Query string "food,cafe" (hoặc mảng) -> ['food', 'cafe']
export const csvList = (itemSchema, max = 20) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value ?? []),
    z.array(itemSchema).max(max),
  );

// Mảng ID không trùng nhau
export const objectIdList = (max, min = 0) =>
  z.array(objectId()).min(min).max(max).transform((ids) => [...new Set(ids)]);

const cleanHashtag = (tag) => tag.trim().replace(/^#+/, '').toLowerCase();

// "#HẹnHò" -> "hẹnhò": bỏ dấu #, viết thường, bỏ trùng; chỉ chữ/số/"_".
export const hashtag = z.string().transform(cleanHashtag).pipe(z.string().regex(HASHTAG_PATTERN, `Hashtag chỉ gồm chữ, số, "_" và tối đa ${POST_TAG_MAX_LENGTH} ký tự`));
export const hashtagList = z
  .array(z.string())
  .max(POST_MAX_TAGS, `Tối đa ${POST_MAX_TAGS} hashtag`)
  .transform((tags) => [...new Set(tags.map(cleanHashtag).filter(Boolean))])
  .pipe(z.array(z.string().regex(HASHTAG_PATTERN, `Hashtag chỉ gồm chữ, số, "_" và tối đa ${POST_TAG_MAX_LENGTH} ký tự`)));
