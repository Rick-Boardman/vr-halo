// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD VR auto-layout helpers for non-pinned window placement and collapsed-window bottom staging.
 * @param {object} [options={}] VR auto-layout runtime dependencies.
 * @param {{ layoutW?: number, layoutH?: number, ui?: { order?: Array<string>, windows?: Record<string, any>, _vrAutoLayoutDone?: boolean } }} options.hud Shared HUD state model.
 * @param {(value: number, min: number, max: number) => number} options.clamp Clamp helper for keeping windows within layout bounds.
 * @param {() => void} options.markDirty Callback invoked when auto-layout mutates window state.
 * @param {number} options.rightX Right-column X coordinate used for pinned VR windows.
 * @param {number} options.outerPaddingPx Outer padding around the VR layout surface.
 * @param {number} options.interWindowGapXPx Horizontal inter-window gap for VR auto-layout.
 * @param {number} options.interWindowGapYPx Vertical inter-window gap for VR auto-layout.
 * @param {number} options.titleHeightPx Title-bar height used when laying out collapsed windows.
 * @returns {{ autoLayoutWindowsForVr: () => void }} VR auto-layout helper used by HUD mode transitions and per-frame updates.
 * Side effects: mutates HUD window x/y/w placement, pinned-window coordinates, and `_vrAutoLayoutDone` state.
 */
export function createHudVrAutoLayoutRuntime({
  hud,
  clamp,
  markDirty,
  rightX,
  outerPaddingPx,
  interWindowGapXPx,
  interWindowGapYPx,
  titleHeightPx,
} = {}) {
  function autoLayoutWindowsForVr() {
    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    const windows = hud.ui?.windows;
    if (!windows || !order.length) return;

    const pinned = {
      buffs: { x: rightX, y: -150 },
      hotbar: { x: rightX, y: -10 },
      progress: { x: rightX, y: 150 },
      debug: { x: rightX, y: 420 },
      chat: { x: -1000, y: -100 },
      event: { x: -1000, y: 200 },
      skills: { x: -1000, y: 400, w: 500 },
      target: { x: 1300, y: -20 },
      inventory: { x: 1500, y: 200 },
    };

    const pad = outerPaddingPx;
    const gapX = interWindowGapXPx;
    const gapY = interWindowGapYPx;
    const top = pad;
    const layoutW = Math.max(1, hud.layoutW);
    const layoutH = Math.max(1, hud.layoutH);

    const keys = [];
    const collapsedKeys = [];
    for (const key of order) {
      const w = windows[key];
      if (!w) continue;
      if (w.y < -1000) continue;

      const p = pinned[key];
      if (p) {
        w.x = p.x;
        w.y = p.y;
        if (Number.isFinite(p.w) && p.w > 0) w.w = p.w;
        continue;
      }

      if (w.collapsed) {
        collapsedKeys.push(key);
        continue;
      }
      keys.push(key);
    }
    const n = keys.length;
    if (!n) return;

    let totalW = 0;
    for (const key of keys) {
      totalW += windows[key]?.w ?? 320;
    }
    const avgW = totalW / n;
    const usableW = Math.max(1, layoutW - pad * 2);
    const usableH = Math.max(1, layoutH - top - pad);

    let cols = Math.max(1, Math.floor(usableW / (avgW + gapX)));
    cols = Math.min(cols, n);

    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    for (let i = 0; i < n; i++) {
      const key = keys[i];
      const w = windows[key];
      if (!w) continue;

      const col = i % cols;
      const row = Math.floor(i / cols);

      const h = w.collapsed ? titleHeightPx : w.h;
      const maxX = Math.max(pad, layoutW - w.w - pad);
      const maxY = Math.max(top, layoutH - h - pad);

      const cellX = pad + col * cellW;
      const cellY = top + row * cellH;
      const desiredX = cellX + (cellW - w.w) * 0.5;
      const desiredY = cellY + (cellH - h) * 0.5;

      w.x = clamp(desiredX, pad, maxX);
      w.y = clamp(desiredY, top, maxY);
    }

    const collapsedY = layoutH - titleHeightPx - pad;
    let collapsedX = pad;
    for (const key of collapsedKeys) {
      const w = windows[key];
      if (!w) continue;
      w.x = collapsedX;
      w.y = collapsedY;
      collapsedX += w.w + gapX * 0.5;
      if (collapsedX + w.w > layoutW - pad) {
        collapsedX = pad;
      }
    }

    hud.ui._vrAutoLayoutDone = true;
    markDirty();
  }

  return {
    autoLayoutWindowsForVr,
  };
}
