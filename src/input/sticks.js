// SPDX-License-Identifier: Apache-2.0
// Thumbstick and button adapters for WebXR input sources.
//
// Extracted from Garbage Can Race's input module, where these readers were
// tuned against Quest controllers. They report raw stick axes in WebXR's
// convention (x right is positive, stick forward is NEGATIVE y); the axis
// mapping in ./mapping.js applies the application's sign, deadzone and scale.

function stickMag(axes, index) {
  return Math.hypot(Number(axes[index]) || 0, Number(axes[index + 1]) || 0);
}

/**
 * Purpose: Choose which axis pair of a gamepad is the thumbstick.
 *   Quest may put the thumbstick on axes 0,1 or 2,3. The first decisive push
 *   (magnitude >= 0.35) locks the pair. A locked pair that has gone quiet
 *   (< 0.15) yields to a decisive push on the other pair, so a stale lock cannot
 *   hide the stick.
 * Parameters: axes — gamepad.axes; locked — the pair index locked so far (0, 2 or null).
 * Return value: { index, lock } where lock says the caller should store index,
 *   or null when the gamepad has fewer than two axes.
 * Side effects: none.
 */
export function stickPair(axes, locked = null) {
  if (!axes || axes.length < 2) return null;
  const choices = axes.length >= 4 ? [0, 2] : [0];
  if ((locked === 0 || locked === 2) && choices.includes(locked)) {
    const lockedMag = stickMag(axes, locked);
    let other = null;
    let otherMag = -1;
    for (const index of choices) {
      if (index === locked) continue;
      const mag = stickMag(axes, index);
      if (mag > otherMag) {
        otherMag = mag;
        other = index;
      }
    }
    if (other != null && lockedMag < 0.15 && otherMag >= 0.35) {
      return { index: other, lock: true };
    }
    return { index: locked, lock: false };
  }
  let best = 0;
  let bestMag = -1;
  for (const index of choices) {
    const mag = stickMag(axes, index);
    if (mag > bestMag) {
      bestMag = mag;
      best = index;
    }
  }
  if (axes.length < 4) return { index: 0, lock: false };
  if (bestMag >= 0.35) return { index: best, lock: true };
  if (bestMag >= 0.15) return { index: best, lock: false };
  return { index: 0, lock: false };
}

function handInId(id, handedness) {
  const text = String(id || "").toLowerCase();
  if (!text) return false;
  if (handedness === "left") return /\bleft\b/.test(text);
  if (handedness === "right") return /\bright\b/.test(text);
  return false;
}

function poseHands(sources, poseX) {
  if (!poseX) return null;
  const posed = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (String(source?.handedness || "")) continue;
    if (!source?.gamepad?.axes || source.gamepad.axes.length < 2) continue;
    const x = Number(poseX[i]);
    if (!Number.isFinite(x)) continue;
    posed.push({ source, x });
  }
  if (posed.length < 2) return null;
  posed.sort((a, b) => a.x - b.x);
  const left = posed[0];
  const right = posed[posed.length - 1];
  if (left.source.gamepad === right.source.gamepad) return null;
  if (!(right.x - left.x >= 0.06)) return null;
  return { left: left.source, right: right.source };
}

function readLockedStick(gamepad, locks) {
  const pair = stickPair(gamepad.axes, locks?.get?.(gamepad) ?? null);
  if (!pair) return null;
  if (pair.lock) locks?.set?.(gamepad, pair.index);
  const x = Number(gamepad.axes[pair.index]);
  const y = Number(gamepad.axes[pair.index + 1]);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function loudestStick(gamepads, locks) {
  let best = null;
  let bestMag = -1;
  const seen = new Set();
  for (const gamepad of gamepads) {
    if (!gamepad || seen.has(gamepad)) continue;
    seen.add(gamepad);
    const reading = readLockedStick(gamepad, locks);
    if (!reading) continue;
    const mag = Math.hypot(reading.x, reading.y);
    if (mag > bestMag) {
      bestMag = mag;
      best = reading;
    }
  }
  return best ? { reading: best, mag: bestMag } : null;
}

/**
 * Purpose: Read one hand's thumbstick from the session's input sources.
 *   Handedness first, then the gamepad id, then pose X when the runtime leaves
 *   the hand blank. Two pads for one hand: the one actually deflected wins, so
 *   a quiet duplicate cannot hide the stick.
 * Parameters: sources — XRSession.inputSources (or an array); handedness —
 *   "left" or "right"; poseX — optional array of each source's grip x in the
 *   reference space, index-aligned with sources (null entries allowed);
 *   locks — optional WeakMap the caller keeps across frames for the pair lock.
 * Return value: { x, y } raw axes (forward is negative y), or null.
 * Side effects: writes the pair lock into `locks`.
 */
export function stickFromSources(sources, handedness, poseX = null, locks = null) {
  const list = Array.from(sources || []);
  if (handedness !== "left" && handedness !== "right") return null;
  const pads = (pred) => {
    const found = [];
    for (const source of list) {
      if (!pred(source)) continue;
      const gamepad = source?.gamepad;
      if (!gamepad?.axes || gamepad.axes.length < 2) continue;
      found.push(gamepad);
    }
    return found;
  };
  let best = loudestStick(pads((source) => source?.handedness === handedness), locks);
  if (best && best.mag >= 0.15) return best.reading;
  const byId = loudestStick(pads((source) => handInId(source?.gamepad?.id, handedness)), locks);
  if (byId && byId.mag > (best?.mag ?? -1)) best = byId;
  if (best && best.mag >= 0.15) return best.reading;
  const inferred = poseHands(list, poseX);
  if (inferred?.[handedness]?.gamepad) {
    const fromPose = loudestStick([inferred[handedness].gamepad], locks);
    if (fromPose && fromPose.mag > (best?.mag ?? -1)) best = fromPose;
  }
  return best ? best.reading : null;
}

/**
 * Purpose: Whether a gamepad button is pressed on any input source.
 *   On Quest, button 4 is A (right) or X (left). Button 0 is the trigger, which
 *   Halo's HUD uses as its pointer, so applications rarely map it to an action.
 * Parameters: sources — XR input sources; index — the button index.
 * Return value: boolean.
 * Side effects: none.
 */
export function buttonDown(sources, index) {
  if (!sources) return false;
  for (const source of sources) {
    if (source?.gamepad?.buttons?.[index]?.pressed) return true;
  }
  return false;
}
