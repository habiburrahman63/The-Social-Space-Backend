/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import http from "http";
import compression from "compression";
import { PORT, SMTP_HOST, SMTP_USER, SMTP_PASS } from "./config/env";
import { connectDB } from "./config/database";
import { corsMiddleware } from "./middleware/cors";
import authRoutes from "./routes/authRoutes";
import apiRoutes from "./routes/apiRoutes";

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Render (and most load balancers) keep idle upstream connections open for
  // ~60s, well above Node's 5s default. That mismatch can make the server
  // close a socket just as the LB reuses it, causing sporadic resets and
  // added latency. Align the timeouts.
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;

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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Request logger that also records the response time. Logging the duration
  // per request makes it possible to see which endpoint is actually slow
  // straight from Render's logs, instead of guessing at bottlenecks.
  // originalUrl (not url) is used because Express rewrites req.url to be
  // router-relative, which would log "/posts" instead of "/api/posts".
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
      );
    });
    next();
  });

  // Mount API routers
  app.use("/api/auth", authRoutes);
  app.use("/api", apiRoutes);

  // Healthcheck endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });
  app.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Global error handler - catches errors forwarded by the async-safe router
  // (see utils/createRouter.ts) so a thrown/rejected error in any controller
  // returns a clean JSON 500 instead of crashing the process.
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(
        `[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.url}:`,
        err,
      );
      if (res.headersSent) return;
      res.status(500).json({ error: "Internal server error" });
    },
  );

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n❌ Error: Port ${PORT} is already in use by another process.`,
      );
      console.error(
        `Please stop the running process or choose a different PORT in .env and try again.\n`,
      );
    } else {
      console.error("Server error:", err);
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`==================================================`);
    console.log(`🚀 Social Space API listening on http://0.0.0.0:${PORT}`);
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(
        `⚠️  Email verification is NOT configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS in .env).`,
      );
      console.log(
        `⚠️  Registration and password reset emails will fail until this is set.`,
      );
    }
    console.log(`==================================================`);
  });
}

startServer().catch((err) => {
  console.error("Failed to launch API server:", err);
  process.exit(1);
});
