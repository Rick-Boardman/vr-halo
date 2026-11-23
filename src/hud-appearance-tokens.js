// SPDX-License-Identifier: Apache-2.0
// Rendering-only palette mapping. Do not rewrite source rows, editor state, or handlers.
function blend(from, to, amount) {
  let result = 0;
  for (const shift of [16, 8, 0]) {
    const a = (from >> shift) & 255, b = (to >> shift) & 255;
    result |= Math.round(a + (b - a) * amount) << shift;
  }
  return result;
}
function luminance(color) {
  const linear = (n) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear((color >> 16) & 255) + 0.7152 * linear((color >> 8) & 255) + 0.0722 * linear(color & 255);
}
export function hudContrastRatio(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function contrastHudInk(color, surface, ink) {
  if (!Number.isFinite(color)) return ink;
  for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
    const mixed = blend(color, ink, amount);
    if (hudContrastRatio(mixed, surface) >= 4.5) return mixed;
  }
  return ink;
}
function channelSpread(color) {
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  return Math.max(...rgb) - Math.min(...rgb);
}
export function styleHudListEntry(entry, style) {
  if (!style || !entry || typeof entry !== "object") return entry;
  const hasFill = Number.isFinite(entry.rowBgColor);
  const selected = hasFill && (entry.selected === true || channelSpread(entry.rowBgColor) >= 55);
  const surface = hasFill ? (selected ? style.selectedRow : style.row) : style.surface;
  const field = entry.actionButtonSourceText != null || (!!entry.actionButtonText && !!entry.actionButtonIconTexture);
  const buttonAccent = !field && Number.isFinite(entry.actionButtonBgColor) && channelSpread(entry.actionButtonBgColor) >= 82;
  const iconOnly = !entry.actionButtonText && entry.actionButtonIconTexture;
  const disabled = entry.disabled === true || typeof entry.actionButtonOnClick !== "function";
  return {
    ...entry,
    color: contrastHudInk(entry.color, surface, style.text),
    colorRanges: Array.isArray(entry.colorRanges) ? entry.colorRanges.map(range => ({
      ...range, color: contrastHudInk(range.color, surface, style.text),
    })) : entry.colorRanges,
    ...(hasFill ? { rowBgColor: surface, rowBgOpacity: 1 } : {}),
    ...(entry.actionButtonText || entry.actionButtonIconTexture ? {
      actionButtonBgColor: disabled && style.disabledField != null ? style.disabledField : buttonAccent || iconOnly ? style.accent : style.field,
      actionButtonBgOpacity: 1,
      actionButtonTextColor: disabled && style.disabledText != null ? style.disabledText : buttonAccent || iconOnly ? style.accentText : style.fieldText,
    } : {}),
  };
}
