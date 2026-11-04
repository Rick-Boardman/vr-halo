// SPDX-License-Identifier: Apache-2.0
import * as THREE from "three";

const DEFAULT_ROAD_SURFACE_UV_SCALE = 1;

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
