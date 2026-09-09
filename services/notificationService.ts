/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Notification } from '../models';
import { userService } from './userService';

const AUTHOR_FIELDS = 'username profilePic verifyBadge';

export const notificationService = {
  /**
   * Creates a notification from one real user to another, unless either has
   * blocked the other (mirrors the original db.saveNotification behavior).
   */
  async notifyUser(params: {
    recipientId: string;
    senderId: string;
    type: string;
    message: string;
    relatedId?: string;
  }) {
    const { recipientId, senderId, type, message, relatedId } = params;
    if (recipientId === senderId) return null;
    if (senderId) {
      const blocked = await userService.checkBlocked(senderId, recipientId);
      if (blocked) return null;
    }
    return Notification.create({ recipientId, senderId, type, message, relatedId });
  },

  /** System-generated notification (welcome message, security alert) - no real sender user. */
  async notifySystem(params: {
    recipientId: string;
    senderName: string;
    senderAvatar?: string;
    type: string;
    message: string;
    relatedId?: string;
  }) {
    const { recipientId, senderName, senderAvatar, type, message, relatedId } = params;
    return Notification.create({ recipientId, senderId: null, senderName, senderAvatar, type, message, relatedId });
  },

  async listForUser(recipientId: string, { page = 1, limit = 50 }: { page?: number; limit?: number } = {}) {
    const skip = (page - 1) * limit;
    // 'message' notifications are intentionally excluded: message activity
    // must only ever appear inside the Messenger section, never in the
    // shared notification bell/panel.
    const docs = await Notification.find({ recipientId, type: { $ne: 'message' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', AUTHOR_FIELDS)
      .lean();

    return docs.map((n: any) => {
      const sender = n.senderId && typeof n.senderId === 'object' ? n.senderId : null;
      return {
        id: n._id.toString(),
        recipientId: n.recipientId?.toString?.() || n.recipientId,
        senderId: sender ? (sender._id?.toString() || sender.id) : (n.senderId ? n.senderId.toString() : null),
        senderName: sender ? sender.username : n.senderName,
        senderAvatar: sender ? sender.profilePic : n.senderAvatar,
        type: n.type,
        message: n.message,
        isRead: n.isRead,
        relatedId: n.relatedId,
        createdAt: n.createdAt,
      };
    });
  },
};
