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
    const layoutW = Math.max(1, hud.layoutW);
    const layoutH = Math.max(1, hud.layoutH);

    const keys = [];
    const collapsedKeys = [];
    for (const key of order) {
      const w = windows[key];
      if (!w) continue;
      // Enter VR is parked until the headset check finishes. A session can
      // start on that same turn, and this window is the Exit VR control.
      if (key === "xr" && w.y < -1000) w.y = pad;
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
    let totalW = 0;
    for (const key of keys) {
      totalW += windows[key]?.w ?? 320;
    }
    const avgW = n ? totalW / n : 0;
    const usableW = Math.max(1, layoutW - pad * 2);

    let cols = Math.max(1, Math.floor(usableW / (avgW + gapX)));
    cols = Math.min(cols, Math.max(1, n));

    const rows = Math.max(1, Math.ceil(n / cols));
    // Equal-height cells let tall application windows overlap. Size each row
    // and column from its actual windows, and let the sphere extend beyond the
    // forward rectangle rather than clamping multiple windows onto one edge.
    const colWidths = Array(cols).fill(0);
    const rowHeights = Array(rows).fill(0);
    for (let i = 0; i < n; i++) {
      const win = windows[keys[i]];
      colWidths[i % cols] = Math.max(colWidths[i % cols], win.w);
      rowHeights[Math.floor(i / cols)] = Math.max(rowHeights[Math.floor(i / cols)], win.h);
    }
    const gridW = colWidths.reduce((a, b) => a + b, 0) + gapX * (cols - 1);
    const gridH = rowHeights.reduce((a, b) => a + b, 0) + gapY * (rows - 1);
    const startX = (layoutW - gridW) / 2;
    const startY = Math.max(-900, (layoutH - gridH) / 2);

    for (let i = 0; i < n; i++) {
      const key = keys[i];
      const w = windows[key];
      if (!w) continue;

      const col = i % cols;
      const row = Math.floor(i / cols);

      const h = w.collapsed ? titleHeightPx : w.h;
      const cellX = startX + colWidths.slice(0, col).reduce((a, b) => a + b, 0) + gapX * col;
      const cellY = startY + rowHeights.slice(0, row).reduce((a, b) => a + b, 0) + gapY * row;
      w.x = cellX + (colWidths[col] - w.w) * 0.5;
      w.y = cellY + (rowHeights[row] - h) * 0.5;
    }

    let collapsedY = Math.max(layoutH - titleHeightPx - pad, startY + gridH + gapY);
    let collapsedX = pad;
    for (const key of collapsedKeys) {
      const w = windows[key];
      if (!w) continue;
      w.x = collapsedX;
      w.y = collapsedY;
      collapsedX += w.w + gapX * 0.5;
      if (collapsedX + w.w > layoutW - pad) {
        collapsedX = pad;
        collapsedY += titleHeightPx + gapY;
      }
    }

    hud.ui._vrAutoLayoutDone = true;
    markDirty();
  }

  return {
    autoLayoutWindowsForVr,
  };
}
