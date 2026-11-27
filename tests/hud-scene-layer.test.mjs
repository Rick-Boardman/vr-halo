import assert from "node:assert/strict";
import test from "node:test";
import { createHudSceneLayerRuntime } from "../src/hud-scene-layer-runtime.js";

const rectContains = (x, y, w, h, px, py) => px >= x && px <= x + w && py >= y && py <= y + h;
const base = key => 100 + ["a", "b", "c"].indexOf(key) * 40;

function setup() {
  const blurred = [];
  const win = (key, x) => ({ key, x, y: 0, w: 100, h: 100, _onHudBlur: () => blurred.push(key) });
  const hud = { ui: { order: ["a", "b"], focus: "b", windows: { a: win("a", 0), b: win("b", 200), c: win("c", 400) } } };
  const renderer = { xr: { isPresenting: false } };
  const runtime = createHudSceneLayerRuntime({ hud, renderer, rectContains, titleHeightPx: 20, groupRenderOrder: 10000, markDirty() {} });
  const applied = [];
  const layer = { containsPoint: (px) => px >= 50 && px <= 250, apply: order => applied.push(order) };
  return { hud, renderer, runtime, applied, layer, blurred };
}

test("a raised layer sits above the windows open when it was raised and takes their points", () => {
  const { hud, runtime, applied, layer, blurred } = setup();
  runtime.raiseSceneLayer("card", layer);
  assert.equal(hud.ui.focus, null, "the focused window drops into the stack");
  assert.deepEqual(blurred, ["b"]);
  runtime.syncSceneLayers(base);
  assert.deepEqual(applied.at(-1), { groupOrder: 10000, renderOrder: 140 + 30 });
  assert.equal(runtime.sceneLayerOwnsPoint(220, 50), true, "the layer is over window b here");
  assert.equal(runtime.sceneLayerOwnsPoint(20, 50), false, "the layer does not cover this part of window a");
  assert.equal(runtime.sceneLayerOwnsPoint(150, 50), false, "no window here: not a HUD point at all");
});

test("a window brought forward or opened after the raise is above the layer", () => {
  const { hud, runtime, applied, layer } = setup();
  runtime.raiseSceneLayer("card", layer);
  hud.ui.order.push("c");
  runtime.noteWindowRaised("b");
  hud.ui.order = ["a", "c", "b"];
  hud.ui.focus = "b";
  runtime.syncSceneLayers(key => 100 + hud.ui.order.indexOf(key) * 40);
  assert.deepEqual(applied.at(-1), { groupOrder: 10000, renderOrder: 130 }, "only window a is below now");
  assert.equal(hud.ui.focus, "b", "a window above the layer keeps focus");
  assert.equal(runtime.sceneLayerOwnsPoint(220, 50), false, "window b owns its own point again");
  assert.equal(runtime.sceneLayerOwnsPoint(60, 50), true, "the layer still owns its part over window a");
});

test("focus handed to a window below the layer is taken back, and lowering applies null", () => {
  const { hud, runtime, applied, layer } = setup();
  runtime.raiseSceneLayer("card", layer);
  hud.ui.focus = "a";
  runtime.syncSceneLayers(base);
  assert.equal(hud.ui.focus, null);
  assert.equal(runtime.lowerSceneLayer("card"), true);
  assert.equal(applied.at(-1), null);
  assert.equal(runtime.sceneLayerOwnsPoint(220, 50), false);
  assert.equal(runtime.lowerSceneLayer("card"), false);
});

test("layers are not used while presenting XR", () => {
  const { renderer, runtime, applied, layer } = setup();
  runtime.raiseSceneLayer("card", layer);
  renderer.xr.isPresenting = true;
  runtime.syncSceneLayers(base);
  assert.equal(applied.at(-1), null);
  assert.equal(runtime.sceneLayerOwnsPoint(220, 50), false);
  assert.throws(() => runtime.raiseSceneLayer("x", {}), /containsPoint and apply/);
});
