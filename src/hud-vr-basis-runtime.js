// SPDX-License-Identifier: Apache-2.0
/**
 * Create the reusable VR billboard basis scratch object for HUD picking math.
 * @param {object} [options={}] VR basis dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate vectors and quaternions.
 * @returns {{ center: any, normal: any, right: any, up: any, quat: any, winCx: number, winCy: number, mppX: number, mppY: number }} Mutable scratch object reused while computing per-window VR billboard basis.
 * Side effects: allocates vector/quaternion instances.
 */
export function createHudVrBasisScratch({ THREE } = {}) {
  return {
    center: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    winCx: 0,
    winCy: 0,
    mppX: 0,
    mppY: 0,
  };
}

/**
 * Create the reusable VR resize-drag basis scratch object for ray-to-layout mapping.
 * @param {object} [options={}] VR resize basis dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate vectors.
 * @returns {{ center: any, normal: any, right: any, up: any, winCx: number, winCy: number, mppX: number, mppY: number }} Mutable scratch object reused while stabilizing VR resize drag interactions.
 * Side effects: allocates vector instances.
 */
export function createHudVrResizeDragBasisScratch({ THREE } = {}) {
  return {
    center: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    winCx: 0,
    winCy: 0,
    mppX: 0,
    mppY: 0,
  };
}
