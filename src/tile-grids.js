// SPDX-License-Identifier: Apache-2.0
// Tile grid render + coordinate helpers (diamond 2:1 and pointy-top hex).
// Designed to be small and shared-runtime-friendly.

import { clamp } from "./scalar-math.js";

/** Pack two 16-bit grid coordinates into a single integer key (max axis ≤ 2^16). */
const GRID_COORD_PACK_STRIDE = 65536;

// ── Shared grid-line visual constants ──
/** Small Y-lift (world units) for grid-line overlays to avoid z-fighting with the ground plane. */
const GRID_LINE_Y_OFFSET = 0.002;
/** Neutral dark-grey colour shared by diamond and hex grid-line overlays. */
const GRID_LINE_COLOR = 0x2d2f34;
/** Grid-line opacity for the 2:1 diamond overlay. */
const DIAMOND_GRID_LINE_OPACITY = 0.16;
/** Grid-line opacity for the pointy-top hex overlay (slightly more transparent). */
const HEX_GRID_LINE_OPACITY = 0.14;
/** Fallback tile colour when a palette entry is missing. */
const TILE_FALLBACK_COLOR = 0xffffff;

function key(ix, iy) {
  return iy * GRID_COORD_PACK_STRIDE + ix;
}

function makeSharedTileMaterial(THREE) {
  // Use instanceColor for per-cell color — vertexColors must be false
  // because the tile geometry has no per-vertex color attribute; enabling
  // vertexColors would multiply instanceColor by (0,0,0), making every tile black.
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    depthWrite: true,
  });
}

function paletteColorForId(palette, id) {
  const t = palette.find((p) => p.id === id);
  return t ? t.color : TILE_FALLBACK_COLOR;
}

function buildInstancedTiles({ THREE, parent, count, geometry }) {
  const mat = makeSharedTileMaterial(THREE);
  const mesh = new THREE.InstancedMesh(geometry, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  // Enable per-instance color.
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  parent.add(mesh);

  return mesh;
}

function buildLineSegmentsFromLoops(THREE, loops, { color = GRID_LINE_COLOR, opacity = DIAMOND_GRID_LINE_OPACITY } = {}) {
  // loops: Array<Array<THREE.Vector3>> where each inner array is a closed polyline.
  let segCount = 0;
  for (const loop of loops) {
    if (!loop || loop.length < 2) continue;
    // consecutive pairs
    segCount += loop.length - 1;
  }

  const pos = new Float32Array(segCount * 2 * 3);
  let o = 0;
  for (const loop of loops) {
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i];
      const b = loop[i + 1];
      pos[o++] = a.x;
      pos[o++] = a.y;
      pos[o++] = a.z;
      pos[o++] = b.x;
      pos[o++] = b.y;
      pos[o++] = b.z;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  return lines;
}

/**
 * Purpose: Create the shared 2:1 diamond tile grid runtime that instanced-renders board cells, derives cell/world coordinates, and rebuilds line overlays for isometric tile apps.
 * @param {object} [options] Diamond-grid configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate the group, shapes, geometries, materials, instanced mesh, line segments, and temporary math objects.
 * @param {{ add: (object: unknown) => void, remove?: (object: unknown) => void }} [options.parent] Parent object that receives the grid group.
 * @param {number} [options.gridW] Grid width in cells.
 * @param {number} [options.gridH] Grid height in cells.
 * @param {ArrayLike<number>} [options.tileIds] Flat tile-id array indexed by `iy * gridW + ix`.
 * @param {Array<{ id: number, color: number }>} [options.palette] Palette entries used to resolve tile ids into display colors.
 * @param {boolean} [options.renderCells=true] Whether to allocate the per-cell instanced mesh. Set false when the app draws its own ground and only needs the coordinate mapping.
 * @param {boolean} [options.renderGridLines=true] Whether to allocate the grid-line overlay. Costs five vectors per cell, so large boards should draw grid lines in a shader instead.
 * @returns {{ group: unknown, rebuild: () => void, updateCell: (ix: number, iy: number) => void, dispose: () => void, worldToCell: (x: number, z: number) => { ix: number, iy: number } }} Diamond-grid controller with the grid root, full rebuild/update hooks, disposal, and world-to-cell mapping.
 * Side effects: allocates instanced geometry, materials, and line overlays, adds the grid group to the supplied parent, mutates instance matrices and colors during rebuild/update calls, and disposes/removes allocated Three.js resources on teardown.
 */
export function createDiamondGrid({
  THREE,
  parent,
  gridW,
  gridH,
  tileIds,
  palette,
  renderCells = true,
  renderGridLines = true,
} = {}) {
  if (!THREE) throw new Error("createDiamondGrid: THREE required");
  if (!parent) throw new Error("createDiamondGrid: parent required");

  const group = new THREE.Group();
  group.name = "diamondGrid";
  parent.add(group);

  const TILE_W = 1.0;
  const TILE_H = 0.5; // 2:1 diamond

  const cellCount = gridW * gridH;

  // Diamond tile is a rotated plane in XZ.
  const shape = new THREE.Shape();
  shape.moveTo(0, TILE_H / 2);
  shape.lineTo(TILE_W / 2, 0);
  shape.lineTo(0, -TILE_H / 2);
  shape.lineTo(-TILE_W / 2, 0);
  shape.closePath();

  const geom2d = renderCells ? new THREE.ShapeGeometry(shape) : null;
  let tileGeom = null;
  if (renderCells) {
    tileGeom = new THREE.BufferGeometry();
    tileGeom.copy(geom2d);
    tileGeom.rotateX(-Math.PI / 2);
  }

  const tiles = renderCells
    ? buildInstancedTiles({ THREE, parent: group, count: cellCount, geometry: tileGeom })
    : null;

  // Grid lines (single draw call)
  let gridLines = null;

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  const tmpColor = new THREE.Color();

  function cellToWorld(ix, iy) {
    // Isometric diamond: x-axis is (TILE_W/2, TILE_H/2), y-axis is (-TILE_W/2, TILE_H/2)
    const x = (ix - iy) * (TILE_W / 2);
    const z = (ix + iy) * (TILE_H / 2);
    return { x, z };
  }

  function worldToCell(x, z) {
    // Invert the above mapping. Deliberately unclamped: callers such as
    // tile-cell-picker bound-check the result to reject picks that land off the
    // board, and clamping here silently snapped those to an edge cell instead.
    const ix = Math.round((x / (TILE_W / 2) + z / (TILE_H / 2)) / 2);
    const iy = Math.round((z / (TILE_H / 2) - x / (TILE_W / 2)) / 2);
    return { ix, iy };
  }

  function rebuildLines() {
    if (!renderGridLines) return;
    if (gridLines) {
      group.remove(gridLines);
      gridLines.geometry?.dispose?.();
      gridLines.material?.dispose?.();
      gridLines = null;
    }

    const loops = [];
    // Reuse corner offsets (closed)
    const c0 = new THREE.Vector3(0, GRID_LINE_Y_OFFSET, TILE_H / 2);
    const c1 = new THREE.Vector3(TILE_W / 2, GRID_LINE_Y_OFFSET, 0);
    const c2 = new THREE.Vector3(0, GRID_LINE_Y_OFFSET, -TILE_H / 2);
    const c3 = new THREE.Vector3(-TILE_W / 2, GRID_LINE_Y_OFFSET, 0);

    for (let iy = 0; iy < gridH; iy++) {
      for (let ix = 0; ix < gridW; ix++) {
        const p = cellToWorld(ix, iy);
        loops.push([
          new THREE.Vector3(c0.x + p.x, c0.y, c0.z + p.z),
          new THREE.Vector3(c1.x + p.x, c1.y, c1.z + p.z),
          new THREE.Vector3(c2.x + p.x, c2.y, c2.z + p.z),
          new THREE.Vector3(c3.x + p.x, c3.y, c3.z + p.z),
          new THREE.Vector3(c0.x + p.x, c0.y, c0.z + p.z),
        ]);
      }
    }

    gridLines = buildLineSegmentsFromLoops(THREE, loops, { color: GRID_LINE_COLOR, opacity: DIAMOND_GRID_LINE_OPACITY });
    gridLines.name = "gridLines";
    group.add(gridLines);
  }

  function rebuild() {
    if (tiles) {
      for (let iy = 0; iy < gridH; iy++) {
        for (let ix = 0; ix < gridW; ix++) {
          updateCell(ix, iy);
        }
      }

      tiles.instanceMatrix.needsUpdate = true;
      tiles.instanceColor.needsUpdate = true;
    }

    rebuildLines();
  }

  function updateCell(ix, iy) {
    if (!tiles) return;
    const idx = iy * gridW + ix;
    const p = cellToWorld(ix, iy);

    tmpPos.set(p.x, 0, p.z);
    tmpQuat.identity();
    tmpScale.set(1, 1, 1);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    tiles.setMatrixAt(idx, tmpMat);

    const id = tileIds[idx];
    tmpColor.setHex(id ? paletteColorForId(palette, id) : TILE_FALLBACK_COLOR);
    tiles.setColorAt(idx, tmpColor);

    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;
  }

  function dispose() {
    parent.remove(group);
    tileGeom?.dispose?.();
    tiles?.geometry?.dispose?.();
    tiles?.material?.dispose?.();
    if (gridLines) {
      gridLines.geometry?.dispose?.();
      gridLines.material?.dispose?.();
    }
  }

  return { group, rebuild, updateCell, dispose, worldToCell };
}

/**
 * Purpose: Create the shared pointy-top hex tile grid runtime that instanced-renders cells, approximates world-to-cell picking, and rebuilds line overlays for tile apps.
 * @param {object} [options] Hex-grid configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate the group, shapes, geometries, materials, instanced mesh, line segments, and temporary math objects.
 * @param {{ add: (object: unknown) => void, remove?: (object: unknown) => void }} [options.parent] Parent object that receives the grid group.
 * @param {number} [options.gridW] Grid width in cells.
 * @param {number} [options.gridH] Grid height in cells.
 * @param {ArrayLike<number>} [options.tileIds] Flat tile-id array indexed by `iy * gridW + ix`.
 * @param {Array<{ id: number, color: number }>} [options.palette] Palette entries used to resolve tile ids into display colors.
 * @returns {{ group: unknown, rebuild: () => void, updateCell: (ix: number, iy: number) => void, dispose: () => void, worldToCell: (x: number, z: number) => { ix: number, iy: number } }} Hex-grid controller with the grid root, full rebuild/update hooks, disposal, and world-to-cell mapping.
 * Side effects: allocates instanced geometry, materials, and line overlays, adds the grid group to the supplied parent, mutates instance matrices and colors during rebuild/update calls, and disposes/removes allocated Three.js resources on teardown.
 */
export function createHexGrid({ THREE, parent, gridW, gridH, tileIds, palette } = {}) {
  if (!THREE) throw new Error("createHexGrid: THREE required");
  if (!parent) throw new Error("createHexGrid: parent required");

  const group = new THREE.Group();
  group.name = "hexGrid";
  parent.add(group);

  // Pointy-top hex geometry.
  // R  = circumradius (centre to vertex).
  // W  = √3 × R  (flat-to-flat width for pointy-top orientation).
  // H  = 2 × R   (vertex-to-vertex height).
  // VSTEP = 3/2 × R (vertical row spacing that interlocks rows).
  const HEX_CELL_RADIUS = 0.45;
  const W = Math.sqrt(3) * HEX_CELL_RADIUS;
  const H = 2 * HEX_CELL_RADIUS;
  const VSTEP = (3 / 2) * HEX_CELL_RADIUS;

  const cellCount = gridW * gridH;

  // Build pointy-top hex outline in the XY plane by stepping at 60° increments
  // (π/3) with a 30° initial offset (π/6) so the first vertex points upward
  // rather than to the right, producing a "pointy-top" layout.
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * HEX_CELL_RADIUS;
    const y = Math.sin(a) * HEX_CELL_RADIUS;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geom2d = renderCells ? new THREE.ShapeGeometry(shape) : null;
  let tileGeom = null;
  if (renderCells) {
    tileGeom = new THREE.BufferGeometry();
    tileGeom.copy(geom2d);
    tileGeom.rotateX(-Math.PI / 2);
  }

  const tiles = renderCells
    ? buildInstancedTiles({ THREE, parent: group, count: cellCount, geometry: tileGeom })
    : null;

  let gridLines = null;

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  const tmpColor = new THREE.Color();

  function cellToWorld(ix, iy) {
    // Offset coords (pointy-top): each row shifts x by half a hex width.
    const x = ix * W + (iy % 2 ? W / 2 : 0);
    const z = iy * VSTEP;
    return { x: x - (gridW * W) / 2, z: z - (gridH * VSTEP) / 2 };
  }

  function worldToCell(x, z) {
    // Approx nearest in offset coord space.
    const px = x + (gridW * W) / 2;
    const pz = z + (gridH * VSTEP) / 2;

    let iy = Math.round(pz / VSTEP);
    iy = clamp(iy, 0, gridH - 1);

    const rowShift = iy % 2 ? W / 2 : 0;
    let ix = Math.round((px - rowShift) / W);
    ix = clamp(ix, 0, gridW - 1);

    return { ix, iy };
  }

  function rebuildLines() {
    if (!renderGridLines) return;
    if (gridLines) {
      group.remove(gridLines);
      gridLines.geometry?.dispose?.();
      gridLines.material?.dispose?.();
      gridLines = null;
    }

    // Build a 7-vertex closed hex ring (vertex 6 = vertex 0) for the wire overlay.
    // Same pointy-top orientation as the tile shape: 60° steps with 30° offset.
    const corners = [];
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI / 3) * (i % 6) + Math.PI / 6;
      corners.push(new THREE.Vector3(Math.cos(a) * HEX_CELL_RADIUS, GRID_LINE_Y_OFFSET, Math.sin(a) * HEX_CELL_RADIUS));
    }

    const loops = [];
    for (let iy = 0; iy < gridH; iy++) {
      for (let ix = 0; ix < gridW; ix++) {
        const p = cellToWorld(ix, iy);
        loops.push(
          corners.map((c) => new THREE.Vector3(c.x + p.x, c.y, c.z + p.z))
        );
      }
    }

    gridLines = buildLineSegmentsFromLoops(THREE, loops, { color: GRID_LINE_COLOR, opacity: HEX_GRID_LINE_OPACITY });
    gridLines.name = "gridLines";
    group.add(gridLines);
  }

  function rebuild() {
    if (tiles) {
      for (let iy = 0; iy < gridH; iy++) {
        for (let ix = 0; ix < gridW; ix++) {
          updateCell(ix, iy);
        }
      }

      tiles.instanceMatrix.needsUpdate = true;
      tiles.instanceColor.needsUpdate = true;
    }

    rebuildLines();
  }

  function updateCell(ix, iy) {
    if (!tiles) return;
    const idx = iy * gridW + ix;
    const p = cellToWorld(ix, iy);

    tmpPos.set(p.x, 0, p.z);
    tmpQuat.identity();
    tmpScale.set(1, 1, 1);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    tiles.setMatrixAt(idx, tmpMat);

    const id = tileIds[idx];
    tmpColor.setHex(id ? paletteColorForId(palette, id) : TILE_FALLBACK_COLOR);
    tiles.setColorAt(idx, tmpColor);

    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;
  }

  function dispose() {
    parent.remove(group);
    tileGeom?.dispose?.();
    tiles?.geometry?.dispose?.();
    tiles?.material?.dispose?.();
    if (gridLines) {
      gridLines.geometry?.dispose?.();
      gridLines.material?.dispose?.();
    }
  }

  return { group, rebuild, updateCell, dispose, worldToCell };
}
