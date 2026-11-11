// SPDX-License-Identifier: Apache-2.0
// VR hands adapter: controller heights relative to each other and to the head.
//
// The application reads the heights (metres, in one reference space) from its
// controllers and camera; this turns them into two device axes the mapping can
// scale. What a raised hand means (steer, lean, brake) is the application's.

/**
 * Purpose: Normalize two controller heights and the head height into axes.
 * Parameters: { leftY, rightY, headY } — metres, same reference space.
 * Return value: { split, drop } or null when any height is missing:
 *   split — leftY minus rightY: positive when the left hand is higher;
 *   drop — how far the hands' midpoint is below the head: positive below.
 * Side effects: none.
 */
export function handsAxes({ leftY, rightY, headY } = {}) {
  if (![leftY, rightY, headY].every(Number.isFinite)) return null;
  return {
    split: leftY - rightY,
    drop: headY - (leftY + rightY) * 0.5,
  };
}
