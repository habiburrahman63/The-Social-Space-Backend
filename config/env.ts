/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
dotenv.config();

export const PORT = Number(process.env.PORT) || 3000;

export const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://book:8rQdWpopgn47u62l@cluster0.giyzaxu.mongodb.net/book?appName=Cluster0';

export const JWT_SECRET =
  process.env.JWT_SECRET || 'facebook_clone_super_secret_session_key';

export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const SMTP_FROM = process.env.SMTP_FROM || `"Social Space" <${SMTP_USER || 'no-reply@socialspace.com'}>`;

// Comma-separated list of allowed frontend origins for CORS, e.g.
// "http://localhost:5173,https://myapp.com". "*" (default) allows any origin.
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const APP_URL = process.env.APP_URL || '';
