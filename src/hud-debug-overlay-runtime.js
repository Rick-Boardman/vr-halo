// SPDX-License-Identifier: Apache-2.0
import { createHudWorldHitRuntime } from "./hud-world-hit-runtime.js";
import {
  DEFAULT_RAY_LEN,
  makeDynamicWorldLine,
  makeCollisionDot,
  setDynamicWorldLine,
  setCollisionDotAt,
} from "./hud-vr-ray.js";

/**
 * Create shared debug-overlay rendering helpers for HUD controller rays and hit markers.
 *
 * This runtime owns the overlay scene, ray meshes, collision dots, and ray/hit scratch
 * vectors. When `showControllerRays` is false the overlay scene is not created and
 * `renderDebugOverlay` is a no-op.
 *
 * @param {object} [options={}] Debug-overlay runtime dependencies.
 * @param {object} options.THREE Three.js namespace for scene, material, and dot allocation.
 * @param {{ xr?: { isPresenting?: boolean }, autoClear?: boolean, clearDepth?: () => void, render?: (scene: any, camera: any) => void }} options.renderer Renderer used for second-pass overlay rendering.
 * @param {any} options.camera Camera used for debug overlay render pass.
 * @param {{ root?: { updateMatrixWorld?: (force: boolean) => void }, vrPointer?: { _pickMeshes?: Array<any> }, ui?: { order?: Array<string> }, objects?: { windows?: Record<string, any> } }} options.hud Shared HUD model containing window hit targets.
 * @param {boolean} options.showControllerRays Whether to build the ray/dot overlay scene.
 * @param {number} options.primaryHighlightColor Color for the first controller ray and UI-hit dot.
 * @param {number} options.secondaryHighlightColor Color for the second controller ray and UI-hit dot.
 * @param {number} options.worldCollisionDotColor Color for world-hit dots (shown when not hitting UI).
 * @param {(controller: any, originOut: any, dirOut: any) => void} options.getWorldRayForController Helper that resolves world-space ray origin/direction for a controller.
 * @param {any} options.rayOrigin Shared temporary origin vector used for UI raycasts.
 * @param {any} options.rayDir Shared temporary direction vector used for UI raycasts.
 * @param {{ ray?: { origin?: { copy?: (v: any) => void }, direction?: { copy?: (v: any) => void } }, near?: number, far?: number, camera?: any, intersectObjects?: (objects: Array<any>, recursive: boolean) => Array<any> }} options.raycaster Shared raycaster used for overlay UI-hit tests.
 * @param {() => any} options.getHeadCameraForHud Helper that returns the active camera for raycaster camera assignment.
 * @param {any} options.controllerRay0 First XR controller ray object.
 * @param {any} options.controllerRay1 Second XR controller ray object.
 * @param {() => Array<any> | null} options.getWorldRaycastTargets Provider for world-space raycast targets.
 * @returns {{renderDebugOverlay: () => void}} Debug-overlay renderer API.
 * Side effects: allocates overlay scene/mesh resources, mutates debug overlay mesh visibility, updates shared ray/point temporaries, performs second-pass renderer depth operations, and renders overlay scene content.
 */
export function createHudDebugOverlayRuntime({
  THREE,
  renderer,
  camera,
  hud,
  showControllerRays,
  primaryHighlightColor,
  secondaryHighlightColor,
  worldCollisionDotColor,
  getWorldRayForController,
  rayOrigin,
  rayDir,
  raycaster,
  getHeadCameraForHud,
  controllerRay0,
  controllerRay1,
  getWorldRaycastTargets,
} = {}) {
  // ── Build overlay scene (rays + dots) ──
  let debugOverlayScene = null;
  let debugOverlayRay0 = null;
  let debugOverlayRay1 = null;
  let debugOverlayDot0 = null;
  let debugOverlayDot1 = null;
  let debugOverlayWorldDot0 = null;
  let debugOverlayWorldDot1 = null;

  // Overlay ray/hit scratch vectors (allocated once, reused per frame).
  const overlayRayOrigin0 = new THREE.Vector3();
  const overlayRayOrigin1 = new THREE.Vector3();
  const overlayRayDir0 = new THREE.Vector3();
  const overlayRayDir1 = new THREE.Vector3();
  const overlayUiHitPoint0 = new THREE.Vector3();
  const overlayUiHitPoint1 = new THREE.Vector3();
  const overlayWorldHitPoint0 = new THREE.Vector3();
  const overlayWorldHitPoint1 = new THREE.Vector3();

  if (showControllerRays) {
    // Rays are rendered in a *second-pass overlay* (see renderDebugOverlay)
    // so HUD can never occlude them.
    debugOverlayScene = new THREE.Scene();
    const overlayRayMat0 = new THREE.LineBasicMaterial({
      color: primaryHighlightColor,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const overlayRayMat1 = new THREE.LineBasicMaterial({
      color: secondaryHighlightColor,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    debugOverlayRay0 = makeDynamicWorldLine(overlayRayMat0);
    debugOverlayRay1 = makeDynamicWorldLine(overlayRayMat1);
    debugOverlayScene.add(debugOverlayRay0.line);
    debugOverlayScene.add(debugOverlayRay1.line);

    debugOverlayDot0 = makeCollisionDot(primaryHighlightColor);
    debugOverlayDot1 = makeCollisionDot(secondaryHighlightColor);
    debugOverlayScene.add(debugOverlayDot0);
    debugOverlayScene.add(debugOverlayDot1);

    debugOverlayWorldDot0 = makeCollisionDot(worldCollisionDotColor);
    debugOverlayWorldDot1 = makeCollisionDot(worldCollisionDotColor);
    debugOverlayScene.add(debugOverlayWorldDot0);
    debugOverlayScene.add(debugOverlayWorldDot1);
  }

  const { getWorldHitDistanceAndPoint } = createHudWorldHitRuntime({
    getWorldRaycastTargets,
    getRaycaster: () => raycaster,
    getHeadCameraForHud,
  });
  function renderDebugOverlay() {
    if (!debugOverlayScene) return;

    if (!renderer?.xr?.isPresenting) {
      try {
        if (debugOverlayRay0?.line) debugOverlayRay0.line.visible = false;
        if (debugOverlayRay1?.line) debugOverlayRay1.line.visible = false;
        if (debugOverlayDot0) debugOverlayDot0.visible = false;
        if (debugOverlayDot1) debugOverlayDot1.visible = false;
        if (debugOverlayWorldDot0) debugOverlayWorldDot0.visible = false;
        if (debugOverlayWorldDot1) debugOverlayWorldDot1.visible = false;
      } catch {
        // no-op
      }
      return;
    }

    const prevAutoClear = renderer.autoClear;
    try {
      if (debugOverlayRay0 && debugOverlayRay1) {
        // Restore visibility after desktop frames set them false.
        debugOverlayRay0.line.visible = true;
        debugOverlayRay1.line.visible = true;

        try {
          hud.root.updateMatrixWorld(true);
        } catch {
          // no-op
        }

        if (!hud.vrPointer._pickMeshes) hud.vrPointer._pickMeshes = [];
        const pickMeshes = hud.vrPointer._pickMeshes;
        pickMeshes.length = 0;
        try {
          for (let i = hud.ui.order.length - 1; i >= 0; i--) {
            const key = hud.ui.order[i];
            const objs = hud.objects?.windows?.[key];
            if (objs?.hit && (objs.hit.isMesh || objs.hit.isInstancedMesh)) pickMeshes.push(objs.hit);
          }
        } catch {
          // no-op
        }

        function uiHitForController(controller, outPoint) {
          if (!controller) return null;
          try {
            getWorldRayForController(controller, rayOrigin, rayDir);
            raycaster.ray.origin.copy(rayOrigin);
            raycaster.ray.direction.copy(rayDir);
            raycaster.near = 0;
            raycaster.far = 500;
            try {
              raycaster.camera = getHeadCameraForHud();
            } catch {
              // no-op
            }

            const hits = raycaster.intersectObjects(pickMeshes, false);
            if (!hits || !hits.length) return null;
            for (let i = 0; i < hits.length; i++) {
              const hit = hits[i];
              const key = hit?.object?.userData?.windowKey;
              if (key === "__tooltip") continue;
              const t = Number(hit?.distance);
              if (!Number.isFinite(t) || t <= 0 || !hit?.point) continue;
              if (outPoint) outPoint.copy(hit.point);
              return t;
            }
          } catch {
            // no-op
          }
          return null;
        }

        try {
          getWorldRayForController(controllerRay0, overlayRayOrigin0, overlayRayDir0);
          const uiT0 = uiHitForController(controllerRay0, overlayUiHitPoint0);
          const uiHit0 = Number.isFinite(uiT0);
          const worldT0 = !uiHit0
            ? getWorldHitDistanceAndPoint(
              overlayRayOrigin0,
              overlayRayDir0,
              overlayWorldHitPoint0
            )
            : null;
          const len0 = uiHit0 ? uiT0 : Number.isFinite(worldT0) ? worldT0 : DEFAULT_RAY_LEN;
          setDynamicWorldLine(debugOverlayRay0, overlayRayOrigin0, overlayRayDir0, len0);
          setCollisionDotAt(debugOverlayDot0, overlayUiHitPoint0, uiHit0);
          setCollisionDotAt(
            debugOverlayWorldDot0,
            overlayWorldHitPoint0,
            !uiHit0 && Number.isFinite(worldT0)
          );
        } catch {
          if (debugOverlayDot0) debugOverlayDot0.visible = false;
          if (debugOverlayWorldDot0) debugOverlayWorldDot0.visible = false;
        }

        try {
          getWorldRayForController(controllerRay1, overlayRayOrigin1, overlayRayDir1);
          const uiT1 = uiHitForController(controllerRay1, overlayUiHitPoint1);
          const uiHit1 = Number.isFinite(uiT1);
          const worldT1 = !uiHit1
            ? getWorldHitDistanceAndPoint(
              overlayRayOrigin1,
              overlayRayDir1,
              overlayWorldHitPoint1
            )
            : null;
          const len1 = uiHit1 ? uiT1 : Number.isFinite(worldT1) ? worldT1 : DEFAULT_RAY_LEN;
          setDynamicWorldLine(debugOverlayRay1, overlayRayOrigin1, overlayRayDir1, len1);
          setCollisionDotAt(debugOverlayDot1, overlayUiHitPoint1, uiHit1);
          setCollisionDotAt(
            debugOverlayWorldDot1,
            overlayWorldHitPoint1,
            !uiHit1 && Number.isFinite(worldT1)
          );
        } catch {
          if (debugOverlayDot1) debugOverlayDot1.visible = false;
          if (debugOverlayWorldDot1) debugOverlayWorldDot1.visible = false;
        }
      }

      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(debugOverlayScene, camera);
    } catch {
      // no-op
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  return {
    renderDebugOverlay,
  };
}
