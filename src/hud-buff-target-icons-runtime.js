// SPDX-License-Identifier: Apache-2.0
import { HUD_SURFACE_ELEMENT_OPACITY, HUD_Z_SURFACE_FG } from "./hud-layout-policy.js";

/**
 * Create shared HUD helpers that allocate buff-grid and target-icon meshes.
 * @param {object} [options={}] Buff/target icon runtime dependencies.
 * @param {(options: { x: number, y: number, w: number, h: number, color: number | string, opacity?: number, z?: number, order?: number }) => any} options.makeRect Mesh-factory callback used to allocate icon quads.
 * @param {number | string} options.surfaceAccentColor Canonical accent color used for buff and target icon fills.
 * @param {number} options.buffIconCount Number of buff icon quads to allocate.
 * @param {number} options.buffIconSizePx Buff icon square size in pixels.
 * @param {number} options.targetIconCount Number of target icon quads to allocate.
 * @param {number} options.targetIconSizePx Target icon square size in pixels.
 * @returns {{ createBuffTargetIcons: () => { buffIcons: Array<any>, targetIcons: Array<any> } }} API that builds canonical buff and target icon object arrays.
 * Side effects: allocates Three.js meshes/materials for HUD buff and target icon rendering.
 */
export function createHudBuffTargetIconsRuntime({
  makeRect,
  surfaceAccentColor,
  buffIconCount,
  buffIconSizePx,
  targetIconCount,
  targetIconSizePx,
} = {}) {
  function createBuffTargetIcons() {
    const buffIcons = [];
    for (let i = 0; i < buffIconCount; i++) {
      const icon = makeRect({
        x: 0,
        y: 0,
        w: buffIconSizePx,
        h: buffIconSizePx,
        color: surfaceAccentColor,
        opacity: HUD_SURFACE_ELEMENT_OPACITY,
        z: HUD_Z_SURFACE_FG,
      });
      icon.userData.windowKey = "buffs";
      buffIcons.push(icon);
    }

    const targetIcons = [];
    for (let i = 0; i < targetIconCount; i++) {
      const icon = makeRect({
        x: 0,
        y: 0,
        w: targetIconSizePx,
        h: targetIconSizePx,
        color: surfaceAccentColor,
        opacity: HUD_SURFACE_ELEMENT_OPACITY,
        z: HUD_Z_SURFACE_FG,
      });
      icon.userData.windowKey = "target";
      targetIcons.push(icon);
    }

    return {
      buffIcons,
      targetIcons,
    };
  }

  return {
    createBuffTargetIcons,
  };
}
