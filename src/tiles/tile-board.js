// SPDX-License-Identifier: Apache-2.0
import { createDiamondGrid, createHexGrid } from "../tile-grids.js";

const DEFAULT_BOARD_NAME = "board";
const DEFAULT_BOARD_POSITION = Object.freeze({ x: 0, y: 0, z: -6 });
const DEFAULT_FLOOR_SIZE = 40;
const DEFAULT_FLOOR_COLOR = 0xf6f7f9;
const DEFAULT_FLOOR_ROUGHNESS = 1;
const DEFAULT_FLOOR_METALNESS = 0;
const DEFAULT_FLOOR_Y = -0.001;
const EMPTY_TILE_ID = 0;
const BOARD_QUARTER_TURN_COUNT = 4;
const BOARD_QUARTER_TURN_RADIANS = Math.PI / 2;
const GRID_KIND_DIAMOND = "diamond";
const GRID_KIND_HEX = "hex";

function isSupportedGridKind(value) {
  return value === GRID_KIND_DIAMOND || value === GRID_KIND_HEX;
}

function normalizeBoardYawQuarterTurns(value) {
  const quarterTurns = Number.isFinite(value) ? Math.trunc(value) : 0;
  return (
    ((quarterTurns % BOARD_QUARTER_TURN_COUNT) + BOARD_QUARTER_TURN_COUNT) %
    BOARD_QUARTER_TURN_COUNT
  );
}

function resolveBoardPosition(boardPosition) {
  if (!boardPosition || typeof boardPosition !== "object") {
    return DEFAULT_BOARD_POSITION;
  }

  return {
    x: Number.isFinite(boardPosition.x)
      ? boardPosition.x
      : DEFAULT_BOARD_POSITION.x,
    y: Number.isFinite(boardPosition.y)
      ? boardPosition.y
      : DEFAULT_BOARD_POSITION.y,
    z: Number.isFinite(boardPosition.z)
      ? boardPosition.z
      : DEFAULT_BOARD_POSITION.z,
  };
}

function createTileGrid({ THREE, board, gridKind, gridW, gridH, tileIds, palette, renderCells, renderGridLines }) {
  if (gridKind === GRID_KIND_HEX) {
    return createHexGrid({
      THREE,
      parent: board,
      gridW,
      gridH,
      tileIds,
      palette,
    });
  }

  return createDiamondGrid({
    THREE,
    parent: board,
    gridW,
    gridH,
    tileIds,
    palette,
    renderCells,
    renderGridLines,
  });
}

/**
 * Purpose: Create the shared tile-board runtime that owns the board root, floor, active grid implementation, tile state, and board-rotation helpers for tile apps.
 * @param {object} [options] Tile-board configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate the board group, floor geometry/material, and underlying grid runtime.
 * @param {{ add: (object: unknown) => void, remove?: (object: unknown) => void }} [options.parent] Parent object that receives the board root.
 * @param {number} [options.gridW] Grid width in cells. Must be a positive integer.
 * @param {number} [options.gridH] Grid height in cells. Must be a positive integer.
 * @param {Array<{ id: number, color: number }>} [options.palette] Palette entries used by the active grid runtime to resolve tile colors.
 * @param {string} [options.boardName="board"] Name assigned to the created board group.
 * @param {{ x?: number, y?: number, z?: number }} [options.boardPosition=DEFAULT_BOARD_POSITION] Initial board position in world space.
 * @param {number} [options.floorSize=DEFAULT_FLOOR_SIZE] Floor plane size.
 * @param {number} [options.floorColor=DEFAULT_FLOOR_COLOR] Floor plane color.
 * @param {number} [options.floorRoughness=DEFAULT_FLOOR_ROUGHNESS] Floor material roughness.
 * @param {number} [options.floorMetalness=DEFAULT_FLOOR_METALNESS] Floor material metalness.
 * @param {number} [options.floorY=DEFAULT_FLOOR_Y] Vertical offset applied to the floor plane.
 * @param {"diamond" | "hex"} [options.initialGridKind="diamond"] Grid kind used for the initial grid runtime.
 * @param {number} [options.initialBoardYawQuarterTurns=0] Initial board rotation expressed in quarter-turn steps.
 * @param {boolean} [options.renderCells=true] Diamond grids only. When false, the per-cell instanced mesh is not allocated; tile state and coordinate mapping still work. Use when the app renders its own ground.
 * @param {boolean} [options.renderGridLines=true] Diamond grids only. When false, the grid-line overlay is not allocated. It costs five vectors per cell, so large boards should draw lines in a shader instead.
 * @param {boolean} [options.renderFloor=true] Whether to allocate the backdrop floor plane. Redundant when the app draws ground that already covers the view.
 * @returns {{ board: unknown, clearTiles: () => void, dispose: () => void, getBoardYawQuarterTurns: () => number, getGrid: () => unknown, getGridKind: () => string, getTileAt: (ix: number, iy: number) => number, rotateQuarterTurn: () => number, setBoardYawQuarterTurns: (value: number) => number, setTileAt: (ix: number, iy: number, id: number) => boolean, toggleGridKind: () => string }} Tile-board controller exposing board state, grid switching, rotation helpers, tile getters/setters, and disposal.
 * Side effects: allocates and parents the board group, floor mesh, and active grid runtime, mutates board rotation and tile state during updates, rebuilds/disposes the active grid when grid kind changes, and disposes/removes floor and grid resources on teardown.
 */
export function createTileBoard({
  THREE,
  parent,
  gridW,
  gridH,
  palette,
  boardName = DEFAULT_BOARD_NAME,
  boardPosition = DEFAULT_BOARD_POSITION,
  floorSize = DEFAULT_FLOOR_SIZE,
  floorColor = DEFAULT_FLOOR_COLOR,
  floorRoughness = DEFAULT_FLOOR_ROUGHNESS,
  floorMetalness = DEFAULT_FLOOR_METALNESS,
  floorY = DEFAULT_FLOOR_Y,
  initialGridKind = GRID_KIND_DIAMOND,
  initialBoardYawQuarterTurns = 0,
  renderCells = true,
  renderGridLines = true,
  renderFloor = true,
} = {}) {
  if (!THREE) throw new Error("createTileBoard: THREE is required");
  if (!parent) throw new Error("createTileBoard: parent is required");
  if (!Number.isInteger(gridW) || gridW <= 0) {
    throw new Error("createTileBoard: gridW must be a positive integer");
  }
  if (!Number.isInteger(gridH) || gridH <= 0) {
    throw new Error("createTileBoard: gridH must be a positive integer");
  }
  if (!Array.isArray(palette) || palette.length === 0) {
    throw new Error("createTileBoard: palette is required");
  }
  if (!isSupportedGridKind(initialGridKind)) {
    throw new Error("createTileBoard: initialGridKind must be 'diamond' or 'hex'");
  }

  const resolvedBoardPosition = resolveBoardPosition(boardPosition);
  const tileIds = new Uint8Array(gridW * gridH);

  const board = new THREE.Group();
  board.name = boardName;
  board.position.set(
    resolvedBoardPosition.x,
    resolvedBoardPosition.y,
    resolvedBoardPosition.z
  );
  parent.add(board);

  let floor = null;
  if (renderFloor) {
    floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      new THREE.MeshStandardMaterial({
        color: floorColor,
        roughness: floorRoughness,
        metalness: floorMetalness,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    board.add(floor);
  }

  let gridKind = initialGridKind;
  let boardYawQuarterTurns = normalizeBoardYawQuarterTurns(
    initialBoardYawQuarterTurns
  );
  let grid = null;

  function syncBoardRotation() {
    board.rotation.y = boardYawQuarterTurns * BOARD_QUARTER_TURN_RADIANS;
  }

  function rebuildGrid() {
    if (grid) {
      grid.dispose();
    }

    grid = createTileGrid({
      THREE,
      board,
      gridKind,
      gridW,
      gridH,
      tileIds,
      palette,
      renderCells,
      renderGridLines,
    });

    syncBoardRotation();
    grid.rebuild();
    return grid;
  }

  function tileIndex(ix, iy) {
    if (ix < 0 || iy < 0 || ix >= gridW || iy >= gridH) return -1;
    return iy * gridW + ix;
  }

  function clearTiles() {
    tileIds.fill(EMPTY_TILE_ID);
    grid?.rebuild();
  }

  function getTileAt(ix, iy) {
    const idx = tileIndex(ix, iy);
    if (idx < 0) return EMPTY_TILE_ID;
    return tileIds[idx];
  }

  function setTileAt(ix, iy, id) {
    const idx = tileIndex(ix, iy);
    if (idx < 0) return false;
    tileIds[idx] = id;
    grid?.updateCell(ix, iy);
    return true;
  }

  function toggleGridKind() {
    gridKind = gridKind === GRID_KIND_DIAMOND ? GRID_KIND_HEX : GRID_KIND_DIAMOND;
    rebuildGrid();
    return gridKind;
  }

  function getGridKind() {
    return gridKind;
  }

  function setBoardYawQuarterTurns(value) {
    boardYawQuarterTurns = normalizeBoardYawQuarterTurns(value);
    syncBoardRotation();
    return boardYawQuarterTurns;
  }

  function getBoardYawQuarterTurns() {
    return boardYawQuarterTurns;
  }

  function rotateQuarterTurn() {
    return setBoardYawQuarterTurns(boardYawQuarterTurns + 1);
  }

  function getGrid() {
    return grid;
  }

  function dispose() {
    if (grid) {
      grid.dispose();
      grid = null;
    }

    if (floor) {
      board.remove(floor);
      floor.geometry?.dispose?.();
      floor.material?.dispose?.();
      floor = null;
    }
    parent.remove(board);
  }

  rebuildGrid();

  return {
    board,
    clearTiles,
    dispose,
    getBoardYawQuarterTurns,
    getGrid,
    getGridKind,
    getTileAt,
    rotateQuarterTurn,
    setBoardYawQuarterTurns,
    setTileAt,
    toggleGridKind,
  };
}
