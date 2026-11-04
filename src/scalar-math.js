// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Clamp a numeric value into an inclusive range.
 * @param {number} value Candidate numeric value.
 * @param {number} min Inclusive minimum bound.
 * @param {number} max Inclusive maximum bound.
 * @returns {number} The input value clamped to the inclusive [min, max] range.
 * Side effects: none.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Purpose: Linearly interpolate between two numeric values using a normalized progress value.
 * @param {number} start Starting numeric value.
 * @param {number} end Ending numeric value.
 * @param {number} t Interpolation factor where 0 returns start and 1 returns end.
 * @returns {number} Interpolated numeric value between start and end.
 * Side effects: none.
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

const SPHERE_BOUNDARY_RADIUS_EPSILON = 1e-6;
const SPHERE_BOUNDARY_VELOCITY_DAMPING = 0.6;

/**
 * Purpose: Clamp one indexed point stored in parallel position and velocity arrays to a spherical boundary around a center point.
 * @param {object} options Indexed spherical-boundary inputs.
 * @param {number} options.index Array index of the point to test and clamp.
 * @param {Float32Array | number[]} options.px X-position array.
 * @param {Float32Array | number[]} options.py Y-position array.
 * @param {Float32Array | number[]} options.pz Z-position array.
 * @param {Float32Array | number[]} options.vx X-velocity array.
 * @param {Float32Array | number[]} options.vy Y-velocity array.
 * @param {Float32Array | number[]} options.vz Z-velocity array.
 * @param {{ x: number, y: number, z: number }} options.center Sphere center used as the clamp origin.
 * @param {number} options.radius Inclusive sphere radius.
 * @param {number} [options.radiusEpsilon=SPHERE_BOUNDARY_RADIUS_EPSILON] Small positive epsilon added to the radial length before division to avoid zero-distance projection singularities.
 * @param {number} [options.velocityDamping=SPHERE_BOUNDARY_VELOCITY_DAMPING] Factor multiplied into the indexed velocity components when the point is projected back to the boundary.
 * @returns {boolean} True when the indexed point lay outside the sphere and was projected back to the boundary.
 * @sideEffects Mutates the provided position and velocity arrays at `index` when the point exceeds the spherical boundary.
 */
export function clampIndexedPointToSphereBoundary({
  index,
  px,
  py,
  pz,
  vx,
  vy,
  vz,
  center,
  radius,
  radiusEpsilon = SPHERE_BOUNDARY_RADIUS_EPSILON,
  velocityDamping = SPHERE_BOUNDARY_VELOCITY_DAMPING,
}) {
  if (!Number.isFinite(radius) || radius <= 0) return false;

  const ox = px[index] - center.x;
  const oy = py[index] - center.y;
  const oz = pz[index] - center.z;
  // r = sqrt(ox^2 + oy^2 + oz^2) + epsilon keeps the radial divisor non-zero
  // when the point is extremely close to the center before projection.
  const radiusFromCenter =
    Math.sqrt(ox * ox + oy * oy + oz * oz) + radiusEpsilon;
  if (radiusFromCenter <= radius) return false;

  // s = radius / r projects the offset vector onto the sphere surface while
  // preserving its direction away from the center.
  const surfaceScale = radius / radiusFromCenter;
  px[index] = center.x + ox * surfaceScale;
  py[index] = center.y + oy * surfaceScale;
  pz[index] = center.z + oz * surfaceScale;
  vx[index] *= velocityDamping;
  vy[index] *= velocityDamping;
  vz[index] *= velocityDamping;
  return true;
}
