import { z } from 'zod';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../../constants/auth.js';

const email = z.string('Email phải là chuỗi ký tự').trim().toLowerCase().pipe(z.email('Email không hợp lệ'));

export const passwordRules = z
  .string('Mật khẩu phải là chuỗi ký tự')
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`)
  .regex(/[A-Za-z]/, 'Mật khẩu cần có ít nhất 1 chữ cái')
  .regex(/\d/, 'Mật khẩu cần có ít nhất 1 chữ số');

/**
 * Quy định username (handle công khai, dùng trong link chia sẻ):
 * - 3–20 ký tự, chỉ chữ cái KHÔNG dấu (a-z, A-Z), số, dấu "." và "_"
 * - Bắt đầu bằng chữ cái; không kết thúc bằng "." hoặc "_"; không có 2 dấu "." / "_" liền nhau
 * - Không trùng tên đã có (không phân biệt hoa/thường), không dùng tên dành riêng (admin, mapmate...)
 */
export const usernameRules = z
  .string('Tên người dùng phải là chuỗi ký tự')
  .trim()
  .min(USERNAME_MIN_LENGTH, `Tên người dùng tối thiểu ${USERNAME_MIN_LENGTH} ký tự`)
  .max(USERNAME_MAX_LENGTH, `Tên người dùng tối đa ${USERNAME_MAX_LENGTH} ký tự`)
  .regex(/^[A-Za-z0-9._]+$/, 'Chỉ dùng chữ cái không dấu, số, dấu "." hoặc "_" (không khoảng trắng)')
  .regex(/^[A-Za-z]/, 'Tên người dùng phải bắt đầu bằng chữ cái')
  .regex(/[A-Za-z0-9]$/, 'Tên người dùng không được kết thúc bằng "." hoặc "_"')
  .regex(/^(?!.*[._]{2})/, 'Không dùng 2 dấu "." hoặc "_" liền nhau')
  .refine((name) => !RESERVED_USERNAMES.includes(name.toLowerCase()), 'Tên này được dành riêng cho hệ thống');

export const registerSchema = z.object({ email, password: passwordRules, username: usernameRules });

export const loginSchema = z.object({
  email,
  password: z.string('Mật khẩu phải là chuỗi ký tự').min(1, 'Vui lòng nhập mật khẩu').max(PASSWORD_MAX_LENGTH),
});
