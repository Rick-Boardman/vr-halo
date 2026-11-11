// SPDX-License-Identifier: Apache-2.0
// Shared per-frame loop helpers for scenes that use the runtime library.
// Goal: keep the WebXR ordering + overlay debug rendering DRY.

/**
 * @param {{ renderer?: unknown, scene?: unknown, camera?: unknown }} options
 * @param {string} helperName
 */
function assertFrameContext({ renderer, scene, camera } = {}, helperName) {
  if (!renderer) throw new Error(`${helperName}: missing renderer`);
  if (!scene) throw new Error(`${helperName}: missing scene`);
  if (!camera) throw new Error(`${helperName}: missing camera`);
}

/**
 * @param {{ renderer?: unknown, onFrame?: unknown, THREE?: { Timer?: new () => { update(timestamp?: number): unknown, getDelta(): number } } }} options
 * @param {string} helperName
 */
function assertAnimationLoopContext({ renderer, onFrame, THREE } = {}, helperName) {
  if (!renderer) throw new Error(`${helperName}: missing renderer`);
  if (!THREE?.Timer) throw new Error(`${helperName}: missing THREE.Timer (Three.js r179 or newer; Halo needs three 0.185.1)`);
  if (typeof onFrame !== "function") throw new Error(`${helperName}: missing onFrame callback`);
}

/**
 * Purpose: Start the canonical shared animation loop and feed each frame through a THREE.Timer delta before delegating to onFrame.
 * @param {object} [options] Animation-loop configuration.
 * @param {{ setAnimationLoop(callback: (timestamp?: number, frame?: unknown) => void): void }} [options.renderer] Renderer that owns the animation loop.
 * @param {{ Timer?: new () => { update(timestamp?: number): unknown, getDelta(): number } }} [options.THREE] Three.js namespace that provides Timer. THREE.Clock is deprecated since r183 and warns when constructed.
 * @param {(payload: { dt: number, timestamp?: number, frame?: unknown }) => void} [options.onFrame] Per-frame callback invoked with the clamped delta, timestamp, and XR frame.
 * @param {number | null} [options.maxDelta=null] Optional upper bound for dt to avoid oversized frame deltas after pauses or tab throttling.
 * @returns {void} Does not return a value.
 * Side effects: installs a renderer animation loop callback and allocates a THREE.Timer that is advanced with the loop's timestamp on every rendered frame. The timer is not connected to the document, so it adds no listeners.
 */
export function startAnimationLoop({
  renderer,
  THREE,
  onFrame,
  maxDelta = null,
} = {}) {
  assertAnimationLoopContext({ renderer, onFrame, THREE }, "startAnimationLoop");

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((timestamp, frame) => {
    timer.update(timestamp);
    const rawDelta = timer.getDelta();
    const dt = maxDelta == null ? rawDelta : Math.min(maxDelta, rawDelta);
    onFrame({ dt, timestamp, frame });
  });
}

/**
 * Purpose: Render one frame with the canonical HUD and navigation ordering used by shared runtime harnesses on desktop and in WebXR.
 * @param {object} [options] HUD frame configuration.
 * @param {{ render(scene: unknown, camera: unknown): void, xr?: { isPresenting?: boolean } }} [options.renderer] Renderer used for the world pass and XR pose refresh.
 * @param {unknown} [options.scene] Scene rendered during the frame.
 * @param {unknown} [options.camera] Camera used for the frame render.
 * @param {number} [options.dt] Frame delta forwarded into hudSystem.update and navigation.update.
 * @param {{ update?(dt: number | undefined): void, renderDebugOverlay?(): void } | null} [options.hudSystem=null] Optional HUD controller updated after the initial world render and used for debug overlays.
 * @param {{ update?(dt: number | undefined): void, renderOverlay?(): void } | null} [options.navigation=null] Optional navigation controller updated after HUD debug rendering and used for final overlay rendering.
 * @returns {void} Does not return a value.
 * Side effects: renders the scene, updates HUD and navigation systems, and may render HUD debug and navigation overlays that mutate the renderer frame output.
 * In WebXR, the first render call refreshes controller and headset poses before HUD picking and overlay work run.
 */
export function renderHudFrame({
  renderer,
  scene,
  camera,
  dt,
  hudSystem = null,
  navigation = null,
} = {}) {
  assertFrameContext({ renderer, scene, camera }, "renderHudFrame");

  const presenting = !!renderer?.xr?.isPresenting;

  // IMPORTANT (WebXR): Three.js updates XR controller poses during render().
  // The HUD library's VR picking relies on those poses, so render first in XR.
  // Desktop: the facing mark follows the camera this frame will be drawn from, however the application moved it.
  try {
    navigation?.syncOverlay?.();
  } catch {
    // no-op
  }
  renderer.render(scene, camera);

  try {
    hudSystem?.update?.(dt);
  } catch {
    // no-op
  }

  // Second-pass overlay so HUD never occludes debug rays/dots.
  // Note: this issues another render() in XR, which can sample a fresh XR pose.
  // Keep navigation.update() (which computes the facing crosshair) *after* this,
  // so the crosshair is computed from the same most-recent XR camera pose.
  try {
    hudSystem?.renderDebugOverlay?.();
  } catch {
    // no-op
  }

  // Update navigation as late as possible so any overlay predictors (like the
  // facing crosshair) are based on the same XR pose used by the final overlay pass.
  try {
    navigation?.update?.(dt);
  } catch {
    // no-op
  }

  // Facing crosshair lives in the main scene. renderOverlay is a no-op for that mark.
  try {
    navigation?.renderOverlay?.();
  } catch {
    // no-op
  }
}
