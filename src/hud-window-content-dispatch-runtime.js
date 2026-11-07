// SPDX-License-Identifier: Apache-2.0
/**
 * Window-content dispatch for the HUD.
 *
 * Contains per-window-type rendering branches (chat, skills, inventory,
 * debug, xr, status, help, progress, target, buffs, hotbar, and the
 * default fallback). Extracted from renderWindow to keep hud.js focused
 * on orchestration.
 *
 * @module hud-window-content-dispatch-runtime
 */

import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_INFO_COLOR,
  HUD_TEXT_SUCCESS_COLOR,
  HUD_TEXT_SUPREME_ACCENT_COLOR,
  HUD_TEXT_BRIGHT_COLOR,
} from "./hud-text-style.js";
import {
  HUD_PRIMARY_HIGHLIGHT_COLOR,
} from "./hud-highlight-style.js";
import { HUD_SURFACE_ACCENT_COLOR } from "./hud-surface-style.js";
import { getHudStoneSkinChrome } from "./hud-window-skin-runtime.js";
import {
  HUD_STATUS_HEALTH_TINT_COLOR,
  HUD_STATUS_STAMINA_TINT_COLOR,
} from "./hud-status-style.js";
import {
  HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX,
  HUD_RENDER_ORDER_COLOR_LAYER_OFFSET,
  HUD_RENDER_ORDER_ICON_OFFSET,
  HUD_RENDER_ORDER_SPEED_BG_OFFSET,
  HUD_RENDER_ORDER_TEXT_OFFSET,
  HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET,
  HUD_RENDER_ORDER_TITLE_OFFSET,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_WINDOW_CONTENT_TOP_MARGIN_PX,
  HUD_Z_SURFACE_FG,
  HUD_Z_SURFACE_BG,
  HUD_Z_SURFACE_RECESSED,
  getHudGlyphDotSizePx,
} from "./hud-layout-policy.js";
import {
  HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX,
  HUD_SYSTEM_HOTBAR_DEBUG_SLOT_INDEX,
} from "./hud-hotbar-policy.js";
import { estimateTextWidthPx, HUD_TEXT_ESTIMATE_GAP_PX } from "./text-measurement.js";
import { clamp } from "./scalar-math.js";
import {
  applyTreeToEntries,
  applyTreeToStringLines,
  normalizeLineEntry,
} from "./ui-text-layout.js";

const HOTBAR_HEADER_TEXT_OFFSET_X_PX = 44;
const HOTBAR_HEADER_COMPACT_TEXT_OFFSET_X_PX = 26;
const HOTBAR_TITLE_MIN_DOT_PX = 2;
const HOTBAR_TITLE_REGULAR_DOT_PX = 3;
const HOTBAR_STATUS_MIN_DOT_PX = 2;
const HOTBAR_STATUS_REGULAR_DOT_PX = 3;
const HOTBAR_COMPACT_BADGE_HEIGHT_PX = 26;
const HOTBAR_REGULAR_BADGE_HEIGHT_PX = 32;
const HOTBAR_COMPACT_BADGE_MIN_WIDTH_PX = 84;
const HOTBAR_REGULAR_BADGE_MIN_WIDTH_PX = 116;
const HOTBAR_SEPARATOR_LINE_WIDTH_PX = 2;
const HOTBAR_SEPARATOR_LINE_MIN_HEIGHT_PX = 22;
const HOTBAR_SEPARATOR_LINE_MARGIN_PX = 7;

/**
 * Create the window-content dispatch runtime.
 *
 * @param {object} deps Factory dependencies.
 * @param {object} deps.hud HUD state object (ui, objects, xr, layoutW, layoutH).
 * @param {object} deps.renderer WebGL renderer (xr.isPresenting).
 * @param {Function} deps.setPlainTextMaybeTroika Sets plain text on a Troika pixel text.
 * @param {Function} deps.clearPlainTextMaybeTroika Clears plain text on a Troika pixel text.
 * @param {Function} deps.clearColoredMultilineMaybeTroika Clears colored multiline text layers.
 * @param {Function} deps.positionRect Positions a rect mesh at layout coordinates.
 * @param {Function} deps.getHelpEntries Returns resolved help entries for a lines array.
 * @param {Function} deps.getHotbarSlotLayout Returns hotbar slot layout for a window state.
 * @param {Function} deps.getStatusMode Returns the current status mode ("bars" or "text").
 * @returns {{ renderWindowContent: Function }}
 */
export function createHudWindowContentDispatchRuntime({
  hud,
  renderer,
  setPlainTextMaybeTroika,
  clearPlainTextMaybeTroika,
  clearColoredMultilineMaybeTroika,
  positionRect,
  getHelpEntries,
  getHotbarSlotLayout,
  getStatusMode,
}) {

  /**
   * Render the content for a specific window type.
   *
   * @param {object} ctx Per-window rendering context.
   * @param {string} ctx.key Window key (e.g. "chat", "status", "hotbar").
   * @param {object} ctx.win Window state object.
   * @param {object} ctx.objs Window object map.
   * @param {number} ctx.labelDot Text scale factor (px per dot).
   * @param {number} ctx.titleGlyphY Title glyph Y position.
   * @param {number} ctx.h Effective window height (collapsed or full).
   * @param {number} ctx.lift Z-lift for window render ordering.
   * @param {number} ctx.cx Content area X origin in layout px.
   * @param {number} ctx.cy Content area Y origin in layout px.
   * @param {number} ctx.cw Content area width in layout px.
   * @param {number} ctx.pad Overlay padding in px.
   * @param {Function} ctx.renderList Local renderList wrapper(entries, scrollPolicy, post).
   * @param {Function} ctx.renderOrderBaseFor Returns render order base for a window key.
   * @param {Function} ctx.setMeshRenderOrder Sets render order on a mesh.
   * @returns {boolean} True if the dispatch handled the key, false for no-match fallback.
   */
  function renderWindowContent(ctx) {
    const {
      key, win, objs, labelDot, titleGlyphY, h, lift,
      cx, cy, cw, pad,
      renderList, renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;

    if (key === "chat") {
      renderList(
        hud.ui.data?.chatLines ?? hud.ui.defaults.chatLines,
        "topElseEnd"
      );
      return true;
    }

    if (key === "skills") {
      if (!win._treeExpanded) win._treeExpanded = {};
      const tree = applyTreeToEntries({
        entries: hud.ui.data?.skillsLines ?? hud.ui.defaults.skillsLines,
        state: win._treeExpanded,
        defaultColor: HUD_TEXT_DEFAULT_COLOR,
      });
      win._treeExpanded = tree.state;
      renderList(tree.entries, "endElseTop");
      return true;
    }

    if (key === "event") {
      renderList(
        hud.ui.data?.eventLines ?? hud.ui.defaults.eventLines,
        "topElseEnd"
      );
      return true;
    }

    if (key === "inventory") {
      if (!win._treeExpanded) win._treeExpanded = {};
      const tree = applyTreeToStringLines({
        lines: hud.ui.data?.inventoryLines ?? hud.ui.defaults.inventoryLines,
        state: win._treeExpanded,
      });
      win._treeExpanded = tree.state;

      const coloredEntries = tree.lines.map((e) => {
        const normalized = normalizeLineEntry(e.text, HUD_TEXT_DEFAULT_COLOR);
        const up = normalized.text.toUpperCase();
        if (up.includes("SUPREME ")) normalized.color = HUD_TEXT_SUPREME_ACCENT_COLOR;
        if (up.includes("RARE ")) normalized.color = HUD_PRIMARY_HIGHLIGHT_COLOR;
        return {
          text: normalized.text,
          color: normalized.color,
          toggleKey: e.toggleKey,
        };
      });

      renderList(coloredEntries, "endElseTop", () => {
        if (objs.contentTextRare) objs.contentTextRare.mesh.visible = false;
        if (objs.contentTextSupreme)
          objs.contentTextSupreme.mesh.visible = false;
      });
      return true;
    }

    if (key === "debug") {
      if (!win._treeExpanded) win._treeExpanded = {};
      const tree = applyTreeToEntries({
        entries: hud.ui.data?.debugLines ?? [],
        state: win._treeExpanded,
        defaultColor: HUD_TEXT_DEFAULT_COLOR,
      });
      win._treeExpanded = tree.state;
      renderList(tree.entries, "topElseEnd");
      return true;
    }

    if (key === "xr") {
      if (objs.scrollTrack) objs.scrollTrack.visible = false;
      if (objs.scrollThumb) objs.scrollThumb.visible = false;

      const supported = !!hud.xr.supported;
      const presenting = !!renderer.xr.isPresenting;
      const label = supported ? (presenting ? "EXIT VR" : "ENTER VR") : "";
      // Title bar shows "VR" (set via preset); render the action label in the
      // content area so that title-bar clicks start a drag instead of toggling.
      const contentY = win.y + HUD_WINDOW_TITLE_HEIGHT_PX + Math.max(0, Math.floor(((win.h - HUD_WINDOW_TITLE_HEIGHT_PX) - 7 * labelDot) / 2));
      objs.contentText.setText({
        text: label,
        x: win.x + pad,
        y: contentY,
        dot: labelDot,
        maxWidth: Math.max(0, win.w - pad * 2),
      });
      return true;
    }

    if (key === "status") {
      return _renderStatus(ctx);
    }

    if (key === "help") {
      const entries = getHelpEntries(hud.ui.data?.helpLines ?? []);
      renderList(entries, "topElseEnd");
      return true;
    }

    if (key === "progress") {
      return _renderProgress(ctx);
    }

    if (key === "target") {
      return _renderTarget(ctx);
    }

    if (key === "buffs") {
      return _renderBuffs(ctx);
    }

    if (key === "hotbar") {
      return _renderHotbar(ctx);
    }

    // Default window renderer: draw the window's line entries.
    if (objs.contentText) {
      const storeKey = typeof win.linesKey === "function" ? win.linesKey() : `${key}Lines`;
      const entries = hud.ui.data?.[storeKey] ?? [];
      renderList(entries, "topElseEnd");
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Status window (bars mode + text mode)
  // ------------------------------------------------------------------
  function _renderStatus(ctx) {
    const {
      key, win, objs, labelDot, h, lift, cx, cy, pad,
      renderList, renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

    if (objs.scrollTrack) objs.scrollTrack.visible = false;
    if (objs.scrollThumb) objs.scrollThumb.visible = false;

    if (getStatusMode() === "text") {
      // Hide bar-specific UI elements.
      hud.objects.statusNameText.mesh.visible = false;
      hud.objects.statusMetaText.mesh.visible = false;
      hud.objects.statusSpeedText.mesh.visible = false;
      if (hud.objects.statusSpeedBg) hud.objects.statusSpeedBg.visible = false;

      if (hud.objects.statusBars) {
        hud.objects.statusBars.healthBg.visible = false;
        hud.objects.statusBars.healthFg.visible = false;
        hud.objects.statusBars.staminaBg.visible = false;
        hud.objects.statusBars.staminaFg.visible = false;
      }

      const storeKey = typeof win.linesKey === "function" ? win.linesKey() : "statusLines";
      const extra = hud.ui.data?.[storeKey] ?? [];
      const fps = Number(hud.ui.metrics?.fps ?? 0);
      const speed = String(hud.ui.metrics?.speed ?? "");
      const vr = hud.xr.presenting
        ? "ON"
        : hud.xr.supported
          ? "OFF"
          : "N/A";

      // FPS stays on the status panel. Speed and XR stay behind
      // `hud.ui.data.hideStatusDebug = false`.
      const hideDebug = hud.ui?.data?.hideStatusDebug !== false;
      const base = [{ text: `FPS: ${fps}`, color: HUD_TEXT_DEFAULT_COLOR }];
      if (!hideDebug) {
        base.push(
          { text: `Speed: ${speed}`, color: HUD_TEXT_DEFAULT_COLOR },
          { text: `XR: ${vr}`, color: HUD_TEXT_INFO_COLOR },
        );
      }

      const entries = base.concat(Array.isArray(extra) ? extra : [extra]);
      renderList(entries, "topElseEnd");
      return true;
    }

    // Bars-mode
    return _renderStatusBars(ctx);
  }

  function _renderStatusBars(ctx) {
    const {
      key, win, objs, labelDot, h, lift, cx, cy, pad,
      renderList, renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

    clearColoredMultilineMaybeTroika(objs, labelDot);

    const name = String(hud.ui.defaults.playerName ?? "");

    hud.objects.statusNameText.mesh.visible = true;
    hud.objects.statusMetaText.mesh.visible = true;
    hud.objects.statusSpeedText.mesh.visible = true;

    const statusRoBase = Number.isFinite(objs?._renderOrderBase)
      ? Math.floor(objs._renderOrderBase)
      : renderOrderBaseFor(key);

    try {
      setMeshRenderOrder(hud.objects.statusBars.healthBg, statusRoBase + HUD_RENDER_ORDER_TITLE_OFFSET);
      setMeshRenderOrder(hud.objects.statusBars.healthFg, statusRoBase + HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET);
      setMeshRenderOrder(hud.objects.statusBars.staminaBg, statusRoBase + HUD_RENDER_ORDER_TITLE_OFFSET);
      setMeshRenderOrder(hud.objects.statusBars.staminaFg, statusRoBase + HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET);
      setMeshRenderOrder(hud.objects.statusSpeedBg, statusRoBase + HUD_RENDER_ORDER_SPEED_BG_OFFSET);
      if (hud.objects.statusNameText?.mesh)
        hud.objects.statusNameText.mesh.renderOrder = statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      if (hud.objects.statusMetaText?.mesh)
        hud.objects.statusMetaText.mesh.renderOrder = statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      if (hud.objects.statusSpeedText?.mesh)
        hud.objects.statusSpeedText.mesh.renderOrder = statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET;
    } catch {
      // no-op
    }

    const barW = Math.max(96, Math.floor(win.w * 0.33));
    const barX = win.x + win.w - pad - barW;
    const textMaxW = Math.max(0, barX - cx - 10);

    const nameY = win.y + 6;

    setPlainTextMaybeTroika({
      pixel: hud.objects.statusNameText,
      text: name,
      x: cx,
      y: nameY,
      dot: labelDot,
      maxWidth: Math.max(0, win.w - pad * 2),
      color: HUD_TEXT_BRIGHT_COLOR,
      zLift: lift,
      renderOrder: statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
    });

    const barsY0 = win.y + titleH + HUD_WINDOW_CONTENT_TOP_MARGIN_PX;
    const barH = 10 + (labelDot - 2) * 3;
    const barsY1 = barsY0 + barH + 6;

    const hp = hud.ui.metrics?.health ?? { value: 0, max: 0 };
    const sp = hud.ui.metrics?.stamina ?? { value: 0, max: 0 };
    const hpPct = hp.max > 0 ? clamp(hp.value / hp.max, 0, 1) : 0;
    const spPct = sp.max > 0 ? clamp(sp.value / sp.max, 0, 1) : 0;

    hud.objects.statusBars.healthBg.visible = true;
    hud.objects.statusBars.healthFg.visible = true;
    hud.objects.statusBars.staminaBg.visible = true;
    hud.objects.statusBars.staminaFg.visible = true;

    positionRect(hud.objects.statusBars.healthBg, barX, barsY0, barW, barH, HUD_Z_SURFACE_BG + lift);
    positionRect(hud.objects.statusBars.healthFg, barX, barsY0, Math.max(2, barW * hpPct), barH, HUD_Z_SURFACE_FG + lift);
    positionRect(hud.objects.statusBars.staminaBg, barX, barsY1, barW, barH, HUD_Z_SURFACE_BG + lift);
    positionRect(hud.objects.statusBars.staminaFg, barX, barsY1, Math.max(2, barW * spPct), barH, HUD_Z_SURFACE_FG + lift);

    const glyphH = 7 * labelDot;
    const maxBottomY = win.y + h - pad - glyphH;
    const bottomY = Math.min(barsY1 + barH + 6, maxBottomY);
    setPlainTextMaybeTroika({
      pixel: hud.objects.statusMetaText,
      text: `FPS: ${Number(hud.ui.metrics?.fps ?? 0)}`,
      x: cx,
      y: bottomY,
      dot: labelDot,
      maxWidth: textMaxW,
      color: HUD_TEXT_DEFAULT_COLOR,
      zLift: lift,
      renderOrder: statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
    });

    const speedText = String(hud.ui.metrics?.speed ?? "");
    const speedW = estimateTextWidthPx(speedText, labelDot, HUD_TEXT_ESTIMATE_GAP_PX);
    const speedX = Math.max(cx, win.x + win.w - pad - speedW);
    setPlainTextMaybeTroika({
      pixel: hud.objects.statusSpeedText,
      text: speedText,
      x: speedX,
      y: bottomY,
      dot: labelDot,
      color: HUD_TEXT_DEFAULT_COLOR,
      maxWidth: Math.max(0, win.x + win.w - pad - speedX),
      zLift: lift,
      renderOrder: statusRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
    });

    const depthText = String(hud.ui.metrics?.vrDepthText ?? "");
    const errText = String(hud.ui.metrics?.vrErrorText ?? "");
    const combined = errText ? `${depthText}\n${errText}` : depthText;
    const lineH = 12 * labelDot;
    const depthY = bottomY + lineH;
    if (combined && depthY + glyphH <= win.y + h - pad) {
      objs.contentText.setText({
        text: combined,
        x: cx,
        y: depthY,
        dot: labelDot,
        maxWidth: textMaxW,
        color: HUD_TEXT_DEFAULT_COLOR,
      });
    } else {
      objs.contentText.setText({ text: "", x: 0, y: 0, dot: labelDot });
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Progress window
  // ------------------------------------------------------------------
  function _renderProgress(ctx) {
    const { win, objs, labelDot, lift, renderList } = ctx;

    const lines = [
      "MISSION PROGRESS:",
      "",
      "PLAYER: READY",
      "ALIGNMENT: READY",
      "VOCATION: READY",
      "PATH ADJUSTMENT: READY",
      "",
      "TIMERS",
      "[=====         ]",
      "",
      "SKILL TRACKER 1",
      "ROPEMAKING 70.374 (0.00000)",
      "[====          ]",
    ];
    const colored = lines.map((l) => {
      const s = String(l ?? "");
      const up = s.toUpperCase();
      if (up.includes("READY")) return { text: s, color: HUD_TEXT_SUCCESS_COLOR };
      if (up === "TIMERS") return { text: s, color: HUD_TEXT_EMPHASIS_COLOR };
      return { text: s, color: HUD_TEXT_DEFAULT_COLOR };
    });
    renderList(colored, "topElseEnd");

    if (objs.contentTextGood) objs.contentTextGood.mesh.visible = false;
    if (objs.contentTextWarn) objs.contentTextWarn.mesh.visible = false;
    if (objs.scrollTrack) objs.scrollTrack.visible = false;
    if (objs.scrollThumb) objs.scrollThumb.visible = false;
    return true;
  }

  // ------------------------------------------------------------------
  // Target window
  // ------------------------------------------------------------------
  function _renderTarget(ctx) {
    const {
      key, win, objs, labelDot, titleGlyphY, lift, pad,
      renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

    if (objs.scrollTrack) objs.scrollTrack.visible = false;
    if (objs.scrollThumb) objs.scrollThumb.visible = false;
    const t = String(win.title ?? "NO TARGET");
    setPlainTextMaybeTroika({
      pixel: objs.titleText,
      text: t,
      x: win.x + pad,
      y: titleGlyphY,
      dot: labelDot,
      maxWidth: Math.max(0, win.w - 12),
      color: HUD_TEXT_DEFAULT_COLOR,
      zLift: lift,
    });
    clearPlainTextMaybeTroika(objs.contentText, labelDot);
    clearColoredMultilineMaybeTroika(objs, labelDot);

    const targetRoBase = Number.isFinite(objs?._renderOrderBase)
      ? Math.floor(objs._renderOrderBase)
      : renderOrderBaseFor(key);

    const iconY = win.y + titleH + 8;
    const iconX0 = win.x + pad;
    const s = 22;
    const gap = 8;
    for (let i = 0; i < hud.objects.targetIcons.length; i++) {
      const icon = hud.objects.targetIcons[i];
      icon.visible = true;
      setMeshRenderOrder(icon, targetRoBase + HUD_RENDER_ORDER_ICON_OFFSET);
      positionRect(icon, iconX0 + i * (s + gap), iconY, s, s, HUD_Z_SURFACE_FG + lift);
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Buffs window
  // ------------------------------------------------------------------
  function _renderBuffs(ctx) {
    const {
      key, win, objs, labelDot, lift, pad,
      renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

    if (objs.scrollTrack) objs.scrollTrack.visible = false;
    if (objs.scrollThumb) objs.scrollThumb.visible = false;
    clearPlainTextMaybeTroika(objs.titleText, labelDot);
    clearPlainTextMaybeTroika(objs.contentText, labelDot);
    clearColoredMultilineMaybeTroika(objs, labelDot);

    const buffsRoBase = Number.isFinite(objs?._renderOrderBase)
      ? Math.floor(objs._renderOrderBase)
      : renderOrderBaseFor(key);

    const cols = 14;
    const size = 18;
    const gap = 4;
    const startX = win.x + pad;
    const startY = win.y + titleH + 8;
    for (let i = 0; i < hud.objects.buffIcons.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (size + gap);
      const y = startY + row * (size + gap);
      const icon = hud.objects.buffIcons[i];

      const c = i % 6;
      const hex =
        c === 0
          ? HUD_SURFACE_ACCENT_COLOR
          : c === 1
          ? HUD_STATUS_STAMINA_TINT_COLOR
          : c === 2
          ? HUD_STATUS_HEALTH_TINT_COLOR
          : c === 3
          ? 0x7a5c21
          : c === 4
          ? HUD_TEXT_SUPREME_ACCENT_COLOR
          : HUD_PRIMARY_HIGHLIGHT_COLOR;
      icon.material.color.setHex(hex);
      icon.visible = true;
      setMeshRenderOrder(icon, buffsRoBase + HUD_RENDER_ORDER_ICON_OFFSET);
      positionRect(icon, x, y, size, size, HUD_Z_SURFACE_FG + lift);
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Hotbar window
  // ------------------------------------------------------------------
  function _renderHotbar(ctx) {
    const {
      win, objs, labelDot, lift,
      renderOrderBaseFor, setMeshRenderOrder,
    } = ctx;

    if (objs.scrollTrack) objs.scrollTrack.visible = false;
    if (objs.scrollThumb) objs.scrollThumb.visible = false;
    clearPlainTextMaybeTroika(objs.titleText, labelDot);
    clearPlainTextMaybeTroika(objs.contentText, labelDot);

    const { slot, slots, startX, startY, slotMetrics, leftGutter, rightGutter } = getHotbarSlotLayout(win);
    const hotbarItems = Array.isArray(hud.ui?.data?.hotbarItems)
      ? hud.ui.data.hotbarItems
      : [];
    const activeIndex = Number.isInteger(hud.ui?.data?.hotbarActiveIndex)
      ? Number(hud.ui.data.hotbarActiveIndex)
      : -1;
    const stone = getHudStoneSkinChrome(hud);
    const headerTitle = String(hud.ui?.data?.hotbarHeaderTitle ?? "").trim();
    const headerColor = Number(hud.ui?.data?.hotbarHeaderColor ?? (stone?.parchment ?? HUD_TEXT_INFO_COLOR)) >>> 0;
    const statusText = String(hud.ui?.data?.hotbarStatusText ?? "").trim();
    const statusTextColor = Number(hud.ui?.data?.hotbarStatusTextColor ?? (stone?.ink ?? 0x18202a)) >>> 0;
    const statusBgColor = Number(hud.ui?.data?.hotbarStatusBgColor ?? (stone?.gold ?? 0xa7dfb5)) >>> 0;

    const hotbarRoBase = Number.isFinite(objs?._renderOrderBase)
      ? Math.floor(objs._renderOrderBase)
      : renderOrderBaseFor("hotbar");

    const compactChrome = leftGutter < 120 || rightGutter < 128;
    const fullTitleWidth = estimateTextWidthPx(headerTitle, HOTBAR_TITLE_MIN_DOT_PX, HUD_TEXT_ESTIMATE_GAP_PX);
    const canUseFullTitle = !!headerTitle && leftGutter >= HOTBAR_HEADER_TEXT_OFFSET_X_PX + fullTitleWidth + 18;
    const compactTitle = compactChrome && !canUseFullTitle && headerTitle
      ? headerTitle
        .split(/\s+/)
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 3)
        .toUpperCase()
      : headerTitle;
    const compactStatusText = compactChrome && statusText.includes("•")
      ? statusText.split("•").pop()?.trim() || statusText
      : statusText;

    const titleText = hud.objects.hotbarHeaderText;
    const statusBg = hud.objects.hotbarStatusBg;
    const statusTextObj = hud.objects.hotbarStatusText;
    const gripDots = Array.isArray(hud.objects.hotbarGripDots)
      ? hud.objects.hotbarGripDots
      : [];
    const titleDot = compactChrome
      ? Math.max(HOTBAR_TITLE_MIN_DOT_PX, labelDot)
      : Math.max(HOTBAR_TITLE_REGULAR_DOT_PX, labelDot + 1);
    const titleTextH = 7 * titleDot;
    const titleY = win.y + Math.max(0, Math.floor((win.h - titleTextH) / 2));

    if (titleText) {
      setPlainTextMaybeTroika({
        pixel: titleText,
        text: compactTitle,
        x: win.x + (compactChrome && !canUseFullTitle ? HOTBAR_HEADER_COMPACT_TEXT_OFFSET_X_PX : HOTBAR_HEADER_TEXT_OFFSET_X_PX),
        y: titleY,
        dot: titleDot,
        color: headerColor,
        zLift: lift,
        renderOrder: hotbarRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
      });
    }

    for (let index = 0; index < gripDots.length; index += 1) {
      const dot = gripDots[index];
      const showDot = !!headerTitle;
      dot.visible = showDot;
      if (!showDot) continue;
      const column = index % 2;
      const row = Math.floor(index / 2);
      setMeshRenderOrder(dot, hotbarRoBase + HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET);
      positionRect(
        dot,
        win.x + (compactChrome ? 8 : 16) + column * (compactChrome ? 8 : 10),
        win.y + Math.floor((win.h - (compactChrome ? 18 : 24)) / 2) + row * (compactChrome ? 8 : 10),
        compactChrome ? 3 : 4,
        compactChrome ? 3 : 4,
        HUD_Z_SURFACE_FG + lift
      );
    }

    if (statusBg) {
      const showStatus = !!compactStatusText;
      statusBg.visible = showStatus;
      if (showStatus) {
        const badgeDot = compactChrome
          ? Math.max(HOTBAR_STATUS_MIN_DOT_PX, labelDot)
          : Math.max(HOTBAR_STATUS_REGULAR_DOT_PX, labelDot);
        const badgeTextW = estimateTextWidthPx(compactStatusText, badgeDot, HUD_TEXT_ESTIMATE_GAP_PX);
        const badgeMinW = compactChrome ? HOTBAR_COMPACT_BADGE_MIN_WIDTH_PX : HOTBAR_REGULAR_BADGE_MIN_WIDTH_PX;
        const badgeMaxW = Math.max(badgeMinW, rightGutter - (compactChrome ? 10 : 18));
        const badgeW = clamp(badgeTextW + (compactChrome ? 22 : 30), badgeMinW, badgeMaxW);
        const badgeH = compactChrome ? HOTBAR_COMPACT_BADGE_HEIGHT_PX : HOTBAR_REGULAR_BADGE_HEIGHT_PX;
        const badgeX = win.x + win.w - rightGutter + Math.max(0, Math.floor((rightGutter - badgeW) / 2));
        const badgeY = win.y + Math.floor((win.h - badgeH) / 2);
        if (statusBg.material?.color) {
          statusBg.material.color.setHex(statusBgColor);
        }
        if (statusBg.material) {
          statusBg.material.opacity = 0.96;
        }
        setMeshRenderOrder(statusBg, hotbarRoBase + HUD_RENDER_ORDER_TITLE_OFFSET);
        positionRect(statusBg, badgeX, badgeY, badgeW, badgeH, HUD_Z_SURFACE_FG + lift);
        setPlainTextMaybeTroika({
          pixel: statusTextObj,
          text: compactStatusText,
          x: badgeX + Math.max(0, Math.floor((badgeW - badgeTextW) / 2)),
          y: badgeY + Math.max(0, Math.floor((badgeH - 7 * badgeDot) / 2)),
          dot: badgeDot,
          color: statusTextColor,
          zLift: lift,
          renderOrder: hotbarRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
        });
      } else if (statusTextObj) {
        clearPlainTextMaybeTroika(statusTextObj, labelDot);
      }
    }

    for (let i = 0; i < hud.objects.hotbarSlots.length; i++) {
      const isVisible = i < slots;
      const metric = slotMetrics[i] ?? null;
      const x = metric?.x ?? startX;
      const y = metric?.y ?? startY;
      const slotW = metric?.w ?? slot;
      const { bg, outline } = hud.objects.hotbarSlots[i];
      const item = hotbarItems[i] ?? null;
      const isActive = item?.active === true || i === activeIndex;
      const isSpacer = item?.spacer === true;
      const isSeparator = isSpacer && item?.separator === true;
      bg.visible = isVisible && (!isSpacer || isSeparator);
      outline.visible = isVisible && !isSpacer;
      if (!isVisible) continue;
      if (isSeparator) {
        if (bg?.material?.map) {
          bg.material.map = null;
          bg.material.needsUpdate = true;
        }
        if (bg?.material?.color) {
          bg.material.color.setHex(Number(item?.separatorColor ?? HUD_SURFACE_ACCENT_COLOR) >>> 0);
        }
        if (bg?.material) {
          bg.material.opacity = Number.isFinite(item?.separatorOpacity)
            ? Number(item.separatorOpacity)
            : 0.72;
        }
        setMeshRenderOrder(bg, hotbarRoBase + HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET);
        const separatorH = Math.max(HOTBAR_SEPARATOR_LINE_MIN_HEIGHT_PX, slot - HOTBAR_SEPARATOR_LINE_MARGIN_PX * 2);
        positionRect(
          bg,
          x + Math.max(0, Math.floor((slotW - HOTBAR_SEPARATOR_LINE_WIDTH_PX) / 2)),
          y + Math.max(0, Math.floor((slot - separatorH) / 2)),
          HOTBAR_SEPARATOR_LINE_WIDTH_PX,
          separatorH,
          HUD_Z_SURFACE_FG + lift
        );
        continue;
      }
      if (isSpacer) continue;

      const slotMap = item?.iconTexture ?? null;
      if (bg?.material && bg.material.map !== slotMap) {
        bg.material.map = slotMap;
        bg.material.needsUpdate = true;
      }
      if (bg?.material?.color) {
        const stone = getHudStoneSkinChrome(hud);
        const idleBg = stone?.well ?? 0x162131;
        const activeBg = stone?.olive ?? 0x223042;
        const baseColor = slotMap
          ? 0xffffff
          : Number(isActive ? (item?.activeBgColor ?? item?.bgColor ?? activeBg) : (item?.bgColor ?? idleBg)) >>> 0;
        bg.material.color.setHex(baseColor);
      }
      if (bg?.material) {
        bg.material.opacity = Number.isFinite(item?.bgOpacity)
          ? Number(item.bgOpacity)
          : (isActive ? 0.98 : 0.94);
      }
      if (outline?.material?.color) {
        const stone = getHudStoneSkinChrome(hud);
        const idleOutline = stone?.gold ?? HUD_SURFACE_ACCENT_COLOR;
        const activeOutline = stone?.goldBright ?? HUD_PRIMARY_HIGHLIGHT_COLOR;
        outline.material.color.setHex(Number(isActive ? (item?.activeOutlineColor ?? activeOutline) : (item?.outlineColor ?? idleOutline)) >>> 0);
      }
      if (outline?.material) {
        outline.material.opacity = Number.isFinite(item?.outlineOpacity)
          ? Number(item.outlineOpacity)
          : (isActive ? 0.98 : 0.62);
      }

      setMeshRenderOrder(outline, hotbarRoBase + HUD_RENDER_ORDER_TITLE_OFFSET);
      setMeshRenderOrder(bg, hotbarRoBase + HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET);

      positionRect(
        outline,
        x - HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX,
        y - HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX,
        slotW + HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX * 2,
        slot + HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX * 2,
        0.002 + lift
      );
      positionRect(bg, x, y, slotW, slot, HUD_Z_SURFACE_RECESSED + lift);
    }

    // Slot numbers
    const dot = labelDot;
    const digitW = 5 * dot;
    const digitH = 7 * dot;
    const numY = startY + slot - digitH - 2;

    setPlainTextMaybeTroika({
      pixel: hud.objects.hotbarNumbersText,
      text: "",
      x: 0,
      y: 0,
      dot,
      color: HUD_TEXT_DEFAULT_COLOR,
      zLift: lift,
      renderOrder: hotbarRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
    });

    const nums = "1234567890";
    const hotbarTooltips = Array.isArray(hud.ui?.data?.hotbarTooltips)
      ? hud.ui.data.hotbarTooltips
      : [];
    const shouldReserveSystemHotbarSlots = hud.ui?.data?.reserveSystemHotbarSlots !== false;
    const labels = hud.objects.hotbarNumberTexts;
    if (Array.isArray(labels)) {
      for (let i = 0; i < labels.length; i++) {
        const t = labels[i];
        const isVisible = i < slots;
        if (!isVisible) {
          setPlainTextMaybeTroika({
            pixel: t,
            text: "",
            x: 0,
            y: 0,
            dot,
            color: HUD_TEXT_DEFAULT_COLOR,
            zLift: lift,
            renderOrder: hotbarRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
          });
          continue;
        }
        const metric = slotMetrics[i] ?? null;
        const sx = metric?.x ?? startX;
        const slotW = metric?.w ?? slot;
        const item = hotbarItems[i] ?? null;
        const isActive = item?.active === true || i === activeIndex;
        const tooltipText = String(hotbarTooltips[i] ?? "").trim();
        const shouldHideFallbackNumber = !item && !tooltipText;
        const numberText = item?.showNumber === false
          ? ""
          : (typeof item?.numberText === "string" ? item.numberText : (shouldHideFallbackNumber ? "" : nums[i]));
        const dx = sx + 4;
        setPlainTextMaybeTroika({
          pixel: t,
          text: numberText,
          x: dx,
          y: numY,
          dot,
          color: Number(isActive ? (item?.activeNumberColor ?? item?.numberColor ?? (getHudStoneSkinChrome(hud)?.parchment ?? HUD_TEXT_BRIGHT_COLOR)) : (item?.numberColor ?? (getHudStoneSkinChrome(hud)?.parchment ?? HUD_TEXT_DEFAULT_COLOR))) >>> 0,
          zLift: lift,
          renderOrder: hotbarRoBase + HUD_RENDER_ORDER_TEXT_OFFSET,
        });
      }
    }

    // In-slot labels
    const helpIdx = shouldReserveSystemHotbarSlots
      ? (slots === HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX + 1
        ? HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX
        : Math.max(0, slots - 1))
      : -1;
    const dbgIdx = shouldReserveSystemHotbarSlots
      ? (slots === HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX + 1
        ? HUD_SYSTEM_HOTBAR_DEBUG_SLOT_INDEX
        : Math.max(0, slots - 2))
      : -1;
    const icons = hud.objects.hotbarIconTexts;
    if (Array.isArray(icons)) {
      const baseIconDot = getHudGlyphDotSizePx(renderer);

      function shortFromTooltip(tip, fallback) {
        const raw = String(tip ?? "").trim();
        if (!raw) return fallback;
        const head = raw.split("\n")[0];
        const beforeColon = head.split(":")[0];
        const firstWord = beforeColon.trim().split(/\s+/)[0] ?? "";
        const cleaned = firstWord.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (cleaned.length >= 1) return cleaned.slice(0, 3);
        return fallback;
      }

      for (let i = 0; i < icons.length; i++) {
        const t = icons[i];
        const isVisible = i < slots;
        if (!isVisible) {
          setPlainTextMaybeTroika({
            pixel: t,
            text: "",
            x: 0,
            y: 0,
            dot: baseIconDot,
            color: HUD_TEXT_DEFAULT_COLOR,
            zLift: lift,
            renderOrder: hotbarRoBase + HUD_RENDER_ORDER_COLOR_LAYER_OFFSET,
          });
          continue;
        }
        const item = hotbarItems[i] ?? null;
        const isActive = item?.active === true || i === activeIndex;
        const isSpacer = item?.spacer === true;
        if (isSpacer) {
          setPlainTextMaybeTroika({
            pixel: t,
            text: "",
            x: 0,
            y: 0,
            dot: baseIconDot,
            color: HUD_TEXT_DEFAULT_COLOR,
            zLift: lift,
            renderOrder: hotbarRoBase + HUD_RENDER_ORDER_COLOR_LAYER_OFFSET,
          });
          continue;
        }
        let text = "";
        if (item?.iconTexture) {
          text = "";
        } else if (item?.iconText) {
          text = String(item.iconText).slice(0, 5).toUpperCase();
        } else if (item?.shortLabel) {
          text = String(item.shortLabel).slice(0, 5).toUpperCase();
        } else if (i === helpIdx) text = "HLP";
        else if (i === dbgIdx) text = "DBG";
        else {
          text = shortFromTooltip(hotbarTooltips[i] ?? "", "");
        }
        const metric = slotMetrics[i] ?? null;
        const sx = metric?.x ?? startX;
        const slotW = metric?.w ?? slot;
        let textDot = baseIconDot;
        const maxTextW = Math.max(8, slotW - 6);
        while (text && textDot > 1 && estimateTextWidthPx(text, textDot, HUD_TEXT_ESTIMATE_GAP_PX) > maxTextW) {
          textDot -= 1;
        }
        const textW = estimateTextWidthPx(text, textDot, HUD_TEXT_ESTIMATE_GAP_PX);
        const textH = 7 * textDot;
        const ix = sx + Math.max(0, Math.round((slotW - textW) / 2));
        setPlainTextMaybeTroika({
          pixel: t,
          text,
          x: ix,
          y: startY + Math.round((slot - textH) / 2),
          dot: textDot,
          color: Number(isActive ? (item?.activeTextColor ?? item?.textColor ?? HUD_TEXT_BRIGHT_COLOR) : (item?.textColor ?? HUD_TEXT_DEFAULT_COLOR)) >>> 0,
          zLift: lift,
          renderOrder: hotbarRoBase + HUD_RENDER_ORDER_COLOR_LAYER_OFFSET,
        });
      }
    }
    return true;
  }

  return { renderWindowContent };
}
