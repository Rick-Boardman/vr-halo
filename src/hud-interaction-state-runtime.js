// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD interaction-state helpers for focus ordering, overlay virtual-window state, and world-control gating.
 * @param {object} [options={}] Interaction-state runtime dependencies.
 * @param {{ ui?: { focus?: string | null, order?: Array<string>, windows?: Record<string, any>, _vrVirtualWindows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {() => void} options.markDirty Callback invoked when focus/order state changes require a rerender.
 * @param {(enabled: boolean) => void} [options.setWorldControlsEnabled] Optional callback that toggles external world controls.
 * @param {() => boolean} [options.getWorldControlsEnabled] Optional callback returning the current external world-control state.
 * @param {{ enabled?: boolean } | null} [options.worldControls] Optional world-controls object with mutable enabled flag.
 * @returns {{setHudInteractionActive: (active: boolean) => void, setHudHoverActive: (active: boolean) => void, getHudInteractionActive: () => boolean, bringToFront: (key: string) => void, setVrVirtualWindowState: (key: string, state: any) => void}} Interaction-state helpers used by HUD input and overlays.
 * Side effects: mutates external control enabled state, HUD focus/order state, and virtual-window placement registry.
 */
export function createHudInteractionStateRuntime({
  hud,
  markDirty,
  setWorldControlsEnabled,
  getWorldControlsEnabled,
  worldControls,
} = {}) {
  let hudInteractionActive = false;
  let hudHoverActive = false;
  let restoreControlsEnabled = null;

  function getExternalControlsEnabled() {
    try {
      if (typeof getWorldControlsEnabled === "function") {
        return !!getWorldControlsEnabled();
      }
      if (worldControls && typeof worldControls.enabled === "boolean") {
        return !!worldControls.enabled;
      }
    } catch {
      // no-op
    }
    return null;
  }

  function setExternalControlsEnabled(enabled) {
    try {
      if (typeof setWorldControlsEnabled === "function") {
        setWorldControlsEnabled(!!enabled);
        return;
      }
      if (worldControls && typeof worldControls.enabled === "boolean") {
        worldControls.enabled = !!enabled;
      }
    } catch {
      // no-op
    }
  }

  function syncExternalControls() {
    const shouldCaptureControls = hudInteractionActive;
    if (shouldCaptureControls) {
      if (restoreControlsEnabled == null) {
        restoreControlsEnabled = getExternalControlsEnabled();
      }
      setExternalControlsEnabled(false);
      return;
    }

    const nextControlsEnabled = restoreControlsEnabled == null ? true : restoreControlsEnabled;
    restoreControlsEnabled = null;
    setExternalControlsEnabled(nextControlsEnabled);
  }

  function setHudInteractionActive(active) {
    const next = !!active;
    if (hudInteractionActive === next) return;
    hudInteractionActive = next;
    syncExternalControls();
  }

  function setHudHoverActive(active) {
    const next = !!active;
    if (hudHoverActive === next) return;
    hudHoverActive = next;
  }

  function bringToFront(key) {
    if (!key) return;
    const prevFocus = hud.ui.focus;
    if (prevFocus && prevFocus !== key) {
      try {
        hud.ui.windows?.[prevFocus]?._onHudBlur?.();
      } catch {
        // no-op
      }
    }
    hud.ui.focus = key;
    const idx = hud.ui.order.indexOf(key);
    if (idx >= 0) {
      hud.ui.order.splice(idx, 1);
      hud.ui.order.push(key);
    }
    markDirty();
  }

  function setVrVirtualWindowState(key, state) {
    if (!key || !hud.ui) return;
    if (!hud.ui._vrVirtualWindows) {
      if (!state) return;
      hud.ui._vrVirtualWindows = {};
    }

    if (state && typeof state === "object") {
      hud.ui._vrVirtualWindows[key] = state;
      return;
    }

    delete hud.ui._vrVirtualWindows[key];
  }

  return {
    setHudInteractionActive,
    setHudHoverActive,
    getHudInteractionActive: () => hudInteractionActive,
    bringToFront,
    setVrVirtualWindowState,
  };
}
