// SPDX-License-Identifier: Apache-2.0
import {
  createWindowPresetUi,
} from "./hud-window-presets.js";

function createPointerState() {
  return {
    x: 0,
    y: 0,
    active: false,
    controllerRay: null,
    controllerRay0WindowKey: null,
    controllerRay1WindowKey: null,
    down: false,
    justPressed: false,
    justReleased: false,
    contextJustRequested: false,
    _holdTime: 0,
    _holdStartX: 0,
    _holdStartY: 0,
    _holdFired: false,
    _holdEligible: false,
  };
}

/**
 * Purpose: Create and initialize the mutable HUD state object used by all HUD subsystems.
 * @param {object} options
 * @param {object} options.THREE Three.js namespace for allocating the HUD root Group.
 * @param {string} options.uiPreset Shared Halo preset key used to resolve shared panel definitions.
 * @param {string} options.statusMode Display mode for the status window ("bars" or "text").
 * @param {string} options.windowClampMode Window-clamp policy string forwarded to presets.
 * @param {number} options.windowClampMinVisiblePx Minimum visible-pixel threshold forwarded to presets.
 * @param {Array<string> | null} options.hotbarTooltips Optional normalized per-slot tooltip labels, or null.
 * @param {Array<string> | null} options.visibleWindowKeys Optional list of shared window keys that should exist at startup.
 * @param {Array<string> | null} options.hiddenWindowKeys Optional list of shared window keys that should start hidden.
 * @returns {{ hud: object }} The initialized HUD state object.
 * Side effects: allocates a THREE.Group for the HUD root; reads window.innerWidth / window.innerHeight for initial layout dimensions.
 */
export function createHudStateInit({
  THREE,
  uiPreset,
  statusMode,
  windowClampMode,
  windowClampMinVisiblePx,
  hotbarTooltips,
  visibleWindowKeys,
  hiddenWindowKeys,
}) {
  const ui = createWindowPresetUi({
    uiPreset,
    windowClampMode,
    windowClampMinVisiblePx,
    visibleWindowKeys,
    hiddenWindowKeys,
  });

  const hud = {
    root: new THREE.Group(),
    plane: null,
    rayTarget: null,

    layoutW: window.innerWidth,
    layoutH: window.innerHeight,

    pointer: createPointerState(),

    vrPointer: createPointerState(),

    xr: {
      supported: false,
      presenting: false,
      status: "checking…",
    },

    // Base UI model
    ui,

    overlay: {
      tooltip: {
        visible: false,
        text: "",
        entries: null,
        x: 0,
        y: 0,
        _hoverId: "",
        _timer: 0,
      },
      externalTooltip: {
        visible: false,
        text: "",
        entries: null,
        x: 0,
        y: 0,
      },
      contextMenu: {
        open: false,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        items: [], // { label, action }
        target: null,
        hoverIndex: -1,
      },
    },

    objects: {},

    // Debug/diagnostics (toggled in-headset via the hotbar).
    // Keep this isolated so it can survive interaction-math reverts.
    debug: {
      enabled: false,
      tools: null,
    },

    _dirty: true,
  };

  // In text status mode, the default status bar height (64px) only shows one line.
  // Make it tall enough for a small list (counts + FPS + speed) while keeping it
  // non-resizable and lightweight.
  try {
    if (statusMode === "text") {
      const w = hud?.ui?.windows?.status;
      if (w) {
        w.h = Math.max(Number(w.h) || 0, 220);
        w.minH = Math.max(Number(w.minH) || 0, 220);
        // Allow scrolling if a scene writes more lines than fit.
        w.scrollable = true;
      }
    }
  } catch {
    // no-op
  }

  // Overrideable content store (consumers can inject their own lines here).
  hud.ui.data = {
    chatLines: hud.ui.defaults.chatLines,
    eventLines: hud.ui.defaults.eventLines,
    skillsLines: hud.ui.defaults.skillsLines,
    inventoryLines: hud.ui.defaults.inventoryLines,
    statusLines: [],
    helpLines: [],
    debugLines: [],
    hotbarItems: null,
    hotbarActiveIndex: -1,
  };

  // Live metrics used by the status panel and any consumers.
  hud.ui.metrics = {
    fps: hud.ui.defaults.fps,
    speed: hud.ui.defaults.speed,
    health: hud.ui.defaults.health,
    stamina: hud.ui.defaults.stamina,
    vrDepthText: "",
    vrErrorText: "",
    _vrErrorUntilMs: 0,
  };

  if (hotbarTooltips) {
    hud.ui.data.hotbarTooltips = hotbarTooltips;
  }

  return { hud };
}
