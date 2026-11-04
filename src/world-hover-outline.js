// SPDX-License-Identifier: Apache-2.0
// Desktop-only world hover outline helper.
//
// Purpose:
// - Provide a consistent "hovered world object" visual affordance across demos/scenes.
// - Suppress world hover visuals when the cursor is over HUD UI.
// - Keep behavior WebGL-only (no DOM overlays).
//
// Design notes:
// - Uses EdgesGeometry + LineSegments to highlight object edges.
// - For round shapes (e.g., SphereGeometry), EdgesGeometry produces very busy lines.
//   Default behavior skips sphere-like geometries unless explicitly allowed.

import { getClientPointNdc } from "./pointer-coordinates.js";

// ── Default outline visual parameters ──
/** Light cyan outline tint for hovered world objects. */
const DEFAULT_OUTLINE_COLOR = 0x66ccff;
/** Scale the outline shell 2 % beyond the mesh surface to avoid z-fighting. */
const DEFAULT_OUTLINE_SCALE = 1.02;
/** EdgesGeometry threshold angle (degrees) for detecting hard edges. */
const DEFAULT_EDGE_THRESHOLD_ANGLE = 35;
/** Raycaster far-plane distance for hover picking. */
const DEFAULT_RAYCAST_FAR = 500;

/**
 * @typedef {{
 *   isClientPointOverUi?: (clientX: number, clientY: number) => boolean,
 * }} WorldHoverOutlineHudSystem
 */

/**
 * @typedef {{
 *   THREE?: {
 *     Raycaster: new () => { setFromCamera(ndc: { x?: number, y?: number }, camera: unknown): void, far?: number, intersectObjects(objects: unknown[], recursive?: boolean): Array<{ object?: any }> },
 *     Vector2: new () => { x?: number, y?: number, set(x: number, y: number): void },
 *     LineBasicMaterial: new (options: object) => { depthWrite?: boolean, depthTest?: boolean, polygonOffset?: boolean, polygonOffsetFactor?: number, polygonOffsetUnits?: number, dispose?(): void },
 *     MeshBasicMaterial: new (options: object) => { depthWrite?: boolean, depthTest?: boolean, polygonOffset?: boolean, polygonOffsetFactor?: number, polygonOffsetUnits?: number, dispose?(): void },
 *     BufferGeometry: new () => any,
 *     LineSegments: new (geometry: any, material: any) => { geometry?: any, frustumCulled?: boolean, renderOrder?: number, scale: { setScalar(value: number): void }, visible?: boolean, parent?: { remove(child: unknown): void } | null },
 *     Mesh: new (geometry: any, material: any) => { geometry?: any, frustumCulled?: boolean, renderOrder?: number, scale: { setScalar(value: number): void }, visible?: boolean, parent?: { remove(child: unknown): void } | null },
 *     EdgesGeometry: new (geometry: any, threshold?: number) => { dispose?(): void },
 *     BackSide: unknown,
 *   },
 *   renderer?: { xr?: { isPresenting?: boolean }, domElement: { getBoundingClientRect(): { left: number, top: number, width: number, height: number } } },
 *   camera?: unknown,
 *   scene?: unknown,
 *   hudSystem?: WorldHoverOutlineHudSystem | null,
 *   getHudSystem?: (() => WorldHoverOutlineHudSystem | null | undefined) | null,
 *   pickables?: any[] | null,
 *   getPickables?: (() => any[] | null | undefined) | null,
 *   mode?: "silhouette" | "edges" | "auto",
 *   color?: number,
 *   opacity?: number,
 *   scale?: number,
 *   edgeThresholdAngle?: number,
 *   far?: number,
 *   allowRoundGeometry?: boolean,
 *   canOutline?: ((mesh: any) => boolean) | null,
 * }} WorldHoverOutlineOptions
 */

/**
 * Purpose: Create the canonical desktop world-hover outline controller that highlights the currently hovered pickable object while suppressing outlines over HUD UI and during WebXR presentation.
 * @param {object} [options] World-hover outline configuration.
 * @param {WorldHoverOutlineOptions["THREE"]} [options.THREE] Three.js constructors and constants used to allocate the raycaster, working vectors, outline geometries, and outline materials.
 * @param {WorldHoverOutlineOptions["renderer"]} [options.renderer] Renderer whose DOM element provides pointer coordinates and whose XR state suppresses desktop hover outlines while presenting.
 * @param {WorldHoverOutlineOptions["camera"]} [options.camera] Camera used for pointer raycasting.
 * @param {WorldHoverOutlineOptions["scene"]} [options.scene] Scene required by the public contract for consistency with other world helpers; the outline attaches directly to hovered meshes rather than the scene root.
 * @param {WorldHoverOutlineOptions["hudSystem"]} [options.hudSystem] Optional eagerly bound HUD system used to suppress outlines when the pointer is over UI.
 * @param {WorldHoverOutlineOptions["getHudSystem"]} [options.getHudSystem] Optional late-bound HUD-system resolver used when the HUD helper is created before the HUD system exists.
 * @param {WorldHoverOutlineOptions["pickables"]} [options.pickables] Optional eagerly bound list of world objects eligible for hover outlining.
 * @param {WorldHoverOutlineOptions["getPickables"]} [options.getPickables] Optional late-bound pickable resolver used when the pickable list changes over time.
 * @param {WorldHoverOutlineOptions["mode"]} [options.mode="silhouette"] Outline rendering mode: silhouette, edges, or auto.
 * @param {WorldHoverOutlineOptions["color"]} [options.color=0x66ccff] Outline highlight color.
 * @param {WorldHoverOutlineOptions["opacity"]} [options.opacity=1] Outline opacity.
 * @param {WorldHoverOutlineOptions["scale"]} [options.scale=1.02] Scale multiplier applied to the outline mesh so it renders slightly outside the hovered object.
 * @param {WorldHoverOutlineOptions["edgeThresholdAngle"]} [options.edgeThresholdAngle=35] Threshold angle forwarded into EdgesGeometry when edges mode is active.
 * @param {WorldHoverOutlineOptions["far"]} [options.far=500] Raycaster far distance used for hover picking.
 * @param {WorldHoverOutlineOptions["allowRoundGeometry"]} [options.allowRoundGeometry=false] Whether sphere-like and other round geometries are eligible for outlining.
 * @param {WorldHoverOutlineOptions["canOutline"]} [options.canOutline] Optional predicate that can veto outlining for individual meshes.
 * @returns {{ updateFromClientPoint: (clientX: number, clientY: number) => void, clear: () => void, dispose: () => void }} Hover-outline controller with pointer update, clear, and disposal methods.
 * Side effects: allocates outline materials and geometries lazily, raycasts against the resolved pickable list, attaches and detaches outline objects to hovered meshes, suppresses outlining when the pointer is over HUD UI or XR is presenting, and disposes cached outline resources on teardown.
 */
export function createWorldHoverOutline({
  THREE,
  renderer,
  camera,
  scene,
  hudSystem,
  // Optional: late-bind (e.g., hudSystem is created after this helper).
  getHudSystem,
  pickables,
  // Optional: late-bind pickables (lets scenes update the list without recreating the outline).
  getPickables,
  // "silhouette" outlines the outer shape (good for spheres).
  // "edges" draws geometry edges (good for boxes, but noisy for spheres).
  // "auto" chooses silhouette for round geometries, edges otherwise.
  mode = "silhouette",
  color = DEFAULT_OUTLINE_COLOR,
  opacity = 1,
  scale = DEFAULT_OUTLINE_SCALE,
  edgeThresholdAngle = DEFAULT_EDGE_THRESHOLD_ANGLE,
  far = DEFAULT_RAYCAST_FAR,
  // By default, avoid outlining sphere-like meshes (too noisy).
  allowRoundGeometry = false,
  // Optional: predicate to skip certain meshes.
  canOutline,
} = {}) {
  if (!THREE) throw new Error("createWorldHoverOutline: THREE is required");
  if (!renderer) throw new Error("createWorldHoverOutline: renderer is required");
  if (!camera) throw new Error("createWorldHoverOutline: camera is required");
  if (!scene) throw new Error("createWorldHoverOutline: scene is required");

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const _pickScratch = [];

  let target = null;

  let currentMode = null;

  const edgesCache = new Map();

  let outlineEdges = null;
  let outlineSilhouette = null;
  let matEdges = null;
  let matSilhouette = null;
  let outline = null;

  function ensureEdgesOutline() {
    if (outlineEdges) return;
    matEdges = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    matEdges.depthWrite = false;
    // Respect occlusion: hidden edges should not render.
    matEdges.depthTest = true;
    // Reduce z-fighting against the base mesh.
    matEdges.polygonOffset = true;
    matEdges.polygonOffsetFactor = -1;
    matEdges.polygonOffsetUnits = -1;
    outlineEdges = new THREE.LineSegments(new THREE.BufferGeometry(), matEdges);
    outlineEdges.frustumCulled = false;
    outlineEdges.renderOrder = 999;
    outlineEdges.scale.setScalar(scale);
    outlineEdges.visible = false;
    outlineEdges.userData = {
      ...(outlineEdges.userData || {}),
      noHoverOutline: true,
      isWorldHoverOutline: true,
    };
  }

  function ensureSilhouetteOutline() {
    if (outlineSilhouette) return;
    matSilhouette = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.BackSide,
      depthWrite: false,
    });
    // Respect occlusion: don't show silhouette through other objects.
    matSilhouette.depthTest = true;
    // Reduce z-fighting against the base mesh.
    matSilhouette.polygonOffset = true;
    matSilhouette.polygonOffsetFactor = -1;
    matSilhouette.polygonOffsetUnits = -1;
    outlineSilhouette = new THREE.Mesh(new THREE.BufferGeometry(), matSilhouette);
    outlineSilhouette.frustumCulled = false;
    outlineSilhouette.renderOrder = 999;
    outlineSilhouette.scale.setScalar(scale);
    outlineSilhouette.visible = false;
    outlineSilhouette.userData = {
      ...(outlineSilhouette.userData || {}),
      noHoverOutline: true,
      isWorldHoverOutline: true,
    };
  }

  function isSphereLikeGeometry(geo) {
    if (!geo) return false;
    const t = geo.type || "";
    return (
      t === "SphereGeometry" ||
      t === "SphereBufferGeometry" ||
      t === "IcosahedronGeometry" ||
      t === "IcosahedronBufferGeometry"
    );
  }

  function getEdgesGeometry(mesh) {
    const geo = mesh?.geometry;
    const key = geo?.uuid;
    if (!key) return null;

    let edges = edgesCache.get(key);
    if (!edges) {
      edges = new THREE.EdgesGeometry(geo, edgeThresholdAngle);
      edgesCache.set(key, edges);
    }
    return edges;
  }

  function detach() {
    if (outline?.parent) outline.parent.remove(outline);
  }

  function chooseModeForMesh(mesh) {
    if (mode !== "auto") return mode;
    return isSphereLikeGeometry(mesh?.geometry) ? "silhouette" : "edges";
  }

  function resolveHoverOutlineTarget(mesh) {
    let node = mesh;
    while (node) {
      const target = node.userData?.hoverOutlineTarget;
      if (target?.isMesh && target.geometry) return target;
      node = node.parent;
    }
    return mesh;
  }

  function setTarget(mesh) {
    if (target === mesh) return;
    detach();

    target = mesh;
    if (!mesh) {
      if (outline) outline.visible = false;
      currentMode = null;
      return;
    }

    const chosen = chooseModeForMesh(mesh);
    currentMode = chosen;

    if (chosen === "edges") {
      ensureEdgesOutline();
      outline = outlineEdges;
      const edges = getEdgesGeometry(mesh);
      if (!edges) {
        outline.visible = false;
        return;
      }
      outline.geometry = edges;
    } else {
      ensureSilhouetteOutline();
      outline = outlineSilhouette;
      const geo = mesh?.geometry;
      if (!geo) {
        outline.visible = false;
        return;
      }
      outline.geometry = geo;
    }

    outline.visible = true;
    mesh.add(outline);
  }

  function clear() {
    setTarget(null);
  }

  function getResolvedHudSystem() {
    return typeof getHudSystem === "function" ? getHudSystem() : hudSystem;
  }

  function getResolvedPickables() {
    return typeof getPickables === "function" ? getPickables() : pickables;
  }

  function isClientOverHud(clientX, clientY) {
    const hs = getResolvedHudSystem();
    if (!hs?.isClientPointOverUi) return false;
    try {
      return !!hs.isClientPointOverUi(clientX, clientY);
    } catch {
      return false;
    }
  }

  function updateFromClientPoint(clientX, clientY) {
    if (renderer.xr.isPresenting) {
      clear();
      return;
    }

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      clear();
      return;
    }

    if (isClientOverHud(clientX, clientY)) {
      clear();
      return;
    }

    const pointerNdc = getClientPointNdc(clientX, clientY, renderer.domElement);
    if (!pointerNdc) {
      clear();
      return;
    }
    ndc.set(pointerNdc.x, pointerNdc.y);

    raycaster.setFromCamera(ndc, camera);
    raycaster.far = far;

    const src = getResolvedPickables();
    const list = Array.isArray(src) ? src : [];

    // Filter to valid Object3D entries without allocating.
    _pickScratch.length = 0;
    for (const o of list) {
      if (o && typeof o === "object" && (o.isObject3D || o.isMesh || o.isGroup || o.isScene)) {
        _pickScratch.push(o);
      }
    }

    const hits = raycaster.intersectObjects(_pickScratch, true);

    let hit = null;
    for (const h of hits) {
      const o = h?.object;
      if (!o || !o.isMesh) continue;
      if (o === outlineEdges || o === outlineSilhouette) continue;
      if (o?.userData?.isWorldHoverOutline) continue;

      const outlineMesh = resolveHoverOutlineTarget(o);
      if (!outlineMesh?.isMesh) continue;
      if (outlineMesh.userData?.noHoverOutline) continue;

      if (!allowRoundGeometry && isSphereLikeGeometry(outlineMesh.geometry)) continue;

      if (typeof canOutline === "function" && !canOutline(outlineMesh)) continue;

      hit = outlineMesh;
      break;
    }

    setTarget(hit);
  }

  function dispose() {
    clear();
    detach();
    try {
      matEdges?.dispose?.();
    } catch {
      // no-op
    }
    try {
      matSilhouette?.dispose?.();
    } catch {
      // no-op
    }

    if (mode === "edges" || mode === "auto") {
      for (const e of edgesCache.values()) {
        try {
          e.dispose();
        } catch {
          // no-op
        }
      }
      edgesCache.clear();
    }
  }

  // Create lazily; no scene attachment needed until a target is set.

  return {
    updateFromClientPoint,
    clear,
    dispose,
  };
}
