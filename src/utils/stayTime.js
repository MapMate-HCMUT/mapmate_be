// Thời gian ở lại 1 điểm là 1 KHOẢNG { min, typical, max } (constants/tripRules.js — STAY_RANGE):
//   typical = avg_visit_minutes của địa điểm (+ thêm khi đi nhóm đông), min/max theo vai trò & loại hình.
// VD bún bò 40′ (30–60′), buffet 90′ (70–120′), mall 90′ (70–245′), rạp phim 150′ (cố định theo phim).
import { DEFAULT_VISIT_MINUTES } from '../constants/places.js';
import { GROUP_STAY, STAY_RANGE } from '../constants/tripRules.js';
import { normalizeSearchText } from './text.js';
import { isMall } from './venue.js';

// Rạp phim / sân khấu: thời lượng cố định theo suất chiếu — nhận theo tên khi dữ liệu chưa có kind
const FIXED_SHOW_NAME = /\b(cgv|lotte cinema|galaxy|bhd|cinestar|beta cinemas?|mega gs|rap phim|rap chieu|cinema|nha hat|san khau)\b/;
const stayKindOf = (place) => {
  if (isMall(place)) return 'mall';
  if (!place.kind && FIXED_SHOW_NAME.test(normalizeSearchText(place.name ?? ''))) return 'cinema';
  return place.kind;
};

const roundStay = (minutes) => Math.round(minutes / STAY_RANGE.ROUND_TO) * STAY_RANGE.ROUND_TO;
const clampStay = (minutes) => Math.min(STAY_RANGE.MAX_MINUTES, Math.max(STAY_RANGE.MIN_MINUTES, minutes));

// Nhóm đông ngồi lâu hơn: 4 người +10′, 6 người +20′... (tối đa theo vai trò)
export const groupExtraMinutes = (role, people = 1) => {
  const steps = Math.floor(Math.max(0, people - GROUP_STAY.BASE_PEOPLE) / GROUP_STAY.PEOPLE_PER_STEP);
  return Math.min(GROUP_STAY.MAX_EXTRA[role] ?? 0, steps * GROUP_STAY.MINUTES_PER_STEP);
};

export const getStayRange = (place, role, people = 1) => {
  const typical = clampStay(roundStay((place.avg_visit_minutes ?? DEFAULT_VISIT_MINUTES) + groupExtraMinutes(role, people)));
  const maxFactor = STAY_RANGE.KIND_MAX_FACTOR[stayKindOf(place)] ?? STAY_RANGE.MAX_FACTOR[role] ?? 1;
  return {
    min: clampStay(Math.min(typical, roundStay(typical * STAY_RANGE.MIN_FACTOR))),
    typical,
    max: clampStay(Math.max(typical, roundStay(typical * maxFactor))),
  };
};

// Thời gian người dùng tự chỉnh (±15′ trên giao diện) — tôn trọng, chỉ kẹp trong giới hạn hệ thống
export const clampStayOverride = (minutes) => clampStay(roundStay(minutes));
