// "Phở Hòa Pasteur" -> "pho hoa pasteur": bỏ dấu tiếng Việt, viết thường, gộp khoảng trắng.
// Chịu được mọi kiểu bộ gõ: Unicode dựng sẵn / tổ hợp, ký tự ẩn (zero-width) mà một số bộ gõ chèn vào, khoảng trắng lạ.
export const normalizeSearchText = (text = '') =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // mọi dấu kết hợp (sắc, huyền, mũ, móc...)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // ký tự ẩn
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Thoát ký tự đặc biệt để đưa chuỗi người dùng nhập vào RegExp an toàn.
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
