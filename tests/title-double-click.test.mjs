// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHudClickRuntime } from "../src/hud-click-runtime.js";
import { getHudWindowControlRects } from "../src/hud-window-skin-runtime.js";
import { HudWindowBase } from "../src/hud-window-model.js";

const contains = (x, y, w, h, px, py) => px >= x && py >= y && px < x + w && py < y + h;

test("title double-click toggles an ordinary frame; controls and overlay keep precedence", () => {
  const win = new HudWindowBase({ key: "palette", title: "Palette", x: 50, y: 60, w: 320, h: 240, closeable: true });
  const objects = { closeBtn: {}, minBtn: {}, resizeHandle: {} };
  const hud = { ui: { order: ["palette"], windows: { palette: win } },
    overlay: {}, objects: { windows: { palette: objects } } };
  let dirty = 0, drag = null;
  const runtime = createHudClickRuntime({ hud, titleHeightPx: 28, rectContains: contains,
    rectContainsSlop: contains, getDragMode: () => drag, markDirty: () => dirty++ });
  const cursor = { x: 145, y: 73 };
  assert.equal(runtime.getTitleDoubleClickWindow(cursor.x, cursor.y), win);
  assert.equal(runtime.handleTitleDoubleClick(win, cursor), true);
  assert.equal(win.collapsed, true);
  assert.equal(win.setLayoutCollapsed(false), false);
  assert.equal(win.collapsed, true);
  assert.equal(runtime.handleTitleDoubleClick(win, cursor), true);
  assert.equal(win.collapsed, false);
  assert.deepEqual([win.x, win.y, win.w, win.h], [50, 60, 320, 240]);
  assert.equal(dirty, 2);
  for (const rect of Object.values(getHudWindowControlRects(win, objects, 28)).slice(1).filter(Boolean)) {
    assert.equal(runtime.getTitleDoubleClickWindow(rect.x + 1, rect.y + 1), null);
  }
  assert.equal(runtime.getTitleDoubleClickWindow(125, 125), null);
  drag = "move";
  assert.equal(runtime.handleTitleDoubleClick(win, cursor), false);
  drag = null;
  hud.overlay.contextMenu = { open: true };
  assert.equal(runtime.handleTitleDoubleClick(win, cursor), false);
});

test("explicit commands still win and automatic layout can be intentionally reset", () => {
  const win = new HudWindowBase({ key: "panel" });
  assert.equal(win.setLayoutCollapsed(true), true);
  win.toggleUserCollapsed();
  assert.equal(win.collapsed, false);
  assert.equal(win.setLayoutCollapsed(true), false);
  win.setCollapsed(true);
  assert.equal(win.collapsed, true);
  assert.equal(win.setLayoutCollapsed(false), false);
  win.resetUserCollapsedChoice();
  assert.equal(win.setLayoutCollapsed(false), true);
  assert.equal(win.collapsed, false);
});

test("editing takes precedence and a titled panel can collapse without a minimize button", () => {
  let renamed = 0;
  const win = new HudWindowBase({ key: "editor", title: "Editor", x: 0, y: 20, titleEditable: true,
    onTitleDoubleClick() { renamed++; } });
  const hud = { ui: { order: ["editor"], windows: { editor: win } } };
  const runtime = createHudClickRuntime({ hud, titleHeightPx: 28, rectContains: contains,
    rectContainsSlop: contains, markDirty() {} });
  assert.equal(runtime.handleTitleDoubleClick(win, { x: 95, y: 32 }), true);
  assert.equal(renamed, 1);
  assert.equal(win.collapsed, false);
  win.onTitleDoubleClick = null;
  assert.equal(runtime.getTitleDoubleClickWindow(95, 32), null);
  win.titleEditable = false;
  win.minimizable = false;
  assert.equal(runtime.getTitleDoubleClickWindow(95, 32), win);
  win.collapseOnTitleDoubleClick = false;
  assert.equal(runtime.getTitleDoubleClickWindow(95, 32), null);
  win.collapseOnTitleDoubleClick = true;
  const overlay = new HudWindowBase({ key: "higher", x: 60, y: 0, minimizable: false });
  hud.ui.order.push("higher");
  hud.ui.windows.higher = overlay;
  assert.equal(runtime.getTitleDoubleClickWindow(95, 32), null);
});
