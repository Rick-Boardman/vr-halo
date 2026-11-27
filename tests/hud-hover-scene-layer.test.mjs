// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createHudUiOverlays } from "../src/ui-overlays.js";

function setup(owns) {
  const win = { x: 20, y: 20, w: 200, h: 120, closeable: false, minimizable: false, draggable: true };
  const hud = {
    layoutW: 400, layoutH: 300,
    ui: { order: ["panel"], windows: { panel: win }, theme: {} },
    objects: { windows: { panel: { _titleGripHitRect: { x: 20, y: 20, w: 40, h: 16 } } }, overlay: {} },
    overlay: { tooltip: { visible: false, text: "", _hoverId: "", _timer: 0 } },
  };
  const runtime = createHudUiOverlays({
    THREE, hud, renderer: { xr: {}, getPixelRatio: () => 1, domElement: { style: {} } },
    clamp: THREE.MathUtils.clamp, markDirty() {},
    rectContains: (x, y, w, h, px, py) => px >= x && py >= y && px <= x + w && py <= y + h,
    positionRect() {}, hideColorLayers() {}, clearPlainTextMaybeTroika() {}, setPlainTextMaybeTroika() {},
    sceneLayerOwnsPoint: owns,
  });
  return { hud, runtime, win };
}

test("a window shows hover where no scene layer covers it", () => {
  const { hud, runtime, win } = setup(() => false);
  const pointer = { active: true, x: win.x + 10, y: win.y + 6 };
  for (let i = 0; i < 20; i++) runtime.updateOverlayHover(pointer, 0.1);
  assert.equal(hud.overlay.tooltip._hoverId, "panel:grip");
});

test("a scene layer drawn over a window takes its hover: no tooltip", () => {
  const asked = [];
  const { hud, runtime, win } = setup((x, y) => { asked.push([x, y]); return true; });
  hud.overlay.tooltip = { visible: true, text: "Drag panel", _hoverId: "panel:grip", _timer: 1 };
  const pointer = { active: true, x: win.x + 10, y: win.y + 6 };
  runtime.updateOverlayHover(pointer, 0.1);
  assert.deepEqual(asked.at(-1), [pointer.x, pointer.y]);
  assert.equal(hud.overlay.tooltip.visible, false);
  assert.equal(hud.overlay.tooltip.text, "");
  assert.equal(hud.overlay.tooltip._hoverId, "");
});
