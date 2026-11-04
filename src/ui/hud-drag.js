// SPDX-License-Identifier: Apache-2.0
import {
  calculateHudHalfExtentsInNdc,
  setCameraLocalHudPosition,
} from "./screen-space.js";
import { clamp } from "../scalar-math.js";

/**
 * Install shared pointer-driven drag behavior on a camera-anchored HUD overlay object.
 * Purpose: keep a runtime HUD object draggable in normalized device coordinates while clamping the dragged surface to the visible camera plane and optionally reporting world-space drag updates.
 * @param {any} object3d Runtime UI object that exposes addEventListener and stores HUD drag state, typically through `hudScreenX` and `hudScreenY` properties.
 * @param {object} [options={}] Drag configuration.
 * @param {number} [options.width=0] Fallback HUD width used when a dynamic width callback is not supplied.
 * @param {number} [options.height=0] Fallback HUD height used when a dynamic height callback is not supplied.
 * @param {number} [options.distance=1.2] Camera-local placement distance used when translating normalized device coordinates back into HUD world space.
 * @param {() => any} [options.getCamera] Callback that returns the active perspective camera for drag projection and clamping.
 * @param {() => {x: number, y: number}} [options.getNDC] Callback that returns the current normalized device coordinate anchor for the draggable overlay.
 * @param {(ndc: {x: number, y: number}) => void} [options.setNDC] Callback that persists the normalized device coordinate anchor after projection or drag updates.
 * @param {() => any} [options.getPositionTarget] Callback that returns the object whose world position should be projected and moved during dragging.
 * @param {() => number} [options.getWidth] Callback that returns the current HUD width for visible-plane clamping.
 * @param {() => number} [options.getHeight] Callback that returns the current HUD height for visible-plane clamping.
 * @param {(position: {x: number, y: number, z: number}) => void} [options.onDrag] Optional callback invoked after each drag update with the target world position.
 * @returns {void} Does not return a value; installs pointer event listeners on the target object and window.
 * Side effects: attaches a pointerdown listener to `object3d`, temporarily registers pointermove and pointerup listeners on `window` while dragging, updates HUD normalized coordinates and camera-local position through the supplied callbacks, and may call `onDrag` with world-space coordinates.
 */
export function makeDraggableHUDOverlay(object3d, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const distance = Number.isFinite(options.distance)
    ? Number(options.distance)
    : 1.2;
  const getCamera = options.getCamera;
  const getNdc =
    options.getNDC ||
    (() => ({
      x: object3d.hudScreenX ?? 0,
      y: object3d.hudScreenY ?? 0,
    }));
  const setNdc =
    options.setNDC ||
    ((ndc) => {
      object3d.hudScreenX = ndc.x;
      object3d.hudScreenY = ndc.y;
    });
  const getPositionTarget = options.getPositionTarget || (() => object3d);
  const getWidth = options.getWidth || (() => width);
  const getHeight = options.getHeight || (() => height);
  const onDrag = options.onDrag;

  let dragState = null;

  function resolvePositionTarget() {
    return getPositionTarget?.() || object3d;
  }

  function getWorldPosition(camera) {
    const position = camera.position.clone();
    return resolvePositionTarget().getWorldPosition(position);
  }

  function syncNdcFromWorldPosition(camera) {
    const projected = getWorldPosition(camera).project(camera);
    setNdc({ x: projected.x, y: projected.y });
  }

  function applyDragPosition(camera, screenX, screenY) {
    const positionTarget = resolvePositionTarget();
    setNdc({ x: screenX, y: screenY });
    setCameraLocalHudPosition(
      positionTarget,
      camera,
      screenX,
      screenY,
      distance
    );

    if (typeof onDrag === "function") {
      const worldPosition = getWorldPosition(camera);
      onDrag({
        x: worldPosition.x,
        y: worldPosition.y,
        z: worldPosition.z,
      });
    }
  }

  function handlePointerMove(event) {
    if (!dragState || event.isXRController) return;

    const camera = getCamera?.();
    if (!camera?.isPerspectiveCamera) return;

    const nextOverlayScreen = {
      x: event.clientX - dragState.dragOffsetPx.x,
      y: event.clientY - dragState.dragOffsetPx.y,
    };

    let screenX = (nextOverlayScreen.x / window.innerWidth - 0.5) * 2;
    let screenY = (0.5 - nextOverlayScreen.y / window.innerHeight) * 2;

    const positionTarget = resolvePositionTarget();
    const currentWidth = Number(getWidth?.()) || width;
    const currentHeight = Number(getHeight?.()) || height;

    const halfExtents = calculateHudHalfExtentsInNdc(
      camera,
      currentWidth,
      currentHeight,
      distance,
      positionTarget.scale.x,
      positionTarget.scale.y
    );

    screenX = clamp(screenX, -1 + halfExtents.x, 1 - halfExtents.x);
    screenY = clamp(screenY, -1 + halfExtents.y, 1 - halfExtents.y);

    applyDragPosition(camera, screenX, screenY);
  }

  function handlePointerUp(event) {
    if (event.isXRController) return;

    const camera = getCamera?.();
    if (camera?.isPerspectiveCamera) {
      syncNdcFromWorldPosition(camera);
    }

    dragState = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }

  function handlePointerDown(event) {
    const camera = getCamera?.();
    if (!camera?.isPerspectiveCamera) return;

    event.stopPropagation?.();

    // WebXR HUD dragging is handled by the active input router, which owns
    // controller pose state and dispatches synthetic pointer move events.
    if (event.isXRController) {
      return;
    }

    let ndc = getNdc();
    if (!Number.isFinite(ndc?.x) || !Number.isFinite(ndc?.y)) {
      const projected = getWorldPosition(camera).project(camera);
      ndc = { x: projected.x, y: projected.y };
      setNdc(ndc);
    }

    const overlayScreen = {
      x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (0.5 - ndc.y * 0.5) * window.innerHeight,
    };

    dragState = {
      dragOffsetPx: {
        x: event.clientX - overlayScreen.x,
        y: event.clientY - overlayScreen.y,
      },
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  object3d.addEventListener?.("pointerdown", handlePointerDown);
}
