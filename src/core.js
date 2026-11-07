// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the canonical shared HUD system factory from the runtime core entrypoint.
 * Parameters: see the createHudSystem JSDoc in ./hud.js for the documented options object and defaults.
 * Return value: forwards the createHudSystem return shape defined in ./hud.js.
 * Side effects: none in this barrel; side effects are those of createHudSystem when callers invoke it.
 */
export { createHudSystem } from "./hud.js?v=hud-fix-1";

/**
 * Purpose: Re-export the canonical scene bootstrap factory from the runtime core entrypoint.
 * Parameters: see the createSceneHudBootstrap JSDoc in ./scene-hud-bootstrap.js for the documented options object and defaults.
 * Return value: forwards the createSceneHudBootstrap return shape defined in ./scene-hud-bootstrap.js.
 * Side effects: none in this barrel; side effects are those of createSceneHudBootstrap when callers invoke it.
 */
export { createSceneHudBootstrap } from "./scene-hud-bootstrap.js?v=hud-fix-1";

/**
 * Purpose: Re-export the shared world-object selection coordinator (desktop click + pointer-up fallback, touch, and XR controller-ray picking) from the runtime core entrypoint.
 * Parameters: see the wireSceneSelection JSDoc in ./navigation/scene-selection.js for the documented options object and defaults.
 * Return value: forwards the wireSceneSelection controller shape defined in ./navigation/scene-selection.js.
 * Side effects: none in this barrel; side effects are those of wireSceneSelection when callers invoke it.
 */
export { wireSceneSelection } from "./navigation/index.js";

/**
 * Purpose: Re-export the shared per-frame HUD render helper from the runtime core entrypoint.
 * Parameters: see the renderHudFrame JSDoc in ./frame-loop.js for the documented frame arguments.
 * Return value: forwards the renderHudFrame return contract defined in ./frame-loop.js.
 * Side effects: none in this barrel; side effects are those of renderHudFrame when callers invoke it.
 */
export { renderHudFrame } from "./frame-loop.js";

/**
 * Purpose: Re-export the canonical animation-loop bootstrap helper from the runtime core entrypoint.
 * Parameters: see the startAnimationLoop JSDoc in ./frame-loop.js for the documented options object and defaults.
 * Return value: forwards the startAnimationLoop return contract defined in ./frame-loop.js.
 * Side effects: none in this barrel; side effects are those of startAnimationLoop when callers invoke it.
 */
export { startAnimationLoop } from "./frame-loop.js";

/**
 * Purpose: Re-export the graphics calibration controller from the runtime core entrypoint.
 * Parameters: see createQualityCalibration in ./quality-calibration.js.
 * Return value: forwards the calibration controller. tickQualityCalibrations advances every started controller.
 * Side effects: none in this barrel. Starting a controller changes the renderer pixel ratio and writes halo.graphics.v1.
 */
export { createQualityCalibration, tickQualityCalibrations } from "./quality-calibration.js";
