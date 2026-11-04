// SPDX-License-Identifier: Apache-2.0
import {
  HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX,
  HUD_HOTBAR_SLOT_SIZE_PX,
  HUD_LAYOUT_DEFAULT_HEIGHT_PX,
  HUD_LAYOUT_DEFAULT_WIDTH_PX,
} from "./hud-layout-policy.js";
import {
  HUD_VR_DEPTH_MIN_RADIUS_M,
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_HEIGHT_M,
  HUD_VR_SURFACE_WIDTH_M,
  HUD_VR_Y_OFFSET_M,
} from "./hud-placement-policy.js";
import { HUD_HOTBAR_SLOT_COUNT } from "./hud-hotbar-policy.js";

/**
 * Purpose: Normalize raw HUD constructor options by applying finite-number guards and default-constant fallbacks, and validate array-/object-type params.
 * @param {object} raw Raw option values destructured from the createHudSystem signature.
 * @param {number | undefined} raw.vrLayoutW Virtual HUD layout width override.
 * @param {number | undefined} raw.vrLayoutH Virtual HUD layout height override.
 * @param {number | undefined} raw.vrScaleW Physical HUD surface width override (meters).
 * @param {number | undefined} raw.vrScaleH Physical HUD surface height override (meters).
 * @param {number | undefined} raw.vrDistance HUD distance override (meters).
 * @param {number | undefined} raw.vrDepthMinRadius VR depth minimum radius override (meters).
 * @param {number | undefined} raw.vrDepthMaxRadius VR depth maximum radius override (meters or Infinity).
 * @param {number | undefined} raw.vrYOffset Vertical offset override (meters).
 * @param {number | undefined} raw.xrFramebufferScaleFactor XR framebuffer scale override.
 * @param {Array | null | undefined} raw.worldRaycastTargets Optional world raycast targets array.
 * @param {number | undefined} raw.hotbarSlotSizePx Optional hotbar slot size override.
 * @param {number | undefined} raw.hotbarSlotOutlinePaddingPx Optional hotbar slot outline padding override.
 * @param {Array<string> | null | undefined} raw.hotbarTooltips Optional tooltip labels array.
 * @param {boolean | undefined} raw.reserveSystemHotbarSlots Whether the shared debug/help hotbar slots stay reserved.
 * @param {Array<string> | null | undefined} raw.visibleWindowKeys Optional list of shared window keys that should exist at startup.
 * @param {Array<string> | null | undefined} raw.hiddenWindowKeys Optional list of shared window keys that should start hidden.
 * @param {object | null | undefined} raw.rigDebug Optional rig/debug reference bag.
 * @param {Function | null | undefined} raw.onHotbarSlot Optional hotbar slot callback.
 * @param {string | undefined} raw.uiPreset UI preset string.
 * @param {string | undefined} raw.statusMode Status display mode override.
 * @returns {object} Normalized option values with policy-constant fallbacks applied.
 * Side effects: none.
 */
export function normalizeHudOptions({
  vrLayoutW,
  vrLayoutH,
  vrScaleW,
  vrScaleH,
  vrDistance,
  vrDepthMinRadius,
  vrDepthMaxRadius,
  vrYOffset,
  xrFramebufferScaleFactor,
  worldRaycastTargets,
  hotbarSlotCount,
  hotbarSlotSizePx,
  hotbarSlotOutlinePaddingPx,
  hotbarTooltips,
  reserveSystemHotbarSlots,
  visibleWindowKeys,
  hiddenWindowKeys,
  rigDebug,
  onHotbarSlot,
  uiPreset,
  statusMode,
  theme,
}) {
  const _vrLayoutW = Number.isFinite(vrLayoutW)
    ? Number(vrLayoutW)
    : HUD_LAYOUT_DEFAULT_WIDTH_PX;
  const _vrLayoutH = Number.isFinite(vrLayoutH)
    ? Number(vrLayoutH)
    : HUD_LAYOUT_DEFAULT_HEIGHT_PX;
  const _vrScaleW = Number.isFinite(vrScaleW)
    ? Number(vrScaleW)
    : HUD_VR_SURFACE_WIDTH_M;
  const _vrScaleH = Number.isFinite(vrScaleH)
    ? Number(vrScaleH)
    : HUD_VR_SURFACE_HEIGHT_M;
  const _vrDistance = Number.isFinite(vrDistance)
    ? Number(vrDistance)
    : HUD_VR_DISTANCE_M;

  const _vrDepthMinRadius = Number.isFinite(vrDepthMinRadius)
    ? Number(vrDepthMinRadius)
    : HUD_VR_DEPTH_MIN_RADIUS_M;
  const _vrDepthMaxRadius =
    vrDepthMaxRadius === Infinity
      ? Infinity
      : Number.isFinite(vrDepthMaxRadius)
        ? Number(vrDepthMaxRadius)
        : Infinity;
  const _vrYOffset = Number.isFinite(vrYOffset)
    ? Number(vrYOffset)
    : HUD_VR_Y_OFFSET_M;

  const _xrFramebufferScaleFactor = Number.isFinite(xrFramebufferScaleFactor)
    ? Number(xrFramebufferScaleFactor)
    : null;

  const _hasWorldRaycastTargets = Array.isArray(worldRaycastTargets);
  const _worldRaycastTargetsRef = _hasWorldRaycastTargets ? worldRaycastTargets : null;

  const _hotbarSlotCount = Number.isFinite(hotbarSlotCount)
    ? Math.max(1, Math.floor(Number(hotbarSlotCount)))
    : HUD_HOTBAR_SLOT_COUNT;

  const _hotbarSlotSizePx = Number.isFinite(hotbarSlotSizePx)
    ? Math.max(20, Math.floor(Number(hotbarSlotSizePx)))
    : HUD_HOTBAR_SLOT_SIZE_PX;

  const _hotbarSlotOutlinePaddingPx = Number.isFinite(hotbarSlotOutlinePaddingPx)
    ? Math.max(0, Math.floor(Number(hotbarSlotOutlinePaddingPx)))
    : HUD_HOTBAR_SLOT_OUTLINE_PADDING_PX;

  const _hotbarTooltips = Array.isArray(hotbarTooltips)
    ? hotbarTooltips.map((s) => String(s ?? ""))
    : null;

  const _reserveSystemHotbarSlots = reserveSystemHotbarSlots !== false;

  const _visibleWindowKeys = Array.isArray(visibleWindowKeys)
    ? visibleWindowKeys
      .map((value) => String(value ?? "").trim())
      .filter((value, index, values) => value && values.indexOf(value) === index)
    : null;

  const _hiddenWindowKeys = Array.isArray(hiddenWindowKeys)
    ? hiddenWindowKeys
      .map((value) => String(value ?? "").trim())
      .filter((value, index, values) => value && values.indexOf(value) === index)
    : null;

  const _rigDebug = rigDebug && typeof rigDebug === "object" ? rigDebug : null;

  const _onHotbarSlot = typeof onHotbarSlot === "function" ? onHotbarSlot : null;

  const _uiPreset = String(uiPreset ?? "default");
  const _enableDefaultWindows = _uiPreset !== "minimal";

  const _statusMode = String(
    statusMode ?? (_enableDefaultWindows ? "bars" : "text")
  );

  const _theme = theme ?? "professional";

  return {
    vrLayoutW: _vrLayoutW,
    vrLayoutH: _vrLayoutH,
    vrScaleW: _vrScaleW,
    vrScaleH: _vrScaleH,
    vrDistance: _vrDistance,
    vrDepthMinRadius: _vrDepthMinRadius,
    vrDepthMaxRadius: _vrDepthMaxRadius,
    vrYOffset: _vrYOffset,
    xrFramebufferScaleFactor: _xrFramebufferScaleFactor,
    hasWorldRaycastTargets: _hasWorldRaycastTargets,
    worldRaycastTargetsRef: _worldRaycastTargetsRef,
    getWorldRaycastTargets() { return _worldRaycastTargetsRef; },
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
  };
}
