// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD placement helpers for parent anchoring and per-frame VR/desktop root placement.
 * @param {object} [options={}] Placement runtime dependencies.
 * @param {object} options.THREE Three.js namespace used to allocate internal placement vectors.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to branch VR-vs-desktop placement logic.
 * @param {{ root?: { position?: any, rotation?: any, updateMatrixWorld?: (force?: boolean) => void, getWorldQuaternion?: (target: any) => void, getWorldPosition?: (target: any) => void, removeFromParent?: () => void }, layoutW?: number, layoutH?: number }} options.hud Shared HUD state model.
 * @param {{ add?: (object: unknown) => void, updateMatrixWorld?: (force?: boolean) => void, worldToLocal?: (vec: any) => void } | null} [options.scene=null] Scene fallback parent for VR anchoring.
 * @param {unknown} [options.vrAnchor] Optional VR anchor object for placement parenting.
 * @param {unknown} [options.desktopAnchor] Optional desktop anchor object for placement parenting.
 * @param {unknown} [options.camera] Fallback desktop parent when no desktop anchor is provided.
 * @param {(anchor: unknown) => unknown} options.resolveVrAnchorForRigPitch Helper resolving rig-pitch-adjusted VR anchor parents.
 * @param {() => { updateMatrixWorld?: (force?: boolean) => void, getWorldPosition?: (target: any) => void, getWorldQuaternion?: (target: any) => void }} options.getHeadCameraForHud Head-camera resolver used for VR anchor capture and head-up calculations.
 * @param {() => void} options.markDirty Callback invoked when anchor parent changes.
 * @param {number} options.desktopDistanceM Desktop HUD distance in meters.
 * @returns {{ setHudAnchorForMode: () => void, updatePlacementForMode: (state: { vrHeadQuatW: any, vrHeadUpW: any, vrHudQuatW: any, vrHudQuatWInv: any, vrHeadUpL: any, vrSphereCenterW: any }) => void }} Placement helpers for mode transitions and per-frame updates.
 * Side effects: reparents HUD root under mode-specific anchors, mutates HUD root transforms, and updates shared VR orientation vectors.
 */
export function createHudPlacementRuntime({
  THREE,
  renderer,
  hud,
  scene = null,
  vrAnchor,
  desktopAnchor,
  camera,
  resolveVrAnchorForRigPitch,
  getHeadCameraForHud,
  markDirty,
  desktopDistanceM,
} = {}) {
  let hudParent = null;
  const vrHudAnchorLocalPos = new THREE.Vector3(0, 0, 0);
  let vrHudAnchorLocalPosValid = false;
  const vrHudPosW = new THREE.Vector3();

  function setHudAnchorForMode() {
    const presenting = !!renderer.xr.isPresenting;
    const vrParent = resolveVrAnchorForRigPitch(vrAnchor) || vrAnchor || scene;

    const nextParent = presenting ? vrParent : desktopAnchor || camera;
    if (!nextParent) return;
    if (hudParent === nextParent) return;
    try {
      hud.root.removeFromParent();
    } catch {
      // no-op
    }
    nextParent.add(hud.root);
    hudParent = nextParent;

    if (presenting) {
      try {
        const headCam = getHeadCameraForHud();
        headCam.updateMatrixWorld(true);
        nextParent.updateMatrixWorld(true);
        headCam.getWorldPosition(vrHudPosW);
        vrHudAnchorLocalPos.copy(vrHudPosW);
        nextParent.worldToLocal(vrHudAnchorLocalPos);
        vrHudAnchorLocalPosValid = true;
      } catch {
        vrHudAnchorLocalPos.set(0, 0, 0);
        vrHudAnchorLocalPosValid = true;
      }
    } else {
      vrHudAnchorLocalPosValid = false;
    }
    markDirty();
  }

  function updatePlacementForMode({
    vrHeadQuatW,
    vrHeadUpW,
    vrHudQuatW,
    vrHudQuatWInv,
    vrHeadUpL,
    vrSphereCenterW,
  } = {}) {
    if (renderer.xr.isPresenting) {
      // VR placement convention: keep HUD root rig-stationary in the anchor parent's
      // local coordinate frame. When valid, we reuse the parent-local capture point
      // sampled during anchor handoff so HUD motion does not inherit headset neck-model drift.
      if (vrHudAnchorLocalPosValid) {
        hud.root.position.copy(vrHudAnchorLocalPos);
      } else {
        hud.root.position.set(0, 0, 0);
      }

      hud.root.rotation.set(0, 0, 0);

      try {
        const headCam = getHeadCameraForHud();
        // 1) Read headset world orientation as quaternion q_head_world.
        headCam.getWorldQuaternion(vrHeadQuatW);
        // 2) Convert world up-axis (0,1,0) into headset-up in world space:
        //    up_head_world = q_head_world * (0,1,0) * q_head_world^-1.
        vrHeadUpW.set(0, 1, 0).applyQuaternion(vrHeadQuatW).normalize();
        hud.root.updateMatrixWorld(true);
        // 3) Read HUD root world orientation q_hud_world and compute its inverse.
        hud.root.getWorldQuaternion(vrHudQuatW);
        vrHudQuatWInv.copy(vrHudQuatW).invert();
        // 4) Convert headset-up from world to HUD-local coordinates:
        //    up_head_local = q_hud_world^-1 * up_head_world * q_hud_world.
        vrHeadUpL.copy(vrHeadUpW).applyQuaternion(vrHudQuatWInv).normalize();
        // 5) Cache HUD sphere center in world space for billboard/ray math consumers.
        hud.root.getWorldPosition(vrSphereCenterW);
      } catch {
        vrHeadUpL.set(0, 1, 0);
      }
    } else {
      hud.root.position.set(0, 0, -desktopDistanceM);
      hud.root.rotation.set(0, 0, 0);
    }
  }

  return {
    setHudAnchorForMode,
    updatePlacementForMode,
  };
}
