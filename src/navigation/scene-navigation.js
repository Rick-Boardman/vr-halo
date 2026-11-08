// SPDX-License-Identifier: Apache-2.0
import { createDesktopNavigationControls } from "./desktop-navigation-controls.js";
import { createFacingCrosshairOverlay } from "./facing-crosshair-overlay.js";
import { createNavigationDebugStateAdapter } from "./debug-state-adapter.js";
import { DESKTOP_NAVIGATION_DEFAULTS } from "./desktop-navigation-policy.js";
import { createNavigationTelemetryAdapter } from "./telemetry.js";
import { clamp } from "../scalar-math.js";
import { createVrInputSourceResolution } from "./vr-input-source-resolution.js";

export function resolveVrPointerUiHandBlockState({
  presenting = false,
  pointer = null,
  isPointOverUi = null,
} = {}) {
  const empty = {
    leftBlocked: false,
    rightBlocked: false,
    leftReason: "",
    rightReason: "",
    handedness: null,
  };

  if (!presenting) return empty;

  const handedness = String(pointer?.controllerRay?.userData?.inputSource?.handedness ?? "")
    .trim()
    .toLowerCase() || null;
  const hasExplicitWindowKeys = Boolean(
    String(pointer?.controllerRay0WindowKey ?? "").trim()
      || String(pointer?.controllerRay1WindowKey ?? "").trim()
  );
  const pointerIsOverUi = typeof isPointOverUi === "function"
    ? isPointOverUi(pointer?.x, pointer?.y)
    : false;
  const leftHover = Boolean(
    String(pointer?.controllerRay0WindowKey ?? "").trim()
      || ((pointer?.active || pointer?.down) && handedness === "left" && pointerIsOverUi)
  );
  const rightHover = Boolean(
    String(pointer?.controllerRay1WindowKey ?? "").trim()
      || ((pointer?.active || pointer?.down) && handedness === "right" && pointerIsOverUi)
  );
  const leftDown = Boolean(pointer?.down && handedness === "left");
  const rightDown = Boolean(pointer?.down && handedness === "right");

  if (!hasExplicitWindowKeys && !leftHover && !rightHover && !leftDown && !rightDown) {
    return empty;
  }

  const leftReason = leftDown ? "hudPointerDown" : leftHover ? "hudHover" : "";
  const rightReason = rightDown ? "hudPointerDown" : rightHover ? "hudHover" : "";

  if (!leftReason && !rightReason) {
    return empty;
  }

  return {
    leftBlocked: Boolean(leftReason),
    rightBlocked: Boolean(rightReason),
    leftReason,
    rightReason,
    handedness,
  };
}

// Scene navigation helper for desktop + WebXR.
//
// Design goals:
// - Matches the repo's "full navigation" controls.
// - Integrates cleanly with the runtime HUD namespace by yielding when HUD is interacted with.
// - Minimal allocations in per-frame update.

/**
 * Purpose: Create the canonical scene navigation controller that combines desktop input, WebXR locomotion and look controls, optional facing-crosshair diagnostics, and runtime telemetry hooks.
 * @param {object} [options] Scene navigation configuration.
 * @param {{ Vector3: new (x?: number, y?: number, z?: number) => { set: (x: number, y: number, z: number) => unknown, copy: (value: unknown) => unknown, add: (value: unknown) => unknown, multiplyScalar: (value: number) => unknown, addScaledVector: (value: unknown, scale: number) => unknown, subVectors: (a: unknown, b: unknown) => unknown, normalize: () => unknown, distanceTo: (value: unknown) => number, length: () => number, lengthSq: () => number, dot: (value: unknown) => number, crossVectors: (a: unknown, b: unknown) => unknown, applyQuaternion: (value: unknown) => unknown, get x(): number, get y(): number, get z(): number }, Quaternion: new () => { set: (x: number, y: number, z: number, w: number) => unknown, setFromEuler: (value: unknown) => unknown, normalize: () => unknown }, Euler: new (x?: number, y?: number, z?: number, order?: string) => { set: (x: number, y: number, z: number) => unknown } }} [options.THREE] Three.js namespace used to allocate the working vectors, quaternions, and Euler helpers needed by desktop and XR navigation.
 * @param {{ xr: { isPresenting?: boolean, getSession?: () => unknown, getCamera?: (camera: unknown) => unknown, getFrame?: () => unknown, getReferenceSpace?: () => unknown } }} [options.renderer] Renderer whose XR manager provides headset, controller, and session state for navigation.
 * @param {{ updateMatrixWorld?: (force?: boolean) => void, getWorldPosition?: (target: unknown) => unknown }} [options.camera] Camera used as the desktop and XR look origin.
 * @param {unknown} [options.scene] Optional scene reference used by the facing-crosshair overlay when debugFacingCrosshair is enabled.
 * @param {Array<unknown> | null} [options.worldRaycastTargets] Reserved compatibility argument for callers that already bundle navigation with world-raycast targets; currently accepted but not used directly by scene navigation.
 * @param {{ position: { addScaledVector: (direction: unknown, scale: number) => unknown } }} [options.player] Player or rig root whose position is mutated by locomotion.
 * @param {{ getYaw?: () => number, setYaw?: (value: number) => void, getPitch?: () => number, setPitch?: (value: number) => void, getRoll?: () => number, setRoll?: (value: number) => void, rotateYaw?: (delta: number) => void, rotatePitch?: (delta: number) => void, rotateRoll?: (delta: number) => void, applyLook?: () => void, getQuaternion?: (out?: unknown) => unknown, yaw?: number, pitch?: number, roll?: number }} [options.look] Look-state adapter that exposes yaw, pitch, roll, and optional quaternion helpers for the rig.
 * @param {{ setNavigationHelpProfile?: (profile: string) => void, isPointOverUi?: (x: number, y: number) => boolean, hud?: { vrPointer?: { down?: boolean, x?: number, y?: number } } } | null} [options.hudSystem] Optional HUD system used to publish help defaults and suppress navigation while interacting with the HUD.
 * @param {() => boolean} [options.isEnabled] Optional predicate that disables all navigation updates when it returns false.
 * @param {() => boolean} [options.isTyping] Optional predicate that suppresses desktop controls while the user is typing into UI.
 * @param {number} [options.mouseLookButton=DESKTOP_NAVIGATION_DEFAULTS.mouseLookButton] Mouse button index that activates desktop drag-to-look.
 * @param {number} [options.mouseLookSensitivity=DESKTOP_NAVIGATION_DEFAULTS.mouseLookSensitivity] Desktop pointer-look sensitivity multiplier in radians per pixel.
 * @param {number} [options.mouseDragThresholdPx=DESKTOP_NAVIGATION_DEFAULTS.mouseDragThresholdPx] Minimum drag distance in pixels before desktop look-dragging engages.
 * @param {number} [options.baseSpeed=DESKTOP_NAVIGATION_DEFAULTS.baseSpeed] Base desktop locomotion speed in world units per second.
 * @param {number} [options.fastMultiplier=DESKTOP_NAVIGATION_DEFAULTS.fastMultiplier] Desktop speed multiplier applied while the fast-move modifier is active.
 * @param {boolean} [options.speedRampEnabled=DESKTOP_NAVIGATION_DEFAULTS.speedRampEnabled] Whether desktop fast movement ramps up and down smoothly instead of switching instantly.
 * @param {number} [options.speedRampMaxMultiplier=DESKTOP_NAVIGATION_DEFAULTS.speedRampMaxMultiplier] Maximum desktop speed multiplier reachable when speed ramping is enabled.
 * @param {number} [options.speedRampAccelPerSec=DESKTOP_NAVIGATION_DEFAULTS.speedRampAccelPerSec] Per-second acceleration applied to the desktop speed ramp.
 * @param {number} [options.speedRampDecelPerSec=DESKTOP_NAVIGATION_DEFAULTS.speedRampDecelPerSec] Per-second deceleration applied when the desktop speed ramp relaxes.
 * @param {number} [options.yawSpeed=DESKTOP_NAVIGATION_DEFAULTS.yawSpeed] Keyboard-driven desktop yaw speed in radians per second.
 * @param {number} [options.pitchSpeed=DESKTOP_NAVIGATION_DEFAULTS.pitchSpeed] Keyboard-driven desktop pitch speed in radians per second.
 * @param {number} [options.rollSpeed=DESKTOP_NAVIGATION_DEFAULTS.rollSpeed] Keyboard-driven desktop roll speed in radians per second.
 * @param {number} [options.vrMoveSpeed=7.5] VR locomotion speed in world units per second.
 * @param {number} [options.vrYawSpeed=1.9] Right-stick VR yaw speed multiplier.
 * @param {number} [options.vrPitchSpeed=1.3] Right-stick VR pitch speed multiplier.
 * @param {number} [options.vrRollSpeed=1.4] Wrist-twist VR roll speed multiplier.
 * @param {number} [options.vrDeadzone=0.18] Deadzone threshold applied to VR stick axes before movement or look input is accepted.
 * @param {number} [options.vrWristTwistDeadzoneRad=0.01] Minimum wrist-twist delta in radians before VR roll input is applied.
 * @param {boolean} [options.debugFacingCrosshair=false] Whether to render the facing-crosshair debug overlay.
 * @param {number} [options.debugFacingCrosshairDistance=3] Distance in world units from the camera at which the facing crosshair is drawn.
 * @param {number} [options.debugFacingCrosshairSize=0.06] World-space size of the facing-crosshair debug overlay.
 * @param {{ log?: (event: string, data: unknown) => void } | null} [options.remoteLogger=null] Optional remote logger consumed by the navigation telemetry adapter.
 * @param {string} [options.keyboardKeyMode=DESKTOP_NAVIGATION_DEFAULTS.keyboardKeyMode] Desktop keyboard mapping mode: "smart", "key", or "code".
 * @returns {{ update: (dt?: number) => void, renderOverlay: () => void, syncOverlay: () => void, lookAtWorld: (targetWorldPos: unknown) => void, dispose: () => void, keysDown: unknown, isLookDragging: boolean, autoWalk: boolean }} Navigation controller with per-frame update/render hooks, a world-look helper, lifecycle disposal, active desktop key state, and live desktop movement flags.
 * Side effects: allocates navigation helper objects, may install desktop DOM listeners via createDesktopNavigationControls, publishes the shared HUD help profile, mutates player position and rig look state during updates, may render a facing-crosshair overlay, and may emit remote telemetry through the supplied logger.
 */
export function createSceneNavigation({
  THREE,
  renderer,
  camera,
  scene,
  worldRaycastTargets,
  player,
  look,
  hudSystem,
  isEnabled,
  isTyping,
  // Desktop mouse look
  // Default to RMB drag so LMB is reserved for HUD interaction.
  mouseLookButton = DESKTOP_NAVIGATION_DEFAULTS.mouseLookButton,
  mouseLookSensitivity = DESKTOP_NAVIGATION_DEFAULTS.mouseLookSensitivity,
  mouseDragThresholdPx = DESKTOP_NAVIGATION_DEFAULTS.mouseDragThresholdPx,
  // Keyboard flight
  baseSpeed = DESKTOP_NAVIGATION_DEFAULTS.baseSpeed,
  fastMultiplier = DESKTOP_NAVIGATION_DEFAULTS.fastMultiplier,
  // Optional: zoom via mousewheel or pinch-to-zoom (adjusts player.position.y).
  zoomEnabled = false,
  zoomMin = 1,
  zoomMax = 50,
  zoomSpeed = 0.15,
  // Optional: ramped speed (desktop). When enabled, holding Shift while moving
  // increases movement speed smoothly up to a cap.
  speedRampEnabled = DESKTOP_NAVIGATION_DEFAULTS.speedRampEnabled,
  speedRampMaxMultiplier = DESKTOP_NAVIGATION_DEFAULTS.speedRampMaxMultiplier,
  speedRampAccelPerSec = DESKTOP_NAVIGATION_DEFAULTS.speedRampAccelPerSec,
  speedRampDecelPerSec = DESKTOP_NAVIGATION_DEFAULTS.speedRampDecelPerSec,
  yawSpeed = DESKTOP_NAVIGATION_DEFAULTS.yawSpeed,
  pitchSpeed = DESKTOP_NAVIGATION_DEFAULTS.pitchSpeed,
  rollSpeed = DESKTOP_NAVIGATION_DEFAULTS.rollSpeed,
  // VR
  vrMoveSpeed = 7.5,
  vrYawSpeed = 1.9,
  vrPitchSpeed = 1.3,
  vrRollSpeed = 1.4,
  vrDeadzone = 0.18,
  // Controller twist -> roll control (VR)
  vrWristTwistDeadzoneRad = 0.01,

  // Diagnostics
  debugFacingCrosshair = false,
  debugFacingCrosshairDistance = 3.0,
  debugFacingCrosshairSize = 0.06,
  remoteLogger = null,

  // Keyboard mapping:
  // - "smart" (default): prefer `e.key` when it matches a nav key (WASD/QE/etc),
  //   otherwise fall back to `e.code`.
  // - "key": always use `e.key` (character-based).
  // - "code": always use `e.code` (physical key-based).
  keyboardKeyMode = DESKTOP_NAVIGATION_DEFAULTS.keyboardKeyMode,
} = {}) {
  if (!THREE) throw new Error("createSceneNavigation: THREE is required");
  if (!renderer)
    throw new Error("createSceneNavigation: renderer is required");
  if (!camera) throw new Error("createSceneNavigation: camera is required");
  if (!player) throw new Error("createSceneNavigation: player is required");
  if (!look)
    throw new Error("createSceneNavigation: look accessors are required");

  const telemetry = createNavigationTelemetryAdapter({ remoteLogger });

  const {
    getXrSessionInputSources,
    getInputSourceByHandedness,
    getGamepadByHandedness,
    getBestStickAxesFromGamepad,
    getFallbackGamepadsInOrder,
    getStickAxesForHand,
    getStickPairForGamepad,
    getHandednessForGamepad,
  } = createVrInputSourceResolution({ renderer, vrDeadzone });

  const _xrEyeA = new THREE.Vector3();
  const _xrEyeB = new THREE.Vector3();
  const _xrCamPosW = new THREE.Vector3();
  const _xrPivotPosW = new THREE.Vector3();
  const _baseCamPosW = new THREE.Vector3();
  const _xrQuatW = new THREE.Quaternion();

  function getVrCameraPivotWorldPos(vrCam, out) {
    if (!vrCam) {
      out.set(0, 0, 0);
      return out;
    }

    // Always compute the XR camera's own world position.
    // In some three.js/XR configurations the child eye cameras may not include
    // the full scene graph transform, so their "world" positions are effectively
    // XR reference-space positions and can be wildly wrong for world placement.
    vrCam.updateMatrixWorld(true);
    vrCam.getWorldPosition(_xrCamPosW);

    // three.js WebXR provides an ArrayCamera; translation can live on child eyes.
    const cams = vrCam.cameras;
    if (Array.isArray(cams) && cams.length >= 2) {
      cams[0].updateMatrixWorld(true);
      cams[1].updateMatrixWorld(true);
      cams[0].getWorldPosition(_xrEyeA);
      cams[1].getWorldPosition(_xrEyeB);

      out.copy(_xrEyeA).add(_xrEyeB).multiplyScalar(0.5);

      // Sanity check: if the eye-average is far from the XR camera position,
      // prefer the XR camera position as the world-space head pivot.
      if (out.distanceTo(_xrCamPosW) > 1.5) {
        out.copy(_xrCamPosW);
      }
      return out;
    }

    out.copy(_xrCamPosW);
    return out;
  }

  const _isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
  const _isTyping = typeof isTyping === "function" ? isTyping : () => false;

  // Inform shared runtime help defaults (apps shouldn't have to).
  try {
    hudSystem?.setNavigationHelpProfile?.("fly");
  } catch {
    // no-op
  }

  const getYaw =
    typeof look.getYaw === "function" ? look.getYaw : () => look.yaw ?? 0;
  const setYaw =
    typeof look.setYaw === "function"
      ? look.setYaw
      : (v) => {
          look.yaw = v;
        };
  const getPitch =
    typeof look.getPitch === "function" ? look.getPitch : () => look.pitch ?? 0;
  const setPitch =
    typeof look.setPitch === "function"
      ? look.setPitch
      : (v) => {
          look.pitch = v;
        };

  const getRoll =
    typeof look.getRoll === "function" ? look.getRoll : () => look.roll ?? 0;
  const setRoll =
    typeof look.setRoll === "function"
      ? look.setRoll
      : (v) => {
          look.roll = v;
        };
  const applyLook =
    typeof look.applyLook === "function" ? look.applyLook : () => {};

  const rotateYaw =
    typeof look.rotateYaw === "function" ? look.rotateYaw : (d) => setYaw(getYaw() + d);
  const rotatePitch =
    typeof look.rotatePitch === "function" ? look.rotatePitch : (d) => setPitch(getPitch() + d);
  const rotateRoll =
    typeof look.rotateRoll === "function" ? look.rotateRoll : (d) => setRoll(getRoll() + d);

  const getQuaternion =
    typeof look.getQuaternion === "function" ? look.getQuaternion : null;

  function wrappedAngleDeltaRad(delta) {
    const d = Number(delta);
    if (!Number.isFinite(d)) return 0;
    // Shortest signed delta in (-pi, pi]
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  // NOTE: yaw/pitch deltas are applied through look.rotateYaw/rotatePitch when available.

  const { desktop: desktopProve, publish: publishProve, vr: vrProve } =
    createNavigationDebugStateAdapter({ hudSystem });

  const desktopControls = createDesktopNavigationControls({
    THREE,
    renderer,
    hudSystem,
    player,
    getYaw,
    getPitch,
    getRoll,
    rotateYaw,
    rotatePitch,
    rotateRoll,
    applyLook,
    getQuaternion,
    isEnabled: _isEnabled,
    isTyping: _isTyping,
    mouseLookButton,
    mouseLookSensitivity,
    mouseDragThresholdPx,
    baseSpeed,
    fastMultiplier,
    zoomEnabled,
    zoomMin,
    zoomMax,
    zoomSpeed,
    speedRampEnabled,
    speedRampMaxMultiplier,
    speedRampAccelPerSec,
    speedRampDecelPerSec,
    yawSpeed,
    pitchSpeed,
    rollSpeed,
    keyboardKeyMode,
    desktopProve,
    publishProve,
    wrappedAngleDeltaRad,
  });

  const facingCrosshairOverlay = createFacingCrosshairOverlay({
    THREE,
    renderer,
    camera,
    scene,
    getVrCameraPivotWorldPos,
    isEnabled: () => !!(debugFacingCrosshair && scene),
    distance: debugFacingCrosshairDistance,
    size: debugFacingCrosshairSize,
  });

  const _worldUp = new THREE.Vector3(0, 1, 0);
  const _qTmp = new THREE.Quaternion();

  const _vrUp = new THREE.Vector3(0, 1, 0);
  const _vrForward = new THREE.Vector3();
  const _vrForwardFlat = new THREE.Vector3();
  const _vrRight = new THREE.Vector3();
  const _vrMove = new THREE.Vector3();

  // VR locomotion heading lock:
  // Capture *rig locomotion* orientation when movement begins, then keep that
  // heading until the stick returns to neutral so the user can free-look while moving.
  const _vrLocoHeadingQ = new THREE.Quaternion();
  let _vrLocoHeadingActive = false;
  const _vrLocoHeadingEuler = new THREE.Euler(0, 0, 0, "YXZ");

  // VR wrist twist -> roll
  const _twistPrevByGamepad = new WeakMap();
  const _twistUpW = new THREE.Vector3();
  const _twistFwdW = new THREE.Vector3();
  const _twistRefW = new THREE.Vector3();
  const _twistUpProjW = new THREE.Vector3();
  const _twistCrossW = new THREE.Vector3();

  function computeControllerTwistAngleRad(qWorld) {
    if (!qWorld || !qWorld.isQuaternion) return null;

    // Decompose the controller quaternion into a twist angle around its forward
    // axis using Gram-Schmidt projection.  Convention: Y-up world, controller
    // local forward = (0,0,−1), local up = (0,1,0).  Result is the signed angle
    // (radians) between the world-up reference and the controller's up, both
    // projected onto the plane perpendicular to controller forward.  Positive
    // twist = clockwise when viewed from behind the controller (looking along −Z).

    // Transform local forward/up into world space.
    _twistFwdW.set(0, 0, -1).applyQuaternion(qWorld).normalize();
    _twistUpW.set(0, 1, 0).applyQuaternion(qWorld).normalize();

    // Reference vector: world-up projected onto the plane ⊥ to forward.
    // Gram-Schmidt: ref = worldUp − (worldUp · fwd) * fwd, then normalize.
    // Degenerates (ref ≈ 0) when the controller points straight up/down.
    _twistRefW.copy(_worldUp).subScaledVector(_twistFwdW, _worldUp.dot(_twistFwdW));
    const refLen2 = _twistRefW.lengthSq();
    if (refLen2 < 1e-6) return null;
    _twistRefW.multiplyScalar(1 / Math.sqrt(refLen2));

    // Controller up projected onto the same plane ⊥ to forward.
    _twistUpProjW.copy(_twistUpW).subScaledVector(_twistFwdW, _twistUpW.dot(_twistFwdW));
    const upLen2 = _twistUpProjW.lengthSq();
    if (upLen2 < 1e-6) return null;
    _twistUpProjW.multiplyScalar(1 / Math.sqrt(upLen2));

    // Signed angle between reference and projected-up via atan2(sin, cos).
    // sin component = (ref × upProj) · fwd  (triple product gives signed area).
    const dot = clamp(_twistRefW.dot(_twistUpProjW), -1, 1);
    _twistCrossW.crossVectors(_twistRefW, _twistUpProjW);
    const sin = _twistCrossW.dot(_twistFwdW);
    return Math.atan2(sin, dot);
  }

  let _vrState = { presenting: false };
  const _crossPos = new THREE.Vector3();

  function applyDeadzone(v, dead) {
    const a = Math.abs(v);
    if (a < dead) return 0;
    const s = (a - dead) / (1 - dead);
    return Math.sign(v) * s;
  }
  function _tickVrLocomotion(dt, lockThreshold, blockedByUi = false) {
    if (blockedByUi) return;
    const axes = getStickAxesForHand("left", 0);
    if (!axes) return;

    let sx = applyDeadzone(axes.x, vrDeadzone);
    let sy = applyDeadzone(axes.y, vrDeadzone);
    if (sx !== 0 || sy !== 0) {
      // Gaze-steering contract (VR):
      // - Facing crosshair is centered in the XR view.
      // - Locomotion follows the XR head forward (so you move where you look).
      // - Pitch is fly (full 3D quaternion basis).
      try {
        const xrCam = renderer.xr.getCamera(camera);
        xrCam.updateMatrixWorld(true);
        xrCam.getWorldQuaternion(_qTmp).normalize();
      } catch {
        // Fallback: use rig/look quaternion if XR camera pose isn't available.
        try {
          if (getQuaternion) {
            getQuaternion(_qTmp);
          } else {
            _vrLocoHeadingEuler.set(getPitch(), getYaw(), getRoll());
            _qTmp.setFromEuler(_vrLocoHeadingEuler);
          }
          _qTmp.normalize();
        } catch {
          _qTmp.set(0, 0, 0, 1);
        }
      }

      _vrForward.set(0, 0, -1).applyQuaternion(_qTmp).normalize();
      _vrRight.set(1, 0, 0).applyQuaternion(_qTmp).normalize();
      _vrUp.set(0, 1, 0).applyQuaternion(_qTmp).normalize();

      _vrMove.set(0, 0, 0);
      _vrMove.addScaledVector(_vrRight, sx);
      _vrMove.addScaledVector(_vrForward, -sy);
      const mLen = _vrMove.length();
      if (mLen > 1) _vrMove.multiplyScalar(1 / mLen);

      player.position.addScaledVector(_vrMove, vrMoveSpeed * dt);

      // Low-rate movement log: compare input to computed forward.
      try {
        telemetry.logVrMove({
          sx,
          sy,
          move: _vrMove,
          forward: _vrForward,
          right: _vrRight,
          position: player.position,
        });
      } catch {
        // no-op
      }
    }

    // Publish stick diagnostics (helps verify axis pairing/hand selection).
    try {
      const gp = getGamepadByHandedness("left");
      const pair = gp ? getStickPairForGamepad(gp, lockThreshold) : null;
      vrProve.loco = {
        handedness: gp ? String(getHandednessForGamepad(gp) || "") : "left",
        mapping: gp ? String(gp.mapping || "") : "",
        axesLen: gp?.axes?.length ?? 0,
        pair: pair ? `${pair.ix},${pair.iy}` : "",
        raw: `${Number(axes.x).toFixed(3)},${Number(axes.y).toFixed(3)}`,
        dz: `${Number(sx).toFixed(3)},${Number(sy).toFixed(3)}`,
      };
    } catch {
      // no-op
    }
  }

  function _tickVrLook(dt, yawBefore, pitchBefore, rollBefore, lockThreshold, blockedByUi = false) {
    if (blockedByUi) return;
    let yawIn = 0;
    let pitchIn = 0;
    let rollIn = 0;

    // Stick yaw/pitch
    const axes = getStickAxesForHand("right", 1);
    if (axes) {
      yawIn = applyDeadzone(axes.x, vrDeadzone);
      pitchIn = applyDeadzone(axes.y, vrDeadzone);
    }

    // Wrist twist roll (based on controller pose)
    try {
      const src = getInputSourceByHandedness("right");
      const gp = src?.gamepad;
      const frame = renderer.xr.getFrame?.();
      const refSpace = renderer.xr.getReferenceSpace?.();
      const space = src?.gripSpace || src?.targetRaySpace;
      if (gp && frame && refSpace && space) {
        const pose = frame.getPose(space, refSpace);
        const o = pose?.transform?.orientation;
        if (o) {
          _xrQuatW
            .set(Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0, Number(o.w) || 1)
            .normalize();
          const twistAngle = computeControllerTwistAngleRad(_xrQuatW);
          if (Number.isFinite(twistAngle)) {
            const prev = _twistPrevByGamepad.get(gp);
            _twistPrevByGamepad.set(gp, twistAngle);
            if (Number.isFinite(prev)) {
              const dtwist = wrappedAngleDeltaRad(twistAngle - prev);
              if (Math.abs(dtwist) >= Math.max(0.0001, Number(vrWristTwistDeadzoneRad) || 0)) {
                // Sign: twisting the wrist clockwise should bank right.
                rollIn = -dtwist;
              }
            }
          }
        }
      }
    } catch {
      // no-op
    }

    const hasStick = yawIn !== 0 || pitchIn !== 0;
    const hasTwist = rollIn !== 0;

    if (hasStick || hasTwist) {
      if (yawIn !== 0) rotateYaw(-yawIn * vrYawSpeed * dt);
      // Stick forward is typically negative Y; forward should look up.
      if (pitchIn !== 0) rotatePitch(-pitchIn * vrPitchSpeed * dt);
      if (rollIn !== 0) rotateRoll(rollIn * (Number(vrRollSpeed) || 1));
      applyLook();

      const yawAfter = getYaw();
      const pitchAfter = getPitch();
      const rollAfter = getRoll();
      const rawDelta = yawAfter - yawBefore;
      vrProve.yawBefore = yawBefore;
      vrProve.yawAfter = yawAfter;
      vrProve.rawDelta = rawDelta;
      vrProve.wrappedDelta = wrappedAngleDeltaRad(rawDelta);
      vrProve.pitchBefore = pitchBefore;
      vrProve.pitchAfter = pitchAfter;
      vrProve.rollBefore = rollBefore;
      vrProve.rollAfter = rollAfter;
      publishProve();
    }

    try {
      telemetry.logVrLook({
        hasStick,
        hasTwist,
        yawIn,
        pitchIn,
        rollIn,
        yaw: getYaw(),
        pitch: getPitch(),
        roll: getRoll(),
      });
    } catch {
      // no-op
    }

    try {
      const gp = getGamepadByHandedness("right");
      const pair = gp ? getStickPairForGamepad(gp, lockThreshold) : null;
      vrProve.turn = {
        handedness: gp ? String(getHandednessForGamepad(gp) || "") : "right",
        mapping: gp ? String(gp.mapping || "") : "",
        axesLen: gp?.axes?.length ?? 0,
        pair: pair ? `${pair.ix},${pair.iy}` : "",
        raw: axes ? `${Number(axes.x).toFixed(3)},${Number(axes.y).toFixed(3)}` : "",
        dz: `${Number(yawIn).toFixed(3)},${Number(pitchIn).toFixed(3)}`,
        rollIn: Number(rollIn).toFixed(3),
      };
    } catch {
      // no-op
    }
  }

  function tickVr(dt) {
    if (!renderer.xr.isPresenting) return;
    const enabled = !!_isEnabled();
    const uiHandBlock = resolveVrPointerUiHandBlockState({
      presenting: renderer.xr.isPresenting,
      pointer: hudSystem?.hud?.vrPointer ?? null,
      isPointOverUi: hudSystem?.isPointOverUi,
    });
    const overUi = uiHandBlock.leftReason === "hudPointerDown" || uiHandBlock.rightReason === "hudPointerDown";
    const hoveringUi = uiHandBlock.leftReason === "hudHover" || uiHandBlock.rightReason === "hudHover";
    vrProve.enabled = enabled;
    vrProve.overUi = overUi;
    vrProve.blocked = !enabled
      ? "worldDisabled"
      : [
        uiHandBlock.leftReason ? `left:${uiHandBlock.leftReason}` : "",
        uiHandBlock.rightReason ? `right:${uiHandBlock.rightReason}` : "",
      ].filter(Boolean).join(",");
    publishProve();

    // Low-rate remote state log (captures why VR nav might be "dead" in a scene).
    try {
      telemetry.logVrState({
        blocked: vrProve.blocked,
        enabled,
        overUi,
        hoveringUi,
        leftBlocked: uiHandBlock.leftBlocked,
        rightBlocked: uiHandBlock.rightBlocked,
        yaw: getYaw(),
        pitch: getPitch(),
        roll: getRoll(),
      });
    } catch {
      // no-op
    }

    if (!enabled) {
      return;
    }

    const yawBefore = getYaw();
    const pitchBefore = getPitch();
    const rollBefore = getRoll();

    const lockThreshold = Math.min(0.95, Math.max(0.15, vrDeadzone + 0.15));

    // Publish input source summary (helps diagnose missing handedness / axis layout).
    try {
      const sources = getXrSessionInputSources();
      vrProve.sources = sources
        .filter((s) => !!s?.gamepad)
        .map((s) => {
          const gp = s.gamepad;
          const pair = gp ? getStickPairForGamepad(gp, lockThreshold) : null;
          return {
            handedness: String(s.handedness || getHandednessForGamepad(gp) || ""),
            id: String(gp?.id || ""),
            profiles: Array.isArray(s?.profiles) ? s.profiles.map(String) : [],
            targetRayMode: String(s?.targetRayMode || ""),
            mapping: String(gp?.mapping || ""),
            axesLen: gp?.axes?.length ?? 0,
            buttonsLen: gp?.buttons?.length ?? 0,
            pair: pair ? `${pair.ix},${pair.iy}` : "",
          };
        });
      publishProve();
    } catch {
      // no-op
    }

    _tickVrLocomotion(dt, lockThreshold, uiHandBlock.leftBlocked);
    _tickVrLook(dt, yawBefore, pitchBefore, rollBefore, lockThreshold, uiHandBlock.rightBlocked);
  }

  function update(dt) {
    const dtNum = Number.isFinite(dt) ? Number(dt) : 0;

    // One-shot enter/exit VR log + crosshair lifecycle.
    const nowPresenting = !!renderer.xr.isPresenting;
    if (nowPresenting !== _vrState.presenting) {
      _vrState.presenting = nowPresenting;

      // Include camera pose diagnostics on enter/exit to help spot XR pose mismatches.
      let baseCamPos = null;
      let xrPivotPos = null;
      let xrCamPos = null;
      try {
        camera.updateMatrixWorld(true);
        camera.getWorldPosition(_baseCamPosW);
        baseCamPos = [
          Number(_baseCamPosW.x).toFixed(3),
          Number(_baseCamPosW.y).toFixed(3),
          Number(_baseCamPosW.z).toFixed(3),
        ];

        if (renderer.xr.isPresenting) {
          const xrCam = renderer.xr.getCamera(camera);
          getVrCameraPivotWorldPos(xrCam, _xrPivotPosW);
          xrPivotPos = [
            Number(_xrPivotPosW.x).toFixed(3),
            Number(_xrPivotPosW.y).toFixed(3),
            Number(_xrPivotPosW.z).toFixed(3),
          ];
          xrCam.updateMatrixWorld(true);
          xrCam.getWorldPosition(_crossPos);
          xrCamPos = [
            Number(_crossPos.x).toFixed(3),
            Number(_crossPos.y).toFixed(3),
            Number(_crossPos.z).toFixed(3),
          ];
        }
      } catch {
        // no-op
      }

      telemetry.logVrLifecycle({
        presenting: nowPresenting,
        baseCamPos,
        xrCamPos,
        xrPivotPos,
      });
    }

    desktopControls.tick(dtNum);
    tickVr(dtNum);
    facingCrosshairOverlay.update();
  }

  function renderOverlay() {
    facingCrosshairOverlay.render();
  }

  /** Just before the frame is drawn on desktop: what must follow the camera as the frame will see it. */
  function syncOverlay() {
    facingCrosshairOverlay.sync();
  }

  function lookAtWorld(targetWorldPos) {
    if (!targetWorldPos) return;
    // Use camera world position as the look origin.
    const from = new THREE.Vector3();
    const dir = new THREE.Vector3();
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(from);
    dir.subVectors(targetWorldPos, from);

    const horiz = Math.max(0.0001, Math.hypot(dir.x, dir.z));
    // yaw: face target with -Z forward
    const yaw = Math.atan2(-dir.x, -dir.z);
    // pitch: aim up/down toward target (scene's applyLook may clamp)
    const pitch = Math.atan2(dir.y, horiz);

    setYaw(yaw);
    setPitch(pitch);
    applyLook();
  }

  function dispose() {
    facingCrosshairOverlay.dispose();
    desktopControls.dispose();
  }

  return {
    update,
    renderOverlay,
    syncOverlay,
    lookAtWorld,
    dispose,
    keysDown: desktopControls.keysDown,
    get isLookDragging() {
      return desktopControls.isLookDragging;
    },
    get autoWalk() {
      return desktopControls.autoWalk;
    },
    set autoWalk(v) {
      desktopControls.autoWalk = v;
    },
  };
}
