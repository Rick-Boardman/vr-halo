// SPDX-License-Identifier: Apache-2.0
const DEFAULT_WINDOW_PLANE_Z_LOCAL = 0.002;

/**
 * Create shared HUD helpers for resolving local window interaction plane depth.
 * @param {object} [options={}] Window-plane depth runtime dependencies.
 * @param {(windowKey: string) => { vrZ?: number } | null | undefined} [options.getWindowByKey] Resolver for canonical HUD windows by key.
 * @param {number} [options.basePlaneZLocal=DEFAULT_WINDOW_PLANE_Z_LOCAL] Base local Z depth used when no per-window VR offset exists.
 * @returns {{ getWindowPlaneZLocal: (windowKey: string) => number }} API that resolves local plane depth for a window key.
 * Side effects: none.
 */
export function createHudWindowPlaneZRuntime({
  getWindowByKey,
  basePlaneZLocal = DEFAULT_WINDOW_PLANE_Z_LOCAL,
} = {}) {
  function getWindowPlaneZLocal(windowKey) {
    const windowState = windowKey ? getWindowByKey?.(windowKey) : null;
    const base = Number(basePlaneZLocal);
    const safeBase = Number.isFinite(base) ? base : DEFAULT_WINDOW_PLANE_Z_LOCAL;
    const vrZ = Number(windowState?.vrZ ?? 0);
    return Number.isFinite(vrZ) ? safeBase + vrZ : safeBase;
  }

  return {
    getWindowPlaneZLocal,
  };
}
