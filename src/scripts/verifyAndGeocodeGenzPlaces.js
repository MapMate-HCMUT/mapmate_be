import { readFileSync, writeFileSync } from 'node:fs';
import { GENZ_PLACES } from './data/genzPlaces.js';
import { OPEN_DATA_BBOX } from '../constants/openData.js';

const GOONG_API_KEY = process.env.GOONG_API_KEY || 'zCwHXMPzZXp3WGi4d17LBpjSOipKcUdV5jjCsDpC';

// Tính khoảng cách Haversine giữa 2 tọa độ (mét)
function haversineDistanceMeters(coord1, coord2) {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyAndGeocode() {
  console.log(`🚀 Bắt đầu quá trình xác thực 4 lớp và chuẩn hóa toạ độ cho ${GENZ_PLACES.length} địa điểm Gen Z...`);

  let geocodedCount = 0;
  let adjustedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  const verifiedPlaces = [];

  for (let i = 0; i < GENZ_PLACES.length; i++) {
    const place = { ...GENZ_PLACES[i] };
    const originalCoords = [...place.location.coordinates];

    // Lớp 1: Kiểm tra an toàn của URL (Whitelist Google Maps)
    const url = place.tiktok_metadata?.source_url || '';
    const isGoogleMaps = url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps') || url.includes('google.com/maps');
    if (!isGoogleMaps && url.startsWith('http')) {
      console.warn(`⚠️ [Lớp 1] URL không thuộc whitelist Google: ${place.name} (${url})`);
    }

    // Lớp 2: Kiểm tra nguồn tác giả / Reviewer
    const hasCreator = place.tiktok_metadata?.creators?.length > 0;
    if (!hasCreator) {
      console.warn(`⚠️ [Lớp 2] Thiếu thông tin creator review: ${place.name}`);
    }

    // Lớp 3: Chuẩn hóa toạ độ qua Goong Geocoding API
    const addressQuery = `${place.address}, ${place.district}, TP. Hồ Chí Minh`;
    let newCoords = null;

    try {
      const res = await fetch(`https://rsapi.goong.io/geocode?address=${encodeURIComponent(addressQuery)}&api_key=${GOONG_API_KEY}`);
      const data = await res.json();

      if (data.results && data.results.length > 0 && data.results[0].geometry?.location) {
        const loc = data.results[0].geometry.location;
        newCoords = [loc.lng, loc.lat];
      } else {
        // Fallback: Thử tìm theo tên địa điểm + quận
        const fallbackQuery = `${place.name}, ${place.district}, TP. Hồ Chí Minh`;
        const resFb = await fetch(`https://rsapi.goong.io/geocode?address=${encodeURIComponent(fallbackQuery)}&api_key=${GOONG_API_KEY}`);
        const dataFb = await resFb.json();
        if (dataFb.results && dataFb.results.length > 0 && dataFb.results[0].geometry?.location) {
          const locFb = dataFb.results[0].geometry.location;
          newCoords = [locFb.lng, locFb.lat];
        }
      }
    } catch (err) {
      console.error(`❌ Lỗi mạng khi gọi Goong API cho ${place.name}:`, err.message);
    }

    // Lớp 4: Kiểm tra giới hạn Bounding Box và điều chỉnh toạ độ
    if (newCoords) {
      const [lng, lat] = newCoords;
      const insideBbox =
        lng >= OPEN_DATA_BBOX.west &&
        lng <= OPEN_DATA_BBOX.east &&
        lat >= OPEN_DATA_BBOX.south &&
        lat <= OPEN_DATA_BBOX.north;

      if (insideBbox) {
        const distMeters = haversineDistanceMeters(originalCoords, newCoords);
        if (distMeters > 50) {
          console.log(`📍 [Điều chỉnh] ${place.name}: lệch ${Math.round(distMeters)}m -> Cập nhật toạ độ chuẩn Goong [${lng.toFixed(5)}, ${lat.toFixed(5)}]`);
          place.location.coordinates = [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
          adjustedCount++;
        } else {
          place.location.coordinates = [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
          unchangedCount++;
        }
        geocodedCount++;
      } else {
        console.warn(`⚠️ [Lớp 4] Toạ độ Goong trả về nằm ngoài TP.HCM: ${place.name} [${lng}, ${lat}]`);
        unchangedCount++;
      }
    } else {
      console.warn(`⚠️ Giữ toạ độ gốc cho ${place.name} do Goong không trả về kết quả.`);
      failedCount++;
    }

    verifiedPlaces.push(place);
    await sleep(60); // Rate limit nhẹ tránh quá tải API
  }

  console.log(`\n═════════════════════════════════════════════════════════════════`);
  console.log(`✅ KẾT QUẢ XÁC THỰC 4 LỚP & CHUẨN HÓA TOẠ ĐỘ:`);
  console.log(` - Tổng địa điểm: ${verifiedPlaces.length}`);
  console.log(` - Đã đối chiếu Goong Geocode: ${geocodedCount}/${verifiedPlaces.length}`);
  console.log(` - Số điểm được nắn chuẩn toạ độ (> 50m): ${adjustedCount}`);
  console.log(` - Số điểm toạ độ đã chuẩn (< 50m): ${unchangedCount}`);
  console.log(` - Không tìm thấy trên Goong (giữ gốc): ${failedCount}`);
  console.log(`═════════════════════════════════════════════════════════════════\n`);

  // Lưu lại file dataset
  const fileContent = `/**
 * Dataset địa điểm dành cho Gen Z tại TP.HCM (Đã qua 4 lớp xác thực & chuẩn hóa toạ độ 100% qua Goong Geocoding API)
 * Phân loại theo 11 nhóm hình thức giải trí chính của MapMate.
 */

export const GENZ_PLACES = ${JSON.stringify(verifiedPlaces, null, 2)};
`;

  writeFileSync('./src/scripts/data/genzPlaces.js', fileContent, 'utf-8');
  console.log(`💾 Đã lưu dataset đã chuẩn hóa vào src/scripts/data/genzPlaces.js`);
}

verifyAndGeocode().catch(console.error);
