// SPDX-License-Identifier: Apache-2.0
/**
 * Create the shared interactive Three.js base class used by runtime HUD and panel widgets.
 * Purpose: provide a common Object3D-derived UI foundation with event aliases and optional pointer-driven dragging for shared runtime components.
 * @param {object} [options={}] UI component base-class configuration.
 * @param {new (...args: any[]) => any} options.Object3D Three.js Object3D constructor that the generated UI class should extend.
 * @returns {typeof import("three").Object3D} Object3D-derived UI component class with `interactive`, `addPointerEvent(...)`, `on(...)`, `enableDragging(...)`, and `disableDragging()` behavior.
 * Side effects: does not perform work when called, but instances created from the returned class register pointer listeners, may attach window-level pointermove and pointerup handlers during dragging, and mutate target object positions while drag interactions are active.
 */
export function createUIComponentClass({ Object3D } = {}) {
  if (!Object3D) {
    throw new Error("createUIComponentClass requires Object3D");
  }

  return class UIComponent extends Object3D {
    static debug = false;

    constructor() {
      super();
      this.interactive = true;
      this.name = "UIComponent";
      this.renderOrder = 100;
    }

    addPointerEvent(type, handler) {
      this.addEventListener(type, handler);
    }

    on(type, handler) {
      this.addEventListener(type, handler);
      return this;
    }

    enableDragging({
      axis = "xy",
      getTarget = null,
      scale = 0.003,
    } = {}) {
      this._dragAxis = axis;
      this._dragGetTarget = getTarget;
      this._dragScale = scale;
      this._dragIsActive = false;
      this._dragStart = null;
      this._dragTargetStart = null;

      this.addPointerEvent(
        "pointerdown",
        (this._onDragPointerDown = (event) => {
          let prevented = false;
          let stopped = false;
          const syntheticEvent = {
            ...event,
            preventDefault: () => {
              prevented = true;
              event.preventDefault?.();
            },
            stopPropagation: () => {
              stopped = true;
              event.stopPropagation?.();
            },
            get defaultPrevented() {
              return prevented;
            },
            get propagationStopped() {
              return stopped;
            },
          };

          syntheticEvent.preventDefault();
          this._dragIsActive = true;
          this._dragStart = { x: event.clientX, y: event.clientY };

          const target = getTarget ? getTarget() : this;
          this._dragTargetStart = target.position.clone();

          window.addEventListener(
            "pointermove",
            (this._onDragPointerMove = (moveEvent) => {
              moveEvent.preventDefault?.();
              if (!this._dragIsActive || !this._dragTargetStart) return;

              const dx =
                (moveEvent.clientX - this._dragStart.x) * this._dragScale;
              const dy =
                (moveEvent.clientY - this._dragStart.y) * this._dragScale;
              const nextX =
                this._dragTargetStart.x +
                (axis.includes("x") ? dx : 0);
              const nextY =
                this._dragTargetStart.y +
                (axis.includes("y") ? -dy : 0);
              const nextZ = this._dragTargetStart.z;

              if (target) {
                target.position.set(nextX, nextY, nextZ);
                if (typeof target._updateLayout === "function") {
                  target._updateLayout();
                }
                this.dispatchEvent({
                  type: "drag",
                  x: nextX,
                  y: nextY,
                  z: nextZ,
                });
              }
            })
          );

          window.addEventListener(
            "pointerup",
            (this._onDragPointerUp = (upEvent) => {
              upEvent.preventDefault?.();
              this._dragIsActive = false;
              this._dragTargetStart = null;
              window.removeEventListener(
                "pointermove",
                this._onDragPointerMove
              );
              window.removeEventListener("pointerup", this._onDragPointerUp);
            })
          );
        })
      );
    }

    disableDragging() {
      this.removeEventListener("pointerdown", this._onDragPointerDown);
    }
  };
}
