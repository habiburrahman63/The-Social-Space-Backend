/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const SeenBySchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  seenAt: { type: Date, default: Date.now },
}, { _id: false });

const StorySchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  mediaUrl: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], required: true },
  seenBy: [SeenBySchema],
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// Stories are automatically removed by MongoDB 24h after creation.
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ userId: 1, createdAt: -1 });

StorySchema.plugin(idPlugin);

export default (mongoose.models.Story as any) || mongoose.model('Story', StorySchema);
