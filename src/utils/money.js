// 500000 -> "500.000đ" (định dạng tiền Việt cho câu chữ gửi người dùng / AI)
export const formatVnd = (amount) => `${Math.round(amount).toLocaleString('vi-VN')}đ`;
