// SPDX-License-Identifier: Apache-2.0
import { makeDraggableHUDOverlay } from "./hud-drag.js";
import {
  calculateHudHalfExtentsInNdc,
  getCameraPlaneHalfExtents,
  setCameraLocalHudPosition,
} from "./screen-space.js";
import {
  HUD_TEXT_HEADER_FONT_URL,
  HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER,
  HUD_TEXT_HEADER_FONT_WEIGHT,
  HUD_TEXT_HEADER_UNICODE_FONTS_URL,
} from "./hud-text-style.js";
import { createUIComponentClass } from "./ui-component.js";

const DEFAULT_HUD_DISTANCE = 1.2;

/**
 * Create the shared draggable title-bar class used by runtime HUD panels.
 * Purpose: provide a reusable camera-anchored title strip with close-button forwarding, drag behavior, and width-aware relayout for shared HUD panels.
 * @param {object} [options={}] Title-bar class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, MeshBasicMaterial, and related scene primitives.
 * @param {new (...args: any[]) => any} options.Text Troika Text constructor used for the rendered title label.
 * @param {ReturnType<typeof createUIComponentClass>} [options.UIComponent] Optional prebuilt UI base class; defaults to a class created from `THREE.Object3D`.
 * @param {number} [options.hudDistance=1.2] Camera-local placement distance used when initializing the title bar in screen space.
 * @returns {new (title?: string, width?: number) => any} UI component subclass whose instances render a title strip, support dragging, expose a closeButton property, and provide setInitialHUDPosition(camera) plus setWidth(width).
 * Side effects: does not perform work when called, but instances allocate Three.js and Troika text resources, install draggable HUD behavior, proxy close events from an attached close button, mutate stored normalized HUD coordinates, and reposition child elements when width changes.
 */
export function createTitleBarClass({
  THREE,
  Text,
  UIComponent,
  hudDistance = DEFAULT_HUD_DISTANCE,
} = {}) {
  if (!THREE) {
    throw new Error("createTitleBarClass requires THREE");
  }
  if (!Text) {
    throw new Error("createTitleBarClass requires Text");
  }

  const BaseUIComponent =
    UIComponent || createUIComponentClass({ Object3D: THREE.Object3D });

  return class TitleBar extends BaseUIComponent {
    constructor(title, width = 1.2) {
      super();
      this.name = "TitleBar";
      this.width = width;
      this.title = title || "Panel";
      this.hudScreenX = 0;
      this.hudScreenY = 1;
      this._closeButton = null;

      const background = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, 0.12),
        new THREE.MeshBasicMaterial({
          color: 0x444857,
          opacity: 0.95,
          transparent: false,
          depthTest: false,
        })
      );
      background.position.set(0, 0, 0.005);
      background.renderOrder = 1;
      this.add(background);

      const titleText = new Text();
      titleText.text = this.title;
      titleText.fontSize = 0.06 * HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER;
      titleText.color = 0xffffff;
      titleText.anchorX = "left";
      titleText.anchorY = "middle";
      titleText.position.set(-this.width / 2 + 0.06, 0, 0.02);
      titleText.material.depthTest = false;
      titleText.renderOrder = 10;
      if (HUD_TEXT_HEADER_FONT_URL) titleText.font = HUD_TEXT_HEADER_FONT_URL;
      if (HUD_TEXT_HEADER_FONT_WEIGHT) titleText.fontWeight = HUD_TEXT_HEADER_FONT_WEIGHT;
      if (HUD_TEXT_HEADER_UNICODE_FONTS_URL) titleText.unicodeFontsURL = HUD_TEXT_HEADER_UNICODE_FONTS_URL;
      this.add(titleText);

      Object.defineProperty(this, "closeButton", {
        get: () => this._closeButton,
        set: (button) => {
          if (button) {
            this._closeButton = button;
            const halfWidth = this.width / 2;
            button.position.set(halfWidth - 0.06, 0, 0.05);
            button.renderOrder = 999;
            this.add(button);
            button.addEventListener?.("close", (event) => {
              if (BaseUIComponent.debug) {
                console.log(
                  "[TitleBar] close event received from CloseButton"
                );
              }
              this.dispatchEvent({ type: "close", originalEvent: event });
            });
          }
        },
        configurable: true,
      });

      makeDraggableHUDOverlay(this, {
        width: this.width,
        height: 0.12,
        distance: hudDistance,
        getCamera: () => this._hudCamera || this.parent,
        getPositionTarget: () => this._dragPositionTarget || this,
        getWidth: () => this._dragBoundsWidth ?? this.width,
        getHeight: () => this._dragBoundsHeight ?? 0.12,
        getNDC: () => ({ x: this.hudScreenX, y: this.hudScreenY }),
        setNDC: ({ x, y }) => {
          this.hudScreenX = x;
          this.hudScreenY = y;
        },
        onDrag: (position) => {
          this.dispatchEvent({
            type: "drag",
            x: position.x,
            y: position.y,
            z: position.z,
          });
        },
      });

      if (this.closeButton && this.closeButton.addEventListener) {
        this.closeButton.addEventListener("close", (event) => {
          if (BaseUIComponent.debug) {
            console.log("[TitleBar] close event received from CloseButton");
          }
          this.dispatchEvent({ type: "close", originalEvent: event });
        });
      }
    }

    setInitialHUDPosition(camera) {
      this._hudCamera = camera;
      const halfExtents = calculateHudHalfExtentsInNdc(
        camera,
        this.width,
        0.12,
        hudDistance,
        this.scale.x,
        this.scale.y
      );
      const { halfHeight } = getCameraPlaneHalfExtents(camera, hudDistance);
      // NDC top edge is +1, so subtract the title bar's half-height and a small camera-plane margin to keep the bar fully inside view.
      const marginNdcY = 0.03 / halfHeight;

      this.hudScreenY = 1 - halfExtents.y - marginNdcY;
      this.hudScreenX = 0;
      setCameraLocalHudPosition(
        this,
        camera,
        this.hudScreenX,
        this.hudScreenY,
        hudDistance
      );
    }

    setWidth(width) {
      this.width = width;
      const background = this.children.find((child) => child.isMesh);
      const titleText = this.children.find((child) => child.isTroikaText);
      if (background) {
        background.geometry.dispose();
        background.geometry = new THREE.PlaneGeometry(this.width, 0.12);
        background.position.x = 0;
      }
      if (titleText) {
        titleText.position.set(-this.width / 2 + 0.06, 0, 0.02);
        titleText.material.depthTest = false;
        titleText.renderOrder = 10;
      }
      if (this.closeButton) {
        const halfWidth = this.width / 2;
        this.closeButton.position.set(halfWidth - 0.06, 0, 0.05);
      }
      if (this.tabsBar && this.tabsBar.setWidth) {
        this.tabsBar.setWidth(this.width);
        const halfWidth = this.width / 2;
        this.tabsBar.position.set(-halfWidth, 0, 0.01);
      }
    }
  };
}
