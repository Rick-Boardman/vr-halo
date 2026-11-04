// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers for correcting controller/grip parent transforms.
 * @param {object} [options={}] Controller-parenting runtime dependencies.
 * @param {{ add?: (obj: any) => void } | null} [options.desiredControllerParent=null] Target parent object for resolved controller rays and grips.
 * @returns {{ reparentResolvedControllers: (controllersResolved: { ray0?: any, ray1?: any, grip0?: any, grip1?: any } | null | undefined) => void }} API that reparents resolved controller/grip objects to the desired anchor.
 * Side effects: mutates scene graph parenting for controller and grip objects.
 */
export function createHudControllerParentingRuntime({
  desiredControllerParent = null,
} = {}) {
  function reparentResolvedControllers(controllersResolved) {
    // If controllers were provided by the app, they may be parented incorrectly (e.g. yaw-only).
    // Reparent once so controller poses (and attached ray visuals) stay consistent across apps.
    try {
      if (controllersResolved && desiredControllerParent) {
        const maybe = [
          controllersResolved.ray0,
          controllersResolved.ray1,
          controllersResolved.grip0,
          controllersResolved.grip1,
        ];
        for (const obj of maybe) {
          if (!obj || !obj.isObject3D) continue;
          if (obj.parent === desiredControllerParent) continue;
          try {
            obj.parent?.remove?.(obj);
          } catch {
            // no-op
          }
          desiredControllerParent.add(obj);
        }
      }
    } catch {
      // no-op
    }
  }

  return {
    reparentResolvedControllers,
  };
}
