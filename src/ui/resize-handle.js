// SPDX-License-Identifier: Apache-2.0
/**
 * Create the shared HUD resize-handle class used by resizable runtime panels.
 * Purpose: provide a reusable pointer-driven corner handle that emits normalized resize events for higher-level HUD containers.
 * @param {object} [options={}] Resize-handle class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Mesh, PlaneGeometry, MeshBasicMaterial, and Object3D event support.
 * @returns {new (size?: number, options?: { opacity?: number, borderColor?: number, borderOpacity?: number, dragScale?: number }) => any} Mesh-derived resize-handle class whose instances track drag state and dispatch `resize` events with next width and height values.
 * Side effects: does not perform work when called, but instances allocate Three.js geometry and materials, mutate their own drag state and position, stop pointer-event propagation during drags, and emit `resize` events while the handle is dragged.
 */
export function createResizeHandleClass({ THREE } = {}) {
  if (!THREE) {
    throw new Error("createResizeHandleClass requires THREE");
  }

  return class ResizeHandle extends THREE.Mesh {
    constructor(size = 0.08, options = {}) {
      const safeSize =
        typeof size === "number" && isFinite(size) && size > 0 ? size : 0.08;
      const {
        opacity = 0.5,
        borderColor = 0xff0000,
        borderOpacity = 0.5,
        dragScale = 0.002,
      } = options;

      const hitSize = safeSize * 1.5;
      const geometry = new THREE.PlaneGeometry(hitSize, hitSize);
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity,
        transparent: true,
      });
      super(geometry, material);

      this.size = safeSize;
      this.name = "ResizeHandle";
      this.interactive = true;
      this.position.set(0.5, -0.35, 0.02);
      this._resizeState = null;

      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(safeSize * 1.7, safeSize * 1.7),
        new THREE.MeshBasicMaterial({
          color: borderColor,
          opacity: borderOpacity,
          transparent: true,
          depthTest: false,
        })
      );
      border.position.set(0, 0, 0.01);
      this.add(border);

      this.addEventListener("pointerdown", (event) => {
        const panel = this.parent;
        if (!panel) {
          return;
        }

        this._resizeState = {
          panel,
          pointerX: event.clientX,
          pointerY: event.clientY,
          width: panel.width,
          height: panel.height,
        };
        event.stopPropagation?.();
      });

      this.addEventListener("pointermove", (event) => {
        if (!this._resizeState) {
          return;
        }

        const { panel, pointerX, pointerY, width, height } = this._resizeState;
        const dx = (event.clientX - pointerX) * dragScale;
        const dy = (event.clientY - pointerY) * dragScale;
        const minWidth = panel.options?.minWidth || 0.75;
        const minHeight = panel.options?.minHeight || 0.36;

        this.dispatchEvent({
          type: "resize",
          width: Math.max(width + dx, minWidth),
          height: Math.max(height + dy, minHeight),
          originalEvent: event,
        });
        event.stopPropagation?.();
      });

      this.addEventListener("pointerup", (event) => {
        this._resizeState = null;
        event.stopPropagation?.();
      });
    }

    on(event, handler) {
      this.addEventListener(event, handler);
      return this;
    }
  };
}
