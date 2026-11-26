// SPDX-License-Identifier: Apache-2.0
/**
 * Desktop window layout for a Halo app: the app says where each of its windows belongs for a viewport size, and this
 * applies those frames while keeping what a person did (a window moved or resized by hand stays), keeps every frame on
 * screen, places the hotbar, and schedules layout and the hotbar's first appearance after the panels have settled.
 * Conduit, Loom and Insight carried three copies of this; Insight's had fallen behind (it mistook a window Halo had
 * clamped into a smaller viewer for one moved by hand).
 *
 * In a headset none of this runs: Halo lays the HUD out on its sphere.
 */

/** Margin between desktop windows and the viewport edge. */
export const HUD_DESKTOP_LAYOUT_EDGE_PX = 16;

const AUTO_LAYOUT_KEY = "_haloAutoLayout";

/** The frame this layout last gave a window (created on first use). */
export function getHudWindowAutoLayoutState(win) {
  if (!win || typeof win !== "object") return null;
  if (!win[AUTO_LAYOUT_KEY] || typeof win[AUTO_LAYOUT_KEY] !== "object") win[AUTO_LAYOUT_KEY] = {};
  return win[AUTO_LAYOUT_KEY];
}

/** Whether a person moved the window: Halo marks a window dragged by hand `userPlaced`. */
export function hasHudManualWindowPosition(win) {
  return !!win?.userPlaced;
}

/** Whether a person resized the window: its size differs from the last frame this layout gave it. */
export function hasHudManualWindowSize(win, autoLayout = win?.[AUTO_LAYOUT_KEY] ?? null) {
  const currentW = Number(win?.w);
  const currentH = Number(win?.h);
  const baselineW = Number(autoLayout?.w);
  const baselineH = Number(autoLayout?.h);
  if (!Number.isFinite(currentW) || !Number.isFinite(currentH)) return false;
  if (!Number.isFinite(baselineW) || !Number.isFinite(baselineH)) return false;
  return Math.abs(currentW - baselineW) > 1 || Math.abs(currentH - baselineH) > 1;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The hotbar's desktop frame: centred at the bottom at its preferred size, within the viewport. `bottomLimit` is the
 * lowest y other windows should reach.
 */
export function resolveHudDesktopHotbarFrame({ layoutW, layoutH, preferredHotbarSize = null, hotbar = null, edge = HUD_DESKTOP_LAYOUT_EDGE_PX } = {}) {
  const maxW = Math.max(320, layoutW - edge * 2);
  const minW = Math.min(Math.round(preferredHotbarSize?.minW ?? 540), maxW);
  const w = clamp(Math.round(preferredHotbarSize?.w ?? Math.floor(layoutW * 0.82)), minW, maxW);
  const maxH = Math.max(Math.round(preferredHotbarSize?.minH ?? 60), layoutH - edge * 2);
  const minH = Math.min(Math.round(preferredHotbarSize?.minH ?? 60), maxH);
  const h = clamp(Math.round(preferredHotbarSize?.h ?? (Number(hotbar?.h) || 60)), minH, maxH);
  const y = Math.max(edge, layoutH - h - 20);
  return {
    x: Math.max(edge, Math.floor((layoutW - w) * 0.5)),
    y,
    w,
    h,
    minW: preferredHotbarSize?.minW,
    minH: preferredHotbarSize?.minH,
    bottomLimit: y - 16,
  };
}

/**
 * A frame kept inside the viewport less its margins: no wider or taller than the viewport, and moved in from an edge it
 * would cross. A window's minimum shrinks with it. (Insight's 420px Mermaid source window ran off a 430px phone.)
 */
export function fitHudFrameToLayout(frame, layoutW, layoutH, edge = HUD_DESKTOP_LAYOUT_EDGE_PX) {
  if (!frame || typeof frame !== "object") return frame;
  const next = { ...frame };
  const room = (size) => Math.max(1, size - edge * 2);
  if (Number.isFinite(next.w) && next.w > room(layoutW)) next.w = room(layoutW);
  if (Number.isFinite(next.h) && next.h > room(layoutH)) next.h = room(layoutH);
  if (Number.isFinite(next.minW) && Number.isFinite(next.w) && next.minW > next.w) next.minW = next.w;
  if (Number.isFinite(next.minH) && Number.isFinite(next.h) && next.minH > next.h) next.minH = next.h;
  if (Number.isFinite(next.x) && Number.isFinite(next.w)) next.x = clamp(next.x, edge, Math.max(edge, layoutW - edge - next.w));
  if (Number.isFinite(next.y) && Number.isFinite(next.h)) next.y = clamp(next.y, edge, Math.max(edge, layoutH - edge - next.h));
  return next;
}

/**
 * @param {object} options
 * @param {object} options.hudSystem The app's Halo HUD system.
 * @param {object} options.renderer The three.js renderer (layout is skipped while it presents in a headset).
 * @param {(context: { layoutW: number, layoutH: number, edge: number, hotbarFrame: object, bottomLimit: number }) => { windowFrames: Record<string, object>, [extra: string]: unknown }} options.buildFrames
 *   The app's frames for a viewport: `windowFrames` by window key, plus anything `afterApply` needs. The hotbar's frame
 *   is computed here and added when the hotbar is shown.
 * @param {(built: object) => void} [options.afterApply] Runs after the frames are applied (an Inspector that follows the
 *   selection, panel visibility).
 * @param {() => void} [options.onHotbarReady] Runs when the hotbar first appears, before it is laid out: give it its
 *   items, title and status.
 * @param {number} [options.edge] Margin to the viewport edge.
 * @param {{ requestAnimationFrame?: Function, cancelAnimationFrame?: Function }} [options.frames] Frame scheduler (tests).
 */
export function createHudDesktopLayout({
  hudSystem,
  renderer,
  buildFrames,
  afterApply = null,
  onHotbarReady = null,
  edge = HUD_DESKTOP_LAYOUT_EDGE_PX,
  frames = globalThis,
} = {}) {
  if (!hudSystem) throw new Error("createHudDesktopLayout: hudSystem is required");
  if (!renderer) throw new Error("createHudDesktopLayout: renderer is required");
  if (typeof buildFrames !== "function") throw new Error("createHudDesktopLayout: buildFrames is required");
  const raf = (fn) => frames.requestAnimationFrame(fn);
  const caf = (id) => frames.cancelAnimationFrame(id);
  const presenting = () => !!renderer.xr?.isPresenting;
  let layoutRaf = 0;
  let revealRaf = 0;
  let hotbarReady = false;

  /** Apply a frame to a window, keeping a position or size a person chose (`preserveManual*: false` overrides). */
  function setWindowFrame(windowKey, next = {}) {
    const win = hudSystem?.hud?.ui?.windows?.[windowKey];
    if (!win) return null;
    const autoLayout = getHudWindowAutoLayoutState(win);
    const keepPosition = typeof next.preserveManualPosition === "boolean"
      ? next.preserveManualPosition && hasHudManualWindowPosition(win)
      : hasHudManualWindowPosition(win);
    const keepSize = typeof next.preserveManualSize === "boolean"
      ? next.preserveManualSize && hasHudManualWindowSize(win, autoLayout)
      : hasHudManualWindowSize(win, autoLayout);
    const hiddenPosition = Number(win?.y) < -1000 && Number.isFinite(win?._hiddenX) && Number.isFinite(win?._hiddenY);
    const x = Number.isFinite(next.x) ? Math.round(next.x) : null;
    const y = Number.isFinite(next.y) ? Math.round(next.y) : null;
    const w = Number.isFinite(next.w) ? Math.round(next.w) : null;
    const h = Number.isFinite(next.h) ? Math.round(next.h) : null;
    if (Number.isFinite(next.minW)) win.minW = Math.round(next.minW);
    if (Number.isFinite(next.minH)) win.minH = Math.round(next.minH);
    if (w != null && !keepSize) win.w = w;
    if (h != null && !keepSize) win.h = h;
    if (x != null && !keepPosition) {
      if (hiddenPosition) win._hiddenX = x;
      else win.x = x;
    }
    if (y != null && !keepPosition) {
      if (hiddenPosition) win._hiddenY = y;
      else win.y = y;
    }
    // A collapse the layout asks for is applied once, on the change; a person's own collapse is not undone by layout.
    if (typeof next.collapsed === "boolean" && autoLayout.collapsed !== next.collapsed) {
      autoLayout.collapsed = next.collapsed;
      if (typeof win.setCollapsed === "function") win.setCollapsed(next.collapsed);
      else win.collapsed = next.collapsed;
    }
    if (x != null) autoLayout.x = x;
    if (y != null) autoLayout.y = y;
    if (w != null) autoLayout.w = w;
    if (h != null) autoLayout.h = h;
    if (hudSystem?.hud) hudSystem.hud._dirty = true;
    return win;
  }

  /** The desktop viewport in HUD layout pixels: the canvas, else the HUD's layout, else the window. Null in a headset. */
  function resolveLayoutSize() {
    if (presenting()) return null;
    const rect = renderer.domElement?.getBoundingClientRect?.() ?? null;
    const candidates = [
      [rect?.width, rect?.height],
      [hudSystem?.hud?.layoutW, hudSystem?.hud?.layoutH],
      [globalThis.innerWidth, globalThis.innerHeight],
    ];
    for (const [w, h] of candidates) {
      const layoutW = Number(w);
      const layoutH = Number(h);
      if (Number.isFinite(layoutW) && layoutW > 0 && Number.isFinite(layoutH) && layoutH > 0) return { layoutW, layoutH };
    }
    return null;
  }

  function ensureHotbar() {
    return hudSystem?.ensureSharedWindow?.("hotbar") ?? hudSystem?.hud?.ui?.windows?.hotbar ?? null;
  }

  function destroyHotbar() {
    hudSystem?.destroyWindow?.("hotbar");
  }

  /** The app's frames for a viewport, each kept on screen, with the hotbar's when it is shown. */
  function build(layoutW, layoutH, hotbar = hudSystem?.hud?.ui?.windows?.hotbar ?? null) {
    const preferredHotbarSize = hudSystem?.getPreferredHotbarWindowSize?.() ?? null;
    const { bottomLimit, ...hotbarFrame } = resolveHudDesktopHotbarFrame({ layoutW, layoutH, preferredHotbarSize, hotbar, edge });
    const built = buildFrames({ layoutW, layoutH, edge, hotbarFrame, bottomLimit }) ?? {};
    const windowFrames = {};
    for (const [key, frame] of Object.entries(built.windowFrames ?? {})) {
      windowFrames[key] = fitHudFrameToLayout(frame, layoutW, layoutH, edge);
    }
    if (hotbar && hotbarReady) windowFrames.hotbar = hotbarFrame;
    return { ...built, windowFrames };
  }

  /** The frame one window would get now, or null in a headset. */
  function resolveWindowFrame(windowKey) {
    const size = resolveLayoutSize();
    if (!size) return null;
    return build(size.layoutW, size.layoutH).windowFrames[windowKey] ?? null;
  }

  /** Lay the desktop windows out now. Before the hotbar is revealed it is kept away, so it never flashes unplaced. */
  function applyLayout() {
    if (presenting()) return;
    const size = resolveLayoutSize();
    if (!size) return;
    const hotbar = hotbarReady ? ensureHotbar() : hudSystem?.hud?.ui?.windows?.hotbar ?? null;
    const built = build(size.layoutW, size.layoutH, hotbar);
    if (!hotbarReady) destroyHotbar();
    for (const [key, frame] of Object.entries(built.windowFrames)) setWindowFrame(key, frame);
    afterApply?.(built);
  }

  /** Lay out two frames from now, once panels have rendered their content; repeated calls coalesce. */
  function scheduleLayout() {
    if (presenting()) return;
    if (layoutRaf) caf(layoutRaf);
    layoutRaf = raf(() => {
      layoutRaf = raf(() => {
        layoutRaf = 0;
        applyLayout();
      });
    });
  }

  function clearHotbarReveal() {
    if (!revealRaf) return;
    caf(revealRaf);
    revealRaf = 0;
  }

  function revealHotbarNow() {
    hotbarReady = true;
    ensureHotbar();
    // The bar exists only now: give it its items, title and status before it is laid out.
    onHotbarReady?.();
    applyLayout();
  }

  /** Show the hotbar two frames from now (at once in a headset), after the first panels are placed. */
  function scheduleHotbarReveal() {
    if (presenting()) {
      revealHotbarNow();
      return;
    }
    clearHotbarReveal();
    revealRaf = raf(() => {
      revealRaf = raf(() => {
        revealRaf = 0;
        revealHotbarNow();
      });
    });
  }

  /** Hide the hotbar again until the next reveal (an app rebuilding its panels). */
  function resetHotbar() {
    hotbarReady = false;
    clearHotbarReveal();
    destroyHotbar();
  }

  /** An app re-presenting its hotbar items before the reveal: keep the bar away on desktop until then. */
  function keepHotbarUntilReady() {
    if (!presenting() && !hotbarReady) destroyHotbar();
  }

  /** A viewport resize: windows are laid out once Halo has re-anchored them. */
  function handleResize() {
    if (hudSystem?.hud?.ui) hudSystem.hud.ui._layoutInitialized = true;
    keepHotbarUntilReady();
    scheduleLayout();
  }

  function dispose() {
    if (layoutRaf) caf(layoutRaf);
    layoutRaf = 0;
    clearHotbarReveal();
  }

  return {
    setWindowFrame,
    getWindowAutoLayoutState: getHudWindowAutoLayoutState,
    hasManualWindowPosition: hasHudManualWindowPosition,
    hasManualWindowSize: hasHudManualWindowSize,
    resolveLayoutSize,
    buildFrames: build,
    resolveWindowFrame,
    applyLayout,
    scheduleLayout,
    ensureHotbar,
    destroyHotbar,
    scheduleHotbarReveal,
    clearHotbarReveal,
    resetHotbar,
    keepHotbarUntilReady,
    handleResize,
    isHotbarReady: () => hotbarReady,
    dispose,
  };
}
