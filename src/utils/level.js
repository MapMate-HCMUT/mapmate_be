import { LEVELS } from '../constants/gamification.js';

// Tính level + tiến độ lên level kế tiếp từ tổng XP.
export const getLevelInfo = (xp) => {
  const current = [...LEVELS].reverse().find((level) => xp >= level.minXp) ?? LEVELS[0];
  const next = LEVELS.find((level) => level.level === current.level + 1) ?? null;

  if (!next) {
    return { level: current.level, title: current.title, currentLevelXp: current.minXp, nextLevelXp: null, progress: 1 };
  }
  const progress = (xp - current.minXp) / (next.minXp - current.minXp);
  return {
    level: current.level,
    title: current.title,
    currentLevelXp: current.minXp,
    nextLevelXp: next.minXp,
    progress: Math.round(progress * 100) / 100,
  };
};
