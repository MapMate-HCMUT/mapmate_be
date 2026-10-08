import { z } from 'zod';
import {
  FEED_DEFAULT_LIMIT,
  FEED_MAX_LIMIT,
  FEED_SCOPES,
  PIN_NOTE_MAX_LENGTH,
  PIN_STATUS,
  POST_CONTENT_MAX_LENGTH,
  POST_MAX_TAGGED_USERS,
  POST_MEDIA,
  MEDIA_TYPES,
  POST_TYPES,
  POST_VISIBILITY,
  SHARE_MAX_RECIPIENTS,
  SHARE_MESSAGE_MAX_LENGTH,
} from '../../constants/social.js';
import { cursorDate, hashtag, hashtagList, objectId, objectIdList } from './common.validator.js';

const postContent = z.string('Nội dung phải là chuỗi ký tự').trim().max(POST_CONTENT_MAX_LENGTH, `Nội dung tối đa ${POST_CONTENT_MAX_LENGTH} ký tự`);
const starRating = z.coerce.number().int().min(1).max(5);
const mediaItem = z.object({
  public_id: z.string().trim().min(1).max(200),
  resource_type: z.enum(MEDIA_TYPES, 'Loại tệp đính kèm không hợp lệ'),
});

// POST /api/posts
export const createPostSchema = z
  .object({
    type: z.enum(Object.values(POST_TYPES), 'Loại bài viết không hợp lệ'),
    content: postContent.default(''),
    place_id: objectId('Địa điểm').optional(),
    itinerary_id: objectId('Lộ trình').optional(),
    rating: starRating.nullable().optional(),
    visited: z.boolean().default(false),
    tags: hashtagList.default([]),
    tagged_user_ids: objectIdList(POST_MAX_TAGGED_USERS).default([]),
    visibility: z.enum(Object.values(POST_VISIBILITY)).default(POST_VISIBILITY.PUBLIC),
    media: z.array(mediaItem).max(POST_MEDIA.MAX_ITEMS, `Mỗi bài tối đa ${POST_MEDIA.MAX_ITEMS} ảnh / video`).default([]),
  })
  .superRefine((post, context) => {
    const require = (condition, path, message) => condition || context.addIssue({ code: 'custom', path: [path], message });
    if (post.type === POST_TYPES.PLACE) require(post.place_id, 'place_id', 'Hãy chọn địa điểm muốn giới thiệu');
    if (post.type === POST_TYPES.ITINERARY) require(post.itinerary_id, 'itinerary_id', 'Hãy chọn lộ trình muốn chia sẻ');
    if (post.type === POST_TYPES.TEXT) require(post.content.length > 0 || post.media.length > 0, 'content', 'Hãy viết gì đó hoặc thêm ảnh trước khi đăng');
  });

export const repostSchema = z.object({ content: postContent.default('') });

// GET /api/posts
export const feedQuerySchema = z.object({
  scope: z.enum(Object.values(FEED_SCOPES)).default(FEED_SCOPES.PUBLIC),
  tag: hashtag.optional(),
  place_id: objectId('Địa điểm').optional(),
  author_id: objectId('Người dùng').optional(),
  before: cursorDate,
  limit: z.coerce.number().int().min(1).max(FEED_MAX_LIMIT).default(FEED_DEFAULT_LIMIT),
});

// POST /api/posts/:id/share
export const sharePostSchema = z.object({
  friend_ids: objectIdList(SHARE_MAX_RECIPIENTS, 1),
  message: z.string().trim().max(SHARE_MESSAGE_MAX_LENGTH).default(''),
});

// POST /api/friends/requests
export const friendRequestSchema = z.object({ user_id: objectId('Người dùng') });
// GET /api/users/search
export const userSearchQuerySchema = z.object({ q: z.string().trim().min(1, 'Nhập tên cần tìm').max(30) });

// PUT /api/pins/:placeId
export const setPinSchema = z.object({
  status: z.enum(Object.values(PIN_STATUS)).default(PIN_STATUS.VISITED),
  note: z.string().trim().max(PIN_NOTE_MAX_LENGTH, `Ghi chú tối đa ${PIN_NOTE_MAX_LENGTH} ký tự`).optional(),
  rating: starRating.nullable().optional(),
  visited_on: z.iso.date('Ngày không hợp lệ').transform((value) => new Date(`${value}T00:00:00.000Z`)).nullable().optional(),
});
export const pinListQuerySchema = z.object({ status: z.enum(Object.values(PIN_STATUS)).optional() });

// POST /api/uploads/signature — xin chữ ký tải 1 ảnh / video lên Cloudinary
export const uploadSignatureSchema = z.object({ resource_type: z.enum(MEDIA_TYPES, 'Chỉ tải được ảnh hoặc video') });
