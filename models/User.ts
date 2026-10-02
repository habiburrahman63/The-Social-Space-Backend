/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema, Types } from 'mongoose';
import { idPlugin } from './plugins';

const SocialLinksSchema = new Schema({
  twitter: String,
  instagram: String,
  linkedin: String,
  github: String,
}, { _id: false });

const UserSchema = new Schema({
  // Usernames are a public handle (profile identity, @tags inside posts, friend
  // suggestions), so duplicates would silently break all of those. Enforced by
  // a unique index as well as an explicit check in the register controller, so
  // two simultaneous signups can't slip through the pre-check.
  username: { type: String, required: true, trim: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },

  profilePic: String,
  coverPhoto: String,
  bio: String,
  work: String,
  education: String,
  city: String,
  hometown: String,
  relationship: {
    type: String,
    enum: ['Single', 'In a relationship', 'Engaged', 'Married', "It's complicated", 'Separated', 'Divorced', 'Widowed'],
  },
  website: String,
  phone: String,
  birthday: String,
  gender: { type: String, enum: ['Male', 'Female', 'Custom', 'Prefer not to say'] },
  socialLinks: SocialLinksSchema,
  intro: String,
  featuredPhotos: [String],

  // Relationships kept as ObjectId reference arrays on the user document.
  // At this app's scale this is standard practice (fast to read, no extra
  // collection joins for "is X my friend" checks). If the platform grows to
  // millions of users with very high-degree accounts, these would migrate to
  // dedicated edge collections (see README "Scalability roadmap").
  friends: [{ type: Types.ObjectId, ref: 'User', index: true }],
  followers: [{ type: Types.ObjectId, ref: 'User', index: true }],
  following: [{ type: Types.ObjectId, ref: 'User', index: true }],
  blockedUsers: [{ type: Types.ObjectId, ref: 'User', index: true }],

  visibility: { type: String, enum: ['Public', 'Friends', 'Only Me'], default: 'Public' },
  verifyBadge: { type: Boolean, default: false },
  // Replaces the original code's hardcoded `user.id === 'usr-admin'` checks,
  // which broke once ids became real ObjectIds.
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },

  failedLoginAttempts: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  is2FAEnabled: Boolean,
  otpSecret: String,
  isDeactivated: { type: Boolean, default: false },
  lastActiveAt: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

// The old `{ username: 'text' }` index was removed here: no query ever used
// $text against User (search is a client-side filter over
// /friends/suggestions), and the unique b-tree index on username both enforces
// uniqueness and speeds up the exact-match `$in` lookups used for post @tags.

UserSchema.plugin(idPlugin);

export interface UserDoc extends mongoose.Document {
  username: string;
  email: string;
  passwordHash: string;
  profilePic?: string;
  coverPhoto?: string;
  bio?: string;
  work?: string;
  education?: string;
  city?: string;
  hometown?: string;
  relationship?: string;
  website?: string;
  phone?: string;
  birthday?: string;
  gender?: string;
  socialLinks?: any;
  intro?: string;
  featuredPhotos?: string[];
  friends: Types.ObjectId[];
  followers: Types.ObjectId[];
  following: Types.ObjectId[];
  blockedUsers: Types.ObjectId[];
  visibility: string;
  verifyBadge: boolean;
  role: 'user' | 'admin';
  failedLoginAttempts: number;
  isLocked: boolean;
  is2FAEnabled?: boolean;
  otpSecret?: string;
  isDeactivated?: boolean;
  lastActiveAt?: string;
  createdAt: Date;
}

export default (mongoose.models.User as mongoose.Model<UserDoc>) || mongoose.model<UserDoc>('User', UserSchema);
