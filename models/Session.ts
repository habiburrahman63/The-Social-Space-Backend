/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const SessionSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  device: String,
  ip: String,
  status: { type: String, enum: ['success', 'failed'], required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

SessionSchema.index({ userId: 1, timestamp: -1 });
// Auto-prune login history older than 90 days.
SessionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

SessionSchema.plugin(idPlugin);

export default (mongoose.models.Session as any) || mongoose.model('Session', SessionSchema);
