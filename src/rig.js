// SPDX-License-Identifier: Apache-2.0
// Shared scene rig helper.
//
// Goals:
// - Provide a standard player hierarchy used across Nexus runtime apps:
//   player (pos) -> playerYaw (yaw) -> playerPitch (pitch) -> head -> camera
// - Keep VR rotation stable by rotating around the HMD pivot.
// - Avoid per-frame allocations.

import { clamp } from "./scalar-math.js";

/**
 * Purpose: Defines the default pitch-clamp epsilon that keeps scene look controls just inside the vertical singularity when pitch clamping is enabled.
 * Parameters: none.
 * Return value: Angle in radians subtracted from ±$\pi / 2$ when pitchMode is "clamp".
 * Side effects: none.
 * @type {number}
 */
export const DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD = 0.02;

/**
 * Purpose: Create the canonical scene player rig and quaternion-first look controller used by shared Nexus runtime entrypoints.
 * @param {object} [options={}] Rig construction options.
 * @param {{ PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => unknown, Group: new () => { add: (...objects: unknown[]) => void, position: { copy: (value: unknown) => void, add: (value: unknown) => void, set: (x: number, y: number, z: number) => void }, quaternion: { copy: (value: unknown) => void }, rotation: { set: (x: number, y: number, z: number) => void }, updateMatrixWorld?: (force?: boolean) => void }, Vector3: new (x?: number, y?: number, z?: number) => { copy: (value: unknown) => unknown, add: (value: unknown) => unknown, addScaledVector?: (value: unknown, scale: number) => unknown, multiplyScalar: (value: number) => unknown, applyQuaternion?: (quaternion: unknown) => unknown, normalize?: () => unknown, set: (x: number, y: number, z: number) => unknown, subVectors: (a: unknown, b: unknown) => unknown }, Quaternion: new () => { setFromEuler: (euler: unknown) => unknown, normalize: () => unknown, copy: (value: unknown) => unknown, premultiply: (value: unknown) => unknown, clone: () => unknown }, Euler: new (x?: number, y?: number, z?: number, order?: string) => { set: (x: number, y: number, z: number) => unknown, setFromQuaternion: (quaternion: unknown, order?: string) => unknown, x: number, y: number, z: number }, Math?: unknown }} options.THREE Three.js namespace used to allocate the rig hierarchy, camera, vectors, quaternions, and Euler helpers.
 * @param {{ xr?: { isPresenting?: boolean, getCamera?: (camera: unknown) => unknown } }} options.renderer Renderer used to detect XR state and query the XR camera for headset-pivot compensation.
 * @param {{ add?: (object: unknown) => void }} [options.scene] Optional scene that receives the rig root when addToScene is true.
 * @param {unknown} [options.camera] Optional prebuilt camera attached to the head node instead of constructing a PerspectiveCamera.
 * @param {number} [options.fov=70] Field of view used when constructing a fallback PerspectiveCamera.
 * @param {number} [options.near=0.05] Near clip plane used when constructing a fallback PerspectiveCamera.
 * @param {number} [options.far=200] Far clip plane used when constructing a fallback PerspectiveCamera.
 * @param {number | null} [options.aspect=null] Aspect ratio used when constructing a fallback PerspectiveCamera.
 * @param {unknown} [options.desktopStartPos] Optional starting position for the rig root; defaults to `(0, 1.6, 4)` when omitted.
 * @param {number} [options.initialYaw=0] Initial yaw angle in radians.
 * @param {number} [options.initialPitch=0] Initial pitch angle in radians.
 * @param {"wrap" | "clamp"} [options.pitchMode="wrap"] Pitch handling mode for applyLook.
 * @param {number} [options.pitchClampEps=DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD] Epsilon in radians subtracted from vertical pitch limits when clamp mode is enabled.
 * @param {boolean} [options.vrPivotCompensation=true] Whether VR look application should translate the rig so the headset pivot stays fixed during rotation.
 * @param {boolean} [options.addToScene=true] Whether the created rig root should be added to the supplied scene automatically.
 * @returns {{ camera: unknown, desktopStartPos: unknown, rig: { player: unknown, playerYaw: unknown, playerPitch: unknown, playerRoll: unknown, head: unknown }, look: { state: { yaw: number, pitch: number, roll: number, q: unknown }, getYaw: () => number, setYaw: (value: number) => void, getPitch: () => number, setPitch: (value: number) => void, getRoll: () => number, setRoll: (value: number) => void, getQuaternion: (out?: unknown) => unknown, setQuaternion: (q: unknown) => void, rotateYaw: (deltaRad: number) => void, rotatePitch: (deltaRad: number) => void, rotateRoll: (deltaRad: number) => void, applyLook: () => void } }} Canonical rig hierarchy plus quaternion-first look API used by navigation and HUD bootstrap code.
 * Side effects: may construct a camera, creates and links rig nodes, may add the rig to the supplied scene, mutates rig transforms during look updates, and queries XR camera state when VR pivot compensation is enabled.
 */
export function createSceneRig({
  THREE,
  renderer,
  scene,
  camera,

  // Camera defaults if camera is not provided.
  fov = 70,
  near = 0.05,
  far = 200,
  aspect = null,

  // Rig defaults
  desktopStartPos,
  initialYaw = 0,
  initialPitch = 0,

  // 'wrap' | 'clamp'
  pitchMode = "wrap",
  pitchClampEps = DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD,

  // In VR, applyLook() normally keeps the headset pivot fixed by translating the rig
  // while yaw/pitch change. This prevents head drift, but it also means the rig origin
  // moves along a small arc during rotation.
  // Some scenes (e.g. graph entrypoints) prefer pure rotation with no translation.
  vrPivotCompensation = true,

  addToScene = true,
} = {}) {
  if (!THREE) throw new Error("createSceneRig: THREE is required");
  if (!renderer) throw new Error("createSceneRig: renderer is required");

  const cam =
    camera ||
    new THREE.PerspectiveCamera(
      Number(fov) || 70,
      Number.isFinite(aspect) ? aspect : (window.innerWidth / window.innerHeight),
      Number(near) || 0.05,
      Number(far) || 200
    );

  const player = new THREE.Group();
  const playerYaw = new THREE.Group();
  const playerPitch = new THREE.Group();
  const playerRoll = new THREE.Group();
  const head = new THREE.Group();

  const startPos =
    desktopStartPos && desktopStartPos.isVector3
      ? desktopStartPos
      : new THREE.Vector3(0, 1.6, 4);

  player.position.copy(startPos);
  player.add(playerYaw);
  playerYaw.add(playerPitch);
  playerPitch.add(playerRoll);
  playerRoll.add(head);
  head.add(cam);

  if (addToScene && scene) {
    scene.add(player);
  }

  const state = {
    // Debug/telemetry values (derived from q; not authoritative for controls).
    yaw: Number(initialYaw) || 0,
    pitch: Number(initialPitch) || 0,
    roll: 0,

    // Authoritative orientation.
    q: new THREE.Quaternion(),
  };

  // YXZ Euler order: Y = yaw (horizontal turn), X = pitch (vertical tilt),
  // Z = roll. This decomposition matches the FPS camera convention where yaw
  // rotates around the world-up axis first, keeping pitch clamping simple and
  // avoiding gimbal lock at ±90° vertical look.
  const _eulerYXZ = new THREE.Euler(0, 0, 0, "YXZ");
  const _axisUp = new THREE.Vector3(0, 1, 0);
  const _axisRight = new THREE.Vector3(1, 0, 0);
  const _axisForward = new THREE.Vector3(0, 0, -1);
  const _axisWorld = new THREE.Vector3();
  const _qDelta = new THREE.Quaternion();

  // Seed the authoritative quaternion from the provided initial yaw/pitch.
  _eulerYXZ.set(state.pitch, state.yaw, state.roll);
  state.q.setFromEuler(_eulerYXZ).normalize();

  function syncStateFromQuaternion() {
    _eulerYXZ.setFromQuaternion(state.q, "YXZ");
    // Euler gives a canonical representation; keep yaw continuous by not wrapping the stored value here.
    state.pitch = Number(_eulerYXZ.x) || 0;
    state.yaw = Number(_eulerYXZ.y) || 0;
    state.roll = Number(_eulerYXZ.z) || 0;
  }

  const _lookPivotBefore = new THREE.Vector3();
  const _lookPivotAfter = new THREE.Vector3();
  const _lookPivotDelta = new THREE.Vector3();

  const _eyeA = new THREE.Vector3();
  const _eyeB = new THREE.Vector3();

  function getVrPivotWorldPos(vrCam, out) {
    if (!vrCam) {
      out.set(0, 0, 0);
      return out;
    }

    // three.js WebXRManager returns an ArrayCamera in VR.
    // In some cases, the ArrayCamera root position does not carry the headset
    // translation (it may live on the child eye cameras). Use the average of
    // the eye world positions as a stable headset pivot.
    const cams = vrCam.cameras;
    if (Array.isArray(cams) && cams.length >= 2) {
      cams[0].updateMatrixWorld(true);
      cams[1].updateMatrixWorld(true);
      cams[0].getWorldPosition(_eyeA);
      cams[1].getWorldPosition(_eyeB);
      out.copy(_eyeA).add(_eyeB).multiplyScalar(0.5);
      return out;
    }

    vrCam.updateMatrixWorld(true);
    vrCam.getWorldPosition(out);
    return out;
  }

  function applyLook() {
    // Controls treat the quaternion as authoritative.
    // For legacy/debug display, we also maintain derived yaw/pitch/roll.

    // Optional pitch clamping: enforce by projecting to Euler, clamping pitch,
    // then reconstituting the quaternion. (Wrap mode does not constrain.)
    if (pitchMode !== "wrap") {
      const lim = Math.PI * 0.5 - Math.max(0, Number(pitchClampEps) || 0);
      _eulerYXZ.setFromQuaternion(state.q, "YXZ");
      _eulerYXZ.x = clamp(_eulerYXZ.x, -lim, lim);
      state.q.setFromEuler(_eulerYXZ);
    }

    state.q.normalize();
    syncStateFromQuaternion();

    // In VR, optionally rotate the rig around the HMD pivot to avoid head drift.
    // Use the XR camera (not the base camera) so the pivot matches the actual headset pose.
    let vrPivotCam = null;
    const doVrPivot = !!vrPivotCompensation;
    if (renderer.xr.isPresenting && doVrPivot) {
      try {
        vrPivotCam = renderer.xr.getCamera(cam);
      } catch {
        vrPivotCam = null;
      }
      getVrPivotWorldPos(vrPivotCam || cam, _lookPivotBefore);
    }

    // Apply full orientation on the yaw node (children remain identity).
    // This preserves the canonical hierarchy while avoiding Euler-as-canonical control.
    playerYaw.quaternion.copy(state.q);
    playerPitch.rotation.set(0, 0, 0);
    playerRoll.rotation.set(0, 0, 0);

    if (renderer.xr.isPresenting && doVrPivot) {
      player.updateMatrixWorld(true);
      getVrPivotWorldPos(vrPivotCam || cam, _lookPivotAfter);
      _lookPivotDelta.subVectors(_lookPivotBefore, _lookPivotAfter);
      player.position.add(_lookPivotDelta);
    }
  }

  applyLook();

  return {
    camera: cam,
    desktopStartPos: startPos,
    rig: { player, playerYaw, playerPitch, playerRoll, head },
    look: {
      state,
      getYaw: () => state.yaw,
      setYaw: (v) => {
        const yaw = Number(v) || 0;
        _eulerYXZ.setFromQuaternion(state.q, "YXZ");
        _eulerYXZ.y = yaw;
        state.q.setFromEuler(_eulerYXZ);
        applyLook();
      },
      getPitch: () => state.pitch,
      setPitch: (v) => {
        const pitch = Number(v) || 0;
        _eulerYXZ.setFromQuaternion(state.q, "YXZ");
        _eulerYXZ.x = pitch;
        state.q.setFromEuler(_eulerYXZ);
        applyLook();
      },
      getRoll: () => state.roll,
      setRoll: (v) => {
        const roll = Number(v) || 0;
        _eulerYXZ.setFromQuaternion(state.q, "YXZ");
        _eulerYXZ.z = roll;
        state.q.setFromEuler(_eulerYXZ);
        applyLook();
      },
      getQuaternion: (out) => {
        if (out && out.isQuaternion) {
          out.copy(state.q);
          return out;
        }
        return state.q.clone();
      },
      setQuaternion: (q) => {
        if (!q || !q.isQuaternion) return;
        state.q.copy(q).normalize();
        applyLook();
      },
      // Quaternion-first rotation helpers.
      rotateYaw: (deltaRad) => {
        const d = Number(deltaRad);
        if (!Number.isFinite(d) || d === 0) return;
        // Yaw must rotate around the WORLD up axis (0,1,0), not the rig's
        // current local up. Rotating around the local up axis composes
        // intrinsic rotations and lets a right→up→left→down drag sequence
        // accumulate unwanted roll. Premultiplying by a world-up rotation
        // keeps the result Ry(yaw)·Rx(pitch) with roll fixed at zero.
        _axisWorld.copy(_axisUp);
        _qDelta.setFromAxisAngle(_axisWorld, d);
        state.q.premultiply(_qDelta);
        state.q.normalize();
      },
      rotatePitch: (deltaRad) => {
        const d = Number(deltaRad);
        if (!Number.isFinite(d) || d === 0) return;
        // Pitch rotates around the rig's local right axis. Premultiplying by a
        // rotation about (q · localRight) is equivalent to postmultiplying by a
        // local-X rotation, so with a roll-free yaw this stays Ry·Rx (no roll).
        _axisWorld.copy(_axisRight).applyQuaternion(state.q).normalize();
        _qDelta.setFromAxisAngle(_axisWorld, d);
        state.q.premultiply(_qDelta);
        state.q.normalize();
      },
      rotateRoll: (deltaRad) => {
        const d = Number(deltaRad);
        if (!Number.isFinite(d) || d === 0) return;
        // Roll is rotation around the current forward axis.
        _axisWorld.copy(_axisForward).applyQuaternion(state.q).normalize();
        _qDelta.setFromAxisAngle(_axisWorld, d);
        state.q.premultiply(_qDelta);
        state.q.normalize();
      },
      applyLook,
    },
  };
}
