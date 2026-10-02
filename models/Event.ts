/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const EventSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, required: true, index: true },
  location: String,
  creatorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  interested: [{ type: Types.ObjectId, ref: 'User' }],
  attending: [{ type: Types.ObjectId, ref: 'User' }],
  invitees: [{ type: Types.ObjectId, ref: 'User' }],
  calendarReminder: { type: Boolean, default: false },
  mediaUrl: String,
  isOfficial: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// getEvents lists every event sorted by newest first - without this the sort
// is done in memory after a full collection scan.
EventSchema.index({ createdAt: -1 });

EventSchema.plugin(idPlugin);

export default (mongoose.models.Event as any) || mongoose.model('Event', EventSchema);
