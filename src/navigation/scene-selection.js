// SPDX-License-Identifier: Apache-2.0
// Shared scene selection/hover coordinator for all three input modes.
// Goal: own the desktop (mouse), mobile (touch), and Quest (controller ray)
// selection/hover plumbing in one place so apps only supply scene-object
// pick callbacks and react to semantic select/hover events. Apps never wire
// their own pointer/touch/controller listeners for selection.

/**
 * Purpose: Wire the shared desktop, touch, and XR hover/selection behavior for any scene and return a controller for polling hover state and teardown.
 * @param {object} [options] Selection-coordinator configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate matrices and vectors for XR ray tests.
 * @param {{ domElement?: EventTarget, xr?: { isPresenting?: boolean } }} [options.renderer] Renderer whose DOM element and XR presentation state drive pointer and XR picking.
 * @param {object} [options.camera] Active camera used by the underlying picking callbacks.
 * @param {object | null} [options.hudSystem] Shared HUD system used to detect UI occlusion before desktop picks.
 * @param {() => boolean} [options.getWorldControlsEnabled=() => true] Predicate indicating whether world controls are currently enabled.
 * @param {Array<object>} [options.controllerRays=[]] XR controller-ray objects that expose `matrixWorld` and `addEventListener/removeEventListener`.
 * @param {(clientX: number, clientY: number) => string | null} [options.pickFromClientPoint] Desktop/touch picking callback that resolves a scene-object id from a client-space pointer position.
 * @param {(rayOrigin: object, rayDir: object) => { id?: string | null, distance?: number | null, point?: object | null, graphHit?: object | null } | null} [options.pickHitFromRay] XR picking callback that resolves the nearest scene hit for a world-space ray.
 * @param {(id: string | null) => void} [options.onHover=null] Optional callback fired when the hovered object id changes.
 * @param {(id: string, context: { source: "desktop" | "xr", event?: object, controllerRay?: object }) => void} [options.onSelect=null] Optional callback fired when an object is selected.
 * @param {(context: { source: "desktop", event: object }) => void} [options.onSelectMiss=null] Optional callback fired when desktop selection misses every object.
 * @param {object} [options.desktop] Desktop-only picking options.
 * @param {boolean} [options.desktop.requireWorldControlsEnabledForClick=false] Whether desktop clicks should be ignored when world controls are disabled.
 * @param {boolean} [options.desktop.ignoreUiForClick=false] Whether desktop clicks over HUD UI should be ignored.
 * @param {boolean} [options.desktop.ignoreUiForPointerFallback=options.desktop.ignoreUiForClick] Whether the pointer-up fallback click path should ignore HUD UI.
 * @param {() => boolean} [options.desktop.shouldAllowHover=() => true] Predicate controlling whether desktop hover updates should be emitted for the current app interaction state.
 * @param {number} [options.desktop.pointerFallbackMaxMovePx=3] Maximum pointer movement allowed before the pointer-up fallback stops counting as a click.
 * @returns {{ getHoveredId: () => string | null, getLastVrHit: () => { id: string, distance: number, point: object, controllerRay: object } | null, setHovered: (nextId: string | null) => void, updateVrHover: () => string | null, dispose: () => void }} Selection controller exposing hover state, XR hit polling, manual hover override, and teardown.
 * Side effects: attaches desktop pointer/click listeners to the renderer DOM element, attaches XR select listeners to controller rays, invokes hover/select callbacks, and tracks mutable hovered/XR-hit state until disposed.
 */
export function wireSceneSelection({
  THREE,
  renderer,
  camera,
  hudSystem,
  getWorldControlsEnabled = () => true,

  controllerRays = [],

  // (clientX, clientY) => id|null
  pickFromClientPoint,
  // (rayOrigin, rayDir) => { id, distance } | null
  pickHitFromRay,

  onHover = null,
  onSelect = null,
  onSelectMiss = null,

  desktop: {
    requireWorldControlsEnabledForClick = false,
    ignoreUiForClick = false,
    ignoreUiForPointerFallback = ignoreUiForClick,
    ignoreUiForHover = true,
    shouldAllowHover = () => true,
    pointerFallbackMaxMovePx = 3,
  } = {},
} = {}) {
  if (!THREE) throw new Error("wireSceneSelection: missing THREE");
  if (!renderer?.domElement) throw new Error("wireSceneSelection: missing renderer.domElement");
  if (!camera) throw new Error("wireSceneSelection: missing camera");
  if (typeof pickFromClientPoint !== "function") {
    throw new Error("wireSceneSelection: missing pickFromClientPoint(clientX, clientY)");
  }
  if (typeof pickHitFromRay !== "function") {
    throw new Error("wireSceneSelection: missing pickHitFromRay(rayOrigin, rayDir)");
  }

  let hoveredId = null;
  let suppressNativeClickUntilMs = 0;

  function setHovered(nextId) {
    if (nextId === hoveredId) return;
    hoveredId = nextId;
    try {
      onHover?.(nextId);
    } catch (e) {
      console.warn("onHover error", e);
    }
  }

  function shouldAllowDesktopClick(clientX, clientY, { forPointerFallback = false } = {}) {
    if (renderer.xr?.isPresenting) return false;
    if (requireWorldControlsEnabledForClick && !getWorldControlsEnabled()) return false;

    const ignoreUi = forPointerFallback ? ignoreUiForPointerFallback : ignoreUiForClick;
    if (ignoreUi && hudSystem?.isClientPointOverUi?.(clientX, clientY)) return false;

    return true;
  }

  function isXrControllerPointerOverUi(controllerRay = null) {
    if (!renderer.xr?.isPresenting) return false;
    const pointer = hudSystem?.hud?.vrPointer ?? null;
    if (!pointer) return false;

    const explicitWindowKeyForController = controllerRay === controllerRays[0]
      ? String(pointer.controllerRay0WindowKey ?? "").trim()
      : controllerRay === controllerRays[1]
        ? String(pointer.controllerRay1WindowKey ?? "").trim()
        : "";
    if (explicitWindowKeyForController) return true;

    if (!controllerRay) {
      if (String(pointer.controllerRay0WindowKey ?? "").trim()) return true;
      if (String(pointer.controllerRay1WindowKey ?? "").trim()) return true;
    }

    if (!pointer?.active) return false;
    if (typeof hudSystem?.isPointOverUi !== "function") return false;
    if (!hudSystem.isPointOverUi(pointer.x, pointer.y)) return false;
    if (!controllerRay) return true;
    return pointer.controllerRay === controllerRay;
  }

  function onDesktopClick(e) {
    if (performance.now() <= suppressNativeClickUntilMs) {
      suppressNativeClickUntilMs = 0;
      return;
    }

    if (!shouldAllowDesktopClick(e.clientX, e.clientY, { forPointerFallback: false })) return;

    const id = pickFromClientPoint(e.clientX, e.clientY);
    if (!id) {
      try {
        onSelectMiss?.({ source: "desktop", event: e });
      } catch {
        // no-op
      }
      return;
    }

    try {
      onSelect?.(id, { source: "desktop", event: e });
    } catch (err) {
      console.warn("onSelect error", err);
    }
  }

  function onDesktopMove(e) {
    if (renderer.xr?.isPresenting) return;
    if ((Number(e?.buttons) || 0) !== 0) {
      setHovered(null);
      return;
    }
    if (ignoreUiForHover && hudSystem?.isClientPointOverUi?.(e.clientX, e.clientY)) {
      setHovered(null);
      return;
    }
    if (!shouldAllowHover()) {
      setHovered(null);
      return;
    }

    const id = pickFromClientPoint(e.clientX, e.clientY);
    setHovered(id);
  }

  function onDesktopLeave() {
    setHovered(null);
  }

  // Pointer-based click fallback: ensures selection works even when the browser
  // doesn't emit a "click" event (e.g. pointer capture / drag-look interactions).
  let pointerDown = null;

  function onPointerDownForPick(e) {
    if (renderer.xr?.isPresenting) return;
    if (e.button !== 0) return;

    // The pointer-up fallback is the authoritative path for pointer-based picks.
    // Suppress the browser's follow-up native click so HUD drags do not collapse selection.
    suppressNativeClickUntilMs = performance.now() + 750;

    if (ignoreUiForPointerFallback && hudSystem?.isClientPointOverUi?.(e.clientX, e.clientY)) {
      pointerDown = null;
      return;
    }
    setHovered(null);
    pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }

  function onPointerUpForPick(e) {
    if (renderer.xr?.isPresenting) return;
    if (e.button !== 0) return;

    const down = pointerDown;
    pointerDown = null;

    if (!down || (down.id != null && e.pointerId !== down.id)) return;

    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > pointerFallbackMaxMovePx) return;

    if (!shouldAllowDesktopClick(e.clientX, e.clientY, { forPointerFallback: true })) return;

    onDesktopClick(e);
  }

  // VR selection: controller ray -> object hit.
  const controllerWires = [];

  function wireControllerSelection(controllerRay) {
    if (!controllerRay?.addEventListener) return;

    const onSelectStart = () => {
      if (!renderer.xr?.isPresenting) return;
      if (isXrControllerPointerOverUi(controllerRay)) return;
      if (!getWorldControlsEnabled()) return;

      const m = new THREE.Matrix4().extractRotation(controllerRay.matrixWorld);
      const origin = new THREE.Vector3().setFromMatrixPosition(controllerRay.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
      const hit = pickHitFromRay(origin, dir);
      const id = hit?.id ?? null;
      if (!id) return;

      try {
        onSelect?.(id, {
          source: "xr",
          controllerRay,
          graphHit: hit?.graphHit ?? null,
          hit,
        });
      } catch (e) {
        console.warn("onSelect error", e);
      }
    };

    controllerRay.addEventListener("selectstart", onSelectStart);
    controllerWires.push({ controllerRay, onSelectStart });
  }

  for (const r of controllerRays) wireControllerSelection(r);

  // VR hover: choose the nearest object along either controller ray.
  // Also reports hit info for visualization.
  let lastVrHit = null;

  function updateVrHover() {
    if (!renderer.xr?.isPresenting) {
      lastVrHit = null;
      return hoveredId;
    }
    if (!getWorldControlsEnabled()) {
      lastVrHit = null;
      return hoveredId;
    }

    let best = null;
    let bestRay = null;

    for (const controllerRay of controllerRays) {
      if (!controllerRay) continue;
      if (isXrControllerPointerOverUi(controllerRay)) continue;
      const m = new THREE.Matrix4().extractRotation(controllerRay.matrixWorld);
      const origin = new THREE.Vector3().setFromMatrixPosition(controllerRay.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
      const hit = pickHitFromRay(origin, dir);
      if (!hit?.id) continue;
      if (!best || (hit.distance ?? 0) < (best.distance ?? 0)) {
        best = hit;
        bestRay = controllerRay;
      }
    }

    if (best && best.distance != null) {
      const point = best.point?.clone?.() ?? null;
      if (!point) {
        const m = new THREE.Matrix4().extractRotation(bestRay.matrixWorld);
        const origin = new THREE.Vector3().setFromMatrixPosition(bestRay.matrixWorld);
        const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize();
        lastVrHit = {
          id: best.id,
          distance: best.distance,
          point: origin.clone().addScaledVector(dir, best.distance),
          controllerRay: bestRay,
          graphHit: best.graphHit ?? null,
        };
      } else {
        lastVrHit = {
          id: best.id,
          distance: best.distance,
          point,
          controllerRay: bestRay,
          graphHit: best.graphHit ?? null,
        };
      }
    } else {
      lastVrHit = null;
    }

    setHovered(best?.id ?? null);
    return hoveredId;
  }

  function getLastVrHit() {
    return lastVrHit;
  }

  // Use capture so we still receive events if other handlers call stopImmediatePropagation.
  renderer.domElement.addEventListener("click", onDesktopClick, { capture: true });
  renderer.domElement.addEventListener("pointermove", onDesktopMove, { capture: true });
  renderer.domElement.addEventListener("pointerleave", onDesktopLeave, { capture: true });
  renderer.domElement.addEventListener("pointerdown", onPointerDownForPick, { capture: true });
  renderer.domElement.addEventListener("pointerup", onPointerUpForPick, { capture: true });

  function dispose() {
    try {
      renderer.domElement.removeEventListener("click", onDesktopClick, { capture: true });
      renderer.domElement.removeEventListener("pointermove", onDesktopMove, { capture: true });
      renderer.domElement.removeEventListener("pointerleave", onDesktopLeave, { capture: true });
      renderer.domElement.removeEventListener("pointerdown", onPointerDownForPick, { capture: true });
      renderer.domElement.removeEventListener("pointerup", onPointerUpForPick, { capture: true });
    } catch {
      // ignore
    }

    for (const w of controllerWires) {
      try {
        w.controllerRay.removeEventListener("selectstart", w.onSelectStart);
      } catch {
        // ignore
      }
    }
    controllerWires.length = 0;
  }

  return {
    getHoveredId: () => hoveredId,
    getLastVrHit,
    setHovered,
    updateVrHover,
    dispose,
  };
}
