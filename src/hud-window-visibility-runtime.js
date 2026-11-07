// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD window-visibility helpers for generic collapse state and Help window show/hide toggling.
 * @param {object} [options={}] Window-visibility runtime dependencies.
 * @param {{ layoutW?: number, layoutH?: number, ui?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to switch desktop-vs-VR help placement behavior.
 * @param {(value: number, min: number, max: number) => number} options.clamp Clamp helper for desktop help-window bounds.
 * @param {() => void} options.markDirty Callback invoked when visibility state changes require rerender.
 * @param {number} options.titleHeightPx Title-bar height used when clamping collapsed help windows.
 * @param {number} options.hiddenX Hidden-X staging coordinate for system windows.
 * @param {number} options.hiddenY Hidden-Y staging coordinate for system windows.
 * @returns {{setWindowCollapsed: (key: string, collapsed: boolean) => void, setWindowHidden: (key: string, hidden: boolean) => void, toggleHelp: () => void}} Visibility helpers for HUD API consumers.
 * Side effects: mutates HUD window collapsed and position state, including cached hidden/restored help-window coordinates.
 */
export function createHudWindowVisibilityRuntime({
  hud,
  renderer,
  clamp,
  markDirty,
  titleHeightPx,
  hiddenX,
  hiddenY,
} = {}) {
  function setWindowCollapsed(key, collapsed) {
    const k = String(key || "");
    const w = hud?.ui?.windows?.[k];
    if (!w) return;
    w.collapsed = !!collapsed;
    markDirty();
  }

  function setWindowHidden(key, hidden) {
    const k = String(key || "");
    const w = hud?.ui?.windows?.[k];
    if (!w) return;

    if (typeof w.setHidden === "function") {
      w.setHidden(!!hidden, { hiddenX, hiddenY });
    } else if (hidden) {
      w._hiddenX = Number(w.x);
      w._hiddenY = Number(w.y);
      w._hiddenCollapsed = !!w.collapsed;
      w.x = hiddenX;
      w.y = hiddenY;
    } else {
      w.collapsed = !!w._hiddenCollapsed;
      if (Number.isFinite(w._hiddenX)) w.x = Number(w._hiddenX);
      if (Number.isFinite(w._hiddenY)) w.y = Number(w._hiddenY);
    }

    markDirty();
  }

  function toggleWindow(key) {
    const w = hud?.ui?.windows?.[key];
    if (!w) return;

    const isHidden = Number(w.y) < -1000;

    if (isHidden) {
      if (renderer.xr.isPresenting) {
        w.collapsed = !!w._hiddenCollapsed;
        w.x = Math.round(hud.layoutW * 0.5 - w.w * 0.5);
        w.y = Math.round(hud.layoutH * 0.5 - w.h * 0.5);
      } else {
        w.collapsed = !!w._hiddenCollapsed;
        const x = Number.isFinite(w._hiddenX) ? Number(w._hiddenX) : Number(w.x);
        const y = Number.isFinite(w._hiddenY) ? Number(w._hiddenY) : Number(w.y);
        w.x = x;
        w.y = y;

        const h = w.collapsed ? titleHeightPx : w.h;
        w.x = clamp(w.x, 0, Math.max(0, hud.layoutW - w.w));
        w.y = clamp(w.y, 0, Math.max(0, hud.layoutH - h));
      }
    } else {
      w._hiddenX = Number(w.x);
      w._hiddenY = Number(w.y);
      w._hiddenCollapsed = !!w.collapsed;
      w.x = hiddenX;
      w.y = hiddenY;
    }
    markDirty();
  }

  function toggleHelp() {
    const w = hud?.ui?.windows?.help;
    if (!w) return;

    const isHidden = Number(w.y) < -1000;

    if (isHidden) {
      if (renderer.xr.isPresenting) {
        w.collapsed = !!w._helpHiddenCollapsed;
        w.x = Math.round(hud.layoutW * 0.5 - w.w * 0.5);
        w.y = Math.round(hud.layoutH * 0.5 - w.h * 0.5);
      } else {
        w.collapsed = !!w._helpHiddenCollapsed;
        const x = Number.isFinite(w._helpHiddenX) ? Number(w._helpHiddenX) : Number(w.x);
        const y = Number.isFinite(w._helpHiddenY) ? Number(w._helpHiddenY) : Number(w.y);
        w.x = x;
        w.y = y;

        const h = w.collapsed ? titleHeightPx : w.h;
        w.x = clamp(w.x, 0, Math.max(0, hud.layoutW - w.w));
        w.y = clamp(w.y, 0, Math.max(0, hud.layoutH - h));
      }
    } else {
      w._helpHiddenX = Number(w.x);
      w._helpHiddenY = Number(w.y);
      w._helpHiddenCollapsed = !!w.collapsed;
      w.x = hiddenX;
      w.y = hiddenY;
    }
    markDirty();
  }

  function toggleSettings() {
    const w = hud?.ui?.windows?.settings;
    if (!w) return;

    const isHidden = Number(w.y) < -1000;

    if (isHidden) {
      if (renderer.xr.isPresenting) {
        w.collapsed = !!w._settingsHiddenCollapsed;
        w.x = Math.round(hud.layoutW * 0.5 - w.w * 0.5);
        w.y = Math.round(hud.layoutH * 0.5 - w.h * 0.5);
      } else {
        w.collapsed = !!w._settingsHiddenCollapsed;
        const x = Number.isFinite(w._settingsHiddenX) ? Number(w._settingsHiddenX) : Number(w.x);
        const y = Number.isFinite(w._settingsHiddenY) ? Number(w._settingsHiddenY) : Number(w.y);
        w.x = x;
        w.y = y;

        const h = w.collapsed ? titleHeightPx : w.h;
        w.x = clamp(w.x, 0, Math.max(0, hud.layoutW - w.w));
        w.y = clamp(w.y, 0, Math.max(0, hud.layoutH - h));
      }
    } else {
      w._settingsHiddenX = Number(w.x);
      w._settingsHiddenY = Number(w.y);
      w._settingsHiddenCollapsed = !!w.collapsed;
      w.x = hiddenX;
      w.y = hiddenY;
    }
    markDirty();
  }

  function restoreAllHidden() {
    const windows = hud?.ui?.windows;
    if (!windows) return false;
    let restored = false;
    for (const key of Object.keys(windows)) {
      const w = windows[key];
      if (!w || Number(w.y) >= -1000) continue;
      if (key === "help" || key === "settings") continue;
      toggleWindow(key);
      restored = true;
    }
    return restored;
  }

  return {
    setWindowCollapsed,
    setWindowHidden,
    toggleWindow,
    toggleHelp,
    toggleSettings,
    restoreAllHidden,
  };
}
