// SPDX-License-Identifier: Apache-2.0

const QUERY = "(prefers-color-scheme: light)";
const CHOICES = Object.freeze(["system", "light", "dark"]);
const DEFAULT_KEY = "halo:appearance";
let keyboardSerial = 0;

function readChoice(platform, key) {
  if (!key) return null;
  try {
    const value = platform.localStorage?.getItem(key);
    return CHOICES.includes(value) ? value : null;
  } catch { return null; }
}

function saveChoice(platform, key, value) {
  try { platform.localStorage?.setItem(key, value); } catch { /* private embed */ }
}

function systemPreference(platform) {
  try { return platform.matchMedia?.(QUERY) ?? null; } catch { return null; }
}

function initialChoice({ platform, storageKey, legacyStorageKeys, initialMode }) {
  if (CHOICES.includes(initialMode)) return { preference: initialMode };
  const saved = readChoice(platform, storageKey);
  if (saved) return { preference: saved };
  for (const legacyKey of legacyStorageKeys) {
    const legacy = readChoice(platform, legacyKey);
    if (legacy) return { preference: legacy, migrated: true };
  }
  return { preference: "system" };
}

function effectiveMode(preference, matches) {
  return preference === "system" ? (matches ? "light" : "dark") : preference;
}

/** Resolve startup colors without observing or writing platform state. */
export function resolveHudAppearancePreference({ platform = globalThis, storageKey = DEFAULT_KEY,
  legacyStorageKeys = [], initialMode } = {}) {
  const { preference } = initialChoice({ platform, storageKey, legacyStorageKeys, initialMode });
  return { preference, mode: effectiveMode(preference, systemPreference(platform)?.matches) };
}

/** One opt-in preference instance; it never applies host styles directly. */
export function createHudAppearancePreference({ platform = globalThis, storageKey = DEFAULT_KEY,
  legacyStorageKeys = [], initialMode } = {}) {
  const system = systemPreference(platform);
  const initial = initialChoice({ platform, storageKey, legacyStorageKeys, initialMode });
  let { preference } = initial;
  let matches = Boolean(system?.matches);
  if (initial.migrated) saveChoice(platform, storageKey, preference);
  const listeners = new Set();
  let disposed = false;
  const getMode = () => effectiveMode(preference, matches);
  const announce = () => {
    const state = { preference, mode: getMode() };
    for (const callback of [...listeners]) callback(state);
  };
  const onSystemChange = event => {
    if (disposed) return;
    const before = getMode();
    matches = Boolean(event.matches);
    if (getMode() !== before) announce();
  };
  if (system?.addEventListener) system.addEventListener("change", onSystemChange);
  else system?.addListener?.(onSystemChange);
  return {
    getPreference: () => preference, getMode,
    setPreference(choice, { persist = true } = {}) {
      if (disposed || !CHOICES.includes(choice)) return false;
      if (persist) saveChoice(platform, storageKey, choice);
      if (choice !== preference) {
        preference = choice;
        if (system) matches = Boolean(system.matches);
        announce();
      }
      return true;
    },
    subscribe(callback) {
      if (disposed || typeof callback !== "function") return () => {};
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (system?.removeEventListener) system.removeEventListener("change", onSystemChange);
      else system?.removeListener?.(onSystemChange);
      listeners.clear();
    },
  };
}

const titleCase = value => value.charAt(0).toUpperCase() + value.slice(1);

/** Native hotbar launcher face. The host dispatches its hotbar command. */
export function createHudAppearanceSettingsHotbarItem({ THREE, active = false, platform = globalThis } = {}) {
  const item = { tooltip: "Settings: Appearance", showNumber: false, active };
  const canvas = platform.document?.createElement?.("canvas");
  if (!canvas || !THREE?.CanvasTexture) return { ...item, iconText: "SET" };
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ...item, iconText: "SET" };
  ctx.translate(32, 32);
  ctx.fillStyle = "#edf4fc";
  ctx.beginPath();
  for (let step = 0; step < 32; step++) {
    const angle = step * Math.PI / 16 - Math.PI / 2;
    const radius = step % 4 < 2 ? 22 : 17;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.moveTo(9, 0);
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill("evenodd");
  const iconTexture = new THREE.CanvasTexture(canvas);
  iconTexture.name = "halo-settings-gear";
  iconTexture.colorSpace = THREE.SRGBColorSpace;
  iconTexture.minFilter = THREE.LinearFilter;
  return { ...item, iconTexture };
}

/** Compose these rows into any existing Halo Settings window. */
export function createHudAppearanceSettingsRows(preference) {
  return [{ text: "Appearance", rowHeightPx: 26 }, ...CHOICES.map(choice => {
    const active = preference.getPreference() === choice;
    const label = choice === "system" && active ? `System (${titleCase(preference.getMode())})` : titleCase(choice);
    return {
      text: label, rowHeightPx: 28, actionButtonText: active ? "Active" : "Use",
      actionButtonWidthPx: 80, actionButtonTextColor: 0xf4f8ff,
      actionButtonBgColor: active ? 0x3c5269 : 0x245e96, actionButtonBgOpacity: 1,
      actionButtonHoverText: choice === "system" ? "Follow system appearance" : `Use ${choice} appearance`,
      actionButtonOnClick: () => preference.setPreference(choice),
    };
  })];
}

/** Compose Appearance into the graphics/sound Settings form's extraRows. */
export function createHudAppearanceFormRow(preference, { key = "appearance" } = {}) {
  const label = choice => choice === "system" && preference.getPreference() === "system"
    ? `System (${titleCase(preference.getMode())})` : titleCase(choice);
  return { kind: "dropdown", key, label: "Appearance",
    options: () => CHOICES.map(value => ({ value, label: label(value) })),
    value: () => preference.getPreference(), text: () => label(preference.getPreference()),
    onSelect: value => preference.setPreference(value),
  };
}

/** A lazy Settings shell for apps without one; preference stays active while closed. */
export function installHudAppearanceSettings(hudSystem, { preference, windowKey = "halo-settings",
  title = "Settings", platform = globalThis, frame = {}, getAdditionalRows = () => [],
  keyboardShortcutTarget = null } = {}) {
  if (typeof hudSystem?.createWindow !== "function" || typeof hudSystem?.setWindowLines !== "function" ||
      typeof hudSystem?.destroyWindow !== "function" || typeof preference?.subscribe !== "function") return null;
  let opened = false, disposed = false, keyboard, previousFocus, systemLabel;
  const radioName = `halo-appearance-${++keyboardSerial}`;
  const radios = new Map();
  const render = () => {
    if (!opened) return;
    hudSystem.setWindowLines(windowKey, [...createHudAppearanceSettingsRows(preference), ...getAdditionalRows()]);
    for (const [choice, input] of radios) input.checked = choice === preference.getPreference();
    if (systemLabel) systemLabel.textContent = preference.getPreference() === "system"
      ? `System (${titleCase(preference.getMode())})` : "System";
  };
  const unsubscribe = preference.subscribe(render);
  function close({ restoreFocus = true } = {}) {
    if (!opened) return false;
    opened = false;
    hudSystem.destroyWindow(windowKey);
    const restore = keyboard?.contains(platform.document?.activeElement);
    keyboard?.remove();
    keyboard = systemLabel = null;
    radios.clear();
    if (restoreFocus && restore) previousFocus?.focus?.({ preventScroll: true });
    previousFocus = null;
    return true;
  }
  function mountKeyboardControls(opener) {
    const doc = platform.document;
    if (!doc?.body || !doc.createElement) return;
    previousFocus = opener ?? doc.activeElement;
    keyboard = doc.createElement("div");
    keyboard.setAttribute("role", "group");
    keyboard.setAttribute("aria-label", `${title}: Appearance`);
    keyboard.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
    for (const choice of CHOICES) {
      const label = doc.createElement("label"), input = doc.createElement("input"), text = doc.createElement("span");
      input.type = "radio"; input.name = radioName; input.value = choice;
      if (choice === "system") systemLabel = text;
      else text.textContent = titleCase(choice);
      input.addEventListener("change", () => { if (input.checked) preference.setPreference(choice); });
      label.append(input, text);
      keyboard.append(label);
      radios.set(choice, input);
    }
    const dismiss = doc.createElement("button");
    dismiss.type = "button"; dismiss.textContent = `Close ${title}`;
    dismiss.addEventListener("click", () => close());
    keyboard.append(dismiss);
    keyboard.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key.startsWith("Arrow") || event.key === " " || event.key === "Enter") event.stopPropagation();
    });
    doc.body.append(keyboard);
  }
  function open({ opener = null, focus = true } = {}) {
    if (disposed || opened || hudSystem.hud?.ui?.windows?.[windowKey]) return false;
    hudSystem.createWindow(windowKey, {
      title, x: 12, y: 72, w: 272, h: 166, scrollable: true, ...frame,
      closeable: true, onClose: () => close(),
    });
    opened = true;
    mountKeyboardControls(opener);
    render();
    if (focus) radios.get(preference.getPreference())?.focus?.({ preventScroll: true });
    return true;
  }
  const toggle = options => opened ? close() : open(options);
  const onShortcut = event => {
    if (event.defaultPrevented || event.repeat || !event.altKey || !event.shiftKey ||
        event.metaKey || event.ctrlKey || event.code !== "KeyS") return;
    const source = event.target;
    if (!keyboard?.contains(source) && (source?.isContentEditable || source?.matches?.("input,textarea,select"))) return;
    if (toggle()) { event.preventDefault(); event.stopPropagation(); }
  };
  keyboardShortcutTarget?.addEventListener?.("keydown", onShortcut);
  return { open, close, isOpen: () => opened, toggle,
    dispose() {
      if (disposed) return;
      disposed = true;
      keyboardShortcutTarget?.removeEventListener?.("keydown", onShortcut);
      unsubscribe();
      close({ restoreFocus: false });
    } };
}
