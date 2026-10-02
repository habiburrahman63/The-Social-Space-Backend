/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const PageSchema = new Schema({
  name: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  coverPhoto: String,
  profilePic: String,
  bio: String,
  creatorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  followers: [{ type: Types.ObjectId, ref: 'User' }],
  invitees: [{ type: Types.ObjectId, ref: 'User' }],
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// getPages lists every page sorted by newest first.
PageSchema.index({ createdAt: -1 });

PageSchema.plugin(idPlugin);

export default (mongoose.models.Page as any) || mongoose.model('Page', PageSchema);
