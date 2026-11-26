import assert from "node:assert/strict";
import test from "node:test";
import { createHudPropertySheet } from "../src/ui/editor/hud-property-sheet.js";

/** A HUD that records what each window is told to show. */
function recordingHud() {
  const windows = {};
  const lines = {};
  const hudSystem = {
    hud: { ui: { windows, order: [] }, objects: { windows: {} }, layoutW: 1280, layoutH: 800 },
    createWindow(key, options) { windows[key] = { key, x: 0, y: 0, w: 400, h: 400, ...options }; return windows[key]; },
    destroyWindow(key) { delete windows[key]; },
    setWindowLines(key, entries) { lines[key] = entries; },
    setWindowScrollTop() {},
    bringToFront() {},
  };
  return { hudSystem, lines };
}

test("a row without a label shows its value alone; a labelled row shows label: value", () => {
  const { hudSystem, lines } = recordingHud();
  const sheet = createHudPropertySheet({
    hudSystem,
    renderer: { domElement: { addEventListener() {}, removeEventListener() {} }, xr: { isPresenting: false } },
    windowKey: "sheet",
    rows: [
      { key: "note", kind: "readonly", label: "", value: "Approve or decline." },
      { key: "name", kind: "readonly", label: "Name", value: "Ada" },
    ],
  });
  sheet.show();
  const texts = (lines.sheet ?? []).map((entry) => String(entry?.text ?? entry ?? "").trim()).filter(Boolean);
  assert.ok(texts.includes("Approve or decline."), JSON.stringify(texts));
  assert.ok(!texts.some((text) => text.startsWith(":")), JSON.stringify(texts));
  assert.ok(texts.includes("Name: Ada"), JSON.stringify(texts));
  sheet.dispose();
});
