import { claimVoucher, listMyVouchers, listVoucherEvents, redeemVoucher } from '../services/voucher.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const events = asyncHandler(async (req, res) => sendSuccess(res, { data: await listVoucherEvents(req.validated.query, req.user?.id ?? null) }));

export const claim = asyncHandler(async (req, res) => {
  const data = await claimVoucher(req.user.id, req.validated.params.id, req.validated.body);
  return sendSuccess(res, { message: data.won ? `Bạn đã săn được: ${data.prize.label} 🎉` : 'Chúc bạn may mắn lần sau!', data });
});

export const wallet = asyncHandler(async (req, res) => sendSuccess(res, { data: await listMyVouchers(req.user.id) }));

export const redeem = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã xác nhận voucher', data: await redeemVoucher(req.user.id, req.validated.body.code) }));
