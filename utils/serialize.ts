/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Turns a Mongoose reaction Map (userId -> ReactionType) into the plain
 * { [userId]: type } object the Frontend expects.
 */
export function reactionsToObject(reactions: any): Record<string, string> {
  if (!reactions) return {};
  if (reactions instanceof Map) return Object.fromEntries(reactions);
  return reactions;
}

/**
 * Flattens a populated `userId` (or any populated author ref) sub-document
 * into `username` / `userAvatar` / `verifyBadge` fields on the parent object,
 * matching the denormalized shape the original API returned - without
 * actually storing duplicate copies of the author's name/photo in the DB.
 *
 * `doc` is expected to already be a plain object (e.g. via `.lean()` or
 * `.toJSON()`), with `doc[refField]` populated to a user object or ObjectId.
 */
export function flattenAuthor<T extends Record<string, any>>(
  doc: T,
  refField: string = 'userId',
  opts: { idOutField?: string } = {}
): any {
  const idOutField = opts.idOutField || refField;
  const ref = doc[refField];
  const out: any = { ...doc };

  if (ref && typeof ref === 'object' && ref.username !== undefined) {
    out[idOutField] = ref.id || ref._id?.toString?.() || ref._id;
    out.username = ref.username;
    out.userAvatar = ref.profilePic;
    out.verifyBadge = !!ref.verifyBadge;
    if (idOutField !== refField) delete out[refField];
  } else if (ref) {
    out[idOutField] = ref.toString ? ref.toString() : ref;
    if (idOutField !== refField) delete out[refField];
  }

  return out;
}

/**
 * Converts an ObjectId / populated doc / string into a plain string id.
 *
 * IMPORTANT: a raw (unpopulated) Mongoose/BSON ObjectId instance also has an
 * `.id` property - but that's the internal 12-byte raw buffer, not a hex
 * string. Checking `.id` before recognizing a raw ObjectId silently produces
 * garbage ids (a stringified buffer) instead of the expected 24-char hex
 * string, which then fails to re-cast anywhere that id is used in a later
 * query (surfaces as a confusing BSON "input must be a 24 character hex
 * string" CastError). So: only trust a string `.id` field (that's our
 * idPlugin's transform output on a populated/lean-mapped document); for
 * anything else, always go through `.toString()`, which is correct for both
 * raw ObjectIds and `_id` ObjectIds alike.
 */
export function toIdString(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if (typeof v.id === 'string') return v.id;
    if (v._id) return v._id.toString();
  }
  if (typeof v.toString === 'function') return v.toString();
  return undefined;
}

/** Maps an array of ObjectId/populated-doc refs into an array of plain string ids. */
export function toIdStringArray(arr: any[] | undefined): string[] {
  if (!arr) return [];
  return arr.map(toIdString).filter(Boolean) as string[];
}
