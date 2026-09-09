/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Escapes regex special characters so user-supplied search text can't break or hijack a RegExp query. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
