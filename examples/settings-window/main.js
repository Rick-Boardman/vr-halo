/**
 * Purpose: the smallest scene that shows Halo's graphics and sound settings
 * window: form controls painted on the HUD's settings window, driving a real
 * quality calibration through injected callbacks.
 *
 * This is the page `scripts/look-at-settings-window.mjs` drives headlessly.
 * The "Show grid" row is an app-owned extra row: its state lives here, not in
 * Halo, the way a game keeps its own modes and persistence.
 */

import * as THREE from "three";
import {
  createSceneHudBootstrap,
  renderHudFrame,
  startAnimationLoop,
} from "../../src/core.js";
import { createHudSettingsWindow, settingsCallbacksFromCalibration } from "../../src/ui/index.js";

const canvas = document.getElementById("c");
let grid = null;

// The bootstrap starts a quality calibration (`quality`); the HUD update ticks it.
const { renderer, scene, camera, hudSystem, navigation, quality: calibration } = createSceneHudBootstrap({
  THREE,
  canvas,
  buildWorld: ({ scene }) => {
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 1.1));
    grid = new THREE.GridHelper(40, 40, 0x5a7090, 0x2a3442);
    scene.add(grid);
    return [];
  },
  hudOptions: { uiPreset: "minimal", visibleWindowKeys: ["hotbar", "xr"] },
  isTyping: () => Boolean(globalThis.__haloSettingsWindow?.isTyping?.()),
  // A demo should not remember the last visitor's choices.
  qualityCalibration: { storage: null },
});

const settings = createHudSettingsWindow({
  THREE,
  hudSystem,
  renderer,
  ...settingsCallbacksFromCalibration(calibration),
  extraRows: [
    {
      kind: "checkbox",
      key: "grid",
      label: "Show grid",
      checked: () => grid.visible,
      onToggle: (next) => {
        grid.visible = next;
      },
    },
  ],
  notes: () => ["Settings live in this page, not in Halo."],
});

hudSystem.setWindowHidden("debug", true);
hudSystem.setWindowHidden("help", true);
// The minimal preset does not open the shared settings window; make it, open
// it if the preset parked it, and give it room for every row.
const settingsWin = hudSystem.ensureSharedWindow("settings");
if (settingsWin.y <= -1000 || settingsWin.collapsed) hudSystem.toggleSettings();
Object.assign(settingsWin, { x: 24, y: 24, w: 440, h: 520 });

globalThis.__haloSettingsWindow = settings;
globalThis.__haloSettingsExample = { hudSystem, calibration, renderer, grid: () => grid };

startAnimationLoop({
  renderer,
  THREE,
  maxDelta: 0.05,
  onFrame: ({ dt }) => {
    settings.prepare();
    renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation });
    settings.afterHud();
  },
});
