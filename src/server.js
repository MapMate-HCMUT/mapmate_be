import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { startMediaCleanup } from './services/media.service.js';
import { getNetwork } from './services/transit/transitNetwork.js';

try {
  await connectDB();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend running at http://localhost:${env.port}`);
  });
  // Nạp sẵn mạng lưới xe buýt / metro (lần tìm đường đầu tiên không phải chờ ~2 giây)
  getNetwork().catch((error) => console.warn('[transit] chưa nạp được mạng lưới:', error.message));
  startMediaCleanup(); // xoá ảnh / video tải lên mà không đăng bài (quá 6 giờ)
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1);
}
