// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the canonical per-glyph horizontal gap used when estimating HUD text width.
 * Parameters: none.
 * Return value: Gap size in pixels inserted between estimated glyph cells.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_ESTIMATE_GAP_PX = 1;

/**
 * Purpose: Estimate the average horizontal advance of one HUD glyph cell for wrap and truncation math.
 * Parameters: `dot` is the current HUD dot size; `gap` is the inter-glyph estimate gap in pixels.
 * Return value: Estimated per-character advance in pixels for the HUD pixel font.
 * Side effects: none.
 * @param {number} dot
 * @param {number} [gap=HUD_TEXT_ESTIMATE_GAP_PX]
 * @returns {number}
 */
export function estimateHudGlyphAdvancePx(dot, gap = HUD_TEXT_ESTIMATE_GAP_PX) {
  return 4 * dot + gap;
}

function estimateHudCharacterAdvancePx(char, dot, gap = HUD_TEXT_ESTIMATE_GAP_PX) {
  const glyph = String(char ?? "").charAt(0);
  if (!glyph) return 0;

  if (glyph === " ") return 1.5 * dot + gap;
  if (".,:;!'\"|`".includes(glyph)) return 1.5 * dot + gap;
  if ("ilI1".includes(glyph)) return 2 * dot + gap;
  if ("fjrt()[]{}\\/-_=+".includes(glyph)) return 3 * dot + gap;
  if ("abcdeghknopqsuvxyz023456789?$*~^<>".includes(glyph)) return 3.5 * dot + gap;
  if ("()[]{}\\/-_=+".includes(glyph)) return 3 * dot + gap;
  if ("mwMW@#%&".includes(glyph)) return 5 * dot + gap;

  // Full-width block/shade characters (used in progress bars) render at full em-width.
  const cp = glyph.codePointAt(0);
  if (cp >= 0x2580 && cp <= 0x259F) return 7 * dot + gap;

  return estimateHudGlyphAdvancePx(dot, gap);
}

/**
 * Purpose: Estimate the width of the first line of HUD pixel text without constructing geometry.
 * @param {unknown} text Text value whose first line should be measured.
 * @param {number} dot Glyph dot size in pixels.
 * @param {number} [gap=HUD_TEXT_ESTIMATE_GAP_PX] Horizontal gap in pixels between estimated glyph cells.
 * @returns {number} Estimated width in pixels for the first line of the supplied text.
 * Side effects: none.
 */
export function estimateTextWidthPx(text, dot, gap = HUD_TEXT_ESTIMATE_GAP_PX) {
  const firstLineText = String(text ?? "").split("\n")[0];
  if (!firstLineText.length) {
    return 0;
  }

  let width = 0;
  for (const glyph of firstLineText) {
    width += estimateHudCharacterAdvancePx(glyph, dot, gap);
  }
  return Math.max(0, width - gap);
}
