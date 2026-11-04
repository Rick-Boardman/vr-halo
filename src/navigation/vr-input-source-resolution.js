// SPDX-License-Identifier: Apache-2.0
// VR input-source resolution: stick axis detection, handedness inference,
// and gamepad lookup for WebXR controllers.
//
// Extracted from scene-navigation.js to keep navigation logic focused
// on locomotion and look, while this module owns the XR input plumbing.

/**
 * Create a VR input-source resolution helper.
 *
 * @param {object} deps
 * @param {{ xr: { getSession?: () => unknown, getFrame?: () => unknown, getReferenceSpace?: () => unknown } }} deps.renderer
 * @param {number} deps.vrDeadzone
 * @returns {{ getXrSessionInputSources: Function, getInputSourceByHandedness: Function, getGamepadByHandedness: Function, getBestStickAxesFromGamepad: Function, getFallbackGamepadsInOrder: Function, getStickAxesForHand: Function }}
 */
export function createVrInputSourceResolution({ renderer, vrDeadzone }) {
  const _handednessByGamepad = new WeakMap();
  const _stickPairByGamepad = new WeakMap();

  function getXrSessionInputSources() {
    const session = renderer.xr.getSession?.();
    if (!session) return [];
    const sources = session.inputSources;
    const arr = sources ? Array.from(sources) : [];
    try {
      for (const s of arr) {
        if (s?.gamepad) _handednessByGamepad.set(s.gamepad, String(s.handedness || ""));
      }
    } catch {
      // no-op
    }
    return arr;
  }

  function _inferHandednessFromPoseX(sources) {
    const frame = renderer.xr.getFrame?.();
    const refSpace = renderer.xr.getReferenceSpace?.();
    if (!frame || !refSpace || !sources || sources.length < 2) return;

    const poses = [];
    for (const s of sources) {
      const gp = s?.gamepad;
      if (!gp) continue;
      // Only infer when the runtime doesn't tell us.
      if (String(s?.handedness || "")) continue;

      const space = s?.gripSpace || s?.targetRaySpace;
      if (!space) continue;

      let pose = null;
      try {
        pose = frame.getPose(space, refSpace);
      } catch {
        pose = null;
      }
      if (!pose?.transform?.position) continue;
      const x = Number(pose.transform.position.x);
      if (!Number.isFinite(x)) continue;
      poses.push({ gp, x });
    }

    if (poses.length < 2) return;
    poses.sort((a, b) => a.x - b.x);

    const left = poses[0];
    const right = poses[poses.length - 1];
    if (!left?.gp || !right?.gp || left.gp === right.gp) return;

    // Only accept if they are clearly separated in X (avoid ambiguity if the
    // pose data is missing/garbage).
    const sep = Number(right.x) - Number(left.x);
    if (!Number.isFinite(sep) || sep < 0.06) return; // ~6cm

    try {
      _handednessByGamepad.set(left.gp, "left");
      _handednessByGamepad.set(right.gp, "right");
    } catch {
      // no-op
    }
  }

  // Stick axis selection:
  // Different WebXR runtimes/controllers can expose the primary stick on axes (0,1)
  // or (2,3). Picking "largest magnitude" per-frame can switch pairs mid-move
  // (noise), and hard-coding indices can be wrong on some devices.
  // Strategy: when we first observe a decisive stick movement, lock that pair
  // for the lifetime of the gamepad object.

  function _getOrDetectStickPair(gamepad, lockThreshold = 0.35, preferThreshold = 0.15) {
    if (!gamepad) return null;
    const axes = gamepad.axes;
    if (!axes || axes.length < 2) return null;

    const locked = _stickPairByGamepad.get(gamepad);
    if (locked && Number.isFinite(locked.ix) && Number.isFinite(locked.iy)) return locked;

    const pairs = [];
    if (axes.length >= 2) pairs.push({ ix: 0, iy: 1 });
    if (axes.length >= 4) pairs.push({ ix: 2, iy: 3 });

    // Stable default before lock to avoid drift from tiny noise on a secondary pair.
    // Quest Touch commonly reports the primary stick as axes[0]/axes[1].
    const defaultPair = pairs.length ? pairs[0] : null;

    let best = null;
    let bestMag = 0;
    for (const p of pairs) {
      const x = Number(axes[p.ix] ?? 0);
      const y = Number(axes[p.iy] ?? 0);
      const mag = Math.hypot(x, y);
      if (mag > bestMag) {
        bestMag = mag;
        best = p;
      }
    }

    if (best && bestMag >= lockThreshold) {
      _stickPairByGamepad.set(gamepad, best);
      return best;
    }

    // If we can clearly see which pair the user is moving (but not enough to
    // permanently lock), prefer that pair so small movements don't appear dead
    // on devices where the primary stick is on axes[2]/axes[3].
    if (best && bestMag >= preferThreshold) {
      return best;
    }

    // Not enough signal to lock yet; keep a stable default.
    return defaultPair;
  }

  function getBestStickAxesFromGamepad(gamepad) {
    const axes = gamepad?.axes;
    if (!axes || axes.length < 2) return null;

    // Use deadzone as a "decisive" movement threshold (a bit above it) to lock.
    const lockThreshold = Math.min(0.95, Math.max(0.15, vrDeadzone + 0.15));
    const preferThreshold = Math.min(0.95, Math.max(0.12, vrDeadzone + 0.03));
    const pair = _getOrDetectStickPair(gamepad, lockThreshold, preferThreshold);
    if (!pair) return null;
    return { x: axes[pair.ix] ?? 0, y: axes[pair.iy] ?? 0 };
  }

  function getGamepadByHandedness(handedness) {
    const sources = getXrSessionInputSources();
    for (const s of sources) {
      if (!s?.gamepad) continue;
      if (s.handedness === handedness) return s.gamepad;
    }

    // Pose-based deterministic fallback when both handedness and gamepad.id are blank.
    // Uses the controller pose X (left/right of the reference space origin).
    try {
      _inferHandednessFromPoseX(sources);
      for (const s of sources) {
        const gp = s?.gamepad;
        if (!gp) continue;
        if (_handednessByGamepad.get(gp) === handedness) return gp;
      }
    } catch {
      // no-op
    }

    // Deterministic fallback when some runtimes leave XRInputSource.handedness empty:
    // use the gamepad id string if it explicitly contains "left"/"right".
    // IMPORTANT: never guess based on ordering.
    const want = String(handedness || "").toLowerCase();
    if (want === "left" || want === "right") {
      for (const s of sources) {
        const gp = s?.gamepad;
        if (!gp) continue;
        const id = String(gp.id || "");
        if (!id) continue;
        const idLower = id.toLowerCase();
        if (want === "left" && /\bleft\b/.test(idLower)) return gp;
        if (want === "right" && /\bright\b/.test(idLower)) return gp;
      }
    }

    return null;
  }

  function getInputSourceByHandedness(handedness) {
    const want = String(handedness || "");
    const sources = getXrSessionInputSources();
    for (const s of sources) {
      if (!s?.gamepad) continue;
      if (s.handedness === want) return s;
    }

    // Pose-based deterministic fallback when handedness is missing.
    try {
      _inferHandednessFromPoseX(sources);
      for (const s of sources) {
        const gp = s?.gamepad;
        if (!gp) continue;
        if (_handednessByGamepad.get(gp) === want) return s;
      }
    } catch {
      // no-op
    }

    return null;
  }

  function getFallbackGamepadsInOrder() {
    const sources = getXrSessionInputSources();
    const gps = [];
    for (const s of sources) {
      if (s?.gamepad) gps.push(s.gamepad);
    }
    return gps;
  }

  function getStickAxesForHand(handedness, fallbackIndex) {
    const gp = getGamepadByHandedness(handedness);
    if (gp) return getBestStickAxesFromGamepad(gp);

    // IMPORTANT: Do not guess based on inputSources ordering.
    // Order can differ across scenes/apps, which would swap left/right behavior.
    return null;
  }

  return {
    getXrSessionInputSources,
    getInputSourceByHandedness,
    getGamepadByHandedness,
    getBestStickAxesFromGamepad,
    getFallbackGamepadsInOrder,
    getStickAxesForHand,
    getStickPairForGamepad: _getOrDetectStickPair,
    getHandednessForGamepad: (gp) => _handednessByGamepad.get(gp) || "",
  };
}
