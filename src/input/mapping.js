// SPDX-License-Identifier: Apache-2.0
// Configurable axis and action mapping over Halo's device adapters.
//
// The application names its axes (for example steer and throttle) and its
// actions (for example jump), and says per device how each reads: which keys,
// which stick axis, which hand or tilt axis, with an offset, scale, sign and
// deadzone. One device supplies all the axes in a frame, chosen by an ordered
// precedence list, so a stray reading from a second device cannot fight the
// first. Actions are read from every device.
//
// What a value means (acceleration, ejection, sensitivity, response curves) is
// the application's: Halo maps linearly and clamps, nothing more.

import { anyKeyDown, keyAxis } from "./keyboard.js";
import { buttonDown } from "./sticks.js";

export const INPUT_SOURCES = Object.freeze(["keys", "stick", "hands", "orientation"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Purpose: One device reading to one axis value: ((value + offset) * scale),
 *   negated when invert, clamped to [min, max], then zero inside the deadzone.
 * Parameters: value — the device reading; spec — { offset = 0, scale = 1,
 *   invert = false, deadzone = 0, min = -1, max = 1 }.
 * Return value: a finite number; 0 for a missing or non-finite reading.
 * Side effects: none.
 */
export function mapAxis(value, { offset = 0, scale = 1, invert = false, deadzone = 0, min = -1, max = 1 } = {}) {
  const v = Number(value);
  if (value == null || !Number.isFinite(v)) return 0;
  let out = (v + offset) * scale;
  if (invert) out = -out;
  out = clamp(out, min, max);
  return Math.abs(out) < deadzone ? 0 : out;
}

const DEVICE_AXES = {
  stick: ["x", "y"],
  hands: ["split", "drop"],
  orientation: ["roll", "pitch"],
};

function validate({ axes, actions, precedence }) {
  for (const [name, devices] of Object.entries(axes)) {
    for (const [device, spec] of Object.entries(devices || {})) {
      if (!INPUT_SOURCES.includes(device)) {
        throw new TypeError(`[halo:input] axis "${name}" names unknown device "${device}"`);
      }
      if (device !== "keys" && !DEVICE_AXES[device].includes(spec?.axis)) {
        throw new TypeError(`[halo:input] axis "${name}" ${device}.axis must be one of ${DEVICE_AXES[device].join(", ")}`);
      }
    }
  }
  for (const [name, spec] of Object.entries(actions)) {
    for (const key of Object.keys(spec || {})) {
      if (key !== "keys" && key !== "buttons") {
        throw new TypeError(`[halo:input] action "${name}" has unknown field "${key}" (keys, buttons)`);
      }
    }
  }
  for (const entry of precedence) {
    const source = typeof entry === "string" ? entry : entry?.source;
    if (!INPUT_SOURCES.includes(source)) {
      throw new TypeError(`[halo:input] precedence names unknown device "${source}"`);
    }
    for (const other of (typeof entry === "string" ? [] : entry.yieldTo || [])) {
      if (!INPUT_SOURCES.includes(other)) {
        throw new TypeError(`[halo:input] ${source}.yieldTo names unknown device "${other}"`);
      }
    }
  }
}

/**
 * Purpose: Build a reader that maps device readings to named axes and actions.
 * Parameters:
 *   axes — { [axisName]: { keys?: { negative, positive, ...mapAxis spec },
 *     stick?: { axis: "x"|"y", ...spec }, hands?: { axis: "split"|"drop", ...spec },
 *     orientation?: { axis: "roll"|"pitch", ...spec } } }.
 *   actions — { [actionName]: { keys?: string[], buttons?: number[] } }.
 *   precedence — ordered devices; the first that is present (and, for an entry
 *     { source, yieldTo: [...] }, while none of those devices is active) supplies
 *     every axis. Default ["hands", "stick", "orientation", "keys"].
 * Return value: { read(frame) } where frame is { keys, stick, hands,
 *   orientation, sources } — keys a Set or record of held keys, stick { x, y }
 *   (raw, forward is negative y), hands from handsAxes(), orientation the
 *   `axes` of createOrientationInput, sources the XR input sources for
 *   buttons. A device that is null or absent is not present. read returns
 *   { axes: { [name]: number }, actions: { [name]: boolean }, source } where
 *   source is the device that supplied the axes, or null.
 * Side effects: none; throws TypeError on an unknown device or axis.
 */
export function createInputMapping({ axes = {}, actions = {}, precedence = ["hands", "stick", "orientation", "keys"] } = {}) {
  validate({ axes, actions, precedence });
  const axisNames = Object.keys(axes);
  const order = precedence.map((entry) => (typeof entry === "string" ? { source: entry, yieldTo: [] } : { source: entry.source, yieldTo: entry.yieldTo || [] }));

  function readDevice(device, frame) {
    const input = frame?.[device];
    if (input == null) return null;
    const out = {};
    let active = false;
    for (const name of axisNames) {
      const spec = axes[name]?.[device];
      let value = 0;
      if (spec) {
        value = device === "keys"
          ? mapAxis(keyAxis(input, spec), spec)
          : mapAxis(input[spec.axis], spec);
      }
      out[name] = value;
      if (value !== 0) active = true;
    }
    return { axes: out, active };
  }

  function read(frame = {}) {
    const readings = {};
    const reading = (device) => {
      if (!(device in readings)) readings[device] = readDevice(device, frame);
      return readings[device];
    };
    let chosen = null;
    let source = null;
    for (const { source: device, yieldTo } of order) {
      const r = reading(device);
      if (!r) continue;
      if (yieldTo.some((other) => reading(other)?.active)) continue;
      chosen = r;
      source = device;
      break;
    }
    const outAxes = {};
    for (const name of axisNames) outAxes[name] = chosen ? chosen.axes[name] : 0;
    const outActions = {};
    for (const [name, spec] of Object.entries(actions)) {
      let down = !!frame.keys && anyKeyDown(frame.keys, spec?.keys);
      if (!down && frame.sources) down = (spec?.buttons || []).some((index) => buttonDown(frame.sources, index));
      outActions[name] = down;
    }
    return { axes: outAxes, actions: outActions, source };
  }

  return { read };
}
