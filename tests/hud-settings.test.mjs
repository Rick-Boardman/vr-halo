// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHudHotbarRuntime } from "../src/hud-hotbar-runtime.js";
import { createHudWindowVisibilityRuntime } from "../src/hud-window-visibility-runtime.js";
import { createDefaultWindowPreset, createMinimalWindowPreset } from "../src/hud-window-presets.js";

function hudWith(items) {
  return {
    layoutW: 1280,
    layoutH: 720,
    ui: {
      data: { hotbarItems: items },
      windows: {
        settings: {
          x: 10,
          y: -2000,
          w: 380,
          h: 340,
          collapsed: false,
          _settingsHiddenX: 260,
          _settingsHiddenY: 120,
          _settingsHiddenCollapsed: false,
        },
        help: { x: 10, y: -2000, w: 400, h: 300, collapsed: false },
        debug: { y: -2000 },
      },
    },
  };
}

test("an empty hotbar slot becomes graphics and sound", () => {
  let opened = 0;
  const hud = hudWith(null);
  const bar = createHudHotbarRuntime({
    hud,
    toggleSettings() {
      opened += 1;
    },
  });
  bar.updateSystemHotbarPresentation();
  const items = hud.ui.data.hotbarItems;
  assert.equal(items[7].systemSlot, "graphics");
  assert.equal(items[7].iconText, "GFX");
  assert.equal(items[8].iconText, "DBG");
  assert.equal(items[9].iconText, "HLP");
  assert.equal(items[0], null);
  assert.equal(bar.handleSystemHotbarSlot(7), true);
  assert.equal(opened, 1);
});

test("a filled slot and a game-owned tail stay put", () => {
  const hud = hudWith(null);
  const bar = createHudHotbarRuntime({
    hud,
    toggleSettings() {
      throw new Error("settings should not capture a filled slot");
    },
  });
  const next = new Array(10).fill(null);
  next[7] = { shortLabel: "MAP", tooltip: "Map" };
  next[9] = { systemSlot: false, shortLabel: "OWN" };
  bar.setHotbarItems(next);
  assert.equal(hud.ui.data.hotbarItems[7].shortLabel, "MAP");
  assert.equal(hud.ui.data.hotbarItems[7].systemSlot, undefined);
  assert.equal(hud.ui.data.hotbarItems[9].shortLabel, "OWN");
  assert.equal(bar.handleSystemHotbarSlot(7), false);

  const ownedTail = new Array(10).fill(null);
  ownedTail[9] = { systemSlot: false, shortLabel: "OWN" };
  bar.setHotbarItems(ownedTail);
  assert.equal(hud.ui.data.hotbarItems[7].systemSlot, "graphics");
  assert.equal(hud.ui.data.hotbarItems[9].shortLabel, "OWN");
  assert.equal(hud.ui.data.hotbarItems[9].iconText, undefined);
});

test("restore hidden panels leaves settings and help parked", () => {
  const hud = hudWith(null);
  hud.ui.windows.chat = { x: 4, y: -2000, w: 100, h: 80, collapsed: false, _hiddenX: 20, _hiddenY: 30 };
  const vis = createHudWindowVisibilityRuntime({
    hud,
    renderer: { xr: { isPresenting: false } },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    markDirty() {},
    titleHeightPx: 22,
    hiddenX: 9000,
    hiddenY: -2000,
  });
  assert.equal(vis.restoreAllHidden(), true);
  assert.ok(hud.ui.windows.settings.y < -1000);
  assert.ok(hud.ui.windows.help.y < -1000);
  assert.equal(hud.ui.windows.chat.y, 30);
  vis.toggleSettings();
  assert.equal(hud.ui.windows.settings.x, 260);
  assert.equal(hud.ui.windows.settings.y, 120);
});

test("settings windows start parked in both presets", () => {
  for (const create of [createDefaultWindowPreset, createMinimalWindowPreset]) {
    const ui = create({ windowClampMode: "none", windowClampMinVisiblePx: 32 });
    assert.equal(ui.order.at(-1), "settings");
    assert.ok(ui.windows.settings.y < -1000);
    assert.equal(Number.isFinite(ui.windows.settings._settingsHiddenX), true);
    assert.equal(Number.isFinite(ui.windows.settings._settingsHiddenY), true);
  }
});
