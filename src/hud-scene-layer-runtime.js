// SPDX-License-Identifier: Apache-2.0
/** Render-order offset a scene layer takes inside the stride of the window directly below it (window layers use 0-29). */
const SCENE_LAYER_RENDER_ORDER_OFFSET = 30;
/** Render order a scene layer takes when no window is below it (the first window's base is 100). */
const SCENE_LAYER_BOTTOM_RENDER_ORDER = 60;

/**
 * Purpose: let scene content (a host's selected 3D card, for example) take a place in the desktop HUD window stack.
 * A raised layer draws above the windows that were open when it was raised and below every window brought to the
 * front, opened or focused after it, as a window would. Where it is drawn over a window it also owns the pointer:
 * desktop presses, wheel, double-click and context menu at that point go to the scene, not to the window beneath.
 * In XR the HUD stack is not used: layers are applied as lowered (`apply(null)`) while presenting.
 * @param {object} options Runtime dependencies.
 * @param {any} options.hud Shared HUD model (`ui.order`, `ui.windows`, `ui.focus`).
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer whose XR state disables layers.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number) => boolean} options.rectContains Rectangle hit test.
 * @param {number} options.titleHeightPx Height of a collapsed window.
 * @param {number} options.groupRenderOrder Render order of the HUD's group; a layer draws in the same group.
 * @param {() => void} options.markDirty Marks the HUD for re-render.
 * @returns {{
 *   raiseSceneLayer: (key: string, layer: { containsPoint: (px: number, py: number) => boolean, apply: (order: { groupOrder: number, renderOrder: number } | null) => void }) => void,
 *   lowerSceneLayer: (key: string) => boolean,
 *   isSceneLayerRaised: (key: string) => boolean,
 *   noteWindowRaised: (key: string) => void,
 *   sceneLayerOwnsPoint: (px: number, py: number) => boolean,
 *   syncSceneLayers: (renderOrderBaseFor: (key: string) => number) => void,
 * }} Scene layer API.
 * Side effects: raising a layer clears window focus (the focused window drops to its place in the stack); layers'
 * `apply` callbacks are called when their render order changes.
 */
export function createHudSceneLayerRuntime({ hud, renderer, rectContains, titleHeightPx, groupRenderOrder, markDirty } = {}) {
  const layers = new Map();

  function presenting() {
    return !!renderer?.xr?.isPresenting;
  }

  function raiseSceneLayer(key, { containsPoint, apply } = {}) {
    const id = String(key ?? "").trim();
    if (!id) throw new Error("hud scene layer: a key is required");
    if (typeof containsPoint !== "function" || typeof apply !== "function") {
      throw new Error(`hud scene layer ${id}: containsPoint and apply are required`);
    }
    const previous = layers.get(id);
    if (previous && previous.apply !== apply) previous.apply(null);
    const focus = hud.ui?.focus;
    if (focus) {
      try {
        hud.ui.windows?.[focus]?._onHudBlur?.();
      } catch {
        // no-op: a window's blur hook must not stop the raise
      }
      hud.ui.focus = null;
    }
    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    layers.set(id, { containsPoint, apply, below: new Set(order), applied: undefined });
    markDirty?.();
  }

  function lowerSceneLayer(key) {
    const id = String(key ?? "").trim();
    const layer = layers.get(id);
    if (!layer) return false;
    layers.delete(id);
    layer.apply(null);
    markDirty?.();
    return true;
  }

  function noteWindowRaised(key) {
    for (const layer of layers.values()) layer.below.delete(key);
  }

  function topWindowAt(px, py) {
    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    const windows = hud.ui?.windows ?? {};
    const contains = key => {
      const win = windows[key];
      if (!win) return false;
      return rectContains(win.x, win.y, win.w, win.collapsed ? titleHeightPx : win.h, px, py);
    };
    for (let i = order.length - 1; i >= 0; i -= 1) {
      const win = windows[order[i]];
      if ((win?.dragging || win?.resizing) && contains(order[i])) return order[i];
    }
    if (hud.ui?.focus && contains(hud.ui.focus)) return hud.ui.focus;
    for (let i = order.length - 1; i >= 0; i -= 1) if (contains(order[i])) return order[i];
    return null;
  }

  function sceneLayerOwnsPoint(px, py) {
    if (!layers.size || presenting() || !Number.isFinite(px) || !Number.isFinite(py)) return false;
    const key = topWindowAt(px, py);
    if (!key) return false;
    for (const layer of layers.values()) {
      if (layer.below.has(key) && layer.containsPoint(px, py)) return true;
    }
    return false;
  }

  function syncSceneLayers(renderOrderBaseFor) {
    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    // A window below a layer cannot hold focus (focus draws on top): closing the window above it hands focus down.
    const focus = hud.ui?.focus;
    if (focus && !presenting() && [...layers.values()].some(layer => layer.below.has(focus))) {
      try {
        hud.ui.windows?.[focus]?._onHudBlur?.();
      } catch {
        // no-op
      }
      hud.ui.focus = null;
    }
    for (const layer of layers.values()) {
      let next = null;
      if (!presenting()) {
        let top = -Infinity;
        for (const key of order) {
          if (layer.below.has(key) && hud.ui?.windows?.[key]) top = Math.max(top, renderOrderBaseFor(key));
        }
        next = {
          groupOrder: groupRenderOrder,
          renderOrder: Number.isFinite(top) ? top + SCENE_LAYER_RENDER_ORDER_OFFSET : SCENE_LAYER_BOTTOM_RENDER_ORDER,
        };
      }
      const same = next === layer.applied
        || (next && layer.applied && next.groupOrder === layer.applied.groupOrder && next.renderOrder === layer.applied.renderOrder);
      if (same) continue;
      layer.applied = next;
      layer.apply(next);
    }
  }

  return {
    raiseSceneLayer,
    lowerSceneLayer,
    isSceneLayerRaised: key => layers.has(String(key ?? "").trim()),
    noteWindowRaised,
    sceneLayerOwnsPoint,
    syncSceneLayers,
  };
}
