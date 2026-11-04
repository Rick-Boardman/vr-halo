// SPDX-License-Identifier: Apache-2.0
/** Additional z-lift applied to the focused window for interaction stability. */
const FOCUSED_WINDOW_Z_LIFT = 0.00035;
/** Render-order base assigned to the first window in stack order. */
const WINDOW_RENDER_ORDER_BASE = 100;
/** Render-order gap reserved per window so child layers can fit between windows. */
const WINDOW_RENDER_ORDER_STRIDE = 40;

/**
 * Purpose: Create shared HUD render-order helpers for focus z-lift and deterministic window layering.
 * @param {object} [options={}] Render-order helper dependencies.
 * @param {Array<string>} [options.order=[]] Ordered window keys used to compute back-to-front window stacking.
 * @param {(() => (string|null|undefined)) | null} [options.getFocusedWindowKey=null] Callback returning the currently focused window key.
 * @returns {{
 *   zLiftFor: (key: string) => number,
 *   renderOrderBaseFor: (key: string) => number,
 *   setMeshRenderOrder: (mesh: any, ro: number) => void,
 * }} Render-order helper API.
 * Side effects: `setMeshRenderOrder` mutates `mesh.renderOrder` on the provided object when writable.
 */
export function createHudRenderOrderRuntime({
  order = [],
  getFocusedWindowKey = null,
} = {}) {
  const orderIndex = new Map();
  for (let i = 0; i < order.length; i++) {
    orderIndex.set(order[i], i);
  }

  function zLiftFor(key) {
    const focused = typeof getFocusedWindowKey === "function"
      ? getFocusedWindowKey()
      : null;
    return focused === key ? FOCUSED_WINDOW_Z_LIFT : 0;
  }

  function renderOrderBaseFor(key) {
    const idx = orderIndex.get(key);
    const i = Number.isFinite(idx) ? idx : 0;
    return WINDOW_RENDER_ORDER_BASE + i * WINDOW_RENDER_ORDER_STRIDE;
  }

  function setMeshRenderOrder(mesh, ro) {
    if (!mesh) return;
    try {
      mesh.renderOrder = Math.floor(ro);
    } catch {
      // no-op
    }
  }

  return {
    zLiftFor,
    renderOrderBaseFor,
    setMeshRenderOrder,
  };
}
