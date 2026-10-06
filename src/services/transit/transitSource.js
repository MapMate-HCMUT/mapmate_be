// Đọc API công khai mà trang buyttphcm.com.vn dùng (apicms.ebms.vn): tuyến, lượt, trạm, lộ trình, giờ xuất bến, dự đoán xe tới trạm.
// Không đăng nhập; khi nhập dữ liệu có giãn cách + lưu phản hồi thô vào data/transit/cache (chạy lại không tải lại).
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TRANSIT_SOURCE } from '../../constants/transit.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchTransitJson = async (apiPath) => {
  const response = await fetch(`${TRANSIT_SOURCE.BASE_URL}${apiPath}`, {
    headers: { 'User-Agent': TRANSIT_SOURCE.USER_AGENT, Referer: TRANSIT_SOURCE.REFERER, Accept: 'application/json' },
    signal: AbortSignal.timeout(TRANSIT_SOURCE.TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`API xe buýt HTTP ${response.status} (${apiPath})`);
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
};

/** Dùng khi nhập dữ liệu: đọc cache nếu còn mới, không thì gọi API (giãn cách) rồi lưu cache. */
export const createImportClient = ({ refresh = false, attempts = 3 } = {}) => {
  let lastCallAt = 0;
  let queue = Promise.resolve(); // gọi mạng lần lượt từng request (kể cả khi code gọi song song)
  const cacheFile = (apiPath) => path.join(TRANSIT_SOURCE.CACHE_DIR, `${apiPath.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
  const stats = { requests: 0, cached: 0 };

  const get = async (apiPath) => {
    const file = cacheFile(apiPath);
    if (!refresh && existsSync(file) && Date.now() - (await stat(file)).mtimeMs < TRANSIT_SOURCE.CACHE_TTL_DAYS * DAY_MS) {
      stats.cached += 1;
      return JSON.parse(await readFile(file, 'utf8'));
    }
    const task = queue.then(() => download(apiPath, file));
    queue = task.catch(() => {});
    return task;
  };

  const download = async (apiPath, file) => {
    for (let attempt = 1; ; attempt += 1) {
      await sleep(Math.max(0, lastCallAt + TRANSIT_SOURCE.REQUEST_GAP_MS - Date.now()));
      lastCallAt = Date.now();
      try {
        const data = await fetchTransitJson(apiPath);
        stats.requests += 1;
        await mkdir(TRANSIT_SOURCE.CACHE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify(data));
        return data;
      } catch (error) {
        if (attempt >= attempts) throw error;
        console.log(`   ${error.message} — thử lại`);
        await sleep(attempt * 3000);
      }
    }
  };
  return { get, stats };
};
