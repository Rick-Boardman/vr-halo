// SPDX-License-Identifier: Apache-2.0
/**
 * VR pointer picking subsystem for the HUD.
 *
 * Handles raycasting from XR controllers against HUD window colliders,
 * plane-intersection fallbacks for move-drag, yaw/pitch mapping to reduce
 * depth jitter, and dual-controller hover resolution.
 *
 * @module hud-vr-pointer-runtime
 */

import { HUD_WINDOW_TITLE_HEIGHT_PX } from "./hud-layout-policy.js";
import { createHudVrBasisScratch } from "./hud-vr-basis-runtime.js";

/**
 * Create the VR pointer picking runtime.
 *
 * @param {object} deps Factory dependencies (narrow interface).
 * @param {object} deps.THREE Three.js namespace for scratch vector allocation.
 * @param {object} deps.hud HUD state object (vrPointer, ui, objects, root, layoutW, layoutH).
 * @param {object} deps.renderer WebGL renderer (xr.isPresenting).
 * @param {object} deps.controllerRay0 Primary XR controller ray group.
 * @param {object} deps.controllerRay1 Secondary XR controller ray group.
 * @param {object} deps.hitMarker0 Primary hit marker mesh.
 * @param {object} deps.hitMarker1 Secondary hit marker mesh.
 * @param {Function} deps.getWorldRayForController Extracts world-space ray from a controller.
 * @param {Function} deps.getWindowBillboardBasis Computes billboard basis for a window key.
 * @param {Function} deps.getHeadCameraForHud Returns the camera used as VR head reference.
 * @param {Function} deps.rectContainsSlop Hit-tests a point against a rect with slop.
 * @param {Function} deps.clamp Numeric clamp utility.
 * @param {Function} deps.markDirty Marks the HUD as needing a redraw.
 * @param {Function} deps.vrYawPerScreen VR yaw per screen getter.
 * @param {Function} deps.vrPitchPerScreen VR pitch per screen getter.
 * @param {Function} deps.vrMetersPerPxX VR meters-per-pixel X getter.
 * @param {Function} deps.vrMetersPerPxY VR meters-per-pixel Y getter.
 * @param {object} deps.rayOrigin Shared scratch Vector3 for ray origin.
 * @param {object} deps.rayDir Shared scratch Vector3 for ray direction.
 * @param {object} deps.raycaster Shared THREE.Raycaster.
 * @param {object} deps.vrHudPosW Shared scratch Vector3 for HUD world position.
 * @param {object} deps.vrHudQuatW Shared scratch Quaternion for HUD world orientation.
 * @param {object} deps.vrHudQuatWInv Shared scratch Quaternion (inverse HUD orientation).
 * @param {object} deps.vrSphereCenterW Shared scratch Vector3 for sphere center.
 * @param {object} deps.vrHeadUpL Shared scratch Vector3 for head-up in local space.
 * @param {object} deps.vrGravityUpL Shared scratch Vector3 for gravity-up (0,1,0).
 * @param {object} deps.vrHeadPosW Shared scratch Vector3 for head world position.
 * @param {object} deps.vrToHeadW Shared scratch Vector3 for toward-head direction.
 * @param {Function} deps.getActiveUiController Returns the currently active UI controller.
 * @param {Function} deps.setActiveUiController Persists the active UI controller.
 * @param {Function} deps.getDragMode Returns the current drag mode.
 * @param {Function} deps.getDragWindowKey Returns the current drag window key.
 * @param {Function} deps.getVrResizeDragBasisActive Whether a frozen resize basis is active.
 * @param {Function} deps.getVrResizeDragKey Returns the resize-drag window key.
 * @param {Function} deps.getVrResizeDragBasis Returns the frozen resize-drag basis object.
 * @param {Function} deps.getVrMoveDragUseTheoreticalBasisThisFrame Whether to use theoretical basis.
 * @param {Function} deps.getVrMoveDragDepthAdjustedThisFrame Whether depth was adjusted this frame.
 * @param {Function} deps.getVrMoveDragYawPitchKey Returns the yaw-pitch latch key.
 * @param {Function} deps.setVrMoveDragYawPitchKey Sets the yaw-pitch latch key.
 * @param {Function} deps.getVrMoveDragYawPitchHasOffset Whether yaw-pitch offset is latched.
 * @param {Function} deps.setVrMoveDragYawPitchHasOffset Sets the yaw-pitch offset latch.
 * @param {Function} deps.getVrMoveDragYawPitchOffsetX Returns latched X offset.
 * @param {Function} deps.setVrMoveDragYawPitchOffsetX Sets latched X offset.
 * @param {Function} deps.getVrMoveDragYawPitchOffsetY Returns latched Y offset.
 * @param {Function} deps.setVrMoveDragYawPitchOffsetY Sets latched Y offset.
 * @param {Function} deps.getVrMoveDragRayHasAnchor Whether a ray anchor is active.
 * @param {Function} deps.setVrMoveDragRayHasAnchor Sets the ray anchor flag.
 * @param {Function} deps.setVrMoveDragRayT Sets the anchored ray distance.
 * @param {Function} deps.setVrMoveDragGrabU Sets the panel-local grab U offset.
 * @param {Function} deps.setVrMoveDragGrabV Sets the panel-local grab V offset.
 * @returns {{ updateVrPointer: Function }} The VR pointer update function.
 * Side effects: allocates private scratch vectors and a VR basis object.
 */
export function createHudVrPointerRuntime({
  THREE,
  hud,
  renderer,
  controllerRay0,
  controllerRay1,
  hitMarker0,
  hitMarker1,
  getWorldRayForController,
  getWindowBillboardBasis,
  getHeadCameraForHud,
  rectContainsSlop,
  clamp,
  markDirty,
  vrYawPerScreen,
  vrPitchPerScreen,
  vrMetersPerPxX,
  vrMetersPerPxY,
  // Shared scratch vectors (mutated by this runtime, also read elsewhere)
  rayOrigin,
  rayDir,
  raycaster,
  vrHudPosW,
  vrHudQuatW,
  vrHudQuatWInv,
  vrSphereCenterW,
  vrHeadUpL,
  vrGravityUpL,
  vrHeadPosW,
  vrToHeadW,
  // Active controller
  getActiveUiController,
  setActiveUiController,
  // Drag state (read-only from this runtime's perspective)
  getDragMode,
  getDragWindowKey,
  getVrResizeDragBasisActive,
  getVrResizeDragKey,
  getVrResizeDragBasis,
  getVrMoveDragUseTheoreticalBasisThisFrame,
  getVrMoveDragDepthAdjustedThisFrame,
  // Move-drag yaw/pitch latch (read + write)
  getVrMoveDragYawPitchKey,
  setVrMoveDragYawPitchKey,
  getVrMoveDragYawPitchHasOffset,
  setVrMoveDragYawPitchHasOffset,
  getVrMoveDragYawPitchOffsetX,
  setVrMoveDragYawPitchOffsetX,
  getVrMoveDragYawPitchOffsetY,
  setVrMoveDragYawPitchOffsetY,
  // Ray anchor (read + write)
  getVrMoveDragRayHasAnchor,
  setVrMoveDragRayHasAnchor,
  setVrMoveDragRayT,
  setVrMoveDragGrabU,
  setVrMoveDragGrabV,
}) {
  // ---- Private scratch vectors (used only by VR pointer picking) ----
  const _vrPlane = new THREE.Plane();
  const _vrHitPointW = new THREE.Vector3();
  const _vrHitPointL = new THREE.Vector3();
  const _vrBestHitPointW = new THREE.Vector3();
  const _vrBestHitNormalW = new THREE.Vector3();
  const _vrBestHitPointW0 = new THREE.Vector3();
  const _vrBestHitNormalW0 = new THREE.Vector3();
  const _vrBestHitPointW1 = new THREE.Vector3();
  const _vrBestHitNormalW1 = new THREE.Vector3();
  const _vrRayDir0 = new THREE.Vector3();
  const _vrRayDir1 = new THREE.Vector3();
  const _vrRayDirL = new THREE.Vector3();
  const _vrBasis = createHudVrBasisScratch({ THREE });

  // "Front face" for VR interaction when we must fall back to plane-intersection math.
  // Foremost HUD UI elements use z approximately 0.004 in this HUD.
  const VR_INTERACTION_Z_LOCAL = 0.004;

  const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

  function updateVrPointer() {
    hud.vrPointer.active = false;
    hud.vrPointer.windowKey = null;
    hud.vrPointer.controllerRay = null;
    hud.vrPointer.controllerRay0WindowKey = null;
    hud.vrPointer.controllerRay1WindowKey = null;

    // Ensure HUD + window mesh world matrices are current before raycasting.
    // In WebXR, relying on render() timing for matrix updates is fragile.
    try {
      hud.root.updateMatrixWorld(true);
    } catch {
      // no-op
    }

    // Cache HUD world pose (for picking basis).
    // Use the cached render-time matrix so picking matches exactly what was rendered.
    const hudMatrix = hud.root.matrixWorld;
    vrHudPosW.setFromMatrixPosition(hudMatrix);
    vrHudQuatW.setFromRotationMatrix(hudMatrix);
    vrHudQuatWInv.copy(vrHudQuatW).invert();
    vrSphereCenterW.copy(vrHudPosW);
    // Gravity-level: lock roll reference to local +Y.
    // This keeps panel roll stable and decoupled from locomotion/rig transforms.
    vrHeadUpL.copy(vrGravityUpL);

    // Local copy of the active controller — may be updated during hover resolution.
    let activeCtrl = getActiveUiController();

    // Cache read-only drag state for this frame.
    const dragMode = getDragMode();
    const dragWindowKey = getDragWindowKey();

    function setRayFromController(controller) {
      getWorldRayForController(controller, rayOrigin, rayDir);
      raycaster.ray.origin.copy(rayOrigin);
      raycaster.ray.direction.copy(rayDir);
    }

    // Default: start from active controller (selectstart / selectend).
    setRayFromController(activeCtrl);

    // VR picking strategy:
    // Prefer actual raycasts against the per-window hit-collider meshes (UV mapping).
    // This avoids plane-selection ambiguity and prevents "ray goes through panel" dropouts.
    // For move-drag with depth adjustment, we still use the plane-intersection path to keep
    // the grabbed window ray-locked even if the ray slips slightly off the collider.

    function rectForKey(key) {
      const w = key
        ? hud.ui?.windows?.[key] ?? hud.ui?._vrVirtualWindows?.[key]
        : null;
      if (!w) return null;
      const h = w.collapsed ? titleH : w.h;
      return { x: w.x, y: w.y, w: w.w, h };
    }

    // Reusable pick list (avoid per-frame allocations)
    if (!hud.vrPointer._pickMeshes) hud.vrPointer._pickMeshes = [];
    const pickMeshes = hud.vrPointer._pickMeshes;
    pickMeshes.length = 0;

    // Window hit colliders (full rect)
    for (let i = hud.ui.order.length - 1; i >= 0; i--) {
      const k = hud.ui.order[i];
      const objs = hud.objects?.windows?.[k];
      if (objs?.hit && (objs.hit.isMesh || objs.hit.isInstancedMesh)) pickMeshes.push(objs.hit);
    }


    function hitByRaycastForController(controller, forcedKey = null) {
      setRayFromController(controller);

      // If a specific target key is forced, raycast only against that window's hit mesh.
      if (forcedKey) {
        const objs = hud.objects?.windows?.[forcedKey];
        if (objs?.hit && (objs.hit.isMesh || objs.hit.isInstancedMesh)) {
          const hits = raycaster.intersectObject(objs.hit, false);
          if (hits && hits.length) {
            const hit = hits[0];
            const r = rectForKey(forcedKey);
            if (!r || !hit.uv) return null;
            const px = r.x + hit.uv.x * r.w;
            const py = r.y + (1 - hit.uv.y) * r.h;
            return { key: forcedKey, px, py, t: hit.distance, pointW: hit.point };
          }
        }
        return null;
      }

      const hits = raycaster.intersectObjects(pickMeshes, false);
      if (!hits || !hits.length) return null;

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const k = hit?.object?.userData?.windowKey;
        if (!k) continue;
        // Never allow tooltips to steal VR picking.
        if (k === "__tooltip") continue;
        // Require UV so we can map to layout px/py.
        if (!hit.uv) continue;

        const r = rectForKey(k);
        if (!r) continue;

        const px = r.x + hit.uv.x * r.w;
        const py = r.y + (1 - hit.uv.y) * r.h;
        const t = hit.distance;
        if (!Number.isFinite(t) || t <= 0) continue;
        return { key: k, px, py, t, pointW: hit.point };
      }
      return null;
    }

    function hitKeyOnPlane(key, allowOutsideRect = false, zLocalOverride = null) {
      // Tooltips are visual-only; never let them steal the ray in VR.
      // If they become the nearest hit, pointer mapping jitters and small targets
      // (resize/minimize) become hard to reach.
      if (renderer.xr.isPresenting && key === "__tooltip") return null;

      const r = rectForKey(key);
      if (!r) return null;

      // Use a per-window interaction plane at the top-most UI pixel layer.
      // Basis is derived from the rendered window mesh (render-time matrix) when available,
      // then offset along the panel normal by (zInteraction - zBg).
      const useRenderTimeMesh = !(
        getVrMoveDragUseTheoreticalBasisThisFrame() &&
        renderer.xr.isPresenting &&
        dragMode === "move" &&
        dragWindowKey &&
        key === dragWindowKey
      );

      const basis = getWindowBillboardBasis(
        key,
        _vrBasis,
        Number.isFinite(zLocalOverride) ? Number(zLocalOverride) : VR_INTERACTION_Z_LOCAL,
        useRenderTimeMesh
      );
      if (!basis) return null;

      _vrPlane.setFromNormalAndCoplanarPoint(basis.normal, basis.center);
      const hitPointPlane = raycaster.ray.intersectPlane(_vrPlane, _vrHitPointW);
      if (!hitPointPlane) return null;

      const t = _vrHitPointL.copy(_vrHitPointW).sub(rayOrigin).dot(rayDir);
      if (!Number.isFinite(t) || t <= 0) return null;

      const vv = _vrHitPointL.copy(_vrHitPointW).sub(basis.center);
      const dx = vv.dot(basis.right);
      const dy = vv.dot(basis.up);
      const mppX = Number.isFinite(basis.mppX) && basis.mppX > 0 ? basis.mppX : vrMetersPerPxX();
      const mppY = Number.isFinite(basis.mppY) && basis.mppY > 0 ? basis.mppY : vrMetersPerPxY();
      const px = basis.winCx + dx / mppX;
      const py = basis.winCy - dy / mppY;

      // Keep this conservative; broad "slop" here can accidentally select the wrong
      // window (closer in depth) and make clicks feel offset.
      const SLOP_PX = renderer.xr.isPresenting ? 18 : 8;
      if (!allowOutsideRect && !rectContainsSlop(r.x, r.y, r.w, r.h, px, py, SLOP_PX)) {
        return null;
      }

      return { key, px, py, t, nx: basis.normal.x, ny: basis.normal.y, nz: basis.normal.z };
    }

    function hitKeyOnFrozenResizePlane(key) {
      if (!renderer.xr.isPresenting) return null;
      if (!getVrResizeDragBasisActive() || getVrResizeDragKey() !== key) return null;

      const basis = getVrResizeDragBasis();
      _vrPlane.setFromNormalAndCoplanarPoint(basis.normal, basis.center);
      const hitPointPlane = raycaster.ray.intersectPlane(_vrPlane, _vrHitPointW);
      if (!hitPointPlane) return null;

      const t = _vrHitPointL.copy(_vrHitPointW).sub(rayOrigin).dot(rayDir);
      if (!Number.isFinite(t) || t <= 0) return null;

      const vv = _vrHitPointL.copy(_vrHitPointW).sub(basis.center);
      const dx = vv.dot(basis.right);
      const dy = vv.dot(basis.up);
      const mppX = Number.isFinite(basis.mppX) && basis.mppX > 1e-10 ? basis.mppX : vrMetersPerPxX();
      const mppY = Number.isFinite(basis.mppY) && basis.mppY > 1e-10 ? basis.mppY : vrMetersPerPxY();
      const px = basis.winCx + dx / mppX;
      const py = basis.winCy - dy / mppY;

      return { key, px, py, t, nx: basis.normal.x, ny: basis.normal.y, nz: basis.normal.z };
    }

    function computeBestHitForController(
      controller,
      forcedKey = null,
      allowOutsideRect = false,
      bestHitPointWOut = null,
      bestNormalWOut = null,
      rayDirOut = null,
    ) {
      // Ray direction is used later for yaw/pitch mapping during move-drag.
      setRayFromController(controller);
      if (rayDirOut) rayDirOut.copy(rayDir);

      // Dragging (allowOutsideRect): use plane-hit mapping so the pointer can go outside
      // the current rect. Use a depth layer appropriate for the interaction:
      // - move-drag: top-most UI surface (ray-lock behavior)
      // - resize-drag: hit-collider depth (prevents drag-start discontinuity and allows growth)
      if (forcedKey && allowOutsideRect) {
        // Resize-drag: use the frozen basis captured at resize start.
        // Move-drag: keep using the top-most UI surface plane for ray-locked behavior.
        const h =
          renderer.xr.isPresenting && dragMode === "resize"
            ? hitKeyOnFrozenResizePlane(forcedKey)
            : hitKeyOnPlane(forcedKey, true, VR_INTERACTION_Z_LOCAL);
        if (h) {
          try {
            hud.vrPointer._debugPick =
              renderer.xr.isPresenting && dragMode === "resize"
                ? "planeFrozen:resize"
                : `plane:${String(dragMode ?? "drag")}`;
          } catch {
            // no-op
          }
          if (bestHitPointWOut) bestHitPointWOut.copy(_vrHitPointW);
          if (bestNormalWOut) bestNormalWOut.set(h.nx, h.ny, h.nz).normalize();
          return h;
        }
        return null;
      }

      // Non-dragging: raycast against colliders to prevent "ray goes through panel".
      const rc = hitByRaycastForController(controller, forcedKey);
      if (!rc) {
        return null;
      }
      try {
        hud.vrPointer._debugPick = "raycast";
      } catch {
        // no-op
      }
      if (bestHitPointWOut) bestHitPointWOut.copy(rc.pointW);
      if (bestNormalWOut) {
        // Approx normal from controller->head direction (good enough for marker nudge).
        try {
          const headCam = getHeadCameraForHud();
          headCam.updateMatrixWorld(true);
          headCam.getWorldPosition(vrHeadPosW);
          bestNormalWOut.copy(vrHeadPosW).sub(rc.pointW).normalize();
        } catch {
          bestNormalWOut.set(0, 0, 1);
        }
      }
      return { key: rc.key, px: rc.px, py: rc.py, t: rc.t, nx: 0, ny: 0, nz: 0 };
    }

    // Candidate list:
    // - If dragging:
    //   - move-drag: keep the grabbed window ray-locked via plane-hit (even if the ray slips off).
    //   - resize/scroll: keep using collider+UV picking for the grabbed window (authoritative); if the ray
    //     temporarily misses, keep last pointer position to avoid introducing a discontinuity.
    // - If select is down (not yet dragging): use the active controller (start-of-interaction).
    // - Otherwise (hover): compute hits for BOTH controllers and choose nearest.
    let best = null;
    let best0 = null;
    let best1 = null;

    if (dragWindowKey) {
      const allowOutsideRect =
        renderer.xr.isPresenting && (dragMode === "move" || dragMode === "resize");
      best = computeBestHitForController(
        activeCtrl,
        dragWindowKey,
        allowOutsideRect,
        _vrBestHitPointW,
        _vrBestHitNormalW,
      );
    } else if (hud.vrPointer.down) {
      best = computeBestHitForController(
        activeCtrl,
        null,
        false,
        _vrBestHitPointW,
        _vrBestHitNormalW,
      );
    } else {
      best0 = computeBestHitForController(
        controllerRay0,
        null,
        false,
        _vrBestHitPointW0,
        _vrBestHitNormalW0,
        _vrRayDir0,
      );
      best1 = computeBestHitForController(
        controllerRay1,
        null,
        false,
        _vrBestHitPointW1,
        _vrBestHitNormalW1,
        _vrRayDir1,
      );
      hud.vrPointer.controllerRay0WindowKey = best0?.key ?? null;
      hud.vrPointer.controllerRay1WindowKey = best1?.key ?? null;

      // Hover controller selection:
      // Prefer the controller that was most recently used for interaction.
      // This prevents the "other" controller (hanging at your side) from stealing
      // hover/tooltips.
      const prefer0 = activeCtrl === controllerRay0;
      const prefer1 = activeCtrl === controllerRay1;

      if (prefer0 && best0) {
        best = best0;
        _vrBestHitPointW.copy(_vrBestHitPointW0);
        _vrBestHitNormalW.copy(_vrBestHitNormalW0);
      } else if (prefer1 && best1) {
        best = best1;
        _vrBestHitPointW.copy(_vrBestHitPointW1);
        _vrBestHitNormalW.copy(_vrBestHitNormalW1);
      } else if (best0 && best1) {
        if (best0.t <= best1.t) {
          best = best0;
          activeCtrl = controllerRay0;
          _vrBestHitPointW.copy(_vrBestHitPointW0);
          _vrBestHitNormalW.copy(_vrBestHitNormalW0);
        } else {
          best = best1;
          activeCtrl = controllerRay1;
          _vrBestHitPointW.copy(_vrBestHitPointW1);
          _vrBestHitNormalW.copy(_vrBestHitNormalW1);
        }
      } else if (best0) {
        best = best0;
        activeCtrl = controllerRay0;
        _vrBestHitPointW.copy(_vrBestHitPointW0);
        _vrBestHitNormalW.copy(_vrBestHitNormalW0);
      } else if (best1) {
        best = best1;
        activeCtrl = controllerRay1;
        _vrBestHitPointW.copy(_vrBestHitPointW1);
        _vrBestHitNormalW.copy(_vrBestHitNormalW1);
      }
    }

    if (best) {
      // Ensure ray state matches chosen active controller for downstream mapping.
      setRayFromController(activeCtrl);

      // If we just entered VR move-drag, capture a ray-locked grab anchor so depth push/pull can
      // follow the controller ray trajectory while keeping the grabbed point on the ray.
      if (
        renderer.xr.isPresenting &&
        dragWindowKey &&
        dragMode === "move" &&
        !getVrMoveDragRayHasAnchor() &&
        best.key === dragWindowKey &&
        Number.isFinite(best.t) &&
        best.t > 0
      ) {
        setVrMoveDragRayHasAnchor(true);
        setVrMoveDragRayT(best.t);

        // Compute panel-local offsets (u,v meters) from panel center to the grabbed point.
        // Use render-time mesh basis here (drag start occurs on an already-rendered frame).
        const basis = getWindowBillboardBasis(
          dragWindowKey,
          _vrBasis,
          VR_INTERACTION_Z_LOCAL,
          true
        );
        if (basis) {
          _vrHitPointL.copy(_vrBestHitPointW).sub(basis.center);
          setVrMoveDragGrabU(_vrHitPointL.dot(basis.right));
          setVrMoveDragGrabV(_vrHitPointL.dot(basis.up));
        } else {
          setVrMoveDragGrabU(0);
          setVrMoveDragGrabV(0);
        }
      }

      // Default: plane-hit layout coords (stable for hover and non-move drags).
      let nextPx = best.px;
      let nextPy = best.py;

      // During VR move-drag, plane intersection can jitter at far depth.
      // Use yaw/pitch mapping from the controller ray direction, but latch an offset at drag
      // start so this remains continuous with the plane-hit mapping (prevents drag "jump").
      if (renderer.xr.isPresenting && dragWindowKey && dragMode === "move") {
        const dirL = _vrRayDirL.copy(rayDir).applyQuaternion(vrHudQuatWInv).normalize();
        // Spherical coordinates from HUD-local direction (Y-up right-hand):
        //   yaw   = atan2(x, -z)  -- 0 at -Z axis, positive toward +X (leftward in screen space).
        //   pitch = asin(y)       -- elevation above the XZ plane, clamped to [-1, 1].
        const yaw = Math.atan2(dirL.x, -dirL.z);
        const pitch = Math.asin(clamp(dirL.y, -1, 1));
        const vrScreenCx = hud.layoutW * 0.5;
        const vrScreenCy = hud.layoutH * 0.5;
        const yawPerPx = vrYawPerScreen() / Math.max(1, hud.layoutW);
        const pitchPerPx = vrPitchPerScreen() / Math.max(1, hud.layoutH);

        if (
          Number.isFinite(yawPerPx) &&
          Number.isFinite(pitchPerPx) &&
          Math.abs(yawPerPx) > 1e-8 &&
          Math.abs(pitchPerPx) > 1e-8
        ) {
          const rawPx = vrScreenCx + yaw / yawPerPx;
          const rawPy = vrScreenCy - pitch / pitchPerPx;
          if (Number.isFinite(rawPx) && Number.isFinite(rawPy)) {
            if (!getVrMoveDragYawPitchHasOffset() || getVrMoveDragYawPitchKey() !== dragWindowKey) {
              setVrMoveDragYawPitchKey(dragWindowKey);
              setVrMoveDragYawPitchOffsetX(best.px - rawPx);
              setVrMoveDragYawPitchOffsetY(best.py - rawPy);
              setVrMoveDragYawPitchHasOffset(true);
            }
            nextPx = rawPx + getVrMoveDragYawPitchOffsetX();
            nextPy = rawPy + getVrMoveDragYawPitchOffsetY();
          }
        }
      } else {
        // Not move-dragging: ensure we don't reuse stale offsets.
        setVrMoveDragYawPitchKey(null);
        setVrMoveDragYawPitchHasOffset(false);
        setVrMoveDragYawPitchOffsetX(0);
        setVrMoveDragYawPitchOffsetY(0);
      }

      hud.vrPointer.x = nextPx;
      hud.vrPointer.y = nextPy;
      hud.vrPointer.windowKey = best.key;
      hud.vrPointer.controllerRay = activeCtrl;

      // If depth push/pull adjusted window x/y this frame, keep the drag offsets consistent so
      // the generic handleDrag() step doesn't fight the ray-locked depth correction.
      if (
        renderer.xr.isPresenting &&
        getVrMoveDragDepthAdjustedThisFrame() &&
        dragWindowKey &&
        dragMode === "move"
      ) {
        const w = hud.ui?.windows?.[dragWindowKey];
        if (w) {
          w.dragOffX = hud.vrPointer.x - w.x;
          w.dragOffY = hud.vrPointer.y - w.y;
        }
      }

      _vrHitPointW.copy(_vrBestHitPointW);
      // Nudge slightly off the panel surface TOWARD the head.
      // This prevents the dot from ever landing "behind" the panel if normals are flipped.
      try {
        const headCam = getHeadCameraForHud();
        headCam.updateMatrixWorld(true);
        headCam.getWorldPosition(vrHeadPosW);
        vrToHeadW.copy(vrHeadPosW).sub(_vrHitPointW);
        if (vrToHeadW.lengthSq() > 1e-10) {
          vrToHeadW.normalize();
          _vrHitPointW.addScaledVector(vrToHeadW, 0.0008);
        }
      } catch {
        _vrHitPointW.addScaledVector(_vrBestHitNormalW, 0.0005);
      }
      hud.vrPointer.active = true;
    } else if (dragWindowKey) {
      // Keep last pointer position; don't jump.
      hitMarker0.visible = false;
      hitMarker1.visible = false;
      hud.vrPointer.active = true;
      hud.vrPointer.windowKey = dragWindowKey;
      hud.vrPointer.controllerRay = activeCtrl;
    } else {
      hitMarker0.visible = false;
      hitMarker1.visible = false;
      hud.vrPointer.active = false;
      hud.vrPointer.windowKey = null;
      hud.vrPointer.controllerRay = null;
      setActiveUiController(activeCtrl);
      return;
    }

    const curX = hud.vrPointer.x;
    const curY = hud.vrPointer.y;
    const dx = Math.abs((hud.vrPointer._prevX ?? curX) - curX);
    const dy = Math.abs((hud.vrPointer._prevY ?? curY) - curY);
    hud.vrPointer._prevX = curX;
    hud.vrPointer._prevY = curY;
    if (dx > 1 || dy > 1) markDirty();

    // Update markers
    function setMarkerScaleForT(marker, t) {
      const tt = Number(t);
      // Keep dot visible at far depth: radius grows mildly with distance.
      const desiredRadius = Number.isFinite(tt)
        ? clamp(tt * 0.0025, 0.006, 0.06)
        : 0.012;
      const baseRadius = 0.012;
      const s = desiredRadius / baseRadius;
      marker.scale.setScalar(s);
    }

    if (!dragWindowKey && !hud.vrPointer.down) {
      if (best0) {
        hitMarker0.position.copy(_vrBestHitPointW0).addScaledVector(_vrBestHitNormalW0, 0.002);
        setMarkerScaleForT(hitMarker0, best0.t);
        hitMarker0.visible = true;
      } else {
        hitMarker0.visible = false;
      }
      if (best1) {
        hitMarker1.position.copy(_vrBestHitPointW1).addScaledVector(_vrBestHitNormalW1, 0.002);
        setMarkerScaleForT(hitMarker1, best1.t);
        hitMarker1.visible = true;
      } else {
        hitMarker1.visible = false;
      }
    } else if (activeCtrl === controllerRay0) {
      hitMarker0.position.copy(_vrHitPointW);
      setMarkerScaleForT(hitMarker0, best?.t);
      hitMarker0.visible = true;
      hitMarker1.visible = false;
    } else {
      hitMarker1.position.copy(_vrHitPointW);
      setMarkerScaleForT(hitMarker1, best?.t);
      hitMarker1.visible = true;
      hitMarker0.visible = false;
    }

    // Persist any controller change back to the parent scope.
    setActiveUiController(activeCtrl);
  }

  return { updateVrPointer };
}
