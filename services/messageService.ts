/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Conversation, Message } from '../models';

export const messageService = {
  async getOrCreateConversation(userA: string, userB: string) {
    const participants = [userA, userB].sort();
    let convo = await Conversation.findOne({ participants: { $all: participants, $size: 2 } });
    if (!convo) {
      convo = await Conversation.create({ participants, lastMessageAt: new Date() });
    }
    return convo;
  },

  serializeMessage(m: any) {
    const json = m.toJSON ? m.toJSON() : m;
    return {
      id: json.id || json._id?.toString(),
      senderId: json.senderId?.toString ? json.senderId.toString() : json.senderId,
      receiverId: json.receiverId?.toString ? json.receiverId.toString() : json.receiverId,
      text: json.text,
      mediaUrl: json.mediaUrl,
      mediaType: json.mediaType,
      emoji: json.emoji,
      gif: json.gif,
      isRead: json.isRead,
      isDelivered: json.isDelivered,
      createdAt: json.createdAt,
      seenAt: json.seenAt,
    };
  },
};
