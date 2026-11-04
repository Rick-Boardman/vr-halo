// SPDX-License-Identifier: Apache-2.0
/**
 * @module hud-window-presets
 *
 * Shared HUD window presets define available Halo-managed panel types,
 * but do not instantiate live windows until callers explicitly request them.
 */

import { HudWindowBase } from "./hud-window-model.js";
import {
  HUD_WINDOW_EDGE_MARGIN_PX,
  HUD_WINDOW_VR_RIGHT_X_PX,
  HUD_WINDOW_HIDDEN_Y_PX,
} from "./hud-layout-policy.js";

const _defaultDefaults = Object.freeze({
  chatLines: [],
  eventLines: [],
  skillsLines: [],
  inventoryLines: [],
  playerName: "",
  fps: 0,
  speed: "0.00 MPH",
  health: { value: 0, max: 0 },
  stamina: { value: 0, max: 0 },
});

function initializeHelpWindow(win) {
  if (!win) return;
  win._helpHiddenX = win.x;
  win._helpHiddenY = win.y;
  win._helpHiddenCollapsed = false;
  win.x = HUD_WINDOW_VR_RIGHT_X_PX;
  win.y = HUD_WINDOW_HIDDEN_Y_PX;
}

function createWindowInstance(windowKey, definition, WindowClass = HudWindowBase) {
  if (!definition) return null;
  const { initializeWindow, ...windowOptions } = definition;
  const win = new WindowClass({ key: windowKey, ...windowOptions });
  if (typeof initializeWindow === "function") initializeWindow(win);
  return win;
}

function resolveRequestedWindowKeys(definitions, order, visibleWindowKeys) {
  if (!Array.isArray(visibleWindowKeys)) return order.slice();

  const requestedOrder = [];
  for (const key of visibleWindowKeys) {
    const windowKey = String(key ?? "").trim();
    if (!windowKey || !definitions[windowKey]) continue;
    if (requestedOrder.includes(windowKey)) continue;
    requestedOrder.push(windowKey);
  }
  return requestedOrder;
}

function applyHiddenWindowKeys(ui, hiddenWindowKeys) {
  if (!ui || !Array.isArray(hiddenWindowKeys)) return ui;

  const hiddenKeySet = new Set(
    hiddenWindowKeys
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );

  if (!hiddenKeySet.size) return ui;

  for (const key of hiddenKeySet) {
    const win = ui.windows?.[key];
    if (!win || typeof win.setHidden !== "function") continue;
    win.setHidden(true);
  }

  if (hiddenKeySet.has(ui.focus)) {
    ui.focus = (ui.order || []).find((key) => !hiddenKeySet.has(key)) ?? null;
  }

  return ui;
}

function buildUiFromPresetBlueprint(
  blueprint,
  {
    visibleWindowKeys,
    hiddenWindowKeys,
    WindowClass = HudWindowBase,
  } = {}
) {
  const order = resolveRequestedWindowKeys(
    blueprint.definitions,
    blueprint.order,
    visibleWindowKeys
  );
  const windows = {};

  for (const key of order) {
    const definition = blueprint.definitions[key];
    const win = createWindowInstance(key, definition, WindowClass);
    if (win) windows[key] = win;
  }

  return applyHiddenWindowKeys(
    {
      windowClampMode: blueprint.windowClampMode,
      windowClampMinVisiblePx: blueprint.windowClampMinVisiblePx,
      windows,
      order,
      focus: order.includes(blueprint.focus) ? blueprint.focus : (order[0] ?? null),
      defaults: { ...blueprint.defaults },
      _layoutInitialized: false,
    },
    hiddenWindowKeys
  );
}

function cloneWindowDefinition(definition) {
  if (!definition || typeof definition !== "object") return null;
  return { ...definition };
}

/**
 * Build the "default" UI preset (full window set).
 *
 * @param {object} opts
 * @param {string} opts.windowClampMode Clamping mode for window bounds.
 * @param {number} opts.windowClampMinVisiblePx Minimum visible pixels when clamping.
 * @returns {object} UI state object with windows, order, focus, and defaults.
 */
export function createDefaultWindowPreset({
  windowClampMode,
  windowClampMinVisiblePx,
  visibleWindowKeys,
  hiddenWindowKeys,
} = {}) {
  return createWindowPresetUi({
    uiPreset: "default",
    windowClampMode,
    windowClampMinVisiblePx,
    visibleWindowKeys,
    hiddenWindowKeys,
  });
}

// ------------------------------------------------------------------
// Minimal preset — lightweight UI with only essential windows.
// ------------------------------------------------------------------

/**
 * Build the "minimal" UI preset (XR, status, hotbar, debug, help).
 *
 * @param {object} opts
 * @param {string} opts.windowClampMode Clamping mode for window bounds.
 * @param {number} opts.windowClampMinVisiblePx Minimum visible pixels when clamping.
 * @returns {object} UI state object with windows, order, focus, and defaults.
 */
export function createMinimalWindowPreset({
  windowClampMode,
  windowClampMinVisiblePx,
  visibleWindowKeys,
  hiddenWindowKeys,
} = {}) {
  return createWindowPresetUi({
    uiPreset: "minimal",
    windowClampMode,
    windowClampMinVisiblePx,
    visibleWindowKeys,
    hiddenWindowKeys,
  });
}

export function createDefaultWindowPresetBlueprint({ windowClampMode, windowClampMinVisiblePx }) {
  return {
    windowClampMode,
    windowClampMinVisiblePx,
    definitions: {
      xr: {
        title: "VR",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 0,
        w: 240,
        h: 64,
        minW: 200,
        minH: 64,
        minimizable: false,
        resizable: false,
        draggable: true,
        scrollable: false,
      },
      chat: {
        title: "System Log",
        x: HUD_WINDOW_EDGE_MARGIN_PX,
        y: HUD_WINDOW_EDGE_MARGIN_PX,
        w: 560,
        h: 220,
        minW: 320,
        minH: 160,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "end",
        maxLines: 200,
      },
      skills: {
        title: "SKILLS",
        x: 48,
        y: 260,
        w: 360,
        h: 420,
        minW: 280,
        minH: 240,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
      },
      event: {
        title: "EVENT",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 200,
        w: 500,
        h: 170,
        minW: 340,
        minH: 140,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "end",
      },
      inventory: {
        title: "INVENTORY",
        x: 720,
        y: 320,
        w: 360,
        h: 420,
        minW: 320,
        minH: 260,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
      },
      status: {
        title: "STATUS",
        x: 360,
        y: HUD_WINDOW_EDGE_MARGIN_PX,
        w: 330,
        h: 64,
        minW: 260,
        minH: 64,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: false,
      },
      progress: {
        title: "",
        x: 1030,
        y: 120,
        w: 280,
        h: 210,
        minW: 240,
        minH: 160,
        minimizable: false,
        resizable: false,
        draggable: true,
        scrollable: false,
      },
      target: {
        title: "NO TARGET",
        x: 700,
        y: HUD_WINDOW_EDGE_MARGIN_PX,
        w: 240,
        h: 70,
        minW: 200,
        minH: 64,
        minimizable: false,
        resizable: false,
        draggable: true,
        scrollable: false,
      },
      buffs: {
        title: "",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 0,
        w: 320,
        h: 70,
        minW: 260,
        minH: 64,
        minimizable: false,
        resizable: false,
        draggable: true,
        dragAnywhere: true,
        scrollable: false,
      },
      hotbar: {
        title: "Hotbar",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 50,
        w: 540,
        h: 84,
        minW: 500,
        minH: 84,
        minimizable: false,
        resizable: false,
        draggable: true,
        dragAnywhere: true,
        scrollable: false,
      },
      debug: {
        title: "DEBUG",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 150,
        w: 420,
        h: 360,
        minW: 320,
        minH: 220,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
        maxLines: 400,
      },
      help: {
        title: "HELP",
        x: 740,
        y: 90,
        w: 460,
        h: 360,
        minW: 320,
        minH: 220,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
        maxLines: 240,
        initializeWindow: initializeHelpWindow,
      },
    },
    order: [
      "xr",
      "chat",
      "skills",
      "event",
      "inventory",
      "status",
      "progress",
      "target",
      "buffs",
      "hotbar",
      "debug",
      "help",
    ],
    focus: "chat",
    defaults: { ..._defaultDefaults },
  };
}

export function createMinimalWindowPresetBlueprint({ windowClampMode, windowClampMinVisiblePx }) {
  return {
    windowClampMode,
    windowClampMinVisiblePx,
    definitions: {
      xr: {
        title: "VR",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 0,
        w: 240,
        h: 64,
        minW: 200,
        minH: 64,
        minimizable: false,
        resizable: false,
        draggable: true,
        scrollable: false,
      },
      status: {
        title: "STATUS",
        x: 360,
        y: HUD_WINDOW_EDGE_MARGIN_PX,
        w: 330,
        h: 64,
        minW: 260,
        minH: 64,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: false,
      },
      hotbar: {
        title: "Hotbar",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 50,
        w: 540,
        h: 84,
        minW: 500,
        minH: 84,
        minimizable: false,
        resizable: false,
        draggable: true,
        dragAnywhere: true,
        scrollable: false,
      },
      debug: {
        title: "DEBUG",
        x: HUD_WINDOW_VR_RIGHT_X_PX,
        y: 150,
        w: 420,
        h: 360,
        minW: 320,
        minH: 220,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
        maxLines: 400,
      },
      help: {
        title: "HELP",
        x: 460,
        y: 90,
        w: 420,
        h: 360,
        minW: 300,
        minH: 220,
        minimizable: true,
        closeable: true,
        resizable: true,
        draggable: true,
        scrollable: true,
        scrollTop: 0,
        scrollMode: "top",
        maxLines: 240,
        initializeWindow: initializeHelpWindow,
      },
    },
    order: ["xr", "status", "hotbar", "debug", "help"],
    focus: "hotbar",
    defaults: { ..._defaultDefaults },
  };
}

export function createWindowPresetBlueprint({
  uiPreset = "default",
  windowClampMode,
  windowClampMinVisiblePx,
}) {
  return String(uiPreset ?? "default") === "minimal"
    ? createMinimalWindowPresetBlueprint({ windowClampMode, windowClampMinVisiblePx })
    : createDefaultWindowPresetBlueprint({ windowClampMode, windowClampMinVisiblePx });
}

export function resolveWindowPresetOptions({
  uiPreset = "default",
  windowKey,
  windowClampMode,
  windowClampMinVisiblePx,
}) {
  const key = String(windowKey ?? "").trim();
  if (!key) return null;
  const blueprint = createWindowPresetBlueprint({
    uiPreset,
    windowClampMode,
    windowClampMinVisiblePx,
  });
  return cloneWindowDefinition(blueprint.definitions[key]);
}

export function createWindowPresetUi({
  uiPreset = "default",
  windowClampMode,
  windowClampMinVisiblePx,
  visibleWindowKeys,
  hiddenWindowKeys,
  WindowClass = HudWindowBase,
} = {}) {
  return buildUiFromPresetBlueprint(
    createWindowPresetBlueprint({
      uiPreset,
      windowClampMode,
      windowClampMinVisiblePx,
    }),
    {
      visibleWindowKeys,
      hiddenWindowKeys,
      WindowClass,
    }
  );
}
