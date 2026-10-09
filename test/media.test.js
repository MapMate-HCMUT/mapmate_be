// Ảnh / video bài viết (Cloudinary): chữ ký tải lên, chặn file không phải của người đăng, link hiển thị. Chạy: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

// Cấu hình giả (chạy test không cần tài khoản Cloudinary thật)
process.env.JWT_SECRET ??= 'test-only-secret';
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = '123456';
process.env.CLOUDINARY_API_SECRET = 'top-secret';
const { createUploadSignature, getUploadConfig, toMediaView, verifyPostMedia } = await import('../src/services/media.service.js');

const USER = '6a0000000000000000000001';

describe('chữ ký tải lên Cloudinary', () => {
  it('public_id nằm trong thư mục riêng của người dùng + chữ ký đúng chuẩn Cloudinary', () => {
    const signed = createUploadSignature(USER, 'image');
    assert.match(signed.public_id, new RegExp(`^mapmate/posts/${USER}/[0-9a-f]{24}$`));
    assert.equal(signed.upload_url, 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
    const payload = `allowed_formats=${signed.allowed_formats}&public_id=${signed.public_id}&timestamp=${signed.timestamp}`;
    assert.equal(signed.signature, crypto.createHash('sha1').update(`${payload}top-secret`).digest('hex'));
    assert.ok(!JSON.stringify(signed).includes('top-secret'), 'không bao giờ lộ API secret');
  });

  it('video chỉ nhận định dạng video', () => {
    assert.match(createUploadSignature(USER, 'video').allowed_formats, /mp4/);
    assert.equal(getUploadConfig().enabled, true);
  });
});

describe('kiểm tra file đính kèm khi đăng bài', () => {
  it('chặn file của người khác / quá số lượng (trước cả khi hỏi Cloudinary)', async () => {
    await assert.rejects(verifyPostMedia(USER, [{ public_id: 'mapmate/posts/6a0000000000000000000002/abc', resource_type: 'image' }]), /không hợp lệ/);
    const sevenImages = Array.from({ length: 7 }, (_, index) => ({ public_id: `mapmate/posts/${USER}/${index}`, resource_type: 'image' }));
    await assert.rejects(verifyPostMedia(USER, sevenImages), /tối đa 6/);
    const twoVideos = [0, 1].map((index) => ({ public_id: `mapmate/posts/${USER}/v${index}`, resource_type: 'video' }));
    await assert.rejects(verifyPostMedia(USER, twoVideos), /tối đa 1 video/);
    assert.deepEqual(await verifyPostMedia(USER, []), []);
  });
});

describe('link hiển thị', () => {
  it('ảnh có bản lớn + ảnh nhỏ; video có mp4 + ảnh bìa', () => {
    const image = toMediaView({ public_id: 'mapmate/posts/u/a', resource_type: 'image', cloud_name: 'demo-cloud' });
    assert.match(image.url, /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\/.*f_auto.*\/mapmate\/posts\/u\/a$/);
    assert.ok(image.thumb_url.includes('c_fill'));
    const video = toMediaView({ public_id: 'mapmate/posts/u/v', resource_type: 'video', cloud_name: 'demo-cloud', duration: 12 });
    assert.ok(video.url.endsWith('/mapmate/posts/u/v.mp4'));
    assert.ok(video.poster_url.endsWith('/mapmate/posts/u/v.jpg'));
  });
});
