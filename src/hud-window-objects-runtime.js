// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared HUD runtime helpers that allocate canonical mesh/text objects for a single window.
 * @param {object} [options={}] Window-object factory dependencies.
 * @param {{ DoubleSide?: any }} options.THREE Three.js namespace used to configure double-sided hit-collider materials.
 * @param {(options: { x: number, y: number, w: number, h: number, color: number | string, opacity?: number, z?: number, order?: number }) => any} options.makeRect Mesh-factory callback used to allocate HUD quads.
 * @param {new (...args: any[]) => any} options.TroikaPixelText Constructor used to allocate HUD text wrappers.
 * @param {number} options.titleHeightPx Canonical title-bar height used for minimize button sizing.
 * @param {number | string} options.surfacePanelBgColor Default panel background color.
 * @param {number | string} options.surfaceAccentColor Canonical HUD accent color.
 * @param {number | string} options.surfaceContentBgColor Canonical content background color.
 * @param {number | string} options.surfaceTitleBarColor Canonical title-bar color.
 * @param {number | string} options.textDefaultColor Canonical default HUD text color.
 * @returns {{ createWindowObjects: (options?: { windowKey?: string, withMin?: boolean, withClose?: boolean, withAction?: boolean, withResize?: boolean, withScroll?: boolean, panelBgColor?: number | string, panelBgOpacity?: number, titleBarColor?: number | string, titleBarOpacity?: number, contentBgColor?: number | string, contentBgOpacity?: number }) => Record<string, any> }} API exposing the canonical window object allocator.
 * Side effects: allocates Three.js meshes/materials and Troika text wrappers for HUD windows.
 */
import {
  HUD_RENDER_ORDER_HIT_OFFSET,
  HUD_RENDER_ORDER_SHADOW_OFFSET,
  HUD_RENDER_ORDER_OUTLINE_OFFSET,
  HUD_RENDER_ORDER_BG_OFFSET,
  HUD_RENDER_ORDER_BEVEL_OFFSET,
  HUD_RENDER_ORDER_CONTENT_BG_OFFSET,
  HUD_RENDER_ORDER_TITLE_OFFSET,
  HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET,
  HUD_RENDER_ORDER_SCROLL_TRACK_OFFSET,
  HUD_RENDER_ORDER_SCROLL_THUMB_OFFSET,
  HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
  HUD_RENDER_ORDER_CARET_QUAD_OFFSET,
  HUD_Z_CONTENT_TEXT,
  HUD_WINDOW_RESIZE_HANDLE_SIZE_PX,
  HUD_SCROLLBAR_TRACK_WIDTH_PX,
  HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX,
  HUD_SURFACE_ELEMENT_OPACITY,
  HUD_Z_SURFACE_FG,
  HUD_Z_SURFACE_BG,
  HUD_Z_SURFACE_RECESSED,
  HUD_Z_BEVEL,
  HUD_Z_WINDOW_BG,
} from "./hud-layout-policy.js";
import {
  HUD_TEXT_BRIGHT_COLOR,
  HUD_TEXT_HEADER_FONT_URL,
  HUD_TEXT_HEADER_FONT_WEIGHT,
  HUD_TEXT_HEADER_UNICODE_FONTS_URL,
} from "./hud-text-style.js";
import {
  HUD_SURFACE_CONTENT_BG_OPACITY,
  HUD_SURFACE_PANEL_BG_OPACITY,
  HUD_SURFACE_TITLE_BAR_OPACITY,
} from "./hud-surface-style.js";
export function createHudWindowObjectsRuntime({
  THREE,
  makeRect,
  TroikaPixelText,
  titleHeightPx,
  surfacePanelBgColor,
  surfaceAccentColor,
  surfaceContentBgColor,
  surfaceTitleBarColor,
  surfaceControlStyle = "filled",
  textDefaultColor,
} = {}) {
  let hotbarBgTexture = null;
  let hotbarOutlineTexture = null;
  let hotbarShadowTexture = null;
  let panelBgTexture = null;
  let panelOutlineTexture = null;
  let panelShadowTexture = null;
  let panelTitleTexture = null;
  let titleDotTexture = null;
  let closeButtonTexture = null;
  let minButtonTexture = null;
  let resizeHandleTexture = null;
  let scrollbarTrackTexture = null;
  let scrollbarThumbTexture = null;
  let scrollbarArrowUpTexture = null;
  let scrollbarArrowUpDisabledTexture = null;
  let scrollbarArrowDownTexture = null;
  let scrollbarArrowDownDisabledTexture = null;

  function createCanvasTexture(width, height, draw) {
    if (typeof document === "undefined" || !THREE?.CanvasTexture) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  function roundedRectPath(ctx, x, y, width, height, radius, corners = { tl: radius, tr: radius, br: radius, bl: radius }) {
    const tl = Math.max(0, Number(corners.tl ?? radius) || 0);
    const tr = Math.max(0, Number(corners.tr ?? radius) || 0);
    const br = Math.max(0, Number(corners.br ?? radius) || 0);
    const bl = Math.max(0, Number(corners.bl ?? radius) || 0);

    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + width - tr, y);
    if (tr > 0) ctx.quadraticCurveTo(x + width, y, x + width, y + tr);
    else ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - br);
    if (br > 0) ctx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    else ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + bl, y + height);
    if (bl > 0) ctx.quadraticCurveTo(x, y + height, x, y + height - bl);
    else ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + tl);
    if (tl > 0) ctx.quadraticCurveTo(x, y, x + tl, y);
    else ctx.lineTo(x, y);
    ctx.closePath();
  }

  function createRoundedRectTexture({ width, height, radius, strokeWidth = 0, fill = true, stroke = false }) {
    return createCanvasTexture(width, height, (ctx) => {
      const inset = stroke ? strokeWidth * 0.5 + 1 : 1;
      roundedRectPath(ctx, inset, inset, width - inset * 2, height - inset * 2, radius);
      if (fill) {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      if (stroke) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    });
  }

  function createTopRoundedRectTexture({ width, height, radius }) {
    return createCanvasTexture(width, height, (ctx) => {
      roundedRectPath(ctx, 0, 0, width, height, radius, { tl: radius, tr: radius, br: 0, bl: 0 });
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });
  }

  const quietControls = surfaceControlStyle === "quiet";
  const hotbarRadiusPx = quietControls ? 8 : 18;

  function getHotbarFillTexture() {
    if (!hotbarBgTexture) {
      hotbarBgTexture = createRoundedRectTexture({
        width: 640,
        height: 80,
        radius: hotbarRadiusPx,
        fill: true,
      });
    }
    return hotbarBgTexture;
  }

  function getHotbarOutlineTexture() {
    if (!hotbarOutlineTexture) {
      hotbarOutlineTexture = createRoundedRectTexture({
        width: 640,
        height: 80,
        radius: hotbarRadiusPx,
        strokeWidth: 2,
        fill: false,
        stroke: true,
      });
    }
    return hotbarOutlineTexture;
  }

  function getHotbarShadowTexture() {
    if (!hotbarShadowTexture) {
      hotbarShadowTexture = createRoundedRectTexture({
        width: 640,
        height: 80,
        radius: hotbarRadiusPx,
        fill: true,
      });
    }
    return hotbarShadowTexture;
  }

  function getPanelFillTexture() {
    if (!panelBgTexture) {
      panelBgTexture = createRoundedRectTexture({
        width: 640,
        height: 360,
        radius: 10,
        fill: true,
      });
    }
    return panelBgTexture;
  }

  function getPanelOutlineTexture() {
    if (!panelOutlineTexture) {
      panelOutlineTexture = createRoundedRectTexture({
        width: 640,
        height: 360,
        radius: 10,
        strokeWidth: 2,
        fill: false,
        stroke: true,
      });
    }
    return panelOutlineTexture;
  }

  function getPanelShadowTexture() {
    if (!panelShadowTexture) {
      panelShadowTexture = createRoundedRectTexture({
        width: 640,
        height: 360,
        radius: 10,
        fill: true,
      });
    }
    return panelShadowTexture;
  }

  function getPanelTitleTexture() {
    if (!panelTitleTexture) {
      panelTitleTexture = createTopRoundedRectTexture({
        width: 640,
        height: 64,
        radius: 10,
      });
    }
    return panelTitleTexture;
  }

  function getTitleDotTexture() {
    if (!titleDotTexture) {
      titleDotTexture = createCanvasTexture(32, 32, (ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(16, 16, 12, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return titleDotTexture;
  }

  function getCloseButtonTexture() {
    if (!closeButtonTexture) {
      closeButtonTexture = createCanvasTexture(96, 96, (ctx) => {
        roundedRectPath(ctx, 8, 4, 80, 88, 14);
        ctx.fillStyle = quietControls ? "rgba(255,255,255,0.07)" : "rgba(233,69,96,0.88)";
        ctx.fill();
        ctx.strokeStyle = quietControls ? "rgba(214,224,235,0.92)" : "rgba(255,255,255,0.96)";
        ctx.lineWidth = quietControls ? 6 : 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(31, 31);
        ctx.lineTo(65, 65);
        ctx.moveTo(65, 31);
        ctx.lineTo(31, 65);
        ctx.stroke();
      });
    }
    return closeButtonTexture;
  }

  function getMinButtonTexture() {
    if (!minButtonTexture) {
      const accent = Number.isFinite(Number(surfaceAccentColor)) ? Number(surfaceAccentColor) >>> 0 : 0x53b3cb;
      const ar = (accent >> 16) & 0xff;
      const ag = (accent >> 8) & 0xff;
      const ab = accent & 0xff;
      minButtonTexture = createCanvasTexture(96, 96, (ctx) => {
        roundedRectPath(ctx, 8, 4, 80, 88, 14);
        ctx.fillStyle = quietControls ? "rgba(255,255,255,0.07)" : `rgba(${ar},${ag},${ab},0.88)`;
        ctx.fill();
        ctx.strokeStyle = quietControls ? "rgba(214,224,235,0.92)" : "rgba(255,255,255,0.94)";
        ctx.lineWidth = quietControls ? 6 : 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(29, 48);
        ctx.lineTo(67, 48);
        ctx.stroke();
      });
    }
    return minButtonTexture;
  }

  function getScrollbarTrackTexture() {
    if (!scrollbarTrackTexture) {
      scrollbarTrackTexture = createCanvasTexture(88, 256, (ctx) => {
        ctx.fillStyle = quietControls ? "rgba(255,255,255,0.05)" : "rgba(20,30,50,0.72)";
        ctx.fillRect(0, 0, 88, 256);
      });
    }
    return scrollbarTrackTexture;
  }

  function getScrollbarThumbTexture() {
    if (!scrollbarThumbTexture) {
      scrollbarThumbTexture = createCanvasTexture(88, 160, (ctx) => {
        roundedRectPath(ctx, 12, 0, 64, 160, 12);
        ctx.fillStyle = quietControls ? "rgba(122,142,165,0.82)" : "rgba(83,179,203,0.84)";
        ctx.fill();
      });
    }
    return scrollbarThumbTexture;
  }

  function createScrollbarArrowTexture(direction, enabled) {
    return createCanvasTexture(88, 80, (ctx) => {
      roundedRectPath(ctx, 8, 0, 72, 80, 12);
      if (quietControls) ctx.fillStyle = enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)";
      else ctx.fillStyle = enabled ? "rgba(83,179,203,0.92)" : "rgba(83,179,203,0.2)";
      ctx.fill();
      if (quietControls) ctx.fillStyle = enabled ? "rgba(214,224,235,0.92)" : "rgba(122,142,165,0.4)";
      else ctx.fillStyle = enabled ? "rgba(255,255,255,0.96)" : "rgba(85,85,85,0.9)";
      ctx.beginPath();
      if (direction === "up") {
        ctx.moveTo(44, 22);
        ctx.lineTo(24, 48);
        ctx.lineTo(64, 48);
      } else {
        ctx.moveTo(24, 30);
        ctx.lineTo(64, 30);
        ctx.lineTo(44, 56);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  function getScrollbarArrowTexture(direction, enabled) {
    if (direction === "up") {
      if (enabled) {
        if (!scrollbarArrowUpTexture) scrollbarArrowUpTexture = createScrollbarArrowTexture("up", true);
        return scrollbarArrowUpTexture;
      }
      if (!scrollbarArrowUpDisabledTexture) scrollbarArrowUpDisabledTexture = createScrollbarArrowTexture("up", false);
      return scrollbarArrowUpDisabledTexture;
    }

    if (enabled) {
      if (!scrollbarArrowDownTexture) scrollbarArrowDownTexture = createScrollbarArrowTexture("down", true);
      return scrollbarArrowDownTexture;
    }
    if (!scrollbarArrowDownDisabledTexture) scrollbarArrowDownDisabledTexture = createScrollbarArrowTexture("down", false);
    return scrollbarArrowDownDisabledTexture;
  }

  function getResizeHandleTexture() {
    if (resizeHandleTexture || typeof document === "undefined" || !THREE?.CanvasTexture) {
      return resizeHandleTexture;
    }

    resizeHandleTexture = createCanvasTexture(96, 96, (ctx) => {
      ctx.strokeStyle = "rgba(100,140,180,0.45)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (let index = 1; index <= 3; index += 1) {
        ctx.beginPath();
        ctx.moveTo(24 + index * 12, 94);
        ctx.lineTo(94, 24 + index * 12);
        ctx.stroke();
      }
    });
    return resizeHandleTexture;
  }

  function createWindowObjects({
    windowKey = "",
    withMin = true,
    withClose = false,
    withAction = false,
    withResize = true,
    withScroll = false,
    panelBgColor = surfacePanelBgColor,
    panelBgOpacity = HUD_SURFACE_PANEL_BG_OPACITY,
    titleBarColor = surfaceTitleBarColor,
    titleBarOpacity = HUD_SURFACE_TITLE_BAR_OPACITY,
    contentBgColor = surfaceContentBgColor,
    contentBgOpacity = HUD_SURFACE_CONTENT_BG_OPACITY,
  } = {}) {
    const objs = {};

    // Invisible hit collider that matches the full window rect.
    // In VR we ray-intersect this plane (not the visible stacked quads), so
    // hit depth is stable and titlebar grabs line up (no depth-dependent offset).
    objs.hit = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      color: 0x000000,
      opacity: 0,
      z: 0.002,
      order: HUD_RENDER_ORDER_HIT_OFFSET,
    });

    // VR/controller rays often approach the HUD from the opposite side of the plane normal
    // (the window billboard normal is oriented toward the head). Make the hit collider
    // double-sided so raycasts remain reliable.
    try {
      objs.hit.material.side = THREE.DoubleSide;
      objs.hit.material.needsUpdate = true;
    } catch {
      // no-op
    }

    // Subtle drop shadow (adds depth)
    objs.shadow = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      color: 0x000000,
      opacity: 0.28,
      z: 0.0012,
      order: HUD_RENDER_ORDER_SHADOW_OFFSET,
    });

    // Outline to simulate the window border
    objs.outline = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      color: surfaceAccentColor,
      opacity: 0.52,
      z: 0.00135,
      order: HUD_RENDER_ORDER_OUTLINE_OFFSET,
    });
    objs.bg = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      color: panelBgColor,
      opacity: panelBgOpacity,
      z: HUD_Z_WINDOW_BG,
      order: HUD_RENDER_ORDER_BG_OFFSET,
    });

    // Inner bevel (highlight top/left, shadow bottom/right)
    objs.bevelTop = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 2,
      color: surfaceAccentColor,
      opacity: 0.55,
      z: HUD_Z_BEVEL,
      order: HUD_RENDER_ORDER_BEVEL_OFFSET,
    });
    objs.bevelLeft = makeRect({
      x: 0,
      y: 0,
      w: 2,
      h: 10,
      color: surfaceAccentColor,
      opacity: 0.45,
      z: HUD_Z_BEVEL,
      order: HUD_RENDER_ORDER_BEVEL_OFFSET,
    });
    objs.bevelBottom = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 2,
      color: 0x0a0d11,
      opacity: 0.6,
      z: HUD_Z_BEVEL,
      order: HUD_RENDER_ORDER_BEVEL_OFFSET,
    });
    objs.bevelRight = makeRect({
      x: 0,
      y: 0,
      w: 2,
      h: 10,
      color: 0x0a0d11,
      opacity: 0.55,
      z: HUD_Z_BEVEL,
      order: HUD_RENDER_ORDER_BEVEL_OFFSET,
    });

    // Content background (helps text readability)
    objs.contentBg = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      color: contentBgColor,
      opacity: contentBgOpacity,
      z: 0.0016,
      order: HUD_RENDER_ORDER_CONTENT_BG_OFFSET,
    });
    objs.title = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: titleHeightPx,
      color: titleBarColor,
      opacity: titleBarOpacity,
      z: 0.002,
      order: HUD_RENDER_ORDER_TITLE_OFFSET,
    });

    // Divider line between title bar and content
    objs.titleDivider = makeRect({
      x: 0,
      y: 0,
      w: 10,
      h: 1,
      color: 0x0a0d11,
      opacity: 0.85,
      z: 0.00201,
      order: HUD_RENDER_ORDER_TITLE_DIVIDER_OFFSET,
    });

    // Keep title text very close to the title bar plane to avoid perspective parallax
    // (otherwise the text appears to slide within the bar when the window is far from screen center).
    objs.titleText = new TroikaPixelText({
      color: textDefaultColor,
      z: 0.00206,
      depthTest: false,
      fontUrl: HUD_TEXT_HEADER_FONT_URL,
      fontWeight: HUD_TEXT_HEADER_FONT_WEIGHT,
      unicodeFontsURL: HUD_TEXT_HEADER_UNICODE_FONTS_URL,
    });
    try {
      objs.titleText.mesh.userData.hudRole = "titleText";
    } catch {
      // no-op
    }

    objs.contentText = new TroikaPixelText({ color: textDefaultColor, z: HUD_Z_CONTENT_TEXT, depthTest: false });

    // Optional caret quad for text editors (render-only).
    // Hidden by default; specific windows (e.g. hud-text-editor) drive it via win._textCaret.
    objs.caret = makeRect({
      x: 0,
      y: 0,
      w: 2,
      h: 12,
      color: HUD_TEXT_BRIGHT_COLOR,
      opacity: HUD_SURFACE_ELEMENT_OPACITY,
      z: 0.00415,
      order: HUD_RENDER_ORDER_CARET_QUAD_OFFSET,
    });
    objs.caret.visible = false;
    try {
      objs.caret.material.depthTest = false;
      objs.caret.material.depthWrite = false;
      objs.caret.material.needsUpdate = true;
    } catch {
      // no-op
    }

    // Optional selection highlight rects for text editors (render-only).
    // Driven via win._textSelection.
    objs.selectionRects = [];

    if (withMin) {
      objs.minBtn = makeRect({
        x: 0,
        y: 0,
        w: titleHeightPx,
        h: titleHeightPx,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_FG,
        order: HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
      });
      const minTexture = getMinButtonTexture();
      if (minTexture && objs.minBtn.material) {
        objs.minBtn.material.map = minTexture;
        objs.minBtn.material.needsUpdate = true;
      }
      // Keep the label close to the min button plane for the same reason as title text.
      objs.minLabel = new TroikaPixelText({ color: HUD_TEXT_BRIGHT_COLOR, z: 0.00226, depthTest: false });
      try {
        objs.minLabel.mesh.userData.hudRole = "minLabel";
      } catch {
        // no-op
      }
    }

    if (withClose) {
      objs.closeBtn = makeRect({
        x: 0,
        y: 0,
        w: titleHeightPx,
        h: titleHeightPx,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_FG,
        order: HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
      });
      const closeTexture = getCloseButtonTexture();
      if (closeTexture && objs.closeBtn.material) {
        objs.closeBtn.material.map = closeTexture;
        objs.closeBtn.material.needsUpdate = true;
      }
      objs.closeLabel = new TroikaPixelText({ color: HUD_TEXT_BRIGHT_COLOR, z: 0.00226, depthTest: false });
      try {
        objs.closeLabel.mesh.userData.hudRole = "closeLabel";
      } catch {
        // no-op
      }
    }

    if (withAction) {
      objs.actionBtn = makeRect({
        x: 0,
        y: 0,
        w: titleHeightPx,
        h: titleHeightPx,
        color: surfaceAccentColor,
        opacity: HUD_SURFACE_ELEMENT_OPACITY,
        z: HUD_Z_SURFACE_FG,
        order: HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
      });
      objs.actionLabel = new TroikaPixelText({ color: HUD_TEXT_BRIGHT_COLOR, z: 0.00226, depthTest: false });
      try {
        objs.actionLabel.mesh.userData.hudRole = "actionLabel";
      } catch {
        // no-op
      }
    }

    if (withResize) {
      objs.resizeHandle = makeRect({
        x: 0,
        y: 0,
        w: HUD_WINDOW_RESIZE_HANDLE_SIZE_PX,
        h: HUD_WINDOW_RESIZE_HANDLE_SIZE_PX,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_FG,
        order: HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
      });
      const resizeTexture = getResizeHandleTexture();
      if (resizeTexture && objs.resizeHandle.material) {
        objs.resizeHandle.material.map = resizeTexture;
        objs.resizeHandle.material.needsUpdate = true;
      }
    }

    if (withScroll) {
      objs.scrollTrack = makeRect({
        x: 0,
        y: 0,
        w: HUD_SCROLLBAR_TRACK_WIDTH_PX,
        h: 10,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_RECESSED,
        order: HUD_RENDER_ORDER_SCROLL_TRACK_OFFSET,
      });
      objs.scrollThumb = makeRect({
        x: 0,
        y: 0,
        w: HUD_SCROLLBAR_TRACK_WIDTH_PX,
        h: 10,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_BG,
        order: HUD_RENDER_ORDER_SCROLL_THUMB_OFFSET,
      });
      objs.scrollUpBtn = makeRect({
        x: 0,
        y: 0,
        w: HUD_SCROLLBAR_TRACK_WIDTH_PX - 4,
        h: HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_BG,
        order: HUD_RENDER_ORDER_SCROLL_THUMB_OFFSET,
      });
      objs.scrollDownBtn = makeRect({
        x: 0,
        y: 0,
        w: HUD_SCROLLBAR_TRACK_WIDTH_PX - 4,
        h: HUD_SCROLLBAR_ARROW_BUTTON_HEIGHT_PX,
        color: 0xffffff,
        opacity: 1,
        z: HUD_Z_SURFACE_BG,
        order: HUD_RENDER_ORDER_SCROLL_THUMB_OFFSET,
      });
      const trackTexture = getScrollbarTrackTexture();
      if (trackTexture && objs.scrollTrack.material) {
        objs.scrollTrack.material.map = trackTexture;
        objs.scrollTrack.material.needsUpdate = true;
      }
      const thumbTexture = getScrollbarThumbTexture();
      if (thumbTexture && objs.scrollThumb.material) {
        objs.scrollThumb.material.map = thumbTexture;
        objs.scrollThumb.material.needsUpdate = true;
      }
      const upTexture = getScrollbarArrowTexture("up", false);
      if (upTexture && objs.scrollUpBtn.material) {
        objs.scrollUpBtn.material.map = upTexture;
        objs.scrollUpBtn.material.needsUpdate = true;
      }
      const downTexture = getScrollbarArrowTexture("down", false);
      if (downTexture && objs.scrollDownBtn.material) {
        objs.scrollDownBtn.material.map = downTexture;
        objs.scrollDownBtn.material.needsUpdate = true;
      }
    }

    if (windowKey !== "hotbar") {
      const fillTexture = getPanelFillTexture();
      const outlineTexture = getPanelOutlineTexture();
      const shadowTexture = getPanelShadowTexture();
      const titleTexture = getPanelTitleTexture();

      if (fillTexture && objs.bg?.material) {
        objs.bg.material.map = fillTexture;
        objs.bg.material.needsUpdate = true;
      }
      if (outlineTexture && objs.outline?.material) {
        objs.outline.material.map = outlineTexture;
        objs.outline.material.needsUpdate = true;
      }
      if (shadowTexture && objs.shadow?.material) {
        objs.shadow.material.map = shadowTexture;
        objs.shadow.material.needsUpdate = true;
      }
      if (titleTexture && objs.title?.material) {
        objs.title.material.map = titleTexture;
        objs.title.material.needsUpdate = true;
      }

      const dotTexture = getTitleDotTexture();
      objs.titleDots = Array.from({ length: 3 }, () => {
        const dot = makeRect({
          x: 0,
          y: 0,
          w: 4,
          h: 4,
          color: Number.isFinite(Number(surfaceAccentColor)) ? Number(surfaceAccentColor) >>> 0 : 0x648cb4,
          opacity: 0.6,
          z: HUD_Z_SURFACE_FG,
          order: HUD_RENDER_ORDER_ACTION_BUTTON_OFFSET,
        });
        if (dotTexture && dot.material) {
          dot.material.map = dotTexture;
          dot.material.needsUpdate = true;
        }
        const dotUserData = dot.userData ?? {};
        dotUserData.windowKey = windowKey;
        dotUserData.hudRole = "titleDot";
        dot.userData = dotUserData;
        return dot;
      });
    }

    if (windowKey === "hotbar") {
      const fillTexture = getHotbarFillTexture();
      const outlineTexture = getHotbarOutlineTexture();
      const shadowTexture = getHotbarShadowTexture();

      if (fillTexture && objs.bg?.material) {
        objs.bg.material.map = fillTexture;
        objs.bg.material.needsUpdate = true;
      }
      if (outlineTexture && objs.outline?.material) {
        objs.outline.material.map = outlineTexture;
        objs.outline.material.color.setHex(Number(surfaceAccentColor) >>> 0);
        objs.outline.material.opacity = 0.88;
        objs.outline.material.needsUpdate = true;
      }
      if (shadowTexture && objs.shadow?.material) {
        objs.shadow.material.map = shadowTexture;
        objs.shadow.material.opacity = 0.18;
        objs.shadow.material.needsUpdate = true;
      }
    }

    return objs;
  }

  return {
    createWindowObjects,
  };
}
