// SPDX-License-Identifier: Apache-2.0
import { HUD_Z_CONTENT_TEXT, HUD_SURFACE_ELEMENT_OPACITY, HUD_Z_SURFACE_FG, HUD_Z_SURFACE_BG, HUD_Z_SURFACE_RECESSED } from "./hud-layout-policy.js";
import { HUD_TEXT_BRIGHT_COLOR } from "./hud-text-style.js";

/**
 * Create shared HUD helpers that allocate status-strip and hotbar render objects.
 * @param {object} [options={}] Status/hotbar object runtime dependencies.
 * @param {(options: { x: number, y: number, w: number, h: number, color: number | string, opacity?: number, z?: number, order?: number }) => any} options.makeRect Mesh-factory callback used to allocate HUD quads.
 * @param {new (...args: any[]) => any} options.TroikaPixelText Constructor used to allocate HUD text wrappers.
 * @param {number} options.hotbarSlotCount Number of hotbar slots to instantiate.
 * @param {number} options.hotbarSlotSizePx Hotbar slot square size in pixels.
 * @param {number} options.hotbarSlotOutlinePaddingPx Extra outline padding around each hotbar slot.
 * @param {number | string} options.surfaceContentBgColor HUD content-surface background color.
 * @param {number | string} options.surfaceAccentColor HUD accent color.
 * @param {number | string} options.statusHealthTintColor Status health bar tint color.
 * @param {number | string} options.statusStaminaTintColor Status stamina bar tint color.
 * @param {number | string} options.textDefaultColor Canonical default HUD text color.
 * @param {number | string} options.primaryHighlightColor Primary highlight color used for status speed text.
 * @param {boolean} [options.hasStatusWindow=true] Whether the shared status window exists in the current HUD model.
 * @param {boolean} [options.hasHotbarWindow=true] Whether the shared hotbar window exists in the current HUD model.
 * @returns {{ createStatusHotbarObjects: () => { statusBars: Record<string, any>, statusNameText: any, statusMetaText: any, statusSpeedText: any, statusSpeedBg: any, hotbarSlots: Array<{bg: any, outline: any}>, hotbarNumbersText: any, hotbarNumberTexts: Array<any>, hotbarIconTexts: Array<any> } }} API that builds canonical status and hotbar objects.
 * Side effects: allocates Three.js meshes/materials and Troika text wrappers for HUD status/hotbar rendering.
 */
export function createHudStatusHotbarObjectsRuntime({
  makeRect,
  TroikaPixelText,
  hotbarSlotCount,
  hotbarSlotSizePx,
  hotbarSlotOutlinePaddingPx,
  surfaceContentBgColor,
  surfaceAccentColor,
  statusHealthTintColor,
  statusStaminaTintColor,
  textDefaultColor,
  primaryHighlightColor,
  hasStatusWindow = true,
  hasHotbarWindow = true,
} = {}) {
  function createStatusHotbarObjects() {
    const shouldAllocateHotbarObjects = Number.isFinite(hotbarSlotCount)
      ? Number(hotbarSlotCount) > 0
      : true;

    const statusBars = hasStatusWindow
      ? {
          healthBg: makeRect({
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            color: surfaceContentBgColor,
            opacity: HUD_SURFACE_ELEMENT_OPACITY,
            z: HUD_Z_SURFACE_BG,
          }),
          healthFg: makeRect({
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            color: statusHealthTintColor,
            opacity: HUD_SURFACE_ELEMENT_OPACITY,
            z: HUD_Z_SURFACE_FG,
          }),
          staminaBg: makeRect({
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            color: surfaceContentBgColor,
            opacity: HUD_SURFACE_ELEMENT_OPACITY,
            z: HUD_Z_SURFACE_BG,
          }),
          staminaFg: makeRect({
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            color: statusStaminaTintColor,
            opacity: HUD_SURFACE_ELEMENT_OPACITY,
            z: HUD_Z_SURFACE_FG,
          }),
        }
      : {};

    for (const mesh of Object.values(statusBars)) {
      if (mesh?.userData) mesh.userData.windowKey = "status";
    }

    const statusNameText = hasStatusWindow
      ? new TroikaPixelText({ color: HUD_TEXT_BRIGHT_COLOR, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (statusNameText?.mesh?.userData) statusNameText.mesh.userData.windowKey = "status";

    const statusMetaText = hasStatusWindow
      ? new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (statusMetaText?.mesh?.userData) statusMetaText.mesh.userData.windowKey = "status";

    const statusSpeedText = hasStatusWindow
      ? new TroikaPixelText({ color: primaryHighlightColor, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (statusSpeedText?.mesh?.userData) statusSpeedText.mesh.userData.windowKey = "status";

    const statusSpeedBg = hasStatusWindow
      ? makeRect({
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          color: surfaceContentBgColor,
          opacity: 0.9,
          z: HUD_Z_SURFACE_RECESSED,
        })
      : null;
    if (statusSpeedBg?.userData) statusSpeedBg.userData.windowKey = "status";

    const hotbarSlots = [];
    for (let i = 0; shouldAllocateHotbarObjects && i < hotbarSlotCount; i++) {
      const bg = makeRect({
        x: 0,
        y: 0,
        w: hotbarSlotSizePx,
        h: hotbarSlotSizePx,
        color: surfaceContentBgColor,
        opacity: 0.85,
        z: HUD_Z_SURFACE_RECESSED,
      });
      const outline = makeRect({
        x: 0,
        y: 0,
        w: hotbarSlotSizePx + hotbarSlotOutlinePaddingPx * 2,
        h: hotbarSlotSizePx + hotbarSlotOutlinePaddingPx * 2,
        color: surfaceAccentColor,
        opacity: 0.9,
        z: 0.002,
      });
      bg.userData.windowKey = "hotbar";
      outline.userData.windowKey = "hotbar";
      hotbarSlots.push({ bg, outline });
    }

    const hotbarNumbersText = shouldAllocateHotbarObjects
      ? new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (hotbarNumbersText?.mesh?.userData) hotbarNumbersText.mesh.userData.windowKey = "hotbar";

    const hotbarNumberTexts = [];
    for (let i = 0; shouldAllocateHotbarObjects && i < hotbarSlotCount; i++) {
      const text = new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      text.mesh.userData.windowKey = "hotbar";
      hotbarNumberTexts.push(text);
    }

    const hotbarIconTexts = [];
    for (let i = 0; shouldAllocateHotbarObjects && i < hotbarSlotCount; i++) {
      const text = new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      text.mesh.userData.windowKey = "hotbar";
      hotbarIconTexts.push(text);
    }

    const hotbarHeaderText = shouldAllocateHotbarObjects
      ? new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (hotbarHeaderText?.mesh?.userData) hotbarHeaderText.mesh.userData.windowKey = "hotbar";

    const hotbarStatusBg = shouldAllocateHotbarObjects
      ? makeRect({
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          color: surfaceAccentColor,
          opacity: 0.95,
          z: HUD_Z_SURFACE_FG,
        })
      : null;
    if (hotbarStatusBg?.userData) hotbarStatusBg.userData.windowKey = "hotbar";

    const hotbarStatusText = shouldAllocateHotbarObjects
      ? new TroikaPixelText({ color: HUD_TEXT_BRIGHT_COLOR, z: HUD_Z_CONTENT_TEXT, depthTest: false })
      : null;
    if (hotbarStatusText?.mesh?.userData) hotbarStatusText.mesh.userData.windowKey = "hotbar";

    const hotbarGripDots = [];
    for (let index = 0; shouldAllocateHotbarObjects && index < 6; index += 1) {
      const dot = makeRect({
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        color: surfaceAccentColor,
        opacity: 0.72,
        z: HUD_Z_SURFACE_FG,
      });
      dot.userData.windowKey = "hotbar";
      hotbarGripDots.push(dot);
    }

    return {
      statusBars,
      statusNameText,
      statusMetaText,
      statusSpeedText,
      statusSpeedBg,
      hotbarSlots,
      hotbarNumbersText,
      hotbarNumberTexts,
      hotbarIconTexts,
      hotbarHeaderText,
      hotbarStatusBg,
      hotbarStatusText,
      hotbarGripDots,
    };
  }

  return {
    createStatusHotbarObjects,
  };
}
