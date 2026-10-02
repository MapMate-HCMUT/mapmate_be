// Tạo dữ liệu demo cho trang Khám phá: bạn bè, ghim, lộ trình, bài viết, lượt thích, đăng lại.
// Cần chạy trước: npm run seed:users && npm run seed:places.  Chạy: npm run seed:social
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import Place from '../models/Place.model.js';
import { Post } from '../models/post.model.js';
import { User } from '../models/user.model.js';
import { tripCriteriaSchema } from '../middlewares/validators/itinerary.validator.js';
import { acceptFriendRequest, sendFriendRequest } from '../services/friend.service.js';
import { createItinerary } from '../services/itinerary.service.js';
import { suggestItineraries } from '../services/itineraryPlanner.service.js';
import { setPin } from '../services/pin.service.js';
import { createPost, likePost, repost } from '../services/post.service.js';

if (env.isProduction) {
  console.error('Không chạy seed trên production.');
  process.exit(1);
}
await connectDB();

const users = await User.find({ email: /^demo\d@mapmate\.vn$/ }).sort({ email: 1 }).lean();
if (users.length < 5 || (await Place.estimatedDocumentCount()) === 0) {
  console.error('Thiếu dữ liệu: hãy chạy "npm run seed:users" và "npm run seed:places" trước.');
  process.exit(1);
}
if (await Post.exists({ author_id: users[0]._id })) {
  console.log('⏭️  Đã có dữ liệu mạng xã hội demo, bỏ qua.');
  process.exit(0);
}

const [huy, nguyenA, tranB, leC, maiAnh] = users.map((user) => user._id);
const placeId = async (name) => (await Place.findOne({ name }, { _id: 1 }).lean())._id;
const befriend = async (from, to) => {
  const { relationship } = await sendFriendRequest(from, to);
  if (relationship.request_id) await acceptFriendRequest(to, relationship.request_id);
};

// 1) Bạn bè: Huy ↔ NguyenA, TranB, LeC · NguyenA ↔ TranB · MaiAnh gửi lời mời cho Huy (đang chờ)
await befriend(huy, nguyenA);
await befriend(huy, tranB);
await befriend(huy, leC);
await befriend(nguyenA, tranB);
await sendFriendRequest(maiAnh, huy);

// 2) Ghim địa điểm
await setPin(huy, await placeId('Landmark 81 SkyView'), { status: 'wishlist', note: 'Đi ngắm hoàng hôn' });
await setPin(huy, await placeId('Dinh Độc Lập'), { status: 'visited', rating: 5, visited_on: new Date('2026-09-20') });
await setPin(nguyenA, await placeId('Chợ Bến Thành'), { status: 'visited', rating: 4 });

// 3) Lộ trình từ bộ lọc "tối hẹn hò"
const criteria = tripCriteriaSchema.parse({
  categories: ['food', 'cafe', 'entertainment'], tags: ['hen-ho'], trip_budget: 500000, people: 2, start_time: '18:00', duration_hours: 4, open_only: true,
});
const { options } = await suggestItineraries(criteria);
const itinerary = await createItinerary(nguyenA, {
  name: 'Tối hẹn hò Quận 1', place_ids: options[0].place_ids, vehicle: 'bike', transport_modes: [], people: 2, start_time: '18:00',
  origin: criteria.origin, criteria, tags: ['hẹnhò', 'cuốituần'], visibility: 'public',
});

// 4) Bài viết
const post = (author, input) => createPost(author, { content: '', tags: [], tagged_user_ids: [], visited: false, visibility: 'public', ...input });
const workshop = await post(huy, {
  type: 'place', place_id: await placeId('The Workshop Coffee'), rating: 5, visited: true, tags: ['càphê', 'yêntĩnh'],
  content: 'Cà phê pour over ngon nhất Quận 1, không gian yên tĩnh rất hợp ngồi làm việc cuối tuần.',
});
const routePost = await post(nguyenA, {
  type: 'itinerary', itinerary_id: itinerary.id, tags: ['hẹnhò', 'cuốituần'], tagged_user_ids: [tranB],
  content: 'Lịch trình tối thứ 7 cho 2 người, tổng chưa tới 500k/người. Ai cần thì lưu về dùng nha!',
});
const vinhKhanh = await post(tranB, {
  type: 'place', place_id: await placeId('Phố ẩm thực Vĩnh Khánh'), rating: 4, visited: true, tags: ['ănvặt', 'vềđêm', 'nhómbạn'],
  content: 'Đi nhóm 4–5 người là vui nhất. Ốc tươi, giá bình dân, nhớ đi sau 19h mới đông.',
});
await post(leC, {
  type: 'place', place_id: await placeId('Bảo tàng Mỹ thuật TP.HCM'), rating: 5, visited: true, tags: ['sốngảo', 'yêntĩnh'], visibility: 'friends',
  content: 'Vé chỉ 30k mà chụp ảnh đẹp xỉu. Nên đi buổi sáng cho đỡ nắng.',
});
await post(maiAnh, { type: 'text', tags: ['hỏiđáp', 'cuốituần'], content: 'Cuối tuần này có ai rủ đi Thảo Cầm Viên không? Mình cần gợi ý chỗ ăn trưa gần đó.' });

// 5) Tương tác
await Promise.all([likePost(nguyenA, workshop.id), likePost(tranB, workshop.id), likePost(huy, routePost.id), likePost(leC, routePost.id), likePost(huy, vinhKhanh.id)]);
await repost(tranB, workshop.id, { content: 'Xác nhận, quán này đáng thử!' });
await repost(huy, routePost.id, { content: '' });

console.log('✅ Đã tạo: 4 cặp bạn bè + 1 lời mời đang chờ, 3 ghim, 1 lộ trình, 5 bài viết, 5 lượt thích, 2 lượt đăng lại');
console.log('   Đăng nhập demo1@mapmate.vn / Mapmate123 để xem.');
await mongoose.disconnect();
