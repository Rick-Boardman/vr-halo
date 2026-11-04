// SPDX-License-Identifier: Apache-2.0
import { createUIComponentClass } from "./ui-component.js";

/**
 * Create the shared HUD close-button class used by panel-style runtime UI components.
 * Purpose: provide a reusable clickable X-button widget that emits a `close` event through the shared UI component stack.
 * @param {object} [options={}] Close-button class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, MeshBasicMaterial, LineBasicMaterial, BufferGeometry, Line, and Vector3.
 * @param {ReturnType<typeof createUIComponentClass>} [options.UIComponent] Optional prebuilt UI base class; defaults to a class created from `THREE.Object3D`.
 * @returns {new (size?: number, options?: { opacity?: number, marginFactor?: number, lineWidth?: number, lineColor?: number }) => any} UI component subclass that renders an interactive close button and dispatches a `close` event on pointer down.
 * Side effects: does not perform work when called, but instances allocate Three.js meshes and line geometry, attach pointer listeners, may log warnings for invalid constructor input, and may emit debug console output when `BaseUIComponent.debug` is enabled.
 */
export function createCloseButtonClass({ THREE, UIComponent } = {}) {
  if (!THREE) {
    throw new Error("createCloseButtonClass requires THREE");
  }

  const BaseUIComponent =
    UIComponent || createUIComponentClass({ Object3D: THREE.Object3D });

  return class CloseButton extends BaseUIComponent {
    constructor(size = 0.08, options = {}) {
      super();

      const {
        opacity = 0.05,
        marginFactor = 0.15,
        lineWidth = 2,
        lineColor = 0x111111,
      } = options;

      if (typeof size !== "number" || !isFinite(size) || size <= 0) {
        console.warn(
          "[CloseButton] Invalid size passed:",
          size,
          "- using default 0.08"
        );
        size = 0.08;
      }

      const hitSize = size * 1.5;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(hitSize, hitSize),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity,
        })
      );
      plane.name = "CloseButtonPlane";
      plane.renderOrder = 100;
      plane.material.depthTest = false;
      plane.material.depthWrite = false;
      this.add(plane);

      this.size = size;
      this.name = "CloseButton";

      const lineMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        linewidth: lineWidth,
      });
      lineMaterial.depthTest = false;

      const margin = size * marginFactor;
      const min = -size / 2 + margin;
      const max = size / 2 - margin;

      if (!isFinite(min) || !isFinite(max)) {
        console.warn(
          "[CloseButton] Computed min/max are not finite:",
          min,
          max,
          "- skipping X lines"
        );
      } else {
        const createLine = (points) => {
          const geometry = new THREE.BufferGeometry().setFromPoints(
            points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
          );
          const line = new THREE.Line(geometry, lineMaterial);
          line.renderOrder = 1000;
          this.add(line);
        };

        createLine([
          [min, min, 0],
          [max, max, 0],
        ]);
        createLine([
          [min, max, 0],
          [max, min, 0],
        ]);
      }

      this.addPointerEvent("pointerdown", (event) => {
        if (BaseUIComponent.debug) {
          console.log("[CloseButton] pointerdown event fired");
        }
        this.dispatchEvent({ type: "close", originalEvent: event });
      });

      if (BaseUIComponent.debug) {
        setTimeout(() => {
          if (this.parent) this.updateMatrixWorld();
          const worldPosition = this.getWorldPosition(new THREE.Vector3());
          console.log(
            "[CloseButton] created at world position",
            worldPosition,
            "size",
            hitSize
          );
        }, 100);
      }
    }
  };
}
