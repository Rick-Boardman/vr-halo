// SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------
// hud-window-render-layout-runtime.js — Window render-layout module
// -----------------------------------------------------------------
// Extracted from hud.js. Handles the per-window common layout pass:
// visibility gating, render-order assignment, geometry positioning
// (shadow, outline, bg, bevels, title bar, scroll bar), and content
// delegation to the render-list and content-dispatch runtimes.
// -----------------------------------------------------------------

import { clamp } from "./scalar-math.js";
import {
  HUD_OVERLAY_PADDING_PX,
  HUD_RENDER_ORDER_CARET_OFFSET,
  HUD_RENDER_ORDER_COLOR_LAYER_OFFSET,
  HUD_RENDER_ORDER_TEXT_OFFSET,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_WINDOW_CONTENT_TOP_MARGIN_PX,
  HUD_SCROLLBAR_RESERVED_WIDTH_PX,
  HUD_SCROLLBAR_TRACK_WIDTH_PX,
  HUD_SCROLLBAR_TRACK_TOP_INSET_PX,
  HUD_SCROLLBAR_TRACK_BOTTOM_INSET_PX,
  HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX,
  HUD_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
  HUD_SCROLLBAR_RIGHT_INSET_PX,
  HUD_Z_SURFACE_FG,
  HUD_Z_SURFACE_BG,
  HUD_Z_SURFACE_RECESSED,
  HUD_Z_BEVEL,
  HUD_Z_WINDOW_BG,
  getHudGlyphDotSizePx,
} from "./hud-layout-policy.js";
import { HUD_SURFACE_ACCENT_COLOR } from "./hud-surface-style.js";
import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_BRIGHT_COLOR,
  HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER,
} from "./hud-text-style.js";
import {
  getHudWindowTitleChrome,
  getHudWindowControlRects,
  resolveHudTitleReadabilityPoc,
  HUD_NINE_SLICE_PIECE_NAMES,
  HUD_SKINNED_TITLE_TEXT_NUDGE_PX,
} from "./hud-window-skin-runtime.js";

/** Active drag/resize window base render order (above hit markers). */
const DRAG_TOP_RENDER_ORDER_BASE = 5000;
/** Focused window base render order (below overlays, above normal windows). */
const FOCUSED_TOP_RENDER_ORDER_BASE = 4000;

/**
 * Factory for the per-window render-layout subsystem.
 *
 * @param {object} deps
 * @param {object} deps.hud - HUD state object.
 * @param {object} deps.renderer - THREE.WebGLRenderer instance.
 * @param {object} deps.windowObjectVisibilityRuntime - Visibility runtime.
 * @param {object} deps.windowTextRenderOrderRuntime - Troika render-order runtime.
 * @param {Function} deps.setPlainTextMaybeTroika - Sets plain text or Troika text.
 * @param {Function} deps.clearPlainTextMaybeTroika - Clears plain text.
 * @param {Function} deps.clearColoredMultilineMaybeTroika - Clears colored multiline text.
 * @param {Function} deps.positionRect - Positions a rect mesh in HUD space.
 * @param {Function} deps.renderListFn - Render-list runtime function.
 * @param {Function} deps.renderWindowContentFn - Window-content dispatch runtime function.
 * @returns {{ renderWindow: Function }}
 */
export function createHudWindowRenderLayoutRuntime({
  hud,
  renderer,
  windowObjectVisibilityRuntime,
  windowTextRenderOrderRuntime,
  setPlainTextMaybeTroika,
  clearPlainTextMaybeTroika,
  clearColoredMultilineMaybeTroika,
  positionRect,
  renderListFn,
  renderWindowContentFn,
}) {
  const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
  const pad = HUD_OVERLAY_PADDING_PX;

  /**
   * Render common layout for a single HUD window.
   *
   * @param {string} key - Window key (e.g. "chat", "inventory").
   * @param {object} renderOrderCtx - Per-frame render-order context.
   * @param {Function} renderOrderCtx.zLiftFor - Returns Z-lift for a window key.
   * @param {Function} renderOrderCtx.renderOrderBaseFor - Returns base render order for a window key.
   * @param {Function} renderOrderCtx.setMeshRenderOrder - Sets renderOrder on a mesh.
   */
  function renderWindow(key, { zLiftFor, renderOrderBaseFor, setMeshRenderOrder }) {
    const win = hud.ui.windows[key];
    const objs = hud.objects.windows[key];
    if (!win || !objs) return;
    const effectiveTitleH = key === "hotbar" ? 0 : titleH;

    // Hidden windows intentionally live off-screen. In VR, layout coordinates
    // can wrap around the spherical HUD, so we must explicitly skip rendering.
    if (Number(win.y) < -1000) {
      if (!objs._hiddenByOffscreen) {
        windowObjectVisibilityRuntime.setAllWindowObjectsVisible(objs, false);
        // Also hide 9-slice pieces (game-provided textured overlays).
        if (objs.nineSlice) {
          for (const p of HUD_NINE_SLICE_PIECE_NAMES) {
            if (objs.nineSlice[p]) objs.nineSlice[p].visible = false;
          }
        }
        objs._hiddenByOffscreen = true;
      }
      return;
    }

    // If the window was previously hidden, restore its object visibility.
    // (Positioning functions re-enable rect meshes, but text objects also
    // need their visible flag restored.)
    if (objs._hiddenByOffscreen) {
      windowObjectVisibilityRuntime.setAllWindowObjectsVisible(objs, true);
      objs._hiddenByOffscreen = false;
    }

    const labelDot = getHudGlyphDotSizePx(renderer);
    const titleDot = labelDot * HUD_TEXT_HEADER_FONT_SIZE_MULTIPLIER;
    const titleChrome = getHudWindowTitleChrome(win, objs, effectiveTitleH);
    const controlRects = getHudWindowControlRects(win, objs, effectiveTitleH);
    const titlePoc = resolveHudTitleReadabilityPoc(hud);
    const titleGlyphY =
      titleChrome.y
      + Math.max(0, Math.floor((effectiveTitleH - 7 * titleDot) / 2))
      - (titleChrome.skinned ? HUD_SKINNED_TITLE_TEXT_NUDGE_PX : 0);

    const h = win.collapsed ? Math.max(titleH, effectiveTitleH) : win.h;
    const lift = zLiftFor(key);
    const isFront = hud.ui.focus === key || !!win.dragging || !!win.resizing;
    const isHotbar = key === "hotbar";

    // Dragging/resizing must be unambiguously on top.
    // Relying only on hud.ui.order can fail if the order mutates mid-frame or
    // if external callers manage order differently. This makes the active drag
    // window render above all other windows (but still below overlays).
    const roBase = win.dragging || win.resizing
      ? DRAG_TOP_RENDER_ORDER_BASE
      : hud.ui.focus === key
        ? FOCUSED_TOP_RENDER_ORDER_BASE
        : renderOrderBaseFor(key);
    // Expose render ordering to text helpers.
    objs._renderOrderBase = roBase;
    objs._textRenderOrderBase = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
    objs._colorLayerRenderOrderOverride = roBase + HUD_RENDER_ORDER_COLOR_LAYER_OFFSET;

    try {
      objs._zLift = lift;
    } catch {
      // no-op
    }

    // Keep text objects at the correct depth layer.
    // (Some call sites setText() directly without going through helpers.)
    try {
      if (typeof objs.titleText?.setZOffset === "function") objs.titleText.setZOffset(lift);
      if (typeof objs.contentText?.setZOffset === "function") objs.contentText.setZOffset(lift);
      if (typeof objs.minLabel?.setZOffset === "function") objs.minLabel.setZOffset(lift);
      if (typeof objs.closeLabel?.setZOffset === "function") objs.closeLabel.setZOffset(lift);
      if (typeof objs.contentTextRare?.setZOffset === "function") objs.contentTextRare.setZOffset(lift);
      if (typeof objs.contentTextSupreme?.setZOffset === "function") objs.contentTextSupreme.setZOffset(lift);
      if (typeof objs.contentTextGood?.setZOffset === "function") objs.contentTextGood.setZOffset(lift);
      if (typeof objs.contentTextWarn?.setZOffset === "function") objs.contentTextWarn.setZOffset(lift);
    } catch {
      // no-op
    }


    // Deterministic ordering for all window layers.
    setMeshRenderOrder(objs.shadow, roBase + 0);
    setMeshRenderOrder(objs.outline, roBase + 1);
    setMeshRenderOrder(objs.bg, roBase + 2);
    setMeshRenderOrder(objs.bevelTop, roBase + 3);
    setMeshRenderOrder(objs.bevelLeft, roBase + 3);
    setMeshRenderOrder(objs.bevelBottom, roBase + 3);
    setMeshRenderOrder(objs.bevelRight, roBase + 3);
    // When 9-slice is active, title/buttons must render above frame edges (roBase+25).
    const hasNineSlice = !!objs.nineSlice;
    setMeshRenderOrder(objs.title, roBase + (hasNineSlice ? 27 : 10));
    if (objs.titleNameplate) setMeshRenderOrder(objs.titleNameplate, roBase + (hasNineSlice ? 27 : 10));
    setMeshRenderOrder(objs.titleDivider, roBase + (hasNineSlice ? 27 : 11));
    setMeshRenderOrder(objs.minBtn, roBase + (hasNineSlice ? 28 : 12));
    setMeshRenderOrder(objs.closeBtn, roBase + (hasNineSlice ? 28 : 12));
    setMeshRenderOrder(objs.actionBtn, roBase + (hasNineSlice ? 28 : 12));
    setMeshRenderOrder(objs.resizeHandle, roBase + (hasNineSlice ? 28 : 12));
    setMeshRenderOrder(objs.contentBg, roBase + 15);
    setMeshRenderOrder(objs.scrollTrack, roBase + 20);
    setMeshRenderOrder(objs.scrollUpBtn, roBase + 21);
    setMeshRenderOrder(objs.scrollDownBtn, roBase + 21);
    setMeshRenderOrder(objs.scrollThumb, roBase + 22);
    setMeshRenderOrder(objs.hit, roBase + 5);
    setMeshRenderOrder(objs.caret, roBase + HUD_RENDER_ORDER_CARET_OFFSET);
    if (Array.isArray(objs.titleDots)) {
      for (const dot of objs.titleDots) setMeshRenderOrder(dot, roBase + (hasNineSlice ? 28 : 12));
    }
    try {
      if (typeof objs.titleText?.setRenderOrder === "function") {
        objs.titleText.setRenderOrder(roBase + HUD_RENDER_ORDER_TEXT_OFFSET);
      } else if (objs.titleText?.mesh) {
        objs.titleText.mesh.renderOrder = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      }
      if (typeof objs.contentText?.setRenderOrder === "function") {
        objs.contentText.setRenderOrder(roBase + HUD_RENDER_ORDER_TEXT_OFFSET);
      } else if (objs.contentText?.mesh) {
        objs.contentText.mesh.renderOrder = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      }
      if (typeof objs.minLabel?.setRenderOrder === "function") {
        objs.minLabel.setRenderOrder(roBase + HUD_RENDER_ORDER_TEXT_OFFSET);
      } else if (objs.minLabel?.mesh) {
        objs.minLabel.mesh.renderOrder = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      }
      if (typeof objs.closeLabel?.setRenderOrder === "function") {
        objs.closeLabel.setRenderOrder(roBase + HUD_RENDER_ORDER_TEXT_OFFSET);
      } else if (objs.closeLabel?.mesh) {
        objs.closeLabel.mesh.renderOrder = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      }
      if (typeof objs.actionLabel?.setRenderOrder === "function") {
        objs.actionLabel.setRenderOrder(roBase + HUD_RENDER_ORDER_TEXT_OFFSET);
      } else if (objs.actionLabel?.mesh) {
        objs.actionLabel.mesh.renderOrder = roBase + HUD_RENDER_ORDER_TEXT_OFFSET;
      }
    } catch {
      // no-op
    }

    // Troika meshes are updated asynchronously and may not be touched on frames
    // where text content doesn't change. Keep their renderOrder in sync with the
    // current window stacking so stale high-order text can't float above other panels.
    windowTextRenderOrderRuntime.syncWindowTroikaRenderOrders(objs);

    // Full-rect hit collider at the same depth as the title bar surface.
    // This keeps VR picking stable and avoids switching between different Z planes.
    if (objs.hit) {
      positionRect(objs.hit, win.x, win.y, win.w, h, 0.002 + lift);
    }

    if (objs.shadow) {
      try {
        if (objs.shadow.material) objs.shadow.material.opacity = isHotbar ? 0.18 : 0.12;
      } catch {
        // no-op
      }
      objs.shadow.visible = true;
      positionRect(
        objs.shadow,
        win.x + (isHotbar ? 3 : 2),
        win.y + (isHotbar ? 3 : 2),
        win.w,
        h,
        0.00115 + lift
      );
    }

    const outlineInset = Number.isFinite(win.borderInset) ? Number(win.borderInset) : 0;
    if (objs.outline?.material?.color) {
      objs.outline.material.color.setHex(Number(win.borderColor ?? HUD_SURFACE_ACCENT_COLOR) >>> 0);
    }
    if (objs.outline?.material) {
      objs.outline.material.opacity = isHotbar ? 0.88 : Number.isFinite(win.borderOpacity) ? Number(win.borderOpacity) : 0.42;
    }
    positionRect(
      objs.outline,
      win.x - outlineInset,
      win.y - outlineInset,
      win.w + outlineInset * 2,
      h + outlineInset * 2,
      0.0013 + lift
    );

    if (objs.bg?.material) {
      if (win.panelBgColor != null && objs.bg.material.color) {
        objs.bg.material.color.setHex(Number(win.panelBgColor) >>> 0);
      }
      if (win.panelBgOpacity != null) {
        const base = Number(win.panelBgOpacity);
        objs.bg.material.opacity = isFront ? 1.0 : base;
      }
    }
    positionRect(objs.bg, win.x, win.y, win.w, h, HUD_Z_WINDOW_BG + lift);

    if (objs.title?.material) {
      if (win.titleBarColor != null && objs.title.material.color) {
        objs.title.material.color.setHex(Number(win.titleBarColor) >>> 0);
      }
      if (win.titleBarOpacity != null) {
        const base = Number(win.titleBarOpacity);
        objs.title.material.opacity = isFront ? 1.0 : base;
      }
    }
    objs.title.visible = effectiveTitleH > 0;
    if (effectiveTitleH > 0) {
      if (hasNineSlice && objs._hudTitlePocId !== titlePoc.id) {
        objs._hudTitlePocId = titlePoc.id;
        const skinTex = objs._hudSkinTextures?.[titlePoc.headerKey] || objs._hudSkinTextures?.headerBar;
        if (skinTex && objs.title?.material) {
          const hdrTex = skinTex.clone();
          hdrTex.colorSpace = skinTex.colorSpace;
          hdrTex.minFilter = skinTex.minFilter;
          hdrTex.magFilter = skinTex.magFilter;
          hdrTex.wrapS = skinTex.wrapS;
          hdrTex.wrapT = skinTex.wrapT;
          hdrTex.repeat.set(1, 1);
          hdrTex.offset.set(0, 0);
          hdrTex.needsUpdate = true;
          objs.title.material.map = hdrTex;
          objs.title.material.needsUpdate = true;
        }
      }
      positionRect(
        objs.title,
        titleChrome.x,
        titleChrome.y,
        titleChrome.w,
        titleChrome.h,
        (hasNineSlice ? 0.0035 : 0.002) + lift
      );
    }

    // Inner bevel + divider
    if (objs.bevelTop) objs.bevelTop.visible = false;
    if (objs.bevelLeft) objs.bevelLeft.visible = false;
    if (objs.bevelBottom) objs.bevelBottom.visible = false;
    if (objs.bevelRight) objs.bevelRight.visible = false;
    if (objs.titleDivider) {
      objs.titleDivider.visible = false;
    }

    if (Array.isArray(objs.titleDots)) {
      const showTitleDots =
        !isHotbar &&
        effectiveTitleH > 0 &&
        win.showTitleDots !== false &&
        !titleChrome.skinned;
      for (let index = 0; index < objs.titleDots.length; index += 1) {
        const dot = objs.titleDots[index];
        if (!dot) continue;
        dot.visible = showTitleDots;
        if (!showTitleDots) continue;
        positionRect(
          dot,
          titleChrome.x + 8 + index * 7,
          titleChrome.y + Math.floor((effectiveTitleH - 4) / 2),
          4,
          4,
          0.00218 + lift
        );
      }
    }

    const controlSlotW = objs.nineSlice ? 18 : titleChrome.controlSlotW;

    if (objs.closeBtn) {
      const r = controlRects.close;
      if (r) {
        positionRect(objs.closeBtn, r.x, r.y, r.w, r.h, HUD_Z_SURFACE_FG + lift);
      }
      clearPlainTextMaybeTroika(objs.closeLabel, labelDot);
    }

    if (objs.minBtn) {
      const r = controlRects.min;
      if (r) {
        positionRect(objs.minBtn, r.x, r.y, r.w, r.h, HUD_Z_SURFACE_FG + lift);
      }
      clearPlainTextMaybeTroika(objs.minLabel, labelDot);
    }

    // Action button (e.g. layout snapshot on the debug panel).
    // On the debug panel this sits to the left of the invisible copy button and minimize.
    if (objs.actionBtn) {
      const r = controlRects.action;
      if (r) {
        positionRect(objs.actionBtn, r.x, r.y, r.w, r.h, HUD_Z_SURFACE_FG + lift);
      }
      clearPlainTextMaybeTroika(objs.actionLabel, labelDot);
    }

    if (objs.resizeHandle) {
      const r = controlRects.resize;
      if (r && !win.collapsed) {
        objs.resizeHandle.visible = true;
        positionRect(objs.resizeHandle, r.x, r.y, r.w, r.h, HUD_Z_SURFACE_FG + lift);
      } else {
        objs.resizeHandle.visible = false;
      }
    }

    // Title button count: for debug panel, include invisible copy slot between action and minimize.
    const btnSlots =
      (objs.closeBtn ? 1 : 0) +
      (objs.minBtn ? 1 : 0) +
      (objs.actionBtn ? (key === "debug" ? 2 : 1) : 0);
    const titleStartX = key === "hotbar"
      ? win.x + pad
      : titleChrome.x + (titleChrome.skinned ? 8 : 34);
    const titleMaxW = Math.max(
      0,
      titleChrome.w - (btnSlots ? controlSlotW * btnSlots : 0) - (titleStartX - titleChrome.x) - 8
    );
    if (key === "hotbar") {
      // Hotbar is a strip, not a titled panel. Do not draw the title at all.
      // Hiding avoids a one-frame Troika update mismatch (content vs position)
      // which can manifest as flicker at (0,0) when the hotbar renderer blanks it.
      clearPlainTextMaybeTroika(objs.titleText, labelDot);
    } else {
      setPlainTextMaybeTroika({
        pixel: objs.titleText,
        text: win.title || "",
        x: titleStartX,
        y: titleGlyphY,
        dot: titleDot,
        maxWidth: titleMaxW,
        color: titleChrome.skinned ? titlePoc.color : (win.titleTextColor ?? HUD_TEXT_DEFAULT_COLOR),
        zLift: lift,
        outlineWidth: titleChrome.skinned ? titlePoc.outlineWidth : 0,
        outlineColor: titlePoc.outlineColor,
        outlineOpacity: titleChrome.skinned ? titlePoc.outlineOpacity : 0,
        fontWeight: titleChrome.skinned ? titlePoc.fontWeight : null,
      });
    }

    if (objs.titleNameplate) {
      const showPlate = titlePoc.showPlaque && titleChrome.skinned && effectiveTitleH > 0;
      objs.titleNameplate.visible = showPlate;
      if (showPlate) {
        positionRect(
          objs.titleNameplate,
          titleChrome.x + 4,
          titleChrome.y + 5,
          Math.max(1, titleChrome.w - 8),
          Math.max(8, titleChrome.h - 10),
          0.00355 + lift
        );
      }
    }

    // ── 9-slice stone frame (optional game-provided textured overlay) ──
    if (objs.nineSlice) {
      const c = objs.nineSlice.cornerSize || 24;
      const ns = objs.nineSlice;
      // Z layers: center sits behind content, edges/corners sit above scroll but below text.
      const centerZ = HUD_Z_WINDOW_BG + 0.00005 + lift;
      const frameZ = 0.00305 + lift; // above title (0.002) and content quads

      // Hide default chrome that 9-slice replaces.
      if (objs.outline) objs.outline.visible = false;
      if (objs.bg) objs.bg.visible = false;
      if (objs.bevelTop) objs.bevelTop.visible = false;
      if (objs.bevelLeft) objs.bevelLeft.visible = false;
      if (objs.bevelBottom) objs.bevelBottom.visible = false;
      if (objs.bevelRight) objs.bevelRight.visible = false;

      if (h >= c * 2) {
        // Center piece: replaces bg, sits behind content. Order = bg level.
        setMeshRenderOrder(ns.center, roBase + 2);
        positionRect(ns.center, win.x + c, win.y + c, Math.max(1, win.w - 2 * c), Math.max(1, h - 2 * c), centerZ);

        // Edges and corners: decorative frame, above scroll/content but below text.
        const framePieces = ["tl", "top", "tr", "left", "right", "bl", "bottom", "br"];
        for (const p of framePieces) {
          if (ns[p]) setMeshRenderOrder(ns[p], roBase + 25);
        }

        // Corners (fixed size).
        positionRect(ns.tl, win.x, win.y, c, c, frameZ);
        positionRect(ns.tr, win.x + win.w - c, win.y, c, c, frameZ);
        positionRect(ns.bl, win.x, win.y + h - c, c, c, frameZ);
        positionRect(ns.br, win.x + win.w - c, win.y + h - c, c, c, frameZ);
        // Edges (stretch one axis).
        positionRect(ns.top, win.x + c, win.y, Math.max(1, win.w - 2 * c), c, frameZ);
        positionRect(ns.bottom, win.x + c, win.y + h - c, Math.max(1, win.w - 2 * c), c, frameZ);
        positionRect(ns.left, win.x, win.y + c, c, Math.max(1, h - 2 * c), frameZ);
        positionRect(ns.right, win.x + win.w - c, win.y + c, c, Math.max(1, h - 2 * c), frameZ);
      } else {
        // Too small for 9-slice (e.g. collapsed) — hide all pieces.
        for (const p of HUD_NINE_SLICE_PIECE_NAMES) {
          if (ns[p]) ns[p].visible = false;
        }
      }
    }

    if (win.collapsed) {
      clearPlainTextMaybeTroika(objs.contentText, labelDot);
      clearColoredMultilineMaybeTroika(objs, labelDot);
      if (objs.contentBg) objs.contentBg.visible = false;
      if (objs.scrollTrack) objs.scrollTrack.visible = false;
      if (objs.scrollUpBtn) objs.scrollUpBtn.visible = false;
      if (objs.scrollDownBtn) objs.scrollDownBtn.visible = false;
      if (objs.scrollThumb) objs.scrollThumb.visible = false;
      if (Array.isArray(objs.rowBackgroundRects)) {
        for (const mesh of objs.rowBackgroundRects) {
          if (mesh) mesh.visible = false;
        }
      }
      if (Array.isArray(objs.actionButtonRects)) {
        for (const mesh of objs.actionButtonRects) {
          if (mesh) mesh.visible = false;
        }
      }
      if (Array.isArray(objs.actionButtonIcons)) {
        for (const mesh of objs.actionButtonIcons) {
          if (mesh) mesh.visible = false;
        }
      }
      if (Array.isArray(objs.actionButtonLabels)) {
        for (const label of objs.actionButtonLabels) {
          if (label?.mesh) label.mesh.visible = false;
        }
      }
      if (objs.footerDivider) objs.footerDivider.visible = false;
      if (Array.isArray(objs.footerActionButtonRects)) {
        for (const mesh of objs.footerActionButtonRects) {
          if (mesh) mesh.visible = false;
        }
      }
      if (Array.isArray(objs.footerActionButtonIcons)) {
        for (const mesh of objs.footerActionButtonIcons) {
          if (mesh) mesh.visible = false;
        }
      }
      if (Array.isArray(objs.footerActionButtonLabels)) {
        for (const label of objs.footerActionButtonLabels) {
          if (label?.mesh) label.mesh.visible = false;
        }
      }
      if (objs.titleDivider) objs.titleDivider.visible = false;
      if (objs.contentTextRare) objs.contentTextRare.mesh.visible = false;
      if (objs.contentTextSupreme)
        objs.contentTextSupreme.mesh.visible = false;
      if (objs.contentTextGood) objs.contentTextGood.mesh.visible = false;
      if (objs.contentTextWarn) objs.contentTextWarn.mesh.visible = false;
      return;
    }

    // For 9-slice windows the frame border is outside the content area.
    // Content rect is the inner region of the 9-slice; normal pad applies inside.
    const nsC = objs.nineSlice ? (objs.nineSlice.cornerSize || 24) : 0;
    const cx = win.x + nsC + pad;
    const cy = win.y + (nsC || effectiveTitleH) + pad;
    // Reserve space for scrollbar on scrollable windows so text never overlaps it.
    const scrollReserve = win.scrollable ? HUD_SCROLLBAR_RESERVED_WIDTH_PX : 0;
    const cw = win.w - nsC * 2 - pad * 2 - scrollReserve;
    const ch = h - (nsC ? nsC * 2 : effectiveTitleH) - pad * 2;

    function placeScrollbar(totalLines, visibleLines, scrollTop, scrollActive) {
      if (!objs.scrollTrack || !objs.scrollThumb) return;
      if (!scrollActive) {
        objs.scrollTrack.visible = false;
        if (objs.scrollUpBtn) objs.scrollUpBtn.visible = false;
        if (objs.scrollDownBtn) objs.scrollDownBtn.visible = false;
        objs.scrollThumb.visible = false;
        objs._scrollMetrics = null;
        return;
      }

      objs.scrollTrack.visible = true;
      if (objs.scrollUpBtn) objs.scrollUpBtn.visible = true;
      if (objs.scrollDownBtn) objs.scrollDownBtn.visible = true;
      objs.scrollThumb.visible = true;

      const trackX = win.x + win.w - nsC - HUD_SCROLLBAR_RIGHT_INSET_PX;
      const contentTopY = nsC || effectiveTitleH;
      const trackY = win.y + contentTopY + HUD_SCROLLBAR_TRACK_TOP_INSET_PX;
      const trackH = Math.max(0, h - contentTopY - HUD_SCROLLBAR_TRACK_TOP_INSET_PX - HUD_SCROLLBAR_TRACK_BOTTOM_INSET_PX - (nsC || 0));
      positionRect(
        objs.scrollTrack,
        trackX,
        trackY,
        HUD_SCROLLBAR_TRACK_WIDTH_PX,
        trackH,
        HUD_Z_SURFACE_RECESSED + lift
      );

      const arrowH = Math.min(HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX, Math.max(0, trackH / 2));
      const buttonX = trackX + 2;
      const buttonW = Math.max(0, HUD_SCROLLBAR_TRACK_WIDTH_PX - 4);
      const upButtonY = trackY + 2;
      const downButtonY = trackY + trackH - arrowH;
      const maxTop = Math.max(0, totalLines - visibleLines);
      const canUp = scrollTop > 0;
      const canDown = scrollTop < maxTop;

      if (objs.scrollUpBtn) {
        positionRect(objs.scrollUpBtn, buttonX, upButtonY, buttonW, Math.max(0, arrowH), HUD_Z_SURFACE_BG + lift);
        if (objs.scrollUpBtn.material) objs.scrollUpBtn.material.opacity = canUp ? 1 : 0.45;
      }
      if (objs.scrollDownBtn) {
        positionRect(objs.scrollDownBtn, buttonX, downButtonY, buttonW, Math.max(0, arrowH), HUD_Z_SURFACE_BG + lift);
        if (objs.scrollDownBtn.material) objs.scrollDownBtn.material.opacity = canDown ? 1 : 0.45;
      }

      const denom = Math.max(1, totalLines);
      const ratio = Math.min(1, Math.max(visibleLines / denom, 0));
      const thumbAreaTop = trackY + arrowH + 4;
      const thumbAreaH = Math.max(0, trackH - arrowH * 2 - 8);
      const thumbH = Math.max(HUD_SCROLLBAR_MIN_THUMB_HEIGHT_PX, Math.floor(thumbAreaH * ratio));
      const thumbMaxY = Math.max(0, thumbAreaH - thumbH);
      const frac = maxTop > 0 ? clamp(scrollTop / maxTop, 0, 1) : 0;
      const thumbY = thumbAreaTop + Math.round(frac * thumbMaxY);
      positionRect(
        objs.scrollThumb,
        trackX + 3,
        thumbY,
        Math.max(0, HUD_SCROLLBAR_TRACK_WIDTH_PX - 6),
        thumbH,
        HUD_Z_SURFACE_BG + lift
      );

      // Cache scroll metrics for input hit-testing/dragging.
      objs._scrollMetrics = {
        trackX,
        trackY,
        trackH,
        thumbAreaTop,
        thumbAreaH,
        thumbY,
        thumbH,
        arrowH,
        buttonX,
        buttonW,
        upButtonY,
        downButtonY,
        totalLines,
        visibleLines,
      };
    }

    // Content background block
    if (objs.contentBg) {
      if (nsC || isHotbar) {
        // 9-slice: the center piece IS the content background.
        // Hide the default contentBg to avoid an "inner skin" border.
        objs.contentBg.visible = false;
      } else {
        objs.contentBg.visible = true;
        positionRect(
          objs.contentBg,
          win.x + 1,
          win.y + effectiveTitleH,
          Math.max(0, win.w - 2),
          Math.max(0, h - effectiveTitleH - 1),
          HUD_Z_SURFACE_BG + lift
        );
      }
    }

    const maxVisibleLines = Math.max(1, Math.floor(ch / (12 * labelDot)));

    const _rlCtx = {
      win,
      objs,
      labelDot,
      cx,
      cy,
      cw,
      ch,
      maxVisibleLines,
      lift,
      placeScrollbar,
    };
    // Expose placeScrollbar so external overlay systems (e.g. card overlays)
    // can drive the scrollbar after the default content dispatch.
    objs._placeScrollbar = placeScrollbar;
    function renderList(entries, scrollPolicy, post) {
      renderListFn(_rlCtx, entries, scrollPolicy, post);
    }

    renderWindowContentFn({
      key, win, objs, labelDot, titleGlyphY, h, lift,
      cx, cy, cw, pad,
      renderList, renderOrderBaseFor, setMeshRenderOrder,
    });
  }

  return { renderWindow };
}
