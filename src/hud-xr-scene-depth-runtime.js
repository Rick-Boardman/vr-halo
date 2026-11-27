// SPDX-License-Identifier: Apache-2.0
import { HUD_VR_DEPTH_MIN_RADIUS_M } from "./hud-placement-policy.js";

/** The title-bar plane a window's vrZ is measured from (matches the VR depth-drag runtime). */
const HUD_VR_BASE_Z = 0.002;
/** Hidden windows are parked far above the layout (see HudWindowModel.setHidden). */
const HUD_HIDDEN_Y_BELOW = -1000;
/** How far in front of the nearest panel a focused scene object sits, in meters. */
const XR_FOCUS_MARGIN_M = 0.5;
/** The nearest a focused scene object comes, in meters. */
const XR_FOCUS_MIN_M = 0.75;

/**
 * Purpose: in a headset, let real distance decide what is in front: HUD panels and scene content.
 *
 * While presenting XR the HUD's meshes test against the scene's depth (they still write none), so scene
 * content nearer than a panel hides it and content behind it does not. A ray that reaches a panel gives
 * way to the scene when the application reports a scene hit nearer along the same ray. On the desktop
 * nothing changes: the HUD draws over the scene and the desktop window stack (scene layers) applies.
 *
 * @param {object} deps
 * @param {object} deps.hud HUD state (root, ui.order, ui.windows).
 * @param {{ xr?: { isPresenting?: boolean } }} deps.renderer Renderer whose XR presentation gates this runtime.
 * @param {number} deps.vrDistance Default HUD distance in meters (a window's distance is vrDistance - vrZ).
 * @param {number} [deps.vrDepthMinRadius] The nearest a window can be pushed, in meters.
 * @returns {{
 *   setXrSceneRayTest: (test: ((origin: object, direction: object) => number | null) | null) => void,
 *   sceneIsNearerAlongRay: (origin: object, direction: object, hudDistance: number) => boolean,
 *   getXrFocusDistance: (options?: { margin?: number, min?: number }) => number,
 *   syncHudDepth: () => void,
 * }}
 */
export function createHudXrSceneDepthRuntime({ hud, renderer, vrDistance, vrDepthMinRadius } = {}) {
  const minRadius = Number.isFinite(Number(vrDepthMinRadius)) ? Number(vrDepthMinRadius) : HUD_VR_DEPTH_MIN_RADIUS_M;
  let sceneRayTest = null;
  let depthApplied = false;

  function presenting() {
    return !!renderer?.xr?.isPresenting;
  }

  function setXrSceneRayTest(test) {
    if (test != null && typeof test !== "function") throw new TypeError("setXrSceneRayTest: expected a function or null");
    sceneRayTest = test ?? null;
  }

  /** True when the application's scene has a hit along this world ray nearer than the HUD hit. */
  function sceneIsNearerAlongRay(origin, direction, hudDistance) {
    if (!presenting() || !sceneRayTest || !Number.isFinite(hudDistance)) return false;
    const reported = sceneRayTest(origin, direction);
    if (reported == null) return false;
    const sceneDistance = Number(reported);
    return Number.isFinite(sceneDistance) && sceneDistance >= 0 && sceneDistance < hudDistance;
  }

  /** A distance from the viewer, in meters, in front of every visible HUD panel. */
  function getXrFocusDistance({ margin = XR_FOCUS_MARGIN_M, min = XR_FOCUS_MIN_M } = {}) {
    let nearest = Number(vrDistance);
    for (const key of hud?.ui?.order ?? []) {
      const win = hud.ui.windows?.[key];
      if (!win || Number(win.y) < HUD_HIDDEN_Y_BELOW) continue;
      const vrZ = Number(win.vrZ ?? 0);
      const radius = Number(vrDistance) - (Number.isFinite(vrZ) ? vrZ : 0) - HUD_VR_BASE_Z;
      if (Number.isFinite(radius)) nearest = Math.min(nearest, Math.max(radius, minRadius));
    }
    return Math.max(min, nearest - margin);
  }

  function setMaterialDepth(material, on) {
    if (!material) return;
    const data = material.userData ?? (material.userData = {});
    if (on) {
      if (data.haloXrBaseDepthTest === undefined) data.haloXrBaseDepthTest = material.depthTest;
      if (material.depthTest !== true) {
        material.depthTest = true;
        material.needsUpdate = true;
      }
    } else if (data.haloXrBaseDepthTest !== undefined) {
      if (material.depthTest !== data.haloXrBaseDepthTest) {
        material.depthTest = data.haloXrBaseDepthTest;
        material.needsUpdate = true;
      }
      delete data.haloXrBaseDepthTest;
    }
  }

  /**
   * Per frame: while presenting, every HUD material tests depth (new windows and rebuilt text included);
   * when presentation ends, each gets its own setting back.
   */
  function syncHudDepth() {
    const on = presenting();
    if (!on && !depthApplied) return;
    depthApplied = on;
    hud?.root?.traverse?.((object) => {
      const material = object.material;
      if (Array.isArray(material)) for (const m of material) setMaterialDepth(m, on);
      else setMaterialDepth(material, on);
    });
  }

  return { setXrSceneRayTest, sceneIsNearerAlongRay, getXrFocusDistance, syncHudDepth };
}
