// Admin duyệt báo cáo "đã đóng cửa" của người dùng — báo cáo KHÔNG tự ẩn quán, phải có người kiểm tra rồi mới đóng.
// Chạy:  npm run places:review-reports                       xem các nơi đang bị báo (nhiều phiếu nhất trước)
//        npm run places:review-reports -- --close <placeId>   xác nhận đã đóng => ẩn khỏi tìm kiếm / gợi ý, thưởng người báo đúng
//        npm run places:review-reports -- --dismiss <placeId> báo sai => xoá mọi phiếu, bỏ cảnh báo
//        npm run places:review-reports -- --reopen <placeId>  mở lại 1 nơi đã đóng (đóng nhầm / quán mở lại)
//        npm run places:review-reports -- --issues            báo cáo lỗi thông tin (sai giờ / giá / vị trí / khác) kèm mô tả người dùng gõ
//        npm run places:review-reports -- --resolve <reportId> đã sửa xong thông tin theo báo cáo đó => xoá báo cáo
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { confirmClosure, dismissReports, listIssueReports, listReportedPlaces, reopenPlace, resolveIssueReport } from '../services/placeReport.service.js';

const ACTIONS = {
  '--close': async (id) => console.log(`✅ Đã đóng ${id} — thưởng ${(await confirmClosure(id)).rewarded} người báo đúng`),
  '--dismiss': async (id) => console.log(`🗑️  Đã xoá ${(await dismissReports(id)).deleted} phiếu của ${id} — bỏ cảnh báo`),
  '--reopen': async (id) => console.log(`🔓 Đã mở lại ${id} (trạng thái: ${(await reopenPlace(id)).status})`),
  '--resolve': async (id) => console.log(`✅ Đã xử lý báo cáo ${id} (${(await resolveIssueReport(id)).type})`),
};
const ISSUE_LABELS = { closed: 'Đã đóng cửa', open: 'Vẫn mở', wrong_hours: 'Sai giờ mở cửa', wrong_price: 'Sai giá', wrong_location: 'Sai địa chỉ / vị trí', other: 'Khác' };

const showIssues = async () => {
  const reports = await listIssueReports();
  if (!reports.length) console.log('Không có báo cáo lỗi nào.');
  reports.forEach((report) => {
    console.log(`${String(report._id)}  [${ISSUE_LABELS[report.type] ?? report.type}] ${report.place_id?.name ?? '(địa điểm đã xoá)'} — ${report.place_id?.address ?? ''}`);
    if (report.note) console.log(`    “${report.note}”`);
  });
};

const [flag, placeId] = process.argv.slice(2);
if (flag && flag !== '--issues' && (!ACTIONS[flag] || !mongoose.isValidObjectId(placeId))) {
  console.error('Cách dùng: npm run places:review-reports -- [--close | --dismiss | --reopen] <placeId> | --issues | --resolve <reportId>');
  process.exit(1);
}

await connectDB();
try {
  if (flag === '--issues') await showIssues();
  else if (flag) await ACTIONS[flag](placeId);
  else {
    const places = await listReportedPlaces();
    if (!places.length) console.log('Không có nơi nào đang bị báo đóng cửa.');
    places.forEach((place) => {
      const { closed = 0, open = 0 } = place.report_counts ?? {};
      console.log(`${String(place._id)}  🚫 ${closed} báo đóng · ✅ ${open} báo vẫn mở  ${place.name} — ${place.address ?? place.district ?? ''}`);
    });
  }
} catch (error) {
  console.error('❌', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
