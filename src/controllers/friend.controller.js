import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  acceptFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriendRequest,
  searchUsers,
  sendFriendRequest,
  suggestFriends,
  unfriend,
} from '../services/friend.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getFriends = asyncHandler(async (req, res) => sendSuccess(res, { data: await listFriends(req.user.id) }));
export const getRequests = asyncHandler(async (req, res) => sendSuccess(res, { data: await listFriendRequests(req.user.id) }));
export const getSuggestions = asyncHandler(async (req, res) => sendSuccess(res, { data: await suggestFriends(req.user.id) }));
export const findUsers = asyncHandler(async (req, res) => sendSuccess(res, { data: await searchUsers(req.user.id, req.validated.query.q) }));

export const sendRequest = asyncHandler(async (req, res) => {
  const data = await sendFriendRequest(req.user.id, req.validated.body.user_id);
  const accepted = data.relationship.status === 'friends';
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: accepted ? 'Hai bạn đã trở thành bạn bè' : 'Đã gửi lời mời kết bạn', data });
});

export const acceptRequest = asyncHandler(async (req, res) => {
  const data = await acceptFriendRequest(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Hai bạn đã trở thành bạn bè', data });
});

export const deleteRequest = asyncHandler(async (req, res) => {
  const data = await removeFriendRequest(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã xoá lời mời kết bạn', data });
});

export const removeFriend = asyncHandler(async (req, res) => {
  const data = await unfriend(req.user.id, req.validated.params.userId);
  return sendSuccess(res, { message: 'Đã huỷ kết bạn', data });
});
