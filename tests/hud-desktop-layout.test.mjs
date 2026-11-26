import assert from "node:assert/strict";
import test from "node:test";
import { createHudDesktopLayout, fitHudFrameToLayout, hasHudManualWindowSize, resolveHudDesktopHotbarFrame } from "../src/hud-desktop-layout.js";

function rig({ width = 1400, height = 960, presenting = false } = {}) {
  const queue = [];
  const frames = {
    requestAnimationFrame: (fn) => { queue.push(fn); return queue.length; },
    cancelAnimationFrame: (id) => { queue[id - 1] = null; },
  };
  const flush = () => { while (queue.some(Boolean)) { const batch = queue.splice(0); for (const fn of batch) fn?.(); } };
  const windows = { palette: { x: 0, y: 0, w: 10, h: 10 }, log: { x: 0, y: 0, w: 10, h: 10 } };
  const destroyed = [];
  const hudSystem = {
    hud: { layoutW: width, layoutH: height, ui: { windows } },
    ensureSharedWindow: (key) => (windows[key] ??= { x: 0, y: 0, w: 100, h: 60 }),
    destroyWindow: (key) => { destroyed.push(key); delete windows[key]; },
    getPreferredHotbarWindowSize: () => ({ w: 900, h: 60, minW: 540, minH: 60 }),
  };
  const renderer = { xr: { isPresenting: presenting }, domElement: { getBoundingClientRect: () => ({ width, height }) } };
  return { hudSystem, renderer, frames, flush, windows, destroyed };
}

const buildFrames = ({ layoutW, edge, bottomLimit }) => ({
  windowFrames: {
    palette: { x: edge, y: edge, w: 300, h: 200 },
    log: { x: layoutW - 440 - edge, y: edge, w: 440, h: Math.min(260, bottomLimit - edge) },
  },
  inspectorW: 380,
});

test("layout applies the app's frames, then the app's own step", () => {
  const r = rig();
  let after = null;
  const layout = createHudDesktopLayout({ ...r, buildFrames, afterApply: (built) => { after = built; } });
  layout.applyLayout();
  assert.deepEqual([r.windows.palette.x, r.windows.palette.y, r.windows.palette.w, r.windows.palette.h], [16, 16, 300, 200]);
  assert.equal(r.windows.log.x, 1400 - 440 - 16);
  assert.equal(after.inspectorW, 380, "extra build output reaches afterApply");
  assert.ok(r.destroyed.includes("hotbar"), "the hotbar stays away until it is revealed");
});

test("a window a person moved or resized keeps where and how big they made it", () => {
  const r = rig();
  const layout = createHudDesktopLayout({ ...r, buildFrames });
  layout.applyLayout();
  Object.assign(r.windows.palette, { x: 500, y: 400, userPlaced: true });
  r.windows.log.w = 600;
  layout.applyLayout();
  assert.deepEqual([r.windows.palette.x, r.windows.palette.y], [500, 400]);
  assert.equal(r.windows.log.w, 600);
  assert.equal(hasHudManualWindowSize(r.windows.log), true);
  // A window Halo merely clamped is not mistaken for one moved by hand.
  r.windows.log.x = 3;
  layout.applyLayout();
  assert.equal(r.windows.log.x, 1400 - 440 - 16);
});

test("frames wider than a phone are kept on screen", () => {
  const r = rig({ width: 430, height: 900 });
  const layout = createHudDesktopLayout({ ...r, buildFrames });
  layout.applyLayout();
  const { x, w } = r.windows.log;
  assert.ok(x >= 16 && x + w <= 430 - 16, `log at ${x}+${w} inside 430`);
  assert.deepEqual(fitHudFrameToLayout({ x: 16, y: 16, w: 420, h: 100, minW: 420 }, 430, 900), { x: 16, y: 16, w: 398, h: 100, minW: 398 });
});

test("the hotbar appears two frames after the reveal, with its items first, at the bottom centre", () => {
  const r = rig();
  const order = [];
  const layout = createHudDesktopLayout({ ...r, buildFrames, onHotbarReady: () => order.push(`ready:${!!r.windows.hotbar}`) });
  layout.scheduleHotbarReveal();
  assert.equal(layout.isHotbarReady(), false);
  r.flush();
  assert.equal(layout.isHotbarReady(), true);
  assert.deepEqual(order, ["ready:true"]);
  const expected = resolveHudDesktopHotbarFrame({ layoutW: 1400, layoutH: 960, preferredHotbarSize: r.hudSystem.getPreferredHotbarWindowSize() });
  assert.deepEqual([r.windows.hotbar.x, r.windows.hotbar.y, r.windows.hotbar.w], [expected.x, expected.y, expected.w]);
  layout.resetHotbar();
  assert.equal(r.windows.hotbar, undefined);
  assert.equal(layout.isHotbarReady(), false);
});

test("scheduled layouts coalesce, and nothing is laid out in a headset", () => {
  const r = rig();
  let applied = 0;
  const layout = createHudDesktopLayout({ ...r, buildFrames, afterApply: () => { applied += 1; } });
  layout.scheduleLayout();
  layout.scheduleLayout();
  r.flush();
  assert.equal(applied, 1);
  r.renderer.xr.isPresenting = true;
  layout.scheduleLayout();
  layout.applyLayout();
  r.flush();
  assert.equal(applied, 1);
  assert.equal(layout.resolveWindowFrame("palette"), null);
  layout.scheduleHotbarReveal();
  assert.equal(layout.isHotbarReady(), true, "in a headset the hotbar is revealed at once");
  layout.dispose();
});
