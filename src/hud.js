// SPDX-License-Identifier: Apache-2.0
// Minimal HUD library extracted from the canonical integration harness.
// Design goals: WebGL-native UI (no DOM), stable VR ray->UV picking, desktop mouse support.

import { createWorldHoverOutline as _createWorldHoverOutline } from "./world-hover-outline.js";
import { createXrControllers as _createXrControllers } from "./xr-controllers.js";

import { getSelectionRects as _getSelectionRects } from "troika-three-text";

import {
  wrapEntriesToLines as _wrapEntriesToLines,
} from "./ui-text-layout.js?v=workflow4-inline-render-5";
import { copyTextToClipboard } from "./ui/clipboard.js";
import { normalizeHudOptions } from "./hud-options-normalize-runtime.js";
import { resolveWindowPresetOptions } from "./hud-window-presets.js?v=status-close-1";
import { createHudGeometryRuntime } from "./hud-geometry-runtime.js";
import { createHudHotbarRuntime } from "./hud-hotbar-runtime.js";
import { createHudBuildUiRuntime } from "./hud-build-ui-runtime.js";
import { createHudControllerRayRuntime } from "./hud-controller-ray-runtime.js";
import { createHudVrControllerSetupRuntime } from "./hud-vr-controller-setup-runtime.js";
import { createHudDebugOverlayRuntime } from "./hud-debug-overlay-runtime.js";
import { createHudFrameUpdateRuntime } from "./hud-frame-update-runtime.js";
import { createHudDebugEntriesRuntime } from "./hud-debug-entries-runtime.js";
import { createHudClickRuntime } from "./hud-click-runtime.js?v=control-hit-1";

import { createHudDragRuntime } from "./hud-drag-runtime.js";
import { createHudDragResetRuntime } from "./hud-drag-reset-runtime.js";
import { createHudHelpContentRuntime } from "./hud-help-content-runtime.js";
import { createHudHitMarkersRuntime } from "./hud-hit-markers-runtime.js";
import { createHudInteractionStateRuntime } from "./hud-interaction-state-runtime.js";
import { createHudLayoutSizingRuntime } from "./hud-layout-sizing-runtime.js";
import { createHudMetricsUpdater } from "./hud-metrics-runtime.js";

import { createHudPlacementRuntime } from "./hud-placement-runtime.js";
import { createHudPositionRectRuntime } from "./hud-position-rect-runtime.js";
import { createHudRenderTimeMeshMatrixRuntime } from "./hud-render-time-mesh-matrix-runtime.js";
import { installHudDesktopInputRuntime } from "./hud-desktop-input-runtime.js";
import { getHudDesktopClientSize } from "./hud-desktop-client-size.js";
import { createHudPointerStepRuntime } from "./hud-pointer-step-runtime.js";
import { createHudResizeRuntime } from "./hud-resize-runtime.js";

import { createHudVrAutoLayoutRuntime } from "./hud-vr-auto-layout-runtime.js";
import { createHudDragState } from "./hud-drag-state-runtime.js";
import { createHudVrDepthScratchRuntime } from "./hud-vr-depth-scratch-runtime.js";
import { createHudVrDepthDragRuntime } from "./hud-vr-depth-drag-runtime.js";
import { createHudVrBillboardRuntime } from "./hud-vr-billboard-runtime.js";
import { createHudVrSphereRuntime } from "./hud-vr-sphere-runtime.js";
import { createHudXrSessionRuntime } from "./hud-xr-session-runtime.js";
import { createHudTroikaTextRuntime } from "./hud-troika-text-runtime.js?v=row-height-1";
import { createHudVrTooltipScratchRuntime } from "./hud-vr-tooltip-scratch-runtime.js";
import { createHudVrDepthInputRuntime } from "./hud-vr-depth-input-runtime.js";
import { createHudVrPointerRuntime } from "./hud-vr-pointer-runtime.js";
import { createHudRenderListRuntime } from "./hud-render-list-runtime.js?v=control-hit-1";
import { createHudWindowContentDispatchRuntime } from "./hud-window-content-dispatch-runtime.js";
import { createHudWindowFactoryRuntime } from "./hud-window-factory-runtime.js";

import { createHudWindowLayoutRuntime } from "./hud-window-layout-runtime.js";
import { createHudWindowLifecycleRuntime } from "./hud-window-lifecycle-runtime.js";
import { createHudPanelStorageRuntime } from "./hud-panel-storage-runtime.js";

import { createHudWindowObjectVisibilityRuntime } from "./hud-window-object-visibility-runtime.js";
import { createHudWindowPlaneZRuntime } from "./hud-window-plane-z-runtime.js";
import { createHudWindowRenderLayoutRuntime } from "./hud-window-render-layout-runtime.js?v=title-poc-3";
import { createHudWindowTextRenderOrderRuntime } from "./hud-window-text-render-order-runtime.js";
import { createHudWindowStateRuntime } from "./hud-window-state-runtime.js";
import { createHudWindowVisibilityRuntime } from "./hud-window-visibility-runtime.js";
import {
  loadHudWindowSkinTextures,
  applyHudWindowSkin,
  applyHudWindowSkinToWindows,
} from "./hud-window-skin-runtime.js?v=rivet-grip-1";
import {
  HudWindowBase,
} from "./hud-window-model.js";
import { createHudStateInit } from "./hud-state-init-runtime.js";
import {
  HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX,
  HUD_HOTBAR_SLOT_SIZE_PX,
  HUD_OVERLAY_PADDING_PX,
  HUD_VR_LAYOUT_INTER_WINDOW_GAP_X_PX,
  HUD_VR_LAYOUT_INTER_WINDOW_GAP_Y_PX,
  HUD_VR_LAYOUT_OUTER_PADDING_PX,
  HUD_WINDOW_CLAMP_MIN_VISIBLE_PX,
  HUD_WINDOW_HIDDEN_Y_PX,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_WINDOW_VR_RIGHT_X_PX,
  HUD_SURFACE_ELEMENT_OPACITY,
  getHudGlyphDotSizePx,
  getHudTextLineHeightPx,
} from "./hud-layout-policy.js";
import {
  HUD_PRIMARY_HIGHLIGHT_COLOR,
  HUD_SECONDARY_HIGHLIGHT_COLOR,
  HUD_WORLD_COLLISION_DOT_COLOR,
} from "./hud-highlight-style.js";
import {
  HUD_DESKTOP_DISTANCE_M,
} from "./hud-placement-policy.js";
import { getNormalizedClientPoint } from "./pointer-coordinates.js";
import { clamp } from "./scalar-math.js";
import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_INFO_COLOR,
  HUD_TEXT_MUTED_COLOR,
} from "./hud-text-style.js";
import {
  applyHudThemeToWindows,
  resolveHudTheme,
} from "./hud-surface-style.js";
import { createHudUiOverlays } from "./ui-overlays.js?v=control-hit-1";
import {
  fmtVec3,
  fmtRad,
  fmtBool,
  normalizeEntriesToText,
  parseHexColor,
  rectContains,
  rectContainsSlop,
} from "./hud-format.js";

const HUD_GROUP_RENDER_ORDER = 10000;

/**
 * Purpose: Re-export the canonical scene navigation factory from the shared HUD entrypoint.
 * Parameters: forwarded from createSceneNavigation in ./navigation/scene-navigation.js.
 * Return value: forwards the createSceneNavigation return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneNavigation.
 */
export { createSceneNavigation } from "./navigation/scene-navigation.js";

/**
 * Purpose: Re-export the canonical XR controller wiring helper from the shared HUD entrypoint.
 * Parameters: forwarded from createXrControllers in ./xr-controllers.js.
 * Return value: forwards the createXrControllers return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createXrControllers.
 */
export { createXrControllers } from "./xr-controllers.js";

/**
 * Purpose: Re-export the canonical world-hover outline helper from the shared HUD entrypoint.
 * Parameters: forwarded from createWorldHoverOutline in ./world-hover-outline.js.
 * Return value: forwards the createWorldHoverOutline return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createWorldHoverOutline.
 */
export { createWorldHoverOutline } from "./world-hover-outline.js";

/**
 * Purpose: Re-export the canonical scene rig factory from the shared HUD entrypoint.
 * Parameters: forwarded from createSceneRig in ./rig.js.
 * Return value: forwards the createSceneRig return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneRig.
 */
export { createSceneRig } from "./rig.js";

/**
 * Purpose: Re-export the canonical HUD frame renderer from the shared HUD entrypoint.
 * Parameters: forwarded from renderHudFrame in ./frame-loop.js.
 * Return value: forwards the renderHudFrame return contract from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke renderHudFrame.
 */
export { renderHudFrame } from "./frame-loop.js";

/**
 * Purpose: Re-export the canonical scene bootstrap factory from the shared HUD entrypoint.
 * Parameters: forwarded from createSceneHudBootstrap in ./scene-hud-bootstrap.js.
 * Return value: forwards the createSceneHudBootstrap return shape from the underlying module.
 * Side effects: none in this barrel; side effects occur when callers invoke createSceneHudBootstrap.
 */
export { createSceneHudBootstrap } from "./scene-hud-bootstrap.js";

/**
 * Purpose: Create the canonical WebGL-native HUD system used by shared runtime harnesses for desktop and WebXR overlays, input capture, windows, and debug visuals.
 * @param {object} [options] HUD-system configuration.
 * @param {object} [options.THREE] Three.js namespace used to allocate meshes, geometries, materials, vectors, quaternions, matrices, and raycasters for the HUD scene graph.
 * @param {{ domElement?: HTMLElement, xr?: { isPresenting?: boolean, getSession?: () => unknown }, setSize?: (width: number, height: number, updateStyle?: boolean) => void }} [options.renderer] Renderer that owns the HUD presentation surface and XR state.
 * @param {{ aspect?: number, updateProjectionMatrix?: () => void }} [options.camera] Camera used for HUD-facing math, debug overlay rendering, and resize updates.
 * @param {{ add?: (object: unknown) => void }} [options.scene] Scene that receives the HUD root and any debug overlay content.
 * @param {{ enabled?: boolean } | null} [options.worldControls] Optional external world-controls object that is disabled while HUD interactions capture input.
 * @param {(enabled: boolean) => void} [options.setWorldControlsEnabled] Optional callback used to toggle world controls when HUD focus changes.
 * @param {() => boolean} [options.getWorldControlsEnabled] Optional callback returning the current world-control enabled state.
 * @param {{ ray0?: unknown, ray1?: unknown, grip0?: unknown, grip1?: unknown } | null} [options.controllers] Optional controller bundle; when omitted the HUD resolves its own canonical XR controller references.
 * @param {boolean} [options.showControllerRays=true] Whether XR controller ray visuals remain visible when controller support is active.
 * @param {"default" | "minimal" | undefined} [options.uiPreset] Optional HUD preset; "default" enables the canonical multi-window layout and "minimal" keeps the hotbar-focused presentation.
 * @param {Array<unknown> | null} [options.worldRaycastTargets] Optional array of world-space objects exposed for desktop hover outlines and VR/world hit testing.
 * @param {unknown} [options.desktopAnchor] Optional desktop anchor object for positioning the HUD quad in non-XR mode.
 * @param {unknown} [options.vrAnchor] Optional VR anchor object for positioning the HUD quad in immersive mode.
 * @param {{ getWorldPosition?: (target: unknown) => unknown } | null} [options.movementTarget] Optional moving object sampled for HUD speed and locomotion metrics.
 * @param {object | null} [options.rigDebug] Optional rig/debug reference bag supplied by walkabout bootstrap code.
 * @param {number} [options.vrLayoutW=HUD_LAYOUT_DEFAULT_WIDTH_PX] Virtual HUD layout width in pixels for VR window placement.
 * @param {number} [options.vrLayoutH=HUD_LAYOUT_DEFAULT_HEIGHT_PX] Virtual HUD layout height in pixels for VR window placement.
 * @param {number} [options.vrScaleW=HUD_VR_SURFACE_WIDTH_M] Physical HUD surface width in meters while presenting in VR.
 * @param {number} [options.vrScaleH=HUD_VR_SURFACE_HEIGHT_M] Physical HUD surface height in meters while presenting in VR.
 * @param {number} [options.vrDistance=HUD_VR_DISTANCE_M] Default HUD distance from the viewer in meters while presenting in VR.
 * @param {number} [options.vrYOffset=HUD_VR_Y_OFFSET_M] Default vertical HUD offset in meters while presenting in VR.
 * @param {number | null} [options.xrFramebufferScaleFactor=null] Optional XR framebuffer scale factor forwarded into the active XR session when supported.
 * @param {(() => void) | null} [options.onEnterVR] Optional callback invoked after the HUD transitions into immersive VR mode.
 * @param {(() => void) | null} [options.onExitVR] Optional callback invoked after the HUD exits immersive VR mode.
 * @param {((payload: { index: number, windowKey: string, x: number, y: number }) => void) | null} [options.onHotbarSlot] Optional callback invoked when a HUD hotbar slot is activated.
 * @param {string} [options.windowClampMode="strict"] Window-clamp policy string forwarded into HUD window positioning logic.
 * @param {number} [options.windowClampMinVisiblePx=HUD_WINDOW_CLAMP_MIN_VISIBLE_PX] Minimum visible-pixel threshold used by the HUD window clamp policy.
 * @param {string | object} [options.theme="professional"] HUD window theme preset name or override bag.
 * @param {number} [options.hotbarSlotCount] Optional hotbar slot-count override; apps can enlarge the shared hotbar while the runtime keeps the final two slots reserved for debug/help system actions unless disabled.
 * @param {boolean} [options.reserveSystemHotbarSlots=true] Whether the shared debug/help hotbar tail stays reserved instead of yielding all slots to the app.
 * @param {Array<string> | null} [options.hotbarTooltips] Optional per-slot tooltip labels shown for the canonical hotbar.
 * @param {Array<string> | null} [options.visibleWindowKeys] Optional list of shared panel keys that should exist at startup; omitted panels are not created.
 * @param {Array<string> | null} [options.hiddenWindowKeys] Optional list of shared panel keys that should start hidden while retaining their shared behavior.
 * @param {"bars" | "text" | string | undefined} [options.statusMode] Optional status-window display mode; the canonical defaults are bars for full HUD and text for minimal HUD.
 * @param {boolean} [options.enableDesktopContextMenu=true] Whether desktop right-click should open the HUD context menu.
 * @param {object | undefined} [options.features] Reserved feature-flag bag for callers that need to thread optional HUD capabilities without changing the public signature.
 * @param {boolean} [options.autoHandleResize=true] Whether the HUD installs its own desktop resize listener to keep renderer, camera, and HUD layout sizing synchronized.
 * @param {number} [options.vrDepthMinRadius=HUD_VR_DEPTH_MIN_RADIUS_M] Minimum viewer radius in meters allowed by per-window VR depth adjustments.
 * @param {number} [options.vrDepthMaxRadius=Infinity] Maximum viewer radius in meters allowed by per-window VR depth adjustments.
 * @returns {{ hud: object, controllers: unknown, update: (dt?: number) => void, renderDebugOverlay: () => void, handleResize: () => void, dispose: () => void, setNavigationHelpProfile: (profile: string | null | undefined) => void, setHelpExtraLines: (lines: Array<unknown> | null | undefined) => void, setHelpOverrideLines: (lines: Array<unknown> | null | undefined) => void, toggleHelp: () => void, bringToFront: (windowKey: string) => void, setWindowCollapsed: (windowKey: string, collapsed: boolean) => void, setWindowHidden: (windowKey: string, hidden: boolean) => void, setWindowLines: (windowKey: string, entries: Array<unknown> | unknown, options?: { append?: boolean, scrollMode?: string }) => void, setWindowScrollTop: (windowKey: string, scrollTop: number, scrollMode?: string) => void, setWindowTextCaret: (windowKey: string, caretState: object | null | undefined) => void, setWindowTextSelection: (windowKey: string, selectionState: object | null | undefined) => void, appendChatLine: (entry: unknown, options?: { scrollMode?: string }) => void, setExternalTooltip: (options?: { visible?: boolean, text?: string, entries?: Array<unknown> | null, x?: number, y?: number, vrWorldPos?: unknown }) => void, createWindow: (windowKey: string, options?: object) => object, destroyWindow: (windowKey: string) => boolean, isPointOverUi: (px: number, py: number) => boolean, isClientPointOverUi: (clientX: number, clientY: number) => boolean, getPreferredHotbarWindowSize: () => { w: number, h: number, minW: number, minH: number }, syncHotbarWindowSize: () => { w: number, h: number, minW: number, minH: number } | null }} HUD-system API containing the mutable HUD state object, resolved controllers, per-frame update/render hooks, lifecycle helpers, window-management helpers, and pointer-hit utilities.
 * Side effects: allocates Three.js HUD geometry/material/text resources, attaches HUD and optional debug objects to the scene, may resolve or create XR controller helpers, installs XR/session and resize listeners, mutates renderer sizing and camera projection during resize handling, and mutates HUD state, overlays, and window layout during runtime updates.
 */
export function createHudSystem(
  {
    THREE,
    renderer,
    camera,
    scene,
    worldControls,
    setWorldControlsEnabled,
    getWorldControlsEnabled,
    controllers,
    showControllerRays = true,
    // UI preset:
    // - "default": full multi-window HUD (log/skills/inventory/status/etc)
    // - "minimal": hotbar only
    uiPreset,
    // Optional: world-space raycast targets (Object3D roots).
    // Used for:
    // - desktop hover outline (object highlighting)
    // - optional world-hit debug dots when Debug is enabled
    worldRaycastTargets,
    desktopAnchor,
    vrAnchor,
    movementTarget,

    // Optional: richer rig/debug references (provided by bootstrap for walkabout rigs).
    // Keep optional so non-walkabout apps can still use the HUD.
    rigDebug,
    vrLayoutW,
    vrLayoutH,
    vrScaleW,
    vrScaleH,
    vrDistance,
    vrYOffset,
    xrFramebufferScaleFactor,
    onEnterVR,
    onExitVR,
    onHotbarSlot,
    windowClampMode = "strict",
    windowClampMinVisiblePx = HUD_WINDOW_CLAMP_MIN_VISIBLE_PX,
    theme,
    hotbarSlotCount,
    hotbarSlotSizePx,
    hotbarSlotOutlinePaddingPx,
    hotbarTooltips,
    reserveSystemHotbarSlots = true,
    visibleWindowKeys,
    hiddenWindowKeys,
    statusMode,
    enableDesktopContextMenu = true,

    // Feature flags (keep optional; consumers can pass {features:{...}}).
    features,

    // If true (default), install a window resize listener that keeps:
    // - renderer framebuffer size
    // - camera aspect/projection
    // - HUD layout + quad scale
    // in sync with the viewport (desktop only; WebXR controls size while presenting).
    autoHandleResize = true,

    // VR depth bounds for per-window push/pull. Defaults are conservative but
    // callers can set these (including Infinity) to avoid any implicit "outer surface".
    vrDepthMinRadius,
    vrDepthMaxRadius,

    // Prefix for localStorage keys used to persist panel layout (position, size,
    // collapse).  Defaults to "hud"; set a unique value per app to avoid collisions.
    storageKeyPrefix,
  } = {
    THREE: undefined,
    renderer: undefined,
    camera: undefined,
    scene: undefined,
    worldControls: undefined,
    setWorldControlsEnabled: undefined,
    getWorldControlsEnabled: undefined,
    controllers: undefined,
    showControllerRays: true,
    uiPreset: undefined,
    worldRaycastTargets: undefined,
    desktopAnchor: undefined,
    vrAnchor: undefined,
    movementTarget: undefined,
    rigDebug: undefined,
    vrLayoutW: undefined,
    vrLayoutH: undefined,
    vrScaleW: undefined,
    vrScaleH: undefined,
    vrDistance: undefined,
    vrYOffset: undefined,
    xrFramebufferScaleFactor: undefined,
    onEnterVR: undefined,
    onExitVR: undefined,
    onHotbarSlot: undefined,
    windowClampMode: "strict",
    windowClampMinVisiblePx: HUD_WINDOW_CLAMP_MIN_VISIBLE_PX,
    theme: undefined,
    hotbarSlotCount: undefined,
    hotbarSlotSizePx: undefined,
    hotbarSlotOutlinePaddingPx: undefined,
    hotbarTooltips: undefined,
    reserveSystemHotbarSlots: true,
    visibleWindowKeys: undefined,
    hiddenWindowKeys: undefined,
    statusMode: undefined,
    enableDesktopContextMenu: true,

    features: undefined,

    autoHandleResize: true,

    vrDepthMinRadius: undefined,
    vrDepthMaxRadius: undefined,
  }
) {
  // Troika-only: always use Troika text (legacy bitmap text removed).
  const _featureTroikaTextRequested = true;

  const {
    vrLayoutW: _vrLayoutW, vrLayoutH: _vrLayoutH,
    vrScaleW: _vrScaleW, vrScaleH: _vrScaleH,
    vrDistance: _vrDistance,
    vrDepthMinRadius: _vrDepthMinRadius,
    vrDepthMaxRadius: _vrDepthMaxRadius,
    vrYOffset: _vrYOffset,
    xrFramebufferScaleFactor: _xrFramebufferScaleFactor,
    hasWorldRaycastTargets: _hasWorldRaycastTargets,
    getWorldRaycastTargets,
    hotbarSlotCount: _hotbarSlotCount,
    hotbarSlotSizePx: _hotbarSlotSizePx,
    hotbarSlotOutlinePaddingPx: _hotbarSlotOutlinePaddingPx,
    hotbarTooltips: _hotbarTooltips,
    reserveSystemHotbarSlots: _reserveSystemHotbarSlots,
    visibleWindowKeys: _visibleWindowKeys,
    hiddenWindowKeys: _hiddenWindowKeys,
    uiPreset: _uiPreset,
    rigDebug: _rigDebug,
    onHotbarSlot: _onHotbarSlot,
    enableDefaultWindows: _enableDefaultWindows,
    statusMode: _statusMode,
    theme: _theme,
  } = normalizeHudOptions({
    vrLayoutW, vrLayoutH, vrScaleW, vrScaleH, vrDistance,
    vrDepthMinRadius, vrDepthMaxRadius, vrYOffset,
    xrFramebufferScaleFactor, worldRaycastTargets,
    hotbarSlotCount, hotbarSlotSizePx, hotbarSlotOutlinePaddingPx, hotbarTooltips, reserveSystemHotbarSlots, visibleWindowKeys, hiddenWindowKeys, rigDebug, onHotbarSlot, uiPreset, statusMode, theme,
  });
  const _themeResolved = resolveHudTheme(_theme);

  // Phase 2 modularization: text layout helpers live in ui-text-layout.js.
  const wrapEntriesToLines = _wrapEntriesToLines;

  // ── Render-order layering scheme ──
  // Three.js renders translucent objects in renderOrder then back-to-front.
  // The values below define the HUD's layering tiers:
  //   • normal windows:  100 + index * 40       (computed in renderOrderBaseFor)
  //   • VR hit markers:  HIT_MARKER_RENDER_ORDER
  //   • dragged windows: DRAG_TOP_RENDER_ORDER_BASE (in hud-window-render-layout-runtime.js)
  //   • overlay text:    OVERLAY_TEXT_RENDER_ORDER  (in hud-build-ui-runtime.js)
  //   • overlay colors:  OVERLAY_COLOR_LAYER_RENDER_ORDER (in hud-build-ui-runtime.js)
  /** VR pointer collision-dot render order (above all windows). */
  const HIT_MARKER_RENDER_ORDER = 1000;
  // Filled during createHudBuildUiRuntime(); allows scenes to add windows at runtime without
  // forking the HUD renderer.
  let _runtimeCreateWindowObjects = null;

  const { hud } = createHudStateInit({
    THREE,
    uiPreset: _uiPreset,
    statusMode: _statusMode,
    windowClampMode,
    windowClampMinVisiblePx,
    hotbarTooltips: _hotbarTooltips,
    visibleWindowKeys: _visibleWindowKeys,
    hiddenWindowKeys: _hiddenWindowKeys,
  });
  hud.ui.theme = _themeResolved;
  applyHudThemeToWindows(hud?.ui?.windows, _themeResolved);

  const {
    getPreferredHotbarWindowSize,
    syncHotbarWindowSize,
    getHotbarSlotLayout,
    hitTestHotbarSlotIndex,
    setHotbarItems,
    setHotbarActiveIndex,
    updateSystemHotbarPresentation,
    handleSystemHotbarSlot,
  } = createHudHotbarRuntime({
    hud,
    hotbarSlotCount: _hotbarSlotCount,
    hotbarSlotSizePx: _hotbarSlotSizePx,
    reserveSystemHotbarSlots: _reserveSystemHotbarSlots,
    toggleHelp,
    toggleDebug: () => toggleWindow("debug"),
    toggleSettings,
    markDirty,
  });
  syncHotbarWindowSize();

  const {
    resolveVrAnchorForRigPitch,
    rectToLocalCenter,
    sizeToLocalScale,
    getVrYawPerScreen: _vrYawPerScreen,
    getVrPitchPerScreen: _vrPitchPerScreen,
    getVrMetersPerPxX: _vrMetersPerPxX,
    getVrMetersPerPxY: _vrMetersPerPxY,
  } = createHudGeometryRuntime({
    rigDebug: _rigDebug,
    getLayoutWidth: () => hud.layoutW,
    getLayoutHeight: () => hud.layoutH,
    getVrScaleW: () => _vrScaleW,
    getVrScaleH: () => _vrScaleH,
    getVrDistance: () => _vrDistance,
  });

  const { updateMetrics } = createHudMetricsUpdater({
    THREE,
    hud,
    movementTarget,
    markDirty,
  });

  const _windowVisibilityRuntime = createHudWindowVisibilityRuntime({
    hud,
    renderer,
    clamp,
    markDirty,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    hiddenX: HUD_WINDOW_VR_RIGHT_X_PX,
    hiddenY: HUD_WINDOW_HIDDEN_Y_PX,
  });

  const _helpContentRuntime = createHudHelpContentRuntime({
    renderer,
    markDirty,
    textDefaultColor: HUD_TEXT_DEFAULT_COLOR,
    textInfoColor: HUD_TEXT_INFO_COLOR,
    textEmphasisColor: HUD_TEXT_EMPHASIS_COLOR,
  });

  function toggleHelp() {
    _windowVisibilityRuntime.toggleHelp();
  }

  function toggleSettings() {
    _windowVisibilityRuntime.toggleSettings();
  }

  function toggleWindow(key) {
    _windowVisibilityRuntime.toggleWindow(key);
  }

  // ------------------------------------------------------------
  // Debug panel (tree list)
  // ------------------------------------------------------------

  // Ensure system tooltips/icons exist even if caller didn't provide tooltips.
  updateSystemHotbarPresentation();

  function markDirty() {
    hud._dirty = true;
  }

  const _dragState = createHudDragState({ THREE });

  const _debugEntriesRuntime = createHudDebugEntriesRuntime({
    THREE,
    renderer,
    hud,
    rigDebug: _rigDebug,
    vrAnchor,
    fmtBool,
    fmtVec3,
    fmtRad,
    textDefaultColor: HUD_TEXT_DEFAULT_COLOR,
    textMutedColor: HUD_TEXT_MUTED_COLOR,
    getDragWindowKey: _dragState.getDragWindowKey,
    getDragMode: _dragState.getDragMode,
    markDirty,
  });

  const _vrAutoLayoutRuntime = createHudVrAutoLayoutRuntime({
    hud,
    clamp,
    markDirty,
    rightX: HUD_WINDOW_VR_RIGHT_X_PX,
    outerPaddingPx: HUD_VR_LAYOUT_OUTER_PADDING_PX,
    interWindowGapXPx: HUD_VR_LAYOUT_INTER_WINDOW_GAP_X_PX,
    interWindowGapYPx: HUD_VR_LAYOUT_INTER_WINDOW_GAP_Y_PX,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
  });

  // ------------------------------------------------------------
  // HUD geometry
  // ------------------------------------------------------------

  // NOTE: The HUD "plane" is a logical parent/transform for all UI meshes.
  // Using a Group avoids accidentally rendering a full-screen quad (even if transparent)
  // on some XR runtimes.
  hud.plane = new THREE.Group();
  hud.plane.renderOrder = HUD_GROUP_RENDER_ORDER;
  hud.root.add(hud.plane);

  // Invisible target to raycast against (for UV -> layout coords)
  {
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const rayTarget = new THREE.Mesh(planeGeo, rayMat);
    rayTarget.renderOrder = HUD_GROUP_RENDER_ORDER - 1;
    hud.rayTarget = rayTarget;
    hud.root.add(rayTarget);
  }

  // Public API object returned by createHudSystem.
  let _api = null;

  // Optional desktop hover outline helper (only created if worldRaycastTargets provided).
  let _desktopWorldHoverOutline = null;

  const _placementRuntime = createHudPlacementRuntime({
    THREE,
    renderer,
    hud,
    scene,
    vrAnchor,
    desktopAnchor,
    camera,
    resolveVrAnchorForRigPitch,
    getHeadCameraForHud,
    markDirty,
    desktopDistanceM: HUD_DESKTOP_DISTANCE_M,
  });

  function setHudAnchorForMode() {
    _placementRuntime.setHudAnchorForMode();
  }

  setHudAnchorForMode();

  const _layoutSizingRuntime = createHudLayoutSizingRuntime({
    THREE,
    renderer,
    camera,
    hud,
    getDesktopClientSize: () => getHudDesktopClientSize({ dom }),
    markDirty,
    statusMode: _statusMode,
    getHudGlyphDotSizePx,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    overlayPaddingPx: HUD_OVERLAY_PADDING_PX,
    vrLayoutW: _vrLayoutW,
    vrLayoutH: _vrLayoutH,
    desktopDistanceM: HUD_DESKTOP_DISTANCE_M,
  });

  function setLayoutForMode() {
    _layoutSizingRuntime.setLayoutForMode();
  }

  function updatePlacementForMode() {
    _placementRuntime.updatePlacementForMode({
      vrHeadQuatW: _vrHeadQuatW,
      vrHeadUpW: _vrHeadUpW,
      vrHudQuatW: _vrHudQuatW,
      vrHudQuatWInv: _vrHudQuatWInv,
      vrHeadUpL: _vrHeadUpL,
      vrSphereCenterW: _vrSphereCenterW,
    });
  }

  function updateHudQuadSize() {
    _layoutSizingRuntime.updateHudQuadSize();
  }

  function makeRect({ x, y, w, h, color, opacity = 1, z = 0.001, order = 20 }) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    // In XR, these quads are repositioned/oriented frequently and can sit near the
    // edges of the view; avoid frustum-culling edge cases.
    mesh.frustumCulled = false;
    const { lx, ly } = rectToLocalCenter(x, y, w, h);
    const { sx, sy } = sizeToLocalScale(w, h);
    mesh.position.set(lx, ly, z);
    mesh.scale.set(sx, sy, 1);
    hud.plane.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------
  // Troika-only text rendering
  // ------------------------------------------------------------

  const {
    TroikaPixelText,
    troikaTextInstances: _troikaTextInstances,
    hideColorLayers,
    setColoredMultilineText,
    setPlainTextMaybeTroika: _setPlainTextMaybeTroika,
    clearPlainTextMaybeTroika: _clearPlainTextMaybeTroika,
    clearColoredMultilineMaybeTroika: _clearColoredMultilineMaybeTroika,
  } = createHudTroikaTextRuntime({
    THREE,
    hud,
    renderer,
    vrDistance: _vrDistance,
    vrYawPerScreen: _vrYawPerScreen,
    vrPitchPerScreen: _vrPitchPerScreen,
    vrMetersPerPxX: _vrMetersPerPxX,
    vrMetersPerPxY: _vrMetersPerPxY,
    getDragMode: _dragState.getDragMode,
    getDragWindowKey: _dragState.getDragWindowKey,
    getVrResizeDragBasisActive: _dragState.getVrResizeDragBasisActive,
    getVrResizeDragKey: _dragState.getVrResizeDragKey,
    getVrResizeDragBasis: _dragState.getVrResizeDragBasis,
  });

  // ------------------------------------------------------------
  // Session management (HUD-rendered button)
  // ------------------------------------------------------------

  const { enterVR, exitVR } = createHudXrSessionRuntime({
    hud,
    renderer,
    markDirty,
    appendChatLine,
    setLayoutForMode,
    updatePlacementForMode,
    updateHudQuadSize,
    autoLayoutWindowsForVr: () => _vrAutoLayoutRuntime.autoLayoutWindowsForVr(),
    setHudAnchorForMode,
    onEnterVR,
    onExitVR,
    xrFramebufferScaleFactor: _xrFramebufferScaleFactor,
  });

  // ------------------------------------------------------------
  // Build UI
  // ------------------------------------------------------------

  const { createWindowObjects } = createHudBuildUiRuntime({
    THREE,
    hud,
    makeRect,
    TroikaPixelText,
    hotbarSlotCount: _hotbarSlotCount,
    hotbarSlotSizePx: _hotbarSlotSizePx,
    hotbarSlotOutlinePaddingPx: _hotbarSlotOutlinePaddingPx,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    theme: _themeResolved,
  });
  _runtimeCreateWindowObjects = createWindowObjects;

  // ------------------------------------------------------------
  // Input: Desktop mouse
  // ------------------------------------------------------------

  const dom = renderer.domElement;
  installHudDesktopInputRuntime({
    renderer,
    dom,
    hud,
    markDirty,
    endDragResize,
    rectContains,
    clamp,
    getNormalizedClientPoint,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    getDesktopWorldHoverOutline: () => _desktopWorldHoverOutline,
    enterVR,
    exitVR,
    enableContextMenu: enableDesktopContextMenu !== false,
  });

  // ------------------------------------------------------------
  // Input: VR controllers
  // ------------------------------------------------------------

  const {
    controllersResolved: _controllersResolved,
    controllerRay0,
    controllerRay1,
    getActiveUiController,
    setActiveUiController,
    getActiveUiInputSource,
    setActiveUiInputSource,
  } = createHudVrControllerSetupRuntime({
    THREE, renderer, scene, vrAnchor, resolveVrAnchorForRigPitch,
    controllers, createXrControllers: _createXrControllers,
    hud, markDirty, endDragResize,
  });

  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _rayTmpQuatTarget = new THREE.Quaternion();
  const _rayForwardNegZ = new THREE.Vector3(0, 0, -1);
  const _raycaster = new THREE.Raycaster();

  const _vrPlaneQuat = new THREE.Quaternion();
  const _vrHudPosW = new THREE.Vector3();
  const _vrHudQuatW = new THREE.Quaternion();
  const _vrHudQuatWInv = new THREE.Quaternion();
  // Tooltip VR anchoring (avoid per-frame allocations)
  const {
    vrTooltipHudPosW: _vrTooltipHudPosW,
    vrTooltipHudQuatW: _vrTooltipHudQuatW,
    vrTooltipHudQuatWInv: _vrTooltipHudQuatWInv,
    vrTooltipLocalW: _vrTooltipLocalW,
    vrTooltipDirL: _vrTooltipDirL,
  } = createHudVrTooltipScratchRuntime({ THREE });
  const _vrHudMatrixInv = new THREE.Matrix4();
  const _vrHeadQuatW = new THREE.Quaternion();
  const _vrHeadPosW = new THREE.Vector3();
  const _vrHeadUpW = new THREE.Vector3();
  const _vrHeadUpL = new THREE.Vector3();
  const _vrGravityUpL = new THREE.Vector3(0, 1, 0);
  const _vrBasisMat = new THREE.Matrix4();

  const _vrToHeadW = new THREE.Vector3();
  const _vrDir = new THREE.Vector3();
  const _vrToHead = new THREE.Vector3();
  const _vrRight = new THREE.Vector3();
  const _vrUp = new THREE.Vector3();

  const {
    vrSphereCenterW: _vrSphereCenterW,
    vrSphere: _vrSphere,
  } = createHudVrSphereRuntime({
    THREE,
    vrDistance: _vrDistance,
  });

  // VR depth push/pull (ray-locked): temp vectors used only while adjusting depth.
  const {
    vrDepthRayOriginW: _vrDepthRayOriginW,
    vrDepthRayDirW: _vrDepthRayDirW,
    vrDepthDesiredPointW: _vrDepthDesiredPointW,
    vrDepthCenterW: _vrDepthCenterW,
    vrDepthCenterL: _vrDepthCenterL,
    vrDepthToHeadW: _vrDepthToHeadW,
    vrDepthUpW: _vrDepthUpW,
    vrDepthRightW: _vrDepthRightW,
  } = createHudVrDepthScratchRuntime({ THREE });

  // Cached render-time matrices for VR picking.
  // These are captured at the start of update() BEFORE updatePlacementForMode runs,
  // so that raycasting uses the same matrices that were used during render().
  const _vrRenderTimeHudMatrix = new THREE.Matrix4();
  const _vrRenderTimeMeshMatrix = new THREE.Matrix4();
  let _vrRenderTimeMatricesCached = false;

  const { computeRenderTimeMeshMatrix } = createHudRenderTimeMeshMatrixRuntime({
    getVrRenderTimeMatricesCached: () => _vrRenderTimeMatricesCached,
    getVrRenderTimeMeshMatrix: () => _vrRenderTimeMeshMatrix,
    getVrRenderTimeHudMatrix: () => _vrRenderTimeHudMatrix,
  });

  // In practice, the scene `camera` is the most reliable source for a head pose that
  // includes rig/navigation transforms. Using the XR ArrayCamera can ignore those
  // transforms in some setups (making the HUD appear world-stuck).
  function getHeadCameraForHud() {
    return camera;
  }

  const {
    getAnyThumbstickForwardBackForDepth,
    getAnyThumbstickForwardBackForUi,
    getThumbstickForwardBackForUiController,
    getThumbstickForwardBackForUiControllers,
  } = createHudVrDepthInputRuntime({
    renderer,
    controllerRay0,
    controllerRay1,
    getActiveUiInputSource,
  });

  const { getWindowPlaneZLocal } = createHudWindowPlaneZRuntime({
    getWindowByKey: (windowKey) => (windowKey ? hud.ui?.windows?.[windowKey] : null),
  });

  const { getWindowBillboardBasis, vrBasis: _vrBasis } = createHudVrBillboardRuntime({
    THREE, hud,
    getVrYawPerScreen: _vrYawPerScreen,
    getVrPitchPerScreen: _vrPitchPerScreen,
    vrDistance: _vrDistance,
    getVrMetersPerPxX: _vrMetersPerPxX,
    getVrMetersPerPxY: _vrMetersPerPxY,
    getHeadCameraForHud,
    computeRenderTimeMeshMatrix,
    getVrRenderTimeMatricesCached: () => _vrRenderTimeMatricesCached,
    vrRenderTimeHudMatrix: _vrRenderTimeHudMatrix,
    vrDir: _vrDir,
    vrToHead: _vrToHead,
    vrUp: _vrUp,
    vrGravityUpL: _vrGravityUpL,
    vrRight: _vrRight,
    vrBasisMat: _vrBasisMat,
    vrPlaneQuat: _vrPlaneQuat,
    vrHudQuatW: _vrHudQuatW,
    vrHeadPosW: _vrHeadPosW,
    vrToHeadW: _vrToHeadW,
  });

  const { getWorldRayForController } = createHudControllerRayRuntime({
    rayForwardNegZ: _rayForwardNegZ,
    rayTmpQuatTarget: _rayTmpQuatTarget,
  });

  // ------------------------------------------------------------
  // Interaction (window drag/resize)
  // ------------------------------------------------------------

  const _interactionStateRuntime = createHudInteractionStateRuntime({
    hud,
    markDirty,
    setWorldControlsEnabled,
    getWorldControlsEnabled,
    worldControls,
  });

  function setHudInteractionActive(active) {
    _interactionStateRuntime.setHudInteractionActive(active);
  }

  function setHudHoverActive(active) {
    _interactionStateRuntime.setHudHoverActive(active);
  }

  const _dragResetRuntime = createHudDragResetRuntime({
    hud,
    getDragMode: _dragState.getDragMode,
    getDragWindowKey: _dragState.getDragWindowKey,
    setDragMode: _dragState.setDragMode,
    setDragWindowKey: _dragState.setDragWindowKey,
    setScrollGrabY: _dragState.setScrollGrabY,
    getContentScrollMaxAbsDelta: _dragState.getContentScrollMaxAbsDelta,
    getContentScrollTapCallback: _dragState.getContentScrollTapCallback,
    setContentScrollStartY: _dragState.setContentScrollStartY,
    setContentScrollStartScrollTop: _dragState.setContentScrollStartScrollTop,
    setContentScrollLineH: _dragState.setContentScrollLineH,
    setContentScrollMaxAbsDelta: _dragState.setContentScrollMaxAbsDelta,
    setContentScrollTapCallback: _dragState.setContentScrollTapCallback,
    setVrResizeDragKey: _dragState.setVrResizeDragKey,
    setVrResizeDragBasisActive: _dragState.setVrResizeDragBasisActive,
    setVrMoveDragYawPitchKey: _dragState.setVrMoveDragYawPitchKey,
    setVrMoveDragYawPitchHasOffset: _dragState.setVrMoveDragYawPitchHasOffset,
    setVrMoveDragYawPitchOffsetX: _dragState.setVrMoveDragYawPitchOffsetX,
    setVrMoveDragYawPitchOffsetY: _dragState.setVrMoveDragYawPitchOffsetY,
    setVrMoveDragUseTheoreticalBasisThisFrame: _dragState.setVrMoveDragUseTheoreticalBasisThisFrame,
    setVrMoveDragRayHasAnchor: _dragState.setVrMoveDragRayHasAnchor,
    setVrMoveDragRayT: _dragState.setVrMoveDragRayT,
    setVrMoveDragGrabU: _dragState.setVrMoveDragGrabU,
    setVrMoveDragGrabV: _dragState.setVrMoveDragGrabV,
    setVrMoveDragDepthAdjustedThisFrame: _dragState.setVrMoveDragDepthAdjustedThisFrame,
    setHudInteractionActive,
  });

  const { updateVrDepth: _updateVrDepth } = createHudVrDepthDragRuntime({
    hud,
    vrDistance: _vrDistance,
    vrDepthMinRadius: _vrDepthMinRadius,
    vrDepthMaxRadius: _vrDepthMaxRadius,
    vrYawPerScreen: _vrYawPerScreen,
    vrPitchPerScreen: _vrPitchPerScreen,
    getHeadCameraForHud,
    getWorldRayForController,
    getAnyThumbstickForwardBackForDepth,
    getActiveUiController,
    getDragWindowKey: _dragState.getDragWindowKey,
    getDragMode: _dragState.getDragMode,
    getHudInteractionActive: () => _interactionStateRuntime.getHudInteractionActive(),
    getVrMoveDragRayHasAnchor: _dragState.getVrMoveDragRayHasAnchor,
    getVrMoveDragRayT: _dragState.getVrMoveDragRayT,
    setVrMoveDragRayT: _dragState.setVrMoveDragRayT,
    getVrMoveDragGrabU: _dragState.getVrMoveDragGrabU,
    getVrMoveDragGrabV: _dragState.getVrMoveDragGrabV,
    setVrMoveDragUseTheoreticalBasisThisFrame: _dragState.setVrMoveDragUseTheoreticalBasisThisFrame,
    setVrMoveDragDepthAdjustedThisFrame: _dragState.setVrMoveDragDepthAdjustedThisFrame,
    markDirty,
    vrDepthScratch: {
      vrDepthRayOriginW: _vrDepthRayOriginW,
      vrDepthRayDirW: _vrDepthRayDirW,
      vrDepthDesiredPointW: _vrDepthDesiredPointW,
      vrDepthCenterW: _vrDepthCenterW,
      vrDepthCenterL: _vrDepthCenterL,
      vrDepthToHeadW: _vrDepthToHeadW,
      vrDepthUpW: _vrDepthUpW,
      vrDepthRightW: _vrDepthRightW,
    },
    vrHeadPosW: _vrHeadPosW,
    vrHudPosW: _vrHudPosW,
    vrHudQuatW: _vrHudQuatW,
    vrHudQuatWInv: _vrHudQuatWInv,
    vrGravityUpL: _vrGravityUpL,
    vrHudMatrixInv: _vrHudMatrixInv,
  });

  function endDragResize() {
    _dragResetRuntime.endDragResize();
    _panelStorage.saveLayout();
  }

  function bringToFront(key) {
    _interactionStateRuntime.bringToFront(key);
  }

  const _positionRectRuntime = createHudPositionRectRuntime({
    renderer,
    hud,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    vrDistance: _vrDistance,
    getDragMode: _dragState.getDragMode,
    getDragWindowKey: _dragState.getDragWindowKey,
    getVrResizeDragBasisActive: _dragState.getVrResizeDragBasisActive,
    getVrResizeDragKey: _dragState.getVrResizeDragKey,
    getVrResizeDragBasis: _dragState.getVrResizeDragBasis,
    vrYawPerScreen: _vrYawPerScreen,
    vrPitchPerScreen: _vrPitchPerScreen,
    vrMetersPerPxX: _vrMetersPerPxX,
    vrMetersPerPxY: _vrMetersPerPxY,
    rectToLocalCenter,
    sizeToLocalScale,
    vrDir: _vrDir,
    vrToHead: _vrToHead,
    vrUp: _vrUp,
    vrGravityUpL: _vrGravityUpL,
    vrRight: _vrRight,
    vrBasisMat: _vrBasisMat,
  });

  const _uiOverlays = createHudUiOverlays({
    THREE,
    renderer,
    hud,
    markDirty,
    setHudInteractionActive,
    bringToFront,
    clamp,
    rectContains,
    positionRect,
    hideColorLayers,
    setColoredMultilineText,
    setPlainTextMaybeTroika: _setPlainTextMaybeTroika,
    clearPlainTextMaybeTroika: _clearPlainTextMaybeTroika,
    clearColoredMultilineMaybeTroika: _clearColoredMultilineMaybeTroika,
    vrYawPerScreen: _vrYawPerScreen,
    vrPitchPerScreen: _vrPitchPerScreen,
    vrDistance: _vrDistance,
    setVrVirtualWindowState: (key, state) => _interactionStateRuntime.setVrVirtualWindowState(key, state),
    hitTestHotbarSlotIndex,
    copyTextToClipboard,
    normalizeEntriesToText,
  });

  const _windowLifecycle = createHudWindowLifecycleRuntime({
    hud,
    closeContextMenu: () => _uiOverlays.closeContextMenu(),
    getActiveDragWindowKey: _dragState.getDragWindowKey,
    endDragResize,
    markDirty,
    troikaTextInstances: _troikaTextInstances,
  });

  const _windowStateRuntime = createHudWindowStateRuntime({
    hud,
    renderer,
    dom,
    markDirty,
    rectContains,
    getNormalizedClientPoint,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
  });

  const _windowFactoryRuntime = createHudWindowFactoryRuntime({
    hud,
    clamp,
    markDirty,
    WindowClass: HudWindowBase,
    runtimeCreateWindowObjects: _runtimeCreateWindowObjects,
    loadLayout: () => _panelStorage.loadLayout(),
    defaultPanelBgColor: _themeResolved.panelBgColor,
    defaultPanelBgOpacity: _themeResolved.panelBgOpacity,
    defaultTitleBarColor: _themeResolved.titleBarColor,
    defaultTitleBarOpacity: _themeResolved.titleBarOpacity,
    defaultContentBgColor: _themeResolved.contentBgColor,
    defaultContentBgOpacity: _themeResolved.contentBgOpacity,
    defaultBorderColor: _themeResolved.borderColor,
    defaultBorderOpacity: _themeResolved.borderOpacity,
    defaultBorderInset: _themeResolved.borderInset,
    defaultTitleTextColor: _themeResolved.titleTextColor,
  });

  function ensureSharedWindow(windowKey, options = {}) {
    const key = String(windowKey ?? "").trim();
    if (!key) return null;

    const existing = hud?.ui?.windows?.[key];
    if (existing) return existing;

    const sharedOptions = resolveWindowPresetOptions({
      uiPreset: _uiPreset,
      windowKey: key,
      windowClampMode,
      windowClampMinVisiblePx,
    });
    if (!sharedOptions) return null;

    return _windowFactoryRuntime.createWindow(key, {
      ...sharedOptions,
      ...options,
    });
  }

  const VR_PANEL_SCROLL_LINES_PER_SECOND = 26;
  let _vrPanelScrollCarry = 0;

  function updateVrPanelScroll(dt) {
    if (!renderer.xr?.isPresenting) {
      _vrPanelScrollCarry = 0;
      return;
    }

    if (hud.vrPointer?.down || _dragState.getDragMode()) {
      _vrPanelScrollCarry = 0;
      return;
    }

    const windowKey = String(hud.vrPointer?.windowKey ?? "").trim();
    if (!windowKey) {
      _vrPanelScrollCarry = 0;
      return;
    }

    const win = hud.ui?.windows?.[windowKey] ?? null;
    if (!win || win.collapsed) {
      _vrPanelScrollCarry = 0;
      return;
    }

    const totalLines = Math.max(0, Number(win._scrollTotalLines ?? 0));
    const visibleLines = Math.max(1, Number(win._scrollVisibleLines ?? 1));
    const maxTop = Math.max(0, totalLines - visibleLines);
    if (maxTop <= 0) {
      _vrPanelScrollCarry = 0;
      return;
    }

    const candidateControllerRays = [];
    const addCandidateControllerRay = (controllerRay) => {
      if (!controllerRay || candidateControllerRays.includes(controllerRay)) return;
      candidateControllerRays.push(controllerRay);
    };

    addCandidateControllerRay(hud.vrPointer?.controllerRay ?? null);
    if (String(hud.vrPointer?.controllerRay0WindowKey ?? "").trim() === windowKey) {
      addCandidateControllerRay(controllerRay0);
    }
    if (String(hud.vrPointer?.controllerRay1WindowKey ?? "").trim() === windowKey) {
      addCandidateControllerRay(controllerRay1);
    }

    const axisFB = candidateControllerRays.length > 1
      ? getThumbstickForwardBackForUiControllers(candidateControllerRays)
      : getThumbstickForwardBackForUiController(candidateControllerRays[0] ?? null);
    if (axisFB === 0) {
      _vrPanelScrollCarry = 0;
      return;
    }

    _vrPanelScrollCarry += axisFB * VR_PANEL_SCROLL_LINES_PER_SECOND * Math.max(0, Number(dt) || 0);
    const wholeLines = _vrPanelScrollCarry > 0
      ? Math.floor(_vrPanelScrollCarry)
      : Math.ceil(_vrPanelScrollCarry);
    if (wholeLines === 0) return;

    _vrPanelScrollCarry -= wholeLines;
    const currentTop = clamp(Number(win.scrollTop ?? 0), 0, maxTop);
    const nextTop = clamp(currentTop + wholeLines, 0, maxTop);
    if (nextTop === currentTop) return;

    win.scrollTop = nextTop;
    win.scrollMode = nextTop >= maxTop ? "end" : "manual";
    markDirty();
  }

  const _dragRuntime = createHudDragRuntime({
    hud,
    renderer,
    clamp,
    bringToFront,
    markDirty,
    getDragMode: _dragState.getDragMode,
    getDragWindowKey: _dragState.getDragWindowKey,
    getScrollGrabY: _dragState.getScrollGrabY,
    getContentScrollStartY: _dragState.getContentScrollStartY,
    getContentScrollStartScrollTop: _dragState.getContentScrollStartScrollTop,
    getContentScrollLineH: _dragState.getContentScrollLineH,
    getContentScrollMaxAbsDelta: _dragState.getContentScrollMaxAbsDelta,
    setContentScrollMaxAbsDelta: _dragState.setContentScrollMaxAbsDelta,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
  });

  const _debugOverlayRuntime = createHudDebugOverlayRuntime({
    THREE,
    renderer,
    camera,
    hud,
    showControllerRays,
    primaryHighlightColor: HUD_PRIMARY_HIGHLIGHT_COLOR,
    secondaryHighlightColor: HUD_SECONDARY_HIGHLIGHT_COLOR,
    worldCollisionDotColor: HUD_WORLD_COLLISION_DOT_COLOR,
    getWorldRayForController,
    rayOrigin: _rayOrigin,
    rayDir: _rayDir,
    raycaster: _raycaster,
    getHeadCameraForHud,
    controllerRay0,
    controllerRay1,
    getWorldRaycastTargets,
  });

  const _pointerStepRuntime = createHudPointerStepRuntime({
    hud,
    renderer,
    isDragModeActive: _dragState.getDragMode,
    uiOverlays: _uiOverlays,
    handleClick: (pointer) => _clickRuntime.handleClick(pointer),
    handleDrag: (pointer) => _dragRuntime.handleDrag(pointer),
  });

  const _resizeRuntime = createHudResizeRuntime({
    renderer,
    camera,
    hud,
    autoHandleResize,
    getDesktopClientSize: () => getHudDesktopClientSize({ dom }),
    setLayoutForMode,
    updateHudQuadSize,
    markDirty,
    reanchorWindows: (previousW, previousH) => _windowLayoutRuntime.reanchorWindows(previousW, previousH),
  });

  const _panelStorage = createHudPanelStorageRuntime({
    hud,
    renderer,
    storageKeyPrefix: storageKeyPrefix || "hud",
  });

  // Let HudWindowBase.setCollapsed() trigger a save.
  hud._onLayoutChange = () => _panelStorage.saveLayout();

  const _windowLayoutRuntime = createHudWindowLayoutRuntime({
    hud,
    renderer,
    clamp,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    rightX: HUD_WINDOW_VR_RIGHT_X_PX,
    hiddenY: HUD_WINDOW_HIDDEN_Y_PX,
    windowClampMinVisiblePxDefault: HUD_WINDOW_CLAMP_MIN_VISIBLE_PX,
    loadLayout: () => _panelStorage.loadLayout(),
  });

  const _windowObjectVisibilityRuntime = createHudWindowObjectVisibilityRuntime({ hud });

  const _windowTextRenderOrderRuntime = createHudWindowTextRenderOrderRuntime({
    hud,
    featureTroikaTextRequested: _featureTroikaTextRequested,
    getTroikaTextInstances: () => _troikaTextInstances,
  });

  const _clickRuntime = createHudClickRuntime({
    hud,
    renderer,
    uiOverlays: _uiOverlays,
    bringToFront,
    markDirty,
    rectContains,
    rectContainsSlop,
    clamp,
    copyTextToClipboard,
    normalizeEntriesToText,
    titleHeightPx: HUD_WINDOW_TITLE_HEIGHT_PX,
    overlayPaddingPx: HUD_OVERLAY_PADDING_PX,
    getHudGlyphDotSizePx,
    getHudTextLineHeightPx,
    getWindowPlaneZLocal,
    getWindowBillboardBasis,
    vrBasis: _vrBasis,
    vrResizeDragBasis: _dragState.vrResizeDragBasis,
    setVrResizeDragKey: _dragState.setVrResizeDragKey,
    setVrResizeDragBasisActive: _dragState.setVrResizeDragBasisActive,
    getVrMetersPerPxX: _vrMetersPerPxX,
    getVrMetersPerPxY: _vrMetersPerPxY,
    getDragMode: _dragState.getDragMode,
    setDragMode: _dragState.setDragMode,
    getDragWindowKey: _dragState.getDragWindowKey,
    setDragWindowKey: _dragState.setDragWindowKey,
    setScrollGrabY: _dragState.setScrollGrabY,
    setContentScrollStartY: _dragState.setContentScrollStartY,
    setContentScrollStartScrollTop: _dragState.setContentScrollStartScrollTop,
    setContentScrollLineH: _dragState.setContentScrollLineH,
    setContentScrollMaxAbsDelta: _dragState.setContentScrollMaxAbsDelta,
    setContentScrollTapCallback: _dragState.setContentScrollTapCallback,
    setHudInteractionActive,
    hitTestHotbarSlotIndex,
    handleSystemHotbarSlot,
    onHotbarSlot: _onHotbarSlot,
    enterVR,
    exitVR,
    toggleWindow,
    toggleHelp,
    toggleSettings,
    restoreAllHidden: () => _windowVisibilityRuntime.restoreAllHidden(),
  });

  const { renderList: _renderList } = createHudRenderListRuntime({
    clamp,
    wrapEntriesToLines,
    parseHexColor,
    setColoredMultilineText,
    positionRect,
    getSelectionRects: _getSelectionRects,
    makeRect,
  });

  const { renderWindowContent: _renderWindowContent } =
    createHudWindowContentDispatchRuntime({
      hud,
      renderer,
      setPlainTextMaybeTroika: _setPlainTextMaybeTroika,
      clearPlainTextMaybeTroika: _clearPlainTextMaybeTroika,
      clearColoredMultilineMaybeTroika: _clearColoredMultilineMaybeTroika,
      positionRect,
      getHelpEntries: (fallback) =>
        _helpContentRuntime.getResolvedHelpEntries(fallback),
      getHotbarSlotLayout,
      getStatusMode: () => _statusMode,
    });

  const { renderWindow: _renderWindow } = createHudWindowRenderLayoutRuntime({
    hud,
    renderer,
    windowObjectVisibilityRuntime: _windowObjectVisibilityRuntime,
    windowTextRenderOrderRuntime: _windowTextRenderOrderRuntime,
    setPlainTextMaybeTroika: _setPlainTextMaybeTroika,
    clearPlainTextMaybeTroika: _clearPlainTextMaybeTroika,
    clearColoredMultilineMaybeTroika: _clearColoredMultilineMaybeTroika,
    positionRect,
    renderListFn: _renderList,
    renderWindowContentFn: _renderWindowContent,
  });

  function positionRect(mesh, x, y, w, h, z) {
    _positionRectRuntime.positionRect(mesh, x, y, w, h, z);
  }

  function appendChatLine(entry, options = {}) {
    _windowStateRuntime.appendChatLine(entry, options);
  }

  // ------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------

  const { hitMarker0, hitMarker1 } = createHudHitMarkersRuntime({
    THREE,
    scene,
    hitMarkerRenderOrder: HIT_MARKER_RENDER_ORDER,
    primaryColor: HUD_PRIMARY_HIGHLIGHT_COLOR,
    secondaryColor: HUD_SECONDARY_HIGHLIGHT_COLOR,
  });

  const { updateVrPointer } = createHudVrPointerRuntime({
    THREE, hud, renderer,
    controllerRay0, controllerRay1, hitMarker0, hitMarker1,
    getWorldRayForController, getWindowBillboardBasis, getHeadCameraForHud,
    rectContainsSlop, clamp, markDirty,
    vrYawPerScreen: _vrYawPerScreen, vrPitchPerScreen: _vrPitchPerScreen,
    vrMetersPerPxX: _vrMetersPerPxX, vrMetersPerPxY: _vrMetersPerPxY,
    rayOrigin: _rayOrigin, rayDir: _rayDir, raycaster: _raycaster,
    vrHudPosW: _vrHudPosW, vrHudQuatW: _vrHudQuatW, vrHudQuatWInv: _vrHudQuatWInv,
    vrSphereCenterW: _vrSphereCenterW, vrHeadUpL: _vrHeadUpL, vrGravityUpL: _vrGravityUpL,
    vrHeadPosW: _vrHeadPosW, vrToHeadW: _vrToHeadW,
    getActiveUiController,
    setActiveUiController,
    getDragMode: _dragState.getDragMode, getDragWindowKey: _dragState.getDragWindowKey,
    getVrResizeDragBasisActive: _dragState.getVrResizeDragBasisActive,
    getVrResizeDragKey: _dragState.getVrResizeDragKey,
    getVrResizeDragBasis: _dragState.getVrResizeDragBasis,
    getVrMoveDragUseTheoreticalBasisThisFrame: _dragState.getVrMoveDragUseTheoreticalBasisThisFrame,
    getVrMoveDragDepthAdjustedThisFrame: _dragState.getVrMoveDragDepthAdjustedThisFrame,
    getVrMoveDragYawPitchKey: _dragState.getVrMoveDragYawPitchKey,
    setVrMoveDragYawPitchKey: _dragState.setVrMoveDragYawPitchKey,
    getVrMoveDragYawPitchHasOffset: _dragState.getVrMoveDragYawPitchHasOffset,
    setVrMoveDragYawPitchHasOffset: _dragState.setVrMoveDragYawPitchHasOffset,
    getVrMoveDragYawPitchOffsetX: _dragState.getVrMoveDragYawPitchOffsetX,
    setVrMoveDragYawPitchOffsetX: _dragState.setVrMoveDragYawPitchOffsetX,
    getVrMoveDragYawPitchOffsetY: _dragState.getVrMoveDragYawPitchOffsetY,
    setVrMoveDragYawPitchOffsetY: _dragState.setVrMoveDragYawPitchOffsetY,
    getVrMoveDragRayHasAnchor: _dragState.getVrMoveDragRayHasAnchor,
    setVrMoveDragRayHasAnchor: _dragState.setVrMoveDragRayHasAnchor,
    setVrMoveDragRayT: _dragState.setVrMoveDragRayT,
    setVrMoveDragGrabU: _dragState.setVrMoveDragGrabU,
    setVrMoveDragGrabV: _dragState.setVrMoveDragGrabV,
  });

  const { update, updateUi } = createHudFrameUpdateRuntime({
    hud,
    renderer,
    getDesktopWorldHoverOutline: () => _desktopWorldHoverOutline,
    vrRenderTimeHudMatrix: _vrRenderTimeHudMatrix,
    setVrRenderTimeMatricesCached: (v) => { _vrRenderTimeMatricesCached = v; },
    updateMetrics,
    updateDebugPanel: (dt) => _debugEntriesRuntime.updateDebugPanel(dt),
    setHudAnchorForMode,
    setLayoutForMode,
    updatePlacementForMode,
    updateHudQuadSize,
    autoLayoutWindowsForVr: () => _vrAutoLayoutRuntime.autoLayoutWindowsForVr(),
    markDirty,
    updateVrDepth: _updateVrDepth,
    updateVrPointer,
    setHudHoverActive,
    updateVrPanelScroll,
    updateOverlayHover: (pointer, dt) => _uiOverlays.updateOverlayHover(pointer, dt),
    layoutContextMenu: () => _uiOverlays.layoutContextMenu(),
    layoutTooltip: () => _uiOverlays.layoutTooltip(),
    stepInput: (pointer, dt) => _pointerStepRuntime.stepInput(pointer, dt),
    hitMarker0,
    hitMarker1,
    endDragResize,
    updateSystemHotbarPresentation,
    windowLayoutRuntime: _windowLayoutRuntime,
    windowObjectVisibilityRuntime: _windowObjectVisibilityRuntime,
    renderWindow: _renderWindow,
    windowTextRenderOrderRuntime: _windowTextRenderOrderRuntime,
  });

  // Initial placement
  setLayoutForMode();
  updatePlacementForMode();
  updateHudQuadSize();
  updateUi();

  _api = {
    hud,
    controllers: _controllersResolved,
    update,
    renderDebugOverlay: _debugOverlayRuntime.renderDebugOverlay,
    handleResize: () => _resizeRuntime.handleResize(),
    dispose: () => {
      _resizeRuntime.disposeAutoResize();
    },
    setNavigationHelpProfile: (profile) => _helpContentRuntime.setNavigationHelpProfile(profile),
    setHelpExtraLines: (lines) => _helpContentRuntime.setHelpExtraLines(lines),
    setHelpOverrideLines: (lines) => _helpContentRuntime.setHelpOverrideLines(lines),
    toggleHelp,
    toggleSettings,
    bringToFront,
    toggleWindow,
    setWindowCollapsed: (key, collapsed) => _windowVisibilityRuntime.setWindowCollapsed(key, collapsed),
    setWindowHidden: (key, hidden) => _windowVisibilityRuntime.setWindowHidden(key, hidden),
    setWindowLines: (windowKey, entries, options = {}) => _windowStateRuntime.setWindowLines(windowKey, entries, options),
    setWindowScrollTop: (windowKey, scrollTop, scrollMode = "manual") => _windowStateRuntime.setWindowScrollTop(windowKey, scrollTop, scrollMode),
    setWindowTextCaret: (windowKey, caretState) => _windowStateRuntime.setWindowTextCaret(windowKey, caretState),
    setWindowTextSelection: (windowKey, selectionState) => _windowStateRuntime.setWindowTextSelection(windowKey, selectionState),
    appendChatLine,
    getPreferredHotbarWindowSize,
    syncHotbarWindowSize,
    setHotbarItems,
    setHotbarActiveIndex,
    setExternalTooltip: ({ visible, text, entries, x, y, vrWorldPos } = {}) =>
      _windowStateRuntime.setExternalTooltip({ visible, text, entries, x, y, vrWorldPos }),
    ensureSharedWindow: (windowKey, options = {}) => ensureSharedWindow(windowKey, options),
    createWindow: (windowKey, options = {}) => _windowFactoryRuntime.createWindow(windowKey, options),
    destroyWindow: (windowKey, options = {}) => _windowLifecycle.destroyWindow(windowKey, options),
    loadWindowSkinTextures: (basePath = "assets/hud/") => loadHudWindowSkinTextures(THREE, basePath),
    applyWindowSkin: (windowKey, textures, options = {}) =>
      applyHudWindowSkin({ THREE, hud }, windowKey, textures, options.cornerSize),
    applyWindowSkinToWindows: (windowKeys, textures, options = {}) =>
      applyHudWindowSkinToWindows({ THREE, hud }, windowKeys, textures, options.cornerSize),
    isPointOverUi: (px, py) => _windowStateRuntime.isPointOverUi(px, py),
    isClientPointOverUi: (clientX, clientY) => _windowStateRuntime.isClientPointOverUi(clientX, clientY),
    enterVR,
    exitVR,
  };

  // Create hover outline after API exists (so getHudSystem works).
  if (_hasWorldRaycastTargets) {
    try {
      _desktopWorldHoverOutline = _createWorldHoverOutline({
        THREE,
        renderer,
        camera,
        scene,
        getHudSystem: () => _api,
        getPickables: getWorldRaycastTargets,
        mode: "auto",
        allowRoundGeometry: true,
      });
    } catch {
      _desktopWorldHoverOutline = null;
    }
  }

  return _api;
}
