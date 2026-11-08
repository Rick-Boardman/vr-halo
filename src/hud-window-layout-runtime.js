// SPDX-License-Identifier: Apache-2.0
import { HUD_WINDOW_EDGE_MARGIN_PX } from "./hud-layout-policy.js";
import { axisAnchor, axisPlace, placeSaved } from "./hud-window-anchor.js";

/**
 * Create shared HUD window-layout helpers for desktop clamping and one-time default window placement.
 * @param {object} [options={}] Window-layout runtime dependencies.
 * @param {{ layoutW?: number, layoutH?: number, xr?: { supported?: boolean }, ui?: { windows?: Record<string, any>, order?: Array<string>, _layoutInitialized?: boolean, windowClampMode?: string, windowClampMinVisiblePx?: number } }} options.hud Shared HUD state model.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to branch desktop-versus-VR layout behavior.
 * @param {(value: number, min: number, max: number) => number} options.clamp Scalar clamp helper.
 * @param {number} options.titleHeightPx Window title-bar height in pixels.
 * @param {number} options.rightX Right-column X coordinate used for pinned VR windows.
 * @param {number} options.hiddenY Hidden staging Y coordinate used for off-screen windows.
 * @param {number} options.windowClampMinVisiblePxDefault Default minimum visible pixel threshold for titlebar clamp mode.
 * @param {(() => Record<string, { x: number, y: number, w: number, h: number, collapsed: boolean }> | null)} [options.loadLayout] Optional callback that returns saved window positions from storage (e.g. localStorage). When present and returning non-null, the saved layout is applied instead of hardcoded defaults.
 * @returns {{ ensureDefaultLayout: () => void, clampWindowToBounds: (key: string, win: any) => void }} Helpers that apply default window layout and desktop clamp policy.
 * Side effects: mutates window placement/size fields and `_layoutInitialized` state on the shared HUD model.
 */
export function createHudWindowLayoutRuntime({
  hud,
  renderer,
  clamp,
  titleHeightPx,
  rightX,
  hiddenY,
  windowClampMinVisiblePxDefault,
  loadLayout,
} = {}) {
  function clampWindowToBounds(key, win) {
    if (renderer.xr.isPresenting) return;
    if (Number(win?.y) < -1000) return;
    if (key === "xr" && !hud.xr.supported) return;

    const h = win.collapsed ? titleHeightPx : win.h;
    const forceStrict = key === "hotbar" || (key === "xr" && hud.xr.supported);
    const mode = forceStrict ? "strict" : String(hud.ui?.windowClampMode ?? "strict");
    const minVisible = clamp(
      Number(hud.ui?.windowClampMinVisiblePx ?? windowClampMinVisiblePxDefault),
      8,
      4000
    );

    if (mode === "none") return;

    if (mode === "titlebar") {
      const minX = clamp(minVisible, 8, Math.max(8, win.w));
      const minTitle = clamp(minVisible, 8, titleHeightPx);

      win.x = clamp(win.x, -(win.w - minX), hud.layoutW - minX);
      win.y = clamp(win.y, -(titleHeightPx - minTitle), hud.layoutH - minTitle);
      return;
    }

    win.x = clamp(win.x, 0, Math.max(0, hud.layoutW - win.w));
    win.y = clamp(win.y, 0, Math.max(0, hud.layoutH - h));
  }

  // Support is checked after the first layout. Parking the Enter VR window before that
  // check returns, then saving, drops it: a hidden window is not stored, and a later
  // layout will not invent it. Remember the on-screen place, and put it back once a
  // headset can start a session. A place that was only the off-screen preset is clamped
  // to the right edge, clear of a status panel in the top left.
  function parkXrUntilSupported(xrWin) {
    if (!xrWin || hud.xr.supported) return false;
    if (Number(xrWin.y) >= -1000) {
      xrWin._hiddenX = xrWin.x;
      xrWin._hiddenY = xrWin.y;
    }
    xrWin.x = rightX;
    xrWin.y = hiddenY;
    return true;
  }

  function restoreParkedXr(xrWin) {
    if (!xrWin || !hud.xr.supported) return;
    if (Number(xrWin.y) >= -1000) return;
    const backX = Number(xrWin._hiddenX);
    const backY = Number(xrWin._hiddenY);
    if (Number.isFinite(backX) && Number.isFinite(backY) && backY >= -1000) {
      xrWin.x = backX;
      xrWin.y = backY;
    } else {
      xrWin.x = rightX;
      xrWin.y = 0;
    }
  }

  function ensureDefaultLayout() {
    if (hud.ui._layoutInitialized) return;

    const windows = hud.ui?.windows;
    const order = hud.ui?.order;
    if (!windows || typeof windows !== "object") return;
    if (!Array.isArray(order) || order.length === 0) return;

    const W = hud.layoutW;
    const H = hud.layoutH;

    // --- Try restoring layout from localStorage ---
    const saved = typeof loadLayout === "function" ? loadLayout() : null;
    if (saved) {
      for (const key of order) {
        const win = windows[key];
        const s = saved[key];
        if (!win || !s) continue;
        if (Number.isFinite(s.w)) win.w = Math.max(win.minW, s.w);
        if (Number.isFinite(s.h)) win.h = Math.max(win.minH, s.h);
        if (typeof s.collapsed === "boolean") win.collapsed = s.collapsed;
        const height = win.collapsed ? titleHeightPx : win.h;
        if (Number.isFinite(s.x)) win.x = placeSaved(s.x, win.w, Number(saved.__viewer?.w), W);
        if (Number.isFinite(s.y)) win.y = placeSaved(s.y, height, Number(saved.__viewer?.h), H);
        if (s.userPlaced) win.userPlaced = true;
      }
      if (!parkXrUntilSupported(windows.xr)) restoreParkedXr(windows.xr);
      for (const key of order) {
        const win = windows?.[key];
        if (win) clampWindowToBounds(key, win);
      }
      hud.ui._layoutInitialized = true;
      return;
    }

    // --- Hardcoded default placement ---

    const xrWin = windows.xr;
    if (xrWin) {
      if (!parkXrUntilSupported(xrWin) && hud.xr.supported) {
        if (Number(xrWin.y) < -1000) {
          restoreParkedXr(xrWin);
        } else {
          xrWin.x = Math.round(0.01 * W);
          xrWin.y = Math.round(0.02 * H);
          // Keep the stone-frame floor. A 26% cap on a narrow viewer used to
          // squash Enter VR until the corners had nothing to draw around.
          const frameW = Math.max(Number(xrWin.minW) || 0, Math.min(Number(xrWin.w) || 0, 0.26 * W));
          xrWin.w = Math.round(frameW);
        }
      }
    }

    const chat = windows.chat;
    if (chat) {
      if (renderer.xr.isPresenting) {
        chat.x = -1000;
        chat.y = -100;
      } else {
        chat.x = Math.round(0.01 * W);
        const pushY = xrWin && hud.xr.supported ? xrWin.h + 12 : 0;
        chat.y = Math.round(0.02 * H) + pushY;
        chat.w = Math.round(Math.min(chat.w, 0.56 * W));
      }
    }

    const status = windows.status;
    if (status) {
      // Status sits in the top-left corner by default (from Aether Forge,
      // 2026-10; the default since the October 2026 defaults). An app that
      // wants the old place sets `hud.ui.data.statusPlacement = "top"`
      // (top, a third of the way in).
      if ((hud.ui?.data?.statusPlacement ?? "top-left") === "top-left") {
        status.x = HUD_WINDOW_EDGE_MARGIN_PX;
        status.y = HUD_WINDOW_EDGE_MARGIN_PX;
        status.w = Math.round(Math.min(status.w, Math.max(220, 0.42 * W)));
      } else {
        status.x = Math.round(0.33 * W);
        status.y = Math.round(0.02 * H);
        status.w = Math.round(Math.min(status.w, 0.4 * W));
      }
      status.h = Math.max(status.minH, status.h);
    }

    const progress = windows.progress;
    if (progress) {
      if (renderer.xr.isPresenting) {
        progress.x = rightX;
        progress.y = 150;
      } else {
        progress.x = Math.round(W - progress.w - HUD_WINDOW_EDGE_MARGIN_PX);
        progress.y = Math.round(0.14 * H);
      }
    }

    const target = windows.target;
    if (target) {
      if (renderer.xr.isPresenting) {
        target.x = 1300;
        target.y = -20;
      } else {
        target.x = Math.round(0.56 * W);
        target.y = Math.round(0.02 * H);
      }
    }

    const buffs = windows.buffs;
    if (buffs) {
      if (renderer.xr.isPresenting) {
        buffs.x = rightX;
        buffs.y = -150;
      } else {
        buffs.x = Math.round(W - buffs.w - HUD_WINDOW_EDGE_MARGIN_PX);
        buffs.y = Math.round(0.02 * H);
      }
    }

    const hotbar = windows.hotbar;
    if (hotbar && Number(hotbar.y) >= -1000) {
      if (renderer.xr.isPresenting) {
        hotbar.x = rightX;
        hotbar.y = -10;
      } else {
        if ((hud.ui?.data?.hotbarPlacement ?? "bottom") === "bottom") {
          // A full-width hotbar along the bottom edge, centred (from Aether
          // Forge, 2026-10; the default since the October 2026 defaults). An
          // app that wants the right edge sets `hotbarPlacement = "right"`.
          const maxW = Math.max(280, W - 2 * HUD_WINDOW_EDGE_MARGIN_PX);
          hotbar.minW = Math.min(hotbar.minW || maxW, maxW);
          hotbar.w = Math.min(hotbar.w, maxW);
          hotbar.x = Math.round((W - hotbar.w) / 2);
          hotbar.y = Math.round(H - hotbar.h - HUD_WINDOW_EDGE_MARGIN_PX);
        } else {
          hotbar.x = Math.round(W - hotbar.w - HUD_WINDOW_EDGE_MARGIN_PX);
          hotbar.y = Math.round(0.4 * H);
        }
      }
    }

    const debug = windows.debug;
    if (debug) {
      if (renderer.xr.isPresenting) {
        debug.x = rightX;
        debug.y = 420;
      } else {
        debug.x = Math.round(W - debug.w - HUD_WINDOW_EDGE_MARGIN_PX);

        let y = Math.round(0.02 * H);
        if (xrWin && hud.xr.supported) y = xrWin.y + xrWin.h + 12;
        if (progress) y = Math.max(y, progress.y + progress.h + HUD_WINDOW_EDGE_MARGIN_PX);
        debug.y = y;
      }
    }

    const skills = windows.skills;
    if (skills) {
      if (renderer.xr.isPresenting) {
        skills.x = -1000;
        skills.y = 400;
        skills.w = 500;
      } else {
        skills.x = Math.round(0.03 * W);
        skills.y = Math.round(0.4 * H);
      }
    }

    const event = windows.event;
    if (event) {
      if (renderer.xr.isPresenting) {
        event.x = -1000;
        event.y = 200;
      } else {
        event.x = Math.round(0.01 * W);
        event.y = Math.round(H - event.h - HUD_WINDOW_EDGE_MARGIN_PX);
      }
    }

    const inv = windows.inventory;
    if (inv) {
      if (renderer.xr.isPresenting) {
        inv.x = 1500;
        inv.y = 200;
      } else {
        inv.x = Math.round(W - inv.w - HUD_WINDOW_EDGE_MARGIN_PX);
        inv.y = Math.round(H - inv.h - 40);
      }
    }

    for (const key of order) {
      const win = windows?.[key];
      if (win) clampWindowToBounds(key, win);
    }
    hud.ui._layoutInitialized = true;
  }

  /**
   * The viewer changed size: every window keeps its place relative to the viewer's edges (hud-window-anchor.js). The
   * anchor is kept while the window has not been moved, so a window clamped in a small viewer returns to its place in
   * a larger one.
   */
  function reanchorWindows(previousW, previousH) {
    if (renderer.xr.isPresenting) return;
    const W = Number(hud.layoutW);
    const H = Number(hud.layoutH);
    if (!(W > 0 && H > 0 && previousW > 0 && previousH > 0)) return;
    if (W === previousW && H === previousH) return;
    for (const [key, win] of Object.entries(hud.ui?.windows ?? {})) {
      if (!win) continue;
      const hidden = Number(win.y) < -1000;
      if (hidden && !(Number.isFinite(win._hiddenX) && Number.isFinite(win._hiddenY))) continue;
      if (key === "hotbar" && !hidden && (hud.ui?.data?.hotbarPlacement ?? "bottom") === "bottom") {
        const maxW = Math.max(280, W - 2 * HUD_WINDOW_EDGE_MARGIN_PX);
        win.minW = Math.min(win.minW || maxW, maxW);
        win.w = Math.min(win.w, maxW);
      }
      const x = hidden ? Number(win._hiddenX) : Number(win.x);
      const y = hidden ? Number(win._hiddenY) : Number(win.y);
      const height = win.collapsed ? titleHeightPx : Number(win.h);
      const kept = win._viewerAnchor;
      const anchorX = kept && Math.abs(x - kept.atX) <= 1 ? kept.x : axisAnchor(x, Number(win.w), previousW);
      const anchorY = kept && Math.abs(y - kept.atY) <= 1 ? kept.y : axisAnchor(y, height, previousH);
      const nextX = axisPlace(anchorX, Number(win.w), W);
      const nextY = axisPlace(anchorY, height, H);
      if (hidden) {
        win._hiddenX = clamp(nextX, 0, Math.max(0, W - Number(win.w)));
        win._hiddenY = clamp(nextY, 0, Math.max(0, H - height));
        win._viewerAnchor = { x: anchorX, y: anchorY, atX: win._hiddenX, atY: win._hiddenY };
      } else {
        win.x = nextX;
        win.y = nextY;
        clampWindowToBounds(key, win);
        win._viewerAnchor = { x: anchorX, y: anchorY, atX: Number(win.x), atY: Number(win.y) };
      }
    }
  }

  return {
    ensureDefaultLayout,
    clampWindowToBounds,
    reanchorWindows,
  };
}
