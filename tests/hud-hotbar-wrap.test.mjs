import test from "node:test";
import assert from "node:assert/strict";
import { createHudHotbarRuntime } from "../src/hud-hotbar-runtime.js";

// A 20-slot toolbar on a 430px phone used to shrink to 20px slots and still overflow its window (Conduit, Loom, Insight).
function runtime(layoutW, count = 20) {
  const items = Array.from({ length: count }, (_, i) => ({ tooltip: `Item ${i}`, iconTexture: {} }));
  const hud = { layoutW, layoutH: 900, ui: { data: { hotbarItems: items }, windows: { hotbar: { x: 16, y: 800, w: 100, h: 56 } } } };
  return { hud, bar: createHudHotbarRuntime({ hud, hotbarSlotCount: count, reserveSystemHotbarSlots: false }) };
}

test("a hotbar too wide for the viewer wraps onto rows of touchable slots inside its window", () => {
  const { hud, bar } = runtime(430);
  const preferred = bar.getPreferredHotbarWindowSize();
  assert.ok(preferred.w <= 430 - 2 * 10 + 1, `fits the phone: ${preferred.w}`);
  Object.assign(hud.ui.windows.hotbar, { w: preferred.w, h: preferred.h });
  const layout = bar.getHotbarSlotLayout(hud.ui.windows.hotbar);
  assert.ok(layout.rows >= 2, "more than one row");
  assert.ok(layout.slot >= 32, `slots stay touchable: ${layout.slot}`);
  const win = hud.ui.windows.hotbar;
  for (const metric of layout.slotMetrics) {
    assert.ok(metric.x >= win.x && metric.x + metric.w <= win.x + win.w, `slot ${metric.index} inside the window`);
    assert.ok(metric.y >= win.y && metric.y + metric.h <= win.y + win.h, `slot ${metric.index} inside the window height`);
  }
  const last = layout.slotMetrics.at(-1);
  assert.equal(bar.hitTestHotbarSlotIndex(win, last.x + 2, last.y + 2), layout.slotMetrics.length - 1, "a second-row slot is hit");
});

test("a hotbar that fits stays one row at its full slot size", () => {
  const { hud, bar } = runtime(1400);
  const preferred = bar.getPreferredHotbarWindowSize();
  Object.assign(hud.ui.windows.hotbar, { w: preferred.w, h: preferred.h });
  const layout = bar.getHotbarSlotLayout(hud.ui.windows.hotbar);
  assert.equal(layout.rows, 1);
  assert.equal(layout.slot, 40);
});

test("a wrapped bar with a title and status keeps every row inside its preferred height", () => {
  const { hud, bar } = runtime(430, 21);
  hud.ui.data.hotbarHeaderTitle = "Conduit";
  hud.ui.data.hotbarStatusText = "READY";
  const preferred = bar.getPreferredHotbarWindowSize();
  assert.equal(preferred.w, 430 - 32, "the viewer less the window edge margins");
  Object.assign(hud.ui.windows.hotbar, { x: 16, y: 900 - preferred.h - 20, w: preferred.w, h: preferred.h });
  const win = hud.ui.windows.hotbar;
  const layout = bar.getHotbarSlotLayout(win);
  assert.equal(layout.wrapped, true);
  assert.ok(layout.leftGutter < 40, "the title's width goes to the slots");
  for (const metric of layout.slotMetrics) assert.ok(metric.y + metric.h <= win.y + win.h, `slot ${metric.index} inside the bar`);
});
