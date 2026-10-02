/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export const PORT = Number(process.env.PORT) || 3000;

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Credentials must never be hardcoded. This file previously shipped a live
// MongoDB Atlas connection string as a fallback, which leaked the database
// username/password into source control.
export const MONGODB_URI = process.env.MONGODB_URI || '';
if (!MONGODB_URI) {
  console.error(
    '[config] MONGODB_URI is not set. Add it to Backend/.env locally and to the Render environment variables.',
  );
}

// A hardcoded default JWT secret is a critical vulnerability: anyone who has
// seen the source can forge a token for any user, including an admin. When the
// env var is missing we generate a strong random secret for this process
// instead, so tokens can never be forged - the only side effect is that
// everyone is logged out after a restart until a real JWT_SECRET is configured.
export const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');

if (!process.env.JWT_SECRET) {
  console.error(
    '[config] JWT_SECRET is not set - using a random per-process secret. Set JWT_SECRET in Backend/.env and in your Render environment variables, otherwise every restart logs all users out.',
  );
}

export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_FROM = process.env.SMTP_FROM || `"Social Space" <${SMTP_USER || 'no-reply@socialspace.com'}>`;

// Comma-separated list of allowed frontend origins for CORS, e.g.
// "http://localhost:5173,https://myapp.com". "*" (default) allows any origin.
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
