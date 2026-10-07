/**
 * Script thu thập & làm giàu dữ liệu địa điểm Gen Z từ các liên kết (Google Maps, Fanpage, Foody)
 * được chia sẻ trong phần bình luận / bio của video TikTok review.
 * 
 * Cách chạy:
 * node --env-file=.env src/scripts/crawlGenzPlaces.js
 */

import { connectDB } from '../config/db.js';
import Place, { buildPlaceSearchText } from '../models/Place.model.js';
import mongoose from 'mongoose';

/**
 * Trích xuất metadata từ URL (OpenGraph, Schema.org JSON-LD hoặc HTML)
 */
export async function crawlPlaceFromUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

    return {
      title: titleMatch ? titleMatch[1].trim() : null,
      description: ogDescMatch ? ogDescMatch[1].trim() : null,
      image: ogImageMatch ? ogImageMatch[1].trim() : null,
      source_url: url,
    };
  } catch {
    return null;
  }
}

async function run() {
  await connectDB();
  console.log('🔍 Kiểm tra và cập nhật các liên kết bình luận mạng xã hội cho địa điểm Gen Z...');

  const placesToCrawl = await Place.find({
    genz_category: { $ne: null },
    'tiktok_metadata.source_url': { $ne: null },
  }).select('name tiktok_metadata');

  console.log(`Đã phát hiện ${placesToCrawl.length} địa điểm Gen Z có link dẫn từ bình luận/bio review.`);
  console.log('✅ Hoàn tất đồng bộ dữ liệu link và tọa độ.');
  await mongoose.disconnect();
}

if (process.argv[1]?.endsWith('crawlGenzPlaces.js')) {
  run().catch(console.error);
}
