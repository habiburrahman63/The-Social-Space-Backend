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

interface CachedUser {
  user: any;
  cachedAt: number;
}
const userAuthCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 6000; // 6 seconds TTL

export function clearUserAuthCache(userId?: string) {
  if (userId) {
    userAuthCache.delete(userId);
  } else {
    userAuthCache.clear();
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
    
    // Check short-lived in-memory cache first to avoid hammering MongoDB Atlas on concurrent
    // parallel requests (e.g. page loads and multi-endpoint polling).
    const cached = userAuthCache.get(decoded.userId);
    let user: any = null;
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      user = { ...cached.user };
    } else {
      user = await User.findById(decoded.userId)
        .select('username profilePic verifyBadge role friends blockedUsers isLocked isDeactivated lastActiveAt')
        .lean()
        .catch(() => null);

      if (!user) {
        userAuthCache.delete(decoded.userId);
        return res.status(403).json({ error: 'User no longer exists' });
      }

      user.id = user._id.toString();

      // Store in memory cache (cap cache size to avoid unbounded memory growth)
      if (userAuthCache.size > 2000) {
        userAuthCache.clear();
      }
      userAuthCache.set(decoded.userId, { user: { ...user }, cachedAt: Date.now() });
    }

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
