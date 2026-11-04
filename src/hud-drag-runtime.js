// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD drag handling helpers for move, resize, and scrollbar drag interactions.
 * @param {object} [options={}] Drag-runtime dependencies.
 * @param {{ overlay?: { contextMenu?: { open?: boolean } }, ui?: { windows?: Record<string, any> }, objects?: { windows?: Record<string, any> }, layoutW?: number, layoutH?: number }} options.hud Shared HUD model containing window and overlay state.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to switch desktop-vs-VR drag clamping behavior.
 * @param {(value: number, min: number, max: number) => number} options.clamp Numeric clamp helper.
 * @param {(key: string) => void} options.bringToFront Callback used to keep active drag windows ordered on top.
 * @param {() => void} options.markDirty Callback invoked whenever drag processing mutates visible HUD state.
 * @param {() => string | null} options.getDragMode Callback returning current drag mode (`move`, `resize`, `scroll`, or null).
 * @param {() => string | null} options.getDragWindowKey Callback returning the currently dragged window key.
 * @param {() => number} options.getScrollGrabY Callback returning scrollbar thumb grab offset used during scroll drags.
 * @param {number} options.titleHeightPx Window title bar height in layout pixels.
 * @returns {{handleDrag: (pointer: {x: number, y: number}) => void}} Drag helpers for HUD pointer update loops.
 * Side effects: mutates window position/size/scroll state, updates window ordering, and marks HUD state dirty for rerender.
 */
export function createHudDragRuntime({
  hud,
  renderer,
  clamp,
  bringToFront,
  markDirty,
  getDragMode,
  getDragWindowKey,
  getScrollGrabY,
  getContentScrollStartY,
  getContentScrollStartScrollTop,
  getContentScrollLineH,
  getContentScrollMaxAbsDelta,
  setContentScrollMaxAbsDelta,
  titleHeightPx,
} = {}) {
  function handleDrag(pointer) {
    const dragMode = getDragMode?.();
    if (!dragMode) return;
    if (hud.overlay?.contextMenu?.open) return;

    const dragWindowKey = getDragWindowKey?.();
    if (dragWindowKey) bringToFront(dragWindowKey);

    const px = pointer.x;
    const py = pointer.y;
    const key = dragWindowKey;
    const w = key ? hud.ui.windows?.[key] : null;
    if (!w) return;

    const h = w.collapsed ? titleHeightPx : w.h;

    if (dragMode === "move") {
      if (renderer.xr.isPresenting) {
        w.x = px - w.dragOffX;
        w.y = py - w.dragOffY;
      } else {
        w.x = clamp(px - w.dragOffX, 0, Math.max(0, hud.layoutW - w.w));
        w.y = clamp(py - w.dragOffY, 0, Math.max(0, hud.layoutH - h));
      }
      markDirty();
      return;
    }

    if (dragMode === "resize") {
      const offX = Number.isFinite(w._resizeGrabOffX) ? Number(w._resizeGrabOffX) : 0;
      const offY = Number.isFinite(w._resizeGrabOffY) ? Number(w._resizeGrabOffY) : 0;
      const right = px + offX;
      const bottom = py + offY;

      const vrMaxW = Math.max(w.minW, hud.layoutW * 2);
      const vrMaxH = Math.max(w.minH, hud.layoutH * 2);

      const newW = renderer.xr.isPresenting
        ? clamp(right - w.x, w.minW, vrMaxW)
        : clamp(right - w.x, w.minW, Math.max(w.minW, hud.layoutW - w.x));
      const newH = renderer.xr.isPresenting
        ? clamp(bottom - w.y, w.minH, vrMaxH)
        : clamp(bottom - w.y, w.minH, Math.max(w.minH, hud.layoutH - w.y));

      w.w = newW;
      w.h = newH;
      markDirty();
      return;
    }

    if (dragMode === "scroll") {
      const objs = hud.objects.windows?.[key];
      const m = objs?._scrollMetrics;
      if (!m) return;

      const thumbMaxY = Math.max(0, m.thumbAreaH - m.thumbH);
      const nextThumbY = clamp(
        pointer.y - (getScrollGrabY?.() ?? 0),
        m.thumbAreaTop,
        m.thumbAreaTop + thumbMaxY
      );
      const ratio = thumbMaxY > 0 ? (nextThumbY - m.thumbAreaTop) / thumbMaxY : 0;
      const maxTop = Math.max(0, m.totalLines - m.visibleLines);
      const nextTop = Math.round(ratio * maxTop);
      w.scrollTop = clamp(nextTop, 0, maxTop);
      w.scrollMode = w.scrollTop >= maxTop ? "end" : "manual";
      markDirty();
    }

    if (dragMode === "content-scroll") {
      const startY = getContentScrollStartY?.() ?? 0;
      const startTop = getContentScrollStartScrollTop?.() ?? 0;
      const lineH = getContentScrollLineH?.() || 24;
      const deltaY = startY - pointer.y;
      const absDelta = Math.abs(deltaY);
      const prevMax = getContentScrollMaxAbsDelta?.() ?? 0;
      if (absDelta > prevMax) setContentScrollMaxAbsDelta?.(absDelta);

      const total = w._scrollTotalLines ?? 0;
      const visible = w._scrollVisibleLines ?? 1;
      const maxTop = Math.max(0, total - visible);
      // A short press is a click (from Aether Forge, 2026-10): leave the
      // list where it was until the pointer has actually travelled.
      if (absDelta < 10) {
        w.scrollTop = startTop;
        markDirty();
        return;
      }
      const nextTop = clamp(Math.round(startTop + deltaY / lineH), 0, maxTop);
      w.scrollTop = nextTop;
      w.scrollMode = nextTop >= maxTop ? "end" : "manual";
      markDirty();
    }
  }

  return {
    handleDrag,
  };
}
