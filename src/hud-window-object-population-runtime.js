// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers that populate canonical per-window mesh/text object sets.
 * @param {object} [options={}] Window-object population runtime dependencies.
 * @param {{ ui?: { order?: Array<string>, windows?: Record<string, any> }, objects?: { windows?: Record<string, any> } }} options.hud Shared HUD model containing window order/state and object storage.
 * @param {(options: { withMin?: boolean, withResize?: boolean, withScroll?: boolean, panelBgColor?: number | string, panelBgOpacity?: number, titleBarColor?: number | string, titleBarOpacity?: number, contentBgColor?: number | string, contentBgOpacity?: number }) => Record<string, any>} options.createWindowObjects Factory that allocates object sets for one window.
 * @param {number | string} options.defaultPanelBgColor Default panel background color.
 * @param {number} options.defaultPanelBgOpacity Default panel background opacity.
 * @param {number | string} options.defaultTitleBarColor Default title-bar color.
 * @param {number} options.defaultTitleBarOpacity Default title-bar opacity.
 * @param {number | string} options.defaultContentBgColor Default content background color.
 * @param {number} options.defaultContentBgOpacity Default content background opacity.
 * @returns {{ populateWindowObjects: () => void }} API that rebuilds `hud.objects.windows` from current window order/state.
 * Side effects: mutates `hud.objects.windows` and tags created meshes/text wrappers with owning window keys.
 */
export function createHudWindowObjectPopulationRuntime({
  hud,
  createWindowObjects,
  defaultPanelBgColor,
  defaultPanelBgOpacity,
  defaultTitleBarColor,
  defaultTitleBarOpacity,
  defaultContentBgColor,
  defaultContentBgOpacity,
} = {}) {
  function populateWindowObjects() {
    hud.objects.windows = {};

    for (const key of hud.ui.order) {
      const win = hud.ui.windows?.[key];
      if (!win) continue;

      const objs = createWindowObjects({
        windowKey: key,
        withMin: !!win.minimizable,
        withClose: !!win.closeable,
        withAction: key === "debug",
        withResize: !!win.resizable,
        withScroll: !!win.scrollable,
        panelBgColor: win.panelBgColor ?? defaultPanelBgColor,
        panelBgOpacity: win.panelBgOpacity ?? defaultPanelBgOpacity,
        titleBarColor: win.titleBarColor ?? defaultTitleBarColor,
        titleBarOpacity: win.titleBarOpacity ?? defaultTitleBarOpacity,
        contentBgColor: win.contentBgColor ?? defaultContentBgColor,
        contentBgOpacity: win.contentBgOpacity ?? defaultContentBgOpacity,
      });

      for (const value of Object.values(objs)) {
        if (!value) continue;
        if (value.isMesh || value.isInstancedMesh) {
          value.userData.windowKey = key;
          value.visible = false;
          continue;
        }
        if (value.mesh && value.mesh.isObject3D) {
          value.mesh.userData.windowKey = key;
          value.mesh.visible = false;
        }
      }

      objs._windowKey = key;
      // Freshly-allocated window meshes are created at the HUD origin (top-left)
      // and only receive their real position during the first renderWindow() pass.
      // If a paint happens between allocation and that first layout, the whole
      // window — most noticeably its close button — flashes at the top-left corner.
      // Hide every object now and mark the set as off-screen-hidden so renderWindow's
      // existing restore path reveals (and corrects per-element visibility for) the
      // window only after it has been positioned.
      objs._hiddenByOffscreen = true;
      hud.objects.windows[key] = objs;
    }
  }

  return {
    populateWindowObjects,
  };
}
