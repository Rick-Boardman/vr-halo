// SPDX-License-Identifier: Apache-2.0
import * as THREE from "three";

const DEFAULT_ROAD_SURFACE_UV_SCALE = 1;

/**
 * Stitch ordered { leftPoint, rightPoint } cross-sections into a Y-up ribbon.
 * Open strips need at least two pairs; closed strips need three pairs before the seam.
 * Points are finite { x, y, z } coordinates in the application's world units.
 * Each triangle is wound independently so its geometric normal has positive Y,
 * regardless of travel direction or which edge the caller names left. Vertical
 * or degenerate triangles cannot face up and throw RangeError instead.
 *
 * @param {Array<{ leftPoint: { x: number, y: number, z: number }, rightPoint: { x: number, y: number, z: number } }>} edgePairs
 * @param {{ closed?: boolean, uvScale?: number }} [options]
 * @returns {THREE.BufferGeometry} Indexed position/normal/uv geometry. Caller disposes it.
 * U runs from 0 to uvScale by pair index, V from left (0) to right (1).
 * Closed strips duplicate the first pair at U=uvScale for the texture seam;
 * an explicitly repeated final pair is accepted too. Inputs are never mutated.
 * This helper does not sample curves, validate intersections, or generate courses.
 */
export function buildRibbonSurfaceGeometry(edgePairs, { closed = false, uvScale = 1 } = {}) {
  if (!Array.isArray(edgePairs)) {
    throw new TypeError("buildRibbonSurfaceGeometry: edgePairs must be an array");
  }
  if (typeof closed !== "boolean" || !Number.isFinite(uvScale) || !Number.isFinite(Math.fround(uvScale))) {
    throw new TypeError("buildRibbonSurfaceGeometry: expected boolean closed and finite uvScale");
  }
  const pairs = Array.from(edgePairs, (pair, index) => {
    return ["leftPoint", "rightPoint"].map((side) => {
      const point = pair?.[side];
      const coordinates = [point?.x, point?.y, point?.z];
      if (!coordinates.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) {
        throw new TypeError(`buildRibbonSurfaceGeometry: pair ${index} ${side} needs finite Float32 coordinates`);
      }
      return coordinates.map(Math.fround);
    }).flat();
  });
  if (closed && pairs.length > 1 && pairs[0].every((value, i) => value === pairs.at(-1)[i])) {
    pairs.pop();
  }
  if (pairs.length < (closed ? 3 : 2)) {
    throw new RangeError("buildRibbonSurfaceGeometry: need at least two open or three closed pairs");
  }
  if (closed) pairs.push(pairs[0]);

  const positions = new Float32Array(pairs.flat());
  const uvs = [];
  const indices = [];
  const segmentCount = pairs.length - 1;
  function addUpwardTriangle(a, b, c) {
    // Cross-product Y uses only the XZ projection. Check the actual Float32
    // positions that will render, so rounding cannot silently flatten a face.
    const ax = positions[a * 3], az = positions[a * 3 + 2];
    const y = (positions[b * 3 + 2] - az) * (positions[c * 3] - ax)
      - (positions[b * 3] - ax) * (positions[c * 3 + 2] - az);
    if (y === 0 || !Number.isFinite(y)) {
      throw new RangeError("buildRibbonSurfaceGeometry: triangle must have nonzero XZ area to face up");
    }
    indices.push(a, y > 0 ? b : c, y > 0 ? c : b);
  }
  for (let i = 0; i <= segmentCount; i += 1) {
    uvs.push(i / segmentCount * uvScale, 0, i / segmentCount * uvScale, 1);
    if (i < segmentCount) {
      const base = i * 2;
      addUpwardTriangle(base, base + 2, base + 1);
      addUpwardTriangle(base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i += 1) {
    if (!(normals.getY(i) > 0) || ![normals.getX(i), normals.getY(i), normals.getZ(i)].every(Number.isFinite)) {
      geometry.dispose();
      throw new RangeError("buildRibbonSurfaceGeometry: coordinates exceed Float32 normal precision");
    }
  }
  return geometry;
}

/**
 * @param {{ getPointAt(progress: number): any }} curve
 * @param {number} segmentCount
 */
function sampleClosedCurvePoints(curve, segmentCount) {
  const sampledPoints = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    sampledPoints.push(curve.getPointAt(index / segmentCount));
  }

  return sampledPoints;
}

/**
 * Build a horizontal road normal from an XZ-plane tangent vector.
 * Purpose: convert a curve tangent into a Y-up lateral normal that road cross-section builders can use for left and right offsets.
 * @param {{ x: number, z: number }} tangent Tangent vector projected onto the ground plane.
 * @returns {any} Normalized Three.js Vector3 that points perpendicular to the tangent in the horizontal plane.
 * Side effects: none; allocates and returns a new Vector3.
 */
export function createHorizontalCurveNormal(tangent) {
  // In the repo's Y-up convention, a horizontal perpendicular to tangent (x, z)
  // is (-z, 0, x), which rotates the ground-plane direction by +90 degrees.
  return new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
}

/**
 * Build a ribbon-style road surface geometry by stitching cross-sections sampled along a closed curve.
 * Purpose: turn a reusable curve sampler plus cross-section policy into indexed BufferGeometry for shared track and road surfaces.
 * @param {{
 *   curve?: { getPointAt(progress: number): any },
 *   segmentCount?: number,
 *   createRoadCrossSection?: (args: { curve: any, nextPoint: any, point: any, progress: number }) => {
 *     leftPoint: { x: number, y: number, z: number },
 *     rightPoint: { x: number, y: number, z: number },
 *     leftNormal?: { x: number, y: number, z: number },
 *     rightNormal?: { x: number, y: number, z: number }
 *   },
 *   uvScale?: number,
 * }} [options]
 * @returns {{ geometry: any, sampledPoints: Array<any> }} Indexed road-surface geometry plus the sampled curve points used to build it.
 * Side effects: allocates vertex, normal, uv, and index buffers and creates a new BufferGeometry instance.
 */
export function buildRoadSurfaceGeometry({
  curve,
  segmentCount,
  createRoadCrossSection,
  uvScale = DEFAULT_ROAD_SURFACE_UV_SCALE,
} = {}) {
  const sampledPoints = sampleClosedCurvePoints(curve, segmentCount);
  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    const point = sampledPoints[index];
    const nextPoint = sampledPoints[(index + 1) % sampledPoints.length];
    const roadCrossSection = createRoadCrossSection({
      curve,
      nextPoint,
      point,
      progress,
    });

    vertices.push(
      roadCrossSection.leftPoint.x,
      roadCrossSection.leftPoint.y,
      roadCrossSection.leftPoint.z,
      roadCrossSection.rightPoint.x,
      roadCrossSection.rightPoint.y,
      roadCrossSection.rightPoint.z
    );
    uvs.push(progress * uvScale, 0);
    uvs.push(progress * uvScale, 1);

    if (roadCrossSection.leftNormal && roadCrossSection.rightNormal) {
      normals.push(
        roadCrossSection.leftNormal.x,
        roadCrossSection.leftNormal.y,
        roadCrossSection.leftNormal.z,
        roadCrossSection.rightNormal.x,
        roadCrossSection.rightNormal.y,
        roadCrossSection.rightNormal.z
      );
    }

    if (index < segmentCount) {
      const base = index * 2;
      // Each sampled cross-section contributes a left/right edge pair. Join adjacent
      // pairs with two triangles so the ribbon keeps a consistent winding order.
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  if (normals.length === vertices.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  return {
    geometry,
    sampledPoints,
  };
}
