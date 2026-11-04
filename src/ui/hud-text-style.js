// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the canonical HUD text style tokens for consumers that import through the shared UI namespace.
 * Parameters: none.
 * Return value: Exposes the shared HUD text colors and font URL under src/ui.
 * Side effects: none.
 */
export {
	HUD_TEXT_DEFAULT_COLOR,
	HUD_TEXT_DISABLED_COLOR,
	HUD_TEXT_EMPHASIS_COLOR,
	HUD_TEXT_FONT_URL,
	HUD_TEXT_HEADER_FONT_URL,
	HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER,
	HUD_TEXT_HEADER_FONT_WEIGHT,
	HUD_TEXT_HEADER_UNICODE_FONTS_URL,
	HUD_TEXT_INFO_COLOR,
	HUD_TEXT_SUCCESS_COLOR,
	HUD_TEXT_MUTED_COLOR,
	HUD_TEXT_UNICODE_FONTS_URL,
} from "../hud-text-style.js";
