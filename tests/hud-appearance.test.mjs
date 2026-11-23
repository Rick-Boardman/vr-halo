// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHudAppearancePreference, createHudAppearanceSettingsHotbarItem,
  createHudAppearanceSettingsRows, installHudAppearanceSettings, resolveHudAppearancePreference } from "../src/hud-appearance.js";

function mockPlatform({ light = true, stored = [] } = {}) {
  const storage = new Map(stored), changes = new Set();
  const media = {
    matches: light,
    addEventListener: (key, cb) => { assert.equal(key, "change"); changes.add(cb); },
    removeEventListener: (key, cb) => { assert.equal(key, "change"); changes.delete(cb); },
  };
  return { changes, storage, systemLight(value) {
    media.matches = value;
    for (const callback of changes) callback({ matches: value });
  }, platform: {
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    matchMedia: () => media,
  } };
}

test("defaults to System, follows only in System, and disposes cleanly", () => {
  const p = mockPlatform();
  assert.deepEqual(resolveHudAppearancePreference(p), { preference: "system", mode: "light" });
  const h = createHudAppearancePreference(p);
  const observed = [];
  h.subscribe(state => observed.push(state));
  p.systemLight(false);
  h.setPreference("light");
  p.systemLight(true);
  p.systemLight(false);
  h.setPreference("system");
  assert.deepEqual(observed, [
    { preference: "system", mode: "dark" },
    { preference: "light", mode: "light" },
    { preference: "system", mode: "dark" },
  ]);
  assert.equal(p.storage.get("halo:appearance"), "system");
  assert.equal(h.setPreference("sepia"), false);
  h.dispose();
  assert.equal(p.changes.size, 0);
  assert.equal(h.setPreference("light"), false);
});

test("migrates legacy explicit preference once; valid host override is transient", () => {
  const p = mockPlatform({ stored: [["legacy", "dark"]] });
  const opts = { platform: p.platform, storageKey: "new", legacyStorageKeys: ["legacy"] };
  assert.deepEqual(resolveHudAppearancePreference(opts), { preference: "dark", mode: "dark" });
  assert.equal(p.storage.has("new"), false);
  const h = createHudAppearancePreference(opts);
  assert.equal(p.storage.get("new"), "dark");
  h.setPreference("system");
  const h2 = createHudAppearancePreference({ ...opts, initialMode: "dark" });
  assert.equal(h2.getMode(), "dark");
  assert.equal(p.storage.get("new"), "system");
  assert.equal(resolveHudAppearancePreference(opts).mode, "light");
  h.dispose(); h2.dispose();
});

test("Settings opens on demand, composes rows, switches live and closes without changing preference", () => {
  const p = mockPlatform(), preference = createHudAppearancePreference(p);
  const windows = new Map();
  let rows;
  const hud = {
    createWindow: (key, options) => windows.set(key, options),
    destroyWindow: key => windows.delete(key),
    setWindowLines: (_key, lines) => { rows = lines; },
  };
  const control = installHudAppearanceSettings(hud, { preference, windowKey: "example-settings",
    getAdditionalRows: () => [{ text: "Audio" }] });
  assert.equal(windows.size, 0);
  assert.equal(createHudAppearanceSettingsHotbarItem(p).iconText, "SET");
  assert.equal(control.open(), true);
  assert.equal(control.open(), false);
  assert.equal(windows.get("example-settings").closeable, true);
  assert.deepEqual(rows.map(row => row.text), ["Appearance", "System (Light)", "Light", "Dark", "Audio"]);
  rows[3].actionButtonOnClick();
  assert.equal(preference.getMode(), "dark");
  assert.equal(rows[3].actionButtonText, "Active");
  windows.get("example-settings").onClose();
  assert.equal(windows.size, 0);
  assert.equal(control.toggle(), true);
  assert.equal(createHudAppearanceSettingsRows(preference)[3].actionButtonText, "Active");
  control.dispose();
  assert.equal(windows.size, 0);
  assert.equal(preference.getMode(), "dark");
  preference.dispose();
});
