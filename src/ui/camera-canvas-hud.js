// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Define the canonical default canvas width for camera-anchored HUD textures.
 * Parameters: none.
 * Return value: Default canvas width in pixels.
 * Side effects: none.
 * @type {number}
 */
export const DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX = 1024;

/**
 * Purpose: Define the canonical default canvas height for camera-anchored HUD textures.
 * Parameters: none.
 * Return value: Default canvas height in pixels.
 * Side effects: none.
 * @type {number}
 */
export const DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX = 512;

/**
 * Create a camera-attached canvas HUD plane with an optional background panel.
 * Purpose: provide a reusable camera-local canvas surface for status panels, message banners, and other lightweight HUD widgets.
 * @param {object} [options={}] Camera HUD configuration.
 * @param {any} options.THREE Three.js namespace used to allocate groups, meshes, textures, and materials.
 * @param {{ add: (object: unknown) => void }} options.camera Camera that receives the HUD root as a child.
 * @param {number} [options.planeWidth=1] Foreground text plane width in world units.
 * @param {number} [options.planeHeight=1] Foreground text plane height in world units.
 * @param {number} [options.canvasWidth=DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX] Canvas width in pixels.
 * @param {number} [options.canvasHeight=DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX] Canvas height in pixels.
 * @param {{ x?: number, y?: number, z?: number }} [options.position={ x: 0, y: 0, z: -2 }] Camera-local HUD root position.
 * @param {{ width?: number, height?: number, color?: number, transparent?: boolean, opacity?: number, depthTest?: boolean, z?: number, contentZ?: number } | null} [options.background=null] Optional background-plane configuration.
 * @returns {{ root: unknown, mesh: unknown, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, texture: unknown, markDirty: () => void, setVisible: (visible: boolean) => void, setPosition: (x: number, y: number, z: number) => void }} Camera-attached canvas HUD controller with visibility, positioning, and texture refresh helpers.
 * Side effects: allocates Three.js groups, meshes, materials, textures, and a DOM canvas; attaches the HUD root to the supplied camera; and mutates the HUD root position and visibility through the returned helpers.
 */
export function createCameraCanvasHud({
  THREE,
  camera,
  planeWidth = 1,
  planeHeight = 1,
  canvasWidth = DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX,
  canvasHeight = DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX,
  position = { x: 0, y: 0, z: -2 },
  background = null,
} = {}) {
  if (!THREE) throw new Error("createCameraCanvasHud requires THREE");
  if (!camera) throw new Error("createCameraCanvasHud requires a camera");

  const root = new THREE.Group();

  if (background) {
    const backgroundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(background.width ?? planeWidth, background.height ?? planeHeight),
      new THREE.MeshBasicMaterial({
        color: background.color ?? 0x000000,
        transparent: background.transparent ?? true,
        opacity: background.opacity ?? 0.75,
        depthTest: background.depthTest ?? false,
      })
    );
    backgroundMesh.position.z = background.z ?? 0;
    root.add(backgroundMesh);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("createCameraCanvasHud could not create a 2D canvas context");

  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
  );
  mesh.position.z = background?.contentZ ?? 0;
  root.add(mesh);

  camera.add(root);
  root.position.set(position.x ?? 0, position.y ?? 0, position.z ?? -2);

  function markDirty() {
    texture.needsUpdate = true;
  }

  function setVisible(visible) {
    root.visible = !!visible;
  }

  function setPosition(x, y, z) {
    root.position.set(x, y, z);
  }

  return {
    root,
    mesh,
    canvas,
    context,
    texture,
    markDirty,
    setVisible,
    setPosition,
  };
}

/**
 * Measure the full camera-plane size at a given camera-local depth.
 * Purpose: convert perspective camera FOV and aspect into world-space plane dimensions used by camera-anchored HUD layout helpers.
 * @param {{ fov: number, aspect: number }} camera Perspective camera whose vertical field of view and aspect define the camera plane.
 * @param {number} depth Positive or negative camera-local depth whose absolute value is used as the plane distance.
 * @returns {{ width: number, height: number }} Camera-plane width and height in world units at the requested depth.
 * Side effects: none; pure camera-plane sizing helper.
 */
export function getCameraPlaneSize(camera, depth) {
  const distance = Math.abs(Number(depth) || 0);
  // Perspective plane height: h = 2 * tan(fov / 2) * distance. The repo uses a
  // camera-local -Z forward convention, so only the magnitude of depth matters here.
  const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
  return {
    width: height * camera.aspect,
    height,
  };
}

/**
 * Position a camera-local HUD object in one corner of the camera plane.
 * Purpose: place shared camera HUD widgets in a stable corner-relative layout using world-unit panel dimensions and margins.
 * @param {object} [options={}] Corner-positioning inputs.
 * @param {{ position: { set: (x: number, y: number, z: number) => void } }} options.object3d Camera-local object to position.
 * @param {{ fov: number, aspect: number }} options.camera Perspective camera used to derive camera-plane dimensions.
 * @param {number} options.depth Camera-local depth used for placement; its absolute value determines the camera-plane size.
 * @param {number} options.panelWidth Panel width in world units.
 * @param {number} options.panelHeight Panel height in world units.
 * @param {number} [options.marginX=0.05] Horizontal margin in world units.
 * @param {number} [options.marginY=0.05] Vertical margin in world units.
 * @param {string} [options.corner="top-right"] Requested corner identifier containing `left` or `bottom` when those edges should be used.
 * @returns {void} Does not return a value.
 * Side effects: mutates the supplied object's local position.
 */
export function positionHudInCameraCorner({
  object3d,
  camera,
  depth,
  panelWidth,
  panelHeight,
  marginX = 0.05,
  marginY = 0.05,
  corner = "top-right",
} = {}) {
  if (!object3d) throw new Error("positionHudInCameraCorner requires an object3d");
  if (!camera) throw new Error("positionHudInCameraCorner requires a camera");

  const size = getCameraPlaneSize(camera, depth);
  const useLeft = corner.includes("left");
  const useBottom = corner.includes("bottom");
  const distance = Math.abs(Number(depth) || 0);

  // Corner placement starts from the camera-plane half extents and then shifts by
  // half the panel size plus the requested margin so the panel stays fully onscreen.
  const x = useLeft
    ? -size.width / 2 + panelWidth / 2 + marginX
    : size.width / 2 - panelWidth / 2 - marginX;
  const y = useBottom
    ? -size.height / 2 + panelHeight / 2 + marginY
    : size.height / 2 - panelHeight / 2 - marginY;

  object3d.position.set(x, y, -distance);
}

/**
 * Trace a rounded rectangle path into a 2D canvas context.
 * Purpose: share the rounded banner and panel outline path used by camera-anchored HUD canvases.
 * @param {CanvasRenderingContext2D} context 2D canvas context that receives the path commands.
 * @param {number} x Left coordinate in canvas pixels.
 * @param {number} y Top coordinate in canvas pixels.
 * @param {number} width Rectangle width in canvas pixels.
 * @param {number} height Rectangle height in canvas pixels.
 * @param {number} radius Corner radius in canvas pixels.
 * @returns {void} Does not return a value.
 * Side effects: mutates the active path state of the supplied 2D canvas context.
 */
export function drawRoundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
