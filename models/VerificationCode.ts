/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema } from 'mongoose';
import { idPlugin } from './plugins';

const VerificationCodeSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  purpose: { type: String, enum: ['register', 'reset'], required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  // When this code was (re)generated. Used to enforce a cooldown between
  // resend requests so a single email address can't be spammed with codes.
  lastSentAt: { type: Date, required: true, default: Date.now },
  // Number of incorrect verification attempts made against this code.
  // Once this exceeds a threshold the code is invalidated, protecting the
  // 6-digit code space against brute-force guessing.
  attempts: { type: Number, default: 0 },
}, { timestamps: false });

VerificationCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB automatically deletes the document once expiresAt passes.
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

VerificationCodeSchema.plugin(idPlugin);

export default (mongoose.models.VerificationCode as any) || mongoose.model('VerificationCode', VerificationCodeSchema);
