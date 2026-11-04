// SPDX-License-Identifier: Apache-2.0
import { HUD_WINDOW_EDGE_MARGIN_PX } from "./hud-layout-policy.js";

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
        if (Number.isFinite(s.x)) win.x = s.x;
        if (Number.isFinite(s.y)) win.y = s.y;
        if (Number.isFinite(s.w)) win.w = Math.max(win.minW, s.w);
        if (Number.isFinite(s.h)) win.h = Math.max(win.minH, s.h);
        if (typeof s.collapsed === "boolean") win.collapsed = s.collapsed;
      }
      // Hide xr window if unsupported (regardless of saved data).
      const xrWin = windows.xr;
      if (xrWin && !hud.xr.supported) {
        xrWin.x = rightX;
        xrWin.y = hiddenY;
      }
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
      if (hud.xr.supported) {
        xrWin.x = Math.round(0.01 * W);
        xrWin.y = Math.round(0.02 * H);
        xrWin.w = Math.round(Math.min(xrWin.w, 0.26 * W));
      } else {
        xrWin.x = rightX;
        xrWin.y = hiddenY;
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

  return {
    ensureDefaultLayout,
    clampWindowToBounds,
  };
}
