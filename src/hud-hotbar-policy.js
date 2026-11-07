// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the canonical number of hotbar slots created by the shared HUD when callers do not override the slot count.
 * Parameters: none.
 * Return value: Integer slot count used to size the default hotbar layout.
 * Side effects: none.
 * @type {number}
 */
export const HUD_HOTBAR_SLOT_COUNT = 10;

/**
 * Purpose: Defines the canonical hotbar slot index reserved for the Help action in the shared HUD.
 * Parameters: none.
 * Return value: Zero-based hotbar slot index used for the Help affordance.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX = 9;

/**
 * Purpose: Defines the canonical hotbar slot index reserved for the Debug action in the shared HUD.
 * Parameters: none.
 * Return value: Zero-based hotbar slot index used for the Debug affordance.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SYSTEM_HOTBAR_DEBUG_SLOT_INDEX = 8;

/**
 * Purpose: Defines the canonical hotbar slot index reserved for graphics and sound settings.
 * Parameters: none.
 * Return value: Zero-based hotbar slot index used for the settings affordance.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SYSTEM_HOTBAR_SETTINGS_SLOT_INDEX = 7;
