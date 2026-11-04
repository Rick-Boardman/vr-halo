// SPDX-License-Identifier: Apache-2.0
import { makeDraggableHUDOverlay } from "./hud-drag.js";
import { setCameraLocalHudPosition } from "./screen-space.js";

const DEFAULT_HUD_DISTANCE = 1.2;

/**
 * Create the shared HUD box class used by camera-anchored runtime overlays and demos.
 * Purpose: provide a simple draggable panel shell that stays camera-local and remembers its normalized screen-space placement.
 * @param {object} [options={}] HUD box class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, and MeshBasicMaterial.
 * @param {number} [options.hudDistance=1.2] Camera-local placement distance used when initializing or reapplying the HUD box position.
 * @returns {new (width?: number, height?: number) => any} Object3D-derived HUD box class whose instances render a background plane, support dragging, and expose setInitialHUDPosition(camera).
 * Side effects: does not perform work when called, but instances allocate Three.js geometry and materials, install draggable HUD behavior, mutate stored normalized HUD coordinates, and update camera-local placement when initialized.
 */
export function createHudBoxClass({
  THREE,
  hudDistance = DEFAULT_HUD_DISTANCE,
} = {}) {
  if (!THREE) {
    throw new Error("createHudBoxClass requires THREE");
  }

  return class HUDBox extends THREE.Object3D {
    constructor(width = 0.4, height = 0.2) {
      super();
      this.width = width;
      this.height = height;
      this.hudScreenX = 0;
      this.hudScreenY = 0;

      const background = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, this.height),
        new THREE.MeshBasicMaterial({
          color: 0x3366cc,
          opacity: 0.95,
          transparent: true,
          depthTest: false,
        })
      );
      background.position.set(0, 0, 0.01);
      this.add(background);

      makeDraggableHUDOverlay(this, {
        width: this.width,
        height: this.height,
        distance: hudDistance,
        getCamera: () => this._hudCamera || this.parent,
        getNDC: () => ({ x: this.hudScreenX, y: this.hudScreenY }),
        setNDC: ({ x, y }) => {
          this.hudScreenX = x;
          this.hudScreenY = y;
        },
      });
    }

    setInitialHUDPosition(camera) {
      this._hudCamera = camera;
      this.hudScreenX = 0;
      this.hudScreenY = 0;
      setCameraLocalHudPosition(
        this,
        camera,
        this.hudScreenX,
        this.hudScreenY,
        hudDistance
      );
    }
  };
}
