// SPDX-License-Identifier: Apache-2.0
// Shared pixel-space layout values for canonical HUD windows.

/**
 * Purpose: Defines the canonical title-bar height for shared HUD windows in pixel layout space.
 * Parameters: none.
 * Return value: Title height in pixels used by shared HUD window layout.
 * Side effects: none.
 * @type {number}
 */
export const HUD_WINDOW_TITLE_HEIGHT_PX = 28;

/**
 * Enter VR / Exit VR is a skinned panel. The frame corners are 40px, and the
 * action label sits in the well between them. A shorter window hides the skin.
 */
export const HUD_XR_WINDOW_MIN_W_PX = 300;
export const HUD_XR_WINDOW_MIN_H_PX = 136;

/**
 * Purpose: Defines the canonical padding applied around HUD overlay content in pixel layout space.
 * Parameters: none.
 * Return value: Pixel padding value used by shared overlay layout code.
 * Side effects: none.
 * @type {number}
 */
export const HUD_OVERLAY_PADDING_PX = 10;

/**
 * Purpose: Defines the fallback pixel width for canonical HUD layout calculations.
 * Parameters: none.
 * Return value: Layout width in pixels used when callers omit an explicit HUD width.
 * Side effects: none.
 * @type {number}
 */
export const HUD_LAYOUT_DEFAULT_WIDTH_PX = 1024;

/**
 * Purpose: Defines the fallback pixel height for canonical HUD layout calculations.
 * Parameters: none.
 * Return value: Layout height in pixels used when callers omit an explicit HUD height.
 * Side effects: none.
 * @type {number}
 */
export const HUD_LAYOUT_DEFAULT_HEIGHT_PX = 640;

/**
 * Purpose: Defines the canonical square size for shared HUD hotbar slots.
 * Parameters: none.
 * Return value: Slot width and height in pixels.
 * Side effects: none.
 * @type {number}
 */
export const HUD_HOTBAR_SLOT_SIZE_PX = 40;

/**
 * Purpose: Defines the canonical gap between adjacent HUD hotbar slots.
 * Parameters: none.
 * Return value: Gap in pixels inserted between hotbar slots.
 * Side effects: none.
 * @type {number}
 */
export const HUD_HOTBAR_SLOT_GAP_PX = 8;

/**
 * Purpose: Defines the outline padding used to draw the hotbar slot highlight slightly larger than the slot background.
 * Parameters: none.
 * Return value: Pixel padding added around a slot when rendering its outline.
 * Side effects: none.
 * @type {number}
 */
export const HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX = 2;

/**
 * Purpose: Defines the desktop glyph-dot size used by pixel text layout helpers.
 * Parameters: none.
 * Return value: Glyph-dot size in pixels for non-XR rendering.
 * Side effects: none.
 * @type {number}
 */
export const HUD_GLYPH_DOT_SIZE_DESKTOP_PX = 2;

/**
 * Purpose: Defines the XR glyph-dot size used by pixel text layout helpers.
 * Parameters: none.
 * Return value: Glyph-dot size in pixels for XR rendering.
 * Side effects: none.
 * @type {number}
 */
export const HUD_GLYPH_DOT_SIZE_XR_PX = 3;

/**
 * Purpose: Defines the multiplier that converts glyph-dot size into shared HUD text line height.
 * Parameters: none.
 * Return value: Unitless multiplier applied to glyph-dot size.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_LINE_HEIGHT_MULTIPLIER = 12;

/**
 * Purpose: Defines the outer padding around the VR HUD window grid in pixel layout space.
 * Parameters: none.
 * Return value: Pixel padding around the VR HUD layout bounds.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_LAYOUT_OUTER_PADDING_PX = 32;

/**
 * Purpose: Defines the canonical horizontal gap between VR HUD windows in pixel layout space.
 * Parameters: none.
 * Return value: Horizontal gap in pixels between VR HUD windows.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_LAYOUT_INTER_WINDOW_GAP_X_PX = 64;

/**
 * Purpose: Defines the canonical vertical gap between VR HUD windows in pixel layout space.
 * Parameters: none.
 * Return value: Vertical gap in pixels between VR HUD windows.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_LAYOUT_INTER_WINDOW_GAP_Y_PX = 48;

/**
 * Purpose: Defines the canonical X coordinate used to stage right-side HUD windows on the spherical VR layout and to park hidden windows away from the desktop bounds.
 * Parameters: none.
 * Return value: Pixel X coordinate used for right-side VR staging and hidden-window parking.
 * Side effects: none.
 * @type {number}
 */
export const HUD_WINDOW_VR_RIGHT_X_PX = 2000;

/**
 * Purpose: Defines the canonical Y coordinate used to park fully hidden HUD windows above the visible spherical layout band.
 * Parameters: none.
 * Return value: Pixel Y coordinate used for hidden-window parking.
 * Side effects: none.
 * @type {number}
 */
export const HUD_WINDOW_HIDDEN_Y_PX = -2000;

/**
 * Purpose: Default minimum-visible-pixel threshold for HUD window clamping — the smallest strip of a window that must remain on-screen before the clamp logic repositions it.
 * Parameters: none.
 * Return value: Pixel count used as the default for the windowClampMinVisiblePx option.
 * Side effects: none.
 * @type {number}
 */
export const HUD_WINDOW_CLAMP_MIN_VISIBLE_PX = 56;

/**
 * Purpose: Canonical pixel margin between HUD windows and the viewport edge, used for initial placement, right/bottom alignment offsets, and position clamping minimums.
 * @type {number}
 */
export const HUD_WINDOW_EDGE_MARGIN_PX = 16;

/**
 * Purpose: Size in pixels of the resize handle quad in the bottom-right corner of resizable HUD windows.
 * Used for hit-testing, quad allocation, and layout positioning of the resize grip.
 * @type {number}
 */
export const HUD_WINDOW_RESIZE_HANDLE_SIZE_PX = 18;

/**
 * Purpose: Vertical gap in pixels between the bottom of the title bar and the start of window content or scroll track.
 * @type {number}
 */
export const HUD_WINDOW_CONTENT_TOP_MARGIN_PX = 6;

/**
 * Purpose: Total horizontal space in pixels reserved for the scrollbar column in scrollable HUD windows.
 * Content-width calculations deduct this when a scroll track is present.
 * Also used as the vertical inset (top + bottom margins) of the scroll track.
 * @type {number}
 */
export const HUD_SCROLLBAR_RESERVED_WIDTH_PX = 22;

/**
 * Purpose: Physical width in pixels of the scrollbar track and thumb quads.
 * @type {number}
 */
export const HUD_SCROLLBAR_TRACK_WIDTH_PX = 22;

/**
 * Purpose: Minimum height in pixels of the scrollbar thumb.
 * @type {number}
 */
export const HUD_SCROLLBAR_MIN_THUMB_HEIGHT_PX = 20;

/**
 * Purpose: Horizontal inset in pixels from the right edge of a HUD window to the scroll track's left edge.
 * @type {number}
 */
export const HUD_SCROLLBAR_RIGHT_INSET_PX = 22;

/**
 * Purpose: Vertical inset in pixels from the title/content boundary to the top of the scrollbar column.
 * @type {number}
 */
export const HUD_SCROLLBAR_TRACK_TOP_INSET_PX = 2;

/**
 * Purpose: Vertical inset in pixels from the bottom edge of a HUD window to the bottom of the scrollbar column.
 * Mirrors the v3 panel chrome spacing above the resize grip.
 * @type {number}
 */
export const HUD_SCROLLBAR_TRACK_BOTTOM_INSET_PX = HUD_WINDOW_RESIZE_HANDLE_SIZE_PX + 2;

/**
 * Purpose: Height in pixels of the v3-style up/down scrollbar cap buttons.
 * @type {number}
 */
export const HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX = 20;

/**
 * Purpose: Defines the Troika font ascender compensation factor used to nudge top-anchored HUD text upward for stable visual alignment.
 * Parameters: none.
 * Return value: Unitless multiplier applied to a HUD text font size when compensating for ascenders above the visible cap-height.
 * Side effects: none.
 * @type {number}
 */
export const HUD_TEXT_ASCENDER_NUDGE_FACTOR = 0.22;

/**
 * Purpose: Render-order offset for the hit-collider layer (lowest, receives raycasts).
 * @type {number}
 */
export const HUD_RENDER_ORDER_HIT_OFFSET = 8;

/**
 * Purpose: Render-order offset for the drop-shadow layer.
 * @type {number}
 */
export const HUD_RENDER_ORDER_SHADOW_OFFSET = 10;

/**
 * Purpose: Render-order offset for the window outline (border).
 * @type {number}
 */
export const HUD_RENDER_ORDER_OUTLINE_OFFSET = 12;

/**
 * Purpose: Render-order offset for the window background panel.
 * @type {number}
 */
export const HUD_RENDER_ORDER_BG_OFFSET = 14;

/**
 * Purpose: Render-order offset for the inner bevel highlights/shadows.
 * @type {number}
 */
export const HUD_RENDER_ORDER_BEVEL_OFFSET = 15;

/**
 * Purpose: Render-order offset for the content background behind text.
 * @type {number}
 */
export const HUD_RENDER_ORDER_CONTENT_BG_OFFSET = 16;

/**
 * Purpose: Render-order offset for the title bar and status-bar backgrounds.
 * @type {number}
 */
export const HUD_RENDER_ORDER_TITLE_OFFSET = 18;

/**
 * Purpose: Render-order offset for the title divider and status-bar foreground fills.
 * @type {number}
 */
export const HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET = 19;

/**
 * Purpose: Render-order offset for icon overlays (target, buff icons).
 * @type {number}
 */
export const HUD_RENDER_ORDER_ICON_OFFSET = 20;

/**
 * Purpose: Render-order offset for the speed indicator background.
 * @type {number}
 */
export const HUD_RENDER_ORDER_SPEED_BG_OFFSET = 22;

/**
 * Purpose: Render-order offset for the scroll track.
 * @type {number}
 */
export const HUD_RENDER_ORDER_SCROLL_TRACK_OFFSET = 24;

/**
 * Purpose: Render-order offset for the scroll thumb.
 * @type {number}
 */
export const HUD_RENDER_ORDER_SCROLL_THUMB_OFFSET = 25;

/**
 * Purpose: Render-order offset for action buttons (minimize, resize handle).
 * @type {number}
 */
export const HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET = 26;

/**
 * Purpose: Render-order offset applied to text meshes within a HUD window's render-order band.
 * All pixel-text and Troika-text layers use roBase + this offset so text draws above backgrounds, bevels, and scroll furniture.
 * @type {number}
 */
export const HUD_RENDER_ORDER_TEXT_OFFSET = 30;

/**
 * Purpose: Render-order offset for the colored multi-line text overlay layer, one above the text tier.
 * @type {number}
 */
export const HUD_RENDER_ORDER_COLOR_LAYER_OFFSET = 31;

/**
 * Purpose: Render-order offset for the text-editing caret, one above the color layer.
 * @type {number}
 */
export const HUD_RENDER_ORDER_CARET_OFFSET = 32;

/**
 * Purpose: Render-order offset for the caret quad mesh (visible blink indicator in text editors).
 * @type {number}
 */
export const HUD_RENDER_ORDER_CARET_QUAD_OFFSET = 35;

/**
 * Purpose: Canonical near-opaque opacity for solid HUD surface elements
 * (status bars, action buttons, icon backings, resize handles, carets).
 * @type {number}
 */
export const HUD_SURFACE_ELEMENT_OPACITY = 0.95;

/**
 * Purpose: Local z-depth for foreground surface elements within a HUD window
 * (icon overlays, status-bar fills, action buttons, resize handles).
 * @type {number}
 */
export const HUD_Z_SURFACE_FG = 0.0022;

/**
 * Purpose: Local z-depth for background surface elements within a HUD window
 * (status-bar backgrounds, scroll tracks).
 * @type {number}
 */
export const HUD_Z_SURFACE_BG = 0.0021;

/**
 * Purpose: Local z-depth for recessed surface elements within a HUD window
 * (speed-indicator background, hotbar slot backgrounds, scroll track backing).
 * Sits behind HUD_Z_SURFACE_BG to create subtle depth layering.
 * @type {number}
 */
export const HUD_Z_SURFACE_RECESSED = 0.00205;

/**
 * Purpose: Local z-depth for the window background panel.
 * The deepest opaque surface in the HUD window z-stack; bevels, surface
 * elements, and content text all sit above this layer.
 * @type {number}
 */
export const HUD_Z_WINDOW_BG = 0.0015;

/**
 * Purpose: Local z-depth for bevel edge elements on HUD windows.
 * Sits just above the window background and below recessed
 * surface elements, giving bevels subtle relief against the panel.
 * @type {number}
 */
export const HUD_Z_BEVEL = 0.00152;

/**
 * Purpose: Local z-depth for content text layers within the HUD plane.
 * All TroikaPixelText instances that render window body text, status text,
 * hotbar labels, and color-layer overlays use this depth so they stack
 * above window chrome but below the caret.
 * @type {number}
 */
export const HUD_Z_CONTENT_TEXT = 0.004;

/**
 * Purpose: Chooses the canonical glyph-dot size for the current renderer mode.
 * @param {{ xr?: { isPresenting?: boolean } } | undefined} renderer Renderer reference used to detect XR presentation state.
 * @returns {number} Glyph-dot size in pixels for the current presentation mode.
 * Side effects: none.
 */
export function getHudGlyphDotSizePx(renderer) {
  return renderer?.xr?.isPresenting
    ? HUD_GLYPH_DOT_SIZE_XR_PX
    : HUD_GLYPH_DOT_SIZE_DESKTOP_PX;
}

/**
 * Purpose: Converts a glyph-dot size into the shared HUD line-height value.
 * @param {number} dotSizePx Glyph-dot size in pixels.
 * @returns {number} Pixel line height derived from the shared HUD text multiplier.
 * Side effects: none.
 */
export function getHudTextLineHeightPx(dotSizePx) {
  return HUD_TEXT_LINE_HEIGHT_MULTIPLIER * dotSizePx;
}
