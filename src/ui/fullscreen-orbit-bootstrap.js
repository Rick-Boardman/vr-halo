// SPDX-License-Identifier: Apache-2.0
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createFullscreenOverlay } from './fullscreen-overlay.js';
import { createPerspectiveOrbitViewport } from './orbit-viewport.js';

const DEFAULT_CLEAR_COLOR = 0x223333;
const DEFAULT_FOV = 60;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 500;
const DEFAULT_LOOK_AT = Object.freeze({ x: 0, y: 0, z: 0 });
const AXES_SIZE = 20;
const AMBIENT_LIGHT_COLOR = 0x888888;
const DIRECTIONAL_LIGHT_COLOR = 0xffffff;
const DIRECTIONAL_LIGHT_INTENSITY = 1;
const DIRECTIONAL_LIGHT_POSITION = Object.freeze({ x: 50, y: 100, z: 50 });

function resolveOrbitTarget({ lookAt, orbitTarget }) {
    return lookAt || orbitTarget || DEFAULT_LOOK_AT;
}

function addOrbitLighting({ scene, directionalLightPosition }) {
    scene.add(new THREE.AmbientLight(AMBIENT_LIGHT_COLOR));

    const light = new THREE.DirectionalLight(
        DIRECTIONAL_LIGHT_COLOR,
        DIRECTIONAL_LIGHT_INTENSITY
    );
    const lightPosition = directionalLightPosition || DIRECTIONAL_LIGHT_POSITION;
    light.position.set(lightPosition.x, lightPosition.y, lightPosition.z);
    scene.add(light);
}

function addOrbitAxes({ scene, axesSize }) {
    const resolvedAxesSize = axesSize === undefined ? AXES_SIZE : axesSize;

    if (!resolvedAxesSize) {
        return null;
    }

    const axes = new THREE.AxesHelper(resolvedAxesSize);
    scene.add(axes);
    return axes;
}

/**
 * Create the shared fullscreen orbit-demo bootstrap used by rc-car and track visualization launchers.
 * Purpose: compose the standard fullscreen overlay, orbit viewport, demo lighting, and optional axes into one reusable runtime entrypoint for browser demos.
 * @param {object} [options={}] Fullscreen orbit demo configuration.
 * @param {string} [options.containerId] DOM id assigned to the fullscreen overlay container.
 * @param {string} [options.closeButtonId] DOM id assigned to the overlay close button.
 * @param {string} [options.title] Title shown by the default overlay chrome.
 * @param {string} [options.canvasId] DOM id assigned to the overlay canvas host.
 * @param {{ x: number, y: number, z: number }} options.cameraPosition Initial camera position in world units.
 * @param {number} [options.cameraNear] Optional near clipping plane forwarded to createPerspectiveOrbitViewport(...).
 * @param {number} [options.cameraFar] Optional far clipping plane forwarded to createPerspectiveOrbitViewport(...).
 * @param {{ x?: number, y?: number, z?: number }} [options.lookAt] World-space point the camera and orbit controls should face.
 * @param {{ x?: number, y?: number, z?: number }} [options.orbitTarget] Legacy alias for `lookAt` retained for callers that still pass orbit-target coordinates.
 * @param {{ x?: number, y?: number, z?: number }} [options.directionalLightPosition] World-space position for the demo directional light.
 * @param {number} [options.axesSize] Axes helper size in world units; falsy values suppress axes creation.
 * @param {string} [options.extraHtml] Extra HTML appended to the overlay when the default chrome is used.
 * @returns {{ axes: unknown, backgroundDisplayValue: string, backgroundElement: HTMLElement | null, backgroundElementId: string, camera: unknown, closeButton: HTMLElement | null, controls: unknown, demoDiv: HTMLElement, overlayElement: HTMLElement, renderer: unknown, scene: unknown }} Fullscreen orbit demo context consumed by shared render-loop helpers and app-local scene setup.
 * Side effects: creates fullscreen overlay DOM, appends a renderer canvas, allocates Three.js scene resources, adds ambient and directional lights, and may add an axes helper to the scene.
 */
function createFullscreenOrbitBootstrap({
    containerId,
    closeButtonId,
    title,
    canvasId,
    cameraPosition,
    cameraNear,
    cameraFar,
    lookAt,
    orbitTarget,
    directionalLightPosition,
    axesSize,
    extraHtml
}) {
    const overlay = createFullscreenOverlay({
        backgroundElementId: 'gameContainer',
        containerId,
        closeButtonId,
        title,
        canvasId,
        extraHtml
    });
    const sceneLookAt = resolveOrbitTarget({ lookAt, orbitTarget });
    const orbitViewport = createPerspectiveOrbitViewport({
        THREE: { ...THREE, OrbitControls },
        canvasHost: overlay.canvasHost,
        cameraPosition,
        cameraLookAt: sceneLookAt,
        cameraFov: DEFAULT_FOV,
        cameraNear: cameraNear ?? DEFAULT_NEAR,
        cameraFar: cameraFar ?? DEFAULT_FAR,
        clearColor: DEFAULT_CLEAR_COLOR
    });
    const camera = orbitViewport.camera;
    const renderer = orbitViewport.renderer;
    const controls = orbitViewport.controls;
    const orbitScene = orbitViewport.scene;

    addOrbitLighting({
        scene: orbitScene,
        directionalLightPosition
    });

    const axes = addOrbitAxes({ scene: orbitScene, axesSize });

    return {
        axes,
        backgroundDisplayValue: overlay.backgroundDisplayValue,
        backgroundElement: overlay.backgroundElement,
        backgroundElementId: overlay.backgroundElementId,
        camera,
        closeButton: overlay.closeButton,
        controls,
        demoDiv: overlay.overlayElement,
        overlayElement: overlay.overlayElement,
        renderer,
        scene: orbitScene
    };
}

export {
    createFullscreenOrbitBootstrap
};
