/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose from 'mongoose';
import { MONGODB_URI } from '../config/env';

let connected = false;
let connecting: Promise<void> | null = null;
let listenersAttached = false;

function attachConnectionLogging() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected - the driver will attempt to reconnect.');
    connected = false;
    connecting = null;
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
    connected = true;
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err?.message || err);
  });
}

export async function connectDB(): Promise<void> {
  if (connected || mongoose.connection.readyState === 1) {
    connected = true;
    return;
  }
  if (connecting) return connecting;

  attachConnectionLogging();

  connecting = (async () => {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      // A small, bounded pool is plenty for one Render instance and avoids
      // needlessly consuming the Atlas cluster's connection limit (the driver
      // default is 100). Extra concurrent queries simply queue behind the
      // pool rather than opening more sockets.
      maxPoolSize: 20,
      minPoolSize: 0,
      socketTimeoutMS: 45000,
      // Force IPv4 - more reliable on container hosts where IPv6 routing to
      // Atlas is not configured.
      family: 4,
    });
    connected = true;
    console.log('MongoDB connected successfully!');
  })();

  try {
    return await connecting;
  } catch (err) {
    // Don't permanently cache a rejected promise - allow a later call to retry.
    connecting = null;
    throw err;
  }
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export default mongoose;
