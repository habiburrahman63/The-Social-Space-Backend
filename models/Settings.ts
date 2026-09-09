/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema } from 'mongoose';
import { idPlugin } from './plugins';

const SettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, default: 'system_settings' },
  siteName: { type: String, default: 'SocialSpace' },
  maintenanceMode: { type: Boolean, default: false },
  allowSignups: { type: Boolean, default: true },
  defaultTheme: { type: String, enum: ['light', 'dark'], default: 'light' },
}, { timestamps: false });

SettingsSchema.plugin(idPlugin);

export default (mongoose.models.Settings as any) || mongoose.model('Settings', SettingsSchema);
