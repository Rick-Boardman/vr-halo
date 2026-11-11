// SPDX-License-Identifier: Apache-2.0
// Device-orientation adapter: phone tilt as two screen-relative axes, with the
// motion-sensor permission asked for correctly and every failure shown.
//
// Extracted from Garbage Can Race's phone-tilt fix (its `tiltAxes`,
// `requestTilt` and `createTilt`), with the ride mapping left behind: this
// module reports degrees, and ./mapping.js turns degrees into axes.
//
// Device constraints this module exists to respect:
// - iOS Safari exposes DeviceOrientationEvent.requestPermission and rejects it
//   unless it is called from an activating user gesture (touchend, click, the
//   pointerup of a touch). A touch pointerdown is NOT activating, so asking
//   there fails with NotAllowedError. `bindGestures` listens only to the
//   activating events.
// - Browsers deliver orientation only in a secure context (https or
//   localhost). Over plain http this module does not ask at all; it says why.
// - Android Chrome has no requestPermission: listening is enough, but some
//   devices never deliver a reading. A quiet sensor is reported after
//   `quietMs` rather than left to look like a broken control.
// - A refused permission cannot be asked again from script: the browser keeps
//   the answer until the player changes the site setting and reloads. It is
//   shown and never retried, silently or otherwise.

const DEG = Math.PI / 180;

function wrapDeg(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

/**
 * Purpose: Gravity in screen axes, from DeviceOrientation's beta and gamma.
 *   Reading the Euler angles straight wraps: near upright gamma jumps from 90
 *   to -90 and beta by 180, so a landscape phone would flip to full deflection.
 *   The gravity vector does not wrap. Down in device axes is
 *   (cosβ·sinγ, −sinβ, −cosβ·cosγ); the screen angle turns device x/y into
 *   screen right/up (90: screen up is device +x).
 * Parameters: { beta, gamma, screenAngle } — degrees; screenAngle is
 *   screen.orientation.angle (0, 90, 180, 270; -90 is read as 270).
 * Return value: { rollDeg, pitchDeg }, NaN for both when beta or gamma is missing:
 *   rollDeg — right edge of the screen down is positive, the same held flat or
 *   upright like a wheel; pitchDeg — top tipped away from the player is
 *   positive. Flat is 0, upright facing the player is −90.
 *   Check: portrait beta 30 gamma 0 → roll 0, pitch −30.
 *          landscape 90 beta 10 gamma −60 → roll 10, pitch ≈ −60.
 * Side effects: none.
 */
export function orientationAxes({ beta, gamma, screenAngle = 0 } = {}) {
  const b = Number(beta);
  const g = Number(gamma);
  if (beta == null || gamma == null || !Number.isFinite(b) || !Number.isFinite(g)) {
    return { rollDeg: NaN, pitchDeg: NaN };
  }
  const angle = ((Math.round(Number(screenAngle) || 0) % 360) + 360) % 360;
  const dx = Math.cos(b * DEG) * Math.sin(g * DEG);
  const dy = -Math.sin(b * DEG);
  const dz = -Math.cos(b * DEG) * Math.cos(g * DEG);
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  const sx = dx * c - dy * s;
  const sy = dx * s + dy * c;
  const rollDeg = Math.asin(Math.max(-1, Math.min(1, sx))) / DEG;
  const pitchDeg = -Math.atan2(-sy, -dz) / DEG;
  return { rollDeg, pitchDeg };
}

/**
 * Default player-facing text. Each is one or two lines (split on "\n") so it
 * fits a status line or a small HUD window. Applications pass their own wording
 * through `messages` (for example to name the fallback control).
 */
export const ORIENTATION_MESSAGES = Object.freeze({
  insecure: "Motion control needs https.\nOpen this page over https to use tilt.",
  unsupported: "This browser has no motion sensor.\nTilt is not available.",
  error: (name) => `Motion permission failed (${name}).\nTap the screen again to allow tilt.`,
  denied: "Motion was refused, so tilt is off.\nAllow motion for this site in the browser settings, then reload.",
  noReadings: "No motion readings came from this device.\nTilt is off.",
});

export const ORIENTATION_LOG = "[halo:orientation]";

function messageSet(messages) {
  return { ...ORIENTATION_MESSAGES, ...(messages || {}) };
}

/**
 * Purpose: Ask for the motion sensor. Call it from an activating gesture
 *   (touchend, click, the pointerup of a touch).
 * Parameters: { orientationEvent, secure, messages } — orientationEvent is
 *   window.DeviceOrientationEvent; secure is window.isSecureContext (only an
 *   explicit false is treated as insecure); messages overrides ORIENTATION_MESSAGES.
 * Return value: Promise of { ok: true } or { ok: false, reason, message, retry }.
 *   reason is "insecure", "unsupported", "error" or "denied". retry is true only
 *   for "error" (typically NotAllowedError: no activation yet), where a later
 *   gesture may still succeed.
 * Side effects: may show the browser's permission prompt. Never asks when insecure.
 */
export async function requestOrientationPermission({ orientationEvent, secure, messages } = {}) {
  const text = messageSet(messages);
  if (secure === false) {
    return { ok: false, reason: "insecure", message: text.insecure, retry: false };
  }
  if (!orientationEvent) {
    return { ok: false, reason: "unsupported", message: text.unsupported, retry: false };
  }
  if (typeof orientationEvent.requestPermission !== "function") return { ok: true };
  let result;
  try {
    result = await orientationEvent.requestPermission();
  } catch (error) {
    const name = error?.name || "Error";
    const message = typeof text.error === "function" ? text.error(name) : String(text.error);
    return { ok: false, reason: "error", message, retry: true };
  }
  if (result === "granted") return { ok: true };
  return { ok: false, reason: "denied", message: text.denied, retry: false };
}

/**
 * Purpose: Listen to device orientation and keep the latest neutral-relative
 *   axes. A failure it shows (no readings yet, a retryable permission error) is
 *   its own, so it takes that note down again when readings arrive after all or
 *   a later attempt succeeds. A status line someone else wrote since is left alone.
 * Parameters:
 *   win — the window (addEventListener, removeEventListener,
 *     DeviceOrientationEvent, isSecureContext, screen.orientation.angle).
 *   status — { get(), set(text) }: where the player sees a failure. Required:
 *     a refused permission must be shown.
 *   calibrate — { roll, pitch } booleans: which axes take the first reading
 *     after enable or resetNeutral() as their zero. Default: pitch only (level
 *     is level for roll; pitch is relative to how the phone is held).
 *   messages — overrides for ORIENTATION_MESSAGES.
 *   quietMs — how long to wait for a first reading before reporting none (2000).
 *   setTimer / clearTimer — injectable timers; log — { info, warn };
 *   logPrefix — greppable log prefix (ORIENTATION_LOG).
 * Return value: { enable, bindGestures, resetNeutral, dispose, axes, reading,
 *   note, state }. axes is { roll, pitch } in degrees relative to the neutral,
 *   wrapped to [-180, 180), or null before the first reading.
 * Side effects: adds a deviceorientation listener once permission is given,
 *   and gesture listeners through bindGestures; dispose() removes all of them.
 */
export function createOrientationInput({
  win,
  status,
  calibrate = { roll: false, pitch: true },
  messages,
  quietMs = 2000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  log = console,
  logPrefix = ORIENTATION_LOG,
} = {}) {
  if (!win || typeof win.addEventListener !== "function") {
    throw new TypeError(`${logPrefix} createOrientationInput needs a window with addEventListener`);
  }
  if (!status || typeof status.get !== "function" || typeof status.set !== "function") {
    throw new TypeError(`${logPrefix} createOrientationInput needs status { get(), set(text) } to show failures`);
  }
  const text = messageSet(messages);
  let axes = null;
  let reading = null;
  let neutralRoll = null;
  let neutralPitch = null;
  let listening = false;
  let asking = false;
  let gaveUp = false;
  let disposed = false;
  let seen = false;
  let note = "";
  let shown = "";
  let timer = null;
  const unbinds = new Set();

  function report(message) {
    note = message;
    shown = message.replace(/\n/g, " ");
    log.warn(`${logPrefix} ${shown}`);
    status.set(shown);
  }

  function clearNote(why) {
    if (!note) return;
    note = "";
    if (status.get() === shown) status.set("");
    shown = "";
    log.info(`${logPrefix} ${why}`);
  }

  function onOrientation(event) {
    const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const raw = orientationAxes({ beta: event?.beta, gamma: event?.gamma, screenAngle: angle });
    if (!Number.isFinite(raw.rollDeg) || !Number.isFinite(raw.pitchDeg)) return;
    seen = true;
    clearNote("readings arrived");
    if (calibrate?.roll && neutralRoll == null) neutralRoll = raw.rollDeg;
    if (calibrate?.pitch && neutralPitch == null) neutralPitch = raw.pitchDeg;
    reading = raw;
    axes = {
      roll: wrapDeg(raw.rollDeg - (neutralRoll ?? 0)),
      pitch: wrapDeg(raw.pitchDeg - (neutralPitch ?? 0)),
    };
  }

  function start() {
    if (listening) return;
    win.addEventListener("deviceorientation", onOrientation);
    listening = true;
    clearNote("permission granted");
    log.info(`${logPrefix} listening`);
    timer = setTimer(() => {
      timer = null;
      if (!seen && !disposed) report(text.noReadings);
    }, quietMs);
  }

  // Call from touchend / click / a touch pointerup, which are activating
  // gestures, or use bindGestures. A refused or impossible permission is not
  // asked again; a retryable error is asked again only on the next call.
  function enable() {
    if (disposed || listening || asking || gaveUp) return Promise.resolve();
    asking = true;
    return requestOrientationPermission({
      orientationEvent: win.DeviceOrientationEvent,
      secure: win.isSecureContext,
      messages: text,
    }).then((answer) => {
      asking = false;
      if (disposed) return;
      if (answer.ok) {
        start();
        return;
      }
      if (!answer.retry) gaveUp = true;
      report(answer.message);
    });
  }

  function bindGestures(target = win, { when = null } = {}) {
    if (disposed) return () => {};
    const types = ["touchend", "click", "pointerup"];
    const handler = (event) => {
      // A mouse pointerup is activating too, but a desktop has no sensor to ask for.
      if (event?.type === "pointerup" && event.pointerType === "mouse") return;
      if (when && !when(event)) return;
      enable();
    };
    for (const type of types) target.addEventListener(type, handler, { capture: true });
    const unbind = () => {
      if (!unbinds.delete(unbind)) return;
      for (const type of types) target.removeEventListener(type, handler, { capture: true });
    };
    unbinds.add(unbind);
    return unbind;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (listening) win.removeEventListener("deviceorientation", onOrientation);
    listening = false;
    if (timer != null) clearTimer(timer);
    timer = null;
    for (const unbind of [...unbinds]) unbind();
    clearNote("disposed");
    axes = null;
    reading = null;
  }

  return {
    enable,
    bindGestures,
    // The next reading becomes the neutral for the calibrated axes, for example
    // how the phone is held when a hill starts.
    resetNeutral() {
      neutralRoll = null;
      neutralPitch = null;
    },
    dispose,
    get axes() {
      return axes;
    },
    get reading() {
      return reading;
    },
    get note() {
      return note;
    },
    // "idle", "asking", "listening", "blocked" (refused, insecure or
    // unsupported: not asked again) or "disposed".
    get state() {
      if (disposed) return "disposed";
      if (listening) return "listening";
      if (asking) return "asking";
      if (gaveUp) return "blocked";
      return "idle";
    },
  };
}
