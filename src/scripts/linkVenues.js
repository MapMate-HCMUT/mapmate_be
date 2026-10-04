// Gắn quán ăn / cà phê / rạp phim... vào trung tâm thương mại chứa nó (xem scripts/openData/venueLinker.js).
// Chạy:  npm run places:link-venues -- [--dry-run]      (places:import cũng tự chạy bước này sau khi nhập)
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { linkVenues } from './openData/venueLinker.js';

const dryRun = process.argv.includes('--dry-run');
await connectDB();
const result = await linkVenues({ dryRun });
console.log(`${dryRun ? '🔍 [DRY RUN — không ghi DB]' : '✅'} ${result.malls} mall (gộp ${result.duplicates} bản trùng) · gắn ${result.linked} điểm vào mall · gỡ ${result.unlinked} liên kết cũ`);
result.by_mall.sort((a, b) => b.count - a.count).forEach((mall) => console.log(`   ${String(mall.count).padStart(4)}  ${mall.name}${mall.address ? ` — ${mall.address}` : ''}`));
await mongoose.disconnect();
