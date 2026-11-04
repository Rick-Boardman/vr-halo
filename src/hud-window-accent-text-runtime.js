// SPDX-License-Identifier: Apache-2.0
import { HUD_Z_CONTENT_TEXT } from "./hud-layout-policy.js";

/**
 * Create shared HUD helpers that attach optional colored accent text layers to specific window object sets.
 * @param {object} [options={}] Window accent-text runtime dependencies.
 * @param {new (...args: any[]) => any} options.TroikaPixelText Constructor used to allocate HUD text wrappers.
 * @param {number | string} options.primaryHighlightColor Color used for inventory rare-item text.
 * @param {number | string} options.supremeAccentColor Color used for inventory supreme-item text.
 * @param {number | string} options.successColor Color used for progress good-state text.
 * @param {number | string} options.emphasisColor Color used for progress warning-state text.
 * @returns {{ attachWindowAccentTextLayers: (windows: Record<string, any>) => void }} API that adds optional accent text meshes for known window keys.
 * Side effects: mutates provided window-object sets by assigning additional Troika text wrappers.
 */
export function createHudWindowAccentTextRuntime({
  TroikaPixelText,
  primaryHighlightColor,
  supremeAccentColor,
  successColor,
  emphasisColor,
} = {}) {
  function attachWindowAccentTextLayers(windows) {
    const invObjs = windows?.inventory;
    if (invObjs) {
      invObjs.contentTextRare = new TroikaPixelText({ color: primaryHighlightColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      invObjs.contentTextRare.mesh.userData.windowKey = "inventory";

      invObjs.contentTextSupreme = new TroikaPixelText({ color: supremeAccentColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      invObjs.contentTextSupreme.mesh.userData.windowKey = "inventory";
    }

    const progObjs = windows?.progress;
    if (progObjs) {
      progObjs.contentTextGood = new TroikaPixelText({ color: successColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      progObjs.contentTextGood.mesh.userData.windowKey = "progress";

      progObjs.contentTextWarn = new TroikaPixelText({ color: emphasisColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });
      progObjs.contentTextWarn.mesh.userData.windowKey = "progress";
    }
  }

  return {
    attachWindowAccentTextLayers,
  };
}
