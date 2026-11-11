// SPDX-License-Identifier: Apache-2.0
/**
 * The standard graphics and sound settings window: Halo's `settings` HUD window
 * painted with form controls (quality dropdown, pixel-ratio number field,
 * automatic checkbox, volume slider, mute checkbox, calibrate button) plus any
 * rows the app adds.
 *
 * Quality and sound reach the app only through the injected `quality` and
 * `audio` callbacks. `settingsCallbacksFromCalibration` builds both from a
 * `createQualityCalibration` instance; an app with its own policy passes its own.
 * Palette, presets, extra modes, asset quality and persistence stay in the app.
 *
 * Frame order: call `prepare()` before the HUD's `update()` (a click can press
 * and release inside one frame, and the update clears `justPressed`), then
 * `afterHud()` after it. Desktop mouse and touch arrive through `hud.pointer`,
 * the XR controller ray through `hud.vrPointer`, both in layout pixels.
 * `prepare()` keeps only the press edge; `afterHud()` reads the position after
 * the HUD has refreshed its ray picking, and a press reaches the controls only
 * when the HUD gave it to this window: inside the window's visible rectangle,
 * this window first in the HUD's own hit order (a window over it, or an open
 * context menu, takes the press), and in XR on a ray that hits this window
 * (`vrPointer.active` and `vrPointer.windowKey`). A slider being dragged keeps
 * the pointer until release, wherever it goes. A press the window does not
 * own closes an open list and commits typing. The window's `minH` grows to the
 * height the rows need, so resizing cannot hide a control.
 *
 * Render order: the control texture is a plane added to the HUD plane that
 * holds the window plate, copying the plate's transform rather than parenting
 * to it, because a skinned frame hides the plate and its children with it. It
 * draws 20 above the plate with depth test off, like the rest of the HUD.
 */
import { createHudFormController, sanitizeNumberText } from "./hud-form-controls.js";
import { HUD_WINDOW_TITLE_HEIGHT_PX } from "./hud-layout-policy.js";
import { createWebXrSystemKeyboardBridge } from "./webxr-system-keyboard.js";

const HIDDEN_Y = -1000;

/**
 * Low, Medium and High stops over a tier list (fewer when tiers are few).
 * @param {number[]} tiers
 * @returns {Array<{ name: string, index: number }>}
 */
export function qualityOptions(tiers) {
  const count = Array.isArray(tiers) ? tiers.length : 0;
  const last = Math.max(0, count - 1);
  const medium = Math.max(0, Math.min(last, Math.floor((count - 1) / 2)));
  const options = [{ name: "Low", index: 0 }];
  if (medium !== 0) options.push({ name: "Medium", index: medium });
  if (last !== medium) options.push({ name: "High", index: last });
  return options;
}

/**
 * The named stop for a tier index, or "Custom" for a tier between stops.
 * @param {number} index
 * @param {number[]} tiers
 */
export function qualityLabel(index, tiers) {
  const match = qualityOptions(tiers).find((option) => option.index === index);
  return match ? match.name : "Custom";
}

/**
 * The tier index whose pixel ratio is nearest a typed value.
 * @param {number} value
 * @param {number[]} tiers
 */
export function nearestTierIndex(value, tiers) {
  if (!Array.isArray(tiers) || !tiers.length || !Number.isFinite(value)) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < tiers.length; i += 1) {
    const dist = Math.abs(tiers[i] - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * The window's `quality` and `audio` callbacks over a quality calibration.
 * @param {ReturnType<typeof import("./quality-calibration.js").createQualityCalibration>} calibration
 */
export function settingsCallbacksFromCalibration(calibration) {
  if (!calibration) throw new TypeError("[halo:settings] calibration is required");
  return {
    quality: {
      getState: () => ({
        tiers: calibration.tiers,
        index: calibration.index,
        pixelRatio: calibration.pixelRatio,
        mode: calibration.mode,
        phase: calibration.phase,
      }),
      lockTier: (index) => calibration.lockTier(index),
      setAuto: () => calibration.setAuto(),
      recalibrate: () => calibration.recalibrate(),
    },
    audio: {
      getState: () => ({ level: calibration.audio.level, muted: calibration.audio.muted }),
      setVolume: (level) => calibration.setVolume(level),
      setMuted: (muted) => calibration.setMuted(muted),
    },
  };
}

function requireFunctions(name, object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] !== "function") {
      throw new TypeError(`[halo:settings] ${name}.${key} must be a function`);
    }
  }
}

/**
 * @param {object} options
 * @param {object} options.THREE Three.js namespace (the app's single instance).
 * @param {{ hud?: object }} options.hudSystem The object createHudSystem returns.
 * @param {{ xr?: { isPresenting?: boolean } }} [options.renderer]
 * @param {{ getState: () => { tiers: number[], index: number, pixelRatio: number, mode: string, phase: string }, lockTier: (index: number) => void, setAuto: () => void, recalibrate: () => void }} options.quality
 * @param {{ getState: () => { level: number, muted: boolean }, setVolume: (level: number) => void, setMuted: (muted: boolean) => void }} options.audio
 * @param {Array<object>} [options.extraRows] Form rows (see createHudFormController) shown above the calibrate button.
 * @param {() => string[]} [options.notes] Lines painted under the calibrate button.
 * @param {object} [options.palette] Overrides for DEFAULT_FORM_PALETTE.
 * @param {object} [options.metrics] Overrides for the row metrics.
 * @param {string} [options.windowKey] HUD window to paint, "settings" by default.
 * @param {EventTarget | null} [options.keyTarget] Where desktop keys are heard, `window` by default.
 * @param {Document | null} [options.documentRef]
 * @param {(options: object) => { open: () => boolean, close: () => void, isSupported: () => boolean }} [options.createKeyboard]
 * @param {() => number} [options.now]
 */
export function createHudSettingsWindow({
  THREE,
  hudSystem,
  renderer = null,
  quality,
  audio,
  extraRows = [],
  notes = null,
  palette = {},
  metrics = {},
  windowKey = "settings",
  keyTarget = globalThis.window ?? null,
  documentRef = globalThis.document ?? null,
  createKeyboard = createWebXrSystemKeyboardBridge,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  if (!THREE) throw new TypeError("[halo:settings] THREE is required");
  if (!hudSystem) throw new TypeError("[halo:settings] hudSystem is required");
  requireFunctions("quality", quality, ["getState", "lockTier", "setAuto", "recalibrate"]);
  requireFunctions("audio", audio, ["getState", "setVolume", "setMuted"]);

  const fontFamily = palette.font ?? "Segoe UI, Trebuchet MS, sans-serif";
  const inkColor = palette.ink ?? "#e8eef7";
  const q = () => quality.getState() ?? {};
  const a = () => audio.getState() ?? {};
  const ratioText = () => {
    const value = Number(q().pixelRatio);
    return Number.isFinite(value) ? value.toFixed(2) : "";
  };

  const rows = [
    {
      kind: "status",
      key: "status",
      text: () => `${q().phase && q().phase !== "settled" ? "Calibrating" : "Picture"} ${ratioText()}`,
    },
    {
      kind: "dropdown",
      key: "quality",
      label: "Quality",
      options: () => qualityOptions(q().tiers).map((option) => ({ value: option.index, label: option.name })),
      value: () => q().index,
      text: () => qualityLabel(q().index, q().tiers),
      onSelect: (index) => quality.lockTier(index),
    },
    {
      kind: "number",
      key: "ratio",
      label: "Ratio",
      value: ratioText,
      sanitize: (text) => sanitizeNumberText(text, { maxLength: 5 }),
      onCommit: (text) => {
        const value = Number(text);
        if (!Number.isFinite(value)) return;
        const state = q();
        const index = nearestTierIndex(value, state.tiers);
        if (index !== state.index) quality.lockTier(index);
      },
    },
    {
      kind: "checkbox",
      key: "automatic",
      label: "Automatic",
      checked: () => q().mode === "auto",
      onToggle: () => {
        const state = q();
        if (state.mode === "auto") quality.lockTier(state.index);
        else quality.setAuto();
      },
    },
    {
      kind: "slider",
      key: "volume",
      label: "Volume",
      value: () => Number(a().level) || 0,
      onInput: (level) => audio.setVolume(level),
    },
    {
      kind: "checkbox",
      key: "mute",
      label: "Mute",
      checked: () => !!a().muted,
      onToggle: (next) => audio.setMuted(next),
    },
    ...(Array.isArray(extraRows) ? extraRows : []),
    { kind: "button", key: "calibrate", label: "Calibrate again", onPress: () => quality.recalibrate() },
  ];

  const form = createHudFormController({ rows, palette, metrics, now });
  let keyboard = null;
  try {
    keyboard = createKeyboard?.({
      renderer,
      documentRef,
      getValue: () => form.draftText,
      onInput: (value) => form.setDraft(value),
      onDismiss: () => form.commit(),
    }) ?? null;
  } catch (error) {
    // An XR keyboard is optional; desktop typing still works without it.
    console.warn("[halo:settings] system keyboard unavailable:", error?.message ?? error);
    keyboard = null;
  }
  form.setKeyboard(keyboard);

  let mesh = null;
  let texture = null;
  let canvas = null;
  let signature = "";
  let prevDown = false;
  let sample = { pressed: false, menuOpen: false };
  let disposed = false;

  const onKeyDown = (event) => {
    form.handleKey(event);
  };
  keyTarget?.addEventListener?.("keydown", onKeyDown, true);

  const root = () => hudSystem?.hud ?? null;
  const settingsWindow = () => root()?.ui?.windows?.[windowKey] ?? null;
  const shown = (win) => !!win && !win.collapsed && win.y > HIDDEN_Y;

  function noteLines() {
    if (typeof notes !== "function") return [];
    const lines = notes();
    if (!Array.isArray(lines)) return [];
    return lines.map((line) => String(line ?? "")).filter((line) => line !== "");
  }

  /** Before the HUD update: sample the pointer and stop the window's own text and scrolling. */
  function prepare() {
    if (disposed) return;
    const win = settingsWindow();
    if (win) {
      win.scrollable = false;
      win.contentBgOpacity = 0;
      clearStockLines(win);
    }
    if (win) fitHeight(win);
    const hud = root();
    const pointer = activePointer(hud);
    const down = !!pointer?.down;
    sample = {
      pressed: !!pointer?.justPressed || (down && !prevDown),
      // The HUD's update gives a press to an open context menu before any window.
      menuOpen: !!hud?.overlay?.contextMenu?.open,
    };
    prevDown = down;
  }

  function activePointer(hud) {
    return renderer?.xr?.isPresenting === true ? hud?.vrPointer : hud?.pointer;
  }

  // The rows' height (and the notes under them) is the window's minimum, so
  // the HUD's resize clamp keeps every control on the window.
  function fitHeight(win) {
    const lines = noteLines();
    const extra = lines.length ? 22 + (lines.length - 1) * 20 + 10 : 0;
    const need = form.contentHeight(win.w, extra);
    if (!Number.isFinite(need)) return;
    if (!(Number(win.minH) >= need)) win.minH = need;
    if (!win.collapsed && !(Number(win.h) >= need)) win.h = need;
  }

  // The HUD's window hit order (hud-click-runtime getWindowHitTestOrder):
  // windows being dragged or resized, then the focused window, then the rest
  // from the top of the stack down. Collapsed windows hit on their title bar.
  function topWindowAt(hud, x, y) {
    const windows = hud?.ui?.windows ?? {};
    const order = Array.isArray(hud?.ui?.order) ? hud.ui.order : [];
    const keys = [];
    for (let i = order.length - 1; i >= 0; i -= 1) {
      if (windows[order[i]]?.dragging || windows[order[i]]?.resizing) keys.push(order[i]);
    }
    if (hud?.ui?.focus) keys.push(hud.ui.focus);
    for (let i = order.length - 1; i >= 0; i -= 1) keys.push(order[i]);
    for (const key of keys) {
      const w = windows[key];
      if (!w) continue;
      const h = w.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : w.h;
      if (x >= w.x && y >= w.y && x < w.x + w.w && y < w.y + h) return key;
    }
    return null;
  }

  /** Whether the HUD gave the pointer at (x, y) to this window this frame. */
  function owns(hud, win, pointer, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < win.x || y < win.y || x >= win.x + win.w || y >= win.y + win.h) return false;
    if (renderer?.xr?.isPresenting === true && (pointer?.active !== true || pointer?.windowKey !== windowKey)) {
      return false;
    }
    return topWindowAt(hud, x, y) === windowKey;
  }

  /** After the HUD update: hide the stock content, route the pointer, paint. */
  function afterHud() {
    if (disposed) return;
    const win = settingsWindow();
    if (!win) return;
    silenceChrome();
    ensureMesh(win);
    if (!shown(win)) form.reset();
    else {
      // Read the pointer now: in XR the HUD update has just refreshed the ray.
      const hud = root();
      const pointer = activePointer(hud);
      const x = Number(pointer?.x);
      const y = Number(pointer?.y);
      const down = !!pointer?.down;
      const mine = !sample.menuOpen && owns(hud, win, pointer, x, y);
      if (sample.pressed && !mine) form.reset();
      const tracking = mine || (!!form.slidingKey && down);
      form.pointer({
        x: tracking ? x - win.x : NaN,
        y: tracking ? y - win.y : NaN,
        down,
        pressed: sample.pressed && mine,
        width: win.w,
        height: win.h,
      });
    }
    sample = { pressed: false, menuOpen: false };
    paint(win);
  }

  // The window's own text lines draw as Troika meshes under the controls. A
  // calibration attached to the HUD (createSceneHudBootstrap attaches one)
  // rewrites them whenever its text changes, so clear them before every HUD
  // update that would draw some.
  function clearStockLines(win) {
    const data = root()?.ui?.data;
    const storeKey = typeof win.linesKey === "function" ? win.linesKey() : `${windowKey}Lines`;
    const lines = data?.[storeKey];
    if (Array.isArray(lines) && lines.length && typeof hudSystem.setWindowLines === "function") {
      hudSystem.setWindowLines(windowKey, []);
    }
  }

  function silenceChrome() {
    const objs = root()?.objects?.windows?.[windowKey];
    if (!objs) return;
    for (const part of [objs.contentBg, objs.scrollTrack, objs.scrollThumb, objs.scrollUpBtn, objs.scrollDownBtn]) {
      if (part) part.visible = false;
    }
    const text = objs.contentText;
    if (text) text.visible = false;
    if (text?.mesh) text.mesh.visible = false;
  }

  function ensureMesh(win) {
    const bg = root()?.objects?.windows?.[windowKey]?.bg;
    const plane = bg?.parent;
    if (!plane?.add) return;
    if (!mesh) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.frustumCulled = false;
      mesh.name = `halo-settings-controls:${windowKey}`;
    }
    if (mesh.parent !== plane) plane.add(mesh);
    mesh.position.copy(bg.position);
    mesh.quaternion.copy(bg.quaternion);
    mesh.scale.copy(bg.scale);
    mesh.renderOrder = (bg.renderOrder || 0) + 20;
    mesh.visible = shown(win);
  }

  function paint(win) {
    if (!mesh) return;
    const visible = shown(win);
    const lines = noteLines();
    const sig = `${visible}|${lines.join("\n")}|${form.signature(win.w, win.h)}`;
    if (sig === signature && texture) return;
    signature = sig;
    const scale = Math.min(2, 2048 / Math.max(win.w, win.h, 1));
    const width = Math.max(1, Math.round(win.w * scale));
    const height = Math.max(1, Math.round(win.h * scale));
    if (!canvas) {
      canvas = documentRef?.createElement?.("canvas") ?? null;
      if (!canvas) throw new Error("[halo:settings] no document to create the control canvas");
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      // A CanvasTexture keeps the GPU size it was first uploaded at.
      texture?.dispose();
      texture = null;
      mesh.material.map = null;
    }
    const view = canvas.getContext("2d", { alpha: true });
    if (!view) throw new Error("[halo:settings] 2D canvas context unavailable");
    view.setTransform(scale, 0, 0, scale, 0, 0);
    view.clearRect(0, 0, win.w, win.h);
    if (visible) {
      const items = form.draw(view, win.w, win.h);
      const anchor = items.find((item) => item.key === "calibrate")?.box;
      if (anchor && lines.length) {
        view.font = `14px ${fontFamily}`;
        view.fillStyle = inkColor;
        view.textAlign = "left";
        view.textBaseline = "middle";
        let y = anchor.y + anchor.h + 22;
        for (const line of lines) {
          view.fillText(line, anchor.x, y);
          y += 20;
        }
      }
    }
    upload();
  }

  function upload() {
    const material = mesh.material;
    if (!texture) {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.premultiplyAlpha = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      material.map = texture;
    }
    texture.needsUpdate = true;
    material.needsUpdate = true;
  }

  /** Remove the key listener, close the XR keyboard, and free the mesh and texture. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    keyTarget?.removeEventListener?.("keydown", onKeyDown, true);
    form.cancel();
    keyboard?.close?.();
    keyboard = null;
    form.setKeyboard(null);
    if (mesh) {
      mesh.removeFromParent?.();
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    }
    texture?.dispose?.();
    mesh = null;
    texture = null;
    canvas = null;
  }

  return {
    prepare,
    afterHud,
    dispose,
    form,
    isTyping: () => form.isTyping(),
    get mesh() {
      return mesh;
    },
  };
}
