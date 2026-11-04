// SPDX-License-Identifier: Apache-2.0
const HIT_MARKER_RADIUS_M = 0.012;
const HIT_MARKER_WIDTH_SEGMENTS = 10;
const HIT_MARKER_HEIGHT_SEGMENTS = 10;

/**
 * Create shared HUD world-space hit-marker meshes for VR pointer feedback.
 * @param {object} [options={}] Hit-marker runtime dependencies.
 * @param {object} options.THREE Three.js namespace used for geometry, materials, and meshes.
 * @param {{ add?: (object: unknown) => void }} options.scene Scene receiving hit-marker meshes.
 * @param {number} options.hitMarkerRenderOrder Render order used so markers draw above panel surfaces.
 * @param {number} options.primaryColor Color for the primary controller hit marker.
 * @param {number} options.secondaryColor Color for the secondary controller hit marker.
 * @returns {{ hitMarker0: any, hitMarker1: any }} Created marker meshes for the primary and secondary controller paths.
 * Side effects: allocates geometry/materials/meshes and attaches marker meshes to the scene.
 */
export function createHudHitMarkersRuntime({
  THREE,
  scene,
  hitMarkerRenderOrder,
  primaryColor,
  secondaryColor,
} = {}) {
  const hitMarkerGeometry = new THREE.SphereGeometry(
    HIT_MARKER_RADIUS_M,
    HIT_MARKER_WIDTH_SEGMENTS,
    HIT_MARKER_HEIGHT_SEGMENTS
  );
  const hitMarkerMaterial0 = new THREE.MeshBasicMaterial({
    color: primaryColor,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const hitMarkerMaterial1 = new THREE.MeshBasicMaterial({
    color: secondaryColor,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const hitMarker0 = new THREE.Mesh(hitMarkerGeometry, hitMarkerMaterial0);
  const hitMarker1 = new THREE.Mesh(hitMarkerGeometry, hitMarkerMaterial1);
  hitMarker0.renderOrder = hitMarkerRenderOrder;
  hitMarker1.renderOrder = hitMarkerRenderOrder;
  hitMarker0.visible = false;
  hitMarker1.visible = false;

  scene.add(hitMarker0);
  scene.add(hitMarker1);

  return {
    hitMarker0,
    hitMarker1,
  };
}
