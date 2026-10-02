/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { UserDoc } from '../models/User';
import { JWT_SECRET } from '../config/env';

// Extend Express Request interface to hold req.user
declare global {
  namespace Express {
    interface Request {
      user?: UserDoc & { id: string };
    }
  }
}

// Middleware to verify JWT token
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const tokenInHeader = authHeader && authHeader.split(' ')[1];

  let token = tokenInHeader;
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [name, val] = c.trim().split('=');
      acc[name] = val;
      return acc;
    }, {} as Record<string, string>);
    token = cookies['token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token is missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    // This runs on EVERY authenticated request, so:
    //  1. Only pull the exact fields the controllers read off req.user
    //     (id/username/avatar/badge/role/friends/blockedUsers/status flags).
    //     A base64 cover photo or featuredPhotos entry can be hundreds of KB
    //     and is never needed here - shipping it from MongoDB on every request
    //     (and every Frontend poll) was pure overhead.
    //  2. Use .lean() so the document isn't hydrated into a full Mongoose
    //     object on every request - controllers only read plain properties.
    // Endpoints that must return the heavy fields (e.g. /auth/me, profile
    // updates) re-fetch the full document themselves.
    const user: any = await User.findById(decoded.userId)
      .select('username profilePic verifyBadge role friends blockedUsers isLocked isDeactivated lastActiveAt')
      .lean()
      .catch(() => null);

    if (!user) {
      return res.status(403).json({ error: 'User no longer exists' });
    }

    // .lean() results don't run the idPlugin virtual, so expose the same
    // string `id` the rest of the codebase (and Frontend) expects.
    user.id = user._id.toString();

    if (user.isLocked) {
      return res.status(403).json({ error: 'Account is locked. Please reset your password.' });
    }

    if (user.isDeactivated) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Only touch lastActiveAt if it's actually stale, and never block the
    // response on this write. With the Frontend polling several endpoints
    // every few seconds, awaiting a full document save on every single
    // authenticated request was adding a network round-trip to MongoDB to
    // every request and creating heavy, unnecessary write load.
    //
    // The threshold here must stay well under the Frontend's 20-second
    // "online" cutoff (utils/presence.ts isUserOnline) or active users start
    // intermittently showing as offline between writes.
    const lastActive = user.lastActiveAt;
    const isStale = !lastActive || Date.now() - new Date(lastActive).getTime() > 10_000;
    if (isStale) {
      User.updateOne({ _id: user.id }, { $set: { lastActiveAt: new Date().toISOString() } }).catch(() => {});
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token' });
  }
}
