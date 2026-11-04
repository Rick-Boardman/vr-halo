// SPDX-License-Identifier: Apache-2.0
/**
 * @module hud-vr-controller-setup-runtime
 *
 * Resolves or creates VR controllers, reparents them, extracts ray handles,
 * wires select-start/end events, and encapsulates the mutable active-controller
 * and active-input-source state behind getter/setter closures.
 */

import { createHudControllerParentingRuntime } from "./hud-controller-parenting-runtime.js";
import { createHudControllerSelectRuntime } from "./hud-controller-select-runtime.js";

/**
 * @param {object} deps
 * @param {object} deps.THREE
 * @param {object} deps.renderer — WebGLRenderer (used for `xr.getController`)
 * @param {object} deps.scene — fallback parent for controllers
 * @param {object|null} deps.vrAnchor — preferred VR anchor Object3D
 * @param {Function} deps.resolveVrAnchorForRigPitch — resolves pitch-aware anchor
 * @param {object|null} deps.controllers — caller-supplied controllers (skip creation when truthy)
 * @param {Function} deps.createXrControllers — factory used when `controllers` is null
 * @param {object} deps.hud — mutable HUD state (for vrPointer writes)
 * @param {Function} deps.markDirty — flag the HUD for re-render
 * @param {Function} deps.endDragResize — ends any active drag/resize interaction
 * @returns {{
 *   controllersResolved: object,
 *   controllerRay0: object,
 *   controllerRay1: object,
 *   getActiveUiController: () => object,
 *   setActiveUiController: (c: object) => void,
 *   getActiveUiInputSource: () => object|null,
 *   setActiveUiInputSource: (s: object|null) => void,
 * }}
 */
export function createHudVrControllerSetupRuntime({
  THREE,
  renderer,
  scene,
  vrAnchor,
  resolveVrAnchorForRigPitch,
  controllers,
  createXrControllers,
  hud,
  markDirty,
  endDragResize,
}) {
  const desiredControllerParent =
    resolveVrAnchorForRigPitch(vrAnchor) || vrAnchor || scene;

  const { reparentResolvedControllers } = createHudControllerParentingRuntime({
    desiredControllerParent,
  });

  const controllersResolved =
    controllers ||
    createXrControllers({
      THREE,
      renderer,
      parent: desiredControllerParent,
      attachRays: true,
      attachGrips: true,
      addGripDebugMeshes: true,
    });

  reparentResolvedControllers(controllersResolved);

  const controllerRay0 =
    controllersResolved?.ray0 ?? renderer.xr.getController(0);
  const controllerRay1 =
    controllersResolved?.ray1 ?? renderer.xr.getController(1);

  // Mutable active-controller / active-input-source state.
  let activeUiController = controllerRay0;
  let activeUiInputSource = null;

  const { onSelectStart, onSelectEnd } = createHudControllerSelectRuntime({
    setActiveUiController: (controller) => {
      activeUiController = controller;
    },
    setActiveUiInputSource: (inputSource) => {
      activeUiInputSource = inputSource;
    },
    setVrPointerDown: (isDown) => {
      hud.vrPointer.down = isDown;
    },
    setVrPointerJustPressed: (justPressed) => {
      hud.vrPointer.justPressed = justPressed;
    },
    setVrPointerJustReleased: (justReleased) => {
      hud.vrPointer.justReleased = justReleased;
    },
    markDirty,
    endDragResize,
  });

  controllerRay0.addEventListener("selectstart", onSelectStart);
  controllerRay0.addEventListener("selectend", onSelectEnd);
  controllerRay1.addEventListener("selectstart", onSelectStart);
  controllerRay1.addEventListener("selectend", onSelectEnd);

  return {
    controllersResolved,
    controllerRay0,
    controllerRay1,
    getActiveUiController: () => activeUiController,
    setActiveUiController: (c) => {
      activeUiController = c;
    },
    getActiveUiInputSource: () => activeUiInputSource,
    setActiveUiInputSource: (s) => {
      activeUiInputSource = s;
    },
  };
}
