// SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------
// hud-vr-depth-drag-runtime.js — VR depth push/pull during move-drag
// -----------------------------------------------------------------
// Extracted from hud.js. Handles three VR depth concerns:
// 1. clampVrDepthForWindow — enforce min/max radius bounds.
// 2. adjustDepthDuringDrag — ray-locked or legacy push/pull.
// 3. updateDepthIndicator — live depth feedback text.
//
// These are called each frame during the VR update pass.
// -----------------------------------------------------------------

import { clamp } from "./scalar-math.js";
import { HUD_WINDOW_TITLE_HEIGHT_PX } from "./hud-layout-policy.js";

/**
 * Factory for the VR depth drag runtime.
 *
 * @param {object} deps
 * @param {object} deps.hud - HUD state object.
 * @param {number} deps.vrDistance - Base VR sphere radius.
 * @param {number} deps.vrDepthMinRadius - Minimum allowed VR sphere radius.
 * @param {number} deps.vrDepthMaxRadius - Maximum allowed VR sphere radius.
 * @param {Function} deps.vrYawPerScreen - Returns yaw span per full layout width.
 * @param {Function} deps.vrPitchPerScreen - Returns pitch span per full layout height.
 * @param {Function} deps.getHeadCameraForHud - Returns the head camera for HUD transforms.
 * @param {Function} deps.getWorldRayForController - Fills origin/dir from a controller.
 * @param {Function} deps.getAnyThumbstickForwardBackForDepth - Returns thumbstick axis value.
 * @param {Function} deps.getActiveUiController - Returns the active UI controller.
 * @param {Function} deps.getDragWindowKey - Returns the current drag window key.
 * @param {Function} deps.getDragMode - Returns the current drag mode.
 * @param {Function} deps.getHudInteractionActive - Returns whether HUD interaction is active.
 * @param {Function} deps.getVrMoveDragRayHasAnchor - Returns whether ray anchor is set.
 * @param {Function} deps.getVrMoveDragRayT - Returns the anchored ray distance.
 * @param {Function} deps.setVrMoveDragRayT - Sets the anchored ray distance.
 * @param {Function} deps.getVrMoveDragGrabU - Returns the grab U offset.
 * @param {Function} deps.getVrMoveDragGrabV - Returns the grab V offset.
 * @param {Function} deps.setVrMoveDragUseTheoreticalBasisThisFrame - Sets theoretical basis flag.
 * @param {Function} deps.setVrMoveDragDepthAdjustedThisFrame - Sets depth-adjusted flag.
 * @param {Function} deps.markDirty - Marks HUD as needing re-render.
 * @param {object} deps.vrDepthScratch - Scratch vectors from createHudVrDepthScratchRuntime.
 * @param {object} deps.vrHeadPosW - Scratch THREE.Vector3 for head position.
 * @param {object} deps.vrHudPosW - Scratch THREE.Vector3 for HUD position.
 * @param {object} deps.vrHudQuatW - Scratch THREE.Quaternion for HUD orientation.
 * @param {object} deps.vrHudQuatWInv - Scratch THREE.Quaternion (inverse HUD).
 * @param {object} deps.vrGravityUpL - Scratch THREE.Vector3 for gravity up in local space.
 * @param {object} deps.vrHudMatrixInv - Scratch THREE.Matrix4 for inverse HUD matrix.
 * @returns {{ updateVrDepth: Function }}
 */
export function createHudVrDepthDragRuntime({
  hud,
  vrDistance,
  vrDepthMinRadius,
  vrDepthMaxRadius,
  vrYawPerScreen,
  vrPitchPerScreen,
  getHeadCameraForHud,
  getWorldRayForController,
  getAnyThumbstickForwardBackForDepth,
  getActiveUiController,
  getDragWindowKey,
  getDragMode,
  getHudInteractionActive,
  getVrMoveDragRayHasAnchor,
  getVrMoveDragRayT,
  setVrMoveDragRayT,
  getVrMoveDragGrabU,
  getVrMoveDragGrabV,
  setVrMoveDragUseTheoreticalBasisThisFrame,
  setVrMoveDragDepthAdjustedThisFrame,
  markDirty,
  vrDepthScratch,
  vrHeadPosW,
  vrHudPosW,
  vrHudQuatW,
  vrHudQuatWInv,
  vrGravityUpL,
  vrHudMatrixInv,
}) {
  const {
    vrDepthRayOriginW,
    vrDepthRayDirW,
    vrDepthDesiredPointW,
    vrDepthCenterW,
    vrDepthCenterL,
    vrDepthToHeadW,
    vrDepthUpW,
    vrDepthRightW,
  } = vrDepthScratch;

  /** Approximate title-bar Z offset used as the base plane for VR depth. */
  const BASE_Z = 0.002;

  /**
   * Enforce min/max radius bounds on a single window's vrZ.
   * @param {object|null} win - Window state object (must have writable vrZ).
   */
  function clampVrDepthForWindow(win) {
    if (!win) return;
    const curVrZ = Number(win.vrZ ?? 0);
    const curRadius = vrDistance - (Number.isFinite(curVrZ) ? curVrZ : 0) - BASE_Z;
    let nextRadius = curRadius;
    if (Number.isFinite(vrDepthMinRadius)) nextRadius = Math.max(nextRadius, vrDepthMinRadius);
    if (Number.isFinite(vrDepthMaxRadius) && vrDepthMaxRadius !== Infinity)
      nextRadius = Math.min(nextRadius, vrDepthMaxRadius);
    if (nextRadius !== curRadius) {
      win.vrZ = vrDistance - nextRadius - BASE_Z;
    }
  }

  /**
   * Enforce depth bounds on all windows and virtual windows.
   */
  function enforceDepthBounds() {
    for (const k of hud.ui?.order ?? []) {
      clampVrDepthForWindow(hud.ui?.windows?.[k]);
    }
    // Virtual windows (buttons/overlays anchored in the same spherical HUD space)
    // can also carry vrZ.
    const vw = hud.ui?._vrVirtualWindows;
    if (vw) {
      for (const w of Object.values(vw)) clampVrDepthForWindow(w);
    }
  }

  /**
   * Ray-locked depth: push/pull follows the controller ray trajectory.
   * @returns {boolean} true if ray-locked depth was successfully applied.
   */
  function applyRayLockedDepth(w, axisFB, speedMps, dt) {
    if (!getVrMoveDragRayHasAnchor()) return false;
    try {
      let rayT = getVrMoveDragRayT() + (-axisFB) * speedMps * dt;
      if (!Number.isFinite(rayT)) rayT = 0;
      rayT = clamp(rayT, 0.12, 50);
      setVrMoveDragRayT(rayT);
      getWorldRayForController(getActiveUiController(), vrDepthRayOriginW, vrDepthRayDirW);
      vrDepthDesiredPointW.copy(vrDepthRayDirW).multiplyScalar(rayT).add(vrDepthRayOriginW);
      const headCam = getHeadCameraForHud();
      headCam.updateMatrixWorld(true);
      headCam.getWorldPosition(vrHeadPosW);
      hud.root.updateMatrixWorld(true);
      const hudMatrix = hud.root.matrixWorld;
      vrHudPosW.setFromMatrixPosition(hudMatrix);
      vrHudQuatW.setFromRotationMatrix(hudMatrix);
      vrHudQuatWInv.copy(vrHudQuatW).invert();
      vrDepthUpW.copy(vrGravityUpL).applyQuaternion(vrHudQuatW).normalize();
      vrDepthToHeadW.copy(vrHeadPosW).sub(vrDepthDesiredPointW);
      if (vrDepthToHeadW.lengthSq() > 1e-10) vrDepthToHeadW.normalize();
      else vrDepthToHeadW.set(0, 0, 1);
      vrDepthRightW.crossVectors(vrDepthUpW, vrDepthToHeadW);
      if (vrDepthRightW.lengthSq() < 1e-10) vrDepthRightW.set(1, 0, 0);
      else vrDepthRightW.normalize();
      vrDepthUpW.crossVectors(vrDepthToHeadW, vrDepthRightW).normalize();
      vrDepthCenterW.copy(vrDepthDesiredPointW)
        .addScaledVector(vrDepthRightW, -getVrMoveDragGrabU())
        .addScaledVector(vrDepthUpW, -getVrMoveDragGrabV());
      vrHudMatrixInv.copy(hudMatrix).invert();
      vrDepthCenterL.copy(vrDepthCenterW).applyMatrix4(vrHudMatrixInv);
      let radius = vrDepthCenterL.length();
      if (Number.isFinite(vrDepthMinRadius)) radius = Math.max(radius, vrDepthMinRadius);
      if (Number.isFinite(vrDepthMaxRadius) && vrDepthMaxRadius !== Infinity) radius = Math.min(radius, vrDepthMaxRadius);
      if (vrDepthCenterL.lengthSq() > 1e-10) vrDepthCenterL.normalize().multiplyScalar(radius);
      else vrDepthCenterL.set(0, 0, -radius);
      const invR = radius > 1e-8 ? 1 / radius : 0;
      const dirX = vrDepthCenterL.x * invR;
      const dirY = vrDepthCenterL.y * invR;
      const dirZ = vrDepthCenterL.z * invR;
      const yaw = Math.atan2(dirX, -dirZ);
      const pitch = Math.asin(clamp(dirY, -1, 1));
      const vrScreenCx = hud.layoutW * 0.5;
      const vrScreenCy = hud.layoutH * 0.5;
      const yawPerPx = vrYawPerScreen() / Math.max(1, hud.layoutW);
      const pitchPerPx = vrPitchPerScreen() / Math.max(1, hud.layoutH);
      const winH = w.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : w.h;
      if (Number.isFinite(yawPerPx) && Number.isFinite(pitchPerPx) && Math.abs(yawPerPx) > 1e-8 && Math.abs(pitchPerPx) > 1e-8) {
        const winCx = vrScreenCx + yaw / yawPerPx;
        const winCy = vrScreenCy - pitch / pitchPerPx;
        if (Number.isFinite(winCx) && Number.isFinite(winCy)) { w.x = winCx - w.w / 2; w.y = winCy - winH / 2; }
      }
      w.vrZ = vrDistance - radius - BASE_Z;
      markDirty();
      return true;
    } catch {
      return false;
    }
  }

  /** Per-frame VR depth adjustment while move-dragging a window. */
  function adjustDepthDuringDrag(dt) {
    const dragWindowKey = getDragWindowKey();
    const hudInteractionActive = getHudInteractionActive();
    const dragMode = getDragMode();

    setVrMoveDragUseTheoreticalBasisThisFrame(false);
    setVrMoveDragDepthAdjustedThisFrame(false);
    if (!(dragWindowKey && hudInteractionActive && dragMode === "move")) return;

    const w = hud.ui?.windows?.[dragWindowKey];
    if (!w) return;

    const axisFB = getAnyThumbstickForwardBackForDepth();
    if (axisFB === 0) return;

    setVrMoveDragUseTheoreticalBasisThisFrame(true);
    const speedMps = 2.4;
    setVrMoveDragDepthAdjustedThisFrame(true);

    if (!applyRayLockedDepth(w, axisFB, speedMps, dt)) {
      // Legacy fallback: spherical radius-only push/pull.
      const curVrZ = Number(w.vrZ ?? 0);
      const curRadius = vrDistance - (Number.isFinite(curVrZ) ? curVrZ : 0) - BASE_Z;
      let nextRadius = curRadius + (-axisFB) * speedMps * dt;
      if (Number.isFinite(vrDepthMinRadius)) nextRadius = Math.max(nextRadius, vrDepthMinRadius);
      if (Number.isFinite(vrDepthMaxRadius) && vrDepthMaxRadius !== Infinity)
        nextRadius = Math.min(nextRadius, vrDepthMaxRadius);
      w.vrZ = vrDistance - nextRadius - BASE_Z;
      markDirty();
    }
  }

  /**
   * Update the VR depth indicator text shown during move-drag.
   * @param {boolean} presenting - Whether the XR session is presenting.
   */
  function updateDepthIndicator(presenting) {
    if (presenting) {
      let depthText = "";
      const dragWindowKey = getDragWindowKey();
      if (dragWindowKey && getHudInteractionActive() && getDragMode() === "move") {
        const w = hud.ui?.windows?.[dragWindowKey];
        if (w) {
          const curVrZ = Number(w.vrZ ?? 0);
          const curRadius =
            vrDistance - (Number.isFinite(curVrZ) ? curVrZ : 0) - BASE_Z;
          let r = curRadius;
          if (Number.isFinite(vrDepthMinRadius)) r = Math.max(r, vrDepthMinRadius);
          depthText = Number.isFinite(vrDepthMinRadius)
            ? `DEPTH: ${r.toFixed(2)}m (min ${vrDepthMinRadius.toFixed(1)})`
            : `DEPTH: ${r.toFixed(2)}m`;
        }
      }
      if (!hud.ui.metrics) hud.ui.metrics = {};
      if (hud.ui.metrics.vrDepthText !== depthText) {
        hud.ui.metrics.vrDepthText = depthText;
        markDirty();
      }
    } else {
      if (hud.ui?.metrics?.vrDepthText) {
        hud.ui.metrics.vrDepthText = "";
        markDirty();
      }
    }
  }

  /**
   * Run all VR depth updates for one frame.
   *
   * @param {number} dt - Frame delta time in seconds.
   * @param {boolean} presenting - Whether the XR session is presenting.
   */
  function updateVrDepth(dt, presenting) {
    if (presenting) {
      enforceDepthBounds();
      adjustDepthDuringDrag(dt);
    } else {
      // Reset per-frame flags when not presenting.
      setVrMoveDragUseTheoreticalBasisThisFrame(false);
      setVrMoveDragDepthAdjustedThisFrame(false);
    }
    updateDepthIndicator(presenting);
  }

  return { updateVrDepth };
}
