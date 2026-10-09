// Ảnh / video bài viết (Cloudinary): chữ ký tải lên, chặn file không phải của người đăng, link hiển thị. Chạy: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

// Cấu hình giả (chạy test không cần tài khoản Cloudinary thật)
process.env.JWT_SECRET ??= 'test-only-secret';
process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
process.env.CLOUDINARY_API_KEY = '123456';
process.env.CLOUDINARY_API_SECRET = 'top-secret';
const { buildUploadSignature, quotaProblem, toMediaView, usageFlags, verifyPostMedia } = await import('../src/services/media.service.js');

const USER = '6a0000000000000000000001';

describe('chữ ký tải lên Cloudinary', () => {
  it('public_id nằm trong thư mục riêng của người dùng + chữ ký đúng chuẩn Cloudinary', () => {
    const signed = buildUploadSignature(USER, 'image');
    assert.match(signed.public_id, new RegExp(`^mapmate/images/${USER}_[0-9a-f]{24}$`));
    assert.equal(signed.asset_folder, 'mapmate/images');
    assert.equal(signed.upload_url, 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
    const payload = `allowed_formats=${signed.allowed_formats}&asset_folder=mapmate/images&public_id=${signed.public_id}&timestamp=${signed.timestamp}`;
    assert.equal(signed.signature, crypto.createHash('sha1').update(`${payload}top-secret`).digest('hex'));
    assert.ok(!JSON.stringify(signed).includes('top-secret'), 'không bao giờ lộ API secret');
  });

  it('video chỉ nhận định dạng video + Cloudinary làm sẵn bản phát (video lớn mới phát được)', () => {
    const signed = buildUploadSignature(USER, 'video');
    assert.match(signed.allowed_formats, /mp4/);
    assert.equal(signed.eager_async, 'true');
    assert.match(signed.eager, /\/mp4\|.*\/jpg$/);
    assert.match(signed.public_id, new RegExp(`^mapmate/videos/${USER}_`));
    const payload = `allowed_formats=${signed.allowed_formats}&asset_folder=mapmate/videos&eager=${signed.eager}&eager_async=true&public_id=${signed.public_id}&timestamp=${signed.timestamp}`;
    assert.equal(signed.signature, crypto.createHash('sha1').update(`${payload}top-secret`).digest('hex'));
  });
});

describe('kiểm tra file đính kèm khi đăng bài', () => {
  it('chặn file của người khác / quá số lượng (trước cả khi hỏi Cloudinary)', async () => {
    await assert.rejects(verifyPostMedia(USER, [{ public_id: 'mapmate/images/6a0000000000000000000002_abc', resource_type: 'image' }]), /không hợp lệ/);
    await assert.rejects(verifyPostMedia(USER, [{ public_id: `mapmate/images/${USER}_abc`, resource_type: 'video' }]), /không hợp lệ/); // ảnh khai là video
    const sevenImages = Array.from({ length: 7 }, (_, index) => ({ public_id: `mapmate/images/${USER}_${index}`, resource_type: 'image' }));
    await assert.rejects(verifyPostMedia(USER, sevenImages), /tối đa 6/);
    const twoVideos = [0, 1].map((index) => ({ public_id: `mapmate/videos/${USER}_v${index}`, resource_type: 'video' }));
    await assert.rejects(verifyPostMedia(USER, twoVideos), /tối đa 1 video/);
    assert.deepEqual(await verifyPostMedia(USER, []), []);
  });
});

describe('link hiển thị', () => {
  it('ảnh có bản lớn + ảnh nhỏ; video có mp4 + ảnh bìa', () => {
    const image = toMediaView({ public_id: 'mapmate/images/u_a', resource_type: 'image', cloud_name: 'demo-cloud' });
    assert.match(image.url, /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\/.*f_auto.*\/mapmate\/images\/u_a$/);
    assert.ok(image.thumb_url.includes('c_fill'));
    const video = toMediaView({ public_id: 'mapmate/videos/u_v', resource_type: 'video', cloud_name: 'demo-cloud', duration: 12 });
    assert.ok(video.url.endsWith('/mapmate/videos/u_v.mp4'));
    assert.ok(video.poster_url.endsWith('/mapmate/videos/u_v.jpg'));
  });
});

describe('chống quá tải hạn mức Cloudinary', () => {
  it('hạn mức mỗi người / ngày: số file, số video, dung lượng', () => {
    assert.equal(quotaProblem({ files: 0, videos: 0, bytes: 0 }, 'video'), null);
    assert.match(quotaProblem({ files: 30, videos: 0, bytes: 0 }, 'image'), /30 ảnh/);
    assert.match(quotaProblem({ files: 6, videos: 5, bytes: 0 }, 'video'), /5 video/);
    assert.equal(quotaProblem({ files: 6, videos: 5, bytes: 0 }, 'image'), null, 'hết lượt video vẫn đăng ảnh được');
    assert.match(quotaProblem({ files: 6, videos: 1, bytes: 500 * 1024 * 1024 }, 'image'), /500MB/);
  });

  it('cầu dao theo % hạn mức tháng của cả app: ≥80% tắt video, ≥90% tắt hết; chưa biết => không chặn', () => {
    assert.deepEqual(usageFlags(null), { uploads: true, videos: true });
    assert.deepEqual(usageFlags(50), { uploads: true, videos: true });
    assert.deepEqual(usageFlags(85), { uploads: true, videos: false });
    assert.deepEqual(usageFlags(95), { uploads: false, videos: false });
  });
});
