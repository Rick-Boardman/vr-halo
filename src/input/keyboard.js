// SPDX-License-Identifier: Apache-2.0
// Keyboard adapter: reads a held-key set into axes and actions.
//
// Halo's desktop navigation keeps the held keys in `navigation.keysDown`, a Set
// of upper-case letters plus names such as "Shift" and " ". These readers accept
// that Set or a plain record ({ W: true }) so an application can pass either.
// They hold no listeners of their own, so there is nothing to dispose.

/**
 * Purpose: Turn a key set or record into a `(code) => boolean` predicate.
 * Parameters: keys — a Set of key names, a record of key name to truthy, or null.
 * Return value: a function telling whether a key name is held.
 * Side effects: none.
 */
export function keyPredicate(keys) {
  if (keys instanceof Set) return (code) => keys.has(code);
  return (code) => !!keys?.[code];
}

/**
 * Purpose: Whether any of the named keys is held.
 * Parameters: keys — Set or record; codes — key names.
 * Return value: boolean.
 * Side effects: none.
 */
export function anyKeyDown(keys, codes) {
  const down = keyPredicate(keys);
  for (const code of codes || []) if (down(code)) return true;
  return false;
}

/**
 * Purpose: A key pair as one axis: each held positive key adds 1, each held
 *   negative key subtracts 1, clamped to [-1, 1]. Opposite keys cancel.
 * Parameters: keys — Set or record; spec — { negative: string[], positive: string[] }.
 * Return value: -1, 0 or 1.
 * Side effects: none.
 */
export function keyAxis(keys, { negative = [], positive = [] } = {}) {
  const down = keyPredicate(keys);
  let value = 0;
  if (negative.some(down)) value -= 1;
  if (positive.some(down)) value += 1;
  return value;
}
