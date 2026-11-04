// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the canonical default HUD text color used for primary readable copy.
 * Parameters: none.
 * Return value: Hex color integer for standard HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_DEFAULT_COLOR = 0xdde3ea;

/**
 * Purpose: Defines the bright white HUD text color for high-contrast elements
 * (carets, minimize-button glyphs, status-bar name labels).
 * Parameters: none.
 * Return value: Hex color integer for bright HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_BRIGHT_COLOR = 0xffffff;

/**
 * Purpose: Defines the canonical muted HUD text color used for secondary or de-emphasized copy.
 * Parameters: none.
 * Return value: Hex color integer for muted HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_MUTED_COLOR = 0x9aa3ad;

/**
 * Purpose: Defines the canonical informational HUD text color used for metadata and guidance.
 * Parameters: none.
 * Return value: Hex color integer for informational HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_INFO_COLOR = 0x9ec2ff;

/**
 * Purpose: Defines the canonical emphasis HUD text color used for headings and highlighted labels.
 * Parameters: none.
 * Return value: Hex color integer for emphasized HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_EMPHASIS_COLOR = 0xd2c35a;

/**
 * Purpose: Defines the canonical disabled HUD text color used when an action is unavailable.
 * Parameters: none.
 * Return value: Hex color integer for disabled HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_DISABLED_COLOR = 0x7f8a96;

/**
 * Purpose: Defines the canonical success HUD text color used for ready or positive status copy.
 * Parameters: none.
 * Return value: Hex color integer for success-status HUD text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_SUCCESS_COLOR = 0x5fdc6a;

/**
 * Purpose: Defines the canonical premium HUD text accent used for supreme inventory labels and rare high-value highlight copy.
 * Parameters: none.
 * Return value: Hex color integer for premium HUD text accents.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_SUPREME_ACCENT_COLOR = 0xb76cff;

/**
 * Purpose: Defines the canonical font asset URL used by shared HUD Troika text rendering.
 * Parameters: none.
 * Return value: Same-origin font asset URL string for the shared HUD font face.
 * Side effects: none.
 * @type {string}
 */
export const HUD_TEXT_FONT_URL = new URL("./assets/inter-latin-400-normal.woff", import.meta.url).href;

/**
 * Purpose: Defines the canonical font asset override for shared HUD panel headers.
 * Parameters: none.
 * Return value: Same-origin Inter font URL so HUD titles render under a locked-down CSP.
 * Side effects: none.
 * @type {string | null}
 */
export const HUD_TEXT_HEADER_FONT_URL = new URL("./assets/inter-latin-400-normal.woff", import.meta.url).href;

/**
 * Purpose: Defines the canonical font-weight treatment for shared HUD panel headers and title bars.
 * Parameters: none.
 * Return value: CSS-like Troika font-weight value for shared runtime headers.
 * Side effects: none.
 * @type {string}
 */
export const HUD_TEXT_HEADER_FONT_WEIGHT = "400";

/**
 * Purpose: Defines the canonical size multiplier for shared HUD panel headers relative to the base runtime glyph sizing.
 * Parameters: none.
 * Return value: Unitless multiplier applied to header text so titles read stronger than body copy by default.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER = 1.25;

/**
 * Purpose: Defines the same-origin unicode-font-resolver dataset URL used for Troika fallback glyph resolution.
 * Parameters: none.
 * Return value: Base URL string for the vendored unicode-font-resolver subset.
 * Side effects: none.
 * @type {string}
 */
export const HUD_TEXT_UNICODE_FONTS_URL = new URL("./assets/unicode-fonts/", import.meta.url).href;

/**
 * Purpose: Defines the unicode fallback override for shared HUD panel headers.
 * Parameters: none.
 * Return value: Null so header text follows the legacy v3 path instead of forcing the vendored unicode resolver to look for a missing 700-weight sans-serif file.
 * Side effects: none.
 * @type {string | null}
 */
export const HUD_TEXT_HEADER_UNICODE_FONTS_URL = new URL("./assets/unicode-fonts/", import.meta.url).href;

/**
 * Purpose: Defines the canonical signed-distance field glyph size used by the shared HUD Troika text profile.
 * Parameters: none.
 * Return value: Glyph atlas size used by shared HUD Troika text.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_SDF_GLYPH_SIZE = 64;
