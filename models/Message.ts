/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const MessageSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  receiverId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, default: '' },
  mediaUrl: String,
  mediaType: { type: String, enum: ['image', 'video', 'voice', 'document'] },
  emoji: String,
  gif: String,
  isRead: { type: Boolean, default: false },
  isDelivered: { type: Boolean, default: true },
  seenAt: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ receiverId: 1, isRead: 1 });

MessageSchema.plugin(idPlugin);

export default (mongoose.models.Message as any) || mongoose.model('Message', MessageSchema);
