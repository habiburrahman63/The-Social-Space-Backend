/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { CORS_ORIGIN } from '../config/env';

const allowedOrigins = CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

/**
 * Lightweight CORS middleware so the Frontend (served from its own origin/port
 * in development, e.g. http://localhost:5173) can call this Backend API
 * (e.g. http://localhost:3000) with credentials (cookies / Authorization header).
 *
 * Implemented without the `cors` npm package because it was referenced but
 * never actually added as a dependency in the original project.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin as string | undefined;

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
