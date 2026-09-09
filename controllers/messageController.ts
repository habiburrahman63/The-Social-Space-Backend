/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User, Message, Conversation } from '../models';
import { userService } from '../services/userService';
import { messageService } from '../services/messageService';
import { toIdStringArray } from '../utils/serialize';
import { isValidObjectId } from '../utils/objectId';

// In-memory typing-indicator state (per server instance) - unchanged from the original.
const typingMap = new Map<string, number>();

const CONTACT_USER_FIELDS = 'username profilePic verifyBadge lastActiveAt isDeactivated blockedUsers';

export const getMessageContacts = async (req: Request, res: Response) => {
  const user = req.user!;
  const userObjectId = new mongoose.Types.ObjectId(user.id);

  // Only the fields the contact list actually renders - not full user
  // documents (bio, work, education, friends/followers arrays, etc.).
  const allUsersPromise = User.find({}).select(CONTACT_USER_FIELDS).lean();

  // This user's conversations - bounded by how many people they've actually
  // chatted with (not their total message count), and indexed on `participants`.
  const myConversationsPromise = Conversation.find({ participants: userObjectId }).select('_id participants').lean();

  const [allUsers, myConversations] = await Promise.all([allUsersPromise, myConversationsPromise]);

  const conversationIds = myConversations.map((c: any) => c._id);
  const partnerByConversation = new Map<string, string>();
  for (const c of myConversations as any[]) {
    const partner = toIdStringArray(c.participants).find((id) => id !== user.id);
    if (partner) partnerByConversation.set(c._id.toString(), partner);
  }

  // Last message per conversation, and unread counts per sender - both
  // computed with indexed aggregations instead of pulling this user's
  // entire message history into memory. This stays fast whether the user
  // has 10 messages or 100,000.
  const [lastMessageRows, unreadRows] = conversationIds.length > 0
    ? await Promise.all([
        Message.aggregate([
          { $match: { conversationId: { $in: conversationIds } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: '$conversationId', doc: { $first: '$$ROOT' } } },
        ]),
        Message.aggregate([
          { $match: { receiverId: userObjectId, isRead: false } },
          { $group: { _id: '$senderId', count: { $sum: 1 } } },
        ]),
      ])
    : [[], []];

  const lastMessageByPartner = new Map<string, any>();
  for (const row of lastMessageRows) {
    const m = row.doc;
    const partnerId = partnerByConversation.get(row._id.toString());
    if (partnerId) lastMessageByPartner.set(partnerId, messageService.serializeMessage({ ...m, id: m._id.toString() }));
  }

  const unreadByPartner = new Map<string, number>();
  for (const row of unreadRows) {
    unreadByPartner.set(row._id.toString(), row.count);
  }

  const myFriends = toIdStringArray(user.friends);
  const myBlocked = toIdStringArray(user.blockedUsers);
  const chattedUserIds = new Set(lastMessageByPartner.keys());

  const notesPool = [
    'ডিপ্রেশন... 🖤', 'Sathiya • Im', 'Busy coding 💻', 'Sleeping... 😴', 'At gym 💪',
    'Listening 🎵', 'Out pizza 🍕', 'DND 🤫', 'Lucky ✨', 'Offline leaves 🍂',
  ];

  const augment = (u: any) => {
    const uId = u._id.toString();
    const charCodeSum = u.username.split('').reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0);
    const statusNote = charCodeSum % 3 === 0 ? notesPool[charCodeSum % notesPool.length] : null;

    const apiUser = {
      id: uId,
      username: u.username,
      profilePic: u.profilePic,
      verifyBadge: !!u.verifyBadge,
      lastActiveAt: u.lastActiveAt,
      isDeactivated: !!u.isDeactivated,
    };
    return {
      ...apiUser,
      lastMessage: lastMessageByPartner.get(uId) || null,
      unreadCount: unreadByPartner.get(uId) || 0,
      statusNote,
    };
  };

  const eligible = allUsers.filter((u: any) => {
    const uId = u._id.toString();
    if (uId === user.id || u.isDeactivated) return false;
    if (myBlocked.includes(uId) || toIdStringArray(u.blockedUsers).includes(user.id)) return false;
    return true;
  });

  const all = eligible.map(augment);
  const contacts = all.filter((u: any) => myFriends.includes(u.id) || chattedUserIds.has(u.id));
  const suggestions = all.filter((u: any) => !myFriends.includes(u.id) && !chattedUserIds.has(u.id));

  contacts.sort((a: any, b: any) => {
    const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.username.localeCompare(b.username);
  });

  return res.json({ contacts, suggestions, all });
};

export const getUnreadMessageCount = async (req: Request, res: Response) => {
  const user = req.user!;
  const count = await Message.countDocuments({ receiverId: user.id, isRead: false });
  return res.json({ count });
};

export const getConversation = async (req: Request, res: Response) => {
  const user = req.user!;
  const otherUserId = req.params.id;
  if (!isValidObjectId(otherUserId)) return res.status(400).json({ error: 'Invalid user ID' });

  const messages = await Message.find({
    $or: [
      { senderId: user.id, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: user.id },
    ],
  }).sort({ createdAt: 1 });

  await Message.updateMany(
    { receiverId: user.id, senderId: otherUserId, isRead: false },
    { $set: { isRead: true, seenAt: new Date().toISOString() } }
  );

  return res.json({ messages: messages.map(m => messageService.serializeMessage(m)) });
};

export const setTypingStatus = (req: Request, res: Response) => {
  const user = req.user!;
  const { receiverId, isTyping } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'Receiver ID is required' });

  const key = `${user.id}_${receiverId}`;
  if (isTyping) typingMap.set(key, Date.now());
  else typingMap.delete(key);
  return res.json({ success: true });
};

export const getTypingStatus = (req: Request, res: Response) => {
  const user = req.user!;
  const targetUserId = req.params.targetUserId;
  const key = `${targetUserId}_${user.id}`;
  const timestamp = typingMap.get(key) || 0;
  const isTyping = Date.now() - timestamp < 3500;
  return res.json({ isTyping });
};

export const sendMessage = async (req: Request, res: Response) => {
  const user = req.user!;
  const { receiverId, text, mediaUrl, mediaType, emoji, gif, senderId } = req.body;

  if (!receiverId) return res.status(400).json({ error: 'Receiver ID is required' });
  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    return res.status(400).json({ error: 'Invalid receiver ID' });
  }

  const finalSenderId = senderId || user.id;

  if (await userService.checkBlocked(finalSenderId, receiverId)) {
    return res.status(403).json({ error: 'You cannot message this user due to a block' });
  }

  const conversation = await messageService.getOrCreateConversation(finalSenderId, receiverId);

  const newMessageDoc = await Message.create({
    conversationId: conversation.id,
    senderId: finalSenderId,
    receiverId,
    text: text || '',
    mediaUrl,
    mediaType,
    emoji,
    gif,
    isRead: false,
    isDelivered: true,
  });

  conversation.set('lastMessageAt', new Date());
  await conversation.save();

  typingMap.delete(`${finalSenderId}_${receiverId}`);

  // Intentionally not creating a general Notification record here: new
  // messages must only ever surface inside the Messenger section (driven by
  // Message.isRead / GET /api/messages/unread/count), never in the shared
  // notification bell/panel alongside post/friend activity.

  return res.status(201).json({ success: true, message: messageService.serializeMessage(newMessageDoc) });
};

export const deleteMessage = async (req: Request, res: Response) => {
  const user = req.user!;
  const msg = await Message.findById(req.params.id).catch(() => null);

  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.get('senderId').toString() !== user.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this message' });
  }

  msg.set('text', 'This message was unsent');
  msg.set('mediaUrl', undefined);
  msg.set('gif', undefined);
  msg.set('emoji', undefined);
  await msg.save();

  return res.json({ success: true, message: messageService.serializeMessage(msg) });
};
