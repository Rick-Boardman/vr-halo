// SPDX-License-Identifier: Apache-2.0
import { HUD_WINDOW_RESIZE_HANDLE_SIZE_PX } from "./hud-layout-policy.js";

/**
 * Shared HUD window skinning: 9-slice frame overlays and title-bar textures.
 *
 * Games supply textures; Halo owns mesh allocation, UV application, and the
 * title-chrome layout used by render and click hit-testing.
 */

export const HUD_NINE_SLICE_PIECE_NAMES = Object.freeze([
  "tl",
  "top",
  "tr",
  "left",
  "center",
  "right",
  "bl",
  "bottom",
  "br",
]);

export const HUD_NINE_SLICE_DEFAULT_CORNER_PX = 40;

/** Title-readability treatments. Override with `?titlePoc=ink|outline|plaque|both|fill`. */
export const HUD_TITLE_POC_INK = "ink";
export const HUD_TITLE_POC_OUTLINE = "outline";
export const HUD_TITLE_POC_PLAQUE = "plaque";
export const HUD_TITLE_POC_BOTH = "both";
export const HUD_TITLE_POC_FILL = "fill";
/** Default for skinned stone panels: parchment + outline on a dark nameplate. */
export const HUD_TITLE_POC_DEFAULT = HUD_TITLE_POC_BOTH;
/** Shift skinned title glyphs up inside the nameplate (layout px). */
export const HUD_SKINNED_TITLE_TEXT_NUDGE_PX = 3;

/** Olive/gold/parchment chrome used by stone-skinned HUD overlays, scrollbars, and hotbar. */
export const HUD_STONE_SKIN_CHROME = Object.freeze({
  olive: 0x14190c,
  well: 0x1c2610,
  gold: 0xd4b56a,
  goldBright: 0xe8c97a,
  parchment: 0xf3e2b0,
  ink: 0x1a1408,
});

/**
 * @param {object | null | undefined} hud
 * @returns {typeof HUD_STONE_SKIN_CHROME | null}
 */
export function getHudStoneSkinChrome(hud) {
  return hud?.ui?.stoneSkin ? HUD_STONE_SKIN_CHROME : null;
}

const TITLE_POC_PARCHMENT = 0xf3e2b0;
const TITLE_POC_INK = 0x1a1408;

/**
 * Resolve the active title-readability POC.
 * Prefers `hud.ui.titleReadabilityPoc`, then `?titlePoc=`, then plaque+outline.
 *
 * @param {object | null | undefined} [hud]
 * @returns {{ id: string, color: number, outlineWidth: number, outlineColor: number, outlineOpacity: number, fontWeight: string | null, showPlaque: boolean, headerKey: "headerBar" | "headerBarFill" }}
 */
export function resolveHudTitleReadabilityPoc(hud = null) {
  let id = String(hud?.ui?.titleReadabilityPoc ?? "").trim().toLowerCase();
  if (!id && typeof location !== "undefined" && location?.search) {
    try {
      id = String(new URLSearchParams(location.search).get("titlePoc") ?? "").trim().toLowerCase();
    } catch {
      id = "";
    }
  }
  if (!id) id = HUD_TITLE_POC_DEFAULT;

  const parchment = {
    color: TITLE_POC_PARCHMENT,
    outlineWidth: 0,
    outlineColor: TITLE_POC_INK,
    outlineOpacity: 0,
    fontWeight: "700",
    showPlaque: false,
    headerKey: "headerBar",
  };

  switch (id) {
    case HUD_TITLE_POC_OUTLINE:
      return { id, ...parchment, outlineWidth: 2.2, outlineOpacity: 0.92 };
    case HUD_TITLE_POC_PLAQUE:
      return { id, ...parchment, showPlaque: true };
    case HUD_TITLE_POC_BOTH:
      return { id, ...parchment, outlineWidth: 2.0, outlineOpacity: 0.9, showPlaque: true };
    case HUD_TITLE_POC_FILL:
      return { id, ...parchment, headerKey: "headerBarFill", outlineWidth: 1.6, outlineOpacity: 0.85 };
    case HUD_TITLE_POC_INK:
    default:
      return {
        id: HUD_TITLE_POC_INK,
        color: TITLE_POC_INK,
        outlineWidth: 0,
        outlineColor: TITLE_POC_PARCHMENT,
        outlineOpacity: 0,
        fontWeight: null,
        showPlaque: false,
        headerKey: "headerBar",
      };
  }
}

const TITLE_CONTROL_SLOT_W = 22;
const TITLE_CONTROL_BTN_W = 18;
const TITLE_CONTROL_BTN_H = 20;
const TITLE_CONTROL_INSET_X = 2;
const TITLE_CONTROL_INSET_Y = 4;

/**
 * @param {object | null | undefined} objs Window object set.
 * @param {object | null | undefined} win Window model.
 * @param {number} titleH Canonical title-bar height in layout pixels.
 * @returns {number} Active 9-slice corner size, or 0 when the skin is not drawn.
 */
export function getHudNineSliceCornerSize(objs, win, titleH) {
  const ns = objs?.nineSlice;
  if (!ns) return 0;
  const c = Number(ns.cornerSize);
  if (!Number.isFinite(c) || c <= 0) return 0;
  const h = win?.collapsed ? titleH : win?.h;
  if (!Number.isFinite(h) || h < c * 2) return 0;
  return c;
}

/**
 * Title-bar and window-control layout. When a 9-slice frame is active the title
 * plaque sits between the left/right frame pieces so corner ornaments stay visible.
 *
 * @param {object} win Window model.
 * @param {object | null | undefined} objs Window object set.
 * @param {number} titleH Canonical title-bar height in layout pixels.
 * @returns {{ x: number, y: number, w: number, h: number, inset: number, skinned: boolean, dragH: number, controlSlotW: number, controlBtnW: number, controlBtnH: number, controlInsetX: number, controlInsetY: number }}
 */
export function getHudWindowTitleChrome(win, objs, titleH) {
  const c = getHudNineSliceCornerSize(objs, win, titleH);
  const h = titleH;
  const skinned = !!objs?.nineSlice;
  if (!c) {
    return {
      x: win.x,
      y: win.y,
      w: win.w,
      h,
      inset: 0,
      skinned,
      dragH: h,
      controlSlotW: TITLE_CONTROL_SLOT_W,
      controlBtnW: TITLE_CONTROL_BTN_W,
      controlBtnH: TITLE_CONTROL_BTN_H,
      controlInsetX: TITLE_CONTROL_INSET_X,
      controlInsetY: TITLE_CONTROL_INSET_Y,
    };
  }
  return {
    x: win.x + c,
    y: win.y + Math.max(0, Math.floor((c - h) / 2)),
    w: Math.max(1, win.w - 2 * c),
    h,
    inset: c,
    skinned,
    dragH: Math.max(h, c),
    controlSlotW: TITLE_CONTROL_SLOT_W,
    controlBtnW: TITLE_CONTROL_BTN_W,
    controlBtnH: TITLE_CONTROL_BTN_H,
    controlInsetX: TITLE_CONTROL_INSET_X,
    controlInsetY: TITLE_CONTROL_INSET_Y,
  };
}

const SKIN_CONTROL_BTN = 16;
const SKIN_CONTROL_SLOT = 18;
const SKIN_CONTROL_PAD = 4;

/**
 * Visual and hit rects for title controls and the resize grip.
 * Skinned windows use smaller olive/gold buttons centered in the nameplate
 * and inset the resize handle inside the 9-slice corner.
 *
 * @param {object} win
 * @param {object | null | undefined} objs
 * @param {number} titleH
 * @returns {{ chrome: object, close: object | null, min: object | null, action: object | null, copy: object | null, resize: object | null }}
 */
export function getHudWindowControlRects(win, objs, titleH) {
  const chrome = getHudWindowTitleChrome(win, objs, titleH);
  const windowH = win.collapsed ? titleH : win.h;
  const skinned = !!objs?.nineSlice;
  const hasClose = !!objs?.closeBtn && win.closeable !== false;
  const hasMin = !!objs?.minBtn && win.minimizable !== false;
  const isDebug = String(win.key ?? objs?._windowKey ?? "") === "debug";
  const hasAction = !!objs?.actionBtn;
  const btnW = skinned ? SKIN_CONTROL_BTN : chrome.controlBtnW;
  const btnH = skinned ? SKIN_CONTROL_BTN : chrome.controlBtnH;
  const slotW = skinned ? SKIN_CONTROL_SLOT : chrome.controlSlotW;
  let insetX;
  let insetY;
  if (skinned && chrome.inset) {
    const plateH = Math.max(8, chrome.h - 10);
    insetX = SKIN_CONTROL_PAD;
    insetY = 5 + Math.max(0, Math.floor((plateH - btnH) / 2));
  } else if (skinned) {
    insetX = SKIN_CONTROL_PAD;
    insetY = Math.max(0, Math.floor((chrome.h - btnH) / 2));
  } else {
    insetX = chrome.controlInsetX;
    insetY = chrome.controlInsetY;
  }

  function slotRect(slotFromRight) {
    return {
      x: chrome.x + chrome.w - slotW * slotFromRight + insetX,
      y: chrome.y + insetY,
      w: btnW,
      h: btnH,
    };
  }

  const close = hasClose ? slotRect(1) : null;
  const min = hasMin ? slotRect(hasClose ? 2 : 1) : null;
  const copy = isDebug && hasAction ? slotRect((hasClose ? 1 : 0) + (hasMin ? 1 : 0) + 1) : null;
  const action = hasAction
    ? slotRect((hasClose ? 1 : 0) + (hasMin ? 1 : 0) + (isDebug ? 2 : 1))
    : null;

  let resize = null;
  if (objs?.resizeHandle && !win.collapsed) {
    const size = HUD_WINDOW_RESIZE_HANDLE_SIZE_PX;
    resize = {
      x: win.x + win.w - size,
      y: win.y + windowH - size,
      w: size,
      h: size,
    };
  }

  return { chrome, close, min, action, copy, resize };
}

function configureHudTexture(tex, THREE) {
  if (!tex) return tex;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Load the canonical 9-slice + optional header-bar textures from a directory.
 *
 * @param {object} THREE Three.js namespace.
 * @param {string} [basePath="assets/hud/"] Directory containing tl.png…br.png and header_bar.png.
 * @returns {{ tl: object, top: object, tr: object, left: object, center: object, right: object, bl: object, bottom: object, br: object, headerBar: object }}
 */
export function loadHudWindowSkinTextures(THREE, basePath = "assets/hud/") {
  const loader = new THREE.TextureLoader();
  const root = String(basePath || "assets/hud/").replace(/\/?$/, "/");
  const textures = {};
  for (const name of HUD_NINE_SLICE_PIECE_NAMES) {
    textures[name] = configureHudTexture(loader.load(`${root}${name}.png`), THREE);
  }
  textures.headerBar = configureHudTexture(loader.load(`${root}header_bar.png?v=knotwork-strip`), THREE);
  textures.headerBarFill = configureHudTexture(loader.load(`${root}header_bar_fill.png?v=olive-well`), THREE);
  return textures;
}

function makeSkinQuad(THREE, hud, map, color = 0xffffff) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: map || null,
    color,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  hud.plane.add(mesh);
  return mesh;
}

let skinControlTextures = null;

function createSkinControlCanvasTexture(THREE, draw) {
  if (typeof document === "undefined" || !THREE?.CanvasTexture) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 64, 64);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function getSkinControlTextures(THREE) {
  if (skinControlTextures) return skinControlTextures;
  const fill = "#1c2610";
  const stroke = "#d4b56a";
  const glyph = "#f3e2b0";

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function plate(ctx) {
    roundRect(ctx, 6, 6, 52, 52, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  const min = createSkinControlCanvasTexture(THREE, (ctx) => {
    plate(ctx);
    ctx.strokeStyle = glyph;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(18, 32);
    ctx.lineTo(46, 32);
    ctx.stroke();
  });
  const close = createSkinControlCanvasTexture(THREE, (ctx) => {
    plate(ctx);
    ctx.strokeStyle = glyph;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(44, 44);
    ctx.moveTo(44, 20);
    ctx.lineTo(20, 44);
    ctx.stroke();
  });
  const action = createSkinControlCanvasTexture(THREE, (ctx) => {
    plate(ctx);
    ctx.strokeStyle = glyph;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(18, 22);
    ctx.lineTo(46, 22);
    ctx.moveTo(18, 32);
    ctx.lineTo(46, 32);
    ctx.moveTo(18, 42);
    ctx.lineTo(46, 42);
    ctx.stroke();
  });
  const resize = createSkinControlCanvasTexture(THREE, (ctx) => {
    ctx.strokeStyle = "rgba(212,181,106,0.92)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(14 + i * 10, 56);
      ctx.lineTo(56, 14 + i * 10);
      ctx.stroke();
    }
  });

  function scrollArrow(direction, enabled) {
    return createSkinControlCanvasTexture(THREE, (ctx) => {
      roundRect(ctx, 8, 4, 48, 56, 8);
      ctx.fillStyle = enabled ? fill : "rgba(28,38,16,0.35)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = enabled ? stroke : "rgba(212,181,106,0.28)";
      ctx.stroke();
      ctx.fillStyle = enabled ? glyph : "rgba(243,226,176,0.35)";
      ctx.beginPath();
      if (direction === "up") {
        ctx.moveTo(32, 18);
        ctx.lineTo(16, 42);
        ctx.lineTo(48, 42);
      } else {
        ctx.moveTo(16, 22);
        ctx.lineTo(48, 22);
        ctx.lineTo(32, 46);
      }
      ctx.closePath();
      ctx.fill();
    });
  }

  const scrollTrack = createSkinControlCanvasTexture(THREE, (ctx) => {
    ctx.fillStyle = "rgba(20,28,12,0.88)";
    ctx.fillRect(0, 0, 64, 64);
  });
  const scrollThumb = createSkinControlCanvasTexture(THREE, (ctx) => {
    roundRect(ctx, 10, 4, 44, 56, 8);
    ctx.fillStyle = stroke;
    ctx.fill();
  });

  skinControlTextures = {
    min,
    close,
    action,
    resize,
    scrollTrack,
    scrollThumb,
    scrollUp: scrollArrow("up", true),
    scrollDown: scrollArrow("down", true),
    scrollUpDisabled: scrollArrow("up", false),
    scrollDownDisabled: scrollArrow("down", false),
  };
  return skinControlTextures;
}

function applySkinControlTexture(mesh, texture) {
  if (!mesh?.material || !texture) return;
  mesh.material.map = texture;
  mesh.material.color.setHex(0xffffff);
  mesh.material.opacity = 1;
  mesh.material.transparent = true;
  mesh.material.needsUpdate = true;
}

function applySkinnedWindowControls(THREE, objs) {
  const tex = getSkinControlTextures(THREE);
  if (!tex) return;
  applySkinControlTexture(objs.minBtn, tex.min);
  applySkinControlTexture(objs.closeBtn, tex.close);
  applySkinControlTexture(objs.actionBtn, tex.action);
  applySkinControlTexture(objs.resizeHandle, tex.resize);
  applySkinControlTexture(objs.scrollTrack, tex.scrollTrack);
  applySkinControlTexture(objs.scrollThumb, tex.scrollThumb);
  applySkinControlTexture(objs.scrollUpBtn, tex.scrollUp);
  applySkinControlTexture(objs.scrollDownBtn, tex.scrollDown);
}

export function applyHudStoneSharedChrome({ THREE, hud }) {
  if (!hud?.ui) return;
  hud.ui.stoneSkin = HUD_STONE_SKIN_CHROME;
  const chrome = HUD_STONE_SKIN_CHROME;
  const overlay = hud.objects?.overlay;
  if (overlay?.tooltipBg?.material?.color) overlay.tooltipBg.material.color.setHex(chrome.well);
  if (overlay?.tooltipBg?.material) overlay.tooltipBg.material.opacity = 0.94;
  if (overlay?.menuBg?.material?.color) overlay.menuBg.material.color.setHex(chrome.olive);
  if (overlay?.menuHover?.material?.color) overlay.menuHover.material.color.setHex(chrome.gold);
  if (overlay?.menuHover?.material) overlay.menuHover.material.opacity = 0.55;

  const hotbarWin = hud.ui.windows?.hotbar;
  if (hotbarWin) {
    hotbarWin.borderColor = chrome.gold;
    hotbarWin.borderOpacity = 0.92;
    hotbarWin.panelBgColor = chrome.olive;
    hotbarWin.panelBgOpacity = 1;
  }
  for (const dot of hud.objects?.hotbarGripDots ?? []) {
    if (dot?.material?.color) dot.material.color.setHex(chrome.gold);
  }
  const tex = getSkinControlTextures(THREE);
  if (tex) {
    for (const objs of Object.values(hud.objects?.windows ?? {})) {
      applySkinControlTexture(objs?.scrollTrack, tex.scrollTrack);
      applySkinControlTexture(objs?.scrollThumb, tex.scrollThumb);
      applySkinControlTexture(objs?.scrollUpBtn, tex.scrollUp);
      applySkinControlTexture(objs?.scrollDownBtn, tex.scrollDown);
    }
  }
}

function applyHeaderBarTexture(objs, win, headerTex, THREE) {
  if (!headerTex || !objs?.title?.material) return;
  const hdrTex = headerTex.clone();
  configureHudTexture(hdrTex, THREE);
  // Full-bleed strip: the asset is already a short title band. Do not crop a
  // square banner (repeat-Y hacks squash ornament and expose chroma).
  hdrTex.repeat.set(1, 1);
  hdrTex.offset.set(0, 0);
  if (typeof hdrTex.needsUpdate !== "undefined") hdrTex.needsUpdate = true;
  objs.title.material.map = hdrTex;
  objs.title.material.transparent = true;
  objs.title.material.color.setHex(0xffffff);
  objs.title.material.needsUpdate = true;
  if (win) {
    win.titleBarColor = 0xffffff;
    win.titleBarOpacity = 1;
    win.showTitleDots = false;
  }
}

/**
 * Attach a 9-slice frame (and optional title-bar texture) to one HUD window.
 *
 * @param {object} options
 * @param {object} options.THREE Three.js namespace.
 * @param {object} options.hud HUD state (`hud.plane`, `hud.objects.windows`, `hud.ui.windows`).
 * @param {string} windowKey Window id.
 * @param {object} textures Piece textures plus optional `headerBar`.
 * @param {number} [cornerSize=40] Layout-pixel size of corner pieces.
 * @returns {object | null} The window's `nineSlice` object, or null if the window is missing.
 */
export function applyHudWindowSkin({ THREE, hud }, windowKey, textures, cornerSize = HUD_NINE_SLICE_DEFAULT_CORNER_PX) {
  const key = String(windowKey ?? "").trim();
  const objs = hud?.objects?.windows?.[key];
  const win = hud?.ui?.windows?.[key];
  if (!key || !objs || !hud.plane) return null;

  if (objs.nineSlice) {
    objs._hudSkinTextures = textures;
    if (!objs.titleNameplate) {
      const plate = makeSkinQuad(THREE, hud, null, 0x14190c);
      plate.material.opacity = 0.88;
      plate.userData.windowKey = key;
      plate.userData.hudRole = "titleNameplate";
      objs.titleNameplate = plate;
    }
    applyHeaderBarTexture(objs, win, textures?.headerBar, THREE);
    applySkinnedWindowControls(THREE, objs);
    objs.nineSlice.cornerSize = Number.isFinite(cornerSize)
      ? Number(cornerSize)
      : HUD_NINE_SLICE_DEFAULT_CORNER_PX;
    return objs.nineSlice;
  }

  const nineSlice = {
    cornerSize: Number.isFinite(cornerSize)
      ? Number(cornerSize)
      : HUD_NINE_SLICE_DEFAULT_CORNER_PX,
  };
  for (const name of HUD_NINE_SLICE_PIECE_NAMES) {
    const mesh = makeSkinQuad(THREE, hud, textures?.[name] ?? null);
    mesh.userData.windowKey = key;
    mesh.userData.hudRole = `nineSlice:${name}`;
    nineSlice[name] = mesh;
  }
  objs.nineSlice = nineSlice;
  if (!objs.titleNameplate) {
    const plate = makeSkinQuad(THREE, hud, null, 0x14190c);
    plate.material.opacity = 0.88;
    plate.userData.windowKey = key;
    plate.userData.hudRole = "titleNameplate";
    objs.titleNameplate = plate;
  }
  objs._hudSkinTextures = textures;
  applyHeaderBarTexture(objs, win, textures?.headerBar, THREE);
  applySkinnedWindowControls(THREE, objs);
  return nineSlice;
}

/**
 * Skin every listed window. Unknown or not-yet-created keys are skipped.
 *
 * @param {object} ctx `{ THREE, hud }`
 * @param {Iterable<string>} windowKeys
 * @param {object} textures
 * @param {number} [cornerSize]
 * @returns {string[]} Keys that received a skin.
 */
export function applyHudWindowSkinToWindows(ctx, windowKeys, textures, cornerSize = HUD_NINE_SLICE_DEFAULT_CORNER_PX) {
  const applied = [];
  for (const key of windowKeys ?? []) {
    if (applyHudWindowSkin(ctx, key, textures, cornerSize)) applied.push(key);
  }
  applyHudStoneSharedChrome(ctx);
  return applied;
}
