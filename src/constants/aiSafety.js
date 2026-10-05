// Chính sách nội dung của AI Planner — dùng chung cho 3 lớp kiểm duyệt (services/ai/safety):
//   1. Luật trong code (tức thì)   2. Prompt Guard (chống jailbreak / "bypass")   3. gpt-oss-safeguard (theo chính sách này)
// Bị chặn => từ chối lịch sự, nói rõ vì sao, gợi ý câu hỏi khác MapMate giúp được (cá nhân hoá theo ghi nhớ nếu có).

export const SAFETY_CATEGORIES = {
  NONE: 'none',
  PRIVACY: 'privacy', // tìm nhà riêng / SĐT / vị trí / lịch trình của 1 người cụ thể, theo dõi người khác
  SEXUAL: 'sexual', // dịch vụ tình dục, nội dung người lớn
  ILLEGAL: 'illegal', // ma tuý, vũ khí, cờ bạc, lừa đảo, hack, trốn pháp luật
  VIOLENCE: 'violence', // đánh nhau, trả thù, gây hại người khác
  HATE: 'hate', // xúc phạm, thù ghét, quấy rối
  SELF_HARM: 'self_harm', // tự hại — trả lời bằng sự quan tâm + đường dây hỗ trợ
  JAILBREAK: 'jailbreak', // cố "bẻ khoá" AI: đổi vai, đòi bỏ qua hướng dẫn, lộ prompt
  OTHER: 'other', // model hiểu yêu cầu đánh giá "không được phép" nhưng không rõ nhóm
};
export const SAFETY_CATEGORY_VALUES = Object.values(SAFETY_CATEGORIES).filter((category) => category !== 'other');

export const SAFETY_MODELS = {
  PROMPT_GUARD: 'meta-llama/llama-prompt-guard-2-86m', // điểm 0–1: khả năng là jailbreak / prompt injection
  SAFEGUARD: 'openai/gpt-oss-safeguard-20b', // phân loại theo chính sách tự viết (POLICY_TEXT)
};
export const PROMPT_GUARD_THRESHOLD = 0.9;
export const SAFETY_TIMEOUT_MS = 6000;
export const SAFEGUARD_MAX_TOKENS = 200; // gói miễn phí chỉ 2.000 token/phút cho safeguard => giữ ngắn

// Chính sách gửi cho gpt-oss-safeguard (ngắn gọn để tiết kiệm token)
export const POLICY_TEXT = `Kiểm duyệt tin nhắn gửi MapMate — trợ lý gợi ý đi chơi, ăn uống ở TP.HCM.
VI PHẠM khi tin nhắn muốn:
- privacy: tìm nhà riêng, số điện thoại, mạng xã hội, vị trí, lịch trình của MỘT NGƯỜI cụ thể (kể cả người nổi tiếng, người yêu cũ); theo dõi, rình, định vị người khác.
- sexual: mua bán dâm, dịch vụ tình dục, nội dung người lớn.
- illegal: ma tuý, bóng cười, vũ khí, cờ bạc, lừa đảo, hack, làm giả giấy tờ, trốn công an.
- violence: đánh nhau, đánh ghen, trả thù, gây hại người khác.
- hate: xúc phạm, miệt thị, thù ghét một nhóm người.
- self_harm: tự tử, tự làm hại bản thân.
KHÔNG vi phạm: hỏi địa chỉ / giờ mở cửa / giá của quán, địa điểm công cộng; đi bar, pub hợp pháp; hẹn hò lãng mạn; chửi thề nhẹ không nhắm vào ai.
Trả JSON {"violation":true|false,"category":"privacy|sexual|illegal|violence|hate|self_harm|none","reason":"ngắn"}.`;

// Câu trả lời khi chặn
export const SAFETY_REPLIES = {
  privacy: 'Mình không thể giúp tìm nơi ở, số điện thoại, vị trí hay lịch trình của một người cụ thể — để bảo vệ quyền riêng tư của họ.',
  sexual: 'MapMate không hỗ trợ nội dung hay dịch vụ người lớn.',
  illegal: 'MapMate không hỗ trợ tìm chất cấm, vũ khí, cờ bạc hay hoạt động phạm pháp.',
  violence: 'Mình không thể hỗ trợ yêu cầu có thể gây nguy hiểm cho người khác.',
  hate: 'Mình sẵn lòng giúp, nhưng mong bạn dùng lời lẽ tôn trọng hơn nhé.',
  self_harm: 'Nghe có vẻ bạn đang trải qua chuyện rất khó khăn, và bạn không phải đối mặt một mình. Hãy gọi Đường dây nóng Ngày Mai 096 306 1414 để được lắng nghe, hoặc 115 nếu bạn đang gặp nguy hiểm.',
  jailbreak: 'Mình chỉ có thể giúp việc đi chơi, ăn uống và lên lộ trình ở TP.HCM, và không thể thay đổi cách mình hoạt động.',
  other: 'Yêu cầu này nằm ngoài những gì MapMate hỗ trợ.',
};

// Câu hỏi thay thế MapMate giúp được, theo từng loại bị chặn (bấm để gửi)
export const SAFE_ALTERNATIVES = {
  privacy: ['Quán cà phê yên tĩnh để hẹn gặp bạn bè', 'Địa điểm công cộng nổi tiếng ở Quận 1', 'Lên lộ trình đi chơi tối nay'],
  sexual: ['Quán rooftop lãng mạn cho buổi hẹn hò', 'Nhà hàng view đẹp cho 2 người tối nay', 'Lên lộ trình hẹn hò ở Quận 1'],
  illegal: ['Quán bar có nhạc sống ở Quận 1', 'Khu vui chơi giải trí cuối tuần', 'Lên lộ trình đi chơi tối nay'],
  violence: ['Quán cà phê yên tĩnh để nói chuyện', 'Công viên mát mẻ để đi dạo', 'Lên lộ trình đi chơi cuối tuần'],
  hate: ['Gợi ý quán ăn ngon gần đây', 'Lên lộ trình đi chơi tối nay', 'Quán cà phê chill ở Quận 3'],
  self_harm: ['Công viên yên tĩnh để đi dạo', 'Quán cà phê yên tĩnh để thư giãn'],
  jailbreak: ['Gợi ý quán ăn ngon gần đây', 'Lên lộ trình đi chơi tối nay', 'Quán cà phê yên tĩnh để làm việc'],
  other: ['Gợi ý quán ăn ngon gần đây', 'Lên lộ trình đi chơi tối nay', 'Quán cà phê chill ở Quận 3'],
};
