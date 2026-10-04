// Cộng đồng báo quán "đã đóng cửa" / "vẫn mở" => cập nhật Place.status, không cần chờ lần làm mới dữ liệu hằng tháng.
import { CLOSED_BY, PLACE_REPORT_THRESHOLDS, PLACE_REPORT_TYPES, PLACE_STATUS } from '../constants/places.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { XP_ACTIONS } from '../constants/gamification.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import Place from '../models/Place.model.js';
import { PlaceReport } from '../models/placeReport.model.js';
import { AppError } from '../utils/AppError.js';
import { rewardAction } from './gamification.service.js';

/**
 * Trạng thái theo phiếu: điểm = số người báo "đóng" − số người báo "vẫn mở".
 * ≥ 3 => đóng cửa (ẩn) · ≥ 1 => có thể đã đóng (cảnh báo) · còn lại => hoạt động.
 * Nơi bị NGUỒN DỮ LIỆU đánh dấu đóng (biến mất khỏi Overture/OSM) thì phiếu "vẫn mở" không mở lại được — chỉ lần nhập sau.
 */
const statusFromVotes = ({ closed, open }) => {
  const score = closed - open;
  if (score >= PLACE_REPORT_THRESHOLDS.closed) return PLACE_STATUS.CLOSED;
  if (score >= PLACE_REPORT_THRESHOLDS.maybeClosed) return PLACE_STATUS.MAYBE_CLOSED;
  return PLACE_STATUS.ACTIVE;
};

const countVotes = async (placeId) => {
  const rows = await PlaceReport.aggregate([{ $match: { place_id: placeId } }, { $group: { _id: '$type', count: { $sum: 1 } } }]);
  const byType = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  return { closed: byType[PLACE_REPORT_TYPES.CLOSED] ?? 0, open: byType[PLACE_REPORT_TYPES.OPEN] ?? 0 };
};

// Quán vừa được xác nhận đóng cửa => thưởng mọi người đã báo đúng (1 lần / người / địa điểm nhờ ref_key).
const rewardClosureReporters = async (placeId) => {
  const reporters = await PlaceReport.find({ place_id: placeId, type: PLACE_REPORT_TYPES.CLOSED }, { user_id: 1 }).lean();
  await Promise.allSettled(
    reporters.map((report) => rewardAction(report.user_id, XP_ACTIONS.PLACE_CLOSURE_CONFIRMED, { refKey: `place-closed:${placeId}` })),
  );
};

// POST /api/places/:id/reports
export const reportPlaceStatus = async (userId, placeId, type) => {
  const place = await Place.findById(placeId, { status: 1, closed_by: 1 }).lean();
  if (!place) throw new AppError('Không tìm thấy địa điểm', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);

  await PlaceReport.findOneAndUpdate({ place_id: placeId, user_id: userId }, { $set: { type } }, { upsert: true });
  const votes = await countVotes(place._id);

  const closedBySource = place.status === PLACE_STATUS.CLOSED && place.closed_by === CLOSED_BY.SOURCE;
  const status = closedBySource ? PLACE_STATUS.CLOSED : statusFromVotes(votes);
  const changed = status !== place.status;
  await Place.updateOne(
    { _id: place._id },
    {
      $set: {
        report_counts: votes,
        ...(changed && {
          status,
          status_changed_at: new Date(),
          closed_by: status === PLACE_STATUS.CLOSED ? (place.closed_by ?? CLOSED_BY.COMMUNITY) : null,
        }),
      },
    },
  );
  if (changed && status === PLACE_STATUS.CLOSED) await rewardClosureReporters(place._id);

  return { status, report_counts: votes, my_report: type };
};

// Phiếu của người đang xem cho 1 danh sách địa điểm (để nút "Báo đóng cửa" hiện đúng trạng thái).
export const getMyReportMap = async (userId, placeIds) => {
  if (!userId || placeIds.length === 0) return new Map();
  const reports = await PlaceReport.find({ user_id: userId, place_id: { $in: placeIds } }, { place_id: 1, type: 1 }).lean();
  return new Map(reports.map((report) => [String(report.place_id), report.type]));
};
