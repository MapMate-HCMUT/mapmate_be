import { getLevelInfo } from './level.js';

// Các trường tối thiểu để hiển thị 1 người trên bảng tin / danh sách bạn bè (không email, không ngày sinh).
export const USER_CARD_FIELDS = { username: 1, avatar_url: 1, xp: 1, 'home_area.city': 1 };
export const USER_CARD_SELECT = 'username avatar_url xp home_area.city';

export const toUserCard = (user) => {
  if (!user) return null;
  const { level, title } = getLevelInfo(user.xp ?? 0);
  return {
    id: user._id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    level,
    level_title: title,
    city: user.home_area?.city ?? null,
  };
};
