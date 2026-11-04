// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Create reusable HUD geometry helpers for coordinate conversion, VR angular scaling, and rig-anchor resolution.
 * @param {object} [options={}] Geometry helper dependencies.
 * @param {{ playerPitch?: any, playerYaw?: any } | null} [options.rigDebug=null] Optional rig debug object that may expose yaw/pitch nodes.
 * @param {(() => number) | null} [options.getLayoutWidth=null] Callback returning current HUD layout width in pixels.
 * @param {(() => number) | null} [options.getLayoutHeight=null] Callback returning current HUD layout height in pixels.
 * @param {(() => number) | null} [options.getVrScaleW=null] Callback returning current VR surface width in meters.
 * @param {(() => number) | null} [options.getVrScaleH=null] Callback returning current VR surface height in meters.
 * @param {(() => number) | null} [options.getVrDistance=null] Callback returning current VR surface distance in meters.
 * @returns {{
 *   resolveVrAnchorForRigPitch: (anchor: any) => any,
 *   rectToLocalCenter: (x: number, y: number, w: number, h: number) => { lx: number, ly: number },
 *   sizeToLocalScale: (w: number, h: number) => { sx: number, sy: number },
 *   getVrYawPerScreen: () => number,
 *   getVrPitchPerScreen: () => number,
 *   getVrMetersPerPxX: () => number,
 *   getVrMetersPerPxY: () => number,
 * }} HUD geometry helper API bound to the provided callbacks.
 * Side effects: none.
 */
export function createHudGeometryRuntime({
  rigDebug = null,
  getLayoutWidth = null,
  getLayoutHeight = null,
  getVrScaleW = null,
  getVrScaleH = null,
  getVrDistance = null,
} = {}) {
  const readLayoutWidth = typeof getLayoutWidth === "function"
    ? getLayoutWidth
    : () => 1;
  const readLayoutHeight = typeof getLayoutHeight === "function"
    ? getLayoutHeight
    : () => 1;
  const readVrScaleW = typeof getVrScaleW === "function"
    ? getVrScaleW
    : () => 0;
  const readVrScaleH = typeof getVrScaleH === "function"
    ? getVrScaleH
    : () => 0;
  const readVrDistance = typeof getVrDistance === "function"
    ? getVrDistance
    : () => 0;

  function resolveVrAnchorForRigPitch(anchor) {
    // Some rigs expose yaw-only and pitch nodes. For VR stability, parent the HUD
    // and controllers to the pitch node when available so pitch-driven transforms
    // are applied consistently.
    try {
      if (!anchor || !anchor.isObject3D) return null;
      const pitch = rigDebug?.playerPitch;
      const yaw = rigDebug?.playerYaw;
      if (pitch?.isObject3D) {
        if (anchor === pitch) return pitch;
        if (yaw?.isObject3D && anchor === yaw) return pitch;
      }
    } catch {
      // no-op
    }
    return null;
  }

  function rectToLocalCenter(x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const layoutW = Math.max(1, Number(readLayoutWidth()) || 1);
    const layoutH = Math.max(1, Number(readLayoutHeight()) || 1);
    const lx = cx / layoutW - 0.5;
    const ly = 0.5 - cy / layoutH;
    return { lx, ly };
  }

  function sizeToLocalScale(w, h) {
    const layoutW = Math.max(1, Number(readLayoutWidth()) || 1);
    const layoutH = Math.max(1, Number(readLayoutHeight()) || 1);
    return { sx: w / layoutW, sy: h / layoutH };
  }

  function getVrYawPerScreen() {
    // Half-angle tangent: tan(θ/2) = (halfWidth / distance).
    // Full horizontal FOV = 2 · atan(halfWidth / distance).
    // 0.001 floor prevents division by zero when the VR distance is unset.
    const vrScaleW = Number(readVrScaleW()) || 0;
    const vrDistance = Number(readVrDistance()) || 0;
    return 2 * Math.atan((vrScaleW * 0.5) / Math.max(0.001, vrDistance));
  }

  function getVrPitchPerScreen() {
    // Same half-angle tangent formula along the vertical axis.
    const vrScaleH = Number(readVrScaleH()) || 0;
    const vrDistance = Number(readVrDistance()) || 0;
    return 2 * Math.atan((vrScaleH * 0.5) / Math.max(0.001, vrDistance));
  }

  function getVrMetersPerPxX() {
    const vrScaleW = Number(readVrScaleW()) || 0;
    const layoutW = Math.max(1, Number(readLayoutWidth()) || 1);
    return vrScaleW / layoutW;
  }

  function getVrMetersPerPxY() {
    const vrScaleH = Number(readVrScaleH()) || 0;
    const layoutH = Math.max(1, Number(readLayoutHeight()) || 1);
    return vrScaleH / layoutH;
  }

  return {
    resolveVrAnchorForRigPitch,
    rectToLocalCenter,
    sizeToLocalScale,
    getVrYawPerScreen,
    getVrPitchPerScreen,
    getVrMetersPerPxX,
    getVrMetersPerPxY,
  };
}
