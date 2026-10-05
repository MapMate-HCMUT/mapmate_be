// Lớp kiểm duyệt 1 — luật trong code: tức thì, miễn phí, chạy cả khi không có Groq.
// So trên chữ đã bỏ dấu + bản "dính liền" (bỏ hết dấu cách, dấu chấm...) để không lách được bằng "c.ầ.n s.a", "can-sa", "C A N S A".
// Chỉ bắt những mẫu rõ ràng; trường hợp tinh vi để lớp 3 (gpt-oss-safeguard) xét theo chính sách.
import { SAFETY_CATEGORIES } from '../../../constants/aiSafety.js';
import { normalizeSearchText } from '../../../utils/text.js';

const { PRIVACY, SEXUAL, ILLEGAL, VIOLENCE, HATE, SELF_HARM, JAILBREAK } = SAFETY_CATEGORIES;

// Người cụ thể (không phải quán / địa điểm)
const PERSON = '(anh ay|chi ay|co ay|ong ay|ba ay|em ay|nguoi yeu( cu)?|ny( cu)?|vo|chong|ban gai|ban trai|crush|sep|hang xom|ca si|dien vien|nguoi noi tieng|idol|hot girl|hot boy|kol|streamer|tiktoker)';

// Mẫu trên chữ bỏ dấu, có dấu cách
const SPACED_RULES = [
  { category: SELF_HARM, pattern: /\b(tu tu|tu sat|muon chet|khong muon song|ket thuc cuoc doi|cat tay|nhay cau tu tu|chet di cho xong)\b/ },
  { category: PRIVACY, pattern: new RegExp(`\\b(nha rieng|dia chi nha|so dien thoai|sdt|so dt|zalo|facebook|instagram|tiktok|cccd|cmnd|bien so xe)\\b.{0,20}\\b${PERSON}\\b`) },
  { category: PRIVACY, pattern: new RegExp(`\\b(lich trinh|vi tri)( hien tai| hang ngay)? cua ${PERSON}\\b`) },
  { category: PRIVACY, pattern: new RegExp(`\\b${PERSON}\\b.{0,30}\\b(dang o dau|song o dau|hay di dau|hay ngoi dau|nha o dau|o nha nao)\\b`) },
  { category: PRIVACY, pattern: /\b(theo doi|rinh|bam theo|dinh vi|truy tim|lan theo|tracking|stalk|doxx?)\b.{0,25}\b(nguoi|anh|chi|co|em|ong|ba|vo|chong|ny|nguoi yeu|crush|ban)\b/ },
  { category: SEXUAL, pattern: /\b(gai goi|gai bao|ga goi|mua dam|ban dam|mai dam|kich duc|happy ending|tay vin|bia om|sugar baby|di khach(?! ?san)|dich vu nguoi lon|nha nghi tinh|sex|tinh duc)\b/ },
  { category: ILLEGAL, pattern: /\b(ma tuy|can sa|thuoc lac|bay lac|keo ke|co my|heroin|cocaine|ketamine|meth|bong cuoi|chat cam|do bay|bay phong|hang bay)\b/ },
  { category: ILLEGAL, pattern: /\b(mua sung|ban sung|vu khi|lam bom|chat no|song bac|danh bac|ca do|lo de|xoc dia|danh bai an tien|lua dao|tien gia|lam gia giay to|hack (wifi|tai khoan|facebook)|tron cong an)\b/ },
  { category: VIOLENCE, pattern: /\b(danh nhau|danh ghen|hanh hung|tra thu|bao thu|giet nguoi|chem nguoi|hen ra (danh|xu))\b/ },
  { category: JAILBREAK, pattern: /\b(ignore (all |any )?(previous|above|prior) instructions|developer mode|jailbreak|dan mode|tiet lo (system )?prompt)\b/ },
  // Kiểu "bẻ khoá" bằng tiếng Việt — Prompt Guard nhận kém tiếng Việt nên bắt bằng luật
  // "bỏ qua / quên MỌI quy tắc", "bỏ qua hướng dẫn CŨ / CỦA BẠN" — không bắt "bỏ qua quy tắc ăn kiêng"
  { category: JAILBREAK, pattern: /\b(bo qua|quen|xoa|bo) (het|moi|tat ca|cac|toan bo) (cac )?(quy tac|huong dan|luat|gioi han|chi dan|lenh)\b|\b(bo qua|quen|xoa|bo) (quy tac|huong dan|luat|gioi han|chi dan|lenh) (cu|truoc( do)?|he thong|cua ban)\b|\b(ban la|dong vai|gia vo la|tu gio ban la) (mot )?(tro ly|ai|chatbot|bot)?.{0,15}khong (gioi han|kiem duyet|rang buoc)\b|\bche do (khong gioi han|nha phat trien|developer)\b/ },
];
// Mẫu trên chữ dính liền (bắt kiểu viết tách "c.a.n s.a")
const SQUASHED_RULES = [
  { category: ILLEGAL, pattern: /(matuy|cansa|thuoclac|baylac|keoke|heroin|cocaine|ketamine|bongcuoi)/ },
  { category: SEXUAL, pattern: /(gaigoi|muadam|bandam|maidam|kichduc|happyending|taybin|tayvin)/ },
];

// Từ tục so trên chữ CÒN DẤU: bỏ dấu thì "lồn" = "lớn", "cặc" = "các", "đéo" = "đeo" => chặn nhầm câu bình thường
const PROFANITY = /(^|[\s,.!?])(đm|đmm|địt|đéo|cặc|lồn|óc chó|thằng ngu|con ngu|ngu như bò|đồ ngu)($|[\s,.!?])/;

/** @returns {{ category, source: 'rules' } | null} */
export const moderateByRules = (text) => {
  if (PROFANITY.test(text.toLowerCase())) return { category: HATE, source: 'rules' };
  const plain = normalizeSearchText(text);
  const squashed = plain.replace(/[^a-z0-9]/g, '');
  const hit = SPACED_RULES.find((rule) => rule.pattern.test(plain)) ?? SQUASHED_RULES.find((rule) => rule.pattern.test(squashed));
  return hit ? { category: hit.category, source: 'rules' } : null;
};
