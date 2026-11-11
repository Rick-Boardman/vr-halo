// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHudFormController, layoutFormRows, sanitizeNumberText } from "../src/hud-form-controls.js";
import {
  createHudSettingsWindow,
  nearestTierIndex,
  qualityLabel,
  qualityOptions,
  settingsCallbacksFromCalibration,
} from "../src/hud-settings-window.js";
import { createQualityCalibration } from "../src/quality-calibration.js";
import { createWebXrSystemKeyboardBridge } from "../src/webxr-system-keyboard.js";

// A 2D context that records every call; enough for the controls' painting.
function recordingContext() {
  const calls = [];
  return new Proxy(
    { calls },
    {
      get(target, name) {
        if (name in target) return target[name];
        if (name === "measureText") return (text) => ({ width: String(text).length * 8 });
        return (...args) => calls.push([name, ...args]);
      },
      set(target, name, value) {
        target[name] = value;
        return true;
      },
    },
  );
}

function fakeDocument() {
  const canvases = [];
  return {
    canvases,
    createElement(tag) {
      assert.equal(tag, "canvas");
      const ctx = recordingContext();
      const canvas = { width: 0, height: 0, ctx, getContext: () => ctx };
      canvases.push(canvas);
      return canvas;
    },
  };
}

class Vec {
  copy() {
    return this;
  }
}

function fakeThree() {
  const counts = { geometry: 0, material: 0, texture: 0 };
  class Obj {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = new Vec();
      this.quaternion = new Vec();
      this.scale = new Vec();
    }
    add(child) {
      child.parent?.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this;
      this.children.push(child);
    }
    removeFromParent() {
      if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
  }
  class Mesh extends Obj {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }
  return {
    counts,
    Obj,
    THREE: {
      Mesh,
      PlaneGeometry: class {
        dispose() {
          counts.geometry += 1;
        }
      },
      MeshBasicMaterial: class {
        constructor(options) {
          Object.assign(this, options);
        }
        dispose() {
          counts.material += 1;
        }
      },
      CanvasTexture: class {
        constructor(image) {
          this.image = image;
        }
        dispose() {
          counts.texture += 1;
        }
      },
      SRGBColorSpace: "srgb",
      LinearFilter: 1006,
    },
  };
}

function fakeHud(Obj) {
  const plane = new Obj();
  const bg = new Obj();
  plane.add(bg);
  bg.renderOrder = 5;
  const contentText = { visible: true, mesh: { visible: true } };
  return {
    plane,
    hudSystem: {
      hud: {
        pointer: { x: 0, y: 0, down: false, justPressed: false },
        vrPointer: { x: 0, y: 0, down: false, justPressed: false },
        ui: { windows: { settings: { x: 100, y: 50, w: 440, h: 520, collapsed: false } } },
        objects: { windows: { settings: { bg, contentText, contentBg: { visible: true } } } },
      },
    },
  };
}

function stubCallbacks() {
  const log = [];
  const state = { tiers: [0.5, 0.75, 1, 1.25, 1.5], index: 2, pixelRatio: 1, mode: "auto", phase: "settled" };
  const sound = { level: 0.5, muted: false };
  return {
    log,
    state,
    sound,
    quality: {
      getState: () => ({ ...state, pixelRatio: state.tiers[state.index] }),
      lockTier: (i) => {
        log.push(["lockTier", i]);
        state.index = i;
        state.mode = "manual";
      },
      setAuto: () => {
        log.push(["setAuto"]);
        state.mode = "auto";
      },
      recalibrate: () => log.push(["recalibrate"]),
    },
    audio: {
      getState: () => ({ ...sound }),
      setVolume: (v) => {
        log.push(["setVolume", v]);
        sound.level = v;
      },
      setMuted: (m) => {
        log.push(["setMuted", m]);
        sound.muted = m;
      },
    },
  };
}

function setup({ presenting = false, keyboard = null, extraRows = [] } = {}) {
  const three = fakeThree();
  const { hudSystem, plane } = fakeHud(three.Obj);
  const calls = stubCallbacks();
  const keyTarget = new EventTarget();
  const documentRef = fakeDocument();
  const renderer = { xr: { isPresenting: presenting } };
  const panel = createHudSettingsWindow({
    THREE: three.THREE,
    hudSystem,
    renderer,
    quality: calls.quality,
    audio: calls.audio,
    extraRows,
    keyTarget,
    documentRef,
    createKeyboard: keyboard ? () => keyboard : () => null,
    now: () => 0,
  });
  const win = hudSystem.hud.ui.windows.settings;
  const centre = (key) => {
    const item = panel.form.layout(win.w, win.h).find((entry) => entry.key === key);
    return { x: win.x + item.box.x + item.box.w / 2, y: win.y + item.box.y + item.box.h / 2, item };
  };
  // One frame: a press at a window-relative point through the active pointer.
  const click = (x, y) => {
    const pointer = presenting ? hudSystem.hud.vrPointer : hudSystem.hud.pointer;
    Object.assign(pointer, { x, y, down: true, justPressed: true });
    panel.prepare();
    panel.afterHud();
    Object.assign(pointer, { down: false, justPressed: false });
    panel.prepare();
    panel.afterHud();
  };
  return { three, hudSystem, plane, calls, keyTarget, documentRef, panel, win, centre, click };
}

test("quality stops and tier helpers", () => {
  assert.deepEqual(qualityOptions([0.5, 0.75, 1, 1.25, 1.5]).map((o) => o.index), [0, 2, 4]);
  assert.deepEqual(qualityOptions([1]).map((o) => o.name), ["Low"]);
  assert.equal(qualityLabel(1, [0.5, 0.75, 1, 1.25, 1.5]), "Custom");
  assert.equal(nearestTierIndex(1.3, [0.5, 0.75, 1, 1.25, 1.5]), 3);
  assert.equal(sanitizeNumberText("1.2.3x45"), "1.234");
  assert.equal(sanitizeNumberText("123456789"), "12345");
});

test("rows are validated and a dropdown list flips above when it would overflow", () => {
  assert.throws(() => createHudFormController({ rows: [{ kind: "radio", key: "a" }] }), /unknown row kind/);
  assert.throws(
    () => createHudFormController({ rows: [{ kind: "button", key: "a" }, { kind: "button", key: "a" }] }),
    /duplicate row key/,
  );
  const rows = [{ kind: "dropdown", key: "d", options: () => [{ value: 1, label: "One" }, { value: 2, label: "Two" }] }];
  const below = layoutFormRows(rows, 400, 400)[0];
  assert.ok(below.options[0].y > below.box.y);
  const above = layoutFormRows(rows, 400, 100)[0];
  assert.ok(above.options[1].y + above.options[1].h <= above.box.y);
});

test("missing callbacks fail loudly", () => {
  const three = fakeThree();
  const { hudSystem } = fakeHud(three.Obj);
  const calls = stubCallbacks();
  assert.throws(
    () => createHudSettingsWindow({ THREE: three.THREE, hudSystem, quality: { getState() {} }, audio: calls.audio, keyTarget: null }),
    /quality\.lockTier must be a function/,
  );
});

test("desktop and touch: dropdown, checkboxes, slider and button reach only the callbacks", () => {
  const t = setup();
  const quality = t.centre("quality");
  t.click(quality.x, quality.y);
  assert.equal(t.panel.form.openKey, "quality");
  const high = quality.item.options.find((option) => option.label === "High");
  t.click(t.win.x + high.x + 10, t.win.y + high.y + 5);
  assert.deepEqual(t.calls.log.at(-1), ["lockTier", 4]);
  assert.equal(t.panel.form.openKey, "");

  const automatic = t.centre("automatic");
  t.click(automatic.x, automatic.y);
  assert.deepEqual(t.calls.log.at(-1), ["setAuto"]);
  t.click(automatic.x, automatic.y);
  assert.deepEqual(t.calls.log.at(-1), ["lockTier", 4]);

  const mute = t.centre("mute");
  t.click(mute.x, mute.y);
  assert.deepEqual(t.calls.log.at(-1), ["setMuted", true]);

  const volume = t.centre("volume");
  const left = t.win.x + volume.item.box.x;
  t.click(left, volume.y);
  assert.deepEqual(t.calls.log.at(-1), ["setVolume", 0]);
  // Drag: press, then move with the button held.
  Object.assign(t.hudSystem.hud.pointer, { x: left, y: volume.y, down: true, justPressed: true });
  t.panel.prepare();
  t.panel.afterHud();
  Object.assign(t.hudSystem.hud.pointer, { x: left + volume.item.box.w, justPressed: false });
  t.panel.prepare();
  t.panel.afterHud();
  assert.deepEqual(t.calls.log.at(-1), ["setVolume", 1]);
  Object.assign(t.hudSystem.hud.pointer, { down: false });
  t.panel.prepare();
  t.panel.afterHud();

  const calibrate = t.centre("calibrate");
  t.click(calibrate.x, calibrate.y);
  assert.deepEqual(t.calls.log.at(-1), ["recalibrate"]);
  t.panel.dispose();
});

test("desktop typing commits the nearest tier; Escape cancels", () => {
  const t = setup();
  const ratio = t.centre("ratio");
  t.click(ratio.x, ratio.y);
  assert.equal(t.panel.isTyping(), true);
  assert.equal(t.panel.form.draftText, "1.00");
  const press = (key) => {
    const event = new Event("keydown", { cancelable: true });
    event.key = key;
    t.keyTarget.dispatchEvent(event);
    return event;
  };
  for (let i = 0; i < 4; i += 1) press("Backspace");
  press("1");
  press(".");
  const consumed = press("3");
  assert.equal(consumed.defaultPrevented, true);
  press("Enter");
  assert.equal(t.panel.isTyping(), false);
  assert.deepEqual(t.calls.log.at(-1), ["lockTier", 3]);

  t.click(ratio.x, ratio.y);
  press("9");
  press("Escape");
  assert.equal(t.panel.isTyping(), false);
  assert.equal(t.calls.log.length, 1);
  t.panel.dispose();
});

test("XR: the controller ray hits controls and number entry uses the system keyboard", () => {
  const events = {};
  const session = { isSystemKeyboardSupported: true, addEventListener() {}, removeEventListener() {} };
  const fields = [];
  const documentRef = {
    body: { appendChild: (field) => fields.push(field) },
    createElement: () => ({
      value: "",
      style: {},
      setAttribute() {},
      addEventListener(name, fn) {
        events[name] = fn;
      },
      removeEventListener(name) {
        delete events[name];
      },
      remove() {},
      focus() {},
    }),
  };
  let bridge = null;
  const three = fakeThree();
  const { hudSystem } = fakeHud(three.Obj);
  const calls = stubCallbacks();
  const renderer = { xr: { isPresenting: true, getSession: () => session } };
  const panel = createHudSettingsWindow({
    THREE: three.THREE,
    hudSystem,
    renderer,
    quality: calls.quality,
    audio: calls.audio,
    keyTarget: null,
    documentRef: fakeDocument(),
    createKeyboard: (options) => {
      bridge = createWebXrSystemKeyboardBridge({ ...options, documentRef });
      return bridge;
    },
    now: () => 0,
  });
  const win = hudSystem.hud.ui.windows.settings;
  const item = panel.form.layout(win.w, win.h).find((entry) => entry.key === "ratio");
  // The desktop pointer is ignored while presenting.
  Object.assign(hudSystem.hud.pointer, { x: win.x + item.box.x + 5, y: win.y + item.box.y + 5, down: true, justPressed: true });
  panel.prepare();
  panel.afterHud();
  assert.equal(panel.isTyping(), false);
  Object.assign(hudSystem.hud.pointer, { down: false, justPressed: false });
  Object.assign(hudSystem.hud.vrPointer, { x: win.x + item.box.x + 5, y: win.y + item.box.y + 5, down: true, justPressed: true });
  panel.prepare();
  panel.afterHud();
  assert.equal(panel.isTyping(), true);
  assert.equal(bridge.isOpen(), true);
  assert.equal(fields[0].value, "1.00");
  fields[0].value = "0.5x";
  events.input();
  assert.equal(panel.form.draftText, "0.5");
  events.blur();
  assert.equal(panel.isTyping(), false);
  assert.deepEqual(calls.log.at(-1), ["lockTier", 0]);
  panel.dispose();
});

test("extra rows are the app's, and a hidden window drops menus and typing", () => {
  let extreme = false;
  const t = setup({
    extraRows: [{ kind: "checkbox", key: "extreme", label: "Extreme crashes", checked: () => extreme, onToggle: (next) => (extreme = next) }],
  });
  const row = t.centre("extreme");
  t.click(row.x, row.y);
  assert.equal(extreme, true);
  const quality = t.centre("quality");
  t.click(quality.x, quality.y);
  assert.equal(t.panel.form.openKey, "quality");
  t.win.y = -2000;
  t.panel.prepare();
  t.panel.afterHud();
  assert.equal(t.panel.form.openKey, "");
  assert.equal(t.panel.mesh.visible, false);
  t.panel.dispose();
});

test("painting hides the stock content, follows the plate, and skips unchanged frames", () => {
  const t = setup();
  t.panel.prepare();
  t.panel.afterHud();
  const objs = t.hudSystem.hud.objects.windows.settings;
  assert.equal(objs.contentText.visible, false);
  assert.equal(objs.contentText.mesh.visible, false);
  assert.equal(objs.contentBg.visible, false);
  assert.equal(t.panel.mesh.parent, t.plane);
  assert.equal(t.panel.mesh.renderOrder, 25);
  assert.ok(t.panel.mesh.material.map, "texture bound");
  const ctx = t.documentRef.canvases[0].ctx;
  const painted = ctx.calls.length;
  assert.ok(ctx.calls.some(([name, value]) => name === "fillText" && value === "Picture 1.00"));
  t.panel.prepare();
  t.panel.afterHud();
  assert.equal(ctx.calls.length, painted, "an unchanged frame is not repainted");
  t.calls.sound.level = 0.25;
  t.panel.prepare();
  t.panel.afterHud();
  assert.ok(ctx.calls.length > painted, "a changed value repaints");
  t.panel.dispose();
});

test("dispose removes the key listener, the mesh, the geometry, the material and the texture", () => {
  const t = setup();
  t.panel.prepare();
  t.panel.afterHud();
  const ratio = t.centre("ratio");
  t.click(ratio.x, ratio.y);
  t.panel.dispose();
  assert.equal(t.plane.children.length, 1, "only the plate remains");
  assert.deepEqual(t.three.counts, { geometry: 1, material: 1, texture: 1 });
  const event = new Event("keydown", { cancelable: true });
  event.key = "5";
  t.keyTarget.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, "no listener after dispose");
  assert.equal(t.panel.isTyping(), false);
  t.panel.dispose();
  assert.deepEqual(t.three.counts, { geometry: 1, material: 1, texture: 1 }, "a second dispose is a no-op");
});

test("settingsCallbacksFromCalibration drives a real calibration", () => {
  const calibration = createQualityCalibration({ devicePixelRatio: 1.5, cap: 2, storage: null });
  calibration.start();
  const { quality, audio } = settingsCallbacksFromCalibration(calibration);
  quality.lockTier(2);
  assert.equal(quality.getState().index, 2);
  assert.equal(quality.getState().mode, "manual");
  quality.setAuto();
  assert.equal(quality.getState().mode, "auto");
  audio.setVolume(0.4);
  audio.setMuted(true);
  assert.deepEqual(audio.getState(), { level: 0.4, muted: true });
  calibration.dispose();
});

test("stock text lines written to the window are cleared before the HUD draws them", () => {
  const t = setup();
  const written = [];
  t.hudSystem.hud.ui.data = { settingsLines: [{ text: "Mode: auto" }] };
  t.hudSystem.setWindowLines = (key, entries) => {
    written.push([key, entries]);
    t.hudSystem.hud.ui.data[`${key}Lines`] = entries;
  };
  t.panel.prepare();
  assert.deepEqual(written, [["settings", []]]);
  t.panel.prepare();
  assert.equal(written.length, 1, "an empty window is not rewritten");
  t.panel.dispose();
});
