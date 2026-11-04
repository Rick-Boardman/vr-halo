// SPDX-License-Identifier: Apache-2.0
/**
 * Create lifecycle helpers for HUD window teardown and state cleanup.
 * @param {object} [options={}] Window-lifecycle runtime configuration.
 * @param {any} options.hud Shared HUD model containing window state, object registries, and overlay state.
 * @param {() => void} options.closeContextMenu Callback that closes the overlay context menu when it targets a removed window.
 * @param {() => (string | null | undefined)} options.getActiveDragWindowKey Callback that returns the currently dragged window key, if any.
 * @param {() => void} options.endDragResize Callback that stops active drag/resize interaction when its target window is removed.
 * @param {() => void} options.markDirty Callback that marks HUD state dirty so rendering updates after lifecycle changes.
 * @param {{ delete?: (value: any) => void } | null | undefined} options.troikaTextInstances Registry of live Troika text wrappers used for cleanup bookkeeping.
 * @returns {{destroyWindow: (windowKey: string, options?: {removeData?: boolean}) => boolean}} Lifecycle helpers for removing a HUD window and its associated runtime objects.
 * Side effects: mutates HUD window order/focus/data/object registries, removes meshes from the scene graph, may close overlays, may stop drag state, and marks HUD rendering dirty.
 */
export function createHudWindowLifecycleRuntime({
  hud,
  closeContextMenu,
  getActiveDragWindowKey,
  endDragResize,
  markDirty,
  troikaTextInstances,
} = {}) {
  function destroyWindow(windowKey, { removeData = true } = {}) {
    const key = String(windowKey ?? "");
    if (!key) return false;

    const w = hud.ui.windows?.[key];
    if (!w) return false;

    if (hud.overlay?.contextMenu?.open) {
      const targetKey = hud.overlay.contextMenu.target?.windowKey;
      if (targetKey === key) closeContextMenu?.();
    }
    if (getActiveDragWindowKey?.() === key) endDragResize?.();

    const idx = hud.ui.order.indexOf(key);
    if (idx >= 0) hud.ui.order.splice(idx, 1);
    if (hud.ui.focus === key) {
      hud.ui.focus = hud.ui.order.length
        ? hud.ui.order[hud.ui.order.length - 1]
        : null;
    }

    if (removeData && hud.ui.data && typeof w.linesKey === "function") {
      try {
        delete hud.ui.data[w.linesKey()];
      } catch {
        // no-op
      }
    }

    function removeMesh(mesh) {
      if (!mesh) return;
      try {
        mesh.parent?.remove(mesh);
      } catch {
        // no-op
      }
      // IMPORTANT:
      // Do NOT dispose geometry/material/textures here.
      // The HUD shares GPU resources; disposing shared resources can
      // black-screen the entire HUD/scene in XR.
    }

    function removeHudTextObject(obj) {
      if (!obj) return;
      try {
        troikaTextInstances?.delete?.(obj);
      } catch {
        // no-op
      }
      try {
        if (obj.mesh && obj.mesh.isObject3D) removeMesh(obj.mesh);
      } catch {
        // no-op
      }
    }

    const objs = hud.objects.windows?.[key];
    if (objs) {
      if (objs._troikaColorLayers && objs._troikaColorLayers instanceof Map) {
        for (const layer of objs._troikaColorLayers.values()) removeHudTextObject(layer);
        try {
          objs._troikaColorLayers.clear();
        } catch {
          // no-op
        }
      }

      if (objs._troikaContentText) {
        removeHudTextObject(objs._troikaContentText);
        try {
          objs._troikaContentText = null;
        } catch {
          // no-op
        }
      }

      for (const value of Object.values(objs)) {
        if (!value) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            if (!item) continue;
            if (item.isMesh || item.isInstancedMesh) {
              removeMesh(item);
              continue;
            }
            if (item.mesh && item.mesh.isObject3D) removeHudTextObject(item);
          }
          continue;
        }
        if (value.isMesh || value.isInstancedMesh) {
          removeMesh(value);
          continue;
        }
        if (value.mesh && value.mesh.isObject3D) removeHudTextObject(value);
      }
    }

    try {
      delete hud.objects.windows[key];
    } catch {
      // no-op
    }
    try {
      delete hud.ui.windows[key];
    } catch {
      // no-op
    }

    markDirty?.();
    return true;
  }

  return {
    destroyWindow,
  };
}
