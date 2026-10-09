import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Place, { buildPlaceSearchText } from '../models/Place.model.js';
import { SEED_PLACES } from './data/places.js';
import { GENZ_PLACES } from './data/genzPlaces.js';

await connectDB();
await Place.syncIndexes();

// Hợp nhất dữ liệu theo tên chuẩn để tuyệt đối không bị trùng lặp địa điểm
const placeMap = new Map();

for (const p of SEED_PLACES) {
  placeMap.set(p.name, { ...p });
}

for (const g of GENZ_PLACES) {
  if (placeMap.has(g.name)) {
    const existing = placeMap.get(g.name);
    placeMap.set(g.name, {
      ...existing,
      ...g,
      tags: [...new Set([...(existing.tags || []), ...(g.tags || [])])],
      specialties: [...new Set([...(existing.specialties || []), ...(g.specialties || [])])],
    });
  } else {
    placeMap.set(g.name, g);
  }
}

const ALL_SEED_PLACES = Array.from(placeMap.values());

const result = await Place.bulkWrite(
  ALL_SEED_PLACES.map((place) => ({
    updateOne: {
      filter: { name: place.name },
      update: { $set: { ...place, search_text: buildPlaceSearchText(place), cached_at: new Date() } },
      upsert: true,
    },
  })),
);

// Tự động dọn dẹp các tên cũ bị dư hậu tố hoặc trùng lặp nếu từng tồn tại trong DB
const oldDuplicateNames = [
  'Phố Đi Bộ Bùi Viện Nightlife',
  'Chợ Đêm Ẩm Thực Hồ Thị Kỷ',
  'Phố Ốc Vĩnh Khánh Đêm Sài Gòn',
  'Đường Sách Nguyễn Văn Bình - Phố Sách Sài Gòn',
  'Katholic Cat Cafe Mèo Tân Định',
  'Chạng Vạng Rooftop Ngắm Landmark 81',
  'Hồ Con Rùa - Trà Sữa Bệt Sài Gòn',
  'Vincom Ice Rink Landmark 81 - Sân Trượt Băng',
  'Cinestar Quốc Thanh - Rạp Chiếu Phim Giá Sinh Viên',
  'Tu Viện Khánh An - Tokyo Thu Nhỏ',
  'Lost Game - Escape Room Sài Gòn',
  'WeXcape Thoát Hiểm Thực Tế',
  'Tipsy Art - Vẽ Tranh Thư Giãn & Rượu Vang',
  'Heny Garden - Workshop Làm Nến Thơm & Nước Hoa',
  'Push Climbing - Tường Leo Núi Thảo Điền',
];
await Place.deleteMany({ name: { $in: oldDuplicateNames } });

// Dọn dẹp các tag cũ nếu còn
await Place.updateMany(
  {},
  { $pull: { tags: { $in: ['hot-tiktok', 'sinh-vien', 'trieu-view', 'hidden-gem'] } } }
);

const byCategory = await Place.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
const byGenzCategory = await Place.aggregate([
  { $match: { genz_category: { $ne: null } } },
  { $group: { _id: '$genz_category', count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]);

console.log(`✅ Thêm mới ${result.upsertedCount}, cập nhật ${result.modifiedCount} địa điểm (tổng seed: ${ALL_SEED_PLACES.length})`);
console.log('   Theo loại hình cơ bản: ' + byCategory.map((row) => `${row._id}: ${row.count}`).join(' · '));
console.log('   Theo 11 danh mục Gen Z: ' + byGenzCategory.map((row) => `${row._id}: ${row.count}`).join(' · '));
await mongoose.disconnect();
