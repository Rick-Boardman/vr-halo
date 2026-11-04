// SPDX-License-Identifier: Apache-2.0
/**
 * Create the shared lightweight context-menu class used by runtime HUD panels.
 * Purpose: provide a small Object3D-based menu container with chainable item, visibility, width, and event helpers for higher-level HUD widgets.
 * @param {object} [options={}] Context-menu class configuration.
 * @param {any} [options.THREE] Three.js namespace used to resolve `Object3D` when no explicit base class is supplied.
 * @param {new (...args: any[]) => any} [options.Object3D] Optional Object3D-compatible base constructor used for the generated context-menu class.
 * @returns {new (items?: unknown[]) => any} Object3D-derived context-menu class whose instances manage menu items, width, visibility, position, and chainable event helpers.
 * Side effects: does not perform work when called, but instances mutate their own position, width, visibility, and item list while callers configure or show the menu.
 */
export function createContextMenuClass({ THREE, Object3D } = {}) {
  const BaseObject3D = Object3D || THREE?.Object3D;
  if (!BaseObject3D) {
    throw new Error("createContextMenuClass requires THREE or Object3D");
  }

  return class ContextMenu extends BaseObject3D {
    constructor(items = []) {
      super();
      this.name = "ContextMenu";
      this.items = Array.isArray(items) ? items : [];
      this.width = 0;
      this.visible = false;
      this.position.set(0, 0, 0.03);
    }

    setItems(items) {
      this.items = Array.isArray(items) ? items : [];
      return this;
    }

    show(x = this.position.x, y = this.position.y, items) {
      if (items !== undefined) {
        this.setItems(items);
      }
      this.position.set(x, y, this.position.z);
      this.visible = true;
      return this;
    }

    hide() {
      this.visible = false;
      return this;
    }

    on(event, handler) {
      this.addEventListener(event, handler);
      return this;
    }

    setWidth(width) {
      this.width = width;
      return this;
    }
  };
}
