/**
 * 🗄️ SCRIPT KHỞI TẠO TẤT CẢ COLLECTIONS & INDEXES TRÊN MONGODB
 *
 * Chạy: node src/scripts/initCollections.js
 *
 * Script này sẽ:
 * 1. Kết nối MongoDB Atlas qua MONGODB_URI trong .env
 * 2. Import tất cả 7 Mongoose Models
 * 3. Gọi createCollection() + syncIndexes() cho từng model
 * 4. In ra danh sách collections đã tạo thành công
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// Import tất cả models
import User from '../models/User.model.js';
import Place from '../models/Place.model.js';
import Itinerary from '../models/Itinerary.model.js';
import AiSession from '../models/AiSession.model.js';
import CommunityReport from '../models/CommunityReport.model.js';
import FloodAlert from '../models/FloodAlert.model.js';
import UserAchievement from '../models/UserAchievement.model.js';

const models = [
  { name: 'users', model: User },
  { name: 'places', model: Place },
  { name: 'itineraries', model: Itinerary },
  { name: 'aisessions', model: AiSession },
  { name: 'communityreports', model: CommunityReport },
  { name: 'floodalerts', model: FloodAlert },
  { name: 'userachievements', model: UserAchievement },
];

async function initCollections() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ Thiếu MONGODB_URI trong file .env');
    process.exit(1);
  }

  try {
    // 1. Kết nối MongoDB
    console.log('🔗 Đang kết nối MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log('✅ Kết nối thành công!\n');

    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log(`📦 Database: ${dbName}\n`);

    // 2. Tạo từng collection + đồng bộ indexes
    console.log('🏗️  Đang khởi tạo collections & indexes...\n');

    for (const { name, model } of models) {
      try {
        // createCollection: tạo collection nếu chưa tồn tại
        await db.createCollection(model.collection.collectionName);
        console.log(`  ✅ Collection "${model.collection.collectionName}" — đã tạo`);
      } catch (err) {
        if (err.code === 48) {
          // Collection đã tồn tại → bỏ qua
          console.log(`  ⏭️  Collection "${model.collection.collectionName}" — đã tồn tại`);
        } else {
          throw err;
        }
      }

      // syncIndexes: tạo/cập nhật tất cả indexes đã khai báo trong schema
      const indexes = await model.syncIndexes();
      if (indexes.length > 0) {
        console.log(`     📐 Indexes mới: ${indexes.join(', ')}`);
      } else {
        console.log(`     📐 Indexes đã đồng bộ`);
      }
    }

    // 3. Liệt kê tất cả collections trong DB
    console.log('\n📋 Danh sách collections hiện tại:');
    const collections = await db.listCollections().toArray();
    collections.forEach((col, i) => {
      console.log(`  ${i + 1}. ${col.name}`);
    });

    console.log(`\n🎉 Hoàn tất! Đã khởi tạo ${models.length} collections với đầy đủ indexes.`);
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB.');
  }
}

initCollections();
