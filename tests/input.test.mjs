import assert from "node:assert/strict";
import test from "node:test";

import {
  anyKeyDown,
  buttonDown,
  createInputMapping,
  createOrientationInput,
  handsAxes,
  keyAxis,
  mapAxis,
  ORIENTATION_LOG,
  ORIENTATION_MESSAGES,
  orientationAxes,
  requestOrientationPermission,
  stickFromSources,
  stickPair,
} from "../src/input/index.js";

const DEG = Math.PI / 180;

// What a browser reports for a phone held at `pitch` (top tipped away, degrees)
// and `roll` (right edge of the screen down, degrees) with the screen turned to
// `screenAngle`. Beta is in [-180, 180) and gamma in [-90, 90), as the spec
// gives them, so a pose past upright wraps the way a real phone does.
function reading(pitch, roll, screenAngle) {
  const sx = Math.sin(roll * DEG);
  const sy = Math.cos(roll * DEG) * Math.sin(pitch * DEG);
  const dz = -Math.cos(roll * DEG) * Math.cos(pitch * DEG);
  const c = Math.cos(screenAngle * DEG);
  const s = Math.sin(screenAngle * DEG);
  const dx = sx * c + sy * s;
  const dy = -sx * s + sy * c;
  const gamma = Math.atan(dx / -dz) / DEG;
  const beta = Math.atan2(-dy, -dz / Math.cos(gamma * DEG)) / DEG;
  return { beta, gamma, screenAngle };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}

// Garbage Can Race's ride mapping, written as configuration. The numbers are
// the game's; the test proves the mapping reproduces its proven behaviour.
const RIDE = {
  axes: {
    steer: {
      keys: { negative: ["A"], positive: ["D"] },
      stick: { axis: "x", deadzone: 0.18 },
      hands: { axis: "split", scale: 1 / 0.22, deadzone: 0.08 },
      orientation: { axis: "roll", scale: 1 / 24, deadzone: 0.07 },
    },
    throttle: {
      keys: { negative: ["S"], positive: ["W", "Shift"] },
      stick: { axis: "y", invert: true, deadzone: 0.18 },
      hands: { axis: "drop", offset: -0.32, scale: 1 / 0.28, deadzone: 0.06 },
      orientation: { axis: "pitch", scale: 1 / 22, deadzone: 0.07 },
    },
  },
  actions: { jump: { keys: [" ", "Space"], buttons: [4] } },
};

test("orientation axes follow the screen at every screen angle", () => {
  const poses = [
    [0, 0], [-30, 0], [20, 0], [0, 25], [0, -25],
    [-45, 15], [-70, -20], [10, 30], [-85, 10],
  ];
  for (const angle of [0, 90, 180, 270]) {
    for (const [pitch, roll] of poses) {
      const axes = orientationAxes(reading(pitch, roll, angle));
      near(axes.rollDeg, roll, `angle ${angle} pitch ${pitch} roll ${roll} roll`);
      near(axes.pitchDeg, pitch, `angle ${angle} pitch ${pitch} roll ${roll} pitch`);
    }
  }
});

test("orientation axes match raw readings in portrait and landscape", () => {
  const portrait = orientationAxes({ beta: 30, gamma: 0, screenAngle: 0 });
  near(portrait.rollDeg, 0, "portrait roll");
  near(portrait.pitchDeg, -30, "portrait pitch");
  near(orientationAxes({ beta: 0, gamma: 20, screenAngle: 0 }).rollDeg, 20, "portrait right edge down");
  // Landscape 90: the device top is on the left, so screen right is the device bottom.
  near(orientationAxes({ beta: 20, gamma: 0, screenAngle: 90 }).rollDeg, 20, "landscape 90 roll");
  near(orientationAxes({ beta: 0, gamma: 15, screenAngle: 90 }).pitchDeg, 15, "landscape 90 top away");
  near(orientationAxes({ beta: 20, gamma: 0, screenAngle: 270 }).rollDeg, -20, "landscape 270 roll");
  near(orientationAxes({ beta: 20, gamma: 0, screenAngle: -90 }).rollDeg, -20, "-90 is 270");
  near(orientationAxes({ beta: -10, gamma: 0, screenAngle: 180 }).pitchDeg, -10, "portrait 180 pitch");
});

test("a landscape phone held past upright does not flip the roll", () => {
  const before = reading(-88, 5, 90);
  const after = reading(-92, 5, 90);
  assert.ok(Math.abs(before.beta - after.beta) > 90 || Math.abs(before.gamma - after.gamma) > 90, "the reading should wrap");
  const a = orientationAxes(before);
  const b = orientationAxes(after);
  near(a.rollDeg, 5, "before roll");
  near(b.rollDeg, 5, "after roll");
  assert.ok(Math.abs(a.pitchDeg - b.pitchDeg) < 4.01, `pitch jumped ${a.pitchDeg} → ${b.pitchDeg}`);
});

test("a reading without beta or gamma is no orientation", () => {
  const axes = orientationAxes({ beta: null, gamma: null, screenAngle: 0 });
  assert.ok(Number.isNaN(axes.rollDeg) && Number.isNaN(axes.pitchDeg));
  assert.equal(mapAxis(Number.NaN, { scale: 2 }), 0);
});

test("mapAxis offsets, scales, inverts, clamps, then applies the deadzone", () => {
  assert.equal(mapAxis(0.5, { scale: 4 }), 1);
  assert.equal(mapAxis(0.5, { scale: 4, invert: true }), -1);
  near(mapAxis(0.46, { offset: -0.32, scale: 1 / 0.28 }), 0.5, "offset");
  assert.equal(mapAxis(0.01, { scale: 1, deadzone: 0.05 }), 0);
  assert.equal(mapAxis(3, { min: 0, max: 2 }), 2);
  assert.equal(mapAxis(undefined), 0);
});

test("keys: opposite keys cancel; a Set and a record read the same", () => {
  assert.equal(keyAxis(new Set(["A"]), { negative: ["A"], positive: ["D"] }), -1);
  assert.equal(keyAxis(new Set(["A", "D"]), { negative: ["A"], positive: ["D"] }), 0);
  assert.equal(keyAxis({ W: true, Shift: true }, { negative: ["S"], positive: ["W", "Shift"] }), 1);
  assert.equal(anyKeyDown(new Set([" "]), [" ", "Space"]), true);
  assert.equal(anyKeyDown(null, ["W"]), false);
});

test("hands: split and drop from controller and head heights", () => {
  assert.equal(handsAxes({ leftY: 1, rightY: 1.1, headY: Number.NaN }), null);
  const axes = handsAxes({ leftY: 1.0, rightY: 1.22, headY: 1.6 });
  near(axes.split, -0.22, "split");
  near(axes.drop, 0.49, "drop");
  const ride = createInputMapping({ ...RIDE, precedence: ["hands"] }).read({ hands: axes });
  near(ride.axes.steer, -1, "left hand lower steers left");
  assert.ok(ride.axes.throttle > 0.6, `hands below the head speed up: ${ride.axes.throttle}`);
});

test("mapped axes from tilt from the neutral hold match the game's ride", () => {
  const map = createInputMapping({ ...RIDE, precedence: ["orientation"] });
  const neutral = orientationAxes(reading(-40, 0, 90)).pitchDeg;
  const tiltFrom = (pose) => {
    const raw = orientationAxes(pose);
    return { roll: raw.rollDeg, pitch: raw.pitchDeg - neutral };
  };
  for (const angle of [0, 90, 180, 270]) {
    const right = map.read({ orientation: tiltFrom(reading(-40, 24, angle)) });
    assert.ok(right.axes.steer > 0.99, `angle ${angle} steer ${right.axes.steer}`);
    assert.equal(right.axes.throttle, 0);
    assert.equal(right.source, "orientation");
    assert.ok(map.read({ orientation: tiltFrom(reading(-18, 0, angle)) }).axes.throttle > 0.99, `angle ${angle} tip away`);
    assert.ok(map.read({ orientation: tiltFrom(reading(-62, 0, angle)) }).axes.throttle < -0.99, `angle ${angle} tip back`);
    assert.ok(map.read({ orientation: tiltFrom(reading(-40, -12, angle)) }).axes.steer < -0.4, `angle ${angle} left`);
  }
});

test("precedence: hands, then tilt unless a key is held on a desktop, then keys", () => {
  const desktop = createInputMapping({ ...RIDE, precedence: ["hands", { source: "orientation", yieldTo: ["keys"] }, "keys"] });
  const phone = createInputMapping({ ...RIDE, precedence: ["hands", "orientation", "keys"] });
  const tilt = { roll: 12, pitch: 0 };
  const hands = handsAxes({ leftY: 1.2, rightY: 1.0, headY: 1.6 });
  const held = new Set(["A"]);

  assert.equal(desktop.read({ hands, orientation: tilt, keys: held }).source, "hands");
  const stray = desktop.read({ orientation: tilt, keys: held });
  assert.equal(stray.source, "keys", "a held key beats a stray orientation event on a desktop");
  assert.equal(stray.axes.steer, -1);
  assert.equal(desktop.read({ orientation: tilt, keys: new Set() }).source, "orientation");
  assert.equal(phone.read({ orientation: tilt, keys: held }).source, "orientation", "a phone wants tilt even with a key down");
  const none = desktop.read({});
  assert.equal(none.source, null);
  assert.deepEqual(none.axes, { steer: 0, throttle: 0 });
});

test("actions read every device; the trigger is not the jump", () => {
  const map = createInputMapping(RIDE);
  assert.equal(map.read({ keys: new Set([" "]) }).actions.jump, true);
  const a = { gamepad: { buttons: [{ pressed: false }, {}, {}, {}, { pressed: true }] } };
  const trigger = { gamepad: { buttons: [{ pressed: true }] } };
  assert.equal(map.read({ sources: [a] }).actions.jump, true);
  assert.equal(map.read({ sources: [trigger], keys: new Set() }).actions.jump, false);
  assert.equal(buttonDown([trigger], 0), true);
});

test("a mapping with an unknown device or axis fails loudly", () => {
  assert.throws(() => createInputMapping({ axes: { steer: { mouse: {} } } }), /unknown device "mouse"/);
  assert.throws(() => createInputMapping({ axes: { steer: { stick: { axis: "z" } } } }), /stick\.axis/);
  assert.throws(() => createInputMapping({ precedence: ["gaze"] }), /unknown device "gaze"/);
  assert.throws(() => createInputMapping({ actions: { jump: { button: 4 } } }), /unknown field "button"/);
});

test("stick pair: the first decisive push locks; a quiet lock yields", () => {
  assert.deepEqual(stickPair([0, 0, 0, -0.9], null), { index: 2, lock: true });
  assert.deepEqual(stickPair([0, 0, 0, 0.2], null), { index: 2, lock: false });
  assert.deepEqual(stickPair([0.5, 0, 0, 0], 2), { index: 0, lock: true });
  assert.deepEqual(stickPair([0.1, 0, 0, 0.3], 2), { index: 2, lock: false });
  assert.equal(stickPair([0]), null);

  const locks = new WeakMap();
  const pad = { axes: [0, 0, 0.1, -0.8] };
  const sources = [{ handedness: "left", gamepad: pad }];
  assert.deepEqual(stickFromSources(sources, "left", null, locks), { x: 0.1, y: -0.8 });
  assert.equal(locks.get(pad), 2);
  // Blank handedness: pose x decides which pad is the left hand.
  const l = { axes: [0, 0, 0.6, 0] };
  const r = { axes: [0, 0, -0.6, 0] };
  const blank = [{ handedness: "", gamepad: r }, { handedness: "", gamepad: l }];
  assert.deepEqual(stickFromSources(blank, "left", [0.2, -0.2]), { x: 0.6, y: 0 });
  assert.deepEqual(stickFromSources(blank, "right", [0.2, -0.2]), { x: -0.6, y: 0 });
  // A stick forward is negative y; the ride mapping turns it into throttle +1.
  const ride = createInputMapping({ ...RIDE, precedence: ["stick"] }).read({ stick: { x: 0, y: -1 } });
  assert.equal(ride.axes.throttle, 1);
});

// The orientation input against a fake window, status line and timer.
function harness({ requestPermission, statusText = "", secure = true, calibrate } = {}) {
  const listeners = {};
  const timers = new Map();
  let nextTimer = 1;
  const logs = [];
  const orientationEvent = requestPermission ? { requestPermission } : function DeviceOrientationEvent() {};
  const target = () => ({
    addEventListener(type, fn) { (listeners[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { listeners[type]?.delete(fn); },
  });
  const win = {
    ...target(),
    isSecureContext: secure,
    DeviceOrientationEvent: orientationEvent,
    screen: { orientation: { angle: 0 } },
  };
  const line = { text: statusText };
  const status = { get: () => line.text, set: (text) => { line.text = text; } };
  const log = { warn: (entry) => logs.push(entry), info: (entry) => logs.push(entry) };
  const input = createOrientationInput({
    win,
    status,
    log,
    calibrate,
    setTimer: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const count = (type) => listeners[type]?.size ?? 0;
  const fire = (type, event = {}) => { for (const fn of [...(listeners[type] || [])]) fn({ type, ...event }); };
  const orient = (beta, gamma) => fire("deviceorientation", { beta, gamma });
  const runTimers = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { input, line, timers, logs, count, fire, orient, runTimers };
}

test("neutral calibration: the first pitch is zero; reset takes the next hold", async () => {
  const h = harness();
  await h.input.enable();
  assert.equal(h.input.axes, null);
  h.orient(40, 0);
  near(h.input.axes.pitch, 0, "first reading is the pitch neutral");
  h.orient(30, 0);
  near(h.input.axes.pitch, 10, "tipped 10 away from the hold");
  h.orient(30, 10);
  near(h.input.axes.roll, h.input.reading.rollDeg, "roll is not calibrated by default");
  h.input.resetNeutral();
  h.orient(60, 0);
  near(h.input.axes.pitch, 0, "reset: the next hold is neutral");

  const both = harness({ calibrate: { roll: true, pitch: true } });
  await both.input.enable();
  both.orient(30, 15);
  near(both.input.axes.roll, 0, "roll calibrated when asked");
});

test("late readings take the no-readings failure down", async () => {
  const h = harness();
  await h.input.enable();
  assert.equal(h.count("deviceorientation"), 1);
  assert.equal(h.input.state, "listening");
  h.runTimers();
  assert.equal(h.input.note, ORIENTATION_MESSAGES.noReadings);
  assert.equal(h.line.text, ORIENTATION_MESSAGES.noReadings.replace("\n", " "));
  assert.ok(h.logs.some((entry) => entry.startsWith(`${ORIENTATION_LOG} No motion readings`)));
  h.orient(30, 0);
  assert.equal(h.input.note, "");
  assert.equal(h.line.text, "");
  assert.ok(h.logs.includes(`${ORIENTATION_LOG} readings arrived`));
});

test("late readings leave a status someone else wrote; readings in time show nothing", async () => {
  const h = harness();
  await h.input.enable();
  h.runTimers();
  h.line.text = "Invite sent.";
  h.orient(30, 0);
  assert.equal(h.line.text, "Invite sent.");

  const quick = harness({ statusText: "Enter a code." });
  await quick.input.enable();
  quick.orient(30, 0);
  quick.runTimers();
  assert.equal(quick.input.note, "");
  assert.equal(quick.line.text, "Enter a code.");
});

test("a permission error is shown, and asked again only on the next gesture", async () => {
  let calls = 0;
  const h = harness({
    requestPermission: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("needs a user gesture");
        error.name = "NotAllowedError";
        throw error;
      }
      return "granted";
    },
  });
  await h.input.enable();
  assert.match(h.input.note, /NotAllowedError/);
  assert.match(h.line.text, /NotAllowedError/);
  assert.equal(h.count("deviceorientation"), 0);
  assert.equal(h.input.state, "idle");
  assert.equal(calls, 1, "no retry without a gesture");

  await h.input.enable();
  assert.equal(calls, 2);
  assert.equal(h.input.note, "");
  assert.equal(h.line.text, "");
  assert.equal(h.count("deviceorientation"), 1);
});

test("a refused permission stays shown and is never asked again", async () => {
  let calls = 0;
  const h = harness({ requestPermission: async () => { calls += 1; return "denied"; } });
  const unbind = h.input.bindGestures();
  h.fire("touchend");
  await Promise.resolve();
  await Promise.resolve();
  await h.input.enable();
  h.fire("click");
  await h.input.enable();
  assert.equal(calls, 1);
  assert.equal(h.input.state, "blocked");
  assert.match(h.input.note, /refused/);
  assert.match(h.line.text, /refused/);
  assert.equal(h.count("deviceorientation"), 0);
  assert.ok(h.logs.some((entry) => entry.startsWith(`${ORIENTATION_LOG} Motion was refused`)));
  unbind();
});

test("permission: never asked outside a secure context; unsupported is said", async () => {
  let asked = false;
  const insecure = harness({ secure: false, requestPermission: async () => { asked = true; return "granted"; } });
  await insecure.input.enable();
  await insecure.input.enable();
  assert.equal(asked, false);
  assert.equal(insecure.input.state, "blocked");
  assert.match(insecure.line.text, /https/);

  const granted = await requestOrientationPermission({ secure: true, orientationEvent: { requestPermission: async () => "granted" } });
  assert.deepEqual(granted, { ok: true });
  const android = await requestOrientationPermission({ secure: true, orientationEvent: function DeviceOrientationEvent() {} });
  assert.deepEqual(android, { ok: true });
  const none = await requestOrientationPermission({ secure: true, orientationEvent: undefined });
  assert.equal(none.reason, "unsupported");
  const custom = await requestOrientationPermission({ secure: false, messages: { insecure: "Use https.\nDrag to steer." } });
  assert.equal(custom.message, "Use https.\nDrag to steer.");
  for (const key of ["insecure", "unsupported", "denied", "noReadings"]) {
    assert.ok(ORIENTATION_MESSAGES[key].split("\n").length <= 2, key);
  }
});

test("gestures: only activating events ask; a mouse pointerup does not", async () => {
  let calls = 0;
  const h = harness({ requestPermission: async () => { calls += 1; return "granted"; } });
  let allow = false;
  h.input.bindGestures(undefined, { when: () => allow });
  h.fire("touchend");
  assert.equal(calls, 0, "when() said no");
  allow = true;
  h.fire("pointerdown", { pointerType: "touch" });
  h.fire("pointerup", { pointerType: "mouse" });
  assert.equal(calls, 0, "pointerdown is not activating; a mouse has no sensor");
  h.fire("pointerup", { pointerType: "touch" });
  await Promise.resolve();
  assert.equal(calls, 1);
});

test("dispose removes every listener and the timer, and takes its note down", async () => {
  const h = harness();
  h.input.bindGestures();
  assert.equal(h.count("touchend"), 1);
  await h.input.enable();
  assert.equal(h.timers.size, 1);
  h.orient(30, 0);
  h.input.dispose();
  for (const type of ["deviceorientation", "touchend", "click", "pointerup"]) assert.equal(h.count(type), 0, type);
  assert.equal(h.timers.size, 0);
  assert.equal(h.input.axes, null);
  assert.equal(h.input.state, "disposed");
  await h.input.enable();
  assert.equal(h.count("deviceorientation"), 0, "a disposed input does not listen again");

  const shown = harness({ requestPermission: async () => "denied" });
  await shown.input.enable();
  assert.match(shown.line.text, /refused/);
  shown.input.dispose();
  assert.equal(shown.line.text, "");

  // A permission answer that lands after dispose does not start listening.
  let resolve;
  const late = harness({ requestPermission: () => new Promise((r) => { resolve = r; }) });
  const pending = late.input.enable();
  late.input.dispose();
  resolve("granted");
  await pending;
  assert.equal(late.count("deviceorientation"), 0);
});

test("createOrientationInput refuses to run without a status to show failures", () => {
  const win = { addEventListener() {}, removeEventListener() {} };
  assert.throws(() => createOrientationInput({ win }), /needs status/);
  assert.throws(() => createOrientationInput({ status: { get() {}, set() {} } }), /needs a window/);
});
