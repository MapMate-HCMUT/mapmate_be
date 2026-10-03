// Nạp 44 địa điểm mẫu vào collection `places` để bộ lọc Khám phá có dữ liệu.
// Chạy: npm run seed:places   (chạy lại nhiều lần được — cập nhật theo tên, không tạo trùng)
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Place, { buildPlaceSearchText } from '../models/Place.model.js';
import { SEED_PLACES } from './data/places.js';

await connectDB();
await Place.syncIndexes();

const result = await Place.bulkWrite(
  SEED_PLACES.map((place) => ({
    updateOne: {
      filter: { name: place.name },
      update: { $set: { ...place, search_text: buildPlaceSearchText(place), cached_at: new Date() } },
      upsert: true,
    },
  })),
);

const byCategory = await Place.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
console.log(`✅ Thêm mới ${result.upsertedCount}, cập nhật ${result.modifiedCount} địa điểm`);
console.log('   ' + byCategory.map((row) => `${row._id}: ${row.count}`).join(' · '));
await mongoose.disconnect();
