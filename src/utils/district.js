// Chuẩn hoá tên quận/huyện TP.HCM về 1 kiểu: "Quận 1", "Tân Bình", "Thủ Đức", "Hóc Môn".
// Dùng chung cho nhập dữ liệu mở (scripts/openData) và AI Planner (hiểu "q1", "binh thanh", "District 7").
// Lưu ý: từ 01/07/2025 cấp quận đã bị bỏ trong địa giới hành chính, nhưng người dùng + dữ liệu bản đồ vẫn dùng tên quận.
import { normalizeSearchText } from './text.js';

const NUMBERED_DISTRICTS = [1, 3, 4, 5, 6, 7, 8, 10, 11, 12]; // Q2 + Q9 + Thủ Đức cũ đã gộp thành TP Thủ Đức (2021)
const NAMED_DISTRICTS = [
  'Thủ Đức', 'Bình Thạnh', 'Tân Bình', 'Tân Phú', 'Gò Vấp', 'Phú Nhuận', 'Bình Tân',
  'Hóc Môn', 'Bình Chánh', 'Nhà Bè', 'Củ Chi', 'Cần Giờ',
  'Dĩ An', 'Thuận An', 'Thủ Dầu Một', 'Biên Hòa', 'Nhơn Trạch', // giáp ranh, nằm trong khung toạ độ
];
// Danh sách tên chuẩn (để AI Planner dò tên quận trong câu người dùng gõ)
export const DISTRICT_NAMES = [...NUMBERED_DISTRICTS.map((number) => `Quận ${number}`), ...NAMED_DISTRICTS];
// Khoá không dấu -> tên chuẩn. "binh thanh" / "Bình thạnh" / "Binh Thanh district" đều ra "Bình Thạnh".
const CANONICAL = new Map([
  ...NUMBERED_DISTRICTS.map((number) => [`quan ${number}`, `Quận ${number}`]),
  ...NAMED_DISTRICTS.map((name) => [normalizeSearchText(name), name]),
  ['quan 2', 'Thủ Đức'], ['quan 9', 'Thủ Đức'], ['binh chanh', 'Bình Chánh'],
]);
const PREFIX = /^(thanh pho|tp\.?|quan|huyen|thi xa|district|d|q\.?)\s*/;
const SUFFIX = /\s+(district|city|town)$/;

// Không nhận ra (phường, mã bưu chính, tên tỉnh khác do dữ liệu nguồn sai...) => null để đoán theo vị trí.
export const normalizeDistrict = (raw) => {
  if (!raw) return null;
  const plain = normalizeSearchText(raw).replace(/[^a-z0-9 .]/g, ' ').replace(/\s+/g, ' ').trim().replace(SUFFIX, '');
  if (CANONICAL.has(plain)) return CANONICAL.get(plain);
  const stripped = plain.replace(PREFIX, '').trim();
  if (/^\d{1,2}$/.test(stripped)) return CANONICAL.get(`quan ${Number(stripped)}`) ?? null;
  return CANONICAL.get(stripped) ?? null;
};
