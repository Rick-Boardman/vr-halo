// SPDX-License-Identifier: Apache-2.0
// Pure formatting, color-parsing, and rectangle hit-testing functions
// extracted from hud.js to reduce closure size and enable reuse.

/**
 * Format a Vector3-like object as "(x, y, z)" with 2 decimal places.
 * @param {{ x: number, y: number, z: number } | null | undefined} v
 * @returns {string}
 */
export function fmtVec3(v) {
  if (!v) return "(n/a)";
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

/**
 * Format radians as a fixed-3 string with "rad" suffix.
 * @param {number} r
 * @returns {string}
 */
export function fmtRad(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return "n/a";
  return `${n.toFixed(3)} rad`;
}

/**
 * Format a boolean as "ON" or "OFF".
 * @param {boolean} b
 * @returns {string}
 */
export function fmtBool(b) {
  return b ? "ON" : "OFF";
}

/**
 * Coerce mixed entry arrays (strings, objects with .text, null) into one trimmed string.
 * @param {Array<string | { text?: string }> | string | { text?: string } | null | undefined} entries
 * @returns {string}
 */
export function normalizeEntriesToText(entries) {
  const arr = Array.isArray(entries)
    ? entries
    : entries != null
    ? [entries]
    : [];
  return arr
    .map((e) => {
      if (typeof e === "object" && e) {
        return String(e.text ?? "");
      }
      return String(e ?? "");
    })
    .join("\n")
    .trimEnd();
}

/**
 * Parse a hex color value from string, number, or null, returning a 24-bit integer.
 * Accepts "#RRGGBB", "0xRRGGBB", bare hex strings, or numeric values.
 * @param {string | number | null | undefined} v
 * @param {number} fallbackHex 24-bit fallback color
 * @returns {number} 24-bit integer color
 */
export function parseHexColor(v, fallbackHex) {
  const fb = (fallbackHex >>> 0) & 0xffffff;
  if (v == null) return fb;
  if (typeof v === "number" && Number.isFinite(v)) return (v >>> 0) & 0xffffff;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return fb;
    const hex = s.startsWith("#")
      ? parseInt(s.slice(1), 16)
      : s.startsWith("0x") || s.startsWith("0X")
        ? parseInt(s.slice(2), 16)
        : parseInt(s, 16);
    return Number.isFinite(hex) ? ((hex >>> 0) & 0xffffff) : fb;
  }
  return fb;
}

/**
 * Test whether point (px, py) lies inside rectangle (rx, ry, rw, rh).
 * @param {number} rx Left edge
 * @param {number} ry Top edge
 * @param {number} rw Width
 * @param {number} rh Height
 * @param {number} px Point x
 * @param {number} py Point y
 * @returns {boolean}
 */
export function rectContains(rx, ry, rw, rh, px, py) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Test whether point (px, py) lies inside rectangle (rx, ry, rw, rh) with slop margin.
 * @param {number} rx Left edge
 * @param {number} ry Top edge
 * @param {number} rw Width
 * @param {number} rh Height
 * @param {number} px Point x
 * @param {number} py Point y
 * @param {number} slopPx Extra margin around the rectangle
 * @returns {boolean}
 */
export function rectContainsSlop(rx, ry, rw, rh, px, py, slopPx) {
  const s = Number.isFinite(slopPx) ? slopPx : 0;
  return (
    px >= rx - s &&
    px <= rx + rw + s &&
    py >= ry - s &&
    py <= ry + rh + s
  );
}
