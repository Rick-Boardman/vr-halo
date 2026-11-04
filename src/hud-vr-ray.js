// SPDX-License-Identifier: Apache-2.0
// VR ray and collision-dot visualization factories for the HUD system.
// Extracted from hud.js to isolate reusable WebGL object construction.

import * as THREE from "three";
import { clamp } from "./scalar-math.js";

/** Default ray length in meters for VR controller rays. */
export const DEFAULT_RAY_LEN = 24;

const RAY_MIN_LEN = 0.02;
const RAY_MAX_LEN = 500;
const RAY_LEN_EPSILON = 0.002;

const COLLISION_DOT_RADIUS = 0.04;
const COLLISION_DOT_SEGMENTS = 12;
const COLLISION_DOT_OPACITY = 0.9;
const COLLISION_DOT_RENDER_ORDER = 1001;

// Module-scoped temp vectors (avoid per-frame allocation).
const _rayEnd = new THREE.Vector3();
const _dotTmp = new THREE.Vector3();

/**
 * Create a world-space line whose endpoints can be updated each frame.
 * @param {THREE.Material} material Line material
 * @returns {{ line: THREE.Line, pos: Float32Array, attr: THREE.BufferAttribute }}
 */
export function makeDynamicWorldLine(material) {
  const pos = new Float32Array(6);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", attr);
  geo.computeBoundingSphere();
  const line = new THREE.Line(geo, material);
  line.frustumCulled = false;
  return { line, pos, attr };
}

/**
 * Update dynamic world line endpoints from an origin + direction + length.
 * @param {{ pos: Float32Array, attr: THREE.BufferAttribute } | null} lineObj
 * @param {THREE.Vector3} origin Ray origin
 * @param {THREE.Vector3} dir   Normalized ray direction
 * @param {number} len          Desired length (meters)
 */
export function setDynamicWorldLine(lineObj, origin, dir, len) {
  if (!lineObj) return;
  const L = Number.isFinite(len) ? len : DEFAULT_RAY_LEN;
  const clamped = clamp(L, RAY_MIN_LEN, RAY_MAX_LEN);
  _rayEnd.copy(origin).addScaledVector(dir, clamped);
  const p = lineObj.pos;
  p[0] = origin.x;
  p[1] = origin.y;
  p[2] = origin.z;
  p[3] = _rayEnd.x;
  p[4] = _rayEnd.y;
  p[5] = _rayEnd.z;
  lineObj.attr.needsUpdate = true;
}

/**
 * Create a fixed-length ray line pointing along local −Z.
 * @param {THREE.Material} material Line material
 * @returns {THREE.Line}
 */
export function makeRayLine(material) {
  const positions = new Float32Array([0, 0, 0, 0, 0, -DEFAULT_RAY_LEN]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(geom, material);
  line.frustumCulled = false;
  line.userData._positions = positions;
  line.userData._len = DEFAULT_RAY_LEN;
  return line;
}

/**
 * Update the visible length of a ray line created by makeRayLine.
 * @param {THREE.Line | null} line
 * @param {number} len Desired length in meters
 */
export function setRayLineLength(line, len) {
  if (!line) return;
  const next = Number.isFinite(len) ? len : DEFAULT_RAY_LEN;
  const clamped = clamp(next, RAY_MIN_LEN, RAY_MAX_LEN);
  if (Math.abs((line.userData._len ?? 0) - clamped) < RAY_LEN_EPSILON) return;
  line.userData._len = clamped;
  const pos = line.userData._positions;
  if (!pos) return;
  pos[5] = -clamped;
  line.geometry.attributes.position.needsUpdate = true;
}

/**
 * Create a collision dot sphere mesh for showing where a ray hits a surface.
 * @param {number} color Hex color for the dot material
 * @returns {THREE.Mesh}
 */
export function makeCollisionDot(color) {
  const geo = new THREE.SphereGeometry(
    COLLISION_DOT_RADIUS,
    COLLISION_DOT_SEGMENTS,
    COLLISION_DOT_SEGMENTS,
  );
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: COLLISION_DOT_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = COLLISION_DOT_RENDER_ORDER;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Position a collision dot along a controller's forward ray at distance t.
 * @param {THREE.Mesh | null} dot    Collision dot mesh
 * @param {THREE.Object3D | null} controller XR controller providing ray origin/direction
 * @param {number} t                 Ray parameter (distance in meters)
 * @param {boolean} visible          Whether to show the dot
 */
export function setCollisionDotFromRay(dot, controller, t, visible) {
  if (!dot) return;
  dot.visible = !!visible;
  if (visible && controller && Number.isFinite(t) && t > 0) {
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(_dotTmp);
    const quat = new THREE.Quaternion();
    controller.getWorldQuaternion(quat);
    // Controller forward is local −Z; transform to world and normalize.
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
    // Position dot at rayOrigin + rayDir * t.
    dot.position.copy(_dotTmp).addScaledVector(dir, t);
  }
}

/**
 * Position a collision dot at an explicit world position.
 * @param {THREE.Mesh | null} dot       Collision dot mesh
 * @param {THREE.Vector3 | null} worldPos Target position
 * @param {boolean} visible              Whether to show the dot
 */
export function setCollisionDotAt(dot, worldPos, visible) {
  if (!dot) return;
  dot.visible = !!visible;
  if (visible && worldPos) {
    dot.position.copy(worldPos);
  }
}
