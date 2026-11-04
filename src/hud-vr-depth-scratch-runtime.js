// SPDX-License-Identifier: Apache-2.0
/**
 * Create reusable scratch vectors for VR depth push/pull interaction math.
 * @param {object} [options={}] VR depth scratch dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate vectors.
 * @returns {{ vrDepthRayOriginW: any, vrDepthRayDirW: any, vrDepthDesiredPointW: any, vrDepthCenterW: any, vrDepthCenterL: any, vrDepthToHeadW: any, vrDepthUpW: any, vrDepthRightW: any }} Scratch vector bag reused while adjusting VR window depth.
 * Side effects: allocates vector instances.
 */
export function createHudVrDepthScratchRuntime({ THREE } = {}) {
  return {
    vrDepthRayOriginW: new THREE.Vector3(),
    vrDepthRayDirW: new THREE.Vector3(),
    vrDepthDesiredPointW: new THREE.Vector3(),
    vrDepthCenterW: new THREE.Vector3(),
    vrDepthCenterL: new THREE.Vector3(),
    vrDepthToHeadW: new THREE.Vector3(),
    vrDepthUpW: new THREE.Vector3(),
    vrDepthRightW: new THREE.Vector3(),
  };
}
