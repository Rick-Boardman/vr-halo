// SPDX-License-Identifier: Apache-2.0
import {
  calculateHudHalfExtentsInNdc,
  setCameraLocalHudPosition,
} from "./screen-space.js";
import { createCloseButtonClass } from "./close-button.js";
import { createContextMenuClass } from "./context-menu.js";
import { createResizeHandleClass } from "./resize-handle.js";
import { createScrollAreaClass } from "./scroll-area.js";
import { createTabsBarClass } from "./tabs-bar.js";
import { createTitleBarClass } from "./title-bar.js";
import { clamp } from "../scalar-math.js";

const TITLE_BAR_HEIGHT = 0.12;
const TABS_BAR_HEIGHT = 0.09;
const DEFAULT_HUD_DISTANCE = 1.35;

function clampSize(options, width, height) {
  const minWidth = options.minWidth || 0.75;
  const minHeight = options.minHeight || 0.36;
  const maxWidth = options.maxWidth || 3.0;
  const maxHeight = options.maxHeight || 2.0;

  return {
    width: clamp(width, minWidth, maxWidth),
    height: clamp(height, minHeight, maxHeight),
  };
}

/**
 * Create the shared HUD panel class used by runtime demos and WebXR panel surfaces.
 * Purpose: compose the canonical title bar, tabs bar, scroll area, close button, resize handle, and context menu into one reusable draggable HUD panel container.
 * @param {object} [options={}] HUD panel class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, MeshBasicMaterial, and related scene primitives.
 * @param {new (...args: any[]) => any} options.Text Troika Text constructor used by child panel widgets.
 * @param {new (...args: any[]) => any} [options.Object3D] Optional Object3D-compatible base constructor used for the generated HUD panel class.
 * @returns {new (options?: { width?: number, height?: number, name?: string, title?: string, tabs?: unknown[], activeTab?: number, content?: unknown[], minWidth?: number, minHeight?: number, maxWidth?: number, maxHeight?: number }) => any} Object3D-derived HUD panel class whose instances expose content, tabs, resize, drag, and camera-local placement APIs.
 * Side effects: does not perform work when called, but instances allocate Three.js, Troika text, and child widget resources, install drag and resize event wiring, mutate child layout when resized, and dispatch close, resize, and drag events while the panel is used.
 */
export function createHudPanelClass({ THREE, Text, Object3D } = {}) {
  if (!THREE) {
    throw new Error("createHudPanelClass requires THREE");
  }
  if (!Text) {
    throw new Error("createHudPanelClass requires Text");
  }

  const BaseObject3D = Object3D || THREE.Object3D;
  const CloseButton = createCloseButtonClass({ THREE });
  const ContextMenu = createContextMenuClass({ THREE, Object3D: BaseObject3D });
  const ResizeHandle = createResizeHandleClass({ THREE });
  const ScrollArea = createScrollAreaClass({ THREE, Text, Object3D: BaseObject3D });
  const TabsBar = createTabsBarClass({ THREE, Text, Object3D: BaseObject3D });
  const TitleBar = createTitleBarClass({ THREE, Text });

  return class HUDPanel extends BaseObject3D {
    constructor(options = {}) {
      super();
      this.options = options;
      this.width = this.options.width || 1.2;
      this.height = this.options.height || 0.85;
      this.name = this.options.name || "HUDPanel";
      this.position.set(0, 1.5, -2);

      this.titleBar = new TitleBar(this.options.title || "Panel", this.width);
      this.titleBar._dragPositionTarget = this;
      this.titleBar._dragBoundsWidth = this.width;
      this.titleBar._dragBoundsHeight = this.height;
      this.add(this.titleBar);

      this.tabsBar = new TabsBar(this.options.tabs || [], this.width);
      this.add(this.tabsBar);
      this.titleBar.tabsBar = this.tabsBar;

      this.closeButton = new CloseButton();
      this.titleBar.closeButton = this.closeButton;
      this.titleBar.addEventListener("close", (event) => {
        this.dispatchEvent({ type: "close", ...event });
      });

      this.scrollArea = new ScrollArea(
        this.width,
        this.height - TITLE_BAR_HEIGHT - TABS_BAR_HEIGHT
      );
      this.add(this.scrollArea);

      this.resizeHandle = new ResizeHandle();
      this.add(this.resizeHandle);
      this.resizeHandle.scale.set(1.5, 1.5, 1.5);
      this.resizeHandle.renderOrder = 10;
      this.resizeHandle.material.depthTest = false;
      this.resizeHandle.material.depthWrite = false;
      this.resizeHandle.interactive = true;
      this.resizeHandle.addEventListener("resize", ({ width, height }) => {
        const nextSize = clampSize(this.options, width, height);
        this.width = nextSize.width;
        this.height = nextSize.height;
        this._updateLayout();
        this.dispatchEvent({
          type: "resize",
          width: this.width,
          height: this.height,
        });
      });

      this.contextMenu = new ContextMenu();
      this.add(this.contextMenu);

      this.titleBar.addEventListener("drag", ({ x, y, z }) => {
        this.position.set(x, y, z);
        this._updateLayout();
        this.dispatchEvent({ type: "drag", x, y, z });
      });

      this.bg = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, this.height),
        new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          opacity: 0.5,
          transparent: true,
        })
      );
      this.bg.position.set(0, 0, -0.01);
      this.add(this.bg);

      this._tabContents = {};
      this._activeTab = this.options.activeTab || 0;
      if (this.options.content) {
        this.setContent(this.options.content, this._activeTab);
      }
      if (this.options.tabs) {
        this.setTabs(this.options.tabs);
      }

      this.isHUDPanel = true;
      this._updateLayout();
    }

    setContent(linesArray, tabIndex) {
      const safeLines = Array.isArray(linesArray) ? linesArray : [];
      const index = typeof tabIndex === "number" ? tabIndex : this._activeTab;
      this._tabContents[index] = safeLines;
      if (index === this._activeTab && this.scrollArea) {
        this.scrollArea.setContent(safeLines);
      }
    }

    appendContent(linesArray, tabIndex) {
      const index = typeof tabIndex === "number" ? tabIndex : this._activeTab;
      const nextLines = Array.isArray(linesArray) ? linesArray : [];
      if (!this._tabContents[index]) {
        this._tabContents[index] = [];
      }
      this._tabContents[index] = this._tabContents[index].concat(nextLines);
      if (index === this._activeTab && this.scrollArea) {
        this.scrollArea.setContent(this._tabContents[index]);
      }
    }

    clearContent(tabIndex) {
      const index = typeof tabIndex === "number" ? tabIndex : this._activeTab;
      this._tabContents[index] = [];
      if (index === this._activeTab && this.scrollArea) {
        this.scrollArea.setContent([]);
      }
    }

    setTabs(tabArray) {
      this.options.tabs = Array.isArray(tabArray) ? tabArray : [];
      this.tabsBar?.setTabs(this.options.tabs);
      this.tabsBar?.setActiveTab?.(this._activeTab);
      return this;
    }

    resize(width, height) {
      const nextSize = clampSize(this.options, width, height);
      this.width = nextSize.width;
      this.height = nextSize.height;
      this._updateLayout();
      this.dispatchEvent({
        type: "resize",
        width: this.width,
        height: this.height,
      });
      return this;
    }

    setPosition({ x, y, z }) {
      this.position.set(x, y, z);
      return this;
    }

    getPosition() {
      return { x: this.position.x, y: this.position.y, z: this.position.z };
    }

    getSize() {
      return { width: this.width, height: this.height };
    }

    getLayout() {
      return {};
    }

    bringToFront() {}
    sendToBack() {}
    focus() {}
    blur() {}

    on(event, handler) {
      this.addEventListener(event, handler);
      return this;
    }

    setInitialHUDPosition(
      camera,
      screenX = 0,
      screenY = 0.12,
      distance = DEFAULT_HUD_DISTANCE
    ) {
      this._hudCamera = camera;
      this.titleBar._hudCamera = camera;
      this.titleBar._dragPositionTarget = this;
      this.titleBar._dragBoundsWidth = this.width;
      this.titleBar._dragBoundsHeight = this.height;

      const halfExtents = calculateHudHalfExtentsInNdc(
        camera,
        this.width,
        this.height,
        distance,
        this.scale.x,
        this.scale.y
      );

      // Clamp the requested NDC anchor so the panel's half extents stay inside the camera plane instead of letting edges drift off-screen.
      const clampedX = Math.max(
        -1 + halfExtents.x,
        Math.min(1 - halfExtents.x, screenX)
      );
      const clampedY = Math.max(
        -1 + halfExtents.y,
        Math.min(1 - halfExtents.y, screenY)
      );

      setCameraLocalHudPosition(this, camera, clampedX, clampedY, distance);
      return this;
    }

    _updateLayout() {
      const headerHeight = TITLE_BAR_HEIGHT + TABS_BAR_HEIGHT;
      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;

      // Stack title bar, tabs bar, and scroll area downward from the panel's top edge so each child stays centered within its vertical band.
      if (this.titleBar) {
        this.titleBar.setWidth?.(this.width);
        this.titleBar._dragBoundsWidth = this.width;
        this.titleBar._dragBoundsHeight = this.height;
        this.titleBar.position.set(0, halfHeight - TITLE_BAR_HEIGHT / 2, 0.02);
      }

      if (this.tabsBar) {
        this.tabsBar.setWidth?.(this.width);
        this.tabsBar.position.set(
          0,
          halfHeight - TITLE_BAR_HEIGHT - TABS_BAR_HEIGHT / 2,
          0.02
        );
      }

      if (this.scrollArea) {
        const scrollAreaHeight = this.height - headerHeight;
        this.scrollArea.setSize?.(this.width, scrollAreaHeight);
        this.scrollArea.position.set(
          0,
          halfHeight - headerHeight - scrollAreaHeight / 2,
          0.01
        );
      }

      if (this.closeButton && this.titleBar) {
        this.closeButton.position.set(halfWidth - 0.06, 0, 0.02);
      }

      this.contextMenu?.setWidth?.(this.width);
      this._updateResizeHandlePosition();

      if (this.bg) {
        this.bg.geometry.dispose();
        this.bg.geometry = new THREE.PlaneGeometry(this.width, this.height);
        this.bg.position.set(0, 0, -0.01);
      }
    }

    _updateResizeHandlePosition() {
      const margin = 0.04;
      // Bottom-right anchor = panel half extents minus a small inset margin so the handle stays inside the panel corner.
      const x = this.width / 2 - margin;
      const y = -this.height / 2 + margin;
      this.resizeHandle?.position.set(x, y, 0.05);
    }
  };
}
