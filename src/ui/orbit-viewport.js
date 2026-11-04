// SPDX-License-Identifier: Apache-2.0
const DEFAULT_CAMERA_LOOK_AT = Object.freeze({ x: 0, y: 0, z: 0 });
const DEFAULT_CAMERA_FOV = 60;
const DEFAULT_CAMERA_NEAR = 0.1;
const DEFAULT_CAMERA_FAR = 1000;
const DEFAULT_RENDERER_OPTIONS = Object.freeze({ antialias: true });

function resolvePosition(value, fallback) {
  if (value && typeof value.x === "number" && typeof value.y === "number" && typeof value.z === "number") {
    return value;
  }

  return fallback;
}

/**
 * Create a shared Three.js scene, camera, renderer, and orbit-controls viewport inside a supplied canvas host.
 * Purpose: centralize the common fullscreen demo bootstrap for orbit-driven scenes so app launchers reuse one viewport factory instead of duplicating camera and renderer setup.
 * @param {object} [options={}] Orbit viewport configuration.
 * @param {any} options.THREE Three.js namespace that must expose Scene, PerspectiveCamera, WebGLRenderer, and OrbitControls.
 * @param {HTMLElement} options.canvasHost DOM element that receives the renderer canvas.
 * @param {{ x: number, y: number, z: number }} options.cameraPosition Initial camera position in world units.
 * @param {{ x?: number, y?: number, z?: number }} [options.cameraLookAt={ x: 0, y: 0, z: 0 }] World-space target the camera and orbit controls should face.
 * @param {number} [options.cameraFov=60] Perspective camera vertical field of view in degrees.
 * @param {number} [options.cameraNear=0.1] Near clipping plane distance.
 * @param {number} [options.cameraFar=1000] Far clipping plane distance.
 * @param {unknown} [options.clearColor=null] Optional renderer clear color forwarded to `renderer.setClearColor(...)`.
 * @param {Record<string, unknown>} [options.rendererOptions={ antialias: true }] Options bag forwarded to the WebGLRenderer constructor.
 * @returns {{ camera: unknown, controls: unknown, renderer: unknown, scene: unknown }} Orbit viewport parts used by fullscreen demo bootstrap helpers.
 * Side effects: creates Three.js scene resources, appends a renderer canvas to the DOM, mutates the camera and controls to look at the requested target, and allocates a WebGL renderer.
 */
export function createPerspectiveOrbitViewport({
  THREE,
  canvasHost,
  cameraPosition,
  cameraLookAt = DEFAULT_CAMERA_LOOK_AT,
  cameraFov = DEFAULT_CAMERA_FOV,
  cameraNear = DEFAULT_CAMERA_NEAR,
  cameraFar = DEFAULT_CAMERA_FAR,
  clearColor = null,
  rendererOptions = DEFAULT_RENDERER_OPTIONS,
} = {}) {
  if (!THREE) {
    throw new Error("createPerspectiveOrbitViewport: THREE is required");
  }

  if (!canvasHost) {
    throw new Error("createPerspectiveOrbitViewport: canvasHost is required");
  }

  if (!cameraPosition) {
    throw new Error("createPerspectiveOrbitViewport: cameraPosition is required");
  }

  if (typeof THREE.OrbitControls !== "function") {
    throw new Error("createPerspectiveOrbitViewport: THREE.OrbitControls is required");
  }

  const resolvedCameraPosition = resolvePosition(cameraPosition, null);
  const resolvedCameraLookAt = resolvePosition(cameraLookAt, DEFAULT_CAMERA_LOOK_AT);
  if (!resolvedCameraPosition) {
    throw new Error("createPerspectiveOrbitViewport: cameraPosition must include numeric x, y, z");
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    cameraFov,
    window.innerWidth / window.innerHeight,
    cameraNear,
    cameraFar
  );
  camera.position.set(
    resolvedCameraPosition.x,
    resolvedCameraPosition.y,
    resolvedCameraPosition.z
  );
  camera.lookAt(
    resolvedCameraLookAt.x,
    resolvedCameraLookAt.y,
    resolvedCameraLookAt.z
  );

  const renderer = new THREE.WebGLRenderer({ ...rendererOptions });
  if (clearColor !== null && clearColor !== undefined) {
    renderer.setClearColor(clearColor);
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasHost.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(
    resolvedCameraLookAt.x,
    resolvedCameraLookAt.y,
    resolvedCameraLookAt.z
  );
  controls.update();

  return {
    camera,
    controls,
    renderer,
    scene,
  };
}
