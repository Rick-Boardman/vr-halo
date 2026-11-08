import test from "node:test";
import assert from "node:assert/strict";
import { createHudVrAutoLayoutRuntime } from "../src/hud-vr-auto-layout-runtime.js";

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function layoutOf(windows) {
  const hud = {
    layoutW: 1600,
    layoutH: 900,
    ui: { order: Object.keys(windows), windows, _vrAutoLayoutDone: false },
  };
  const layout = createHudVrAutoLayoutRuntime({
    hud,
    clamp,
    markDirty() {},
    rightX: 2000,
    outerPaddingPx: 32,
    interWindowGapXPx: 64,
    interWindowGapYPx: 48,
    titleHeightPx: 28,
  });
  layout.autoLayoutWindowsForVr();
  return hud;
}

test("Enter VR is placed in the headset even when it was parked off screen", () => {
  const hud = layoutOf({ xr: { x: 2000, y: -2000, w: 240, h: 64 } });
  const xr = hud.ui.windows.xr;
  assert.ok(xr.y >= 0 && xr.y + xr.h <= hud.layoutH);
  assert.ok(xr.x >= 0 && xr.x + xr.w <= hud.layoutW);
});

test("a parked window other than Enter VR stays parked in the headset", () => {
  const hud = layoutOf({
    settings: { x: 40, y: -2000, w: 380, h: 340 },
    hotbar: { x: 400, y: 800, w: 540, h: 84 },
  });
  assert.equal(hud.ui.windows.settings.y, -2000);
});
