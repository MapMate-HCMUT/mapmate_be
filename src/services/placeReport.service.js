// Cộng đồng báo quán "đã đóng cửa" / "vẫn mở". Báo cáo chỉ là phiếu của người dùng: đủ phiếu thì hiện cảnh báo
// "có người báo đã đóng cửa", KHÔNG tự ẩn quán. Admin duyệt thủ công (npm run places:review-reports) rồi mới đóng.
import { CLOSED_BY, PLACE_REPORT_THRESHOLDS, PLACE_REPORT_TYPES, PLACE_STATUS } from '../constants/places.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { XP_ACTIONS } from '../constants/gamification.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import Place from '../models/Place.model.js';
import { PlaceReport } from '../models/placeReport.model.js';
import { AppError } from '../utils/AppError.js';
import { rewardAction } from './gamification.service.js';

// Điểm = số người báo "đóng" − số người báo "vẫn mở". ≥ 1 => có thể đã đóng (cảnh báo) · còn lại => hoạt động.
const statusFromVotes = ({ closed, open }) => (closed - open >= PLACE_REPORT_THRESHOLDS.maybeClosed ? PLACE_STATUS.MAYBE_CLOSED : PLACE_STATUS.ACTIVE);

export const countVotes = async (placeId) => {
  const rows = await PlaceReport.aggregate([{ $match: { place_id: placeId } }, { $group: { _id: '$type', count: { $sum: 1 } } }]);
  const byType = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  return { closed: byType[PLACE_REPORT_TYPES.CLOSED] ?? 0, open: byType[PLACE_REPORT_TYPES.OPEN] ?? 0 };
};

/** Admin vừa duyệt đóng cửa => thưởng mọi người đã báo đúng (1 lần / người / địa điểm nhờ ref_key). */
export const rewardClosureReporters = async (placeId) => {
  const reporters = await PlaceReport.find({ place_id: placeId, type: PLACE_REPORT_TYPES.CLOSED }, { user_id: 1 }).lean();
  await Promise.allSettled(
    reporters.map((report) => rewardAction(report.user_id, XP_ACTIONS.PLACE_CLOSURE_CONFIRMED, { refKey: `place-closed:${placeId}` })),
  );
  return reporters.length;
};

const findPlace = async (placeId) => {
  const place = await Place.findById(placeId, { status: 1 }).lean();
  if (!place) throw new AppError('Không tìm thấy địa điểm', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  return place;
};

// Đếm lại phiếu => cập nhật cảnh báo. Quán đã ĐÓNG (admin / chủ quán / nguồn dữ liệu) giữ nguyên — phiếu không đóng / mở lại được.
const refreshStatus = async (place) => {
  const votes = await countVotes(place._id);
  const status = place.status === PLACE_STATUS.CLOSED ? PLACE_STATUS.CLOSED : statusFromVotes(votes);
  const changed = status !== place.status;
  await Place.updateOne({ _id: place._id }, { $set: { report_counts: votes, ...(changed && { status, status_changed_at: new Date() }) } });
  return { status, report_counts: votes };
};

// POST /api/places/:id/reports — báo lỗi / sửa báo cáo của mình (mỗi người 1 báo cáo / địa điểm).
// Chỉ "đã đóng" / "vẫn mở" được tính phiếu (cảnh báo); lỗi khác (sai giờ, giá, vị trí...) chỉ chờ admin sửa.
export const reportPlaceStatus = async (userId, placeId, type, note = '') => {
  const place = await findPlace(placeId);
  await PlaceReport.findOneAndUpdate({ place_id: placeId, user_id: userId }, { $set: { type, note } }, { upsert: true });
  return { ...(await refreshStatus(place)), my_report: type, my_report_note: note };
};

// DELETE /api/places/:id/reports — gỡ phiếu của mình (báo nhầm)
export const undoPlaceReport = async (userId, placeId) => {
  const place = await findPlace(placeId);
  await PlaceReport.deleteOne({ place_id: placeId, user_id: userId });
  return { ...(await refreshStatus(place)), my_report: null, my_report_note: null };
};

// Phiếu của người đang xem cho 1 danh sách địa điểm (để nút "Báo đóng cửa" hiện đúng trạng thái).
export const getMyReportMap = async (userId, placeIds) => {
  if (!userId || placeIds.length === 0) return new Map();
  const reports = await PlaceReport.find({ user_id: userId, place_id: { $in: placeIds } }, { place_id: 1, type: 1, note: 1 }).lean();
  return new Map(reports.map((report) => [String(report.place_id), { type: report.type, note: report.note ?? '' }]));
};

// ── Admin duyệt báo cáo (script src/scripts/reviewPlaceReports.js) ──

/** Các nơi đang bị báo đóng cửa, chưa đóng — nhiều phiếu nhất trước */
export const listReportedPlaces = (limit = 50) =>
  Place.find({ status: { $ne: PLACE_STATUS.CLOSED }, 'report_counts.closed': { $gt: 0 } }, { name: 1, address: 1, district: 1, report_counts: 1, status: 1, status_changed_at: 1 })
    .sort({ 'report_counts.closed': -1, status_changed_at: -1 })
    .limit(limit)
    .lean();

const ISSUE_TYPES = Object.values(PLACE_REPORT_TYPES).filter((type) => type !== PLACE_REPORT_TYPES.CLOSED && type !== PLACE_REPORT_TYPES.OPEN);

/** Báo cáo lỗi thông tin (sai giờ / giá / vị trí / khác) + mọi báo cáo có mô tả — mới nhất trước */
export const listIssueReports = (limit = 50) =>
  PlaceReport.find({ $or: [{ type: { $in: ISSUE_TYPES } }, { note: { $gt: '' } }] })
    .sort({ updated_at: -1 })
    .limit(limit)
    .populate('place_id', 'name address')
    .lean();

/** Đã sửa xong thông tin theo 1 báo cáo => xoá báo cáo đó */
export const resolveIssueReport = async (reportId) => {
  const report = await PlaceReport.findByIdAndDelete(reportId).lean();
  if (!report) throw new AppError('Không tìm thấy báo cáo', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  await refreshStatus(await findPlace(report.place_id));
  return report;
};

/** Xác nhận đóng cửa => ẩn khỏi tìm kiếm / gợi ý, thưởng người báo đúng */
export const confirmClosure = async (placeId) => {
  await findPlace(placeId);
  await Place.updateOne({ _id: placeId }, { $set: { status: PLACE_STATUS.CLOSED, closed_by: CLOSED_BY.ADMIN, status_changed_at: new Date() } });
  return { rewarded: await rewardClosureReporters(placeId) };
};

/** Báo sai => xoá mọi phiếu của nơi này, bỏ cảnh báo */
export const dismissReports = async (placeId) => {
  const place = await findPlace(placeId);
  const { deletedCount } = await PlaceReport.deleteMany({ place_id: placeId });
  return { deleted: deletedCount, ...(await refreshStatus(place)) };
};

/** Mở lại 1 nơi đã đóng (admin đóng nhầm / quán mở lại) */
export const reopenPlace = async (placeId) => {
  await findPlace(placeId);
  await Place.updateOne({ _id: placeId }, { $set: { status: PLACE_STATUS.ACTIVE, closed_by: null, status_changed_at: new Date() } });
  return refreshStatus(await findPlace(placeId));
};
