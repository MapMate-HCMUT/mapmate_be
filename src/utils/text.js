// "Phở Hòa Pasteur" -> "pho hoa pasteur": bỏ dấu tiếng Việt, viết thường, gộp khoảng trắng.
export const normalizeSearchText = (text = '') =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Thoát ký tự đặc biệt để đưa chuỗi người dùng nhập vào RegExp an toàn.
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
