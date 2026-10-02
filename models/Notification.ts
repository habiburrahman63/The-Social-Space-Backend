/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const NotificationSchema = new Schema({
  recipientId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  // Nullable: system notifications (welcome message, security alerts) have no
  // real backing user, so they carry their own display name/avatar instead.
  senderId: { type: Types.ObjectId, ref: 'User', default: null },
  senderName: String,
  senderAvatar: String,
  type: {
    type: String,
    enum: ['friend_request', 'friend_accept', 'like', 'comment', 'reply', 'follow', 'tag', 'message', 'system', 'invite', 'post'],
    required: true,
    index: true,
  },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false, index: true },
  relatedId: String, // postId, pageId, groupId, etc. (kept as free string since it's polymorphic)
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1 });
// Supports the "have I already sent/received a friend request from X" lookups
// and the sent-requests list, which filter by senderId + type.
NotificationSchema.index({ senderId: 1, recipientId: 1, type: 1 });

NotificationSchema.plugin(idPlugin);

export default (mongoose.models.Notification as any) || mongoose.model('Notification', NotificationSchema);
