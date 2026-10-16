// Số liệu công khai cho trang giới thiệu (landing page): chỉ là các con số tổng đếm từ MongoDB — không có dữ liệu cá nhân.
// Cache 10 phút: trang giới thiệu nhiều người xem, không đếm lại cả database mỗi lượt.
import { PLACE_STATUS } from '../constants/places.js';
import AiSession from '../models/AiSession.model.js';
import { Business } from '../models/business.model.js';
import Itinerary from '../models/Itinerary.model.js';
import Place from '../models/Place.model.js';
import { Post } from '../models/post.model.js';
import { PostComment } from '../models/postComment.model.js';
import TransitRoute from '../models/TransitRoute.model.js';
import TransitStop from '../models/TransitStop.model.js';
import { User } from '../models/user.model.js';
import { createMemoryCache } from '../utils/memoryCache.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const cache = createMemoryCache(CACHE_TTL_MS);

const countAll = async () => {
  const activeSince = new Date(Date.now() - ACTIVE_WINDOW_DAYS * DAY_MS);
  const [users, activeUsers, places, itineraries, posts, comments, aiConversations, transitRoutes, transitStops, businesses] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ last_active_at: { $gte: activeSince } }),
    Place.countDocuments({ status: { $ne: PLACE_STATUS.CLOSED } }),
    Itinerary.estimatedDocumentCount(),
    Post.countDocuments({ is_repost: { $ne: true } }),
    PostComment.estimatedDocumentCount(),
    AiSession.estimatedDocumentCount(),
    TransitRoute.countDocuments({ active: true }),
    TransitStop.countDocuments({ active: true }),
    Business.estimatedDocumentCount(),
  ]);
  return {
    users,
    active_users_30d: activeUsers,
    places,
    itineraries,
    posts,
    comments,
    ai_conversations: aiConversations,
    transit_routes: transitRoutes,
    transit_stops: transitStops,
    businesses,
    updated_at: new Date(),
  };
};

/** GET /api/stats/public */
export const getPublicStats = () => cache.wrap('public', countAll);
