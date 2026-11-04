// SPDX-License-Identifier: Apache-2.0
const DEFAULT_CAMERA_TARGET_Y = 1.6;
const DEFAULT_CAMERA_DISTANCE = 3;
const MIN_CAMERA_DISTANCE = 0.5;
const MAX_CAMERA_DISTANCE = 20;
// Pitch is clamped to just under ±90° (π/2 radians). The 0.05 rad (~2.9°)
// margin prevents the camera from reaching the geometric pole where the
// up-vector flips and the orbit view matrix degenerates.
const PITCH_LIMIT_RADIANS = Math.PI / 2 - 0.05;
const ORBIT_ROTATION_STEP = 0.005;
const PAN_DISTANCE_FACTOR = 0.002;
const ZOOM_DISTANCE_FACTOR = 0.2;

import { createDomListenerRegistry } from "./dom-listener-registry.js";

/**
 * Create desktop orbit-camera controls for shared HUD and inspection surfaces.
 * Purpose: provide a reusable desktop camera controller that supports orbiting, panning, zooming, and reset behavior around a mutable world-space target without tying app harnesses to a specific scene implementation.
 * @param {object} [options={}] Orbit control configuration.
 * @param {any} options.THREE Three.js namespace that must expose Vector3 and quaternion-aware camera primitives.
 * @param {any} [options.camera] Scene camera to reposition and orient around the current orbit target.
 * @param {HTMLCanvasElement | null} [options.canvas] Canvas element that receives mouse and wheel listeners for orbit interaction.
 * @param {() => boolean} [options.isBlocked] Optional guard that prevents a new orbit interaction while another input path owns the pointer.
 * @returns {DesktopOrbitCameraControls} Orbit controller instance exposing target mutation, camera transform application, reset, and disposal methods.
 * Side effects: allocates controller state, binds DOM listeners through the shared listener registry when a canvas is supplied, mutates the camera transform during orbit updates, and installs temporary window drag listeners while pointer drags are active.
 */
export function createDesktopOrbitCameraControls({
  THREE,
  camera,
  canvas,
  isBlocked,
} = {}) {
  return new DesktopOrbitCameraControls({
    THREE,
    camera,
    canvas,
    isBlocked,
  });
}

class DesktopOrbitCameraControls {
  constructor({ THREE, camera, canvas, isBlocked }) {
    if (!THREE) {
      throw new Error("createDesktopOrbitCameraControls: THREE is required");
    }

    this._THREE = THREE;
    this.camera = camera ?? null;
    this.canvas = canvas ?? null;
    this._isBlocked = typeof isBlocked === "function" ? isBlocked : () => false;
    this._isOrbiting = false;
    this._isPanning = false;
    this._lastMouse = { x: 0, y: 0 };
    this._yaw = 0;
    this._pitch = 0;
    this._distance = DEFAULT_CAMERA_DISTANCE;
    this._minDistance = MIN_CAMERA_DISTANCE;
    this._maxDistance = MAX_CAMERA_DISTANCE;
    this._pitchLimit = PITCH_LIMIT_RADIANS;
    this.target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
    this._initialState = {
      target: this.target.clone(),
      distance: this._distance,
      yaw: this._yaw,
      pitch: this._pitch,
    };
    this._domListeners = createDomListenerRegistry(this);
    this._stopPointerDragListeners = () => {};
    this._activePointerId = null;
    this._pointers = new Map();
    this._isPinching = false;
    this._pinchStartDist = 0;
    this._pinchStartDistance = 0;

    if (this.canvas) {
      this._domListeners.listen(this.canvas, "pointerdown", "_onPointerDown");
      this._domListeners.listen(this.canvas, "wheel", "_onWheel", {
        passive: false,
      });
      this._domListeners.listen(window, "keydown", "_onKeyDown");
    }
  }

  cloneTarget() {
    return this.target.clone();
  }

  setTarget(nextTarget) {
    this.target.copy(nextTarget);
  }

  applyCameraTransform() {
    if (!this.camera || this.camera.parent?.type !== "Scene") {
      return;
    }

    // Spherical orbit placement: x = tx + r*sin(yaw)*cos(pitch),
    // y = ty + r*sin(pitch), z = tz + r*cos(yaw)*cos(pitch). This repo uses
    // Y-up with yaw=0 facing +Z in orbit space, so yaw sweeps around the target
    // on the horizontal plane while pitch lifts the camera above or below it.
    const x =
      this.target.x +
      this._distance * Math.sin(this._yaw) * Math.cos(this._pitch);
    const y = this.target.y + this._distance * Math.sin(this._pitch);
    const z =
      this.target.z +
      this._distance * Math.cos(this._yaw) * Math.cos(this._pitch);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  _onPointerDown(event) {
    if (this._isBlocked()) {
      return;
    }

    // Track all touch pointers for pinch-to-zoom.
    if (event.pointerType === "touch") {
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._pointers.size === 2) {
        // Cancel any active orbit/pan and switch to pinch.
        this._isOrbiting = false;
        this._isPanning = false;
        this._isPinching = true;
        const pts = [...this._pointers.values()];
        this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        this._pinchStartDistance = this._distance;
        event.preventDefault();
        return;
      }
    }

    if (this._activePointerId != null) return;

    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      this._isOrbiting = true;
      this._isPanning = false;
    } else if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
      this._isPanning = true;
      this._isOrbiting = false;
    } else {
      return;
    }

    this._activePointerId = event.pointerId;
    this._lastMouse.x = event.clientX;
    this._lastMouse.y = event.clientY;
    this._stopPointerDragListeners();
    const stopPointerMove = this._domListeners.listen(
      window,
      "pointermove",
      "_onPointerMove"
    );
    const stopPointerUp = this._domListeners.listen(window, "pointerup", "_onPointerUp");
    const stopPointerCancel = this._domListeners.listen(window, "pointercancel", "_onPointerUp");
    this._stopPointerDragListeners = () => {
      stopPointerMove();
      stopPointerUp();
      stopPointerCancel();
      this._stopPointerDragListeners = () => {};
    };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // no-op
    }
    event.preventDefault();
  }

  _onPointerMove(event) {
    // Pinch-to-zoom: adjust orbit distance.
    if (this._isPinching) {
      if (this._pointers.has(event.pointerId)) {
        this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (this._pointers.size === 2 && this._pinchStartDist > 0) {
        const pts = [...this._pointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const scale = dist / this._pinchStartDist;
        this._distance = Math.max(
          this._minDistance,
          Math.min(this._maxDistance, this._pinchStartDistance / scale)
        );
      }
      return;
    }

    if (this._activePointerId != null && event.pointerId !== this._activePointerId) return;
    const dx = event.clientX - this._lastMouse.x;
    const dy = event.clientY - this._lastMouse.y;
    this._lastMouse.x = event.clientX;
    this._lastMouse.y = event.clientY;

    if (this._isOrbiting) {
      this._yaw -= dx * ORBIT_ROTATION_STEP;
      this._pitch -= dy * ORBIT_ROTATION_STEP;
      this._pitch = Math.max(
        -this._pitchLimit,
        Math.min(this._pitchLimit, this._pitch)
      );
      return;
    }

    if (!this._isPanning || !this.camera) {
      return;
    }

    const panSpeed = this._distance * PAN_DISTANCE_FACTOR;
    const pan = new this._THREE.Vector3(-dx * panSpeed, dy * panSpeed, 0);
    pan.applyQuaternion(this.camera.quaternion);
    this.target.add(pan);
  }

  _onPointerUp(event) {
    // Clean up pinch tracking.
    this._pointers.delete(event.pointerId);
    if (this._isPinching) {
      if (this._pointers.size < 2) {
        this._isPinching = false;
        this._pinchStartDist = 0;
        this._pointers.clear();
      }
      return;
    }

    if (this._activePointerId != null && event.pointerId !== this._activePointerId) return;
    this._isOrbiting = false;
    this._isPanning = false;
    this._activePointerId = null;
    this._stopPointerDragListeners();
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  }

  _onWheel(event) {
    if (event.ctrlKey) {
      return;
    }

    const delta = event.deltaY > 0 ? 1 : -1;
    this._distance += delta * ZOOM_DISTANCE_FACTOR * this._distance;
    this._distance = Math.max(
      this._minDistance,
      Math.min(this._maxDistance, this._distance)
    );
    event.preventDefault();
  }

  _onKeyDown(event) {
    if (event.key === "r" || event.key === "R") {
      this.reset();
    }
  }

  reset() {
    this.target.copy(this._initialState.target);
    this._distance = this._initialState.distance;
    this._yaw = this._initialState.yaw;
    this._pitch = this._initialState.pitch;
  }

  dispose() {
    this._onPointerUp({ pointerId: this._activePointerId });
    this._domListeners.clear();
  }
}
