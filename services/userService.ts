/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Post } from '../models';
import { toIdStringArray } from '../utils/serialize';

export const userService = {
  async findById(id: string) {
    if (!id) return null;
    try {
      return await User.findById(id);
    } catch {
      return null; // invalid ObjectId format
    }
  },

  async findByEmail(email: string) {
    return User.findOne({ email: email.toLowerCase().trim() });
  },

  async findAll() {
    return User.find();
  },

  async create(data: any) {
    return User.create(data);
  },

  /** Attaches computed friendsCount/postsCount and flattens ref arrays to string ids, matching the original API shape. */
  async toApiUser(userDoc: any, opts: { includePostsCount?: boolean } = {}) {
    if (!userDoc) return null;

    let json: any;
    if (typeof userDoc.toJSON === 'function') {
      // Real Mongoose document - our idPlugin transform handles _id -> id.
      json = userDoc.toJSON();
    } else {
      // .lean() result - a plain object that never went through toJSON(),
      // so it still has a raw ObjectId `_id` instead of a string `id`.
      json = { ...userDoc };
      json.id = json.id || json._id?.toString?.() || json._id;
      delete json._id;
      delete json.__v;
    }

    // postsCount isn't rendered anywhere in the Frontend today (Profile.tsx
    // computes its own count from the posts it fetches), so skip the extra
    // Post.countDocuments() query by default - this function gets called in
    // loops on endpoints polled every few seconds (friends list/suggestions,
    // blocked users), so that per-user query added up fast. Pass
    // { includePostsCount: true } for the rare caller that actually needs it.
    const postsCount = opts.includePostsCount ? await Post.countDocuments({ userId: json.id }) : 0;

    return {
      ...json,
      friends: toIdStringArray(json.friends),
      followers: toIdStringArray(json.followers),
      following: toIdStringArray(json.following),
      blockedUsers: toIdStringArray(json.blockedUsers),
      friendsCount: json.friends?.length || 0,
      postsCount,
    };
  },

  isBlocked(user: any, otherUserId: string): boolean {
    const blocked = toIdStringArray(user?.blockedUsers);
    return blocked.includes(otherUserId);
  },

  async checkBlocked(userId1: string, userId2: string): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    const [user1, user2] = await Promise.all([
      User.findById(userId1).lean().catch(() => null),
      User.findById(userId2).lean().catch(() => null),
    ]);
    if (!user1 || !user2) return false;
    const blockedBy1 = toIdStringArray((user1 as any).blockedUsers);
    const blockedBy2 = toIdStringArray((user2 as any).blockedUsers);
    return blockedBy1.includes(userId2) || blockedBy2.includes(userId1);
  },
};
