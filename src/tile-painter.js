// SPDX-License-Identifier: Apache-2.0
// Tile painting interaction helper (desktop + VR).
//
// Goals:
// - Keep tile painting logic out of app entrypoints.
// - Work with WebGL-only HUD (no DOM overlays).
// - Minimal allocations in hot paths.

import { createTileCellPicker } from "./tiles/tile-cell-picker.js";

/**
 * Purpose: Create the canonical tile-painting interaction helper that maps desktop pointer input and VR controller selection rays onto board cells and applies the active tile tool.
 * @param {object} [options] Tile-painter configuration.
 * @param {{ Raycaster: new () => { setFromCamera: (ndc: unknown, camera: unknown) => void, ray: { origin: unknown, direction: unknown } }, Vector2: new () => { set: (x: number, y: number) => void }, Quaternion: new () => { }, Ray: new (origin: unknown, direction: unknown) => { origin: { copy: (value: unknown) => void }, direction: { copy: (value: unknown) => void }, intersectPlane: (plane: unknown, target: unknown) => unknown }, Vector3: new (x?: number, y?: number, z?: number) => { copy: (value: unknown) => unknown, set: (x: number, y: number, z: number) => unknown, applyQuaternion: (value: unknown) => unknown, normalize: () => unknown }, Plane: new (normal: unknown, constant: number) => { normal: { copy: (value: unknown) => void }, constant: number } }} [options.THREE] Three.js constructors used for raycasting, board-plane intersection, and temporary vector/quaternion state.
 * @param {{ domElement: { addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => void, removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => void }, xr: { isPresenting?: boolean } }} [options.renderer] Renderer whose DOM element receives desktop pointer events and whose XR state controls whether desktop or VR painting is active.
 * @param {unknown} [options.camera] Camera used for desktop pointer raycasting.
 * @param {{ isClientPointOverUi?: (clientX: number, clientY: number) => boolean, controllers?: { ray0?: { addEventListener?: Function, getWorldPosition?: Function, getWorldQuaternion?: Function }, ray1?: { addEventListener?: Function, getWorldPosition?: Function, getWorldQuaternion?: Function } } } | null} [options.hudSystem] Optional HUD system used to suppress desktop painting over UI and to access canonical XR controller rays.
 * @param {{ getWorldPosition: (target: unknown) => unknown, getWorldQuaternion: (target: unknown) => unknown, worldToLocal: (target: unknown) => unknown }} [options.board] Board object whose local y=0 plane is used for cell picking.
 * @param {{ worldToCell: (x: number, z: number) => { ix: number, iy: number } | null } | null} [options.grid] Optional static grid object used when getGrid is not supplied.
 * @param {(() => { worldToCell: (x: number, z: number) => { ix: number, iy: number } | null } | null | undefined) | null} [options.getGrid] Optional late-bound grid resolver used when the active grid changes over time.
 * @param {(() => boolean) | null} [options.isEnabled] Optional predicate that disables painting when it returns false.
 * @param {(() => string) | null} [options.getTool] Optional tool resolver; defaults to "paint" and suppresses drag painting when it returns "pick".
 * @param {boolean} [options.dragPaint=true] When false, disables continuous painting while dragging; only clean clicks (no drag) trigger applyTool.
 * @param {(ix: number, iy: number) => void} [options.applyTool] Required tile-application callback invoked with the picked cell coordinates.
 * @returns {{ update: () => void, dispose: () => void }} Tile-painter controller with a per-frame VR update hook and a disposer that removes the installed desktop listeners.
 * Side effects: installs desktop pointer listeners on the renderer DOM element and window, lazily binds XR controller select listeners, raycasts and intersects the board plane to resolve cells, tracks drag/select state, and invokes applyTool whenever a tile action is triggered.
 */
export function createTilePainter({
  THREE,
  renderer,
  camera,
  hudSystem,
  board,
  grid,
  getGrid,
  isEnabled,
  getTool,
  dragPaint = true,
  applyTool,
} = {}) {
  if (!THREE) throw new Error("createTilePainter: THREE is required");
  if (!renderer) throw new Error("createTilePainter: renderer is required");
  if (!camera) throw new Error("createTilePainter: camera is required");
  if (!board) throw new Error("createTilePainter: board is required");
  if (typeof applyTool !== "function") {
    throw new Error("createTilePainter: applyTool(ix, iy) is required");
  }

  const _isEnabled = typeof isEnabled === "function" ? isEnabled : () => true;
  const _getTool = typeof getTool === "function" ? getTool : () => "paint";
  const _getGrid = typeof getGrid === "function" ? getGrid : () => grid;

  const cellPicker = createTileCellPicker({
    THREE,
    camera,
    domElement: renderer.domElement,
    board,
    getGrid: _getGrid,
  });

  function pickCellFromRay(origin, dir) {
    return cellPicker.pickCellFromRay(origin, dir);
  }

  // Desktop pointer paint
  let mouseDown = false;
  let mouseDownMoved = false;
  let downX = 0;
  let downY = 0;

  function pickCellFromMouse(clientX, clientY) {
    return cellPicker.pickCellFromClientPoint(clientX, clientY);
  }

  function onPointerDown(e) {
    if (renderer.xr.isPresenting) return;
    if (!_isEnabled()) return;
    if (hudSystem?.isClientPointOverUi?.(e.clientX, e.clientY)) return;

    mouseDown = true;
    mouseDownMoved = false;
    downX = e.clientX;
    downY = e.clientY;
  }

  function onPointerMove(e) {
    if (renderer.xr.isPresenting) return;
    if (!mouseDown) return;

    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.abs(dx) + Math.abs(dy) > 3) mouseDownMoved = true;

    // Paint while dragging (except pick tool or when dragPaint is off).
    if (dragPaint && _getTool() !== "pick") {
      const cell = pickCellFromMouse(e.clientX, e.clientY);
      if (cell) applyTool(cell.ix, cell.iy);
    }
  }

  function onPointerUp(e) {
    if (renderer.xr.isPresenting) return;
    if (!mouseDown) return;
    mouseDown = false;

    if (!mouseDownMoved) {
      if (hudSystem?.isClientPointOverUi?.(e.clientX, e.clientY)) return;
      const cell = pickCellFromMouse(e.clientX, e.clientY);
      if (cell) applyTool(cell.ix, cell.iy);
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, {
    passive: true,
  });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });

  // VR select paint (continuous)
  const _vrTmpOrigin = new THREE.Vector3();
  const _vrTmpDir = new THREE.Vector3();
  const _vrTmpQuat = new THREE.Quaternion();

  function makeVrSelectState() {
    return { selecting: false, lastIx: -1, lastIy: -1 };
  }

  const state0 = makeVrSelectState();
  const state1 = makeVrSelectState();

  function bindVr(controllerRay, state) {
    if (!controllerRay?.addEventListener) return;

    controllerRay.addEventListener("selectstart", () => {
      state.selecting = true;
      state.lastIx = -1;
      state.lastIy = -1;
    });

    controllerRay.addEventListener("selectend", () => {
      state.selecting = false;
      state.lastIx = -1;
      state.lastIy = -1;
    });
  }

  function updateVrSelect(controllerRay, state) {
    if (!state.selecting) return;
    if (!_isEnabled()) return;

    controllerRay.getWorldPosition(_vrTmpOrigin);
    controllerRay.getWorldQuaternion(_vrTmpQuat);
    _vrTmpDir.set(0, 0, -1).applyQuaternion(_vrTmpQuat).normalize();

    const cell = pickCellFromRay(_vrTmpOrigin, _vrTmpDir);
    if (!cell) return;
    if (cell.ix === state.lastIx && cell.iy === state.lastIy) return;
    state.lastIx = cell.ix;
    state.lastIy = cell.iy;
    applyTool(cell.ix, cell.iy);
  }

  function update() {
    if (!renderer.xr.isPresenting) return;

    const c0 = hudSystem?.controllers?.ray0;
    const c1 = hudSystem?.controllers?.ray1;

    // Lazily bind once controllers exist.
    if (c0 && !state0._bound) {
      state0._bound = true;
      bindVr(c0, state0);
    }
    if (c1 && !state1._bound) {
      state1._bound = true;
      bindVr(c1, state1);
    }

    if (c0) updateVrSelect(c0, state0);
    if (c1) updateVrSelect(c1, state1);
  }

  function dispose() {
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    // Note: we don't remove controller listeners (controllers are stable per page).
  }

  return { update, dispose };
}
