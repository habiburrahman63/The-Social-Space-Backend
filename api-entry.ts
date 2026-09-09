/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Serverless entry point (Vercel / Netlify Functions). The standalone
 * long-running server lives in server.ts; this file wraps the same Express
 * app with `serverless-http` for platforms that invoke it per-request.
 */

import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import compression from 'compression';
import { connectDB } from './config/database';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/authRoutes';
import apiRoutes from './routes/apiRoutes';

const app = express();

app.use(corsMiddleware);
// See server.ts for why this matters: responses embed base64 image data
// directly in JSON, so gzip compression meaningfully cuts response size.
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazily initialize the database on first serverless invocation
let dbInitPromise: Promise<void> | null = null;
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = connectDB();
    }
    await dbInitPromise;
  } catch (e) {
    console.error('Serverless DB initialization notice:', e);
  }
  next();
});

// Mount routes at /api/auth and /api, plus the Netlify function path so
// routing works regardless of which platform invokes this handler.
app.use('/.netlify/functions/api/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/.netlify/functions/api', apiRoutes);
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`Unhandled error on ${req.method} ${req.url}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

export const handler = serverless(app);
export default app;
