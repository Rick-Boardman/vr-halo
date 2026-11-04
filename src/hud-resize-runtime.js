// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD resize helpers and optional desktop auto-resize listener lifecycle.
 * @param {object} [options={}] Resize-runtime dependencies.
 * @param {{ xr?: { isPresenting?: boolean }, setSize?: (width: number, height: number, updateStyle?: boolean) => void }} options.renderer Renderer whose framebuffer is resized in desktop mode.
 * @param {{ aspect?: number, updateProjectionMatrix?: () => void } | null} [options.camera=null] Camera updated to match desktop aspect when auto-resizing.
 * @param {{ ui?: { _layoutInitialized?: boolean } }} options.hud Shared HUD state where layout-init flags are reset on resize.
 * @param {boolean} [options.autoHandleResize=true] Whether the runtime should install and own a window resize listener.
 * @param {() => {w: number, h: number}} options.getDesktopClientSize Callback returning current desktop canvas/client size.
 * @param {() => void} options.setLayoutForMode Callback that recomputes HUD layout dimensions for the current presentation mode.
 * @param {() => void} options.updateHudQuadSize Callback that applies HUD quad scaling after layout changes.
 * @param {() => void} options.markDirty Callback invoked when resize processing requires a HUD rerender.
 * @returns {{handleResize: () => void, disposeAutoResize: () => void}} Resize helpers for explicit resize handling and listener cleanup.
 * Side effects: may register/remove a global `window` resize listener, may mutate renderer and camera sizing in desktop mode, and mutates HUD layout-init state.
 */
export function createHudResizeRuntime({
  renderer,
  camera = null,
  hud,
  autoHandleResize = true,
  getDesktopClientSize,
  setLayoutForMode,
  updateHudQuadSize,
  markDirty,
} = {}) {
  function handleResize() {
    setLayoutForMode();
    updateHudQuadSize();
    hud.ui._layoutInitialized = false;
    markDirty();
  }

  let autoResizeHandler = null;
  if (autoHandleResize !== false) {
    autoResizeHandler = () => {
      if (renderer.xr.isPresenting) return;
      try {
        const s = getDesktopClientSize();
        const w = s.w;
        const h = s.h;
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          renderer.setSize(w, h, false);
          if (camera) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
          }
        }
      } catch {
        // no-op
      }
      handleResize();
    };

    try {
      window.addEventListener("resize", autoResizeHandler, { passive: true });
    } catch {
      window.addEventListener("resize", autoResizeHandler);
    }
  }

  if (!renderer.xr.isPresenting && autoHandleResize !== false) {
    try {
      autoResizeHandler?.();
    } catch {
      // no-op
    }
  }

  function disposeAutoResize() {
    if (!autoResizeHandler) return;
    try {
      window.removeEventListener("resize", autoResizeHandler);
    } catch {
      // no-op
    }
    autoResizeHandler = null;
  }

  return {
    handleResize,
    disposeAutoResize,
  };
}
