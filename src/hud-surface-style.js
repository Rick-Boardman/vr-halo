// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the canonical HUD panel background color used behind shared window frames.
 * Parameters: none.
 * Return value: Hex color integer for the main HUD panel background.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_PANEL_BG_COLOR = 0x45526a;

/**
 * Purpose: Defines the canonical HUD panel background opacity used by shared window frames.
 * Parameters: none.
 * Return value: Opacity scalar in the range [0, 1].
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_PANEL_BG_OPACITY = 1;

/**
 * Purpose: Defines the canonical HUD title-bar background color used for shared window chrome.
 * Parameters: none.
 * Return value: Hex color integer for shared HUD title bars.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_TITLE_BAR_COLOR = 0x57657f;

/**
 * Purpose: Defines the canonical HUD title-bar opacity used by shared window chrome.
 * Parameters: none.
 * Return value: Opacity scalar in the range [0, 1].
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_TITLE_BAR_OPACITY = 1;

/**
 * Purpose: Defines the canonical HUD content background color used behind shared panel content.
 * Parameters: none.
 * Return value: Hex color integer for HUD content surfaces.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_CONTENT_BG_COLOR = 0x45526a;

/**
 * Purpose: Defines the canonical HUD content background opacity used behind shared panel content.
 * Parameters: none.
 * Return value: Opacity scalar in the range [0, 1].
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_CONTENT_BG_OPACITY = 1;

/**
 * Purpose: Defines the canonical neutral HUD accent color used for borders and inactive outlines.
 * Parameters: none.
 * Return value: Hex color integer for shared HUD accents.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_ACCENT_COLOR = 0x53b3cb;

/**
 * Purpose: Defines the canonical HUD window border (outline) opacity used by shared window chrome.
 * Parameters: none.
 * Return value: Opacity scalar in the range [0, 1].
 * Side effects: none.
 * @type {number}
 */
export const HUD_SURFACE_BORDER_OPACITY = 0.42;

/**
 * Purpose: Define the legacy runtime HUD theme used before the professional scene-panel promotion.
 * Parameters: none.
 * Return value: Frozen HUD theme descriptor.
 * Side effects: none.
 * @type {{ key: string, panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number, accentColor: number, borderColor: number, borderOpacity: number, titleTextColor: number }}
 */
export const HUD_THEME_CLASSIC = Object.freeze({
	key: "classic",
	panelBgColor: HUD_SURFACE_PANEL_BG_COLOR,
	panelBgOpacity: HUD_SURFACE_PANEL_BG_OPACITY,
	titleBarColor: HUD_SURFACE_TITLE_BAR_COLOR,
	titleBarOpacity: HUD_SURFACE_TITLE_BAR_OPACITY,
	contentBgColor: HUD_SURFACE_CONTENT_BG_COLOR,
	contentBgOpacity: HUD_SURFACE_CONTENT_BG_OPACITY,
	accentColor: HUD_SURFACE_ACCENT_COLOR,
	borderColor: HUD_SURFACE_ACCENT_COLOR,
	borderOpacity: HUD_SURFACE_BORDER_OPACITY,
	borderInset: 0,
	titleTextColor: HUD_SURFACE_ACCENT_COLOR,
});

/**
 * Purpose: Define the promoted professional HUD theme inspired by the stronger workflow-v3 panel chrome.
 * Parameters: none.
 * Return value: Frozen HUD theme descriptor.
 * Side effects: none.
 * @type {{ key: string, panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number, accentColor: number, borderColor: number, borderOpacity: number, titleTextColor: number }}
 */
export const HUD_THEME_PROFESSIONAL = Object.freeze({
	key: "professional",
	panelBgColor: HUD_SURFACE_PANEL_BG_COLOR,
	panelBgOpacity: HUD_SURFACE_PANEL_BG_OPACITY,
	titleBarColor: HUD_SURFACE_TITLE_BAR_COLOR,
	titleBarOpacity: HUD_SURFACE_TITLE_BAR_OPACITY,
	contentBgColor: HUD_SURFACE_CONTENT_BG_COLOR,
	contentBgOpacity: HUD_SURFACE_CONTENT_BG_OPACITY,
	accentColor: HUD_SURFACE_ACCENT_COLOR,
	borderColor: HUD_SURFACE_ACCENT_COLOR,
	borderOpacity: HUD_SURFACE_BORDER_OPACITY,
	borderInset: 0,
	titleTextColor: HUD_SURFACE_ACCENT_COLOR,
});

/**
 * Purpose: Define the 1980s terminal/wireframe HUD theme — near-black panels with glowing green
 * borders and green title text, emulating a classic vector/text-adventure aesthetic. Reusable by
 * any app that wants the retro-terminal look (Goblin Quest is the first consumer).
 * Parameters: none.
 * Return value: Frozen HUD theme descriptor.
 * Side effects: none.
 * @type {{ key: string, panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number, accentColor: number, borderColor: number, borderOpacity: number, titleTextColor: number }}
 */
export const HUD_THEME_TERMINAL = Object.freeze({
	key: "terminal",
	panelBgColor: 0x0a120a,
	panelBgOpacity: 1,
	titleBarColor: 0x16291a,
	titleBarOpacity: 1,
	contentBgColor: 0x0a120a,
	contentBgOpacity: 1,
	accentColor: 0x00ff00,
	borderColor: 0x00ff00,
	borderOpacity: 0.95,
	borderInset: 2,
	titleTextColor: 0x66ff66,
});

/**
 * Purpose: Define the business HUD theme: quiet slate panels, neutral outlines and one blue accent,
 * for applications that sit beside ordinary business software (Conduit and Loom are the first consumers).
 * Parameters: none.
 * Return value: Frozen HUD theme descriptor.
 * Side effects: none.
 * @type {{ key: string, panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number, accentColor: number, borderColor: number, borderOpacity: number, titleTextColor: number, controlStyle: string }}
 */
export const HUD_THEME_BUSINESS = Object.freeze({
	key: "business",
	panelBgColor: 0x131d29,
	panelBgOpacity: 1,
	titleBarColor: 0x1b2836,
	titleBarOpacity: 1,
	contentBgColor: 0x131d29,
	contentBgOpacity: 1,
	accentColor: 0x4c8bd0,
	borderColor: 0x33445a,
	borderOpacity: 1,
	borderInset: 0,
	titleTextColor: 0xdfe7f0,
	controlStyle: "quiet",
});

/**
 * Purpose: Resolve a caller-supplied HUD theme preset or override bag into a full theme object.
 * Parameters:
 *   - theme: preset name or partial theme override bag.
 * Return value: Frozen HUD theme descriptor with all required fields populated.
 * Side effects: none.
 * @param {string | { key?: string, panelBgColor?: number, panelBgOpacity?: number, titleBarColor?: number, titleBarOpacity?: number, contentBgColor?: number, contentBgOpacity?: number, accentColor?: number } | null | undefined} theme
 * @returns {{ key: string, panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number, accentColor: number }}
 */
export function resolveHudTheme(theme) {
	if (theme === HUD_THEME_CLASSIC || theme === HUD_THEME_PROFESSIONAL || theme === HUD_THEME_TERMINAL || theme === HUD_THEME_BUSINESS) {
		return theme;
	}

	const token = String(theme?.key ?? theme ?? "professional").trim().toLowerCase();
	let base;
	if (token === "classic" || token === "legacy") {
		base = HUD_THEME_CLASSIC;
	} else if (token === "terminal" || token === "wireframe" || token === "retro") {
		base = HUD_THEME_TERMINAL;
	} else if (token === "business") {
		base = HUD_THEME_BUSINESS;
	} else {
		base = HUD_THEME_PROFESSIONAL;
	}

	if (!theme || typeof theme !== "object") {
		return base;
	}

	return Object.freeze({
		key: String(theme.key ?? base.key),
		panelBgColor: theme.panelBgColor ?? base.panelBgColor,
		panelBgOpacity: Number.isFinite(theme.panelBgOpacity) ? Number(theme.panelBgOpacity) : base.panelBgOpacity,
		titleBarColor: theme.titleBarColor ?? base.titleBarColor,
		titleBarOpacity: Number.isFinite(theme.titleBarOpacity) ? Number(theme.titleBarOpacity) : base.titleBarOpacity,
		contentBgColor: theme.contentBgColor ?? base.contentBgColor,
		contentBgOpacity: Number.isFinite(theme.contentBgOpacity) ? Number(theme.contentBgOpacity) : base.contentBgOpacity,
		accentColor: theme.accentColor ?? base.accentColor,
		borderColor: theme.borderColor ?? base.borderColor,
		borderOpacity: Number.isFinite(theme.borderOpacity) ? Number(theme.borderOpacity) : base.borderOpacity,
		borderInset: Number.isFinite(theme.borderInset) ? Number(theme.borderInset) : base.borderInset,
		titleTextColor: theme.titleTextColor ?? base.titleTextColor,
		controlStyle: theme.controlStyle ?? base.controlStyle,
	});
}

/**
 * Purpose: Apply a resolved HUD theme to an existing window set created before runtime meshes are built.
 * Parameters:
 *   - windows: HUD window map to mutate in place.
 *   - theme: resolved theme descriptor.
 * Return value: none.
 * Side effects: mutates each window's color and opacity defaults in place.
 * @param {Record<string, { panelBgColor?: number, panelBgOpacity?: number, titleBarColor?: number, titleBarOpacity?: number, contentBgColor?: number, contentBgOpacity?: number }> | null | undefined} windows
 * @param {{ panelBgColor: number, panelBgOpacity: number, titleBarColor: number, titleBarOpacity: number, contentBgColor: number, contentBgOpacity: number }} theme
 */
export function applyHudThemeToWindows(windows, theme) {
	if (!windows || typeof windows !== "object") return;
	const resolved = resolveHudTheme(theme);
	for (const win of Object.values(windows)) {
		if (!win || typeof win !== "object") continue;
		win.panelBgColor = resolved.panelBgColor;
		win.panelBgOpacity = resolved.panelBgOpacity;
		win.titleBarColor = resolved.titleBarColor;
		win.titleBarOpacity = resolved.titleBarOpacity;
		win.contentBgColor = resolved.contentBgColor;
		win.contentBgOpacity = resolved.contentBgOpacity;
		win.borderColor = resolved.borderColor;
		win.borderOpacity = resolved.borderOpacity;
		win.borderInset = resolved.borderInset;
		win.titleTextColor = resolved.titleTextColor;
	}
}
