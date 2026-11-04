// SPDX-License-Identifier: Apache-2.0
// Shared world-space placement defaults for the canonical HUD surface.

/**
 * Purpose: Defines the default desktop camera distance used to place the shared HUD in front of the view.
 * Parameters: none.
 * Return value: Distance in meters from the desktop camera to the HUD root.
 * Side effects: none.
 * @type {number}
 */
export const HUD_DESKTOP_DISTANCE_M = 0.6;

/**
 * Purpose: Defines the default spherical HUD radius used during VR presentation.
 * Parameters: none.
 * Return value: Distance in meters from the VR anchor to the canonical HUD surface.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_DISTANCE_M = 4.2;

/**
 * Purpose: Defines the default vertical offset applied to the HUD when anchored in VR.
 * Parameters: none.
 * Return value: Offset in meters applied on the world Y axis.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_Y_OFFSET_M = -0.32;

/**
 * Purpose: Defines the default width of the canonical VR HUD surface.
 * Parameters: none.
 * Return value: Width in meters used when no caller-specific VR width is supplied.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_SURFACE_WIDTH_M = 6.2;

/**
 * Purpose: Defines the default height of the canonical VR HUD surface.
 * Parameters: none.
 * Return value: Height in meters used when no caller-specific VR height is supplied.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_SURFACE_HEIGHT_M = 3.9;

/**
 * Purpose: Defines the minimum allowed VR HUD radius before per-window depth adjustments clamp outward.
 * Parameters: none.
 * Return value: Minimum radius in meters used for VR depth clamping.
 * Side effects: none.
 * @type {number}
 */
export const HUD_VR_DEPTH_MIN_RADIUS_M = 1.75;
