/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const GroupMemberSchema = new Schema({
  groupId: { type: Types.ObjectId, ref: 'Group', required: true, index: true },
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
}, { timestamps: { createdAt: 'joinedAt', updatedAt: false } });

GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });

GroupMemberSchema.plugin(idPlugin);

export default (mongoose.models.GroupMember as any) || mongoose.model('GroupMember', GroupMemberSchema);
