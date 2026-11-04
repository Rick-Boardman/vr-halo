// SPDX-License-Identifier: Apache-2.0
import { HUD_TEXT_FONT_URL, HUD_TEXT_UNICODE_FONTS_URL } from "./hud-text-style.js";
import { clamp } from "../scalar-math.js";

/**
 * Create the shared tabs-bar class used by runtime HUD panels.
 * Purpose: provide a lightweight Object3D-based tab header that displays the active tab label and lets parent panels update tab state and width.
 * @param {object} [options={}] Tabs-bar class configuration.
 * @param {any} options.THREE Three.js namespace that must expose Object3D, Mesh, PlaneGeometry, and MeshBasicMaterial.
 * @param {new (...args: any[]) => any} options.Text Troika Text constructor used for the tab label mesh.
 * @param {new (...args: any[]) => any} [options.Object3D] Optional Object3D-compatible base constructor used for the generated tabs-bar class.
 * @returns {new (tabs?: unknown[], width?: number) => any} Object3D-derived tabs-bar class whose instances render a background strip, track tab definitions, and expose setTabs(...), setActiveTab(...), and setWidth(...).
 * Side effects: does not perform work when called, but instances allocate Three.js and Troika text resources, mutate active-tab and width state, rebuild background geometry when resized, and resync the rendered tab label when tabs change.
 */
export function createTabsBarClass({ THREE, Text, Object3D } = {}) {
  if (!THREE) {
    throw new Error("createTabsBarClass requires THREE");
  }
  if (!Text) {
    throw new Error("createTabsBarClass requires Text");
  }

  const BaseObject3D = Object3D || THREE.Object3D;

  const getTabLabel = (tab) => {
    if (typeof tab === "string") {
      return tab;
    }
    if (tab && typeof tab === "object") {
      return tab.label || tab.name || tab.title || "Tab";
    }
    return "Tab";
  };

  return class TabsBar extends BaseObject3D {
    constructor(tabs = ["Tab"], width = 1.2) {
      super();
      this.name = "TabsBar";
      this.width = width;
      this.tabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : ["Tab"];
      this._activeTabIndex = 0;

      this.bg = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, 0.09),
        new THREE.MeshBasicMaterial({
          color: 0x0000ff,
          opacity: 0.95,
          transparent: true,
        })
      );
      this.bg.position.set(0, 0, 0.005);
      this.add(this.bg);

      this.tabLabel = new Text();
      this.tabLabel.fontSize = 0.05;
      this.tabLabel.color = 0xffffff;
      this.tabLabel.anchorX = "left";
      this.tabLabel.anchorY = "middle";
      this.tabLabel.position.set(0.03, 0, 0.01);
      if (HUD_TEXT_FONT_URL) this.tabLabel.font = HUD_TEXT_FONT_URL;
      if (HUD_TEXT_UNICODE_FONTS_URL) this.tabLabel.unicodeFontsURL = HUD_TEXT_UNICODE_FONTS_URL;
      this.add(this.tabLabel);

      this._syncLabel();
    }

    _getSafeIndex(index) {
      if (!Array.isArray(this.tabs) || this.tabs.length === 0) {
        return 0;
      }
      if (typeof index !== "number" || !isFinite(index)) {
        return 0;
      }
      return clamp(Math.trunc(index), 0, this.tabs.length - 1);
    }

    _syncLabel() {
      if (!this.tabLabel) {
        return;
      }

      const safeIndex = this._getSafeIndex(this._activeTabIndex);
      this.tabLabel.text = getTabLabel(this.tabs[safeIndex]);
      this.tabLabel.sync?.();
    }

    setTabs(tabArray) {
      this.tabs = Array.isArray(tabArray) && tabArray.length > 0 ? tabArray : ["Tab"];
      this._activeTabIndex = this._getSafeIndex(this._activeTabIndex);
      this._syncLabel();
    }

    setActiveTab(index) {
      this._activeTabIndex = this._getSafeIndex(index);
      this._syncLabel();
    }

    on(event, handler) {
      this.addEventListener(event, handler);
      return this;
    }

    setWidth(width) {
      this.width = width;
      if (this.bg) {
        this.bg.geometry.dispose();
        this.bg.geometry = new THREE.PlaneGeometry(this.width, 0.09);
        this.bg.position.x = 0;
      }
      if (this.tabLabel) {
        this.tabLabel.position.set(0.03, 0, 0.01);
      }
    }
  };
}
