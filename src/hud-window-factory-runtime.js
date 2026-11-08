// SPDX-License-Identifier: Apache-2.0
import { placeSaved } from "./hud-window-anchor.js";
import { HUD_WINDOW_EDGE_MARGIN_PX, HUD_WINDOW_TITLE_HEIGHT_PX } from "./hud-layout-policy.js";

/**
 * Create shared HUD window-factory helpers for constructing window state and optional runtime objects.
 * @param {object} [options={}] Window-factory runtime dependencies.
 * @param {{ ui?: { windows?: Record<string, any>, order?: Array<string> }, objects?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {(value: number, min: number, max: number) => number} options.clamp Clamp helper used for bounded order insertion.
 * @param {() => void} options.markDirty Callback that marks HUD rendering dirty after window creation.
 * @param {new (...args: any[]) => any} options.WindowClass Constructor used to instantiate HUD window models.
 * @param {(options: object) => Record<string, any>} [options.runtimeCreateWindowObjects] Optional callback that allocates runtime meshes/text for a new window.
 * @param {number | string} options.defaultPanelBgColor Default panel background color when a window does not specify one.
 * @param {number} options.defaultPanelBgOpacity Default panel background opacity when a window does not specify one.
 * @param {number | string} options.defaultTitleBarColor Default title-bar color when a window does not specify one.
 * @param {number} options.defaultTitleBarOpacity Default title-bar opacity when a window does not specify one.
 * @param {number | string} options.defaultContentBgColor Default content background color when a window does not specify one.
 * @param {number} options.defaultContentBgOpacity Default content background opacity when a window does not specify one.
 * @returns {{createWindow: (windowKey: string, options?: object) => any}} Factory helpers for creating and registering HUD windows.
 * Side effects: mutates `hud.ui.windows`, `hud.ui.order`, and `hud.objects.windows`; tags created meshes/text wrappers with window ownership metadata.
 */
export function createHudWindowFactoryRuntime({
  hud,
  clamp,
  markDirty,
  WindowClass,
  runtimeCreateWindowObjects = null,
  loadLayout = null,
  defaultPanelBgColor,
  defaultPanelBgOpacity,
  defaultTitleBarColor,
  defaultTitleBarOpacity,
  defaultContentBgColor,
  defaultContentBgOpacity,
  defaultBorderColor,
  defaultBorderOpacity,
  defaultBorderInset,
  defaultTitleTextColor,
} = {}) {
  function createWindow(
    windowKey,
    {
      title,
      x,
      y,
      w,
      h,
      minW,
      minH,
      minimizable,
      closeable,
      resizable,
      draggable,
      dragAnywhere,
      scrollable,
      scrollTop,
      scrollMode,
      maxLines,
      onClose,
      listStyle,
      panelBgColor,
      panelBgOpacity,
      titleBarColor,
      titleBarOpacity,
      contentBgColor,
      contentBgOpacity,
      titleTextColor,
      borderColor,
      initializeWindow,
      orderIndex,
    } = {}
  ) {
    const key = String(windowKey ?? "").trim();
    if (!key) throw new Error("createWindow: windowKey is required");
    if (!hud.ui) hud.ui = {};
    if (!hud.ui.windows) hud.ui.windows = {};
    if (!Array.isArray(hud.ui.order)) hud.ui.order = [];
    if (hud.ui.windows[key]) return hud.ui.windows[key];

    const win = new WindowClass({
      key,
      title: title ?? "",
      x: Number.isFinite(x) ? Number(x) : HUD_WINDOW_EDGE_MARGIN_PX,
      y: Number.isFinite(y) ? Number(y) : HUD_WINDOW_EDGE_MARGIN_PX,
      w: Number.isFinite(w) ? Number(w) : 420,
      h: Number.isFinite(h) ? Number(h) : 260,
      minW: Number.isFinite(minW) ? Number(minW) : 240,
      minH: Number.isFinite(minH) ? Number(minH) : 160,
      minimizable: minimizable ?? true,
      closeable: closeable ?? (key !== "hotbar" && key !== "xr"),
      resizable: resizable ?? true,
      draggable: draggable ?? true,
      dragAnywhere: dragAnywhere ?? false,
      scrollable: scrollable ?? false,
      scrollTop: Number.isFinite(scrollTop) ? Number(scrollTop) : 0,
      scrollMode: scrollMode ?? "top",
      maxLines: Number.isFinite(maxLines) ? Number(maxLines) : null,
      onClose,
      listStyle,
      panelBgColor: panelBgColor ?? defaultPanelBgColor,
      panelBgOpacity: panelBgOpacity ?? defaultPanelBgOpacity,
      titleBarColor: titleBarColor ?? defaultTitleBarColor,
      titleBarOpacity: titleBarOpacity ?? defaultTitleBarOpacity,
      contentBgColor: contentBgColor ?? defaultContentBgColor,
      contentBgOpacity: contentBgOpacity ?? defaultContentBgOpacity,
      titleTextColor: titleTextColor ?? defaultTitleTextColor,
      borderColor: borderColor ?? defaultBorderColor,
      borderOpacity: defaultBorderOpacity,
      borderInset: defaultBorderInset,
    });

    // Apply saved positions from localStorage (for windows created after boot).
    if (typeof loadLayout === "function") {
      const saved = loadLayout();
      const s = saved?.[key];
      if (s) {
        if (Number.isFinite(s.w)) win.w = Math.max(win.minW, s.w);
        if (Number.isFinite(s.h)) win.h = Math.max(win.minH, s.h);
        if (typeof s.collapsed === "boolean") win.collapsed = s.collapsed;
        const savedHeight = win.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : win.h;
        if (Number.isFinite(s.x)) win.x = placeSaved(s.x, win.w, Number(saved.__viewer?.w), Number(hud.layoutW));
        if (Number.isFinite(s.y)) win.y = placeSaved(s.y, savedHeight, Number(saved.__viewer?.h), Number(hud.layoutH));
        if (s.userPlaced) win.userPlaced = true;
        // Clamp to viewport so saved offscreen positions don't hide panels.
        if (win.y >= -1000 && hud.layoutW > 0 && hud.layoutH > 0) {
          const h = win.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : win.h;
          win.x = clamp(win.x, 0, Math.max(0, hud.layoutW - win.w));
          win.y = clamp(win.y, 0, Math.max(0, hud.layoutH - h));
        }
      }
    }

    if (typeof initializeWindow === "function") {
      initializeWindow(win);
    }

    if (typeof win.attachHud === "function") win.attachHud(hud);
    hud.ui.windows[key] = win;

    if (Number.isFinite(orderIndex)) {
      const idx = clamp(Math.floor(orderIndex), 0, hud.ui.order.length);
      hud.ui.order.splice(idx, 0, key);
    } else {
      hud.ui.order.push(key);
    }

    if (hud.objects?.windows && typeof runtimeCreateWindowObjects === "function") {
      const objs = runtimeCreateWindowObjects({
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

    markDirty();
    return win;
  }

  return {
    createWindow,
  };
}
