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
    const user = await User.findById(decoded.userId).catch(() => null);

    if (!user) {
      return res.status(403).json({ error: 'User no longer exists' });
    }

    if (user.get('isLocked')) {
      return res.status(403).json({ error: 'Account is locked. Please reset your password.' });
    }

    if (user.get('isDeactivated')) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Only touch lastActiveAt if it's actually stale, and never block the
    // response on this write. With the Frontend polling several endpoints
    // every few seconds, awaiting a full document save on every single
    // authenticated request was adding a network round-trip to MongoDB to
    // every request and creating heavy, unnecessary write load - this was
    // the main cause of the app feeling slow.
    //
    // The threshold here must stay well under the Frontend's 20-second
    // "online" cutoff (utils/presence.ts isUserOnline) or active users start
    // intermittently showing as offline between writes.
    const lastActive = user.get('lastActiveAt');
    const isStale = !lastActive || Date.now() - new Date(lastActive).getTime() > 10_000;
    if (isStale) {
      User.updateOne({ _id: user.id }, { $set: { lastActiveAt: new Date().toISOString() } }).catch(() => {});
    }

    req.user = user as any;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token' });
  }
}
