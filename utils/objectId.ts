/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose from 'mongoose';

export function isValidObjectId(id: any): boolean {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}
