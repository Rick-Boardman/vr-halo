// SPDX-License-Identifier: Apache-2.0

/** Retain user-adjusted floating window frames across host hide/show actions. */
export function createHudFloatingPanels({ hudSystem, panelWindowOptions, resolveWindowFrame } = {}) {
  const saved = new Map();
  const read = key => hudSystem.hud?.ui?.windows?.[key] ?? null;
  function ensurePanelWindow(key) {
    const win = read(key);
    if (win) return win;
    const base = panelWindowOptions[key];
    if (!base) return null;
    const frame = saved.get(key) ?? resolveWindowFrame?.(key);
    return hudSystem.createWindow(key, {
      ...base, ...frame, title: base.title, onClose: base.onClose,
    });
  }
  function destroyPanelWindow(key) {
    const win = read(key);
    if (win) {
      const frame = {};
      for (const key of ["x", "y", "w", "h", "minW", "minH"]) {
        frame[key] = Number.isFinite(win[key]) ? Number(win[key]) : undefined;
      }
      frame.scrollMode = typeof win.scrollMode === "string" && win.scrollMode.trim() ? win.scrollMode : undefined;
      saved.set(key, frame);
    }
    hudSystem.destroyWindow?.(key);
  }
  return { ensurePanelWindow, destroyPanelWindow, setWindowVisible(key, visible) {
    if (visible) ensurePanelWindow(key); else destroyPanelWindow(key);
  } };
}
