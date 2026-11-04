// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Defines the primary active HUD highlight color for selected text, controller rays, and active outlines.
 * Parameters: none.
 * Return value: Hex color integer for the primary active HUD highlight.
 * Side effects: none.
 * @type {number}
 */
export const HUD_PRIMARY_HIGHLIGHT_COLOR = 0x4aa3ff;

/**
 * Purpose: Defines the secondary HUD highlight color for alternate controller rays and hit markers.
 * Parameters: none.
 * Return value: Hex color integer for the secondary HUD highlight.
 * Side effects: none.
 * @type {number}
 */
export const HUD_SECONDARY_HIGHLIGHT_COLOR = 0xff6a6a;

/**
 * Purpose: Defines the debug-only world collision dot color shown when controller rays hit world geometry instead of HUD surfaces.
 * Parameters: none.
 * Return value: Hex color integer for world collision dots.
 * Side effects: none.
 * @type {number}
 */
export const HUD_WORLD_COLLISION_DOT_COLOR = 0x66ff99;

/**
 * Purpose: Defines the emissive node glow color used by shared graph scenes when a node is selected.
 * Parameters: none.
 * Return value: Hex color integer for selected graph node emissive glow.
 * Side effects: none.
 * @type {number}
 */
export const HUD_GRAPH_NODE_SELECTED_EMISSIVE_COLOR = 0x223355;

/**
 * Purpose: Defines the emissive node glow color used by shared graph scenes when a node is hovered.
 * Parameters: none.
 * Return value: Hex color integer for hovered graph node emissive glow.
 * Side effects: none.
 * @type {number}
 */
export const HUD_GRAPH_NODE_HOVER_EMISSIVE_COLOR = 0x17202b;

/**
 * Purpose: Defines the neutral emissive node color used by shared graph scenes when a node is neither hovered nor selected.
 * Parameters: none.
 * Return value: Hex color integer for neutral graph node emissive glow.
 * Side effects: none.
 * @type {number}
 */
export const HUD_GRAPH_NODE_NEUTRAL_EMISSIVE_COLOR = 0x000000;
