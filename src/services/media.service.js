// Ảnh / video người dùng đăng kèm bài viết — lưu ở Cloudinary.
// Luồng: (1) trình duyệt xin chữ ký cho từng file (POST /api/uploads/signature) => server tự đặt public_id trong thư mục
// riêng của người đó; (2) trình duyệt tải THẲNG lên Cloudinary (file không đi qua server MapMate);
// (3) khi đăng bài, server hỏi lại Cloudinary để chắc file có thật, đúng của người đó, không vượt dung lượng / thời lượng.
// Chống quá tải hạn mức Cloudinary: sổ ghi từng file (MediaUpload), hạn mức mỗi người / ngày, tự xoá file bỏ dở,
// cầu dao tạm ngưng tải lên khi hạn mức tháng của cả app sắp hết. Server MapMate không nhận file => không bị sập vì upload.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MEDIA_UPLOAD_STATUS, MEDIA_USAGE_GUARD, POST_MEDIA } from '../constants/social.js';
import { MediaUpload } from '../models/mediaUpload.model.js';
import { AppError } from '../utils/AppError.js';
import { startOfLocalDay } from '../utils/dateRange.js';

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
const mediaQuota = (message) => new AppError(message, HTTP_STATUS.TOO_MANY_REQUESTS, EXPLORE_ERROR_CODES.MEDIA_QUOTA);
const mediaPaused = (message) => new AppError(message, HTTP_STATUS.SERVICE_UNAVAILABLE, EXPLORE_ERROR_CODES.MEDIA_PAUSED);
const MB = 1024 * 1024;
const toMb = (bytes) => Math.round(bytes / MB);
const adminHeaders = () => ({ Authorization: `Basic ${Buffer.from(`${env.cloudinary.apiKey}:${env.cloudinary.apiSecret}`).toString('base64')}` });

// ── Cầu dao hạn mức tháng của cả app ──
const PAUSED_REASONS = {
  all: 'MapMate tạm ngưng nhận ảnh / video vì dung lượng lưu trữ tháng này sắp hết — bạn vẫn đăng bài bằng chữ được',
  video: 'MapMate tạm ngưng nhận video vì dung lượng tháng này sắp hết — bạn vẫn đăng ảnh được',
};
/** % hạn mức tháng đã dùng => được tải ảnh / video không (hàm thuần, dễ kiểm thử) */
export const usageFlags = (usedPercent) => ({
  uploads: !(usedPercent >= MEDIA_USAGE_GUARD.ALL_OFF_PERCENT),
  videos: !(usedPercent >= MEDIA_USAGE_GUARD.VIDEO_OFF_PERCENT),
});
let usageCache = { at: 0, usedPercent: null, pending: null };
// Hỏi Cloudinary đã dùng bao nhiêu % hạn mức tháng (tối đa 15 phút / lần). Lỗi => coi như chưa biết, không chặn người dùng.
const getUsedPercent = async () => {
  if (Date.now() - usageCache.at < MEDIA_USAGE_GUARD.CHECK_TTL_MS) return usageCache.usedPercent;
  usageCache.pending ??= fetch(`${API_BASE}/${env.cloudinary.cloudName}/usage`, { headers: adminHeaders(), signal: AbortSignal.timeout(POST_MEDIA.REQUEST_TIMEOUT_MS) })
    .then((response) => (response.ok ? response.json() : null))
    .then((usage) => usage?.credits?.used_percent ?? null)
    .catch(() => null)
    .then((usedPercent) => {
      usageCache = { at: Date.now(), usedPercent, pending: null };
      return usedPercent;
    });
  return usageCache.pending;
};

// ── Hạn mức mỗi người / ngày ──
/** Lý do không cho tải thêm 1 file loại `resourceType` với số liệu hôm nay, hoặc null (hàm thuần) */
export const quotaProblem = (today, resourceType) => {
  if (today.files >= POST_MEDIA.DAILY_FILES) return `Hôm nay bạn đã tải ${POST_MEDIA.DAILY_FILES} ảnh / video — mai bạn tải tiếp nhé`;
  if (resourceType === 'video' && today.videos >= POST_MEDIA.DAILY_VIDEOS) return `Hôm nay bạn đã tải ${POST_MEDIA.DAILY_VIDEOS} video — mai bạn tải tiếp nhé (vẫn đăng ảnh được)`;
  if (today.bytes >= POST_MEDIA.DAILY_BYTES) return `Hôm nay bạn đã đăng ${toMb(POST_MEDIA.DAILY_BYTES)}MB ảnh / video — mai bạn tải tiếp nhé`;
  return null;
};
// Tính cả file đã xoá: tải lên rồi xoá vẫn tốn hạn mức => không lách được bằng cách tải - xoá liên tục
const todayStats = async (userId) => {
  const [row] = await MediaUpload.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(String(userId)), created_at: { $gte: startOfLocalDay() } } },
    { $group: { _id: null, files: { $sum: 1 }, videos: { $sum: { $cond: [{ $eq: ['$resource_type', 'video'] }, 1, 0] } }, bytes: { $sum: { $ifNull: ['$bytes', 0] } } } },
  ]);
  return { files: row?.files ?? 0, videos: row?.videos ?? 0, bytes: row?.bytes ?? 0 };
};

// Chữ ký Cloudinary: SHA-1 của "a=1&b=2" (tham số xếp theo tên) nối với API secret
const sign = (params) => {
  const payload = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(payload + env.cloudinary.apiSecret).digest('hex');
};

// Tiền tố tên file của 1 người trong thư mục chung của loại file đó (VD mapmate/videos/<userId>_...)
const ownerPrefix = (userId, resourceType) => `${POST_MEDIA.FOLDERS[resourceType]}/${userId}_`;

// Giới hạn hiển thị cho giao diện (kiểm tra trước khi tải, server vẫn kiểm tra lại khi đăng bài) + lượt còn lại hôm nay
export const getUploadConfig = async (userId = null) => {
  if (!isMediaEnabled()) return { ...UPLOAD_LIMITS, enabled: false, video_enabled: false, paused_reason: null, quota: null };
  const [usedPercent, today] = await Promise.all([getUsedPercent(), userId ? todayStats(userId) : null]);
  const flags = usageFlags(usedPercent);
  return {
    ...UPLOAD_LIMITS,
    enabled: flags.uploads,
    video_enabled: flags.uploads && flags.videos,
    paused_reason: !flags.uploads ? PAUSED_REASONS.all : !flags.videos ? PAUSED_REASONS.video : null,
    quota: today && {
      files_left: Math.max(0, POST_MEDIA.DAILY_FILES - today.files),
      videos_left: Math.max(0, POST_MEDIA.DAILY_VIDEOS - today.videos),
      bytes_left: Math.max(0, POST_MEDIA.DAILY_BYTES - today.bytes),
    },
  };
};

const UPLOAD_LIMITS = {
  max_items: POST_MEDIA.MAX_ITEMS,
  max_videos: POST_MEDIA.MAX_VIDEOS,
  image_max_bytes: POST_MEDIA.IMAGE_MAX_BYTES,
  video_max_bytes: POST_MEDIA.VIDEO_MAX_BYTES,
  video_max_seconds: POST_MEDIA.VIDEO_MAX_SECONDS,
  formats: POST_MEDIA.FORMATS,
  daily_files: POST_MEDIA.DAILY_FILES,
  daily_videos: POST_MEDIA.DAILY_VIDEOS,
  daily_bytes: POST_MEDIA.DAILY_BYTES,
};

// Video lớn (gói miễn phí: > ~40MB) không được xử lý "ngay khi xem" => bảo Cloudinary làm sẵn bản phát (mp4) + ảnh bìa
// ngay sau khi tải lên (chạy nền). Link hiển thị dùng đúng các biến thể này nên phát được cả video 100MB.
const VIDEO_EAGER = `${TRANSFORMS.video}/mp4|${TRANSFORMS.poster}/jpg`;

/** Chữ ký cho 1 file: trình duyệt gửi kèm các tham số này khi tải lên Cloudinary. Ghi sổ + trừ lượt trong ngày. */
export const createUploadSignature = async (userId, resourceType) => {
  if (!isMediaEnabled()) throw mediaDisabled();
  const flags = usageFlags(await getUsedPercent());
  if (!flags.uploads) throw mediaPaused(PAUSED_REASONS.all);
  if (resourceType === 'video' && !flags.videos) throw mediaPaused(PAUSED_REASONS.video);
  const problem = quotaProblem(await todayStats(userId), resourceType);
  if (problem) throw mediaQuota(problem);

  const signed = buildUploadSignature(userId, resourceType);
  await MediaUpload.create({ user_id: userId, public_id: signed.public_id, resource_type: resourceType });
  return signed;
};

// Phần ký thuần (không đụng DB / mạng): tham số tải lên + chữ ký
export const buildUploadSignature = (userId, resourceType) => {
  const params = {
    allowed_formats: POST_MEDIA.FORMATS[resourceType].join(','),
    // public_id có đường dẫn thư mục (tài khoản "fixed folders") + asset_folder (tài khoản "dynamic folders" — mặc định
    // của tài khoản mới) => dù tài khoản kiểu nào, file cũng vào đúng thư mục chung trong Media Library
    public_id: `${ownerPrefix(userId, resourceType)}${crypto.randomBytes(RANDOM_ID_BYTES).toString('hex')}`,
    asset_folder: POST_MEDIA.FOLDERS[resourceType],
    timestamp: Math.floor(Date.now() / SECONDS_PER_MS),
    ...(resourceType === 'video' && { eager: VIDEO_EAGER, eager_async: 'true' }),
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
  const path = publicId.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${API_BASE}/${env.cloudinary.cloudName}/resources/${resourceType}/upload/${path}`, {
    headers: adminHeaders(),
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
  if (items.some((item) => !item.public_id.startsWith(ownerPrefix(userId, item.resource_type)))) throw mediaInvalid('Ảnh / video không hợp lệ, bạn tải lại giúp mình nhé');
  // Phải là file server đã cấp chữ ký cho chính người này và chưa gắn vào bài nào (không dùng 1 file cho nhiều bài)
  const pending = await MediaUpload.countDocuments({ user_id: userId, public_id: { $in: items.map((item) => item.public_id) }, status: MEDIA_UPLOAD_STATUS.PENDING });
  if (pending !== items.length) throw mediaInvalid('Có ảnh / video đã hết hạn hoặc đã dùng cho bài khác — bạn tải lại giúp mình nhé');

  const resources = await Promise.all(items.map((item) => fetchResource(item.resource_type, item.public_id).catch(() => null)));
  const verified = resources.map((resource, index) => {
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
  const today = await todayStats(userId);
  const adding = verified.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  if (today.bytes + adding > POST_MEDIA.DAILY_BYTES) {
    throw mediaQuota(`Hôm nay bạn chỉ còn đăng được ${toMb(Math.max(0, POST_MEDIA.DAILY_BYTES - today.bytes))}MB ảnh / video — bỏ bớt file hoặc mai đăng tiếp nhé`);
  }
  return verified;
};

// Đăng bài thành công => đánh dấu file đã dùng (kèm dung lượng thật để tính hạn mức trong ngày)
export const attachMedia = async (postId, items = []) => {
  if (!items.length) return;
  await MediaUpload.bulkWrite(items.map((item) => ({
    updateOne: { filter: { public_id: item.public_id }, update: { $set: { status: MEDIA_UPLOAD_STATUS.ATTACHED, post_id: postId, bytes: item.bytes } } },
  })));
};

// Link hiển thị (không lưu link — dựng từ public_id, đổi kích thước / định dạng tuỳ chỗ dùng)
export const toMediaView = (media) => {
  const base = `${DELIVERY_BASE}/${media.cloud_name}/${media.resource_type}/upload`;
  if (media.resource_type === 'video') {
    return {
      type: 'video', url: `${base}/${TRANSFORMS.video}/${media.public_id}.mp4`, poster_url: `${base}/${TRANSFORMS.poster}/${media.public_id}.jpg`,
      original_url: `${base}/${media.public_id}`, // bản gốc — dùng tạm khi bản đã nén chưa làm xong (vừa đăng xong)
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
  await MediaUpload.updateMany({ public_id: { $in: items.map((item) => item.public_id) } }, { $set: { status: MEDIA_UPLOAD_STATUS.DELETED } });
};

// ── Dọn file bỏ dở: đã tải lên (có chữ ký) mà quá 6 giờ không gắn vào bài nào => xoá khỏi Cloudinary ──
export const cleanupOrphanMedia = async () => {
  const orphans = await MediaUpload.find(
    { status: MEDIA_UPLOAD_STATUS.PENDING, created_at: { $lt: new Date(Date.now() - POST_MEDIA.ORPHAN_TTL_MS) } },
    { public_id: 1, resource_type: 1 },
  ).limit(POST_MEDIA.CLEANUP_BATCH).lean();
  await deleteMedia(orphans); // file chưa từng tải lên (chỉ xin chữ ký) => Cloudinary báo "not found", vẫn đánh dấu đã xoá
  return orphans.length;
};

export const startMediaCleanup = () => {
  if (!isMediaEnabled()) return;
  const run = () => cleanupOrphanMedia().then((count) => count && console.log(`[media] đã dọn ${count} ảnh / video bỏ dở`)).catch((error) => console.warn('[media] dọn file lỗi:', error.message));
  setTimeout(run, POST_MEDIA.CLEANUP_FIRST_DELAY_MS).unref();
  setInterval(run, POST_MEDIA.CLEANUP_INTERVAL_MS).unref();
};
