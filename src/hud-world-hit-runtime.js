// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers for resolving controller/world raycast hit distance and point.
 * @param {object} [options={}] World-hit runtime dependencies.
 * @param {() => Array<any> | null | undefined} [options.getWorldRaycastTargets] Resolver for world-space raycast targets.
 * @param {() => { ray: { origin: any, direction: any }, near: number, far: number, camera?: any, intersectObjects: (targets: Array<any>, recursive: boolean) => Array<any> } | null | undefined} [options.getRaycaster] Resolver for the active shared HUD raycaster.
 * @param {() => any} [options.getHeadCameraForHud] Resolver for the camera used during sprite/world hit tests.
 * @returns {{ getWorldHitDistanceAndPoint: (origin: any, dir: any, outPoint?: any) => number | null }} API that returns the nearest world hit distance and optional point.
 * Side effects: mutates raycaster origin/direction/near/far/camera before intersection tests.
 */
export function createHudWorldHitRuntime({
  getWorldRaycastTargets,
  getRaycaster,
  getHeadCameraForHud,
} = {}) {
  function getWorldHitDistanceAndPoint(origin, dir, outPoint) {
    const targets = getWorldRaycastTargets?.();
    const raycaster = getRaycaster?.();
    if (!targets || !targets.length || !raycaster) return null;

    raycaster.ray.origin.copy(origin);
    raycaster.ray.direction.copy(dir);
    raycaster.near = 0;
    raycaster.far = 500;

    // Required for raycasting against THREE.Sprite (and some billboard helpers).
    // In XR, use the head camera for correct sprite-facing behavior.
    try {
      raycaster.camera = getHeadCameraForHud?.();
    } catch {
      // no-op
    }

    const hits = raycaster.intersectObjects(targets, true);
    const hit = hits && hits.length ? hits[0] : null;
    if (hit && hit.point) {
      if (outPoint) outPoint.copy(hit.point);
      const distance = Number(hit.distance);
      return Number.isFinite(distance) && distance > 0
        ? distance
        : origin.distanceTo(hit.point);
    }
    return null;
  }

  return {
    getWorldHitDistanceAndPoint,
  };
}
