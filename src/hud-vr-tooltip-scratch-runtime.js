// SPDX-License-Identifier: Apache-2.0
/**
 * Create reusable VR tooltip scratch vectors/quaternions for HUD world-to-local mapping.
 * @param {object} [options={}] VR tooltip scratch dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate vectors and quaternions.
 * @returns {{ vrTooltipHudPosW: any, vrTooltipHudQuatW: any, vrTooltipHudQuatWInv: any, vrTooltipLocalW: any, vrTooltipDirL: any }} Scratch bag reused while projecting tooltip anchors into HUD-local space.
 * Side effects: allocates vector/quaternion instances.
 */
export function createHudVrTooltipScratchRuntime({ THREE } = {}) {
  return {
    vrTooltipHudPosW: new THREE.Vector3(),
    vrTooltipHudQuatW: new THREE.Quaternion(),
    vrTooltipHudQuatWInv: new THREE.Quaternion(),
    vrTooltipLocalW: new THREE.Vector3(),
    vrTooltipDirL: new THREE.Vector3(),
  };
}
