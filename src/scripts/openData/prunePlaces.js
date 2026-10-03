// Xoá địa điểm nguồn mở không còn trong lần nhập mới nhất (đã bị gộp trùng / bị nguồn gỡ / lọc chặt hơn).
// An toàn: KHÔNG xoá nơi đang được người dùng ghim, đăng bài hoặc nằm trong lộ trình đã lưu.
import { OPEN_DATA_SOURCES } from '../../constants/openData.js';
import { Itinerary, Place, PlacePin, Post } from '../../models/index.js';

export const pruneStalePlaces = async (keptRefs) => {
  const stale = await Place.find({ source: { $in: OPEN_DATA_SOURCES }, source_ref: { $nin: keptRefs } }, { _id: 1 }).lean();
  const staleIds = stale.map((place) => place._id);
  if (staleIds.length === 0) return { stale: 0, deleted: 0, kept_in_use: 0 };

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
  const { deletedCount } = await Place.deleteMany({ _id: { $in: deletable } });
  return { stale: staleIds.length, deleted: deletedCount, kept_in_use: staleIds.length - deletable.length };
};
