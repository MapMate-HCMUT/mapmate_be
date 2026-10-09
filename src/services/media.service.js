// Ảnh / video người dùng đăng kèm bài viết — lưu ở Cloudinary.
// Luồng: (1) trình duyệt xin chữ ký cho từng file (POST /api/uploads/signature) => server tự đặt public_id trong thư mục
// riêng của người đó; (2) trình duyệt tải THẲNG lên Cloudinary (file không đi qua server MapMate);
// (3) khi đăng bài, server hỏi lại Cloudinary để chắc file có thật, đúng của người đó, không vượt dung lượng / thời lượng.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { POST_MEDIA } from '../constants/social.js';
import { AppError } from '../utils/AppError.js';

const API_BASE = 'https://api.cloudinary.com/v1_1';
const DELIVERY_BASE = 'https://res.cloudinary.com';
const RANDOM_ID_BYTES = 12;
const SECONDS_PER_MS = 1000;

// Kích thước hiển thị (Cloudinary tự đổi định dạng / nén theo trình duyệt — f_auto, q_auto)
const TRANSFORMS = {
  image: 'c_limit,w_1280,f_auto,q_auto',
  thumb: 'c_fill,w_480,h_480,g_auto,f_auto,q_auto',
  video: 'c_limit,w_1280,q_auto',
  poster: 'so_0,c_fill,w_720,h_720,g_auto,q_auto',
};

export const isMediaEnabled = () => Boolean(env.cloudinary);

const mediaDisabled = () =>
  new AppError('Tính năng đăng ảnh / video đang tạm tắt — bạn vẫn đăng bài bằng chữ được', HTTP_STATUS.SERVICE_UNAVAILABLE, EXPLORE_ERROR_CODES.MEDIA_DISABLED);
const mediaInvalid = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST, EXPLORE_ERROR_CODES.MEDIA_INVALID);

// Chữ ký Cloudinary: SHA-1 của "a=1&b=2" (tham số xếp theo tên) nối với API secret
const sign = (params) => {
  const payload = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(payload + env.cloudinary.apiSecret).digest('hex');
};

const userFolder = (userId) => `${POST_MEDIA.FOLDER}/${userId}`;

// Giới hạn hiển thị cho giao diện (kiểm tra trước khi tải, server vẫn kiểm tra lại khi đăng bài)
export const getUploadConfig = () => ({
  enabled: isMediaEnabled(),
  max_items: POST_MEDIA.MAX_ITEMS,
  max_videos: POST_MEDIA.MAX_VIDEOS,
  image_max_bytes: POST_MEDIA.IMAGE_MAX_BYTES,
  video_max_bytes: POST_MEDIA.VIDEO_MAX_BYTES,
  video_max_seconds: POST_MEDIA.VIDEO_MAX_SECONDS,
  formats: POST_MEDIA.FORMATS,
});

/** Chữ ký cho 1 file: trình duyệt gửi kèm các tham số này khi tải lên Cloudinary. */
export const createUploadSignature = (userId, resourceType) => {
  if (!isMediaEnabled()) throw mediaDisabled();
  const params = {
    allowed_formats: POST_MEDIA.FORMATS[resourceType].join(','),
    public_id: `${userFolder(userId)}/${crypto.randomBytes(RANDOM_ID_BYTES).toString('hex')}`,
    timestamp: Math.floor(Date.now() / SECONDS_PER_MS),
  };
  return {
    upload_url: `${API_BASE}/${env.cloudinary.cloudName}/${resourceType}/upload`,
    resource_type: resourceType,
    api_key: env.cloudinary.apiKey,
    ...params,
    signature: sign(params),
  };
};

const fetchResource = async (resourceType, publicId) => {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${API_BASE}/${cloudName}/resources/${resourceType}/upload/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
    signal: AbortSignal.timeout(POST_MEDIA.REQUEST_TIMEOUT_MS),
  });
  return response.ok ? response.json() : null;
};

/**
 * Kiểm tra ảnh / video gửi kèm bài viết: đúng thư mục của người đăng, có thật trên Cloudinary, trong giới hạn.
 * @param {Array<{ public_id, resource_type }>} items
 * @returns {Promise<Array>} dữ liệu lưu vào bài viết
 */
export const verifyPostMedia = async (userId, items = []) => {
  if (!items.length) return [];
  if (!isMediaEnabled()) throw mediaDisabled();
  if (items.length > POST_MEDIA.MAX_ITEMS) throw mediaInvalid(`Mỗi bài tối đa ${POST_MEDIA.MAX_ITEMS} ảnh / video`);
  if (items.filter((item) => item.resource_type === 'video').length > POST_MEDIA.MAX_VIDEOS) throw mediaInvalid(`Mỗi bài tối đa ${POST_MEDIA.MAX_VIDEOS} video`);
  if (items.some((item) => !item.public_id.startsWith(`${userFolder(userId)}/`))) throw mediaInvalid('Ảnh / video không hợp lệ, bạn tải lại giúp mình nhé');

  const resources = await Promise.all(items.map((item) => fetchResource(item.resource_type, item.public_id).catch(() => null)));
  return resources.map((resource, index) => {
    const { resource_type: type } = items[index];
    if (!resource) throw mediaInvalid('Có ảnh / video chưa tải lên xong — đợi một chút rồi đăng lại nhé');
    const maxBytes = type === 'video' ? POST_MEDIA.VIDEO_MAX_BYTES : POST_MEDIA.IMAGE_MAX_BYTES;
    if (resource.bytes > maxBytes) throw mediaInvalid(`File quá lớn (tối đa ${Math.round(maxBytes / 1024 / 1024)}MB)`);
    if (type === 'video' && resource.duration > POST_MEDIA.VIDEO_MAX_SECONDS) throw mediaInvalid(`Video tối đa ${POST_MEDIA.VIDEO_MAX_SECONDS} giây`);
    return {
      public_id: resource.public_id,
      resource_type: type,
      cloud_name: env.cloudinary.cloudName,
      width: resource.width ?? null,
      height: resource.height ?? null,
      duration: resource.duration ?? null,
      bytes: resource.bytes ?? null,
    };
  });
};

// Link hiển thị (không lưu link — dựng từ public_id, đổi kích thước / định dạng tuỳ chỗ dùng)
export const toMediaView = (media) => {
  const base = `${DELIVERY_BASE}/${media.cloud_name}/${media.resource_type}/upload`;
  if (media.resource_type === 'video') {
    return {
      type: 'video', url: `${base}/${TRANSFORMS.video}/${media.public_id}.mp4`, poster_url: `${base}/${TRANSFORMS.poster}/${media.public_id}.jpg`,
      width: media.width, height: media.height, duration: media.duration,
    };
  }
  return { type: 'image', url: `${base}/${TRANSFORMS.image}/${media.public_id}`, thumb_url: `${base}/${TRANSFORMS.thumb}/${media.public_id}`, width: media.width, height: media.height };
};

// Xoá file trên Cloudinary khi xoá bài (không chặn việc xoá bài nếu Cloudinary lỗi)
export const deleteMedia = async (items = []) => {
  if (!isMediaEnabled() || !items.length) return;
  const { cloudName, apiKey } = env.cloudinary;
  await Promise.allSettled(items.map((item) => {
    const params = { public_id: item.public_id, timestamp: Math.floor(Date.now() / SECONDS_PER_MS) };
    const body = new URLSearchParams({ ...params, api_key: apiKey, signature: sign(params) });
    return fetch(`${API_BASE}/${cloudName}/${item.resource_type}/destroy`, { method: 'POST', body, signal: AbortSignal.timeout(POST_MEDIA.REQUEST_TIMEOUT_MS) });
  }));
};
