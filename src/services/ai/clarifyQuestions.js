// Câu hỏi làm rõ dựng sẵn (dùng khi không có LLM, hoặc khi bước kiểm tra khả thi cần hỏi lại).
// options = câu trả lời ngắn để người dùng bấm gửi — viết sao cho bộ hiểu câu đọc được ("Tối nay", "Khoảng 300k").
import { AI_MAX_CLARIFYING_QUESTIONS } from '../../constants/ai.js';

export const CLARIFY_QUESTIONS = {
  activity: { question: 'Bạn muốn đi kiểu gì?', options: ['Ăn uống', 'Cà phê chill', 'Tham quan', 'Vui chơi giải trí'] },
  area: { question: 'Bạn muốn đi khu nào?', options: ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Phú Nhuận'] },
  time: { question: 'Bạn đi lúc nào?', options: ['Bây giờ', 'Chiều nay', 'Tối nay', 'Cuối tuần'] },
  budget: { question: 'Ngân sách mỗi người khoảng bao nhiêu?', options: ['Khoảng 150k', 'Khoảng 300k', 'Khoảng 500k', 'Khoảng 1 triệu'] },
  people: { question: 'Bạn đi mấy người?', options: ['1 mình', '2 người', '4 người', '8 người'] },
};
// Thứ tự ưu tiên khi chỉ được hỏi tối đa 2 câu
const PRIORITY = ['activity', 'area', 'time', 'budget', 'people'];

export const questionsFor = (missing) =>
  PRIORITY.filter((key) => missing.includes(key))
    .slice(0, AI_MAX_CLARIFYING_QUESTIONS)
    .map((key) => CLARIFY_QUESTIONS[key]);
