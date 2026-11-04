// SPDX-License-Identifier: Apache-2.0
import { HUD_WINDOW_RESIZE_HANDLE_SIZE_PX, HUD_SCROLLBAR_RESERVED_WIDTH_PX, HUD_SCROLLBAR_TRACK_WIDTH_PX, HUD_SCROLLBAR_RIGHT_INSET_PX, HUD_WINDOW_CONTENT_TOP_MARGIN_PX } from "./hud-layout-policy.js";
import { getHudWindowControlRects } from "./hud-window-skin-runtime.js";

function hitControlRect(rect, px, py, slop, containsSlop) {
  return !!(rect && containsSlop(rect.x, rect.y, rect.w, rect.h, px, py, slop));
}

/**
 * Create shared HUD click-handling helpers for window interactions, hotbar/XR actions, and focus management.
 * @param {object} [options={}] Click-runtime dependencies.
 * @param {{ ui?: { order?: Array<string>, windows?: Record<string, any>, data?: Record<string, any>, focus?: string | null }, objects?: { windows?: Record<string, any> }, xr?: { supported?: boolean } }} options.hud Shared HUD state model.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to derive VR click slop values and XR button behavior.
 * @param {{ handleContextMenuClick?: (pointer: { x: number, y: number }) => boolean }} options.uiOverlays UI overlay runtime used for context-menu click precedence.
 * @param {(key: string) => void} options.bringToFront Callback that raises a clicked window.
 * @param {() => void} options.markDirty Callback invoked when click interactions mutate HUD state.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number) => boolean} options.rectContains Rectangle hit-test helper.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number, slop: number) => boolean} options.rectContainsSlop Rectangle hit-test helper with slop.
 * @param {(value: number, min: number, max: number) => number} options.clamp Scalar clamp helper.
 * @param {(text: string) => Promise<void> | void} options.copyTextToClipboard Clipboard helper for Debug copy-all behavior.
 * @param {(entries: unknown) => string} options.normalizeEntriesToText Entry normalization helper for clipboard text.
 * @param {number} options.titleHeightPx HUD title-bar height in pixels.
 * @param {number} options.overlayPaddingPx Overlay/content padding used for tree row hit-tests.
 * @param {(renderer: object) => number} options.getHudGlyphDotSizePx Glyph-size helper for line-height calculations.
 * @param {(dot: number) => number} options.getHudTextLineHeightPx Text line-height helper.
 * @param {(windowKey: string) => number} options.getWindowPlaneZLocal Window-plane depth helper for VR resize basis.
 * @param {(key: string, out: any, zLocalOverride?: number | null, useRenderTimeMesh?: boolean) => any} options.getWindowBillboardBasis Billboard basis helper used for VR resize drag locking.
 * @param {any} options.vrBasis Shared reusable VR basis scratch object.
 * @param {any} options.vrResizeDragBasis Shared frozen VR resize basis state object.
 * @param {(key: string | null) => void} options.setVrResizeDragKey Callback updating active VR resize drag key.
 * @param {(active: boolean) => void} options.setVrResizeDragBasisActive Callback toggling frozen VR resize basis state.
 * @param {() => number} options.getVrMetersPerPxX VR meters-per-pixel helper for X axis.
 * @param {() => number} options.getVrMetersPerPxY VR meters-per-pixel helper for Y axis.
 * @param {() => string | null} options.getDragMode Callback returning active drag mode.
 * @param {(mode: string | null) => void} options.setDragMode Callback updating active drag mode.
 * @param {() => string | null} options.getDragWindowKey Callback returning active drag window key.
 * @param {(key: string | null) => void} options.setDragWindowKey Callback updating active drag window key.
 * @param {(value: number) => void} options.setScrollGrabY Callback updating scrollbar grab offset.
 * @param {(active: boolean) => void} options.setHudInteractionActive Callback toggling HUD-interaction capture state.
 * @param {(window: any, px: number, py: number) => number} options.hitTestHotbarSlotIndex Hotbar slot hit-test helper.
 * @param {(index: number) => boolean} options.handleSystemHotbarSlot System-hotbar handler.
 * @param {(payload: { index: number, windowKey: string, x: number, y: number }) => void | null} [options.onHotbarSlot=null] Optional external hotbar callback.
 * @param {() => void} options.enterVR XR entry handler for HUD XR button clicks.
 * @param {() => void} options.exitVR XR exit handler for HUD XR button clicks.
 * @returns {{ handleClick: (pointer: { x: number, y: number }) => void }} Click handler compatible with pointer-step runtime wiring.
 * Side effects: mutates window interaction, drag, scroll, resize-basis, focus, and XR transition state within the shared HUD model.
 */
export function createHudClickRuntime({
  hud,
  renderer,
  uiOverlays,
  bringToFront,
  markDirty,
  rectContains,
  rectContainsSlop,
  clamp,
  copyTextToClipboard,
  normalizeEntriesToText,
  titleHeightPx,
  overlayPaddingPx,
  getHudGlyphDotSizePx,
  getHudTextLineHeightPx,
  getWindowPlaneZLocal,
  getWindowBillboardBasis,
  vrBasis,
  vrResizeDragBasis,
  setVrResizeDragKey,
  setVrResizeDragBasisActive,
  getVrMetersPerPxX,
  getVrMetersPerPxY,
  getDragMode,
  setDragMode,
  getDragWindowKey,
  setDragWindowKey,
  setScrollGrabY,
  setContentScrollStartY,
  setContentScrollStartScrollTop,
  setContentScrollLineH,
  setContentScrollMaxAbsDelta,
  setContentScrollTapCallback,
  setHudInteractionActive,
  hitTestHotbarSlotIndex,
  handleSystemHotbarSlot,
  onHotbarSlot = null,
  enterVR,
  exitVR,
  toggleWindow = null,
  toggleHelp = null,
  restoreAllHidden = null,
} = {}) {
  function findVisibleLineIndex(meta, localY, lineH) {
    if (!Array.isArray(meta) || !meta.length || !Number.isFinite(localY)) return -1;

    let hasExplicitRowMetrics = false;
    for (let index = 0; index < meta.length; index += 1) {
      const row = meta[index];
      const rowTop = Number(row?.rowTopPx);
      const rowHeight = Number(row?.rowHeightPx);
      if (!Number.isFinite(rowTop) || !Number.isFinite(rowHeight) || rowHeight <= 0) continue;
      hasExplicitRowMetrics = true;
      if (localY >= rowTop && localY < rowTop + rowHeight) {
        return index;
      }
    }

    if (hasExplicitRowMetrics) return -1;
    const index = Math.floor(localY / lineH);
    return index >= 0 && index < meta.length ? index : -1;
  }

  function hasActiveScrollbar(objs) {
    return !!(objs?.scrollTrack?.visible && objs?.scrollThumb?.visible);
  }

  function invokeFooterAction(objs, key, px, py, slop) {
    const footerActions = objs?._footerActionMeta;
    if (!Array.isArray(footerActions) || !footerActions.length) return false;

    for (const action of footerActions) {
      if (
        typeof action?.onClick !== "function" ||
        !Number.isFinite(action.x) ||
        !Number.isFinite(action.y) ||
        !Number.isFinite(action.w) ||
        !Number.isFinite(action.h)
      ) {
        continue;
      }
      if (!rectContainsSlop(action.x, action.y, action.w, action.h, px, py, slop)) {
        continue;
      }

      try {
        action.onClick({
          windowKey: key,
          text: action.text,
          pointer: { x: px, y: py },
        });
      } catch {
        // no-op
      }
      markDirty();
      return true;
    }

    return false;
  }

  function getWindowHitTestOrder() {
    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    const keys = [];
    const seen = new Set();

    function pushKey(key) {
      if (!key || seen.has(key) || !hud.ui?.windows?.[key]) return;
      seen.add(key);
      keys.push(key);
    }

    for (let i = order.length - 1; i >= 0; i -= 1) {
      const key = order[i];
      const win = hud.ui?.windows?.[key];
      if (!win || (!win.dragging && !win.resizing)) continue;
      pushKey(key);
    }

    pushKey(hud.ui?.focus);

    for (let i = order.length - 1; i >= 0; i -= 1) {
      pushKey(order[i]);
    }

    return keys;
  }

  function handleClick(pointer) {
    const px = pointer.x;
    const py = pointer.y;
    const allowDragStart = pointer?.down !== false;

    if (uiOverlays.handleContextMenuClick(pointer)) return;

    const vrBtnSlop = renderer.xr.isPresenting ? 6 : 0;
    const vrResizeSlop = renderer.xr.isPresenting ? 10 : 0;
    const vrScrollSlop = renderer.xr.isPresenting ? 14 : 0;

    const windowHitOrder = getWindowHitTestOrder();
    for (let i = 0; i < windowHitOrder.length; i += 1) {
      const key = windowHitOrder[i];
      const w = hud.ui.windows[key];
      if (!w) continue;

      const h = w.collapsed ? titleHeightPx : w.h;
      if (!rectContains(w.x, w.y, w.w, h, px, py)) continue;

      bringToFront(key);

      const objs = hud.objects.windows?.[key];
      const controls = getHudWindowControlRects(w, objs, titleHeightPx);

      if (key === "debug") {
        // Action button (≡): restore hidden panels, then dump layout snapshot to the debug window + clipboard.
        if (hitControlRect(controls.action, px, py, vrBtnSlop, rectContainsSlop)) {
          // Restore any hidden (off-screen) panels first (excludes help).
          if (typeof restoreAllHidden === "function") restoreAllHidden();

          const snap = {};
          const windows = hud.ui?.windows;
          if (windows) {
            for (const [wk, wv] of Object.entries(windows)) {
              snap[wk] = {
                x: Math.round(wv.x),
                y: Math.round(wv.y),
                w: Math.round(wv.w),
                h: Math.round(wv.h),
                collapsed: !!wv.collapsed,
                visible: Number(wv.y) >= -1000,
              };
            }
          }
          const mode = renderer.xr.isPresenting ? "vr" : "desktop";
          const payload = { mode, layoutW: hud.layoutW, layoutH: hud.layoutH, windows: snap };
          const text = JSON.stringify(payload, null, 2);
          // Write each line into the debug window.
          const debugWin = hud.ui.windows?.debug;
          if (debugWin && typeof debugWin.setLines === "function") {
            const lines = text.split("\n").map((line) => ({ text: line, color: 0x9ec2ff }));
            debugWin.setLines(lines, { scrollMode: "top" });
          }
          void copyTextToClipboard(text);
          markDirty();
          return;
        }

        // Copy button (invisible): copy debug lines to clipboard.
        if (hitControlRect(controls.copy, px, py, vrBtnSlop, rectContainsSlop)) {
          const ww = hud.ui.windows?.[key];
          const entries =
            ww && typeof ww.linesKey === "function" ? hud.ui.data?.[ww.linesKey()] : null;
          void copyTextToClipboard(normalizeEntriesToText(entries));
          markDirty();
          return;
        }
      }

      if (w.closeable) {
        if (hitControlRect(controls.close, px, py, vrBtnSlop, rectContainsSlop)) {
          const handled =
            typeof w.onClose === "function"
              ? (() => {
                  try {
                    w.onClose({ windowKey: key, pointer: { x: px, y: py }, window: w });
                    return true;
                  } catch {
                    return false;
                  }
                })()
              : key === "help" && typeof toggleHelp === "function"
                ? (toggleHelp(), true)
                : typeof toggleWindow === "function"
                  ? (toggleWindow(key), true)
                  : typeof w.close === "function"
                    ? w.close({ pointer: { x: px, y: py }, windowKey: key })
                    : false;
          if (handled) {
            markDirty();
            return;
          }
        }
      }

      if (w.minimizable) {
        if (hitControlRect(controls.min, px, py, vrBtnSlop, rectContainsSlop)) {
          if (typeof w.toggleCollapsed === "function") w.toggleCollapsed();
          else if (typeof w.setCollapsed === "function") w.setCollapsed(!w.collapsed);
          else w.collapsed = !w.collapsed;
          markDirty();
          return;
        }
      }

      if (allowDragStart && w.resizable && !w.collapsed) {
        const resizeRect = controls.resize;
        const handleX0 = resizeRect?.x ?? (w.x + w.w - HUD_WINDOW_RESIZE_HANDLE_SIZE_PX);
        const handleY0 = resizeRect?.y ?? (w.y + h - HUD_WINDOW_RESIZE_HANDLE_SIZE_PX);
        const handleW = resizeRect?.w ?? HUD_WINDOW_RESIZE_HANDLE_SIZE_PX;
        const handleH = resizeRect?.h ?? HUD_WINDOW_RESIZE_HANDLE_SIZE_PX;
        if (rectContainsSlop(handleX0, handleY0, handleW, handleH, px, py, vrResizeSlop)) {
          w.resizing = true;
          const clampedPressX = clamp(px, handleX0, handleX0 + handleW);
          const clampedPressY = clamp(py, handleY0, handleY0 + handleH);
          w._resizeGrabOffX = w.x + w.w - clampedPressX;
          w._resizeGrabOffY = w.y + w.h - clampedPressY;

          if (renderer.xr.isPresenting) {
            try {
              const zForDrag = getWindowPlaneZLocal(key);
              const b = getWindowBillboardBasis(key, vrBasis, zForDrag, true);
              if (b) {
                setVrResizeDragKey(key);
                vrResizeDragBasis.center.copy(b.center);
                vrResizeDragBasis.normal.copy(b.normal);
                vrResizeDragBasis.right.copy(b.right);
                vrResizeDragBasis.up.copy(b.up);
                vrResizeDragBasis.winCx = Number(b.winCx) || 0;
                vrResizeDragBasis.winCy = Number(b.winCy) || 0;
                vrResizeDragBasis.mppX = Number(b.mppX) || getVrMetersPerPxX();
                vrResizeDragBasis.mppY = Number(b.mppY) || getVrMetersPerPxY();
                setVrResizeDragBasisActive(true);
              } else {
                setVrResizeDragKey(null);
                setVrResizeDragBasisActive(false);
              }
            } catch {
              setVrResizeDragKey(null);
              setVrResizeDragBasisActive(false);
            }
          }

          setDragMode("resize");
          setDragWindowKey(key);
          setHudInteractionActive(true);
          return;
        }
      }

      {
        if (hasActiveScrollbar(objs) && !w.collapsed) {
          const m = objs._scrollMetrics;
          if (m && rectContainsSlop(m.trackX, m.trackY, HUD_SCROLLBAR_TRACK_WIDTH_PX, m.trackH, px, py, vrScrollSlop)) {
            const maxTop = Math.max(0, m.totalLines - m.visibleLines);
            const currentTop = clamp(w.scrollTop ?? 0, 0, maxTop);

            if (rectContainsSlop(m.buttonX, m.upButtonY, m.buttonW, m.arrowH, px, py, vrScrollSlop)) {
              if (currentTop > 0) {
                w.scrollTop = clamp(currentTop - 3, 0, maxTop);
                w.scrollMode = w.scrollTop >= maxTop ? "end" : "manual";
                markDirty();
              }
              return;
            }

            if (rectContainsSlop(m.buttonX, m.downButtonY, m.buttonW, m.arrowH, px, py, vrScrollSlop)) {
              if (currentTop < maxTop) {
                w.scrollTop = clamp(currentTop + 3, 0, maxTop);
                w.scrollMode = w.scrollTop >= maxTop ? "end" : "manual";
                markDirty();
              }
              return;
            }

            if (allowDragStart && py >= m.thumbY - vrScrollSlop && py <= m.thumbY + m.thumbH + vrScrollSlop) {
              setDragMode("scroll");
              setDragWindowKey(key);
              setScrollGrabY(py - m.thumbY);
              setHudInteractionActive(true);
              return;
            }

            const pageStep = Math.max(1, m.visibleLines);
            if (py < m.thumbY) {
              w.scrollTop = clamp(currentTop - pageStep, 0, maxTop);
            } else {
              w.scrollTop = clamp(currentTop + pageStep, 0, maxTop);
            }
            w.scrollMode = w.scrollTop >= maxTop ? "end" : "manual";
            markDirty();
            return;
          }
        }
      }

      // Touch content-area drag-to-scroll for scrollable panels.
      // On touch, swiping inside the content area scrolls; tapping a tree toggle
      // fires after pointer-up if the finger barely moved.
      {
        if (hud.pointer.pointerType === "touch") {
          const objs = hud.objects.windows?.[key];
          if (hasActiveScrollbar(objs) && !w.collapsed) {
            const contentYStart = w.y + titleHeightPx;
            const contentH = h - titleHeightPx;
            if (allowDragStart && rectContains(w.x, contentYStart, w.w, contentH, px, py)) {
              const dot = getHudGlyphDotSizePx(renderer);
              const lineH = getHudTextLineHeightPx(dot);

              // Check if a tree toggle was hit; defer the toggle until pointer-up.
              let tapCallback = null;
              const meta = objs._visibleLineMeta;
              if (invokeFooterAction(objs, key, px, py, vrScrollSlop)) {
                return;
              }
              if (meta && meta.length) {
                const cy = w.y + titleHeightPx + overlayPaddingPx;
                const idx = findVisibleLineIndex(meta, py - cy, lineH);
                const row = meta[idx];
                if (
                  row?.actionButton?.onClick &&
                  Number.isFinite(row.actionButton.x) &&
                  Number.isFinite(row.actionButton.y) &&
                  Number.isFinite(row.actionButton.w) &&
                  Number.isFinite(row.actionButton.h) &&
                  rectContainsSlop(
                    row.actionButton.x,
                    row.actionButton.y,
                    row.actionButton.w,
                    row.actionButton.h,
                    px,
                    py,
                    vrScrollSlop
                  )
                ) {
                  tapCallback = () => {
                    try {
                      row.actionButton.onClick({
                        windowKey: key,
                        rowIndex: idx,
                        text: row.text,
                        pointer: { x: px, y: py },
                      });
                    } catch {
                      // no-op
                    }
                    markDirty();
                  };
                } else if (row?.toggleKey && w._treeExpanded) {
                  const toggleKey = row.toggleKey;
                  tapCallback = () => {
                    w._treeExpanded[toggleKey] = !w._treeExpanded[toggleKey];
                    w.scrollMode = "manual";
                    markDirty();
                  };
                } else if (typeof row?.onClick === "function") {
                  tapCallback = () => {
                    try {
                      row.onClick({
                        windowKey: key,
                        rowIndex: idx,
                        text: row.text,
                        pointer: { x: px, y: py },
                      });
                    } catch {
                      // no-op
                    }
                    markDirty();
                  };
                }
              }

              setDragMode("content-scroll");
              setDragWindowKey(key);
              setContentScrollStartY(py);
              setContentScrollStartScrollTop(w.scrollTop ?? 0);
              setContentScrollLineH(lineH);
              setContentScrollMaxAbsDelta(0);
              setContentScrollTapCallback(tapCallback);
              setHudInteractionActive(true);
              return;
            }
          }
        }
      }

      // Custom content-click handler (used by card overlays and other
      // external overlay systems that bypass renderList text layout).
      if (typeof w._onContentClick === "function" && !w.collapsed) {
        const contentH = h - titleHeightPx;
        if (rectContains(w.x, w.y + titleHeightPx, w.w, contentH, px, py)) {
          try {
            const handled = w._onContentClick({ x: px, y: py, windowKey: key });
            if (handled) {
              markDirty();
              return;
            }
          } catch {
            // no-op
          }
        }
      }

      {
        const objs = hud.objects.windows?.[key];
        const meta = objs?._visibleLineMeta;
        if (objs && invokeFooterAction(objs, key, px, py, vrScrollSlop)) {
          return;
        }
        if (meta && meta.length) {
          const dot = getHudGlyphDotSizePx(renderer);
          const contentX = w.x + overlayPaddingPx;
          const contentY = w.y + titleHeightPx + overlayPaddingPx;
          const contentW = w.w - overlayPaddingPx * 2;
          const contentH = h - titleHeightPx - overlayPaddingPx * 2;

          if (rectContains(contentX, contentY, contentW, contentH, px, py)) {
            const lineH = getHudTextLineHeightPx(dot);
            const idx = findVisibleLineIndex(meta, py - contentY, lineH);
            const row = meta[idx];
            if (
              row?.actionButton?.onClick &&
              Number.isFinite(row.actionButton.x) &&
              Number.isFinite(row.actionButton.y) &&
              Number.isFinite(row.actionButton.w) &&
              Number.isFinite(row.actionButton.h) &&
              rectContainsSlop(
                row.actionButton.x,
                row.actionButton.y,
                row.actionButton.w,
                row.actionButton.h,
                px,
                py,
                vrScrollSlop
              )
            ) {
              try {
                row.actionButton.onClick({
                  windowKey: key,
                  rowIndex: idx,
                  text: row.text,
                  pointer: { x: px, y: py },
                });
              } catch {
                // no-op
              }
              markDirty();
              return;
            }
            if (row?.toggleKey && w._treeExpanded) {
              w._treeExpanded[row.toggleKey] = !w._treeExpanded[row.toggleKey];
              w.scrollMode = "manual";
              markDirty();
              return;
            }
            if (typeof row?.onClick === "function") {
              try {
                row.onClick({
                  windowKey: key,
                  rowIndex: idx,
                  text: row.text,
                  pointer: { x: px, y: py },
                });
              } catch {
                // no-op
              }
              markDirty();
              return;
            }
          }
        }
      }

      if (key === "hotbar") {
        const idx = hitTestHotbarSlotIndex(w, px, py);
        if (idx >= 0) {
          const handled = handleSystemHotbarSlot(idx);
          if (!handled && onHotbarSlot) {
            try {
              onHotbarSlot({ index: idx, windowKey: key, x: px, y: py });
            } catch {
              // no-op
            }
          }
          markDirty();
          return;
        }
      }

      if (key === "xr") {
        // Only fire VR toggle from the content area (below the title bar).
        // Title-bar clicks fall through to the drag handler below.
        const contentY = w.y + titleHeightPx;
        const contentH = h - titleHeightPx;
        if (hud.xr.supported && contentH > 0 && rectContains(w.x, contentY, w.w, contentH, px, py)) {
          if (renderer.xr.isPresenting) {
            exitVR();
          } else {
            enterVR();
          }
          markDirty();
          return;
        }
      }

      if (allowDragStart && w.draggable && w.dragAnywhere && !w.collapsed) {
        w.dragging = true;
        w.dragOffX = px - w.x;
        w.dragOffY = py - w.y;
        setDragMode("move");
        setDragWindowKey(key);
        setHudInteractionActive(true);
        return;
      }

      const titleSlop = renderer.xr.isPresenting ? 6 : 0;
      if (allowDragStart && w.draggable && rectContainsSlop(w.x, w.y, w.w, titleHeightPx, px, py, titleSlop)) {
        w.dragging = true;
        w.dragOffX = px - w.x;
        w.dragOffY = py - w.y;
        setDragMode("move");
        setDragWindowKey(key);
        setHudInteractionActive(true);
        return;
      }

      return;
    }

    if (hud.ui.focus) {
      const prevFocus = hud.ui.focus;
      hud.ui.focus = null;
      try {
        hud.ui.windows?.[prevFocus]?._onHudBlur?.();
      } catch {
        // no-op
      }
      markDirty();
    }
  }

  return {
    handleClick,
  };
}
