/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import compression from 'compression';
import { PORT, SMTP_HOST, SMTP_USER, SMTP_PASS } from './config/env';
import { connectDB } from './config/database';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/authRoutes';
import apiRoutes from './routes/apiRoutes';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Connect to MongoDB. There is no local-file fallback anymore - the whole
  // point of this architecture is a real, normalized database.
  await connectDB();

  // Standard middleware
  app.use(corsMiddleware);
  // gzip every response. Posts, profile pictures, and cover photos are
  // stored and returned as base64 data URIs embedded directly in JSON, so
  // API responses can be very large text payloads - and base64 text
  // compresses extremely well (typically 25-35% smaller over the wire).
  // This alone was previously not happening at all, so every request was
  // sending full, uncompressed image data.
  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Mount API routers
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);

  // Healthcheck endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Global error handler - catches errors forwarded by the async-safe router
  // (see utils/createRouter.ts) so a thrown/rejected error in any controller
  // returns a clean JSON 500 instead of crashing the process.
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.url}:`, err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
      console.error(`Please stop the running process or choose a different PORT in .env and try again.\n`);
    } else {
      console.error('Server error:', err);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`==================================================`);
    console.log(`🚀 Social Space API listening on http://0.0.0.0:${PORT}`);
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`⚠️  Email verification is NOT configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS in .env).`);
      console.log(`⚠️  Registration and password reset emails will fail until this is set.`);
    } else if (SMTP_HOST === 'smtp.gmail.com') {
      console.log(`ℹ️  Using Gmail SMTP. If codes are "accepted" in logs but never arrive, see`);
      console.log(`ℹ️  the SMTP_HOST comments in .env.example for a more reliable provider.`);
    }
    console.log(`==================================================`);
  });
}

startServer().catch(err => {
  console.error('Failed to launch API server:', err);
  process.exit(1);
});
