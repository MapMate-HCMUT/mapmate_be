// Vai trò của 1 điểm dừng (bữa chính / ăn vặt / đồ uống / vui chơi) — tính từ Place.kind + tên, không lưu trong DB.
import { KIND_ROLES, VISIT_ROLES } from '../constants/tripRules.js';
import { normalizeSearchText } from './text.js';

// Món ăn vặt / tráng miệng hay gặp trong tên quán (so trên tên không dấu). "Phở", "cơm", "bún" vẫn là bữa chính.
const SNACK_NAME = /\b(banh mi|che|kem|xoi|sua chua|banh trang|banh flan|tau hu|bot chien|an vat|banh bao|banh ngot|banh crepe|donut|sinh to|nuoc mia|bap xao|ha cao|banh canh cua bot|bakery|boulangerie|patisserie|bread|cake|chocolate|gelato|ice cream|dessert|waffle|paul|tous les jours|breadtalk|marou|givral)\b/;

// Quán bia / bar / pub (dữ liệu nhóm tự nhập thường thiếu kind) — "Bia Tươi Tiệp Gammer" là đồ uống, không phải vui chơi
const DRINK_NAME = /\b(bia|beer|pub|bar|cocktail|wine|ruou vang|lounge|brewery|craft)\b/;
const BEER_FOOD_NAME = /\b(bia tuoi|beer|pub|brewery|craft)\b/;

export const getVisitRole = (place) => {
  const name = normalizeSearchText(place.name ?? '');
  const isSnackName = SNACK_NAME.test(name);
  const kindRole = KIND_ROLES[place.kind];
  if (place.category === 'food') {
    if (isSnackName || kindRole === VISIT_ROLES.SNACK) return VISIT_ROLES.SNACK;
    return kindRole === VISIT_ROLES.DRINK || BEER_FOOD_NAME.test(name) ? VISIT_ROLES.DRINK : VISIT_ROLES.MEAL;
  }
  if (place.category === 'cafe') return kindRole === VISIT_ROLES.SNACK || isSnackName ? VISIT_ROLES.SNACK : VISIT_ROLES.DRINK;
  if (kindRole === VISIT_ROLES.DRINK) return VISIT_ROLES.DRINK; // bar
  if (place.category === 'entertainment' && DRINK_NAME.test(name)) return VISIT_ROLES.DRINK;
  return VISIT_ROLES.ACTIVITY;
};

// Loại hình người dùng chọn -> vai trò điểm dừng tương ứng
export const CATEGORY_ROLES = {
  food: [VISIT_ROLES.MEAL, VISIT_ROLES.SNACK],
  cafe: [VISIT_ROLES.DRINK, VISIT_ROLES.SNACK],
  attraction: [VISIT_ROLES.ACTIVITY],
  entertainment: [VISIT_ROLES.ACTIVITY, VISIT_ROLES.DRINK],
  park: [VISIT_ROLES.ACTIVITY],
  shopping: [VISIT_ROLES.ACTIVITY],
};
