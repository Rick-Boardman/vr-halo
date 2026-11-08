// SPDX-License-Identifier: Apache-2.0
const STORAGE_VERSION = 1;

/**
 * Create a runtime for persisting HUD window layout (position, size, collapse)
 * to localStorage, keyed per platform (desktop / vr) and app.
 * @param {object} options
 * @param {{ ui?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer for platform detection.
 * @param {string} [options.storageKeyPrefix="hud"] App-specific prefix to namespace keys.
 * @returns {{ saveLayout: () => void, loadLayout: () => Record<string, { x: number, y: number, w: number, h: number, collapsed: boolean }> | null, clearLayout: () => void }}
 */
export function createHudPanelStorageRuntime({ hud, renderer, storageKeyPrefix = "hud" } = {}) {
  function _platformKey() {
    return renderer.xr.isPresenting ? "vr" : "desktop";
  }

  function _storageKey() {
    return `${storageKeyPrefix}-layout-${_platformKey()}-v${STORAGE_VERSION}`;
  }

  function saveLayout() {
    const windows = hud.ui?.windows;
    if (!windows || typeof windows !== "object") return;
    // The viewer they were saved in: a later, different-sized viewer keeps them against the same edges.
    const snap = { __viewer: { w: Math.round(Number(hud.layoutW) || 0), h: Math.round(Number(hud.layoutH) || 0) } };
    for (const [key, win] of Object.entries(windows)) {
      if (Number(win?.y) < -1000) continue;
      snap[key] = {
        x: Math.round(win.x),
        y: Math.round(win.y),
        w: Math.round(win.w),
        h: Math.round(win.h),
        collapsed: !!win.collapsed,
        ...(win.userPlaced ? { userPlaced: true } : {}),
      };
    }
    try {
      localStorage.setItem(_storageKey(), JSON.stringify(snap));
    } catch { /* quota or security error — ignore */ }
  }

  function loadLayout() {
    try {
      const raw = localStorage.getItem(_storageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function clearLayout() {
    try {
      localStorage.removeItem(_storageKey());
    } catch { /* ignore */ }
  }

  return { saveLayout, loadLayout, clearLayout };
}
