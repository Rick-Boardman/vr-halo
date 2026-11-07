// SPDX-License-Identifier: Apache-2.0
/**
 * Render-list subsystem for HUD windows.
 *
 * Handles text wrapping, scroll management, Troika text rendering,
 * selection highlighting (with Troika caretPositions and fixed-metric fallback),
 * and text caret positioning for editor windows.
 *
 * @module hud-render-list-runtime
 */

import { HUD_TEXT_DEFAULT_COLOR } from "./hud-text-style.js";
import { HUD_SURFACE_ACCENT_COLOR } from "./hud-surface-style.js";
import { estimateTextWidthPx } from "./text-measurement.js";
import {
  HUD_TEXT_ASCENDER_NUDGE_FACTOR,
} from "./hud-layout-policy.js";

const HUD_FOOTER_ACTION_GAP_PX = 8;
const HUD_FOOTER_ACTION_BOTTOM_INSET_PX = 4;
const HUD_FOOTER_ACTION_SIDE_INSET_PX = 2;
const HUD_FOOTER_DIVIDER_GAP_PX = 8;
const HUD_FOOTER_DIVIDER_HEIGHT_PX = 1;

/**
 * Create the render-list runtime.
 *
 * @param {object} deps Stable factory dependencies.
 * @param {Function} deps.clamp Numeric clamp utility.
 * @param {Function} deps.wrapEntriesToLines Wraps text entries into display lines.
 * @param {Function} deps.parseHexColor Parses a hex color with a fallback.
 * @param {Function} deps.setColoredMultilineText Sets colored multiline text on Troika objects.
 * @param {Function} deps.positionRect Positions a rect mesh at layout coordinates.
 * @param {Function} deps.getSelectionRects Troika getSelectionRects(textRenderInfo, lo, hi).
 * @param {Function} deps.makeRect Creates a new colored rect mesh for the HUD.
 * @returns {{ renderList: Function }} The render-list function.
 */
export function createHudRenderListRuntime({
  clamp,
  wrapEntriesToLines,
  parseHexColor,
  setColoredMultilineText,
  positionRect,
  getSelectionRects,
  makeRect,
}) {

  /**
   * Render a scrollable list of text entries into a HUD window.
   *
   * @param {object} ctx Per-window rendering context.
   * @param {object} ctx.win Window state object (scrollTop, noWrap, scrollMode, _textSelection, _textCaret, etc.).
   * @param {object} ctx.objs Window object map (_troikaContentText, selectionRects, caret, _visibleLineMeta, _renderOrderBase, etc.).
   * @param {number} ctx.labelDot Text scale factor (px per dot).
   * @param {number} ctx.cx Content area X origin in layout px.
   * @param {number} ctx.cy Content area Y origin in layout px.
   * @param {number} ctx.cw Content area width in layout px.
  * @param {number} ctx.ch Content area height in layout px.
   * @param {number} ctx.maxVisibleLines Maximum visible text lines.
   * @param {number} ctx.lift Z-lift for window render ordering.
   * @param {Function} ctx.placeScrollbar Scrollbar positioning callback(totalLines, visibleLines, scrollTop, scrollActive).
  * @param {Array} entries Array of text entries (string or {text, color, toggleKey, hoverText, onClick, actionButtonText, actionButtonIconTexture, actionButtonOnClick}).
   * @param {string} scrollPolicy Scroll policy: "topElseEnd" or "endElseTop".
   * @param {Function} [post] Optional callback invoked after rendering.
   */
  function renderList(ctx, entries, scrollPolicy, post) {
    const {
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
    } = ctx;

    const noWrap = !!win.noWrap;
    const buildWrappedLines = (maxWidth) => noWrap
      ? (entries ?? []).map((e) => ({
          text: typeof e === "string" ? e : String(e?.text ?? ""),
          color: typeof e === "object" && e && e.color != null ? e.color : null,
          sourceText:
            typeof e === "object" && e && e.sourceText != null
              ? String(e.sourceText)
              : null,
          displayPrefixLength:
            typeof e === "object" && e && Number.isFinite(e.displayPrefixLength)
              ? Math.max(0, Math.floor(Number(e.displayPrefixLength)))
              : null,
          colorRanges:
            typeof e === "object" && e && Array.isArray(e.colorRanges)
              ? e.colorRanges
              : null,
          toggleKey: typeof e === "object" && e ? e.toggleKey ?? null : null,
          hoverText: typeof e === "object" && e ? e.hoverText ?? null : null,
          actionButtonText:
            typeof e === "object" && e && typeof e.actionButtonText === "string" && e.actionButtonText.trim()
              ? e.actionButtonText.trim()
              : null,
          actionButtonIconTexture:
            typeof e === "object" && e && e.actionButtonIconTexture != null
              ? e.actionButtonIconTexture
              : null,
          actionButtonHoverText:
            typeof e === "object" && e && typeof e.actionButtonHoverText === "string" && e.actionButtonHoverText.trim()
              ? e.actionButtonHoverText.trim()
              : null,
          actionButtonOnClick:
            typeof e === "object" && e && typeof e.actionButtonOnClick === "function"
              ? e.actionButtonOnClick
              : null,
          actionButtonWidthPx:
            typeof e === "object" && e && Number.isFinite(e.actionButtonWidthPx)
              ? Number(e.actionButtonWidthPx)
              : null,
          actionButtonTextColor:
            typeof e === "object" && e && typeof e.actionButtonTextColor === "number"
              ? e.actionButtonTextColor
              : null,
          actionButtonBgColor:
            typeof e === "object" && e && typeof e.actionButtonBgColor === "number"
              ? e.actionButtonBgColor
              : null,
          actionButtonBgOpacity:
            typeof e === "object" && e && Number.isFinite(e.actionButtonBgOpacity)
              ? Number(e.actionButtonBgOpacity)
              : null,
          actionButtonSourceText:
            typeof e === "object" && e && e.actionButtonSourceText != null
              ? String(e.actionButtonSourceText)
              : null,
          actionButtonDisplayPrefixLength:
            typeof e === "object" && e && Number.isFinite(e.actionButtonDisplayPrefixLength)
              ? Math.max(0, Math.floor(Number(e.actionButtonDisplayPrefixLength)))
              : null,
          actionButtonTextInsetPx:
            typeof e === "object" && e && Number.isFinite(e.actionButtonTextInsetPx)
              ? Number(e.actionButtonTextInsetPx)
              : null,
          actionButtonForceVisible:
            typeof e === "object" && e && e.actionButtonForceVisible === true,
          rowBgColor:
            typeof e === "object" && e && typeof e.rowBgColor === "number"
              ? e.rowBgColor
              : null,
          rowBgOpacity:
            typeof e === "object" && e && Number.isFinite(e.rowBgOpacity)
              ? Number(e.rowBgOpacity)
              : null,
          rowHeightPx:
            typeof e === "object" && e && Number.isFinite(e.rowHeightPx)
              ? Number(e.rowHeightPx)
              : null,
        }))
      : wrapEntriesToLines({
          entries,
          dot: labelDot,
          maxWidth,
          defaultColor: HUD_TEXT_DEFAULT_COLOR,
        });

    const effectiveCw = Math.max(0, Number(cw) || 0);
    const effectiveCh = Math.max(0, Number(ch) || 0);
    const lineH = 12 * labelDot;
    const footerActions = normalizeFooterActions(win?._footerEntries);
    const footerButtonH = footerActions.length ? Math.max(14, Math.floor(lineH * 1.35)) : 0;
    const footerReservedHeight = footerActions.length
      ? footerButtonH + HUD_FOOTER_ACTION_BOTTOM_INSET_PX + HUD_FOOTER_DIVIDER_GAP_PX + HUD_FOOTER_DIVIDER_HEIGHT_PX
      : 0;
    win._footerReservedHeightPx = footerReservedHeight;
    const wrappedAll = buildWrappedLines(effectiveCw);
    const totalLines = wrappedAll.length;
    const availableContentHeight = Math.max(0, effectiveCh - footerReservedHeight);
    const useMeasuredContentHeight = effectiveCh > 0;
    const resolveRowHeight = (entry) => {
      if (entry && typeof entry === "object" && Number.isFinite(entry.rowHeightPx)) {
        return Math.max(1, Math.floor(Number(entry.rowHeightPx)));
      }
      return lineH;
    };
    const computeVisibleLineCount = (startIndex) => {
      if (!totalLines) return 0;
      let usedHeight = 0;
      let visibleCount = 0;
      for (let index = startIndex; index < totalLines; index += 1) {
        const rowHeight = resolveRowHeight(wrappedAll[index]);
        if (visibleCount > 0 && availableContentHeight > 0 && usedHeight + rowHeight > availableContentHeight) {
          break;
        }
        usedHeight += rowHeight;
        visibleCount += 1;
        if (availableContentHeight <= 0) break;
      }
      return Math.max(1, visibleCount);
    };
    const baseVisibleLines = useMeasuredContentHeight
      ? Math.max(1, computeVisibleLineCount(0))
      : Math.min(maxVisibleLines, Math.max(1, totalLines));
    let visibleLines = Math.min(baseVisibleLines, Math.max(1, totalLines));

    // If an external system (e.g. card overlays) owns scroll state for this
    // window, skip the scroll-top clamp and total/visible bookkeeping so the
    // external system's values are preserved between frames.
    if (!win._externalScrollControl) {
      const maxTop = Math.max(0, totalLines - visibleLines);
      if (win.scrollMode !== "manual") {
        win.scrollTop =
          scrollPolicy === "topElseEnd"
            ? win.scrollMode === "top"
              ? 0
              : maxTop
            : win.scrollMode === "end"
            ? maxTop
            : 0;
      }
      win.scrollTop = clamp(win.scrollTop ?? 0, 0, maxTop);
      visibleLines = useMeasuredContentHeight
        ? Math.max(1, computeVisibleLineCount(win.scrollTop))
        : Math.min(maxVisibleLines, Math.max(1, totalLines - win.scrollTop));
      win._scrollTotalLines = totalLines;
      win._scrollVisibleLines = visibleLines;
    }

    const slice = wrappedAll.slice(
      win.scrollTop,
      win.scrollTop + visibleLines
    );
    const displayTexts = slice.map((entry) => (typeof entry === "string" ? entry : String(entry?.text ?? "")));
    const sourceTexts = slice.map((entry, index) => {
      if (entry && typeof entry === "object" && entry.sourceText != null) {
        return String(entry.sourceText);
      }
      return displayTexts[index] ?? "";
    });
    const displayPrefixLengths = slice.map((entry, index) => {
      if (entry && typeof entry === "object" && Number.isFinite(entry.displayPrefixLength)) {
        return clamp(Math.max(0, Math.floor(Number(entry.displayPrefixLength))), 0, displayTexts[index]?.length ?? 0);
      }
      return Math.max(0, (displayTexts[index]?.length ?? 0) - (sourceTexts[index]?.length ?? 0));
    });
    const rowHeights = slice.map((entry) => {
      return resolveRowHeight(entry);
    });
    const rowTops = [];
    let rowTopAcc = 0;
    for (const rowHeight of rowHeights) {
      rowTops.push(rowTopAcc);
      rowTopAcc += rowHeight;
    }
    objs._visibleLineMeta = slice.map((l) => ({
      toggleKey: l.toggleKey ?? null,
      text: String(l.text ?? ""),
      sourceText: null,
      displayPrefixLength: 0,
      color: l.color ?? null,
      hoverText: l.hoverText ?? null,
      onClick: typeof l.onClick === "function" ? l.onClick : null,
      rowTopPx: 0,
      rowHeightPx: lineH,
      actionButton:
        typeof l.actionButtonOnClick === "function"
        && ((typeof l.actionButtonText === "string" && l.actionButtonText.trim()) || l.actionButtonIconTexture != null || l.actionButtonForceVisible === true)
          ? {
              text: typeof l.actionButtonText === "string" ? l.actionButtonText.trim() : "",
              iconTexture: l.actionButtonIconTexture ?? null,
              hoverText:
                typeof l.actionButtonHoverText === "string" && l.actionButtonHoverText.trim()
                  ? l.actionButtonHoverText.trim()
                  : null,
              onClick: l.actionButtonOnClick,
              widthPx: Number.isFinite(l.actionButtonWidthPx) ? Number(l.actionButtonWidthPx) : null,
              textColor: typeof l.actionButtonTextColor === "number" ? l.actionButtonTextColor : null,
              bgColor: typeof l.actionButtonBgColor === "number" ? l.actionButtonBgColor : null,
              bgOpacity: Number.isFinite(l.actionButtonBgOpacity) ? Number(l.actionButtonBgOpacity) : null,
              sourceText: l.actionButtonSourceText != null ? String(l.actionButtonSourceText) : null,
              displayPrefixLength: Number.isFinite(l.actionButtonDisplayPrefixLength)
                ? Math.max(0, Math.floor(Number(l.actionButtonDisplayPrefixLength)))
                : 0,
              textInsetPx: Number.isFinite(l.actionButtonTextInsetPx) ? Number(l.actionButtonTextInsetPx) : null,
              iconFitMode:
                typeof l.actionButtonIconFitMode === "string" && l.actionButtonIconFitMode.trim()
                  ? l.actionButtonIconFitMode.trim()
                  : null,
              x: null,
              y: null,
              w: null,
              h: null,
              textX: null,
              textY: null,
              dot: null,
              labelObject: null,
            }
          : null,
    }));
    for (let index = 0; index < objs._visibleLineMeta.length; index += 1) {
      const meta = objs._visibleLineMeta[index];
      if (!meta) continue;
      meta.sourceText = sourceTexts[index] ?? meta.text;
      meta.displayPrefixLength = displayPrefixLengths[index] ?? 0;
      meta.rowTopPx = rowTops[index] ?? index * lineH;
      meta.rowHeightPx = rowHeights[index] ?? lineH;
    }

    function hideRowBackgrounds() {
      if (!Array.isArray(objs.rowBackgroundRects)) return;
      for (const mesh of objs.rowBackgroundRects) {
        if (mesh) mesh.visible = false;
      }
    }

    function hideActionButtons() {
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
    }

    function hideFooterActionButtons() {
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
      objs._footerActionMeta = [];
    }

    function ensureRowBackgroundCount(count) {
      const want = Math.max(0, Math.floor(Number(count) || 0));
      if (!Array.isArray(objs.rowBackgroundRects)) objs.rowBackgroundRects = [];
      while (objs.rowBackgroundRects.length < want) {
        const mesh = makeRect({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: 0x1e2a3a,
          opacity: 0.82,
          z: 0.0033,
          order: 18,
        });
        mesh.visible = false;
        try {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.needsUpdate = true;
        } catch {
          // no-op
        }
        objs.rowBackgroundRects.push(mesh);
      }
    }

    function ensureActionButtonCount(count) {
      const want = Math.max(0, Math.floor(Number(count) || 0));
      const TextCtor = objs?._troikaContentText?.constructor ?? objs?.contentText?.constructor ?? null;
      if (!Array.isArray(objs.actionButtonRects)) objs.actionButtonRects = [];
      if (!Array.isArray(objs.actionButtonIcons)) objs.actionButtonIcons = [];
      if (!Array.isArray(objs.actionButtonLabels)) objs.actionButtonLabels = [];
      while (objs.actionButtonRects.length < want) {
        const mesh = makeRect({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: 0xa14a4a,
          opacity: 0.94,
          z: 0.00345,
          order: 19,
        });
        mesh.visible = false;
        try {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.needsUpdate = true;
        } catch {
          // no-op
        }
        objs.actionButtonRects.push(mesh);
      }
      while (objs.actionButtonIcons.length < want) {
        const mesh = makeRect({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: 0xffffff,
          opacity: 1,
          z: 0.0036,
          order: 20,
        });
        mesh.visible = false;
        try {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.needsUpdate = true;
        } catch {
          // no-op
        }
        objs.actionButtonIcons.push(mesh);
      }
      while (objs.actionButtonLabels.length < want) {
        let label = null;
        if (TextCtor) {
          try {
            label = new TextCtor({ color: 0xffffff, z: 0.00365, depthTest: false });
            if (label?.mesh) label.mesh.visible = false;
          } catch {
            label = null;
          }
        }
        objs.actionButtonLabels.push(label);
      }
    }

    function ensureFooterActionButtonCount(count) {
      const want = Math.max(0, Math.floor(Number(count) || 0));
      const TextCtor = objs?._troikaContentText?.constructor ?? objs?.contentText?.constructor ?? null;
      if (!Array.isArray(objs.footerActionButtonRects)) objs.footerActionButtonRects = [];
      if (!Array.isArray(objs.footerActionButtonIcons)) objs.footerActionButtonIcons = [];
      if (!Array.isArray(objs.footerActionButtonLabels)) objs.footerActionButtonLabels = [];
      while (objs.footerActionButtonRects.length < want) {
        const mesh = makeRect({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: 0x5d6675,
          opacity: 0.94,
          z: 0.00345,
          order: 19,
        });
        mesh.visible = false;
        try {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.needsUpdate = true;
        } catch {
          // no-op
        }
        objs.footerActionButtonRects.push(mesh);
      }
      while (objs.footerActionButtonIcons.length < want) {
        const mesh = makeRect({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          color: 0xffffff,
          opacity: 1,
          z: 0.0036,
          order: 20,
        });
        mesh.visible = false;
        try {
          mesh.material.depthTest = false;
          mesh.material.depthWrite = false;
          mesh.material.needsUpdate = true;
        } catch {
          // no-op
        }
        objs.footerActionButtonIcons.push(mesh);
      }
      while (objs.footerActionButtonLabels.length < want) {
        let label = null;
        if (TextCtor) {
          try {
            label = new TextCtor({ color: 0xffffff, z: 0.00365, depthTest: false });
            if (label?.mesh) label.mesh.visible = false;
          } catch {
            label = null;
          }
        }
        objs.footerActionButtonLabels.push(label);
      }
    }

    function ensureFooterDivider() {
      if (objs.footerDivider) return objs.footerDivider;
      const divider = makeRect({
        x: 0,
        y: 0,
        w: 1,
        h: HUD_FOOTER_DIVIDER_HEIGHT_PX,
        color: HUD_SURFACE_ACCENT_COLOR,
        opacity: 0.24,
        z: 0.00334,
        order: 18,
      });
      divider.visible = false;
      try {
        divider.material.depthTest = false;
        divider.material.depthWrite = false;
        divider.material.needsUpdate = true;
      } catch {
        // no-op
      }
      objs.footerDivider = divider;
      return divider;
    }

    function syncButtonIconMesh(mesh, texture, renderOrder) {
      if (!mesh) return;
      try {
        if (mesh.material?.map !== texture) {
          mesh.material.map = texture ?? null;
          mesh.material.needsUpdate = true;
        }
        if (mesh.material?.color) mesh.material.color.setHex(0xffffff);
        if (mesh.material) mesh.material.opacity = texture ? 1 : 0;
        mesh.renderOrder = renderOrder;
      } catch {
        // no-op
      }
    }

    function positionButtonIcon(mesh, buttonX, buttonY, buttonW, buttonH, z) {
      if (!mesh) return;
      if (mesh.userData?.fitMode === "fill") {
        positionRect(mesh, buttonX, buttonY, buttonW, buttonH, z);
        mesh.visible = true;
        return;
      }
      const texture = mesh.material?.map ?? null;
      const sourceWidth = Number(texture?.image?.width);
      const sourceHeight = Number(texture?.image?.height);
      const maxWidth = Math.max(10, buttonW - 8);
      const maxHeight = Math.max(10, buttonH - 6);

      let iconWidth = Math.max(10, Math.min(maxWidth, maxHeight));
      let iconHeight = iconWidth;

      if (Number.isFinite(sourceWidth) && sourceWidth > 0 && Number.isFinite(sourceHeight) && sourceHeight > 0) {
        const aspectRatio = sourceWidth / sourceHeight;
        if (aspectRatio >= 1) {
          iconWidth = maxWidth;
          iconHeight = iconWidth / aspectRatio;
          if (iconHeight > maxHeight) {
            iconHeight = maxHeight;
            iconWidth = iconHeight * aspectRatio;
          }
        } else {
          iconHeight = maxHeight;
          iconWidth = iconHeight * aspectRatio;
          if (iconWidth > maxWidth) {
            iconWidth = maxWidth;
            iconHeight = iconWidth / aspectRatio;
          }
        }
      }

      const finalWidth = Math.max(10, Math.min(maxWidth, iconWidth));
      const finalHeight = Math.max(10, Math.min(maxHeight, iconHeight));
      const iconX = buttonX + Math.max(0, Math.floor((buttonW - finalWidth) / 2));
      const iconY = buttonY + Math.max(0, Math.floor((buttonH - finalHeight) / 2));
      positionRect(mesh, iconX, iconY, finalWidth, finalHeight, z);
      mesh.visible = true;
    }

    function positionTrailingButtonIcon(mesh, buttonX, buttonY, buttonW, buttonH, z) {
      if (!mesh) return 0;
      const iconSlotW = Math.max(14, Math.min(buttonW, Math.min(28, buttonH + 2)));
      const iconX = buttonX + Math.max(0, buttonW - iconSlotW);
      positionRect(mesh, iconX, buttonY, iconSlotW, buttonH, z);
      mesh.visible = true;
      return iconSlotW + 4;
    }

    try {
      const rowInsetX = 2;
      const rowInsetY = 1;
      const rows = slice
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => typeof entry?.rowBgColor === "number");

      if (!rows.length || effectiveCw <= rowInsetX * 2) {
        hideRowBackgrounds();
      } else {
        ensureRowBackgroundCount(rows.length);
        const roBase = Number.isFinite(objs?._renderOrderBase)
          ? Math.floor(objs._renderOrderBase)
          : 0;
        for (let rowIndex = 0; rowIndex < objs.rowBackgroundRects.length; rowIndex += 1) {
          const mesh = objs.rowBackgroundRects[rowIndex];
          const row = rows[rowIndex];
          if (!mesh || !row) {
            if (mesh) mesh.visible = false;
            continue;
          }

          const bgColor = Number(row.entry.rowBgColor) >>> 0;
          const bgOpacity = Number.isFinite(row.entry.rowBgOpacity)
            ? Number(row.entry.rowBgOpacity)
            : 0.82;
          try {
            if (mesh.material?.color) mesh.material.color.setHex(bgColor);
            if (mesh.material) mesh.material.opacity = bgOpacity;
            mesh.renderOrder = roBase + 18;
          } catch {
            // no-op
          }

          positionRect(
            mesh,
            cx + rowInsetX,
            cy + (rowTops[row.index] ?? row.index * lineH) + rowInsetY,
            Math.max(0, effectiveCw - rowInsetX * 2),
            Math.max(6, (rowHeights[row.index] ?? lineH) - rowInsetY * 2),
            0.0033 + lift
          );
          mesh.visible = true;
        }
      }
    } catch {
      hideRowBackgrounds();
    }

    try {
      const actionRows = objs._visibleLineMeta
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.actionButton && typeof entry.actionButton.onClick === "function");

      if (!actionRows.length || effectiveCw <= 18) {
        hideActionButtons();
      } else {
        ensureActionButtonCount(actionRows.length);
        const roBase = Number.isFinite(objs?._renderOrderBase)
          ? Math.floor(objs._renderOrderBase)
          : 0;
        const buttonDot = Math.max(1, labelDot * 0.85);
        for (let rowIndex = 0; rowIndex < objs.actionButtonRects.length; rowIndex += 1) {
          const mesh = objs.actionButtonRects[rowIndex];
          const icon = objs.actionButtonIcons?.[rowIndex] ?? null;
          const label = objs.actionButtonLabels[rowIndex];
          const row = actionRows[rowIndex];
          if (!mesh || !row) {
            if (mesh) mesh.visible = false;
            if (icon) icon.visible = false;
            if (label?.mesh) label.mesh.visible = false;
            continue;
          }

          const button = row.entry.actionButton;
          const rowHeight = rowHeights[row.index] ?? lineH;
          const rowTop = rowTops[row.index] ?? row.index * lineH;
          const hasButtonText = typeof button.text === "string" && button.text.length > 0;
          const buttonW = Math.max(18, Math.min(effectiveCw - 2, Number.isFinite(button.widthPx) ? Number(button.widthPx) : 24));
          const buttonH = Math.max(8, rowHeight - 4);
          const buttonX = cx + Math.max(0, effectiveCw - buttonW - 2);
          const buttonY = cy + rowTop + Math.max(1, Math.floor((rowHeight - buttonH) / 2));

          try {
            if (mesh.material?.color) mesh.material.color.setHex(
              typeof button.bgColor === "number" ? Number(button.bgColor) >>> 0 : 0xa14a4a
            );
            if (mesh.material) {
              mesh.material.opacity = Number.isFinite(button.bgOpacity) ? Number(button.bgOpacity) : 0.94;
            }
            mesh.renderOrder = roBase + 19;
          } catch {
            // no-op
          }

          positionRect(mesh, buttonX, buttonY, buttonW, buttonH, 0.00345 + lift);
          mesh.visible = true;

          if (button.iconTexture) {
            syncButtonIconMesh(icon, button.iconTexture, roBase + 20);
            if (icon?.userData) {
              icon.userData.fitMode = button.iconFitMode;
            }
            if (hasButtonText) {
              button._trailingIconReservedWidth = positionTrailingButtonIcon(icon, buttonX, buttonY, buttonW, buttonH, 0.00358 + lift);
            } else {
              button._trailingIconReservedWidth = 0;
              positionButtonIcon(icon, buttonX, buttonY, buttonW, buttonH, 0.00358 + lift);
            }
          } else {
            if (icon) icon.visible = false;
            button._trailingIconReservedWidth = 0;
          }

          const textInsetPx = Number.isFinite(button.textInsetPx)
            ? clamp(Number(button.textInsetPx), 4, Math.max(4, buttonW - 4))
            : null;
          const textX = buttonX + (textInsetPx != null ? textInsetPx : Math.max(4, Math.floor(buttonW * 0.28)));
          const textY = buttonY + 1;
          button.textX = textX;
          button.textY = textY;
          button.dot = buttonDot;

          if (hasButtonText && label?.setRenderOrder && label?.setText) {
            try {
              const textMaxWidth = textInsetPx != null
                ? Math.max(6, buttonW - textInsetPx - 4 - Math.max(0, Number(button._trailingIconReservedWidth) || 0))
                : Math.max(6, buttonW - 8 - Math.max(0, Number(button._trailingIconReservedWidth) || 0));
              label.setRenderOrder(roBase + 20);
              label.setText({
                text: String(button.text ?? ""),
                x: textX,
                y: textY,
                dot: buttonDot,
                color: typeof button.textColor === "number" ? Number(button.textColor) >>> 0 : 0xffffff,
                maxWidth: textMaxWidth,
                truncateSingleLine: true,
              });
              if (label?.mesh) label.mesh.visible = true;
              button.labelObject = label;
            } catch {
              if (label?.mesh) label.mesh.visible = false;
            }
          } else if (label?.mesh) {
            label.mesh.visible = false;
            button.labelObject = null;
          }

          row.entry.actionButton.x = buttonX;
          row.entry.actionButton.y = buttonY;
          row.entry.actionButton.w = buttonW;
          row.entry.actionButton.h = buttonH;
        }
      }
    } catch {
      hideActionButtons();
    }

    try {
      if (!footerActions.length || effectiveCw <= 40) {
        hideFooterActionButtons();
      } else {
        ensureFooterActionButtonCount(footerActions.length);
        const roBase = Number.isFinite(objs?._renderOrderBase)
          ? Math.floor(objs._renderOrderBase)
          : 0;
        const buttonDot = Math.max(1, labelDot * 0.85);
        const widths = footerActions.map((button) => {
          const preferred = Number.isFinite(button.widthPx) ? Number(button.widthPx) : 72;
          return Math.max(56, Math.min(Math.max(56, effectiveCw - 2), preferred));
        });
        const totalButtonWidth = widths.reduce((sum, width) => sum + width, 0)
          + Math.max(0, footerActions.length - 1) * HUD_FOOTER_ACTION_GAP_PX;
        const startX = cx + Math.max(0, effectiveCw - totalButtonWidth - HUD_FOOTER_ACTION_SIDE_INSET_PX);
        const buttonY = cy + Math.max(0, effectiveCh - footerButtonH - HUD_FOOTER_ACTION_BOTTOM_INSET_PX);
        const dividerY = Math.max(cy, buttonY - HUD_FOOTER_DIVIDER_GAP_PX);
        const divider = ensureFooterDivider();

        try {
          divider.renderOrder = roBase + 18;
        } catch {
          // no-op
        }
        positionRect(
          divider,
          cx,
          dividerY,
          Math.max(0, effectiveCw),
          HUD_FOOTER_DIVIDER_HEIGHT_PX,
          0.00334 + lift
        );
        divider.visible = true;

        let nextX = startX;
        objs._footerActionMeta = [];
        for (let index = 0; index < objs.footerActionButtonRects.length; index += 1) {
          const mesh = objs.footerActionButtonRects[index];
          const icon = objs.footerActionButtonIcons?.[index] ?? null;
          const label = objs.footerActionButtonLabels[index];
          const button = footerActions[index];
          const buttonW = widths[index];
          const hasButtonText = typeof button?.text === "string" && button.text.length > 0;
          if (!mesh || !button) {
            if (mesh) mesh.visible = false;
            if (icon) icon.visible = false;
            if (label?.mesh) label.mesh.visible = false;
            continue;
          }

          try {
            if (mesh.material?.color) mesh.material.color.setHex(
              typeof button.bgColor === "number" ? Number(button.bgColor) >>> 0 : 0x5d6675
            );
            if (mesh.material) {
              mesh.material.opacity = Number.isFinite(button.bgOpacity) ? Number(button.bgOpacity) : 0.94;
            }
            mesh.renderOrder = roBase + 19;
          } catch {
            // no-op
          }

          positionRect(mesh, nextX, buttonY, buttonW, footerButtonH, 0.00345 + lift);
          mesh.visible = true;

          if (button.iconTexture) {
            syncButtonIconMesh(icon, button.iconTexture, roBase + 20);
            if (icon?.userData) {
              icon.userData.fitMode = button.iconFitMode;
            }
            if (hasButtonText) {
              button._trailingIconReservedWidth = positionTrailingButtonIcon(icon, nextX, buttonY, buttonW, footerButtonH, 0.00358 + lift);
            } else {
              button._trailingIconReservedWidth = 0;
              positionButtonIcon(icon, nextX, buttonY, buttonW, footerButtonH, 0.00358 + lift);
            }
          } else {
            if (icon) icon.visible = false;
            button._trailingIconReservedWidth = 0;
          }

          const textInset = Number.isFinite(button.textInsetPx)
            ? clamp(Number(button.textInsetPx), 4, Math.max(4, buttonW - 4))
            : Math.max(4, Math.floor(buttonW * 0.28));
          const textX = nextX + textInset;
          const textY = buttonY + Math.max(1, Math.floor((footerButtonH - lineH) * 0.25));
          if (hasButtonText && label?.setRenderOrder && label?.setText) {
            try {
              label.setRenderOrder(roBase + 20);
              label.setText({
                text: String(button.text ?? ""),
                x: textX,
                y: textY,
                dot: buttonDot,
                color: typeof button.textColor === "number" ? Number(button.textColor) >>> 0 : 0xffffff,
                maxWidth: Math.max(6, buttonW - textInset - 4 - Math.max(0, Number(button._trailingIconReservedWidth) || 0)),
                truncateSingleLine: true,
              });
              if (label?.mesh) label.mesh.visible = true;
            } catch {
              if (label?.mesh) label.mesh.visible = false;
            }
          } else if (label?.mesh) {
            label.mesh.visible = false;
          }

          objs._footerActionMeta.push({
            text: button.text,
            sourceText: typeof button.sourceText === "string" ? button.sourceText : String(button.text ?? ""),
            onClick: button.onClick,
            hoverText: button.hoverText,
            x: nextX,
            y: buttonY,
            w: buttonW,
            h: footerButtonH,
            textX,
            textY,
            dot: buttonDot,
            labelObject: label,
          });

          nextX += buttonW + HUD_FOOTER_ACTION_GAP_PX;
        }
      }
    } catch {
      hideFooterActionButtons();
    }

    // Selection colorRanges for Troika base layer.
    // Must be applied during the main draw; otherwise the next frame's draw
    // overwrites colorRanges and selection appears to flicker.
    let selectionColorRanges = null;
    try {
      const sel = win._textSelection;
      if (sel && sel.visible && sel.target !== "actionButton" && sel.target !== "footer" && Array.isArray(slice)) {
        const starts = new Array(displayTexts.length);
        let acc = 0;
        for (let i = 0; i < displayTexts.length; i++) {
          starts[i] = acc;
          acc += displayTexts[i].length;
          if (i < displayTexts.length - 1) acc += 1; // newline
        }
        const totalTextLen = acc;

        const rowToLocalIndex = (row, col) => {
          const r = Math.floor(Number(row));
          const c = Math.floor(Number(col));
          if (!Number.isFinite(r)) return 0;
          const localRow = r - win.scrollTop;
          if (localRow < 0) return 0;
          if (localRow >= displayTexts.length) return totalTextLen;
          const line = sourceTexts[localRow] ?? displayTexts[localRow] ?? "";
          const prefix = displayPrefixLengths[localRow] ?? 0;
          const cc = clamp(Number.isFinite(c) ? c : 0, 0, line.length);
          return (starts[localRow] ?? 0) + prefix + cc;
        };

        const startI = rowToLocalIndex(sel.startRow, sel.startCol);
        const endI = rowToLocalIndex(sel.endRow, sel.endCol);
        const a = clamp(startI, 0, totalTextLen);
        const b = clamp(endI, 0, totalTextLen);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (hi > lo) {
          const tc = parseHexColor(sel.textColor, 0xffffff);
          selectionColorRanges = [{ start: lo, end: hi, color: tc }];
        }
      }
    } catch {
      selectionColorRanges = null;
    }

    setColoredMultilineText({
      objs,
      entries: slice,
      x: cx,
      y: cy,
      dot: labelDot,
      // Entries are already wrapped against the content width above. Leave the
      // Troika draw unconstrained so the scrollbar gutter does not steal a
      // second column of width from the rendered text.
      maxWidth: null,
      defaultColor: HUD_TEXT_DEFAULT_COLOR,
      colorRanges: selectionColorRanges,
    });

    // Selection highlight (editor windows only).
    // Uses Troika textRenderInfo caretPositions so highlight aligns with glyphs.
    try {
      const sel = win._textSelection;

      const troikaText = objs?._troikaContentText?._textMesh;
      const tri = troikaText?.textRenderInfo;

      const hideAll = () => {
        if (!Array.isArray(objs.selectionRects)) return;
        for (const r of objs.selectionRects) {
          try {
            if (r) r.visible = false;
          } catch {
            // no-op
          }
        }
      };

      const ensureCount = (n) => {
        const want = Math.max(0, Math.floor(Number(n) || 0));
        if (!Array.isArray(objs.selectionRects)) objs.selectionRects = [];
        while (objs.selectionRects.length < want) {
          const r = makeRect({
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            color: HUD_SURFACE_ACCENT_COLOR,
            opacity: 0.8,
            z: 0.00395,
            order: 29,
          });
          r.visible = false;
          try {
            r.material.depthTest = false;
            r.material.depthWrite = false;
            r.material.needsUpdate = true;
          } catch {
            // no-op
          }
          objs.selectionRects.push(r);
        }
      };

      if (!sel || !sel.visible || !Array.isArray(slice)) {
        hideAll();
      } else if (sel.target === "actionButton") {
        const row = Math.floor(Number(sel.startRow));
        const endRow = Math.floor(Number(sel.endRow));
        const localRow = row - win.scrollTop;
        const button = localRow >= 0 && localRow < objs._visibleLineMeta.length
          ? objs._visibleLineMeta[localRow]?.actionButton ?? null
          : null;
        const sourceText = String(button?.sourceText ?? button?.text ?? "");
        const dot = Number.isFinite(button?.dot) ? Number(button.dot) : Math.max(1, labelDot * 0.85);
        const textX = Number.isFinite(button?.textX)
          ? Number(button.textX)
          : Number(button?.x ?? 0) + Math.max(4, Math.floor(Number(button?.w ?? 24) * 0.28));
        const textY = Number.isFinite(button?.textY)
          ? Number(button.textY)
          : Number(button?.y ?? 0) + 1;

        if (!button || !Number.isFinite(row) || row !== endRow) {
          hideAll();
        } else {
          const lo = clamp(Math.min(Number(sel.startCol) || 0, Number(sel.endCol) || 0), 0, sourceText.length);
          const hi = clamp(Math.max(Number(sel.startCol) || 0, Number(sel.endCol) || 0), 0, sourceText.length);
          if (hi <= lo) {
            hideAll();
          } else {
            let rects = null;
            try {
              const tri = button.labelObject?._textMesh?.textRenderInfo;
              if (tri && tri.caretPositions) rects = getSelectionRects(tri, lo, hi) ?? [];
            } catch {
              rects = null;
            }

            let fallback = null;
            if (!Array.isArray(rects) || rects.length === 0) {
              const charW = 6 * dot;
              const lineH = 12 * dot;
              const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
              fallback = [{
                x: textX + lo * charW,
                y: textY - topNudge,
                w: Math.max(1, (hi - lo) * charW),
                h: lineH,
              }];
            }

            const want = Array.isArray(rects) && rects.length ? rects.length : Array.isArray(fallback) ? fallback.length : 0;
            ensureCount(want);

            const col = parseHexColor(sel.color, HUD_SURFACE_ACCENT_COLOR);
            const op = sel.opacity != null ? Number(sel.opacity) : 0.8;

            for (let i = 0; i < objs.selectionRects.length; i++) {
              const mesh = objs.selectionRects[i];
              if (!mesh) continue;
              try {
                const roBase = Number(objs?._renderOrderBase);
                if (Number.isFinite(roBase)) mesh.renderOrder = roBase + 29;
              } catch {
                // no-op
              }

              const rr = Array.isArray(rects) && rects.length ? rects[i] : null;
              const fr = Array.isArray(fallback) && fallback.length ? fallback[i] : null;
              if (!rr && !fr) {
                mesh.visible = false;
                continue;
              }

              let x0;
              let y0;
              let wpx;
              let hpx;
              if (rr) {
                const left = Number(rr.left);
                const right = Number(rr.right);
                const top = Number(rr.top);
                const bottom = Number(rr.bottom);
                if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
                  mesh.visible = false;
                  continue;
                }
                wpx = Math.max(1, right - left);
                hpx = Math.max(1, top - bottom);
                x0 = textX + left;
                const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
                y0 = textY - top - topNudge;
              } else {
                x0 = Number(fr.x);
                y0 = Number(fr.y);
                wpx = Math.max(1, Number(fr.w));
                hpx = Math.max(1, Number(fr.h));
              }

              try {
                if (mesh.material?.color) mesh.material.color.setHex(col);
              } catch {
                // no-op
              }
              try {
                if (mesh.material) mesh.material.opacity = op;
              } catch {
                // no-op
              }
              positionRect(mesh, x0, y0, wpx, hpx, 0.00395 + lift);
              mesh.visible = true;
            }
          }
        }
      } else {
        const starts = new Array(displayTexts.length);
        let acc = 0;
        for (let i = 0; i < displayTexts.length; i++) {
          starts[i] = acc;
          acc += displayTexts[i].length;
          if (i < displayTexts.length - 1) acc += 1; // newline
        }
        const totalTextLen = acc;

        const rowToLocalIndex = (row, col) => {
          const r = Math.floor(Number(row));
          const c = Math.floor(Number(col));
          if (!Number.isFinite(r)) return 0;
          const localRow = r - win.scrollTop;
          if (localRow < 0) {
            // Clamp above visible to start.
            return 0;
          }
          if (localRow >= displayTexts.length) {
            // Clamp below visible to end.
            return totalTextLen;
          }
          const line = sourceTexts[localRow] ?? displayTexts[localRow] ?? "";
          const cc = clamp(Number.isFinite(c) ? c : 0, 0, line.length);
          return (starts[localRow] ?? 0) + cc;
        };

        const startI = rowToLocalIndex(sel.startRow, sel.startCol);
        const endI = rowToLocalIndex(sel.endRow, sel.endCol);
        const a = clamp(startI, 0, totalTextLen);
        const b = clamp(endI, 0, totalTextLen);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (hi <= lo) {
          hideAll();
        } else {
          let rects = null;
          try {
            if (tri && tri.caretPositions) rects = getSelectionRects(tri, lo, hi) ?? [];
          } catch {
            rects = null;
          }

          // Fallback when Troika layout info isn't ready (e.g. during async sync).
          // This uses fixed metrics so selection stays visible rather than flashing.
          let fallback = null;
          if (!Array.isArray(rects) || rects.length === 0) {
            try {
              const isBefore = (r1, c1, r2, c2) => {
                const rr1 = Math.floor(Number(r1));
                const cc1 = Math.floor(Number(c1));
                const rr2 = Math.floor(Number(r2));
                const cc2 = Math.floor(Number(c2));
                if (rr1 < rr2) return true;
                if (rr1 > rr2) return false;
                return cc1 <= cc2;
              };

              const sr = isBefore(sel.startRow, sel.startCol, sel.endRow, sel.endCol) ? sel.startRow : sel.endRow;
              const sc = isBefore(sel.startRow, sel.startCol, sel.endRow, sel.endCol) ? sel.startCol : sel.endCol;
              const er = isBefore(sel.startRow, sel.startCol, sel.endRow, sel.endCol) ? sel.endRow : sel.startRow;
              const ec = isBefore(sel.startRow, sel.startCol, sel.endRow, sel.endCol) ? sel.endCol : sel.startCol;

              const charW = 6 * labelDot;
              const lineH = 12 * labelDot;
              const topNudge = (7 * labelDot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;

              const vStart = win.scrollTop;
              const vEnd = win.scrollTop + (displayTexts.length - 1);
              const r0 = clamp(Math.floor(Number(sr)), vStart, vEnd);
              const r1 = clamp(Math.floor(Number(er)), vStart, vEnd);

              fallback = [];
              for (let row = r0; row <= r1; row++) {
                const localRow = row - win.scrollTop;
                const line = sourceTexts[localRow] ?? displayTexts[localRow] ?? "";
                const prefix = displayPrefixLengths[localRow] ?? 0;
                const c0 = row === Math.floor(Number(sr)) ? Math.floor(Number(sc)) : 0;
                const c1 = row === Math.floor(Number(er)) ? Math.floor(Number(ec)) : line.length;
                const col0 = clamp(c0, 0, line.length);
                const col1 = clamp(c1, 0, line.length);
                const leftPx = cx + (prefix + Math.min(col0, col1)) * charW;
                const wPx = Math.max(1, Math.abs(col1 - col0) * charW);
                const yPx = cy + localRow * lineH - topNudge;
                fallback.push({ x: leftPx, y: yPx, w: wPx, h: lineH });
              }
            } catch {
              fallback = null;
            }
          }

          const want = Array.isArray(rects) && rects.length ? rects.length : Array.isArray(fallback) ? fallback.length : 0;
          ensureCount(want);

          const col = parseHexColor(sel.color, HUD_SURFACE_ACCENT_COLOR);
          const op = sel.opacity != null ? Number(sel.opacity) : 0.8;

          for (let i = 0; i < objs.selectionRects.length; i++) {
            const mesh = objs.selectionRects[i];
            if (!mesh) continue;

            // Window layers use a per-window renderOrder base (roBase).
            // Selection rects must follow that ordering or they'll render behind
            // the window background and appear to be missing.
            try {
              const roBase = Number(objs?._renderOrderBase);
              if (Number.isFinite(roBase)) mesh.renderOrder = roBase + 29;
            } catch {
              // no-op
            }

            const rr = Array.isArray(rects) && rects.length ? rects[i] : null;
            const fr = Array.isArray(fallback) && fallback.length ? fallback[i] : null;
            if (!rr && !fr) {
              if (mesh) mesh.visible = false;
              continue;
            }

            let x0;
            let y0;
            let wpx;
            let hpx;
            if (rr) {
              const left = Number(rr.left);
              const right = Number(rr.right);
              const top = Number(rr.top);
              const bottom = Number(rr.bottom);
              if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
                mesh.visible = false;
                continue;
              }
              wpx = Math.max(1, right - left);
              hpx = Math.max(1, top - bottom);
              x0 = cx + left;
              const topNudge = (7 * labelDot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
              y0 = cy - top - topNudge;
            } else {
              x0 = Number(fr.x);
              y0 = Number(fr.y);
              wpx = Math.max(1, Number(fr.w));
              hpx = Math.max(1, Number(fr.h));
            }

            try {
              if (mesh.material?.color) mesh.material.color.setHex(col);
            } catch {
              // no-op
            }
            try {
              if (mesh.material) mesh.material.opacity = op;
            } catch {
              // no-op
            }
            positionRect(mesh, x0, y0, wpx, hpx, 0.00395 + lift);
            mesh.visible = true;
          }
        }
      }
    } catch {
      try {
        if (Array.isArray(objs.selectionRects)) {
          for (const r of objs.selectionRects) if (r) r.visible = false;
        }
      } catch {
        // no-op
      }
    }

    // Text caret quad (editor windows only).
    // Prefer Troika caretPositions so it aligns with proportional glyph metrics.
    try {
      const caret = win._textCaret;
      if (objs.caret && caret && caret.visible) {
        const row = Math.floor(Number(caret.row));
        const col = Math.floor(Number(caret.col));
        const cwPx = Math.max(1, Math.floor((caret.wPx ?? labelDot) || labelDot));

        if (caret.target === "footer") {
          const button = Array.isArray(objs._footerActionMeta) ? objs._footerActionMeta[0] : null;
          if (!button || !Number.isFinite(button.textX) || !Number.isFinite(button.textY)) {
            objs.caret.visible = false;
          } else {
            const sourceText = String(button.sourceText ?? "");
            const dot = Number.isFinite(button.dot) ? Number(button.dot) : Math.max(1, labelDot * 0.85);
            const cc = clamp(Number.isFinite(col) ? col : 0, 0, sourceText.length);
            let x0 = button.textX + estimateTextWidthPx(sourceText.slice(0, cc), dot);
            let y0 = button.textY;
            let h0 = 12 * dot;
            const tri = button.labelObject?._textMesh?.textRenderInfo;
            const renderedText = typeof tri?.parameters?.text === "string" ? tri.parameters.text : "";
            const cps = tri?.caretPositions;
            const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
            if (cps && sourceText.length > 0 && renderedText === sourceText) {
              const idx = clamp(cc, 0, renderedText.length);
              const base = idx >= renderedText.length
                ? Math.max(0, (renderedText.length - 1) * 4)
                : idx * 4;
              const xLocal = idx >= renderedText.length ? cps[base + 1] : cps[base];
              const bottom = cps[base + 2];
              const top = cps[base + 3];
              if (Number.isFinite(xLocal) && Number.isFinite(bottom) && Number.isFinite(top)) {
                x0 = button.textX + xLocal;
                y0 = button.textY - top - topNudge;
                h0 = Math.max(1, top - bottom);
              }
            }
            if (objs.caret.material?.color && caret.color != null) {
              objs.caret.material.color.setHex(Number(caret.color) >>> 0);
            }
            positionRect(objs.caret, x0, y0, cwPx, h0, 0.00415 + lift);
            objs.caret.visible = true;
          }
          if (typeof post === "function") post();
          if (!win._externalScrollControl) {
            placeScrollbar(totalLines, visibleLines, win.scrollTop, totalLines > visibleLines);
          } else {
            const extTotal = win._scrollTotalLines || 0;
            const extVisible = win._scrollVisibleLines || 0;
            placeScrollbar(extTotal, extVisible, win.scrollTop || 0, extTotal > extVisible);
          }
          return;
        }

        if (caret.target === "actionButton") {
          const localRow = row - win.scrollTop;
          const button = localRow >= 0 && localRow < objs._visibleLineMeta.length
            ? objs._visibleLineMeta[localRow]?.actionButton ?? null
            : null;

          if (!button) {
            objs.caret.visible = false;
          } else {
            const sourceText = String(button.sourceText ?? button.text ?? "");
            const dot = Number.isFinite(button.dot) ? Number(button.dot) : Math.max(1, labelDot * 0.85);
            const cc = clamp(Number.isFinite(col) ? col : 0, 0, sourceText.length);
            const textX = Number.isFinite(button.textX)
              ? Number(button.textX)
              : Number(button.x ?? 0) + Math.max(4, Math.floor(Number(button.w ?? 24) * 0.28));
            const textY = Number.isFinite(button.textY)
              ? Number(button.textY)
              : Number(button.y ?? 0) + 1;
            const tri = button.labelObject?._textMesh?.textRenderInfo;
            const renderedText = typeof tri?.parameters?.text === "string"
              ? tri.parameters.text
              : sourceText;
            let sharedPrefixLength = 0;
            const sharedPrefixLimit = Math.min(sourceText.length, renderedText.length);
            while (
              sharedPrefixLength < sharedPrefixLimit
              && sourceText.charAt(sharedPrefixLength) === renderedText.charAt(sharedPrefixLength)
            ) {
              sharedPrefixLength += 1;
            }

            const syncedMetricCol = clamp(
              cc <= sharedPrefixLength ? cc : sharedPrefixLength,
              0,
              renderedText.length
            );
            let x0 = textX + estimateTextWidthPx(sourceText.slice(0, cc), dot);
            let y0 = textY;
            let h0 = 12 * dot;

            const cps = tri?.caretPositions;
            const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;

            if (cps && renderedText.length > 0) {
              const idx = clamp(syncedMetricCol, 0, renderedText.length);
              let base;
              let xLocal;
              let bottom;
              let top;
              if (idx >= renderedText.length) {
                base = Math.max(0, (renderedText.length - 1) * 4);
                xLocal = cps[base + 1];
                bottom = cps[base + 2];
                top = cps[base + 3];
              } else {
                base = idx * 4;
                xLocal = cps[base];
                bottom = cps[base + 2];
                top = cps[base + 3];
              }
              if (Number.isFinite(xLocal) && Number.isFinite(bottom) && Number.isFinite(top)) {
                x0 = textX + xLocal;
                if (cc > syncedMetricCol) {
                  x0 += estimateTextWidthPx(sourceText.slice(syncedMetricCol, cc), dot);
                }
                y0 = textY - top - topNudge;
                h0 = Math.max(1, top - bottom);
              }
            }

            if (objs.caret.material?.color && caret.color != null) {
              objs.caret.material.color.setHex(Number(caret.color) >>> 0);
            }
            positionRect(objs.caret, x0, y0, cwPx, h0, 0.00415 + lift);
            objs.caret.visible = true;
          }
          if (typeof post === "function") post();
          if (!win._externalScrollControl) {
            placeScrollbar(totalLines, visibleLines, win.scrollTop, totalLines > visibleLines);
          } else {
            const extTotal = win._scrollTotalLines || 0;
            const extVisible = win._scrollVisibleLines || 0;
            placeScrollbar(extTotal, extVisible, win.scrollTop || 0, extTotal > extVisible);
          }
          return;
        }

        const inRange = Number.isFinite(row) && row >= win.scrollTop && row < win.scrollTop + visibleLines;
        if (!inRange) {
          objs.caret.visible = false;
        } else {
          const localRow = row - win.scrollTop;
          const starts = new Array(displayTexts.length);
          let acc = 0;
          for (let i = 0; i < displayTexts.length; i++) {
            starts[i] = acc;
            acc += displayTexts[i].length;
            if (i < displayTexts.length - 1) acc += 1;
          }
          const totalTextLen = acc;
          const line = sourceTexts[localRow] ?? displayTexts[localRow] ?? "";
          const prefix = displayPrefixLengths[localRow] ?? 0;
          const cc = clamp(Number.isFinite(col) ? col : 0, 0, line.length);
          const charIndex = (starts[localRow] ?? 0) + prefix + cc;
          const lineStartIndex = starts[localRow] ?? 0;
          const lineDisplayText = displayTexts[localRow] ?? "";
          const charDisplayCol = clamp(prefix + cc, 0, lineDisplayText.length);

          const troikaText = objs?._troikaContentText?._textMesh;
          const tri = troikaText?.textRenderInfo;
          const cps = tri?.caretPositions;
          const currentDisplayText = displayTexts.join("\n");
          const renderedText = typeof tri?.parameters?.text === "string"
            ? tri.parameters.text
            : currentDisplayText;
          let sharedPrefixLength = 0;
          const sharedPrefixLimit = Math.min(currentDisplayText.length, renderedText.length);
          while (
            sharedPrefixLength < sharedPrefixLimit
            && currentDisplayText.charAt(sharedPrefixLength) === renderedText.charAt(sharedPrefixLength)
          ) {
            sharedPrefixLength += 1;
          }
          const syncedMetricIndex = clamp(
            charIndex <= sharedPrefixLength ? charIndex : sharedPrefixLength,
            0,
            renderedText.length
          );
          const lineEndIndex = lineStartIndex + lineDisplayText.length;
          const syncedMetricOnCurrentRow = syncedMetricIndex >= lineStartIndex && syncedMetricIndex <= lineEndIndex;

          let x0 = cx + estimateTextWidthPx(lineDisplayText.slice(0, charDisplayCol), labelDot);
          let y0 = cy + localRow * (12 * labelDot);
          let h0 = 12 * labelDot;

          const topNudge = (7 * labelDot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;

          if (cps && renderedText.length > 0 && syncedMetricOnCurrentRow) {
            // caretPositions are in text-local coords: [x1, x2, bottom, top] per char.
            const idx = clamp(syncedMetricIndex, 0, renderedText.length);
            let base;
            let xLocal;
            let bottom;
            let top;
            if (idx >= renderedText.length) {
              base = Math.max(0, (renderedText.length - 1) * 4);
              xLocal = cps[base + 1];
              bottom = cps[base + 2];
              top = cps[base + 3];
            } else {
              base = idx * 4;
              xLocal = cps[base];
              bottom = cps[base + 2];
              top = cps[base + 3];
            }
            if (Number.isFinite(xLocal) && Number.isFinite(bottom) && Number.isFinite(top)) {
              x0 = cx + xLocal;
              if (charIndex > syncedMetricIndex) {
                const suffixStart = clamp(syncedMetricIndex - lineStartIndex, 0, charDisplayCol);
                x0 += estimateTextWidthPx(lineDisplayText.slice(suffixStart, charDisplayCol), labelDot);
              }
              y0 = cy - top - topNudge;
              h0 = Math.max(1, top - bottom);
            }
          }

          if (objs.caret.material?.color && caret.color != null) {
            objs.caret.material.color.setHex(Number(caret.color) >>> 0);
          }
          positionRect(objs.caret, x0, y0, cwPx, h0, 0.00415 + lift);
          objs.caret.visible = true;
        }
      } else if (objs.caret) {
        objs.caret.visible = false;
      }
    } catch {
      if (objs.caret) objs.caret.visible = false;
    }

    if (typeof post === "function") post();
    // When an external overlay system (e.g. card overlays) owns the scrollbar,
    // use the overlay's scroll metrics instead of the text-based ones so the
    // scrollbar correctly reflects the card list, not the text content.
    if (!win._externalScrollControl) {
      placeScrollbar(totalLines, visibleLines, win.scrollTop, totalLines > visibleLines);
    } else {
      const extTotal = win._scrollTotalLines || 0;
      const extVisible = win._scrollVisibleLines || 0;
      placeScrollbar(extTotal, extVisible, win.scrollTop || 0, extTotal > extVisible);
    }
  }

  return { renderList };
}

function normalizeFooterActions(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if (typeof entry.actionButtonOnClick !== "function") return null;
      const text = typeof entry.actionButtonText === "string" ? entry.actionButtonText.trim() : "";
      const iconTexture = entry.actionButtonIconTexture ?? null;
      if (!text && iconTexture == null) return null;
      return {
        text,
        iconTexture,
        hoverText:
          typeof entry.actionButtonHoverText === "string" && entry.actionButtonHoverText.trim()
            ? entry.actionButtonHoverText.trim()
            : null,
        onClick: entry.actionButtonOnClick,
        widthPx: Number.isFinite(entry.actionButtonWidthPx) ? Number(entry.actionButtonWidthPx) : null,
        textColor: typeof entry.actionButtonTextColor === "number" ? entry.actionButtonTextColor : null,
        bgColor: typeof entry.actionButtonBgColor === "number" ? entry.actionButtonBgColor : null,
        bgOpacity: Number.isFinite(entry.actionButtonBgOpacity) ? Number(entry.actionButtonBgOpacity) : null,
        textInsetPx: Number.isFinite(entry.actionButtonTextInsetPx) ? Number(entry.actionButtonTextInsetPx) : null,
        sourceText: typeof entry.actionButtonSourceText === "string" ? entry.actionButtonSourceText : null,
      };
    })
    .filter(Boolean);
}
