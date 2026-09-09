/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema } from 'mongoose';

/**
 * Applied to every schema. Converts `_id` (ObjectId) into a plain string
 * `id` field on JSON output (and strips `_id`/`__v`), so API responses keep
 * the exact same shape the Frontend already expects (`{ id: string, ... }`)
 * even though the database now uses real ObjectIds under the hood.
 *
 * Any ObjectId reference field is also stringified/flattened recursively by
 * the same transform, and populated sub-documents are flattened into their
 * referencing field (see `flattenRef` helper used by the services layer).
 */
export function idPlugin(schema: Schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: any) => {
      ret.id = ret._id?.toString?.() ?? ret._id;
      delete ret._id;
      return ret;
    },
  });
  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: any) => {
      ret.id = ret._id?.toString?.() ?? ret._id;
      delete ret._id;
      return ret;
    },
  });
}
