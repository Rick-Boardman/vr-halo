// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Install shared desktop-pointer input handling for the HUD, including pointer move/down/up, wheel scrolling, and context-menu routing.
 * @param {object} [options={}] Desktop input dependencies.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to detect active XR mode.
 * @param {{ addEventListener?: Function }} options.dom Canvas/DOM target receiving pointer input.
 * @param {{ pointer: { x: number, y: number, active: boolean, down: boolean, justPressed: boolean, justReleased: boolean, contextJustRequested: boolean, clientX?: number, clientY?: number }, ui: { order: Array<string>, windows: Record<string, any> }, objects?: { windows?: Record<string, any> } }} options.hud HUD runtime state object.
 * @param {() => void} options.markDirty Callback that requests a HUD rerender.
 * @param {() => void} options.endDragResize Callback that clears active drag/resize state.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number) => boolean} options.rectContains Rectangle hit-test helper.
 * @param {(value: number, min: number, max: number) => number} options.clamp Numeric clamp helper.
 * @param {(clientX: number, clientY: number, dom: any) => {x:number,y:number}|null} options.getNormalizedClientPoint Client->normalized pointer conversion helper.
 * @param {number} options.titleHeightPx Window title-bar height in layout pixels.
 * @param {(() => ({ clear?: () => void } | null)) | null} [options.getDesktopWorldHoverOutline=null] Optional callback that returns the desktop hover-outline helper.
 * @param {(() => Promise<void>) | null} [options.enterVR=null] Optional callback to enter VR synchronously from a user gesture.
 * @param {(() => Promise<void>) | null} [options.exitVR=null] Optional callback to exit VR.
 * @param {boolean} [options.enableContextMenu=true] Whether desktop right-click should open the HUD context menu.
 * @returns {{ setPointerFromEvent: (e: PointerEvent|MouseEvent) => void }} API exposing pointer-sync helper used by installed listeners.
 * Side effects: registers DOM/window event listeners, mutates `hud.pointer` and window scroll state, and may call `preventDefault()` for handled interactions.
 */
export function installHudDesktopInputRuntime({
  renderer,
  dom,
  hud,
  markDirty,
  endDragResize,
  rectContains,
  clamp,
  getNormalizedClientPoint,
  titleHeightPx,
  getDesktopWorldHoverOutline = null,
  enterVR = null,
  exitVR = null,
  enableContextMenu = true,
} = {}) {
  // Track a single active pointer to avoid multi-touch racing.
  let _activePointerId = null;

  function setPointerFromEvent(e) {
    // When Pointer Lock is active (mouse-look), browsers can report unstable
    // clientX/clientY values. Suppress HUD hover/tooltips in that mode.
    try {
      if (document.pointerLockElement === dom) {
        if (hud.pointer.active) {
          hud.pointer.active = false;
          hud.pointer.clientX = Number.NaN;
          hud.pointer.clientY = Number.NaN;
        }
        return;
      }
    } catch {
      // no-op
    }

    const pointer = getNormalizedClientPoint(e.clientX, e.clientY, dom);
    if (!pointer) return;
    hud.pointer.x = pointer.x * hud.layoutW;
    hud.pointer.y = pointer.y * hud.layoutH;
    hud.pointer.active = true;
    hud.pointer.clientX = e.clientX;
    hud.pointer.clientY = e.clientY;
    hud.pointer.pointerType = e.pointerType || "mouse";
  }

  function onPointerMove(e) {
    if (renderer.xr.isPresenting) return;
    if (_activePointerId != null && e.pointerId !== _activePointerId) return;
    setPointerFromEvent(e);
    markDirty();
  }

  function onPointerDown(e) {
    if (renderer.xr.isPresenting) return;
    // Only track the first finger / primary button.
    if (_activePointerId != null) return;
    setPointerFromEvent(e);
    if (!hud.pointer.active) {
      return;
    }
    if (e.button === 2) {
      hud.pointer.contextJustRequested = false;
      hud.pointer.down = false;
      hud.pointer.justPressed = false;
      if (enableContextMenu) {
        hud.pointer.contextJustRequested = true;
      }
      markDirty();
      e.preventDefault();
      return;
    }
    _activePointerId = e.pointerId;
    hud.pointer.down = true;
    hud.pointer.justPressed = true;
    markDirty();
  }

  function onPointerUp(e) {
    if (renderer.xr.isPresenting) return;
    if (_activePointerId != null && e.pointerId !== _activePointerId) return;
    setPointerFromEvent(e);
    _activePointerId = null;
    if (!hud.pointer.active) return;
    hud.pointer.down = false;
    hud.pointer.justReleased = true;
    markDirty();
    endDragResize();
  }

  function onWheel(e) {
    if (renderer.xr.isPresenting) return;
    setPointerFromEvent(e);
    if (!hud.pointer.active) return;

    const px = hud.pointer.x;
    const py = hud.pointer.y;

    // Top-most window under pointer that has scrolling enabled
    for (let i = hud.ui.order.length - 1; i >= 0; i--) {
      const key = hud.ui.order[i];
      const win = hud.ui.windows[key];
      const objs = hud.objects.windows?.[key];
      if (!win || !objs?.scrollTrack) continue;
      if (win.collapsed) continue;

      const h = win.h;
      if (!rectContains(win.x, win.y, win.w, h, px, py)) continue;

      const total = win._scrollTotalLines ?? 0;
      const visible = win._scrollVisibleLines ?? 1;
      const maxTop = Math.max(0, total - visible);

      // Wheel delta is device-specific; scroll in fixed line steps.
      const step = e.deltaY > 0 ? 3 : -3;
      const nextTop = clamp((win.scrollTop ?? 0) + step, 0, maxTop);
      win.scrollTop = nextTop;
      win.scrollMode = nextTop >= maxTop ? "end" : "manual";
      markDirty();
      e.preventDefault();
      return;
    }
  }

  dom.addEventListener("pointermove", onPointerMove, { passive: true });
  dom.addEventListener(
    "pointerleave",
    (e) => {
      if (renderer.xr.isPresenting) return;
      // Touch-end fires pointerleave; only deactivate for mouse/pen leaving the canvas.
      if (e.pointerType === "touch") return;
      hud.pointer.active = false;
      hud.pointer.clientX = Number.NaN;
      hud.pointer.clientY = Number.NaN;
      try {
        getDesktopWorldHoverOutline?.()?.clear?.();
      } catch {
        // no-op
      }
      markDirty();
    },
    { passive: true }
  );
  dom.addEventListener("pointerdown", onPointerDown, { passive: false });

  // WebXR requestSession must be called synchronously within a user gesture.
  // The normal HUD click path defers to the next rAF (via justPressed → stepInput),
  // which breaks user-activation. A dedicated click listener handles the XR
  // button press with the activation token intact. "click" fires after
  // pointerdown+pointerup but before the next rAF, so clearing justPressed
  // here prevents the deferred path from double-firing.
  if (enterVR || exitVR) {
    dom.addEventListener(
      "click",
      (e) => {
        if (e.button !== 0) return;
        setPointerFromEvent(e);
        if (!hud.pointer.active) return;
        const px = hud.pointer.x;
        const py = hud.pointer.y;
        const xrWin = hud.ui.windows?.xr;
        if (!xrWin) return;
        const xh = xrWin.collapsed ? titleHeightPx : xrWin.h;
        if (!rectContains(xrWin.x, xrWin.y, xrWin.w, xh, px, py)) return;

        if (enterVR && hud.xr.supported && !renderer.xr.isPresenting) {
          hud.pointer.justPressed = false;
          enterVR();
          markDirty();
        } else if (exitVR && renderer.xr.isPresenting) {
          hud.pointer.justPressed = false;
          exitVR();
          markDirty();
        }
      },
      { passive: true }
    );
  }

  dom.addEventListener("wheel", onWheel, { passive: false });
  dom.addEventListener(
    "contextmenu",
    (e) => {
      if (renderer.xr.isPresenting) return;
      setPointerFromEvent(e);
      if (!hud.pointer.active) {
        e.preventDefault();
        return;
      }
      hud.pointer.contextJustRequested = false;
      if (enableContextMenu) {
        hud.pointer.contextJustRequested = true;
      }
      markDirty();
      e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  return { setPointerFromEvent, setPointerFromMouseEvent: setPointerFromEvent };
}
