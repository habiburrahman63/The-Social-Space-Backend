/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const ReportSchema = new Schema({
  reporterId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  // Polymorphic target (post, comment, user, group, or page id) - the `type`
  // field disambiguates which collection it points into.
  reportedId: { type: Types.ObjectId, required: true, index: true },
  type: { type: String, enum: ['post', 'comment', 'user', 'group', 'page'], required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending', index: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

ReportSchema.plugin(idPlugin);

export default (mongoose.models.Report as any) || mongoose.model('Report', ReportSchema);
