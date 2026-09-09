/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const MarketplaceItemSchema = new Schema({
  title: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, index: true },
  category: { type: String, required: true, index: true },
  mediaUrls: [String],
  sellerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  location: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

MarketplaceItemSchema.index({ title: 'text', description: 'text' });

MarketplaceItemSchema.plugin(idPlugin);

export default (mongoose.models.MarketplaceItem as any) || mongoose.model('MarketplaceItem', MarketplaceItemSchema);
