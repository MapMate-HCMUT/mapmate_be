// Phiên đăng nhập thu hồi được: token mang "phiên bản phiên" (ver) của tài khoản lúc cấp. Đổi mật khẩu / đăng xuất mọi thiết bị
// => tăng phiên bản => mọi token cũ (kể cả bị lộ) hết hiệu lực ngay, không phải chờ 7 ngày. Tài khoản bị xoá => token cũng hết hiệu lực.
// Kết quả tra cứu cache 30 giây (không đọc DB ở mọi request); thu hồi trên server này xoá cache ngay.
import { USER_ROLES } from '../constants/business.js';
import { User } from '../models/user.model.js';
import { signAccessToken } from '../utils/jwt.js';

const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX = 5000;
const cache = new Map(); // userId -> { version (null = không còn tài khoản), role, at }

const currentSession = async (userId) => {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const user = await User.findById(userId, { token_version: 1, role: 1 }).lean();
  const entry = { version: user ? user.token_version ?? 0 : null, role: user ? user.role ?? USER_ROLES.USER : null, at: Date.now() };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(userId, entry);
  return entry;
};

/**
 * Token còn hiệu lực => trả vai trò tài khoản (user / business / guest), không => null
 * (sai phiên bản phiên hoặc tài khoản không còn). Vai trò cache cùng phiên bản — chậm tối đa 30 giây khi đổi vai trò.
 */
export const getSessionRole = async (userId, tokenVersion = 0) => {
  const { version, role } = await currentSession(String(userId));
  return version != null && version === (tokenVersion ?? 0) ? role : null;
};

/** Thu hồi mọi phiên của tài khoản; trả token mới cho thiết bị đang thao tác (để không bị đăng xuất chính nó) */
export const revokeSessions = async (userId) => {
  const user = await User.findByIdAndUpdate(userId, { $inc: { token_version: 1 } }, { returnDocument: 'after', projection: { token_version: 1 } }).lean();
  cache.delete(String(userId));
  return user ? signAccessToken(userId, user.token_version) : null;
};
