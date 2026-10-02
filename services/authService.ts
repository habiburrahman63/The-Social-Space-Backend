/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VerificationCode, Settings, Session } from '../models';

// Minimum time (ms) a user must wait before requesting another code for the
// same email/purpose. Prevents resend spam / email flooding.
const RESEND_COOLDOWN_MS = 60 * 1000;
// Maximum wrong-code attempts allowed before a code is invalidated and the
// user must request a new one. Protects against brute-forcing the 6-digit code.
const MAX_VERIFICATION_ATTEMPTS = 5;

export const authService = {
  /**
   * Returns the number of milliseconds the caller must still wait before a
   * new code may be sent, or 0 if a new code can be sent immediately.
   */
  async getResendCooldownRemaining(email: string, purpose: 'register' | 'reset') {
    const normalized = email.toLowerCase().trim();
    const doc: any = await VerificationCode.findOne({ email: normalized, purpose }).lean();
    if (!doc) return 0;
    const elapsed = Date.now() - new Date(doc.lastSentAt).getTime();
    return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
  },

  async setVerificationCode(email: string, code: string, expiresAtMs: number, purpose: 'register' | 'reset') {
    const normalized = email.toLowerCase().trim();
    await VerificationCode.updateOne(
      { email: normalized, purpose },
      { $set: { code, expiresAt: new Date(expiresAtMs), lastSentAt: new Date(), attempts: 0 } },
      { upsert: true }
    );
  },

  async getVerificationCode(email: string, purpose: 'register' | 'reset') {
    const normalized = email.toLowerCase().trim();
    const doc: any = await VerificationCode.findOne({ email: normalized, purpose }).lean();
    if (!doc) return undefined;
    return {
      code: doc.code,
      expires: new Date(doc.expiresAt).getTime(),
      attempts: doc.attempts || 0,
    };
  },

  /**
   * Records a failed verification attempt. Once MAX_VERIFICATION_ATTEMPTS is
   * exceeded, the code is deleted outright so it can no longer be used, even
   * if the correct code is guessed afterwards.
   */
  async registerFailedAttempt(email: string, purpose: 'register' | 'reset') {
    const normalized = email.toLowerCase().trim();
    const doc: any = await VerificationCode.findOneAndUpdate(
      { email: normalized, purpose },
      { $inc: { attempts: 1 } },
      { new: true }
    ).lean();
    if (doc && doc.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await VerificationCode.deleteOne({ email: normalized, purpose });
      return { locked: true };
    }
    return { locked: false };
  },

  async deleteVerificationCode(email: string, purpose: 'register' | 'reset') {
    const normalized = email.toLowerCase().trim();
    await VerificationCode.deleteOne({ email: normalized, purpose });
  },

  async getSettings() {
    let doc: any = await Settings.findOne({ key: 'system_settings' }).lean();
    if (!doc) {
      doc = await Settings.create({ key: 'system_settings' });
      doc = doc.toJSON();
    }
    const { id, ...rest } = doc;
    return rest;
  },

  async saveSettings(settings: any) {
    await Settings.updateOne({ key: 'system_settings' }, { $set: settings }, { upsert: true });
    return authService.getSettings();
  },

  async recordSession(userId: string, device: string, ip: string, status: 'success' | 'failed') {
    await Session.create({ userId, device, ip, status });
  },
};
