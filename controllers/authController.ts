/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { User } from '../models';
import { userService } from '../services/userService';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { JWT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '../config/env';

async function sendVerificationEmail(toEmail: string, code: string): Promise<{ success: boolean; error?: string }> {
  const host = SMTP_HOST;
  const port = SMTP_PORT;
  const user = SMTP_USER;
  const pass = SMTP_PASS;
  const from = SMTP_FROM;

  // There is no "simulation" fallback: if the mail server isn't configured,
  // sending has genuinely failed and callers must treat it as a hard error
  // rather than pretending the email went out.
  if (!host || !user || !pass) {
    console.error('Email verification is not configured: missing SMTP_HOST/SMTP_USER/SMTP_PASS environment variables.');
    return { success: false, error: 'Email service is not configured. Please contact support.' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from,
      to: toEmail,
      subject: 'Email Verification Code - Social Space',
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 24px; font-weight: bold; color: #1877f2; letter-spacing: -0.5px;">Social Space</span>
          </div>
          <h2 style="font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 10px; text-align: center;">Verify Your Email Address</h2>
          <p style="font-size: 13px; color: #4b5563; line-height: 1.5; margin-bottom: 20px; text-align: center;">
            Thank you for starting your registration! Use the verification code below to verify your email address and activate your profile:
          </p>
          <div style="text-align: center; margin: 25px 0;">
            <span style="display: inline-block; background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 12px 30px; font-size: 24px; font-family: monospace; font-weight: bold; letter-spacing: 6px; color: #1877f2; border-radius: 8px;">${code}</span>
          </div>
          <p style="font-size: 11px; color: #9ca3af; line-height: 1.5; text-align: center; margin-top: 25px; border-top: 1px solid #f3f4f6; padding-top: 15px;">
            This code will expire in 10 minutes. If you did not make this request, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    // Diagnostic-only logging: helps confirm whether Gmail actually accepted
    // the message for delivery (vs. it disappearing before reaching Gmail).
    // Never logs the code or credentials.
    console.log(`Verification email accepted by SMTP server for ${toEmail}. messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)} response=${info.response}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error sending verification email:', err.message);
    return { success: false, error: 'Failed to send verification email. Please try again shortly.' };
  }
}

export const sendVerificationCode = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const lowerEmail = email.toLowerCase().trim();
  if (!lowerEmail.includes('@')) return res.status(400).json({ error: 'Invalid email address' });

  const existing = await userService.findByEmail(lowerEmail);
  if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

  const cooldownRemaining = await authService.getResendCooldownRemaining(lowerEmail, 'register');
  if (cooldownRemaining > 0) {
    return res.status(429).json({
      error: `Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before requesting another code.`,
      retryAfterMs: cooldownRemaining,
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const sendResult = await sendVerificationEmail(lowerEmail, code);
  if (!sendResult.success) {
    // Never tell the user the email was sent when it wasn't, and never
    // create/refresh a verification record for a code that never reached them.
    return res.status(502).json({ error: sendResult.error || 'Failed to send verification email. Please try again shortly.' });
  }

  await authService.setVerificationCode(lowerEmail, code, Date.now() + 10 * 60 * 1000, 'register');

  return res.json({
    success: true,
    message: 'Verification code has been sent to your email address!',
  });
};

export const register = async (req: Request, res: Response) => {
  const { username, email, password, gender, birthday, code } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  if (!code) {
    return res.status(400).json({ error: 'Email verification code is required. Please verify your email first.' });
  }

  const lowerEmail = email.toLowerCase().trim();
  const existing = await userService.findByEmail(lowerEmail);
  if (existing) return res.status(400).json({ error: 'An account with this email already exists' });

  const saved = await authService.getVerificationCode(lowerEmail, 'register');
  if (!saved) return res.status(400).json({ error: 'No verification session found. Please request a new code.' });
  if (Date.now() > saved.expires) {
    await authService.deleteVerificationCode(lowerEmail, 'register');
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }
  if (saved.code !== code.trim()) {
    const { locked } = await authService.registerFailedAttempt(lowerEmail, 'register');
    if (locked) {
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
    }
    return res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
  }
  await authService.deleteVerificationCode(lowerEmail, 'register');

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser = await User.create({
    username,
    email: lowerEmail,
    passwordHash,
    profilePic: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`,
    coverPhoto: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800',
    bio: 'Hello world, I just joined the network!',
    relationship: 'Single',
    gender: gender || 'Prefer not to say',
    birthday: birthday || '',
    friends: [],
    followers: [],
    following: [],
    visibility: 'Public',
    verifyBadge: false,
    role: 'user',
    failedLoginAttempts: 0,
    isLocked: false,
  });

  const token = jwt.sign({ userId: newUser.id, email: newUser.get('email') }, JWT_SECRET, { expiresIn: '7d' });

  await authService.recordSession(newUser.id, String(req.headers['user-agent'] || 'Unknown Device'), req.ip || '127.0.0.1', 'success');

  await notificationService.notifySystem({
    recipientId: newUser.id,
    senderName: 'System Admin',
    senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    type: 'system',
    message: 'Welcome to our social network! Complete your profile to connect with friends.',
  });

  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

  const apiUser = await userService.toApiUser(newUser);
  delete (apiUser as any).passwordHash;
  return res.status(201).json({ user: apiUser, token });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await userService.findByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.get('isLocked')) {
    return res.status(403).json({ error: 'Your account is locked due to multiple failed login attempts. Please reset your password.' });
  }

  const isValid = bcrypt.compareSync(password, user.get('passwordHash'));
  const device = String(req.headers['user-agent'] || 'Unknown Device');
  const ip = req.ip || '127.0.0.1';

  if (!isValid) {
    const attempts = (user.get('failedLoginAttempts') || 0) + 1;
    user.set('failedLoginAttempts', attempts);
    await authService.recordSession(user.id, device, ip, 'failed');

    if (attempts >= 5) {
      user.set('isLocked', true);
      await user.save();
      return res.status(403).json({ error: 'Account has been locked due to 5 consecutive failed login attempts. Contact admin or reset password.' });
    }

    await user.save();
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.get('isDeactivated')) user.set('isDeactivated', false);
  user.set('failedLoginAttempts', 0);
  await user.save();
  await authService.recordSession(user.id, device, ip, 'success');

  const token = jwt.sign({ userId: user.id, email: user.get('email') }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

  const apiUser = await userService.toApiUser(user);
  delete (apiUser as any).passwordHash;
  return res.json({ user: apiUser, token });
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
};

export const getCurrentUser = async (req: Request, res: Response) => {
  const apiUser: any = await userService.toApiUser(req.user!);
  delete apiUser.passwordHash;
  return res.json({ user: apiUser });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const lowerEmail = email.toLowerCase().trim();
  const user = await userService.findByEmail(lowerEmail);
  if (!user) return res.status(404).json({ error: 'No user account found with this email address.' });

  const cooldownRemaining = await authService.getResendCooldownRemaining(lowerEmail, 'reset');
  if (cooldownRemaining > 0) {
    return res.status(429).json({
      error: `Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before requesting another code.`,
      retryAfterMs: cooldownRemaining,
    });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000;

  const emailResult = await sendVerificationEmail(user.get('email'), code);
  if (!emailResult.success) {
    return res.status(502).json({ error: emailResult.error || 'Failed to send password reset email. Please try again shortly.' });
  }

  await authService.setVerificationCode(lowerEmail, code, expires, 'reset');

  await notificationService.notifySystem({
    recipientId: user.id,
    senderName: 'System Security',
    senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    type: 'system',
    message: 'A password reset code was requested for your account. If this wasn\'t you, please secure your account.',
  });

  return res.json({
    success: true,
    message: 'Password reset code has been sent to your email.',
  });
};

export const verifyResetCode = async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and verification code are required.' });

  const lowerEmail = email.toLowerCase().trim();
  const record = await authService.getVerificationCode(lowerEmail, 'reset');

  if (!record) return res.status(400).json({ error: 'No password reset request found for this email. Please request a new code.' });
  if (Date.now() > record.expires) {
    await authService.deleteVerificationCode(lowerEmail, 'reset');
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }
  if (record.code !== otp.trim()) {
    const { locked } = await authService.registerFailedAttempt(lowerEmail, 'reset');
    if (locked) {
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
    }
    return res.status(400).json({ error: 'Invalid verification code. Please check the code and try again.' });
  }

  return res.json({ success: true, message: 'Verification code verified successfully.' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters long.' });

  const lowerEmail = email.toLowerCase().trim();
  const user = await userService.findByEmail(lowerEmail);
  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const record = await authService.getVerificationCode(lowerEmail, 'reset');
  if (!record) return res.status(400).json({ error: 'No password reset request found. Please request a new code.' });
  if (Date.now() > record.expires) {
    await authService.deleteVerificationCode(lowerEmail, 'reset');
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }
  if (record.code !== otp.trim()) {
    const { locked } = await authService.registerFailedAttempt(lowerEmail, 'reset');
    if (locked) {
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
    }
    return res.status(400).json({ error: 'Invalid verification code. Please check the code and try again.' });
  }

  const salt = bcrypt.genSaltSync(10);
  user.set('passwordHash', bcrypt.hashSync(newPassword, salt));
  user.set('isLocked', false);
  user.set('failedLoginAttempts', 0);
  await authService.deleteVerificationCode(lowerEmail, 'reset');
  await user.save();

  await notificationService.notifySystem({
    recipientId: user.id,
    senderName: 'System Security',
    senderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    type: 'system',
    message: 'Your account password was successfully updated.',
  });

  return res.json({ success: true, message: 'Password reset successful. You can now log in with your new password.' });
};

export const updateProfile = async (req: Request, res: Response) => {
  const reqUser = req.user!;
  const {
    username, bio, work, education, city, hometown, relationship, website, phone, birthday, gender,
    profilePic, coverPhoto, isDeactivated, currentPassword, newPassword,
  } = req.body;

  const user = await User.findById(reqUser.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (currentPassword && newPassword) {
    const isValid = bcrypt.compareSync(currentPassword, user.get('passwordHash'));
    if (!isValid) return res.status(400).json({ error: 'Incorrect current password' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    const salt = bcrypt.genSaltSync(10);
    user.set('passwordHash', bcrypt.hashSync(newPassword, salt));
  }

  if (username) user.set('username', username);
  if (bio !== undefined) user.set('bio', bio);
  if (work !== undefined) user.set('work', work);
  if (education !== undefined) user.set('education', education);
  if (city !== undefined) user.set('city', city);
  if (hometown !== undefined) user.set('hometown', hometown);
  if (relationship !== undefined) user.set('relationship', relationship);
  if (website !== undefined) user.set('website', website);
  if (phone !== undefined) user.set('phone', phone);
  if (birthday !== undefined) user.set('birthday', birthday);
  if (gender !== undefined) user.set('gender', gender);
  if (profilePic !== undefined) user.set('profilePic', profilePic);
  if (coverPhoto !== undefined) user.set('coverPhoto', coverPhoto);
  if (isDeactivated !== undefined) user.set('isDeactivated', isDeactivated);

  await user.save();

  // NOTE: unlike the original array-based database, posts/comments/stories/
  // marketplace listings only store a `userId` reference now (no duplicated
  // username/avatar copy) and are populated from the User document at read
  // time. So updating the user here is immediately reflected everywhere,
  // with no cascading "sync this field across every collection" step needed.

  const apiUser: any = await userService.toApiUser(user);
  delete apiUser.passwordHash;
  return res.json({ success: true, user: apiUser });
};
