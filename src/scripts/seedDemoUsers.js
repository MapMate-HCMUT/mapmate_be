// Tạo người dùng demo + hoạt động để có dữ liệu cho bảng xếp hạng / hồ sơ.
// Chạy: npm run seed:users   (an toàn khi chạy lại: user đã tồn tại sẽ được bỏ qua)
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { XP_ACTIONS } from '../constants/gamification.js';
import { User } from '../models/user.model.js';
import { rewardAction } from '../services/gamification.service.js';

const DEMO_PASSWORD = 'Mapmate123';

// [username, số check-in, số báo ngập, số báo đường, số chuyến đi]
const DEMO_USERS = [
  ['Huy_Explorer', 12, 6, 4, 3],
  ['NguyenA', 20, 8, 12, 10],
  ['TranB', 15, 5, 6, 6],
  ['LeC', 9, 7, 3, 2],
  ['MaiAnh', 6, 2, 8, 1],
  ['LanPhuong', 4, 1, 2, 1],
  ['AnKhang', 2, 0, 1, 0],
];

const repeat = (count, fn) => Array.from({ length: count }, (_, index) => fn(index));

const seedUser = async ([username, checkins, floods, roads, trips], index) => {
  const email = `demo${index + 1}@mapmate.vn`;
  if (await User.exists({ email })) return console.log(`⏭️  ${email} đã tồn tại`);

  const user = await User.create({ email, username, password: DEMO_PASSWORD });
  const actions = [
    ...repeat(checkins, (i) => [XP_ACTIONS.CHECK_IN, `seed:checkin:${i}`]),
    ...repeat(floods, (i) => [XP_ACTIONS.FLOOD_REPORT, `seed:flood:${i}`]),
    ...repeat(roads, (i) => [XP_ACTIONS.ROAD_REPORT, `seed:road:${i}`]),
    ...repeat(trips, (i) => [XP_ACTIONS.TRIP_COMPLETED, `seed:trip:${i}`]),
  ];
  for (const [action, refKey] of actions) await rewardAction(user._id, action, { refKey });

  const saved = await User.findById(user._id).lean();
  console.log(`✅ ${email} (${username}) — ${saved.xp} XP, Lv.${saved.level}`);
};

if (env.isProduction) {
  console.error('Không chạy seed trên production.');
  process.exit(1);
}

await connectDB();
await User.syncIndexes();
for (const [index, row] of DEMO_USERS.entries()) await seedUser(row, index);
console.log(`\nMật khẩu chung cho tài khoản demo: ${DEMO_PASSWORD}`);
await mongoose.disconnect();
