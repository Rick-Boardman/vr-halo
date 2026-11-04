// SPDX-License-Identifier: Apache-2.0
import { createHudRenderOrderRuntime } from "./hud-render-order-runtime.js";

/**
 * Create the HUD per-frame update and dirty-render orchestration runtime.
 *
 * Owns the `update(dt)` tick (VR/desktop branching, render-time matrix
 * caching, mode transitions, input stepping, error display timer) and the
 * `updateUi()` dirty-render pass (window layout, render order, visibility,
 * overlay layout, clamping, per-window rendering, Troika sync).
 *
 * @param {object} deps
 * @param {object} deps.hud                         Shared HUD state object.
 * @param {{ xr: { isPresenting: boolean } }} deps.renderer  Renderer for XR state.
 * @param {() => object|null} deps.getDesktopWorldHoverOutline  Getter for the optional desktop hover outline helper.
 * @param {object} deps.vrRenderTimeHudMatrix        Matrix4 — cached render-time HUD root world matrix.
 * @param {(cached: boolean) => void} deps.setVrRenderTimeMatricesCached  Setter for the render-time cache flag.
 * @param {(dt: number) => void} deps.updateMetrics  Updates live metric values.
 * @param {(dt: number) => void} deps.updateDebugPanel  Refreshes debug panel entries.
 * @param {() => void} deps.setHudAnchorForMode      Applies the HUD parent anchor for the current mode.
 * @param {() => void} deps.setLayoutForMode          Recomputes layout/scale.
 * @param {() => void} deps.updatePlacementForMode    Applies HUD placement.
 * @param {() => void} deps.updateHudQuadSize         Updates HUD quad scale.
 * @param {() => void} deps.autoLayoutWindowsForVr    Runs the VR auto-layout grid.
 * @param {() => void} deps.markDirty                 Marks the HUD dirty for re-render.
 * @param {(dt: number, presenting: boolean) => void} deps.updateVrDepth  VR depth push/pull tick.
 * @param {() => void} deps.updateVrPointer           VR pointer picking tick.
 * @param {(active: boolean) => void} [deps.setHudHoverActive] Keeps external world-control capture aligned with VR HUD hover.
 * @param {(dt: number) => void} [deps.updateVrPanelScroll] Applies per-frame VR panel scrolling for hovered HUD windows.
 * @param {(pointer: object, dt: number) => void} deps.updateOverlayHover  Overlay hover tick.
 * @param {() => void} deps.layoutContextMenu         Positions the context-menu overlay.
 * @param {() => void} deps.layoutTooltip             Positions the tooltip overlay.
 * @param {(pointer: object, dt: number) => void} deps.stepInput  Input step tick.
 * @param {object} deps.hitMarker0                    VR hit marker 0 (visibility toggled).
 * @param {object} deps.hitMarker1                    VR hit marker 1 (visibility toggled).
 * @param {() => void} deps.endDragResize             Ends the current drag/resize interaction.
 * @param {() => void} deps.updateSystemHotbarPresentation  Syncs system hotbar slot tooltips.
 * @param {{ ensureDefaultLayout: () => void, clampWindowToBounds: (key: string, win: object) => void }} deps.windowLayoutRuntime  Window layout helpers.
 * @param {{ hideStatusExtras: () => void, hideHotbarExtras: () => void }} deps.windowObjectVisibilityRuntime  Window visibility helpers.
 * @param {(key: string, ctx: object) => void} deps.renderWindow  Per-window render function.
 * @param {{ syncTroikaRegistryRenderOrders: (ctx: { renderOrderBaseFor: Function }) => void }} deps.windowTextRenderOrderRuntime  Troika text render-order sync.
 * @returns {{ update: (dt: number) => void, updateUi: () => void }}
 * Side effects: mutates hud state, toggles hit-marker visibility, copies render-time
 * matrices, drives VR/desktop input and rendering pipelines each frame.
 */
export function createHudFrameUpdateRuntime({
  hud,
  renderer,
  getDesktopWorldHoverOutline,
  vrRenderTimeHudMatrix,
  setVrRenderTimeMatricesCached,
  updateMetrics,
  updateDebugPanel,
  setHudAnchorForMode,
  setLayoutForMode,
  updatePlacementForMode,
  updateHudQuadSize,
  autoLayoutWindowsForVr,
  markDirty,
  updateVrDepth,
  updateVrPointer,
  setHudHoverActive,
  updateVrPanelScroll,
  updateOverlayHover,
  layoutContextMenu,
  layoutTooltip,
  stepInput,
  hitMarker0,
  hitMarker1,
  endDragResize,
  updateSystemHotbarPresentation,
  windowLayoutRuntime,
  windowObjectVisibilityRuntime,
  renderWindow,
  windowTextRenderOrderRuntime,
}) {
  let _prevPresenting = !!renderer.xr.isPresenting;

  /**
   * Dirty-render pass: recompute window layout, render order, visibility,
   * overlay positioning, clamping, per-window rendering, and Troika sync.
   * Called when hud._dirty is set.
   * Side effects: mutates hud.xr.presenting, window objects, overlay positions.
   */
  function updateUi() {
    // Keep XR presenting state aligned with the renderer.
    // (Prevents desktop UI from accidentally showing VR-only help/labels.)
    try {
      hud.xr.presenting = !!renderer.xr.isPresenting;
    } catch {
      // no-op
    }

    // Keep system slot tooltips in sync with Help/debug state.
    updateSystemHotbarPresentation();

    // These icon grids are rect meshes stored outside the per-window object map;
    // hide them by default to prevent "ghost" icon panels when a window is
    // removed from the UI order or destroyed.
    if (hud.objects?.buffIcons?.length) {
      for (const icon of hud.objects.buffIcons) icon.visible = false;
    }
    if (hud.objects?.targetIcons?.length) {
      for (const icon of hud.objects.targetIcons) icon.visible = false;
    }

    windowLayoutRuntime.ensureDefaultLayout();

    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    const {
      zLiftFor,
      renderOrderBaseFor,
      setMeshRenderOrder,
    } = createHudRenderOrderRuntime({
      order,
      getFocusedWindowKey: () => hud.ui?.focus,
    });

    // Default: keep extras hidden until we place the status window.
    windowObjectVisibilityRuntime.hideStatusExtras();
    windowObjectVisibilityRuntime.hideHotbarExtras();

    // Overlays last (above all windows)
    layoutContextMenu();
    layoutTooltip();

    // Clamp windows into bounds on every dirty update.
    for (const k of hud.ui.order) {
      const win = hud.ui.windows?.[k];
      if (win) windowLayoutRuntime.clampWindowToBounds(k, win);
    }

    const _roCtx = { zLiftFor, renderOrderBaseFor, setMeshRenderOrder };
    for (const k of hud.ui.order) renderWindow(k, _roCtx);

    // Safety pass: keep every Troika text instance in sync with per-window stacking.
    // This prevents stale high renderOrder meshes from drawing above window backgrounds.
    windowTextRenderOrderRuntime.syncTroikaRegistryRenderOrders({ renderOrderBaseFor });

    // Do not mark dirty here; dirtiness should be driven by input/events.
  }

  /**
   * Per-frame tick: drives VR/desktop branching, render-time matrix caching,
   * XR mode transitions, input stepping, VR error display timer, and
   * dirty-triggered UI re-render.
   *
   * @param {number} dt  Delta time in seconds since last frame.
   * Side effects: mutates hud state, caches render-time matrices, toggles
   * hit-marker visibility, may trigger layout/resize on mode transitions.
   */
  function update(dt) {
    const presenting = !!renderer.xr.isPresenting;
    hud.xr.presenting = presenting;

    // Desktop-only world hover outline. Uses last known client coords.
    const hoverOutline = getDesktopWorldHoverOutline();
    if (!presenting && hoverOutline) {
      hoverOutline.updateFromClientPoint(
        hud.pointer.clientX,
        hud.pointer.clientY
      );
    }

    // VR: Cache the hud.root world matrix from render() BEFORE we modify it.
    // This ensures raycasting uses the same transforms that were rendered.
    if (presenting) {
      vrRenderTimeHudMatrix.copy(hud.root.matrixWorld);
      setVrRenderTimeMatricesCached(true);
    } else {
      setVrRenderTimeMatricesCached(false);
    }

    updateMetrics(dt);

    // Update Debug panel content at a low rate (avoid per-frame allocations).
    updateDebugPanel(dt);

    // Keep parent anchor correct for current mode.
    setHudAnchorForMode();

    // Recompute layout/scale only when XR presentation toggles.
    if (presenting !== _prevPresenting) {
      _prevPresenting = presenting;
      setLayoutForMode();
      updatePlacementForMode();
      updateHudQuadSize();
      // Desktop uses ensureDefaultLayout() as its initializer; VR uses the
      // dedicated VR auto-layout (grid) and should not be overwritten.
      hud.ui._layoutInitialized = false;
      if (presenting) {
        try {
          setHudAnchorForMode();
        } catch {
          // no-op
        }
        try {
          if (!hud.ui._vrAutoLayoutDone) autoLayoutWindowsForVr();
          hud.ui._layoutInitialized = true;
        } catch {
          // no-op
        }
      }
      markDirty();
    }

    // Placement is constant per-mode, but keep it applied.
    updatePlacementForMode();

    updateVrDepth(dt, presenting);

    if (presenting) {
      try {
        updateVrPointer();
        setHudHoverActive?.(!!hud.vrPointer?.active);
        updateVrPanelScroll?.(dt);
        updateOverlayHover(hud.vrPointer, dt);
        stepInput(hud.vrPointer, dt);
        if (hud.ui?.metrics && hud.ui.metrics.vrErrorText) {
          const until = Number(hud.ui.metrics._vrErrorUntilMs ?? 0);
          if (!Number.isFinite(until) || performance.now() >= until) {
            hud.ui.metrics.vrErrorText = "";
            hud.ui.metrics._vrErrorUntilMs = 0;
            markDirty();
          }
        }
      } catch (err) {
        try {
          const msg = String(err?.message ?? err ?? "(unknown error)");
          console.error("HUD VR update error:", err);
          if (!hud.ui.metrics) hud.ui.metrics = {};
          const trimmed = msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
          hud.ui.metrics.vrErrorText = `ERR: ${trimmed}`;
          hud.ui.metrics._vrErrorUntilMs = Number.isFinite(performance.now()) ? performance.now() + 6000 : 0;
          markDirty();
        } catch {
          // no-op
        }
        try {
          setHudHoverActive?.(false);
          // Keep interaction state from getting stuck.
          hud.vrPointer.down = false;
          hud.vrPointer.justPressed = false;
          hud.vrPointer.justReleased = true;
          endDragResize();
        } catch {
          // no-op
        }
      }
    } else {
      setHudHoverActive?.(false);
      updateOverlayHover(hud.pointer, dt);
      stepInput(hud.pointer, dt);
      hitMarker0.visible = false;
      hitMarker1.visible = false;
    }

    if (hud._dirty) {
      updateUi();
      hud._dirty = false;
    }
  }

  return { update, updateUi };
}
