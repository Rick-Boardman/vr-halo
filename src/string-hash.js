// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Hash arbitrary input into a stable unsigned 32-bit integer using the FNV-1a algorithm.
 * @param {unknown} value Input value coerced to string before hashing.
 * @returns {number} Unsigned 32-bit hash value derived from the string representation of the input.
 * Side effects: none.
 */
export function hashStringToU32(value) {
  const text = String(value ?? "");
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
