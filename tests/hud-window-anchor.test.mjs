import test from "node:test";
import assert from "node:assert/strict";
import { createHudWindowLayoutRuntime } from "../src/hud-window-layout-runtime.js";
import { createHudResizeRuntime } from "../src/hud-resize-runtime.js";

// Panels are not part of the scene: they keep their place relative to the viewer (owner, 2026-11-08: "right now the hotbar
// is jumping halfway up the viewer when the screen is resized").
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
function setUp(windows, W = 1200, H = 800) {
  const hud = { layoutW: W, layoutH: H, xr: {}, ui: { windows, order: Object.keys(windows), _layoutInitialized: true, data: {} } };
  const renderer = { xr: { isPresenting: false } };
  const layout = createHudWindowLayoutRuntime({ hud, renderer, clamp, titleHeightPx: 28, rightX: 0, hiddenY: -2000, windowClampMinVisiblePxDefault: 32 });
  const next = {};
  const resize = createHudResizeRuntime({ renderer, hud, autoHandleResize: false, getDesktopClientSize: () => next, setLayoutForMode: () => { hud.layoutW = next.w; hud.layoutH = next.h; }, updateHudQuadSize() {}, markDirty() {}, reanchorWindows: layout.reanchorWindows });
  return { hud, to(w, h) { next.w = w; next.h = h; resize.handleResize(); } };
}
const bar = () => ({ x: 300, y: 720, w: 600, h: 60, minW: 200, minH: 40 });

test("the hotbar stays at the bottom, centred, however the viewer is resized", () => {
  const { hud, to } = setUp({ hotbar: bar() });
  const win = hud.ui.windows.hotbar;
  to(1600, 1000);
  assert.deepEqual([win.x, win.y], [500, 920]);
  to(1000, 500);
  assert.deepEqual([win.x, win.y], [200, 420]);
});

test("a window squeezed by a small viewer goes back to its place in a larger one", () => {
  const { hud, to } = setUp({ log: { x: 900, y: 500, w: 280, h: 280, minW: 100, minH: 100 } });
  const win = hud.ui.windows.log;
  to(1200, 200);
  assert.equal(win.y, 0, "clamped into the small viewer");
  to(1200, 800);
  assert.equal(win.y, 500, "and back");
});

test("a window moved by a person is anchored where it now is", () => {
  const { hud, to } = setUp({ palette: { x: 20, y: 30, w: 200, h: 200, minW: 100, minH: 100 }, hotbar: bar() });
  to(1600, 1000);
  const palette = hud.ui.windows.palette;
  assert.deepEqual([palette.x, palette.y], [20, 30], "top left stays top left");
  const hotbar = hud.ui.windows.hotbar;
  hotbar.x = 40;
  hotbar.y = 40;
  to(1000, 700);
  assert.deepEqual([hotbar.x, hotbar.y], [40, 40], "moved to the top left, it stays there");
});

test("Enter VR comes back on screen once a headset can start a session", () => {
  const xr = { x: 2000, y: 0, w: 240, h: 64, minW: 200, minH: 64 };
  const status = { x: 16, y: 16, w: 420, h: 270, minW: 200, minH: 64 };
  const hud = {
    layoutW: 1280,
    layoutH: 720,
    xr: { supported: false },
    ui: { windows: { xr, status }, order: ["xr", "status"], _layoutInitialized: false, data: {} },
  };
  const renderer = { xr: { isPresenting: false } };
  let saved = null;
  const layout = createHudWindowLayoutRuntime({
    hud,
    renderer,
    clamp,
    titleHeightPx: 28,
    rightX: 2000,
    hiddenY: -2000,
    windowClampMinVisiblePxDefault: 32,
    loadLayout: () => saved,
  });
  layout.ensureDefaultLayout();
  assert.equal(xr.y, -2000, "hidden until the headset check finishes");
  assert.deepEqual([xr._hiddenX, xr._hiddenY], [2000, 0]);
  // The boot save runs while the window is parked, so the snapshot has no xr entry.
  saved = { status: { x: 16, y: 16, w: 420, h: 270, collapsed: false }, __viewer: { w: 1280, h: 720 } };
  hud.xr.supported = true;
  hud.ui._layoutInitialized = false;
  layout.ensureDefaultLayout();
  assert.ok(xr.y >= 0 && xr.y + xr.h <= hud.layoutH, "back inside the viewer");
  assert.ok(xr.x >= 0 && xr.x + xr.w <= hud.layoutW, "back inside the viewer");
  const overlapsStatus = xr.x < status.x + status.w && xr.x + xr.w > status.x
    && xr.y < status.y + status.h && xr.y + xr.h > status.y;
  assert.equal(overlapsStatus, false, "not under the status panel");
});

test("a rider's Enter VR place is kept when the headset check finishes", () => {
  const xr = { x: 2000, y: 0, w: 240, h: 64, minW: 200, minH: 64 };
  const hud = {
    layoutW: 1280,
    layoutH: 720,
    xr: { supported: false },
    ui: { windows: { xr }, order: ["xr"], _layoutInitialized: false, data: {} },
  };
  let saved = { xr: { x: 120, y: 80, w: 240, h: 64, userPlaced: true }, __viewer: { w: 1280, h: 720 } };
  const layout = createHudWindowLayoutRuntime({
    hud,
    renderer: { xr: { isPresenting: false } },
    clamp,
    titleHeightPx: 28,
    rightX: 2000,
    hiddenY: -2000,
    windowClampMinVisiblePxDefault: 32,
    loadLayout: () => saved,
  });
  layout.ensureDefaultLayout();
  assert.equal(xr.y, -2000);
  assert.deepEqual([xr._hiddenX, xr._hiddenY], [120, 80]);
  // A save while it is parked omits it. The remembered place is all that is left.
  saved = { __viewer: { w: 1280, h: 720 } };
  hud.xr.supported = true;
  hud.ui._layoutInitialized = false;
  layout.ensureDefaultLayout();
  assert.deepEqual([xr.x, xr.y], [120, 80]);
});

test("a hidden window keeps its place too, and the first layout is left to run", () => {
  const { hud, to } = setUp({ log: { x: 0, y: -5000, w: 200, h: 100, minW: 100, minH: 50, _hiddenX: 1000, _hiddenY: 700 } });
  to(1600, 1000);
  const win = hud.ui.windows.log;
  assert.deepEqual([win.x, win.y], [0, -5000]);
  assert.deepEqual([win._hiddenX, win._hiddenY], [1400, 900]);
  hud.ui._layoutInitialized = false;
  const before = win._hiddenX;
  to(1200, 800);
  assert.equal(win._hiddenX, before, "before the first layout there is nothing to keep");
  assert.equal(hud.ui._layoutInitialized, false);
});
