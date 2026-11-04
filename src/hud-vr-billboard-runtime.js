// SPDX-License-Identifier: Apache-2.0
import { HUD_WINDOW_TITLE_HEIGHT_PX, HUD_Z_WINDOW_BG } from "./hud-layout-policy.js";
import { createHudVrBasisScratch } from "./hud-vr-basis-runtime.js";

/**
 * Create the VR billboard-basis runtime for HUD windows.
 *
 * Given a window key, computes the world-space billboard frame (center, normal,
 * right, up, quaternion, meters-per-pixel) used by VR pointer picking, resize
 * drag, and depth push/pull.
 *
 * @param {object} deps
 * @param {object} deps.THREE              Three.js namespace (Vector3, Matrix4, Quaternion).
 * @param {object} deps.hud               Shared HUD state — reads ui.windows, ui._vrVirtualWindows,
 *                                         ui.focus, layoutW, layoutH, objects.windows, root.matrixWorld.
 * @param {() => number} deps.getVrYawPerScreen    Returns total yaw span (radians) for the layout width.
 * @param {() => number} deps.getVrPitchPerScreen  Returns total pitch span (radians) for the layout height.
 * @param {number}        deps.vrDistance           VR sphere radius (meters).
 * @param {() => number} deps.getVrMetersPerPxX    Returns horizontal meters-per-pixel at nominal distance.
 * @param {() => number} deps.getVrMetersPerPxY    Returns vertical meters-per-pixel at nominal distance.
 * @param {() => object} deps.getHeadCameraForHud  Returns the camera used as the head pose.
 * @param {(mesh: object) => object} deps.computeRenderTimeMeshMatrix
 *     Returns the render-time world matrix for a given mesh.
 * @param {() => boolean} deps.getVrRenderTimeMatricesCached
 *     Whether render-time HUD matrices have been captured this frame.
 * @param {object} deps.vrRenderTimeHudMatrix  Cached render-time hud.root world matrix (Matrix4).
 * @param {object} deps.vrDir            Shared scratch Vector3 — billboard direction in HUD-local space.
 * @param {object} deps.vrToHead         Shared scratch Vector3 — toward-head unit vector (HUD-local).
 * @param {object} deps.vrUp             Shared scratch Vector3 — billboard up (gravity-locked).
 * @param {object} deps.vrGravityUpL     Shared scratch Vector3 — gravity up in HUD-local space.
 * @param {object} deps.vrRight          Shared scratch Vector3 — billboard right.
 * @param {object} deps.vrBasisMat       Shared scratch Matrix4 — billboard basis matrix.
 * @param {object} deps.vrPlaneQuat      Shared scratch Quaternion — billboard plane orientation.
 * @param {object} deps.vrHudQuatW       Shared scratch Quaternion — HUD root world orientation.
 * @param {object} deps.vrHeadPosW       Shared scratch Vector3 — head world position.
 * @param {object} deps.vrToHeadW        Shared scratch Vector3 — toward-head world vector.
 * @returns {{
 *   getWindowBillboardBasis: (key: string, out: object, zLocalOverride?: number|null, useRenderTimeMesh?: boolean) => object|null,
 *   vrBasis: object
 * }}
 * Side effects: mutates shared scratch vectors during computation; allocates
 * private scratch vectors and a reusable output buffer on creation.
 */
export function createHudVrBillboardRuntime({
  THREE,
  hud,
  getVrYawPerScreen,
  getVrPitchPerScreen,
  vrDistance,
  getVrMetersPerPxX,
  getVrMetersPerPxY,
  getHeadCameraForHud,
  computeRenderTimeMeshMatrix,
  getVrRenderTimeMatricesCached,
  vrRenderTimeHudMatrix,
  // Shared scratch vectors (mutated in place)
  vrDir,
  vrToHead,
  vrUp,
  vrGravityUpL,
  vrRight,
  vrBasisMat,
  vrPlaneQuat,
  vrHudQuatW,
  vrHeadPosW,
  vrToHeadW,
}) {
  // ---- Private scratch vectors (only used by getWindowBillboardBasis) ----
  const _vrRotMat = new THREE.Matrix4();
  const _vrAxisXW = new THREE.Vector3();
  const _vrAxisYW = new THREE.Vector3();
  const _vrTowardHeadW = new THREE.Vector3();

  // Reusable output buffer for billboard basis results.
  const vrBasis = createHudVrBasisScratch({ THREE });

  /**
   * Compute the VR billboard frame for a HUD window.
   *
   * Produces world-space center, normal, right, up, quaternion, and
   * meters-per-pixel values used by picking, resize, and depth systems.
   *
   * When `useRenderTimeMesh` is true and the window has a bg mesh, the basis
   * is derived from the actual rendered mesh matrix (so picking matches what
   * was drawn). Otherwise a theoretical basis is computed from the HUD root
   * matrix and sphere geometry.
   *
   * @param {string} key                Window key.
   * @param {object} out                Mutable output object (center, normal, right, up, quat, mppX, mppY, winCx, winCy).
   * @param {number|null} [zLocalOverride=null]  Override for the local-Z depth layer; null uses the default.
   * @param {boolean} [useRenderTimeMesh=true]   Whether to use the actual mesh matrix when available.
   * @returns {object|null} The populated `out` object, or null if the window is not found.
   * Side effects: mutates `out` and shared scratch vectors.
   */
  function getWindowBillboardBasis(key, out, zLocalOverride = null, useRenderTimeMesh = true) {
    const win = key
      ? hud.ui?.windows?.[key] ?? hud.ui?._vrVirtualWindows?.[key]
      : null;
    if (!win) return null;

    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
    const winH = win.collapsed ? titleH : win.h;
    const winCx = win.x + win.w / 2;
    const winCy = win.y + winH / 2;

    // Yaw/pitch from normalised layout coords → spherical direction.
    const yaw = (winCx / hud.layoutW - 0.5) * getVrYawPerScreen();
    const pitch = (0.5 - winCy / hud.layoutH) * getVrPitchPerScreen();

    // Direction in HUD-local space (hud.root local): yaw around Y, pitch around X.
    vrDir
      .set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
      )
      .normalize();

    const vrZ = Number(win.vrZ ?? 0);
    const dz = Number.isFinite(vrZ) ? vrZ : 0;
    // Match the render-time Z offsets exactly, including the small focus lift.
    // NOTE: Many callers pass a zLocalOverride (e.g., top-most pixel surface).
    const lift = hud.ui?.focus === key ? 0.00035 : 0;
    const baseZ = HUD_Z_WINDOW_BG + lift;
    const zLocal = (Number.isFinite(zLocalOverride) ? Number(zLocalOverride) : HUD_Z_WINDOW_BG) + lift;
    const radius = Math.max(0.12, vrDistance - (dz + zLocal));

    // Roll-locked billboard basis using gravity up (same formula as positionRect).
    vrToHead.copy(vrDir).multiplyScalar(-1).normalize();

    vrUp.copy(vrGravityUpL);
    vrUp.addScaledVector(vrToHead, -vrUp.dot(vrToHead));
    if (vrUp.lengthSq() < 1e-6) {
      vrUp.set(0, 1, 0);
      vrUp.addScaledVector(vrToHead, -vrUp.dot(vrToHead));
    }
    vrUp.normalize();
    vrRight.crossVectors(vrUp, vrToHead).normalize();
    vrUp.crossVectors(vrToHead, vrRight).normalize();

    // Compose billboard basis matrix → quaternion.
    vrBasisMat.makeBasis(vrRight, vrUp, vrToHead);
    vrPlaneQuat.setFromRotationMatrix(vrBasisMat);

    out.quat.copy(vrHudQuatW).multiply(vrPlaneQuat);

    // Get center, normal, right, up directly from the actual mesh's world transform.
    // Use the render-time matrix so picking matches exactly what was rendered.
    const objs = hud.objects?.windows?.[key];
    const bgMesh = objs?.bg;
    if (bgMesh && useRenderTimeMesh) {
      const renderTimeMatrix = computeRenderTimeMeshMatrix(bgMesh);
      out.center.setFromMatrixPosition(renderTimeMatrix);

      // IMPORTANT:
      // renderTimeMatrix includes non-uniform scale (because panels scale with w/h).
      // If we treat it as a pure rotation matrix, we get a skewed quaternion and axes.
      // That manifests as resize coupling (dx affects dy) and apparent depth skew at corners.
      _vrRotMat.copy(renderTimeMatrix);
      _vrRotMat.extractRotation(_vrRotMat);
      vrPlaneQuat.setFromRotationMatrix(_vrRotMat);
      // Mesh local +Z is the normal (facing direction)
      out.normal.set(0, 0, 1).applyQuaternion(vrPlaneQuat).normalize();
      // Mesh local +X is right
      out.right.set(1, 0, 0).applyQuaternion(vrPlaneQuat).normalize();
      // Mesh local +Y is up
      out.up.set(0, 1, 0).applyQuaternion(vrPlaneQuat).normalize();

      // Derive meters-per-pixel from the actual rendered mesh scale.
      // This makes plane-hit -> (px,py) mapping match the visible panel exactly.
      _vrAxisXW.setFromMatrixColumn(renderTimeMatrix, 0);
      _vrAxisYW.setFromMatrixColumn(renderTimeMatrix, 1);
      const widthM = _vrAxisXW.length();
      const heightM = _vrAxisYW.length();
      out.mppX = widthM / Math.max(1, win.w);
      out.mppY = heightM / Math.max(1, winH);

      // If requested, offset center along the panel normal to represent a different
      // layer depth. In this HUD, increasing local z moves the surface toward the head.
      if (Number.isFinite(zLocalOverride) && Math.abs(zLocal - baseZ) > 1e-6) {
        // IMPORTANT: use an explicit "toward head" direction so we can't accidentally
        // push the interaction plane away from the user if the mesh normal is flipped.
        try {
          const headCam = getHeadCameraForHud();
          headCam.updateMatrixWorld(true);
          headCam.getWorldPosition(vrHeadPosW);
          vrToHeadW.copy(vrHeadPosW).sub(out.center);
          if (vrToHeadW.lengthSq() > 1e-10) {
            vrToHeadW.normalize();
            const toward = out.normal.dot(vrToHeadW) >= 0 ? out.normal : _vrTowardHeadW.copy(out.normal).multiplyScalar(-1);
            out.center.addScaledVector(toward, zLocal - baseZ);
          } else {
            out.center.addScaledVector(out.normal, zLocal - baseZ);
          }
        } catch {
          out.center.addScaledVector(out.normal, zLocal - baseZ);
        }
      }
    } else {
      // Fallback for virtual windows without meshes - compute theoretically.
      // Use the cached render-time hud.root matrix.
      out.center.copy(vrDir).multiplyScalar(radius);
      if (getVrRenderTimeMatricesCached()) {
        out.center.applyMatrix4(vrRenderTimeHudMatrix);
      } else {
        out.center.applyMatrix4(hud.root.matrixWorld);
      }
      out.normal.copy(vrToHead).applyQuaternion(vrHudQuatW).normalize();
      out.right.copy(vrRight).applyQuaternion(vrHudQuatW).normalize();
      out.up.copy(vrUp).applyQuaternion(vrHudQuatW).normalize();
      out.mppX = getVrMetersPerPxX();
      out.mppY = getVrMetersPerPxY();
    }
    out.winCx = winCx;
    out.winCy = winCy;

    return out;
  }

  return { getWindowBillboardBasis, vrBasis };
}
