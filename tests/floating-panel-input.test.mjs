import assert from "node:assert/strict";
import test from "node:test";
import { getClientPointNdc, projectClientPointToHud, projectNdcToClient } from "../src/pointer-coordinates.js";
import { createHudFloatingPanels } from "../src/hud-floating-panels.js";

test("panel coordinates scale and round trip for offset and resized viewports", () => {
  for (const rect of [{ left: 10, top: 30, width: 600, height: 400 },
    { left: -10, top: 15, width: 320, height: 720 }]) {
    const dom = { getBoundingClientRect: () => rect };
    const point = [rect.left + rect.width / 4, rect.top + rect.height / 4];
    const ndc = getClientPointNdc(...point, dom);
    assert.deepEqual(ndc, { x: -0.5, y: 0.5 });
    assert.deepEqual(projectNdcToClient(ndc, rect), { x: point[0], y: point[1] });
    assert.deepEqual(projectClientPointToHud(...point, dom, 800, 480), { x: 200, y: 120 });
  }
  assert.equal(getClientPointNdc(3, 4, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 20 }) }), null);
});

test("window reopen preserves manual geometry without replacing host callbacks", () => {
  const windows = Object.create(null);
  const close = () => {};
  const hudSystem = {
    hud: { ui: { windows } },
    createWindow(key, opts) { return windows[key] = opts; },
    destroyWindow(key) { delete windows[key]; },
  };
  let initial = 0;
  const panels = createHudFloatingPanels({ hudSystem, panelWindowOptions: {
    palette: { title: "Palette", onClose: close, w: 320, minW: 100, scrollMode: "top" },
  }, resolveWindowFrame() { initial++; return { x: 12, y: 24, w: 360, h: 500, title: "Wrong" }; } });
  assert.equal(panels.ensurePanelWindow("unknown"), null);
  const first = panels.ensurePanelWindow("palette");
  assert.equal(first.w, 360);
  assert.equal(first.title, "Palette");
  Object.assign(first, { w: 410, h: 510, x: 31, scrollMode: "manual" });
  panels.setWindowVisible("palette", false);
  assert.equal(windows.palette, undefined);
  panels.setWindowVisible("palette", true);
  assert.equal(initial, 1);
  assert.equal(windows.palette.w, 410);
  assert.equal(windows.palette.scrollMode, "manual");
  assert.equal(windows.palette.onClose, close);
});
