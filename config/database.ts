/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose from 'mongoose';
import { MONGODB_URI } from '../config/env';

let connected = false;
let connecting: Promise<void> | null = null;

export async function connectDB(): Promise<void> {
  if (connected || mongoose.connection.readyState === 1) {
    connected = true;
    return;
  }
  if (connecting) return connecting;

  connecting = (async () => {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    connected = true;
    console.log('MongoDB connected successfully!');
  })();

  return connecting;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export default mongoose;
