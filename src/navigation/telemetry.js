// SPDX-License-Identifier: Apache-2.0
const VR_STATE_LOG_INTERVAL_MS = 2000;
const VR_INPUT_LOG_INTERVAL_MS = 500;

function formatFixed(value, digits) {
  return Number(value).toFixed(digits);
}

function formatVector3(vector, digits) {
  return [
    formatFixed(vector?.x, digits),
    formatFixed(vector?.y, digits),
    formatFixed(vector?.z, digits),
  ];
}

/**
 * Create the shared navigation telemetry adapter used by walkabout runtime logging.
 * Purpose: centralize throttled VR navigation telemetry emission so walkabout navigation code can report state, movement, look input, and lifecycle events through an optional remote logger without embedding logging policy throughout the movement code.
 * @param {object} [options={}] Telemetry adapter configuration.
 * @param {{log?: (event: string, data: any) => void}} [options.remoteLogger] Optional remote logger whose `log(event, data)` method receives emitted telemetry events.
 * @param {Window} [options.windowRef=globalThis.window] Window-like reference used for lifecycle metadata such as the current location.
 * @param {Navigator} [options.navigatorRef=globalThis.navigator] Navigator-like reference used for lifecycle metadata such as the user agent string.
 * @returns {{logVrState: (state: {blocked: string, enabled: boolean, overUi: boolean, yaw: number, pitch: number, roll: number, now?: number}) => void, logVrMove: (move: {sx: number, sy: number, move: any, forward: any, right: any, position: any, now?: number}) => void, logVrLook: (look: {hasStick: boolean, hasTwist: boolean, yawIn: number, pitchIn: number, rollIn: number, yaw: number, pitch: number, roll: number, now?: number}) => void, logVrLifecycle: (lifecycle: {presenting: boolean, baseCamPos: any, xrCamPos: any, xrPivotPos: any}) => void}} Telemetry adapter exposing throttled VR state, movement, look, and lifecycle logging functions.
 * Side effects: caches timestamps and signatures to throttle repeated telemetry, formats numeric payloads for logging, and forwards emitted events to `remoteLogger.log(...)` when a compatible logger is supplied.
 */
export function createNavigationTelemetryAdapter({
  remoteLogger,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
} = {}) {
  const logger = remoteLogger && typeof remoteLogger.log === "function" ? remoteLogger : null;

  let lastVrStateLogMs = 0;
  let lastVrStateSignature = "";
  let lastVrMoveLogMs = 0;
  let lastVrLookLogMs = 0;

  function logEvent(event, data) {
    try {
      logger?.log?.(event, data);
    } catch {
      // no-op
    }
  }

  function logVrState({ blocked, enabled, overUi, yaw, pitch, roll, now = Date.now() }) {
    if (!logger) return;

    const signature = `${blocked}|en=${enabled ? 1 : 0}|ui=${overUi ? 1 : 0}`;
    if (
      signature === lastVrStateSignature &&
      now - lastVrStateLogMs <= VR_STATE_LOG_INTERVAL_MS
    ) {
      return;
    }

    lastVrStateSignature = signature;
    lastVrStateLogMs = now;

    logEvent("vr_nav_state", {
      blocked,
      enabled,
      overUi,
      yaw: formatFixed(yaw, 3),
      pitch: formatFixed(pitch, 3),
      roll: formatFixed(roll, 3),
    });
  }

  function logVrMove({
    sx,
    sy,
    move,
    forward,
    right,
    position,
    now = Date.now(),
  }) {
    if (!logger || now - lastVrMoveLogMs <= VR_INPUT_LOG_INTERVAL_MS) return;

    lastVrMoveLogMs = now;

    logEvent("vr_move", {
      sx: formatFixed(sx, 3),
      sy: formatFixed(sy, 3),
      move: formatVector3(move, 3),
      forward: formatVector3(forward, 3),
      right: formatVector3(right, 3),
      pos: formatVector3(position, 2),
    });
  }

  function logVrLook({
    hasStick,
    hasTwist,
    yawIn,
    pitchIn,
    rollIn,
    yaw,
    pitch,
    roll,
    now = Date.now(),
  }) {
    if (!logger || (!hasStick && !hasTwist) || now - lastVrLookLogMs <= VR_INPUT_LOG_INTERVAL_MS) {
      return;
    }

    lastVrLookLogMs = now;

    logEvent("vr_look", {
      yawIn: formatFixed(yawIn, 3),
      pitchIn: formatFixed(pitchIn, 3),
      rollIn: formatFixed(rollIn, 3),
      yaw: formatFixed(yaw, 3),
      pitch: formatFixed(pitch, 3),
      roll: formatFixed(roll, 3),
    });
  }

  function logVrLifecycle({ presenting, baseCamPos, xrCamPos, xrPivotPos }) {
    if (!logger) return;

    logEvent(presenting ? "vr_enter" : "vr_exit", {
      href: String(windowRef?.location?.href || ""),
      ua: String(navigatorRef?.userAgent || ""),
      baseCamPos,
      xrCamPos,
      xrPivotPos,
    });
  }

  return {
    logVrState,
    logVrMove,
    logVrLook,
    logVrLifecycle,
  };
}
