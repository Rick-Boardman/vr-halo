// SPDX-License-Identifier: Apache-2.0
// Constrained desktop-only "iso/plan" navigation.
// - No DOM overlays; integrates with the runtime HUD namespace like walkabout navigation.
// - Intentionally minimal: WASD pans on XZ, wheel zooms, Q/E rotate yaw.

import { clamp } from "./scalar-math.js";

/**
 * Purpose: Create the shared desktop-only isometric navigation controller used by tile and plan-view scenes.
 * @param {object} [options={}] Navigation wiring options.
 * @param {{ Vector3: new (...args: number[]) => { set: Function, applyAxisAngle: Function, add: Function, addScaledVector: Function, lengthSq: Function, normalize: Function, multiplyScalar: Function } }} options.THREE Three.js namespace used to allocate working vectors.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to suppress desktop controls during XR presentation.
 * @param {{ position: { copy: (value: unknown) => unknown, multiplyScalar: (value: number) => unknown } }} options.camera Camera repositioned into the isometric offset each update.
 * @param {{ position: { add: (delta: unknown) => unknown } }} options.player Player or rig root translated during desktop panning.
 * @param {{ isClientPointOverUi?: (clientX: number, clientY: number) => boolean }} [options.hudSystem] Optional HUD system used to block wheel zoom while hovering UI.
 * @param {() => boolean} [options.isEnabled] Optional predicate that controls whether iso navigation reacts to input.
 * @param {{ setYaw?: (yaw: number) => void, setPitch?: (pitch: number) => void, applyLook?: () => void }} [options.look] Existing look controller used when setLook is not supplied.
 * @param {(next: { yaw?: number, pitch?: number }) => void} [options.setLook] Optional setter that applies yaw and pitch changes to the scene look controller.
 * @param {number} [options.basePanSpeed=7.5] Base translation speed in world units per second before zoom scaling.
 * @param {number} [options.zoomSpeed=1.15] Multiplicative zoom step applied per wheel tick.
 * @param {number} [options.fixedPitch=-0.9] Fixed pitch angle in radians maintained by the iso camera.
 * @param {number} [options.initialYaw=Math.PI / 4] Initial yaw angle in radians for the isometric view.
 * @param {number} [options.rotateStep=Math.PI / 2] Discrete yaw increment in radians applied for Q/E rotation input.
 * @returns {{ update: (dt: number) => void, dispose: () => void }} Controller with per-frame update and listener cleanup methods.
 * Side effects: installs window keyboard and wheel listeners, mutates camera position and player position during update, and mutates look state through setLook/look hooks.
 */
export function createIsoNavigation({
  THREE,
  renderer,
  camera,
  player,
  hudSystem,
  isEnabled,
  look,
  setLook,
  basePanSpeed = 7.5,
  zoomSpeed = 1.15,
  fixedPitch = -0.9,
  initialYaw = Math.PI / 4,
  rotateStep = Math.PI / 2,
} = {}) {
  if (!THREE) throw new Error("createIsoNavigation: THREE is required");
  if (!renderer) throw new Error("createIsoNavigation: renderer is required");
  if (!camera) throw new Error("createIsoNavigation: camera is required");
  if (!player) throw new Error("createIsoNavigation: player is required");

  const _isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
  const _setLook =
    typeof setLook === "function"
      ? setLook
      : ({ yaw, pitch } = {}) => {
          if (!look) return;
          if (typeof yaw === "number" && typeof look.setYaw === "function") {
            look.setYaw(yaw);
          }
          if (typeof pitch === "number" && typeof look.setPitch === "function") {
            look.setPitch(pitch);
          }
          if (typeof look.applyLook === "function") {
            look.applyLook();
          }
        };

  const keysDown = new Set();

  let yaw = initialYaw;
  let zoom = 1;

  // Camera offset from the player in local space.  Y = height above the player,
  // Z = distance behind.  Multiplied by zoom each frame to keep the isometric
  // field-of-view responsive to scroll input.
  const ISO_CAMERA_HEIGHT = 8;
  const ISO_CAMERA_DISTANCE = 12;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;

  const baseLocalPos = new THREE.Vector3(0, ISO_CAMERA_HEIGHT, ISO_CAMERA_DISTANCE);

  function isClientPointOverUi(clientX, clientY) {
    if (hudSystem && typeof hudSystem.isClientPointOverUi === "function") {
      return !!hudSystem.isClientPointOverUi(clientX, clientY);
    }
    return false;
  }

  function setKey(e, down) {
    const k = e.key;
    const key = k.length === 1 ? k.toUpperCase() : k;
    if (down) keysDown.add(key);
    else keysDown.delete(key);
  }

  function onKeyDown(e) {
    if (renderer.xr.isPresenting) return;
    if (!_isEnabled()) return;
    setKey(e, true);

    const up = e.key.toUpperCase();
    if (up === "Q" && !e.repeat) {
      yaw += rotateStep;
      _setLook({ yaw, pitch: fixedPitch });
      e.preventDefault();
    }
    if (up === "E" && !e.repeat) {
      yaw -= rotateStep;
      _setLook({ yaw, pitch: fixedPitch });
      e.preventDefault();
    }

    if ("WASD".includes(up)) e.preventDefault();
  }

  function onKeyUp(e) {
    if (renderer.xr.isPresenting) return;
    setKey(e, false);
  }

  function onWheel(e) {
    if (renderer.xr.isPresenting) return;
    if (!_isEnabled()) return;
    if (isClientPointOverUi(e.clientX, e.clientY)) return;

    const dy = e.deltaY;
    const dir = dy > 0 ? 1 : -1;
    zoom *= dir > 0 ? zoomSpeed : 1 / zoomSpeed;
    zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    e.preventDefault();
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("wheel", onWheel, { passive: false });

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _delta = new THREE.Vector3();

  function update(dt) {
    if (renderer.xr.isPresenting) return;
    if (!_isEnabled()) return;

    _setLook({ yaw, pitch: fixedPitch });

    // Apply zoom by moving the camera relative to player.
    camera.position.copy(baseLocalPos).multiplyScalar(zoom);

    // Pan (XZ)
    const w = keysDown.has("W");
    const a = keysDown.has("A");
    const s = keysDown.has("S");
    const d = keysDown.has("D");

    if (!(w || a || s || d)) return;

    _fwd.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    _right.set(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    _delta.set(0, 0, 0);
    if (w) _delta.add(_fwd);
    if (s) _delta.addScaledVector(_fwd, -1);
    if (d) _delta.add(_right);
    if (a) _delta.addScaledVector(_right, -1);

    if (_delta.lengthSq() > 1e-6) {
      _delta.normalize().multiplyScalar(basePanSpeed * dt * zoom);
      player.position.add(_delta);
    }
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("wheel", onWheel);
  }

  return { update, dispose };
}
