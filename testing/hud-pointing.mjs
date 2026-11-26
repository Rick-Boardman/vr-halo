// SPDX-License-Identifier: Apache-2.0
/**
 * Browser tests for a Halo app that point at the HUD as a person does: where a window row or a hotbar slot is on
 * screen (for a mouse click or a touch tap) or in the world (for a controller in an emulated headset). Node side, for
 * Playwright. `runtime` is an expression evaluated in the page that yields the app's `{ renderer, camera, hudSystem }`
 * (for example "window.conduitApp.ctx"). Positions come from Halo's own row metrics and slot meshes, the same ones its
 * hit tests read.
 */
import { HUD_WINDOW_TITLE_HEIGHT_PX, HUD_OVERLAY_PADDING_PX } from "../src/hud-layout-policy.js";

/** Wait for `count` rendered frames (a fixed sleep renders fewer frames on a slow, software-GL machine). */
export function frames(page, count = 6) {
  return page.evaluate(n => new Promise(done => {
    let left = n;
    const tick = () => (--left > 0 ? requestAnimationFrame(tick) : done());
    requestAnimationFrame(tick);
  }), count);
}

/** A HUD window's layout rect and state, or null when there is no such window. */
export function hudWindow(page, runtime, key) {
  return page.evaluate(({ expr, key }) => {
    const w = (0, eval)(expr).hudSystem.hud.ui.windows[key];
    return w ? { x: w.x, y: w.y, w: w.w, h: w.h, collapsed: !!w.collapsed, userPlaced: !!w.userPlaced, shown: !w.hidden && Number(w.y) > -1000 } : null;
  }, { expr: runtime, key });
}

/** Shown HUD windows with their layout rects, and the layout size. */
export function shownHudWindows(page, runtime) {
  return page.evaluate(expr => {
    const hud = (0, eval)(expr).hudSystem.hud;
    return {
      layout: [hud.layoutW, hud.layoutH],
      windows: Object.entries(hud.ui.windows).filter(([, w]) => !w.hidden && Number(w.y) > -1000)
        .map(([key, w]) => ({ key, x: w.x, y: w.y, w: w.w, h: w.collapsed ? 28 : w.h })),
    };
  }, runtime);
}

/** A HUD layout point as a client (CSS pixel) point on the canvas. */
export function hudToClient(page, runtime, point) {
  return page.evaluate(({ expr, point }) => {
    const { renderer, hudSystem } = (0, eval)(expr);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + point.x * r.width / hudSystem.hud.layoutW, y: r.top + point.y * r.height / hudSystem.hud.layoutH };
  }, { expr: runtime, point });
}

/**
 * The row of a HUD window whose label matches `pattern` (a row's text, or a row button's text): its layout point,
 * and `u`/`v` across the window for `hudWindowPoint` in a headset. `{ found: false, rows }` lists the labels when
 * none matches.
 */
export function hudRowPoint(page, runtime, key, pattern) {
  return page.evaluate(({ expr, key, source, flags, titleH, padding }) => {
    const hud = (0, eval)(expr).hudSystem.hud;
    const w = hud.ui.windows[key];
    const meta = hud.objects.windows?.[key]?._visibleLineMeta ?? [];
    const re = new RegExp(source, flags);
    const label = r => String(r.text ?? "").trim() || String(r.actionButton?.text ?? "");
    const row = meta.find(r => re.test(label(r)) && Number.isFinite(r.rowTopPx));
    if (!w || !row) return { found: false, rows: meta.map(label).filter(Boolean).slice(0, 40) };
    const y = w.y + titleH + padding + row.rowTopPx + row.rowHeightPx / 2;
    const x = w.x + Math.min(w.w * 0.3, 90);
    return { found: true, text: label(row), x, y, u: (x - w.x) / w.w, v: (y - w.y) / w.h };
  }, { expr: runtime, key, source: pattern.source, flags: pattern.flags, titleH: HUD_WINDOW_TITLE_HEIGHT_PX, padding: HUD_OVERLAY_PADDING_PX });
}

/**
 * A hotbar slot, found by the tooltip a person sees on hover (`match` is a RegExp or a case-insensitive suffix, since
 * many tooltips change with state: "Show palette window" / "Hide palette window"): its client point on desktop and
 * its world point for a controller. Null when no slot matches.
 */
export function hotbarSlotPoint(page, runtime, match) {
  const pattern = match instanceof RegExp ? { source: match.source, flags: match.flags } : null;
  return page.evaluate(async ({ expr, pattern, suffix }) => {
    const { hudSystem, camera, renderer } = (0, eval)(expr);
    const THREE = await import("three");
    const test = pattern ? (t => new RegExp(pattern.source, pattern.flags).test(t)) : (t => t.toLowerCase().endsWith(suffix));
    const index = (hudSystem.hud.ui.data.hotbarItems ?? []).findIndex(item => test(String(item?.tooltip ?? "")));
    const bg = hudSystem.hud.objects.hotbarSlots?.[index]?.bg;
    if (!bg) return null;
    bg.updateWorldMatrix(true, false);
    const world = bg.getWorldPosition(new THREE.Vector3());
    const p = world.clone().project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { index, world: { x: world.x, y: world.y, z: world.z }, x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  }, { expr: runtime, pattern, suffix: pattern ? null : String(match).toLowerCase() });
}
