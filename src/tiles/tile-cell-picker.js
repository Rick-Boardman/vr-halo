// SPDX-License-Identifier: Apache-2.0
// Tile-grid cell picking (desktop pointer + ray).
//
// Goals:
// - Own the canonical "screen point / world ray -> board cell" math in one place
//   so every tile app (and the tile painter) resolves cells identically.
// - Pure picking utility: no DOM listeners and no tool side effects. Apps wire
//   their own hover/selection on top of the returned pick helpers.
// - Minimal allocations in hot paths.

import { getClientPointNdc } from "../pointer-coordinates.js";

/**
 * Purpose: Create the shared tile-grid cell picker that converts a desktop client point or a world-space ray into the board cell beneath it, using the board's world transform and the active grid's worldToCell mapping.
 * @param {object} [options] Cell-picker configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate the raycaster and temporary picking state.
 * @param {unknown} [options.camera] Camera used for desktop client-point raycasting.
 * @param {unknown} [options.domElement] Default canvas/DOM element used to map client points into normalized device coordinates when one is not passed per call.
 * @param {{ getWorldPosition: (target: unknown) => unknown, getWorldQuaternion: (target: unknown) => unknown, worldToLocal: (target: unknown) => unknown }} [options.board] Board root whose world transform defines the pick plane (board-local y = 0).
 * @param {{ worldToCell: (x: number, z: number) => { ix: number, iy: number } | null } | null} [options.grid] Optional static grid used when getGrid is not supplied.
 * @param {(() => { worldToCell: (x: number, z: number) => { ix: number, iy: number } | null } | null | undefined) | null} [options.getGrid] Optional late-bound grid resolver used when the active grid changes over time.
 * @param {number} [options.gridW] Optional grid width in cells. When both gridW and gridH are supplied, out-of-range cells are rejected (returns null).
 * @param {number} [options.gridH] Optional grid height in cells. When both gridW and gridH are supplied, out-of-range cells are rejected (returns null).
 * @returns {{ pickCellFromRay: (origin: unknown, dir: unknown) => { ix: number, iy: number } | null, pickCellFromClientPoint: (clientX: number, clientY: number, domElement?: unknown) => { ix: number, iy: number } | null }} Cell picker exposing ray-based and desktop client-point cell resolution.
 * Side effects: allocates picking helpers once; pickers mutate the internal temporaries each call but install no listeners and apply no tools.
 */
export function createTileCellPicker({
  THREE,
  camera,
  domElement,
  board,
  grid,
  getGrid,
  gridW,
  gridH,
} = {}) {
  if (!THREE) throw new Error("createTileCellPicker: THREE is required");
  if (!board) throw new Error("createTileCellPicker: board is required");

  const _getGrid = typeof getGrid === "function" ? getGrid : () => grid;
  const _hasBounds = Number.isInteger(gridW) && Number.isInteger(gridH);

  const raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _tmpQuat = new THREE.Quaternion();
  const _tmpHit = new THREE.Vector3();
  const _tmpLocal = new THREE.Vector3();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _planeNormal = new THREE.Vector3(0, 1, 0);
  const _planePoint = new THREE.Vector3();

  function inBounds(cell) {
    if (!cell) return false;
    if (!_hasBounds) return true;
    return cell.ix >= 0 && cell.ix < gridW && cell.iy >= 0 && cell.iy < gridH;
  }

  function pickCellFromRay(origin, dir) {
    const g = _getGrid();
    if (!g) return null;

    // Intersect the board's local y = 0 plane in world space.
    board.getWorldPosition(_planePoint);
    board.getWorldQuaternion(_tmpQuat);
    _planeNormal.set(0, 1, 0).applyQuaternion(_tmpQuat).normalize();
    _plane.normal.copy(_planeNormal);
    _plane.constant = -_plane.normal.dot(_planePoint);

    raycaster.ray.origin.copy(origin);
    raycaster.ray.direction.copy(dir);
    if (!raycaster.ray.intersectPlane(_plane, _tmpHit)) return null;

    _tmpLocal.copy(_tmpHit);
    board.worldToLocal(_tmpLocal);
    const cell = g.worldToCell(_tmpLocal.x, _tmpLocal.z);
    return inBounds(cell) ? cell : null;
  }

  function pickCellFromClientPoint(clientX, clientY, overrideElement) {
    const element = overrideElement ?? domElement ?? null;
    const pointerNdc = getClientPointNdc(clientX, clientY, element);
    if (!pointerNdc) return null;
    _ndc.set(pointerNdc.x, pointerNdc.y);
    raycaster.setFromCamera(_ndc, camera);
    return pickCellFromRay(raycaster.ray.origin, raycaster.ray.direction);
  }

  return { pickCellFromRay, pickCellFromClientPoint };
}
