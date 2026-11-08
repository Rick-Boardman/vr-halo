// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD drag/reset helpers for ending active drag, resize, and VR move-drag state.
 * @param {object} [options={}] Drag-reset runtime dependencies.
 * @param {{ ui?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {() => string | null} options.getDragWindowKey Callback returning the active drag window key.
 * @param {(mode: string | null) => void} options.setDragMode Callback setting the active drag mode.
 * @param {(key: string | null) => void} options.setDragWindowKey Callback setting the active drag window key.
 * @param {(value: number) => void} options.setScrollGrabY Callback setting scrollbar drag offset.
 * @param {(key: string | null) => void} options.setVrResizeDragKey Callback setting active VR resize drag key.
 * @param {(active: boolean) => void} options.setVrResizeDragBasisActive Callback toggling frozen VR resize basis state.
 * @param {(key: string | null) => void} options.setVrMoveDragYawPitchKey Callback setting active VR yaw/pitch drag key.
 * @param {(active: boolean) => void} options.setVrMoveDragYawPitchHasOffset Callback toggling VR yaw/pitch offset usage.
 * @param {(value: number) => void} options.setVrMoveDragYawPitchOffsetX Callback setting VR yaw/pitch X offset.
 * @param {(value: number) => void} options.setVrMoveDragYawPitchOffsetY Callback setting VR yaw/pitch Y offset.
 * @param {(active: boolean) => void} options.setVrMoveDragUseTheoreticalBasisThisFrame Callback toggling theoretical-basis usage for current frame.
 * @param {(active: boolean) => void} options.setVrMoveDragRayHasAnchor Callback toggling ray-anchor state.
 * @param {(value: number) => void} options.setVrMoveDragRayT Callback setting anchored ray distance.
 * @param {(value: number) => void} options.setVrMoveDragGrabU Callback setting anchored panel-space U offset.
 * @param {(value: number) => void} options.setVrMoveDragGrabV Callback setting anchored panel-space V offset.
 * @param {(active: boolean) => void} options.setVrMoveDragDepthAdjustedThisFrame Callback toggling depth-adjusted flag for current frame.
 * @param {(active: boolean) => void} options.setHudInteractionActive Callback toggling HUD input-capture state.
 * @returns {{ endDragResize: () => void }} Helper that clears all active drag/resize interaction state.
 * Side effects: mutates window dragging/resizing flags and all desktop/VR drag lifecycle state tracked by HUD interaction flow.
 */
export function createHudDragResetRuntime({
  hud,
  getDragMode,
  getDragWindowKey,
  setDragMode,
  setDragWindowKey,
  setScrollGrabY,
  getContentScrollMaxAbsDelta,
  getContentScrollTapCallback,
  setContentScrollStartY,
  setContentScrollStartScrollTop,
  setContentScrollLineH,
  setContentScrollMaxAbsDelta,
  setContentScrollTapCallback,
  setVrResizeDragKey,
  setVrResizeDragBasisActive,
  setVrMoveDragYawPitchKey,
  setVrMoveDragYawPitchHasOffset,
  setVrMoveDragYawPitchOffsetX,
  setVrMoveDragYawPitchOffsetY,
  setVrMoveDragUseTheoreticalBasisThisFrame,
  setVrMoveDragRayHasAnchor,
  setVrMoveDragRayT,
  setVrMoveDragGrabU,
  setVrMoveDragGrabV,
  setVrMoveDragDepthAdjustedThisFrame,
  setHudInteractionActive,
} = {}) {
  function endDragResize() {
    // Content-scroll tap detection: fire the deferred tree toggle if the finger
    // barely moved (< 10 layout px cumulative).
    if (getDragMode?.() === "content-scroll") {
      const maxDelta = getContentScrollMaxAbsDelta?.() ?? Infinity;
      if (maxDelta < 10) {
        try { getContentScrollTapCallback?.()?.(); } catch { /* no-op */ }
      }
    }

    const dragWindowKey = getDragWindowKey();
    if (dragWindowKey) {
      const w = hud.ui.windows?.[dragWindowKey];
      if (w) {
        // A person put it there: applications leave a window so placed where it is (`userPlaced`).
        if (w.dragging && (Math.abs(w.x - w.dragStartX) > 1 || Math.abs(w.y - w.dragStartY) > 1)) w.userPlaced = true;
        w.dragging = false;
        w.resizing = false;
      }
    }

    setDragMode(null);
    setDragWindowKey(null);
    setScrollGrabY(0);
    setContentScrollStartY(0);
    setContentScrollStartScrollTop(0);
    setContentScrollLineH(24);
    setContentScrollMaxAbsDelta(0);
    setContentScrollTapCallback(null);
    setVrResizeDragKey(null);
    setVrResizeDragBasisActive(false);
    setVrMoveDragYawPitchKey(null);
    setVrMoveDragYawPitchHasOffset(false);
    setVrMoveDragYawPitchOffsetX(0);
    setVrMoveDragYawPitchOffsetY(0);
    setVrMoveDragUseTheoreticalBasisThisFrame(false);
    setVrMoveDragRayHasAnchor(false);
    setVrMoveDragRayT(0);
    setVrMoveDragGrabU(0);
    setVrMoveDragGrabV(0);
    setVrMoveDragDepthAdjustedThisFrame(false);
    setHudInteractionActive(false);
  }

  return {
    endDragResize,
  };
}
