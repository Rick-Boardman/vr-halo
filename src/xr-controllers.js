// SPDX-License-Identifier: Apache-2.0
// XR controller wiring helper for three.js WebXR.
//
// Purpose:
// - Centralize the canonical controller setup used across this repo.
// - Avoid per-scene drift that causes Quest-only regressions.
//
// This helper is intentionally minimal and UI-agnostic.

/**
 * Purpose: Create the canonical pair of WebXR controller rays and grips used by shared runtime HUD and navigation code.
 * @param {object} [options={}] Controller wiring options.
 * @param {{ CylinderGeometry: new (radiusTop: number, radiusBottom: number, height: number, radialSegments: number) => unknown, MeshBasicMaterial: new (options?: object) => unknown, Mesh: new (geometry: unknown, material: unknown) => { rotation: { x: number }, position: { z: number } } }} options.THREE Three.js namespace used to build optional debug grip meshes.
 * @param {{ xr: { getController: (index: number) => { addEventListener: Function, userData: Record<string, unknown> }, getControllerGrip: (index: number) => { add?: (...objects: unknown[]) => void } } }} options.renderer Renderer whose XR manager owns the controller spaces.
 * @param {{ add: (...objects: unknown[]) => void }} [options.parent] Optional parent object that receives controller rays and grips.
 * @param {boolean} [options.attachRays=true] Whether controller target-ray spaces should be attached to the parent.
 * @param {boolean} [options.attachGrips=true] Whether controller grip spaces should be attached to the parent.
 * @param {boolean} [options.addGripDebugMeshes=false] Whether simple colored debug meshes should be attached to the grip spaces.
 * @returns {{ ray0: unknown, ray1: unknown, grip0: unknown, grip1: unknown }} Canonical controller ray and grip objects from the renderer XR manager.
 * Side effects: registers connected/disconnected listeners on controller rays, may parent ray/grip objects into the scene graph, and may allocate and attach debug grip meshes.
 */
export function createXrControllers({
  THREE,
  renderer,
  parent,
  // NOTE: This attaches the *controller objects* (targetRaySpace) to the scene graph.
  // It does NOT merely toggle a visual ray line. Many systems (including the runtime HUD)
  // attach ray meshes/dots *to these controller objects*, so disabling this can make
  // rays/dots disappear entirely.
  attachRays = true,
  attachGrips = true,
  addGripDebugMeshes = false,
} = {}) {
  if (!THREE) throw new Error("createXrControllers: THREE is required");
  if (!renderer) throw new Error("createXrControllers: renderer is required");

  const ray0 = renderer.xr.getController(0);
  const ray1 = renderer.xr.getController(1);

  const grip0 = renderer.xr.getControllerGrip(0);
  const grip1 = renderer.xr.getControllerGrip(1);

  function bindInputSource(controller) {
    controller.addEventListener("connected", (e) => {
      controller.userData.inputSource = e.data;
    });
    controller.addEventListener("disconnected", () => {
      controller.userData.inputSource = null;
    });
  }

  bindInputSource(ray0);
  bindInputSource(ray1);

  if (attachRays) {
    if (parent) {
      parent.add(ray0);
      parent.add(ray1);
    }
  }

  if (attachGrips) {
    if (parent) {
      parent.add(grip0);
      parent.add(grip1);
    }

    if (addGripDebugMeshes) {
      const geo = new THREE.CylinderGeometry(0.012, 0.015, 0.09, 10);
      // Use BasicMaterial so grips are visible even in unlit scenes.
      const mat0 = new THREE.MeshBasicMaterial({ color: 0x2a6cff });
      const mat1 = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
      const m0 = new THREE.Mesh(geo, mat0);
      const m1 = new THREE.Mesh(geo, mat1);
      m0.rotation.x = Math.PI / 2;
      m1.rotation.x = Math.PI / 2;
      m0.position.z = -0.03;
      m1.position.z = -0.03;
      grip0.add(m0);
      grip1.add(m1);
    }
  }

  return { ray0, ray1, grip0, grip1 };
}
