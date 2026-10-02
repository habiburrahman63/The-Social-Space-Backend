/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import { User, Notification } from '../models';
import { userService } from '../services/userService';
import { notificationService } from '../services/notificationService';
import { toIdStringArray } from '../utils/serialize';
import { isValidObjectId } from '../utils/objectId';

export const getFriendSuggestions = async (req: Request, res: Response) => {
  const user = req.user!;
  const myFriends = toIdStringArray(user.friends);
  const myBlocked = toIdStringArray(user.blockedUsers);

  const candidates = await User.find({
    _id: { $nin: [user.id, ...myFriends] },
    isDeactivated: { $ne: true },
    blockedUsers: { $ne: user.id }, // exclude users who blocked me
  })
    // coverPhoto can be a large base64 string and is never shown in a
    // suggestion card - don't ship it. This endpoint is polled by the Friends
    // page, so the saving compounds.
    .select('-coverPhoto')
    .limit(50)
    .lean();

  const suggestions = candidates
    .filter((u: any) => !myBlocked.includes(u._id.toString()))
    .map((u: any) => userService.toApiUser(u));

  return res.json({ suggestions: await Promise.all(suggestions) });
};

export const getFriendsList = async (req: Request, res: Response) => {
  const user = req.user!;
  const myFriendIds = toIdStringArray(user.friends);
  const myBlocked = toIdStringArray(user.blockedUsers);

  // Exclude coverPhoto: it can be a large base64 string per friend, which
  // made this heavily-polled endpoint's response grow to megabytes.
  const friendDocs = await User.find({ _id: { $in: myFriendIds }, isDeactivated: { $ne: true } })
    .select('-coverPhoto')
    .lean();
  const friends = friendDocs.filter((u: any) => {
    const uId = u._id.toString();
    const theirBlocked = toIdStringArray(u.blockedUsers);
    return !myBlocked.includes(uId) && !theirBlocked.includes(user.id);
  });

  return res.json({ friends: await Promise.all(friends.map((u: any) => userService.toApiUser(u))) });
};

export const getFriendRequests = async (req: Request, res: Response) => {
  const user = req.user!;
  const [received, sent] = await Promise.all([
    notificationService.listForUser(user.id, { limit: 200, types: ['friend_request'] }),
    Notification.find({ senderId: user.id, type: 'friend_request' }).populate('recipientId', 'username profilePic verifyBadge').lean(),
  ]);

  const sentFormatted = (sent as any[]).map(n => ({
    id: n._id.toString(),
    recipientId: n.recipientId?._id?.toString() || n.recipientId?.toString(),
    senderId: user.id,
    type: n.type,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt,
    relatedId: n.relatedId,
  }));

  return res.json({ received, sent: sentFormatted });
};

export const getUserById = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetUser = await User.findById(req.params.id).lean().catch(() => null);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const apiUser: any = await userService.toApiUser(targetUser);
  delete apiUser.passwordHash;

  const isBlockedByMe = toIdStringArray(user.blockedUsers).includes(apiUser.id);
  const hasBlockedMe = toIdStringArray((targetUser as any).blockedUsers).includes(user.id);

  return res.json({
    user: apiUser,
    isBlockedByMe,
    hasBlockedMe,
    isBlockedMutual: isBlockedByMe || hasBlockedMe,
  });
};

export const sendFriendRequest = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  const target = await User.findById(targetId).catch(() => null);

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (await userService.checkBlocked(user.id, targetId)) {
    return res.status(403).json({ error: 'You have blocked this user or been blocked by them' });
  }
  if (user.id === targetId) {
    return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
  }
  if (toIdStringArray(user.friends).includes(targetId)) {
    return res.status(400).json({ error: 'You are already friends with this user' });
  }

  const existingReq = await Notification.findOne({ recipientId: targetId, senderId: user.id, type: 'friend_request' });
  if (existingReq) {
    return res.status(400).json({ error: 'Friend request already sent' });
  }

  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  // Reverse request exists? Auto-accept.
  const reverseReq = await Notification.findOne({ recipientId: user.id, senderId: targetId, type: 'friend_request' });
  if (reverseReq) {
    addUnique(meDoc.friends, target.id);
    addUnique(target.friends, meDoc.id);
    addUnique(meDoc.following, target.id);
    addUnique(meDoc.followers, target.id);
    addUnique(target.following, meDoc.id);
    addUnique(target.followers, meDoc.id);

    await Promise.all([meDoc.save(), target.save(), Notification.deleteOne({ _id: reverseReq.id })]);

    await notificationService.notifyUser({
      recipientId: target.id,
      senderId: user.id,
      type: 'friend_accept',
      message: 'accepted your friend request',
    });

    return res.json({ success: true, isFriends: true, message: 'Mutual friend request! You are now friends.' });
  }

  await notificationService.notifyUser({
    recipientId: target.id,
    senderId: user.id,
    type: 'friend_request',
    message: 'sent you a friend request',
    relatedId: user.id,
  });

  // Auto-follow target user
  addUnique(meDoc.following, target.id);
  addUnique(target.followers, meDoc.id);
  await Promise.all([meDoc.save(), target.save()]);

  return res.json({ success: true, message: 'Friend request sent successfully' });
};

export const cancelFriendRequest = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  if (!isValidObjectId(targetId)) return res.status(400).json({ error: 'Invalid user ID' });
  await Notification.deleteMany({ recipientId: targetId, senderId: user.id, type: 'friend_request' });
  return res.json({ success: true, message: 'Friend request cancelled' });
};

export const acceptFriendRequest = async (req: Request, res: Response) => {
  const user = req.user!;
  const requesterId = req.params.id;
  const requester = await User.findById(requesterId).catch(() => null);
  if (!requester) return res.status(404).json({ error: 'User not found' });

  if (await userService.checkBlocked(user.id, requesterId)) {
    return res.status(403).json({ error: 'You have blocked this user or been blocked by them' });
  }

  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  addUnique(meDoc.friends, requester.id);
  addUnique(requester.friends, meDoc.id);
  addUnique(meDoc.following, requester.id);
  addUnique(meDoc.followers, requester.id);
  addUnique(requester.following, meDoc.id);
  addUnique(requester.followers, meDoc.id);

  await Promise.all([
    meDoc.save(),
    requester.save(),
    Notification.deleteMany({
      $or: [
        { recipientId: user.id, senderId: requesterId },
        { recipientId: requesterId, senderId: user.id },
      ],
      type: 'friend_request',
    }),
  ]);

  await notificationService.notifyUser({
    recipientId: requester.id,
    senderId: user.id,
    type: 'friend_accept',
    message: 'accepted your friend request',
  });

  return res.json({ success: true, friends: toIdStringArray(meDoc.friends) });
};

export const rejectFriendRequest = async (req: Request, res: Response) => {
  const user = req.user!;
  const requesterId = req.params.id;
  if (!isValidObjectId(requesterId)) return res.status(400).json({ error: 'Invalid user ID' });
  await Notification.deleteMany({
    $or: [
      { recipientId: user.id, senderId: requesterId },
      { recipientId: requesterId, senderId: user.id },
    ],
    type: 'friend_request',
  });
  return res.json({ success: true, message: 'Friend request declined' });
};

export const unfriendUser = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  const target = await User.findById(targetId).catch(() => null);
  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  if (target) {
    meDoc.friends = toIdStringArray(meDoc.friends).filter(id => id !== targetId) as any;
    target.friends = toIdStringArray(target.friends).filter(id => id !== user.id) as any;
    await Promise.all([meDoc.save(), target.save()]);
  }

  await Notification.deleteMany({
    $or: [
      { recipientId: user.id, senderId: targetId },
      { recipientId: targetId, senderId: user.id },
    ],
    type: 'friend_request',
  });

  return res.json({ success: true, friends: toIdStringArray(meDoc.friends) });
};

export const followUser = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  const target = await User.findById(targetId).catch(() => null);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  addUnique(meDoc.following, target.id);
  addUnique(target.followers, meDoc.id);
  await Promise.all([meDoc.save(), target.save()]);

  await notificationService.notifyUser({
    recipientId: target.id,
    senderId: user.id,
    type: 'follow',
    message: 'started following you',
    relatedId: user.id,
  });

  return res.json({ success: true, following: toIdStringArray(meDoc.following) });
};

export const unfollowUser = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  const target = await User.findById(targetId).catch(() => null);
  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  if (target) {
    meDoc.following = toIdStringArray(meDoc.following).filter(id => id !== targetId) as any;
    target.followers = toIdStringArray(target.followers).filter(id => id !== user.id) as any;
    await Promise.all([meDoc.save(), target.save()]);
  }

  return res.json({ success: true, following: toIdStringArray(meDoc.following) });
};

export const blockUser = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  if (user.id === targetId) return res.status(400).json({ error: 'You cannot block yourself' });

  const target = await User.findById(targetId).catch(() => null);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  addUnique(meDoc.blockedUsers, targetId);

  meDoc.friends = toIdStringArray(meDoc.friends).filter(id => id !== targetId) as any;
  target.friends = toIdStringArray(target.friends).filter(id => id !== user.id) as any;
  meDoc.following = toIdStringArray(meDoc.following).filter(id => id !== targetId) as any;
  meDoc.followers = toIdStringArray(meDoc.followers).filter(id => id !== targetId) as any;
  target.following = toIdStringArray(target.following).filter(id => id !== user.id) as any;
  target.followers = toIdStringArray(target.followers).filter(id => id !== user.id) as any;

  await Promise.all([
    meDoc.save(),
    target.save(),
    Notification.deleteMany({
      $or: [
        { senderId: user.id, recipientId: targetId },
        { senderId: targetId, recipientId: user.id },
      ],
    }),
  ]);

  return res.json({ success: true, message: 'User blocked successfully', blockedUsers: toIdStringArray(meDoc.blockedUsers) });
};

export const unblockUser = async (req: Request, res: Response) => {
  const user = req.user!;
  const targetId = req.params.id;
  const meDoc = await User.findById(user.id);
  if (!meDoc) return res.status(404).json({ error: 'User not found' });

  const blocked = toIdStringArray(meDoc.blockedUsers);
  if (blocked.includes(targetId)) {
    meDoc.blockedUsers = blocked.filter(id => id !== targetId) as any;
    await meDoc.save();
    return res.json({ success: true, message: 'User unblocked successfully', blockedUsers: toIdStringArray(meDoc.blockedUsers) });
  }

  return res.status(400).json({ error: 'User is not blocked' });
};

export const getBlockedUsers = async (req: Request, res: Response) => {
  const user = req.user!;
  const blockedIds = toIdStringArray(user.blockedUsers);
  const blockedDocs = await User.find({ _id: { $in: blockedIds } }).select('-coverPhoto').lean();
  const sanitized = await Promise.all(blockedDocs.map(async (u: any) => {
    const apiUser: any = await userService.toApiUser(u);
    delete apiUser.passwordHash;
    return apiUser;
  }));
  return res.json({ blocked: sanitized });
};

function addUnique(arr: any[], id: string) {
  if (!toIdStringArray(arr).includes(id)) arr.push(id as any);
}
