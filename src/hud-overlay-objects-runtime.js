// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD helpers that allocate and initialize overlay objects (tooltip + context menu).
 * @param {object} [options={}] Overlay-object runtime dependencies.
 * @param {(options: { x: number, y: number, w: number, h: number, color: number | string, opacity?: number, z?: number, order?: number }) => any} options.makeRect Mesh-factory callback used to allocate overlay quads.
 * @param {new (...args: any[]) => any} options.TroikaPixelText Constructor used to allocate overlay text wrappers.
 * @param {number | string} options.surfaceContentBgColor Overlay tooltip background color.
 * @param {number | string} options.surfacePanelBgColor Overlay context menu background color.
 * @param {number | string} options.surfaceAccentColor Overlay hover highlight color.
 * @param {number | string} options.textDefaultColor Default overlay text color.
 * @param {number | string} options.textDisabledColor Disabled overlay text color.
 * @param {number} options.overlayTextRenderOrder Render-order applied to overlay text meshes.
 * @param {number} options.overlayColorLayerRenderOrder Render-order used by colored multiline tooltip layers.
 * @returns {{ createOverlayObjects: () => Record<string, any> }} API that constructs canonical overlay objects.
 * Side effects: allocates Three.js meshes/materials and Troika text wrappers for HUD overlays.
 */
export function createHudOverlayObjectsRuntime({
  makeRect,
  TroikaPixelText,
  surfaceContentBgColor,
  surfacePanelBgColor,
  surfaceAccentColor,
  textDefaultColor,
  textDisabledColor,
  overlayTextRenderOrder,
  overlayColorLayerRenderOrder,
} = {}) {
  function createOverlayObjects() {
    const overlay = {
      tooltipBg: makeRect({
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        color: surfaceContentBgColor,
        opacity: 0.92,
        z: 0.006,
        order: 9000,
      }),
      tooltipText: new TroikaPixelText({ color: textDefaultColor, z: 0.007, depthTest: false }),
      menuBg: makeRect({
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        color: surfacePanelBgColor,
        opacity: 0.96,
        z: 0.006,
        order: 9000,
      }),
      menuHover: makeRect({
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        color: surfaceAccentColor,
        opacity: 0.7,
        z: 0.0065,
        order: 9001,
      }),
      menuTextEnabled: new TroikaPixelText({ color: textDefaultColor, z: 0.007, depthTest: false }),
      menuTextDisabled: new TroikaPixelText({ color: textDisabledColor, z: 0.007, depthTest: false }),
    };

    overlay.tooltipBg.userData.windowKey = "__tooltip";
    overlay.tooltipText.mesh.userData.windowKey = "__tooltip";
    overlay.menuBg.userData.windowKey = "__menu";
    overlay.menuHover.userData.windowKey = "__menu";
    overlay.menuTextEnabled.mesh.userData.windowKey = "__menu";
    overlay.menuTextDisabled.mesh.userData.windowKey = "__menu";

    overlay.tooltipBg.visible = false;
    overlay.menuBg.visible = false;
    overlay.menuHover.visible = false;
    overlay.tooltipText.mesh.visible = false;
    overlay.menuTextEnabled.mesh.visible = false;
    overlay.menuTextDisabled.mesh.visible = false;
    overlay.tooltipText.setRenderOrder(overlayTextRenderOrder);
    overlay.menuTextEnabled.setRenderOrder(overlayTextRenderOrder);
    overlay.menuTextDisabled.setRenderOrder(overlayTextRenderOrder);

    // Allow colored multiline rendering into the tooltip overlay.
    // We reuse the same helper as windows (setColoredMultilineText) by aliasing
    // the tooltip text mesh as "contentText" and using overlay-local color layers.
    overlay._windowKey = "__tooltip";
    overlay.contentText = overlay.tooltipText;
    overlay._colorLayerZOverride = 0.0072;
    overlay._colorLayerRenderOrderOverride = overlayColorLayerRenderOrder;

    return overlay;
  }

  return {
    createOverlayObjects,
  };
}
