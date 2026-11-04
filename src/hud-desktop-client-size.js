// SPDX-License-Identifier: Apache-2.0
/**
 * Return the current desktop client size used by shared HUD layout and clamp logic.
 * @param {object} [options={}] Desktop client-size dependencies.
 * @param {HTMLElement | null | undefined} [options.dom] Optional renderer DOM element used to read canvas-local dimensions.
 * @returns {{ w: number, h: number }} Positive pixel width/height with a minimum fallback of 1x1.
 * Side effects: reads viewport and DOM client sizing; does not mutate external state.
 */
export function getHudDesktopClientSize({ dom } = {}) {
  // Prefer the canvas/client rect so HUD clamps match the actual rendered area
  // (important for pages using 100vh/embedded layouts).
  try {
    const rect = dom?.getBoundingClientRect?.();
    const width = Math.round(Number(rect?.width ?? 0));
    const height = Math.round(Number(rect?.height ?? 0));
    if (width > 0 && height > 0) return { w: width, h: height };
  } catch {
    // no-op
  }
  const width = Math.round(Number(window.innerWidth ?? 0));
  const height = Math.round(Number(window.innerHeight ?? 0));
  return { w: width > 0 ? width : 1, h: height > 0 ? height : 1 };
}
