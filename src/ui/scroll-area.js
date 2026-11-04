// SPDX-License-Identifier: Apache-2.0
import { HUD_TEXT_FONT_URL, HUD_TEXT_UNICODE_FONTS_URL } from "./hud-text-style.js";

/**
 * Create the shared scroll-area class used by runtime HUD panels.
 * Purpose: provide a simple Object3D-based content region that renders line-oriented text into a bounded panel area.
 * @param {object} [options={}] Scroll-area class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, and MeshBasicMaterial.
 * @param {new (...args: any[]) => any} options.Text Troika Text constructor used for the content mesh.
 * @param {new (...args: any[]) => any} [options.Object3D] Optional Object3D-compatible base constructor used for the generated scroll-area class.
 * @returns {new (width?: number, height?: number) => any} Object3D-derived scroll-area class whose instances render a background plane and expose setSize(...), setContent(...), appendContent(...), clearContent(), scrollToBottom(), and chainable event helpers.
 * Side effects: does not perform work when called, but instances allocate Three.js and Troika text resources, rebuild background geometry when resized, replace text meshes when content changes, and mutate stored content lines and size state.
 */
export function createScrollAreaClass({ THREE, Text, Object3D } = {}) {
  if (!THREE) {
    throw new Error("createScrollAreaClass requires THREE");
  }
  if (!Text) {
    throw new Error("createScrollAreaClass requires Text");
  }

  const BaseObject3D = Object3D || THREE.Object3D;

  return class ScrollArea extends BaseObject3D {
    constructor(width = 1.2, height = 0.5) {
      super();
      this.width = width;
      this.height = height;
      this.name = "ScrollArea";

      this.bgMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, this.height),
        new THREE.MeshBasicMaterial({
          color: 0xffff00,
          opacity: 0.3,
          transparent: true,
        })
      );
      this.bgMesh.position.set(0, 0, 0);
      this.add(this.bgMesh);

      this._lines = [];
      this._textMesh = null;
    }

    setSize(width, height) {
      this.width = width;
      this.height = height;

      if (this.bgMesh) {
        this.bgMesh.geometry.dispose();
        this.bgMesh.geometry = new THREE.PlaneGeometry(this.width, this.height);
        this.bgMesh.position.set(0, 0, 0);
      }

      if (this._textMesh) {
        this._textMesh.maxWidth = this.width - 0.04;
        this._textMesh.position.set(
          -this.width / 2 + 0.02,
          this.height / 2 - 0.02,
          0.01
        );
        this._textMesh.sync?.();
      }
    }

    setContent(linesArray) {
      if (this._textMesh) {
        this.remove(this._textMesh);
        this._textMesh = null;
      }

      this._lines = linesArray || [];

      const text = new Text();
      text.text = this._lines
        .map((line) =>
          typeof line === "string" ? line : line?.text ?? String(line ?? "")
        )
        .join("\n");
      text.fontSize = 0.045;
      text.color = 0xffffff;
      text.anchorX = "left";
      text.anchorY = "top";
      text.maxWidth = this.width - 0.04;
      text.position.set(-this.width / 2 + 0.02, this.height / 2 - 0.02, 0.01);
      if (HUD_TEXT_FONT_URL) text.font = HUD_TEXT_FONT_URL;
      if (HUD_TEXT_UNICODE_FONTS_URL) text.unicodeFontsURL = HUD_TEXT_UNICODE_FONTS_URL;
      this.add(text);
      this._textMesh = text;
      text.sync?.();
    }

    appendContent(linesArray) {
      this.setContent(this._lines.concat(linesArray));
    }

    clearContent() {
      this.setContent([]);
    }

    scrollToBottom() {}

    on(event, handler) {
      this.addEventListener(event, handler);
      return this;
    }
  };
}
