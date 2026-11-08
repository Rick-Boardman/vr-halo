import test from "node:test";
import assert from "node:assert/strict";
import { createHudWindowLayoutRuntime } from "../src/hud-window-layout-runtime.js";
import {
  HUD_XR_WINDOW_MIN_H_PX,
  HUD_XR_WINDOW_MIN_W_PX,
} from "../src/hud-layout-policy.js";
import { HUD_TEXT_DEFAULT_COLOR } from "../src/hud-text-style.js";
import {
  createDefaultWindowPreset,
  createMinimalWindowPreset,
} from "../src/hud-window-presets.js";
import {
  HUD_STONE_SKIN_CHROME,
  applyHudWindowSkinToWindows,
  ensureXrWindowFitsSkin,
  getHudNineSliceCornerSize,
  xrActionLabelLayout,
  xrWindowKeysForSkin,
} from "../src/hud-window-skin-runtime.js";

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

class PlaneGeometry {
  constructor() {}
}

class MeshBasicMaterial {
  constructor(opts = {}) {
    this.map = opts.map ?? null;
    this.transparent = !!opts.transparent;
    this.opacity = 1;
    this.needsUpdate = false;
    this.color = { setHex() {} };
  }
}

class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.userData = {};
    this.visible = true;
    this.frustumCulled = true;
  }
}

const THREE = { PlaneGeometry, MeshBasicMaterial, Mesh };

function hudWith({ xr, status = true, hotbar = false, xrObjects = true }) {
  const windows = {};
  const objects = {};
  if (status) {
    windows.status = { x: 16, y: 16, w: 420, h: 270, minW: 200, minH: 64, title: "STATUS" };
    objects.status = {};
  }
  if (hotbar) {
    windows.hotbar = { x: 400, y: 800, w: 540, h: 84, minW: 200, minH: 40, title: "" };
    objects.hotbar = {};
  }
  if (xr) {
    windows.xr = xr;
    if (xrObjects) objects.xr = {};
  }
  return {
    plane: { add() {} },
    ui: { windows },
    objects: { windows: objects },
  };
}

test("a new HUD preset gives Enter VR enough room for the stone frame", () => {
  for (const ui of [createDefaultWindowPreset(), createMinimalWindowPreset()]) {
    const xr = ui.windows.xr;
    assert.equal(xr.title, "VR");
    assert.ok(xr.w >= HUD_XR_WINDOW_MIN_W_PX);
    assert.ok(xr.h >= HUD_XR_WINDOW_MIN_H_PX);
    assert.ok(xr.minW >= HUD_XR_WINDOW_MIN_W_PX);
    assert.ok(xr.minH >= HUD_XR_WINDOW_MIN_H_PX);
  }
});

test("skinning any panel also skins Enter VR and grows a short saved window", () => {
  const xr = { x: 1000, y: 0, w: 240, h: 64, minW: 200, minH: 64, title: "VR" };
  const hud = hudWith({ xr, hotbar: true });
  const applied = applyHudWindowSkinToWindows({ THREE, hud }, ["status"], {}, 40);
  assert.deepEqual(applied, ["status", "xr"]);
  assert.equal(hud.objects.windows.hotbar.nineSlice, undefined);
  assert.ok(xr.h >= HUD_XR_WINDOW_MIN_H_PX);
  assert.ok(xr.w >= HUD_XR_WINDOW_MIN_W_PX);
  assert.ok(xr.minH >= 40 * 2 + 28);
  assert.ok(getHudNineSliceCornerSize(hud.objects.windows.xr, xr, 28) >= 40);
  assert.equal(hud.ui.stoneSkin, HUD_STONE_SKIN_CHROME);
});

test("a caller who already named the VR window does not skin it twice", () => {
  const hud = hudWith({
    xr: { x: 0, y: 0, w: 300, h: 136, minW: 300, minH: 136, title: "VR" },
  });
  assert.deepEqual(xrWindowKeysForSkin(["status", "xr", "status", ""], hud), ["status", "xr"]);
  assert.deepEqual(xrWindowKeysForSkin(["status"], { ui: { windows: {} }, objects: { windows: {} } }), ["status"]);
});

test("Enter VR is left alone until both its model and its meshes exist", () => {
  const xr = { x: 0, y: 0, w: 240, h: 64, minW: 200, minH: 64, title: "VR" };
  const hud = hudWith({ xr, xrObjects: false });
  const applied = applyHudWindowSkinToWindows({ THREE, hud }, ["status"], {}, 40);
  assert.deepEqual(applied, ["status"]);
  assert.equal(xr.h, 64);
});

test("a larger corner still leaves a well under the title", () => {
  const xr = { w: 100, h: 40, minW: 80, minH: 40 };
  assert.equal(ensureXrWindowFitsSkin(xr, 80), true);
  assert.ok(xr.h >= 80 * 2 + 28);
  assert.ok(xr.w >= 80 * 2 + 160);
  assert.equal(ensureXrWindowFitsSkin(xr, 80), false);
});

test("ENTER VR and EXIT VR share one inset parchment label", () => {
  const win = { x: 100, y: 20, w: 300, h: 136 };
  const objs = { nineSlice: { cornerSize: 40 } };
  const hud = { ui: { stoneSkin: HUD_STONE_SKIN_CHROME } };
  for (const label of ["ENTER VR", "EXIT VR"]) {
    const placed = xrActionLabelLayout(win, objs, hud, label, 3);
    assert.ok(placed.x >= win.x + 40, label);
    assert.ok(placed.y >= win.y + 40, label);
    assert.equal(placed.color, HUD_STONE_SKIN_CHROME.parchment);
    assert.equal(placed.outlineWidth, 2);
    assert.equal(placed.outlineColor, HUD_STONE_SKIN_CHROME.ink);
    assert.equal(placed.fontWeight, "700");
  }
  const plain = xrActionLabelLayout(win, {}, null, "ENTER VR", 3);
  assert.equal(plain.color, HUD_TEXT_DEFAULT_COLOR);
  assert.equal(plain.outlineWidth, 0);
  assert.equal(plain.fontWeight, null);
});

test("a narrow viewer cannot squash the Enter VR frame below its floor", () => {
  const xr = { x: 8, y: 16, w: 300, h: 136, minW: 300, minH: 136, title: "VR" };
  const hud = {
    layoutW: 800,
    layoutH: 600,
    xr: { supported: true },
    ui: { windows: { xr }, order: ["xr"], _layoutInitialized: false, data: {} },
  };
  const layout = createHudWindowLayoutRuntime({
    hud,
    renderer: { xr: { isPresenting: false } },
    clamp,
    titleHeightPx: 28,
    rightX: 2000,
    hiddenY: -2000,
    windowClampMinVisiblePxDefault: 32,
  });
  layout.ensureDefaultLayout();
  assert.ok(xr.w >= 300);
  assert.ok(xr.h >= 136);
});
