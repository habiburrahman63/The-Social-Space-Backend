/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const ConversationSchema = new Schema({
  // Always stored sorted so a pair of users maps to exactly one conversation.
  participants: [{ type: Types.ObjectId, ref: 'User', required: true, index: true }],
  lastMessageAt: { type: Date, default: Date.now, index: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

ConversationSchema.plugin(idPlugin);

export default (mongoose.models.Conversation as any) || mongoose.model('Conversation', ConversationSchema);
