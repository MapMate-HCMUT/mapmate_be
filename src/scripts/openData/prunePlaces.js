// Đồng bộ trạng thái sau mỗi lần nhập: nơi biến mất khỏi nguồn (thường là đã đóng cửa) => xoá hoặc đánh dấu đóng cửa;
// nơi nguồn từng làm biến mất nhưng nay xuất hiện lại => mở lại.
import { OPEN_DATA_SOURCES } from '../../constants/openData.js';
import { CLOSED_BY, PLACE_STATUS } from '../../constants/places.js';
import { Itinerary, Place, PlacePin, Post } from '../../models/index.js';

// Nơi có trong lần nhập này mà trước đó bị nguồn đánh dấu đóng => hoạt động lại. Nơi CỘNG ĐỒNG báo đóng thì giữ nguyên.
export const reopenReturnedPlaces = async (keptRefs) => {
  const { modifiedCount } = await Place.updateMany(
    { source_ref: { $in: keptRefs }, status: PLACE_STATUS.CLOSED, closed_by: CLOSED_BY.SOURCE },
    { $set: { status: PLACE_STATUS.ACTIVE, closed_by: null, status_changed_at: new Date() } },
  );
  return modifiedCount;
};

/**
 * Nơi nguồn mở không còn trong lần nhập này:
 * - không ai dùng => xoá hẳn;
 * - đang được ghim / đăng bài / có trong lộ trình => giữ bản ghi (để bài viết cũ còn hiển thị) nhưng chuyển "đã đóng cửa" => ẩn khỏi tìm kiếm.
 */
export const pruneStalePlaces = async (keptRefs) => {
  const stale = await Place.find({ source: { $in: OPEN_DATA_SOURCES }, source_ref: { $nin: keptRefs } }, { _id: 1 }).lean();
  const staleIds = stale.map((place) => place._id);
  if (staleIds.length === 0) return { stale: 0, deleted: 0, closed_in_use: 0 };

  const inUse = new Set(
    (
      await Promise.all([
        PlacePin.distinct('place_id', { place_id: { $in: staleIds } }),
        Post.distinct('place_id', { place_id: { $in: staleIds } }),
        Itinerary.distinct('stops.place_id', { 'stops.place_id': { $in: staleIds } }),
      ])
    ).flat().map(String),
  );
  const deletable = staleIds.filter((id) => !inUse.has(String(id)));
  const keptIds = staleIds.filter((id) => inUse.has(String(id)));

  const { deletedCount } = await Place.deleteMany({ _id: { $in: deletable } });
  const { modifiedCount } = await Place.updateMany(
    { _id: { $in: keptIds }, status: { $ne: PLACE_STATUS.CLOSED } },
    { $set: { status: PLACE_STATUS.CLOSED, closed_by: CLOSED_BY.SOURCE, status_changed_at: new Date() } },
  );
  return { stale: staleIds.length, deleted: deletedCount, closed_in_use: modifiedCount };
};
