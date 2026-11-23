// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createHudUiOverlays } from "../src/ui-overlays.js";
import { contrastHudInk, hudContrastRatio } from "../src/hud-appearance-tokens.js";

test("native tooltip style applies to plain and external rich tips without changing standalone colors", () => {
  const box = () => ({ material: { color: new THREE.Color(0x294763), opacity: 0.92 } });
  const overlay = { tooltipBg: box(), tooltipOutline: box(), tooltipText: { mesh: {} } };
  const palette = { surface: 0xf8fafc, text: 0x22354a, fieldBorder: 0x5e748a };
  const hud = { layoutW: 320, layoutH: 200, ui: { theme: { contentTokens: palette } },
    overlay: { tooltip: { visible: true, x: 315, y: 199, text: "Resume local workflow draft" } },
    objects: { overlay } };
  let plain, rich;
  const runtime = createHudUiOverlays({ THREE, hud, renderer: { xr: {} }, clamp: THREE.MathUtils.clamp,
    positionRect: (mesh, x, y, w, h) => Object.assign(mesh, { x, y, w, h }),
    hideColorLayers() {}, clearPlainTextMaybeTroika() {},
    setPlainTextMaybeTroika: data => { plain = data; }, setColoredMultilineText: data => { rich = data; },
  });
  runtime.layoutTooltip();
  assert.equal(plain.text.replaceAll("\n", " "), "Resume local workflow draft");
  assert.equal(plain.color, palette.text);
  assert.equal(overlay.tooltipBg.material.color.getHex(), palette.surface);
  assert.equal(overlay.tooltipBg.material.opacity, 1);
  assert.equal(overlay.tooltipOutline.visible, true);
  assert(overlay.tooltipOutline.x + overlay.tooltipOutline.w <= hud.layoutW);
  assert(overlay.tooltipOutline.y + overlay.tooltipOutline.h <= hud.layoutH);
  assert(hudContrastRatio(plain.color, palette.surface) >= 4.5);
  assert(hudContrastRatio(palette.fieldBorder, palette.surface) >= 3);

  const token = "ThisCannotFitInOneLineWithoutWrapping".repeat(2);
  hud.overlay.externalTooltip = { visible: true, x: 15, y: 15, entries: [{ text: token, color: 0xffffff }] };
  runtime.layoutTooltip();
  assert.equal(rich.entries.map(row => row.text).join(""), token);
  assert(rich.entries.length > 1);
  assert.equal(rich.entries[0].color, contrastHudInk(0xffffff, palette.surface, palette.text));

  hud.ui.theme = {};
  runtime.layoutTooltip();
  assert.equal(overlay.tooltipBg.material.color.getHex(), 0x294763);
  assert.equal(overlay.tooltipBg.material.opacity, 0.92);
  assert.equal(overlay.tooltipOutline.visible, false);
});
