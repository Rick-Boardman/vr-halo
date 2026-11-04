// SPDX-License-Identifier: Apache-2.0
/**
 * HudWindowBase — the value object used by every HUD window slot.
 *
 * Window-preset factories live in `hud-window-presets.js`.
 *
 * @module hud-window-model
 */

import {
  HUD_SURFACE_PANEL_BG_COLOR,
  HUD_SURFACE_PANEL_BG_OPACITY,
  HUD_SURFACE_TITLE_BAR_COLOR,
  HUD_SURFACE_TITLE_BAR_OPACITY,
  HUD_SURFACE_CONTENT_BG_COLOR,
  HUD_SURFACE_CONTENT_BG_OPACITY,
  HUD_SURFACE_ACCENT_COLOR,
} from "./hud-surface-style.js";
import {
  HUD_OVERLAY_PADDING_PX,
  HUD_WINDOW_HIDDEN_Y_PX,
  HUD_WINDOW_VR_RIGHT_X_PX,
} from "./hud-layout-policy.js";
import { clamp } from "./scalar-math.js";

/**
 * Value class representing a single HUD window slot.
 *
 * Instances carry position, dimensions, style overrides, and scroll
 * state.  When attached to a HUD (`attachHud`), mutation methods
 * automatically mark the display dirty.
 */
export class HudWindowBase {
  constructor(
    {
      key,
      title = "",
      x = 0,
      y = 0,
      w = 320,
      h = 200,
      minW = 240,
      minH = 140,
      minimizable = true,
      closeable = false,
      resizable = true,
      draggable = true,
      dragAnywhere = false,
      scrollable = false,
      scrollTop = 0,
      scrollMode = "top",
      maxLines = null,
      onClose = null,
      listStyle = null,
      panelBgColor = HUD_SURFACE_PANEL_BG_COLOR,
      panelBgOpacity = HUD_SURFACE_PANEL_BG_OPACITY,
      titleBarColor = HUD_SURFACE_TITLE_BAR_COLOR,
      titleBarOpacity = HUD_SURFACE_TITLE_BAR_OPACITY,
      contentBgColor = HUD_SURFACE_CONTENT_BG_COLOR,
      contentBgOpacity = HUD_SURFACE_CONTENT_BG_OPACITY,
      titleTextColor = HUD_SURFACE_ACCENT_COLOR,
      borderColor = null,
      borderOpacity = null,
      borderInset = null,
    } = {}
  ) {
    this.key = key;
    this.title = title;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.minW = minW;
    this.minH = minH;
    this.collapsed = false;
    this.dragging = false;
    this.resizing = false;
    this.dragOffX = 0;
    this.dragOffY = 0;
    this.minimizable = !!minimizable;
    this.closeable = !!closeable;
    this.resizable = !!resizable;
    this.draggable = !!draggable;
    this.dragAnywhere = !!dragAnywhere;
    this.scrollable = !!scrollable;
    this.scrollTop = scrollTop;
    this.scrollMode = scrollMode;
    this.maxLines = maxLines;
    this.onClose = typeof onClose === "function" ? onClose : null;
    this.listStyle = listStyle == null ? null : String(listStyle);
    this.panelBgColor = panelBgColor;
    this.panelBgOpacity = panelBgOpacity;
    this.titleBarColor = titleBarColor;
    this.titleBarOpacity = titleBarOpacity;
    this.contentBgColor = contentBgColor;
    this.contentBgOpacity = contentBgOpacity;
    this.titleTextColor = titleTextColor;
    this.borderColor = borderColor;
    this.borderOpacity = borderOpacity;
    this.borderInset = borderInset;
    this._hud = null;
  }

  attachHud(hud) {
    this._hud = hud;
  }

  setTitle(title) {
    this.title = String(title ?? "");
    if (this._hud) this._hud._dirty = true;
  }

  setCollapsed(collapsed) {
    const next = !!collapsed;
    const prev = !!this.collapsed;
    this.collapsed = next;

    // When expanding from collapsed, keep the window visible on desktop.
    // This fixes bottom-anchored collapsed windows (e.g. system log) expanding
    // off-screen when clamping is disabled.
    // In VR we intentionally allow off-rect layout coords; do not clamp.
    if (prev && !next && this._hud && !this._hud?.xr?.presenting) {
      const W = Number(this._hud.layoutW ?? 0);
      const H = Number(this._hud.layoutH ?? 0);
      if (Number.isFinite(W) && W > 0 && Number.isFinite(H) && H > 0) {
        const pad = HUD_OVERLAY_PADDING_PX;
        const maxX = Math.max(pad, W - this.w - pad);
        const maxY = Math.max(pad, H - this.h - pad);
        this.x = clamp(Number(this.x), pad, maxX);
        this.y = clamp(Number(this.y), pad, maxY);
      }
    }
    if (this._hud) this._hud._dirty = true;
    if (this._hud?._onLayoutChange) this._hud._onLayoutChange();
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed);
  }

  setHidden(hidden, { hiddenX = HUD_WINDOW_VR_RIGHT_X_PX, hiddenY = HUD_WINDOW_HIDDEN_Y_PX } = {}) {
    const next = !!hidden;
    const isHidden = Number(this.y) < -1000;
    if (next === isHidden) return;

    if (next) {
      this._hiddenX = Number(this.x);
      this._hiddenY = Number(this.y);
      this._hiddenCollapsed = !!this.collapsed;
      this.x = Number(hiddenX);
      this.y = Number(hiddenY);
    } else {
      this.collapsed = !!this._hiddenCollapsed;
      if (Number.isFinite(this._hiddenX)) this.x = Number(this._hiddenX);
      if (Number.isFinite(this._hiddenY)) this.y = Number(this._hiddenY);
    }

    if (this._hud) this._hud._dirty = true;
    if (this._hud?._onLayoutChange) this._hud._onLayoutChange();
  }

  close(details = {}) {
    if (!this.closeable) return false;
    if (typeof this.onClose === "function") {
      this.onClose({ window: this, hud: this._hud, ...details });
      return true;
    }
    this.setHidden(true);
    return true;
  }

  setContentBackground(color, opacity) {
    if (color != null) this.contentBgColor = Number(color) >>> 0;
    if (opacity != null) this.contentBgOpacity = Number(opacity);
    if (this._hud) this._hud._dirty = true;
  }

  setPanelBackground(color, opacity) {
    if (color != null) this.panelBgColor = Number(color) >>> 0;
    if (opacity != null) this.panelBgOpacity = Number(opacity);
    if (this._hud) this._hud._dirty = true;
  }

  setTitleBarBackground(color, opacity) {
    if (color != null) this.titleBarColor = Number(color) >>> 0;
    if (opacity != null) this.titleBarOpacity = Number(opacity);
    if (this._hud) this._hud._dirty = true;
  }

  linesKey() {
    return `${String(this.key ?? "")}Lines`;
  }

  setLines(entries, { scrollMode } = {}) {
    if (!this._hud?.ui?.data) return;
    this._hud.ui.data[this.linesKey()] = Array.isArray(entries)
      ? entries
      : [entries];
    if (scrollMode) this.scrollMode = scrollMode;
    this._hud._dirty = true;
  }

  addLine(text, color, { scrollMode = "end" } = {}) {
    if (!this._hud?.ui?.data) return;
    const k = this.linesKey();
    const cur = Array.isArray(this._hud.ui.data[k]) ? this._hud.ui.data[k] : [];
    const entry =
      typeof text === "object" && text
        ? text
        : { text: String(text ?? ""), color: color ?? HUD_TEXT_DEFAULT_COLOR };
    let next = cur.concat([entry]);
    const max = Number.isFinite(this.maxLines) ? this.maxLines : null;
    if (max && max > 0 && next.length > max) next = next.slice(-max);
    this._hud.ui.data[k] = next;
    this.scrollMode = scrollMode;
    this._hud._dirty = true;
  }
}
