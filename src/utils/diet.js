import { normalizeSearchText } from './text.js';

// Quán chay: nhận theo tên / ẩm thực ("Chay", "Vegan", "Thuần chay")
const VEGETARIAN_NAME = /\b(chay|vegan|vegetarian|thuan chay)\b/;
export const isVegetarianPlace = (place) => VEGETARIAN_NAME.test(normalizeSearchText(`${place.name} ${(place.cuisines ?? []).join(' ')}`));
