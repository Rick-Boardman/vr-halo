// SPDX-License-Identifier: Apache-2.0
/** Thumbstick magnitude threshold that engages depth-control latching. */
const DEPTH_INPUT_ENGAGE_DEADZONE = 0.12;
/** Thumbstick magnitude threshold below which depth-control latching releases. */
const DEPTH_INPUT_RELEASE_DEADZONE = 0.06;

/**
 * Purpose: Create VR gamepad helpers that provide stable thumbstick-forward/back input for HUD depth push/pull interactions.
 * @param {object} [options={}] VR depth-input dependencies.
 * @param {{ xr?: { getSession?: () => any } }} options.renderer Renderer used to access active XR sessions and input sources.
 * @param {{ userData?: { inputSource?: { gamepad?: any } } } | null} [options.controllerRay0=null] Primary controller ray object that may carry an attached XR input source.
 * @param {{ userData?: { inputSource?: { gamepad?: any } } } | null} [options.controllerRay1=null] Secondary controller ray object that may carry an attached XR input source.
 * @param {(() => ({ gamepad?: any } | null)) | null} [options.getActiveUiInputSource=null] Callback returning the current UI-driving XR input source.
 * @returns {{ getAnyThumbstickForwardBackForDepth: () => number, getAnyThumbstickForwardBackForUi: () => number }} API that returns stable thumbstick-forward/back values for VR depth interactions and UI hover scrolling.
 * Side effects: keeps an internal latched gamepad reference so depth input remains stable across frames.
 */
export function createHudVrDepthInputRuntime({
  renderer,
  controllerRay0 = null,
  controllerRay1 = null,
  getActiveUiInputSource = null,
} = {}) {
  let vrDepthInputGamepad = null;

  function readActiveUiInputSource() {
    return typeof getActiveUiInputSource === "function"
      ? getActiveUiInputSource()
      : null;
  }

  function getActiveGamepad() {
    try {
      const session = renderer?.xr?.getSession?.();
      if (!session) return null;

      const src = readActiveUiInputSource();
      if (src?.gamepad) return src.gamepad;

      const sources = Array.isArray(session.inputSources)
        ? session.inputSources
        : [];
      for (const source of sources) {
        if (source?.handedness === "right" && source?.gamepad) {
          return source.gamepad;
        }
      }
      for (const source of sources) {
        if (source?.gamepad) return source.gamepad;
      }
    } catch {
      // no-op
    }
    return null;
  }

  function getForwardBackAxisFromGamepad(gamepad) {
    const axes = gamepad?.axes;
    if (!axes || axes.length === 0) return 0;

    // Quest Touch tends to expose thumbstick as axes[0]/axes[1]. Some runtimes also provide
    // a second pair (axes[2]/axes[3]). Prefer the Y axes (1,3), but fall back to X if needed.
    const candidatesPreferY = [];
    if (Number.isFinite(axes[1])) candidatesPreferY.push(Number(axes[1]));
    if (Number.isFinite(axes[3])) candidatesPreferY.push(Number(axes[3]));

    const candidatesFallback = [];
    if (Number.isFinite(axes[0])) candidatesFallback.push(Number(axes[0]));
    if (Number.isFinite(axes[2])) candidatesFallback.push(Number(axes[2]));

    let best = 0;
    for (const value of candidatesPreferY) {
      if (Math.abs(value) > Math.abs(best)) best = value;
    }
    if (best === 0) {
      for (const value of candidatesFallback) {
        if (Math.abs(value) > Math.abs(best)) best = value;
      }
    }
    return Number.isFinite(best) ? best : 0;
  }

  function collectVrGamepads() {
    const out = [];
    const seen = new Set();
    const add = (gamepad) => {
      if (!gamepad) return;
      if (seen.has(gamepad)) return;
      seen.add(gamepad);
      out.push(gamepad);
    };

    try {
      add(controllerRay0?.userData?.inputSource?.gamepad);
      add(controllerRay1?.userData?.inputSource?.gamepad);
      add(readActiveUiInputSource()?.gamepad);
    } catch {
      // no-op
    }

    try {
      const session = renderer?.xr?.getSession?.();
      const sources = Array.isArray(session?.inputSources)
        ? session.inputSources
        : [];
      for (const source of sources) add(source?.gamepad);
    } catch {
      // no-op
    }

    try {
      const gamepads = typeof navigator?.getGamepads === "function"
        ? navigator.getGamepads()
        : null;
      if (gamepads && typeof gamepads.length === "number") {
        for (const gamepad of gamepads) add(gamepad);
      }
    } catch {
      // no-op
    }

    add(getActiveGamepad());
    return out;
  }

  function getAnyThumbstickForwardBackForDepth() {
    // VR ergonomics requirement: while one hand is holding a grab/drag, the OTHER
    // controller should be able to drive depth. But sampling "largest magnitude each frame"
    // can alternate between controllers due to tiny noise and cause visible oscillation.
    //
    // Solution: latch the controller/gamepad that first exceeds an engage threshold,
    // and keep using it until it returns to a release deadzone.
    const gamepads = collectVrGamepads();

    if (vrDepthInputGamepad && !gamepads.includes(vrDepthInputGamepad)) {
      vrDepthInputGamepad = null;
    }

    if (vrDepthInputGamepad) {
      const value = getForwardBackAxisFromGamepad(vrDepthInputGamepad);
      if (Math.abs(value) >= DEPTH_INPUT_RELEASE_DEADZONE) return value;
      vrDepthInputGamepad = null;
      return 0;
    }

    let bestGamepad = null;
    let bestValue = 0;
    for (const gamepad of gamepads) {
      const value = getForwardBackAxisFromGamepad(gamepad);
      if (Math.abs(value) > Math.abs(bestValue)) {
        bestValue = value;
        bestGamepad = gamepad;
      }
    }

    if (Math.abs(bestValue) >= DEPTH_INPUT_ENGAGE_DEADZONE) {
      vrDepthInputGamepad = bestGamepad;
      return bestValue;
    }

    return 0;
  }

  function getAnyThumbstickForwardBackForUi() {
    const gamepads = collectVrGamepads();

    let bestValue = 0;
    for (const gamepad of gamepads) {
      const value = getForwardBackAxisFromGamepad(gamepad);
      if (Math.abs(value) > Math.abs(bestValue)) {
        bestValue = value;
      }
    }

    return Math.abs(bestValue) >= DEPTH_INPUT_RELEASE_DEADZONE
      ? bestValue
      : 0;
  }

  function getThumbstickForwardBackForUiController(controllerRay) {
    const targetGamepad = controllerRay?.userData?.inputSource?.gamepad ?? null;
    const value = getForwardBackAxisFromGamepad(targetGamepad);
    return Math.abs(value) >= DEPTH_INPUT_RELEASE_DEADZONE
      ? value
      : 0;
  }

  function getThumbstickForwardBackForUiControllers(controllerRays = []) {
    let bestValue = 0;
    const seen = new Set();

    for (const controllerRay of controllerRays) {
      if (!controllerRay || seen.has(controllerRay)) continue;
      seen.add(controllerRay);
      const value = getThumbstickForwardBackForUiController(controllerRay);
      if (Math.abs(value) > Math.abs(bestValue)) {
        bestValue = value;
      }
    }

    return bestValue;
  }

  return {
    getAnyThumbstickForwardBackForDepth,
    getAnyThumbstickForwardBackForUi,
    getThumbstickForwardBackForUiController,
    getThumbstickForwardBackForUiControllers,
  };
}
