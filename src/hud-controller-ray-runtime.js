// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers that derive world-space controller rays.
 * @param {object} [options={}] Controller-ray runtime dependencies.
 * @param {{ x?: number, y?: number, z?: number }} options.rayForwardNegZ Canonical local forward vector (typically negative Z) used for controller ray direction.
 * @param {any} options.rayTmpQuatTarget Scratch quaternion reused to avoid per-frame allocations while reading controller pose.
 * @returns {{ getWorldRayForController: (controller: { updateMatrixWorld?: (force?: boolean) => void, getWorldPosition?: (target: any) => void, getWorldQuaternion?: (target: any) => void }, originOut: { copy?: (value: any) => void }, dirOut: { copy?: (value: any) => { applyQuaternion?: (quat: any) => { normalize?: () => void } } }) => void }} API that resolves world-space origin/direction rays for controller interactions.
 * Side effects: mutates `originOut`, `dirOut`, and the shared scratch quaternion.
 */
export function createHudControllerRayRuntime({
  rayForwardNegZ,
  rayTmpQuatTarget,
} = {}) {
  function getWorldRayForController(controller, originOut, dirOut) {
    controller.updateMatrixWorld(true);
    controller.getWorldPosition(originOut);
    controller.getWorldQuaternion(rayTmpQuatTarget);
    dirOut.copy(rayForwardNegZ).applyQuaternion(rayTmpQuatTarget).normalize();
  }

  return {
    getWorldRayForController,
  };
}
