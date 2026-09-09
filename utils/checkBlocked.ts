/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../models/store';

/**
 * Returns true if either user has blocked the other.
 */
export function checkBlocked(userId1: string, userId2: string): boolean {
  if (!userId1 || !userId2) return false;
  const user1 = db.getUserById(userId1);
  const user2 = db.getUserById(userId2);
  if (!user1 || !user2) return false;

  const blockedBy1 = user1.blockedUsers || [];
  const blockedBy2 = user2.blockedUsers || [];

  return blockedBy1.includes(userId2) || blockedBy2.includes(userId1);
}
