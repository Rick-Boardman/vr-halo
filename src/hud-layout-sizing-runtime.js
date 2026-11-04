// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD layout-sizing helpers for mode-specific layout dimensions and desktop quad scaling.
 * @param {object} [options={}] Layout-sizing runtime dependencies.
 * @param {object} options.THREE Three.js namespace used for FOV-to-scale conversion helpers.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to branch VR-vs-desktop sizing behavior.
 * @param {{ fov?: number, aspect?: number } | null} [options.camera=null] Camera used for desktop HUD quad scaling.
 * @param {{ layoutW?: number, layoutH?: number, root?: { scale?: { set?: (x: number, y: number, z: number) => void } }, ui?: { windows?: Record<string, any> } }} options.hud Shared HUD state model.
 * @param {() => { w: number, h: number }} options.getDesktopClientSize Callback that reports desktop viewport dimensions.
 * @param {() => void} options.markDirty Callback invoked when layout dimension changes require rerender.
 * @param {string} options.statusMode Status panel rendering mode; bars mode enforces minimum status panel height.
 * @param {(renderer: object) => number} options.getHudGlyphDotSizePx Glyph-size helper used to calculate status bars minimum height.
 * @param {number} options.titleHeightPx Status panel title-bar height in pixels.
 * @param {number} options.overlayPaddingPx Content padding used by status bars minimum-height math.
 * @param {number} options.vrLayoutW VR layout width in pixels.
 * @param {number} options.vrLayoutH VR layout height in pixels.
 * @param {number} options.desktopDistanceM Desktop HUD distance in meters used for FOV-based quad scaling.
 * @returns {{ setLayoutForMode: () => void, updateHudQuadSize: () => void }} Layout-sizing helpers used by resize and update flows.
 * Side effects: mutates HUD layout dimensions, status window minimum sizing, and HUD root scale.
 */
export function createHudLayoutSizingRuntime({
  THREE,
  renderer,
  camera = null,
  hud,
  getDesktopClientSize,
  markDirty,
  statusMode,
  getHudGlyphDotSizePx,
  titleHeightPx,
  overlayPaddingPx,
  vrLayoutW,
  vrLayoutH,
  desktopDistanceM,
} = {}) {
  function setLayoutForMode() {
    let nextW;
    let nextH;
    if (renderer.xr.isPresenting) {
      nextW = vrLayoutW;
      nextH = vrLayoutH;
    } else {
      const s = getDesktopClientSize();
      nextW = s.w;
      nextH = s.h;
    }

    try {
      const statusWin = hud?.ui?.windows?.status;
      if (statusWin && statusMode === "bars") {
        const dot = getHudGlyphDotSizePx(renderer);
        const barH = 10 + (dot - 2) * 3;
        const glyphH = 7 * dot;
        const requiredH = titleHeightPx + 18 + 2 * barH + glyphH + overlayPaddingPx;
        statusWin.h = Math.max(Number(statusWin.h) || 0, requiredH);
        statusWin.minH = Math.max(Number(statusWin.minH) || 0, requiredH);
      }
    } catch {
      // no-op
    }

    if (hud.layoutW !== nextW || hud.layoutH !== nextH) {
      hud.layoutW = nextW;
      hud.layoutH = nextH;
      markDirty();
    }
  }

  function updateHudQuadSize() {
    if (renderer.xr.isPresenting) {
      hud.root.scale.set(1, 1, 1);
      return;
    }

    if (!camera) return;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * desktopDistanceM * Math.tan(fovRad / 2);
    const viewW = viewH * camera.aspect;
    hud.root.scale.set(viewW, viewH, 1);
  }

  return {
    setLayoutForMode,
    updateHudQuadSize,
  };
}
