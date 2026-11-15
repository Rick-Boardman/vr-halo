// SPDX-License-Identifier: Apache-2.0
/** Convert world points to the HUD's layout, using the rig sphere in XR.
 * The root's current ancestry includes rig turns and optional path mounts.
 * Returns null for invalid points or a point at the sphere centre.
 */
export function createHudWorldPointRuntime({ THREE, renderer, camera, hud, getVrYawPerScreen, getVrPitchPerScreen }) {
  const point = new THREE.Vector3();
  return function projectWorldPointToHud(worldPoint) {
    if (![worldPoint?.x, worldPoint?.y, worldPoint?.z].every(Number.isFinite)) return null;
    point.copy(worldPoint);
    if (renderer.xr.isPresenting) {
      hud.root.updateWorldMatrix(true, false);
      hud.root.worldToLocal(point);
      if (point.lengthSq() < 1e-12) return null;
      return {
        x: hud.layoutW * (0.5 + Math.atan2(point.x, -point.z) / getVrYawPerScreen()),
        y: hud.layoutH * (0.5 - Math.atan2(point.y, Math.hypot(point.x, point.z)) / getVrPitchPerScreen()),
      };
    }
    camera.updateWorldMatrix(true, false);
    point.project(camera);
    if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
    return { x: (point.x + 1) * 0.5 * hud.layoutW, y: (1 - point.y) * 0.5 * hud.layoutH };
  };
}
