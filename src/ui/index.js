// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the shared HUD overlay factory used by browser UI harnesses.
 * Parameters and return values: forwarded from createHudUiOverlays in ../ui-overlays.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported factory.
 */
export { createHudUiOverlays } from "../ui-overlays.js";

/**
 * Purpose: Re-export the shared camera-canvas HUD helpers.
 * Parameters and return values: forwarded from createCameraCanvasHud, getCameraPlaneSize, positionHudInCameraCorner, and drawRoundedRectPath in ./camera-canvas-hud.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  createCameraCanvasHud,
  getCameraPlaneSize,
  positionHudInCameraCorner,
  drawRoundedRectPath,
} from "./camera-canvas-hud.js";

/**
 * Purpose: Re-export the shared camera status and message HUD helpers.
 * Parameters and return values: forwarded from createCameraStatusHud and createCameraMessageHud in ./camera-panels.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported factories.
 */
export { createCameraStatusHud, createCameraMessageHud } from "./camera-panels.js";

/**
 * Purpose: Re-export the lightweight shared DOM overlay helpers.
 * Parameters and return values: forwarded from applyDomStyles, createDomOverlay, setDomOverlayVisible, toggleDomOverlay, and showTimedDomOverlay in ./dom-overlays.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  applyDomStyles,
  createDomOverlay,
  setDomOverlayVisible,
  toggleDomOverlay,
  showTimedDomOverlay,
} from "./dom-overlays.js";

/**
 * Purpose: Re-export the shared fullscreen overlay lifecycle helpers.
 * Parameters and return values: forwarded from bindFullscreenOverlayCloseButton, closeFullscreenOverlay, createFullscreenOverlay, and runFullscreenOverlayRenderLoop in ./fullscreen-overlay.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  bindFullscreenOverlayCloseButton,
  closeFullscreenOverlay,
  createFullscreenOverlay,
  runFullscreenOverlayRenderLoop,
} from "./fullscreen-overlay.js";

/**
 * Purpose: Re-export the shared HUD text layout helpers.
 * Parameters and return values: forwarded from normalizeLineEntry, wrapLinePreserveIndent, calcMaxCharsForWidthPx, wrapEntriesToLines, applyTreeToStringLines, and applyTreeToEntries in ../ui-text-layout.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  normalizeLineEntry,
  wrapLinePreserveIndent,
  calcMaxCharsForWidthPx,
  wrapEntriesToLines,
  applyTreeToStringLines,
  applyTreeToEntries,
} from "../ui-text-layout.js";

/**
 * Purpose: Re-export the shared screen-space HUD positioning helpers.
 * Parameters and return values: forwarded from calculateScreenScaleFactor, calculateHudHalfExtentsInNdc, createScreenSizePin, applyScreenSizePin, getCameraPlaneHalfExtents, handleScreenSizeResize, positionAtScreenCoordinate, and setCameraLocalHudPosition in ./screen-space.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  calculateScreenScaleFactor,
  calculateHudHalfExtentsInNdc,
  createScreenSizePin,
  applyScreenSizePin,
  getCameraPlaneHalfExtents,
  handleScreenSizeResize,
  positionAtScreenCoordinate,
  setCameraLocalHudPosition,
} from "./screen-space.js";

/**
 * Purpose: Re-export the shared draggable HUD overlay helper and base UI component classes.
 * Parameters and return values: forwarded from makeDraggableHUDOverlay, createHudBoxClass, createUIComponentClass, createCloseButtonClass, createContextMenuClass, createHudPanelClass, createResizeHandleClass, createScrollAreaClass, createTabsBarClass, and createTitleBarClass in their source modules.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported factories or use the re-exported classes.
 */
export { makeDraggableHUDOverlay } from "./hud-drag.js";
export { createHudBoxClass } from "./hud-box.js";
export { createUIComponentClass } from "./ui-component.js";
export { createCloseButtonClass } from "./close-button.js";
export { createContextMenuClass } from "./context-menu.js";
export { createHudPanelClass } from "./hud-panel.js";
export { createResizeHandleClass } from "./resize-handle.js";
export { createScrollAreaClass } from "./scroll-area.js";
export { createTabsBarClass } from "./tabs-bar.js";
export { createTitleBarClass } from "./title-bar.js";

/**
 * Purpose: Re-export the HUD chat panel — a scrolling transcript plus a Troika
 * composer, bound to an app-supplied transport rather than to any chat service.
 * Parameters and return values: forwarded from createHudChatPanel in ./chat-panel.js.
 * Side effects: none in this barrel; the factory creates two HUD windows and a
 * text editor when a caller invokes it.
 */
export { createHudChatPanel } from "./chat-panel.js";
