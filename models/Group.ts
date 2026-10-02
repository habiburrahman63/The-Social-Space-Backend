/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const GroupSchema = new Schema({
  name: { type: String, required: true, index: true },
  privacy: { type: String, enum: ['public', 'private'], default: 'public' },
  coverPhoto: String,
  description: String,
  creatorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// getGroups lists every group sorted by newest first.
GroupSchema.index({ createdAt: -1 });

GroupSchema.plugin(idPlugin);

export default (mongoose.models.Group as any) || mongoose.model('Group', GroupSchema);
