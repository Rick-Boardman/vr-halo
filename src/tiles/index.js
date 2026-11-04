// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the shared tile-painting interaction helper from the tiles barrel.
 * Parameters: forwarded from createTilePainter in ../tile-painter.js.
 * Return value: forwards the createTilePainter return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createTilePainter.
 */
export { createTilePainter } from "../tile-painter.js";

/**
 * Purpose: Re-export the shared diamond-grid runtime factory from the tiles barrel.
 * Parameters: forwarded from createDiamondGrid in ../tile-grids.js.
 * Return value: forwards the createDiamondGrid return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createDiamondGrid.
 */
export { createDiamondGrid } from "../tile-grids.js";

/**
 * Purpose: Re-export the shared hex-grid runtime factory from the tiles barrel.
 * Parameters: forwarded from createHexGrid in ../tile-grids.js.
 * Return value: forwards the createHexGrid return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createHexGrid.
 */
export { createHexGrid } from "../tile-grids.js";

/**
 * Purpose: Re-export the shared tile-board runtime factory from the tiles barrel.
 * Parameters: forwarded from createTileBoard in ./tile-board.js.
 * Return value: forwards the createTileBoard return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createTileBoard.
 */
export { createTileBoard } from "./tile-board.js";

/**
 * Purpose: Re-export the shared tile-grid cell picker from the tiles barrel.
 * Parameters: forwarded from createTileCellPicker in ./tile-cell-picker.js.
 * Return value: forwards the createTileCellPicker return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createTileCellPicker.
 */
export { createTileCellPicker } from "./tile-cell-picker.js";
