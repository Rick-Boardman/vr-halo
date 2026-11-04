// SPDX-License-Identifier: Apache-2.0
import {
  createCameraCanvasHud,
  DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX,
  DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX,
  positionHudInCameraCorner,
  drawRoundedRectPath,
} from "./camera-canvas-hud.js";

const DEFAULT_CAMERA_MESSAGE_HUD_CANVAS_HEIGHT_PX = 256;

/**
 * Create a camera-anchored status HUD that renders multiple text lines into a shared canvas panel.
 * Purpose: provide a reusable in-camera status readout for demos and debug harnesses that need lightweight text telemetry.
 * @param {object} [options={}] Status HUD configuration.
 * @param {any} options.THREE Three.js namespace used by createCameraCanvasHud(...).
 * @param {any} options.camera Camera that owns the HUD object.
 * @param {number} [options.depth=2.8] Distance from the camera used when placing the panel in the selected corner.
 * @param {string} [options.corner="top-right"] Camera-plane corner used for layout.
 * @param {number} [options.panelWidth=1.2] Background panel width in world units.
 * @param {number} [options.panelHeight=0.6] Background panel height in world units.
 * @param {number} [options.textPlaneWidth=1.15] Foreground text plane width in world units.
 * @param {number} [options.textPlaneHeight=0.55] Foreground text plane height in world units.
 * @param {number} [options.marginX=0.05] Horizontal corner margin in world units.
 * @param {number} [options.marginY=0.05] Vertical corner margin in world units.
 * @param {number} [options.canvasWidth=DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX] Canvas width in pixels.
 * @param {number} [options.canvasHeight=DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX] Canvas height in pixels.
 * @param {string} [options.font="48px monospace"] Canvas font used when drawing status lines.
 * @param {string} [options.fillStyle="lime"] Canvas fill style used for status text.
 * @param {number} [options.lineX=20] X offset in canvas pixels for each rendered line.
 * @param {number} [options.firstLineY=80] Y offset in canvas pixels for the first rendered line.
 * @param {number} [options.lineGap=80] Vertical gap in canvas pixels between consecutive lines.
 * @param {number} [options.backgroundColor=0x111111] Background panel color.
 * @param {number} [options.backgroundOpacity=0.7] Background panel opacity.
 * @returns {{ root: unknown, mesh: unknown, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, texture: unknown, markDirty: () => void, setVisible: (visible: boolean) => void, setPosition: (x: number, y: number, z: number) => void, layout: () => void, setLines: (lines: unknown) => void, dispose: () => void }} Camera-anchored status HUD controller with text update and cleanup helpers.
 * Side effects: creates canvas and Three.js HUD resources, attaches them to the camera, installs a window resize listener, and mutates canvas contents when lines are updated.
 */
export function createCameraStatusHud({
  THREE,
  camera,
  depth = 2.8,
  corner = "top-right",
  panelWidth = 1.2,
  panelHeight = 0.6,
  textPlaneWidth = 1.15,
  textPlaneHeight = 0.55,
  marginX = 0.05,
  marginY = 0.05,
  canvasWidth = DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX,
  canvasHeight = DEFAULT_CAMERA_HUD_CANVAS_HEIGHT_PX,
  font = "48px monospace",
  fillStyle = "lime",
  lineX = 20,
  firstLineY = 80,
  lineGap = 80,
  backgroundColor = 0x111111,
  backgroundOpacity = 0.7,
} = {}) {
  const hud = createCameraCanvasHud({
    THREE,
    camera,
    planeWidth: textPlaneWidth,
    planeHeight: textPlaneHeight,
    canvasWidth,
    canvasHeight,
    background: {
      width: panelWidth,
      height: panelHeight,
      color: backgroundColor,
      opacity: backgroundOpacity,
      depthTest: false,
      contentZ: 0.01,
    },
  });

  function layout() {
    positionHudInCameraCorner({
      object3d: hud.root,
      camera,
      depth,
      panelWidth,
      panelHeight,
      marginX,
      marginY,
      corner,
    });
  }

  function setLines(lines) {
    const values = Array.isArray(lines) ? lines : [String(lines ?? "")];
    const ctx = hud.context;
    ctx.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    ctx.font = font;
    ctx.fillStyle = fillStyle;
    values.forEach((line, index) => {
      ctx.fillText(String(line ?? ""), lineX, firstLineY + index * lineGap);
    });
    hud.markDirty();
  }

  layout();
  addEventListener("resize", layout);

  return {
    ...hud,
    layout,
    setLines,
    dispose() {
      removeEventListener("resize", layout);
    },
  };
}

/**
 * Create a camera-anchored transient message HUD that shows a rounded message banner for a limited duration.
 * Purpose: provide a reusable in-camera toast-style HUD for temporary user feedback in browser demos.
 * @param {object} [options={}] Message HUD configuration.
 * @param {any} options.THREE Three.js namespace used by createCameraCanvasHud(...).
 * @param {any} options.camera Camera that owns the HUD object.
 * @param {number} [options.planeWidth=2.2] Foreground text plane width in world units.
 * @param {number} [options.planeHeight=0.5] Foreground text plane height in world units.
 * @param {{ x?: number, y?: number, z?: number }} [options.position={ x: 0, y: -1.2, z: -2.5 }] Camera-local placement of the HUD root.
 * @param {number} [options.canvasWidth=DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX] Canvas width in pixels.
 * @param {number} [options.canvasHeight=DEFAULT_CAMERA_MESSAGE_HUD_CANVAS_HEIGHT_PX] Canvas height in pixels.
 * @param {string} [options.font="48px monospace"] Canvas font used for the message text.
 * @param {string} [options.fillStyle="lime"] Fill style used for message text.
 * @param {string} [options.backgroundFill="rgba(0,0,0,0.8)"] Fill style used for the rounded message box background.
 * @param {string} [options.outlineStyle="black"] Stroke style used for message text outlines.
 * @param {number} [options.outlineWidth=3] Stroke width used for message text outlines.
 * @param {number} [options.boxX=40] Left inset of the rounded message box in canvas pixels.
 * @param {number} [options.boxY=70] Top inset of the rounded message box in canvas pixels.
 * @param {number} [options.boxHeight=100] Rounded message box height in canvas pixels.
 * @param {number} [options.radius=20] Rounded-corner radius in canvas pixels.
 * @returns {{ root: unknown, mesh: unknown, canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, texture: unknown, markDirty: () => void, setVisible: (visible: boolean) => void, setPosition: (x: number, y: number, z: number) => void, hide: () => void, showMessage: (text: unknown, dur?: number) => void }} Camera-anchored message HUD with hide and timed message helpers.
 * Side effects: creates canvas and Three.js HUD resources, attaches them to the camera, mutates canvas contents, toggles HUD visibility, and schedules or clears a timeout when messages are shown.
 */
export function createCameraMessageHud({
  THREE,
  camera,
  planeWidth = 2.2,
  planeHeight = 0.5,
  position = { x: 0, y: -1.2, z: -2.5 },
  canvasWidth = DEFAULT_CAMERA_HUD_CANVAS_WIDTH_PX,
  canvasHeight = DEFAULT_CAMERA_MESSAGE_HUD_CANVAS_HEIGHT_PX,
  font = "48px monospace",
  fillStyle = "lime",
  backgroundFill = "rgba(0,0,0,0.8)",
  outlineStyle = "black",
  outlineWidth = 3,
  boxX = 40,
  boxY = 70,
  boxHeight = 100,
  radius = 20,
} = {}) {
  const hud = createCameraCanvasHud({
    THREE,
    camera,
    planeWidth,
    planeHeight,
    canvasWidth,
    canvasHeight,
    position,
  });
  hud.setVisible(false);

  let hideTimeoutId = null;

  function hide() {
    clearTimeout(hideTimeoutId);
    hud.setVisible(false);
  }

  function showMessage(text, dur = 3000) {
    const ctx = hud.context;
    ctx.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    drawRoundedRectPath(ctx, boxX, boxY, hud.canvas.width - boxX * 2, boxHeight, radius);
    ctx.fillStyle = backgroundFill;
    ctx.fill();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineStyle;
    ctx.fillStyle = fillStyle;
    const cx = hud.canvas.width / 2;
    const cy = hud.canvas.height / 2;
    ctx.strokeText(String(text ?? ""), cx, cy);
    ctx.fillText(String(text ?? ""), cx, cy);
    hud.markDirty();
    hud.setVisible(true);
    clearTimeout(hideTimeoutId);
    hideTimeoutId = setTimeout(() => hud.setVisible(false), dur);
  }

  return {
    ...hud,
    hide,
    showMessage,
  };
}
