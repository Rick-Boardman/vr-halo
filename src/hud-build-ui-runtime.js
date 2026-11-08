// SPDX-License-Identifier: Apache-2.0
/**
 * @module hud-build-ui-runtime
 *
 * Constructs HUD window objects, overlay objects, status/hotbar objects,
 * buff/target icons, and accent text layers, then wires them into
 * `hud.objects`. Also initialises debug tools on `hud.debug`.
 *
 * @param {object}   options
 * @param {object}   options.THREE                    Three.js namespace.
 * @param {object}   options.hud                      Shared HUD state object.
 * @param {Function} options.makeRect                 Rectangle mesh factory.
 * @param {Function} options.TroikaPixelText          Troika text mesh constructor.
 * @param {number}   options.hotbarSlotCount           Number of hotbar slots.
 * @param {number}   options.hotbarSlotSizePx          Hotbar slot size in layout pixels.
 * @param {number}   options.hotbarSlotOutlinePaddingPx Padding around hotbar slot outlines.
 * @param {number}   options.titleHeightPx             Window title bar height in layout pixels.
 * @returns {{ createWindowObjects: Function }}
 */

import { createHudDebugTools } from "./hud-debug.js";
import { createHudBuffTargetIconsRuntime } from "./hud-buff-target-icons-runtime.js";
import { createHudOverlayObjectsRuntime } from "./hud-overlay-objects-runtime.js";
import { createHudStatusHotbarObjectsRuntime } from "./hud-status-hotbar-objects-runtime.js";
import { createHudWindowAccentTextRuntime } from "./hud-window-accent-text-runtime.js";
import { createHudWindowObjectPopulationRuntime } from "./hud-window-object-population-runtime.js";
import { createHudWindowObjectsRuntime } from "./hud-window-objects-runtime.js";
import {
  HUD_PRIMARY_HIGHLIGHT_COLOR,
} from "./hud-highlight-style.js";
import {
  HUD_STATUS_HEALTH_TINT_COLOR,
  HUD_STATUS_STAMINA_TINT_COLOR,
} from "./hud-status-style.js";
import {
  resolveHudTheme,
} from "./hud-surface-style.js";
import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_DISABLED_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_SUCCESS_COLOR,
  HUD_TEXT_SUPREME_ACCENT_COLOR,
} from "./hud-text-style.js";

/** Tooltip and menu text render order (top-most text layer). */
const OVERLAY_TEXT_RENDER_ORDER = 9010;
/** Overlay color-coded text layer render order (above overlay text). */
const OVERLAY_COLOR_LAYER_RENDER_ORDER = 9011;

export function createHudBuildUiRuntime({
  THREE,
  hud,
  makeRect,
  TroikaPixelText,
  hotbarSlotCount,
  hotbarSlotSizePx,
  hotbarSlotOutlinePaddingPx,
  titleHeightPx,
  theme,
} = {}) {
  const resolvedTheme = resolveHudTheme(theme);
  const { createWindowObjects } = createHudWindowObjectsRuntime({
    THREE,
    makeRect,
    TroikaPixelText,
    titleHeightPx,
    surfacePanelBgColor: resolvedTheme.panelBgColor,
    surfaceAccentColor: resolvedTheme.accentColor,
    surfaceContentBgColor: resolvedTheme.contentBgColor,
    surfaceTitleBarColor: resolvedTheme.titleBarColor,
    surfaceControlStyle: resolvedTheme.controlStyle,
    textDefaultColor: HUD_TEXT_DEFAULT_COLOR,
  });

  const { createOverlayObjects } = createHudOverlayObjectsRuntime({
    makeRect,
    TroikaPixelText,
    surfaceContentBgColor: resolvedTheme.contentBgColor,
    surfacePanelBgColor: resolvedTheme.panelBgColor,
    surfaceAccentColor: resolvedTheme.accentColor,
    textDefaultColor: HUD_TEXT_DEFAULT_COLOR,
    textDisabledColor: HUD_TEXT_DISABLED_COLOR,
    overlayTextRenderOrder: OVERLAY_TEXT_RENDER_ORDER,
    overlayColorLayerRenderOrder: OVERLAY_COLOR_LAYER_RENDER_ORDER,
  });

  const { createStatusHotbarObjects } = createHudStatusHotbarObjectsRuntime({
    makeRect,
    TroikaPixelText,
    hotbarSlotCount,
    hotbarSlotSizePx,
    hotbarSlotOutlinePaddingPx,
    surfaceContentBgColor: resolvedTheme.contentBgColor,
    surfaceAccentColor: resolvedTheme.accentColor,
    statusHealthTintColor: HUD_STATUS_HEALTH_TINT_COLOR,
    statusStaminaTintColor: HUD_STATUS_STAMINA_TINT_COLOR,
    textDefaultColor: HUD_TEXT_DEFAULT_COLOR,
    primaryHighlightColor: HUD_PRIMARY_HIGHLIGHT_COLOR,
    hasStatusWindow: !!hud?.ui?.windows?.status,
    hasHotbarWindow: !!hud?.ui?.windows?.hotbar,
  });

  const { createBuffTargetIcons } = createHudBuffTargetIconsRuntime({
    makeRect,
    surfaceAccentColor: resolvedTheme.accentColor,
    buffIconCount: 28,
    buffIconSizePx: 18,
    targetIconCount: 6,
    targetIconSizePx: 22,
  });

  const { populateWindowObjects } = createHudWindowObjectPopulationRuntime({
    hud,
    createWindowObjects,
    defaultPanelBgColor: resolvedTheme.panelBgColor,
    defaultPanelBgOpacity: resolvedTheme.panelBgOpacity,
    defaultTitleBarColor: resolvedTheme.titleBarColor,
    defaultTitleBarOpacity: resolvedTheme.titleBarOpacity,
    defaultContentBgColor: resolvedTheme.contentBgColor,
    defaultContentBgOpacity: resolvedTheme.contentBgOpacity,
  });

  const { attachWindowAccentTextLayers } = createHudWindowAccentTextRuntime({
    TroikaPixelText,
    primaryHighlightColor: HUD_PRIMARY_HIGHLIGHT_COLOR,
    supremeAccentColor: HUD_TEXT_SUPREME_ACCENT_COLOR,
    successColor: HUD_TEXT_SUCCESS_COLOR,
    emphasisColor: HUD_TEXT_EMPHASIS_COLOR,
  });

  // Attach HUD backref to window instances (enables window.setTitle(), window.addLine(), etc.)
  for (const w of Object.values(hud.ui.windows ?? {})) {
    if (w && typeof w.attachHud === "function") w.attachHud(hud);
  }

  populateWindowObjects();

  // Extra colored layers (overlay) for certain windows.
  // In minimal mode, these windows may not exist.
  attachWindowAccentTextLayers(hud.objects.windows);

  Object.assign(hud.objects, createStatusHotbarObjects());
  Object.assign(hud.objects, createBuffTargetIcons());

  // Overlays: tooltip + context menu (WebGL-only)
  hud.objects.overlay = createOverlayObjects();

  // Debug tools (collider visualization + drag readout)
  try {
    hud.debug.tools = createHudDebugTools({ THREE, hud });
  } catch {
    hud.debug.tools = null;
  }

  return { createWindowObjects };
}
