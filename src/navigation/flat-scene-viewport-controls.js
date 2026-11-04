// SPDX-License-Identifier: Apache-2.0
import { createDomListenerRegistry } from "./dom-listener-registry.js";

const DEFAULT_DISTANCE = 22;
const DEFAULT_MIN_DISTANCE = 6;
const DEFAULT_MAX_DISTANCE = 120;
const DEFAULT_PITCH_RAD = -0.88;
const DEFAULT_YAW_RAD = 0;
const DEFAULT_PAN_FACTOR = 0.016;
const DEFAULT_WHEEL_ZOOM_FACTOR = 0.0012;
const DEFAULT_DRAG_ZOOM_FACTOR = 0.0036;
const DEFAULT_FLAT_PLANE = "xz";

/**
 * Create a shared flat-scene viewport controller for editor-like surfaces.
 * Purpose: provide the v3-style desktop/mobile scene contract for flat graph boards without tying apps to a DOM overlay or to walkabout mouse-look.
 * @param {object} [options={}] Controller dependencies.
 * @param {any} options.THREE Three.js namespace used for vector math.
 * @param {{ domElement?: EventTarget, xr?: { isPresenting?: boolean } }} options.renderer Renderer whose canvas receives pointer and wheel events.
 * @param {any} options.camera Camera used only for FOV/aspect when fitting bounds.
 * @param {{ player?: any }} options.rig Walkabout rig nodes bundle containing the world-space player root.
 * @param {{ setYaw?: Function, setPitch?: Function, applyLook?: Function }} options.look Shared look controller used to orient the camera toward the viewport target.
 * @param {object | null} [options.hudSystem=null] Optional HUD system used to block viewport input while the pointer is over HUD UI.
 * @param {(event: PointerEvent | WheelEvent) => boolean} [options.isBlocked] Optional guard for app-local drag modes or modal states.
 * @param {any} [options.initialTarget] Initial world-space target vector.
 * @param {number} [options.distance=22] Initial camera distance from the target.
 * @param {number} [options.minDistance=6] Minimum camera distance.
 * @param {number} [options.maxDistance=120] Maximum camera distance.
 * @param {number} [options.pitchRad=-0.88] Fixed viewport pitch in radians.
 * @param {number} [options.yawRad=0] Fixed viewport yaw in radians.
 * @param {"xy" | "xz" | string} [options.flatPlane="xz"] Flat board plane used when fitting flat-scene bounds.
 * @param {boolean} [options.lockViewAngles=false] Whether setViewAngles should keep the initial yaw/pitch locked.
 * @param {number} [options.panFactor=0.016] Screen-pixel-to-world pan scale factor, multiplied by current distance.
 * @param {number} [options.wheelZoomFactor=0.0012] Mouse-wheel zoom scalar.
 * @param {number} [options.dragZoomFactor=0.0036] Middle-button drag zoom scalar, expressed as an exponential per-pixel factor.
 * @param {number} [options.panButton=2] Mouse button index that activates drag-to-pan (0=left, 1=middle, 2=right).
 * @param {number} [options.zoomDragButton=1] Mouse button index that activates drag-to-zoom; set to a negative value to disable.
 * @param {() => void} [options.onInteraction] Optional callback invoked after user pan/zoom input mutates the viewport.
 * @returns {{ cloneTarget: () => any, setTarget: (nextTarget: any) => void, getTarget: () => any, setDistance: (nextDistance: number) => void, getDistance: () => number, setViewAngles: (nextYaw: number, nextPitch: number) => void, applyCameraTransform: () => void, fitBounds: (box: { getCenter?: Function, getSize?: Function, isEmpty?: Function } | null | undefined, options?: { padding?: number, minDistance?: number, maxDistance?: number }) => void, dispose: () => void }} Controller API for panning, zooming, fitting, and teardown.
 * Side effects: installs pointer, wheel, context-menu, and keyboard listeners on the renderer canvas/window, mutates rig and look state during viewport updates, and captures touch gestures for pan/pinch until disposed.
 */
export function createFlatSceneViewportControls({
  THREE,
  renderer,
  camera,
  rig,
  look,
  hudSystem = null,
  isBlocked = null,
  initialTarget = null,
  distance = DEFAULT_DISTANCE,
  minDistance = DEFAULT_MIN_DISTANCE,
  maxDistance = DEFAULT_MAX_DISTANCE,
  pitchRad = DEFAULT_PITCH_RAD,
  yawRad = DEFAULT_YAW_RAD,
  flatPlane = DEFAULT_FLAT_PLANE,
  lockViewAngles = false,
  panFactor = DEFAULT_PAN_FACTOR,
  wheelZoomFactor = DEFAULT_WHEEL_ZOOM_FACTOR,
  dragZoomFactor = DEFAULT_DRAG_ZOOM_FACTOR,
  panButton = 2,
  zoomDragButton = 1,
  onInteraction = null,
} = {}) {
  if (!THREE) throw new Error("createFlatSceneViewportControls: THREE is required");
  if (!renderer?.domElement) throw new Error("createFlatSceneViewportControls: renderer.domElement is required");
  if (!rig?.player?.position) throw new Error("createFlatSceneViewportControls: rig.player is required");
  if (typeof look?.setYaw !== "function" || typeof look?.setPitch !== "function" || typeof look?.applyLook !== "function") {
    throw new Error("createFlatSceneViewportControls: look controller with setYaw/setPitch/applyLook is required");
  }

  const dom = renderer.domElement;
  const target = initialTarget?.clone?.() ?? new THREE.Vector3(0, 0, 0);
  const panScratch = new THREE.Vector3();
  const rightScratch = new THREE.Vector3();
  const forwardScratch = new THREE.Vector3();
  const upScratch = new THREE.Vector3();
  const cameraQuatScratch = new THREE.Quaternion();
  const centerScratch = new THREE.Vector3();
  const sizeScratch = new THREE.Vector3();
  const listenerRegistry = createDomListenerRegistry(null);
  const resolvedFlatPlane = resolveFlatPlane(flatPlane);
  const fitHeightAxis = resolvedFlatPlane === "xy" ? "y" : "z";

  let currentDistance = clampDistance(distance, minDistance, maxDistance);
  let currentYaw = Number.isFinite(yawRad) ? Number(yawRad) : DEFAULT_YAW_RAD;
  let currentPitch = Number.isFinite(pitchRad) ? Number(pitchRad) : DEFAULT_PITCH_RAD;
  let activePointerId = null;
  let activePointerMode = null;
  let lastPointerPoint = { x: 0, y: 0 };
  let pinchState = null;
  // Single-finger touch pan uses deferred commit: we record a candidate on
  // touchstart but only begin panning on the first move IF the app has not
  // claimed the gesture (node drag / marquee) by then. This resolves the
  // listener-order race with app-level pointer handlers that are registered
  // after this controller, and keeps the controller inert in apps that block
  // single-finger touch (e.g. select-rectangle mode).
  let singleTouchPan = null;
  const touchPoints = new Map();

  function isInputBlocked(event) {
    if (renderer.xr?.isPresenting) return true;
    if (typeof isBlocked === "function" && isBlocked(event)) return true;
    if (hudSystem?.isClientPointOverUi?.(event?.clientX, event?.clientY)) return true;
    return false;
  }

  function updateLook() {
    look.setYaw(currentYaw);
    look.setPitch(currentPitch);
    look.applyLook();
  }

  function getScreenRightVector() {
    if (camera?.getWorldQuaternion) {
      camera.getWorldQuaternion(cameraQuatScratch);
      rightScratch.set(1, 0, 0).applyQuaternion(cameraQuatScratch);
      return rightScratch;
    }
    rightScratch.set(Math.cos(currentYaw), 0, Math.sin(currentYaw));
    return rightScratch;
  }

  function getScreenUpVector() {
    if (camera?.getWorldQuaternion) {
      camera.getWorldQuaternion(cameraQuatScratch);
      upScratch.set(0, 1, 0).applyQuaternion(cameraQuatScratch);
      return upScratch;
    }
    const sinPitch = Math.sin(currentPitch);
    const cosPitch = Math.cos(currentPitch);
    upScratch.set(-Math.sin(currentYaw) * sinPitch, cosPitch, Math.cos(currentYaw) * sinPitch);
    return upScratch;
  }

  function notifyInteraction() {
    onInteraction?.();
  }

  function applyCameraTransform() {
    const cosPitch = Math.cos(currentPitch);
    rig.player.position.set(
      target.x - Math.sin(currentYaw) * cosPitch * currentDistance,
      target.y + Math.sin(-currentPitch) * currentDistance,
      target.z + Math.cos(currentYaw) * cosPitch * currentDistance,
    );
    updateLook();
  }

  function getFlatRightVector() {
    rightScratch.set(Math.cos(currentYaw), 0, -Math.sin(currentYaw));
    return rightScratch;
  }

  function getFlatForwardVector() {
    forwardScratch.set(-Math.sin(currentYaw), 0, -Math.cos(currentYaw));
    return forwardScratch;
  }

  function panByScreenDelta(dx, dy) {
    const rect = typeof dom.getBoundingClientRect === "function"
      ? dom.getBoundingClientRect()
      : { width: dom.clientWidth || 1, height: dom.clientHeight || 1 };
    const viewWidthPx = Math.max(1, Number(rect.width) || 1);
    const viewHeightPx = Math.max(1, Number(rect.height) || 1);
    const vFov = Math.PI * (Number(camera?.fov ?? 60) / 180);
    const viewHeightWorld = 2 * Math.tan(vFov * 0.5) * currentDistance;
    const viewWidthWorld = viewHeightWorld * Number(camera?.aspect ?? (viewWidthPx / viewHeightPx));
    const worldDx = (Number(dx) / viewWidthPx) * viewWidthWorld;
    const worldDy = (Number(dy) / viewHeightPx) * viewHeightWorld;

    if (camera?.getWorldQuaternion) {
      panScratch.copy(getScreenRightVector()).multiplyScalar(-worldDx);
      panScratch.addScaledVector(getScreenUpVector(), worldDy);
    } else {
      const scale = currentDistance * panFactor;
      panScratch.copy(getFlatRightVector()).multiplyScalar(-dx * scale);
      panScratch.addScaledVector(getFlatForwardVector(), dy * scale);
    }

    target.add(panScratch);
    applyCameraTransform();
  }

  function anchorZoomToClientPoint(previousDistance, nextDistance, clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

    const rect = typeof dom.getBoundingClientRect === "function"
      ? dom.getBoundingClientRect()
      : { left: 0, top: 0, width: dom.clientWidth || 1, height: dom.clientHeight || 1 };
    const viewWidthPx = Math.max(1, Number(rect.width) || 1);
    const viewHeightPx = Math.max(1, Number(rect.height) || 1);
    const centerX = Number(rect.left ?? 0) + viewWidthPx * 0.5;
    const centerY = Number(rect.top ?? 0) + viewHeightPx * 0.5;
    const offsetX = Number(clientX) - centerX;
    const offsetY = Number(clientY) - centerY;
    if (Math.abs(offsetX) <= 1e-6 && Math.abs(offsetY) <= 1e-6) return;

    const vFov = Math.PI * (Number(camera?.fov ?? 60) / 180);
    const aspect = Number(camera?.aspect ?? (viewWidthPx / viewHeightPx));
    const beforeHeightWorld = 2 * Math.tan(vFov * 0.5) * previousDistance;
    const beforeWidthWorld = beforeHeightWorld * aspect;
    const afterHeightWorld = 2 * Math.tan(vFov * 0.5) * nextDistance;
    const afterWidthWorld = afterHeightWorld * aspect;

    const shiftRight = (offsetX / viewWidthPx) * (beforeWidthWorld - afterWidthWorld);
    const shiftUp = (offsetY / viewHeightPx) * (beforeHeightWorld - afterHeightWorld);
    if (Math.abs(shiftRight) <= 1e-6 && Math.abs(shiftUp) <= 1e-6) return;

    target.addScaledVector(getScreenRightVector(), shiftRight);
    target.addScaledVector(getScreenUpVector(), -shiftUp);
  }

  function setDistance(nextDistance, { clientX = Number.NaN, clientY = Number.NaN, anchorClientPoint = false } = {}) {
    const previousDistance = currentDistance;
    currentDistance = clampDistance(nextDistance, minDistance, maxDistance);
    if (anchorClientPoint && Math.abs(previousDistance - currentDistance) > 1e-6) {
      anchorZoomToClientPoint(previousDistance, currentDistance, clientX, clientY);
    }
    applyCameraTransform();
  }

  function onContextMenu(event) {
    if (renderer.xr?.isPresenting) return;
    event.preventDefault();
  }

  function onPointerDown(event) {
    if (renderer.xr?.isPresenting) return;

    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size === 2) {
        singleTouchPan = null;
        const [a, b] = [...touchPoints.values()];
        pinchState = {
          startDistance: Math.hypot(b.x - a.x, b.y - a.y),
          startZoom: currentDistance,
          startCenter: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
        };
      } else if (touchPoints.size === 1) {
        singleTouchPan = {
          pointerId: event.pointerId,
          lastX: event.clientX,
          lastY: event.clientY,
          committed: false,
        };
      }
      return;
    }

    if (event.button !== panButton && event.button !== zoomDragButton) return;
    if (isInputBlocked(event)) return;

    activePointerId = event.pointerId;
    activePointerMode = event.button === zoomDragButton ? "zoom" : "pan";
    lastPointerPoint = { x: event.clientX, y: event.clientY };
    try {
      dom.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (renderer.xr?.isPresenting) return;

    if (event.pointerType === "touch") {
      if (touchPoints.has(event.pointerId)) {
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pinchState && touchPoints.size === 2) {
        const [a, b] = [...touchPoints.values()];
        const previousDistance = currentDistance;
        const nextDistancePx = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const scale = nextDistancePx / Math.max(1, pinchState.startDistance);
        currentDistance = clampDistance(pinchState.startZoom / scale, minDistance, maxDistance);

        const nextCenter = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
        const panDx = nextCenter.x - pinchState.startCenter.x;
        const panDy = nextCenter.y - pinchState.startCenter.y;
        panByScreenDelta(panDx, panDy);
        pinchState.startCenter = nextCenter;
        applyCameraTransform();
        if (Math.abs(previousDistance - currentDistance) > 1e-6 || Math.abs(panDx) > 1e-6 || Math.abs(panDy) > 1e-6) {
          notifyInteraction();
        }
      }
      // Single-finger pan (deferred commit). Only pans if the app has not
      // claimed this gesture (node drag / marquee) by the first move.
      if (singleTouchPan && touchPoints.size === 1 && event.pointerId === singleTouchPan.pointerId) {
        if (!singleTouchPan.committed) {
          if (isInputBlocked(event)) {
            singleTouchPan = null;
            return;
          }
          singleTouchPan.committed = true;
        }
        const dx = event.clientX - singleTouchPan.lastX;
        const dy = event.clientY - singleTouchPan.lastY;
        singleTouchPan.lastX = event.clientX;
        singleTouchPan.lastY = event.clientY;
        if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
          panByScreenDelta(dx, dy);
          notifyInteraction();
        }
      }
      return;
    }

    if (activePointerId == null || event.pointerId !== activePointerId) return;
    const dx = event.clientX - lastPointerPoint.x;
    const dy = event.clientY - lastPointerPoint.y;
    lastPointerPoint = { x: event.clientX, y: event.clientY };

    if (activePointerMode === "zoom") {
      if (Math.abs(dy) <= 1e-6) return;
      currentDistance = clampDistance(
        currentDistance * Math.exp(dy * dragZoomFactor),
        minDistance,
        maxDistance,
      );
      applyCameraTransform();
      notifyInteraction();
      event.preventDefault();
      return;
    }

    if (Math.abs(dx) <= 1e-6 && Math.abs(dy) <= 1e-6) return;
    panByScreenDelta(dx, dy);
    notifyInteraction();
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      if (singleTouchPan && event.pointerId === singleTouchPan.pointerId) {
        singleTouchPan = null;
      }
      if (touchPoints.size < 2) {
        pinchState = null;
      }
      // Re-arm single-finger pan for the remaining finger when dropping from a
      // pinch (2 -> 1) so the surviving finger keeps panning without a jump.
      if (touchPoints.size === 1) {
        const [[pointerId, point]] = [...touchPoints.entries()];
        singleTouchPan = {
          pointerId,
          lastX: point.x,
          lastY: point.y,
          committed: true,
        };
      }
      return;
    }

    if (activePointerId == null || event.pointerId !== activePointerId) return;
    activePointerId = null;
    activePointerMode = null;
    try {
      dom.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  }

  function onWheel(event) {
    if (renderer.xr?.isPresenting) return;
    if (isInputBlocked(event)) return;
    setDistance(
      currentDistance * (1 + event.deltaY * wheelZoomFactor),
      {
        clientX: Number(event.clientX),
        clientY: Number(event.clientY),
        anchorClientPoint: true,
      },
    );
    notifyInteraction();
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (renderer.xr?.isPresenting) return;
    if (String(event.key).toLowerCase() !== "f") return;
    applyCameraTransform();
  }

  function setTarget(nextTarget) {
    if (!nextTarget) return;
    target.copy(nextTarget);
    applyCameraTransform();
  }

  function fitBounds(box, { padding = 1.24, minDistance: fitMin = minDistance, maxDistance: fitMax = maxDistance } = {}) {
    if (!box?.getCenter || !box?.getSize || box?.isEmpty?.()) return;
    box.getCenter(centerScratch);
    box.getSize(sizeScratch);

    const vFov = Math.PI * (Number(camera?.fov ?? 60) / 180);
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * Number(camera?.aspect ?? 1));
    const footprintW = Math.max(1, sizeScratch.x * padding);
    const footprintH = Math.max(1, Number(sizeScratch?.[fitHeightAxis] ?? sizeScratch.z ?? 1) * padding);
    const fitH = (footprintW * 0.5) / Math.tan(hFov * 0.5);
    const fitV = (footprintH * 0.5) / Math.tan(vFov * 0.5);

    target.copy(centerScratch);
    if (resolvedFlatPlane === "xz") {
      target.y = Math.max(target.y, 0);
    }
    currentDistance = clampDistance(Math.max(fitH, fitV, fitMin), fitMin, fitMax);
    applyCameraTransform();
  }

  function setViewAngles(nextYaw, nextPitch) {
    if (lockViewAngles) {
      applyCameraTransform();
      return;
    }
    currentYaw = Number.isFinite(nextYaw) ? Number(nextYaw) : currentYaw;
    currentPitch = Number.isFinite(nextPitch) ? Number(nextPitch) : currentPitch;
    applyCameraTransform();
  }

  listenerRegistry.listen(dom, "contextmenu", onContextMenu);
  listenerRegistry.listen(dom, "pointerdown", onPointerDown);
  listenerRegistry.listen(window, "pointermove", onPointerMove);
  listenerRegistry.listen(window, "pointerup", onPointerUp);
  listenerRegistry.listen(window, "pointercancel", onPointerUp);
  listenerRegistry.listen(dom, "wheel", onWheel, { passive: false });
  listenerRegistry.listen(window, "keydown", onKeyDown);

  applyCameraTransform();

  return {
    cloneTarget: () => target.clone(),
    setTarget,
    getTarget: () => target,
    setDistance,
    getDistance: () => currentDistance,
    setViewAngles,
    applyCameraTransform,
    fitBounds,
    dispose() {
      activePointerId = null;
      activePointerMode = null;
      pinchState = null;
      singleTouchPan = null;
      touchPoints.clear();
      listenerRegistry.clear();
    },
  };
}

function resolveFlatPlane(flatPlane) {
  return String(flatPlane ?? DEFAULT_FLAT_PLANE).trim().toLowerCase() === "xy" ? "xy" : DEFAULT_FLAT_PLANE;
}

function clampDistance(value, minDistance, maxDistance) {
  const nextValue = Number.isFinite(value) ? Number(value) : DEFAULT_DISTANCE;
  return Math.max(Number(minDistance), Math.min(Number(maxDistance), nextValue));
}
