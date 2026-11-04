// SPDX-License-Identifier: Apache-2.0
// Internal UI overlays (Tooltip + Context Menu).
// Extracted from hud.js for Phase 2 modularization.

import {
  HUD_OVERLAY_PADDING_PX,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_WINDOW_RESIZE_HANDLE_SIZE_PX,
  HUD_WINDOW_CONTENT_TOP_MARGIN_PX,
  HUD_SCROLLBAR_RESERVED_WIDTH_PX,
  HUD_SCROLLBAR_RIGHT_INSET_PX,
  HUD_SCROLLBAR_TRACK_WIDTH_PX,
  getHudGlyphDotSizePx,
  getHudTextLineHeightPx,
} from "./hud-layout-policy.js";
import { HUD_TEXT_DEFAULT_COLOR, HUD_TEXT_DISABLED_COLOR } from "./hud-text-style.js";
import { estimateTextWidthPx } from "./text-measurement.js";
import { getHudWindowControlRects } from "./hud-window-skin-runtime.js";

/**
 * Create the shared HUD overlay controller for tooltips and context menus.
 * Purpose: centralize tooltip layout, context-menu layout, hover handling, and menu actions for the shared HUD so app harnesses can reuse one overlay policy instead of duplicating tooltip and menu behavior.
 * @param {object} [options={}] HUD overlay configuration.
 * @param {any} options.THREE Three.js namespace used to allocate temporary vectors and quaternions for VR tooltip anchoring.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer whose XR state selects desktop vs VR overlay layout behavior.
 * @param {any} options.hud Shared HUD model containing overlay state, layout dimensions, window data, and overlay object references.
 * @param {() => void} options.markDirty Callback invoked when overlay state changes require a HUD rerender.
 * @param {(active: boolean) => void} options.setHudInteractionActive Callback that marks the HUD interaction lock while menus are open.
 * @param {(windowKey: string) => void} options.bringToFront Callback that raises a HUD window before opening its context menu.
 * @param {(value: number, min: number, max: number) => number} options.clamp Numeric clamp helper used for overlay bounds.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number) => boolean} options.rectContains Rectangle hit-test helper for overlay and window targeting.
 * @param {(object: any, x: number, y: number, w: number, h: number, z: number) => void} options.positionRect Helper that positions HUD overlay quads in layout space.
 * @param {(objects: any) => void} options.hideColorLayers Helper that hides colored tooltip text layers before rendering plain text.
 * @param {(options: any) => void} options.setColoredMultilineText Helper that renders multi-line colored tooltip text into overlay objects.
 * @param {(options: any) => void} options.setPlainTextMaybeTroika Helper that renders plain tooltip or menu text into overlay objects.
 * @param {(pixel: any) => void} options.clearPlainTextMaybeTroika Helper that clears previously rendered plain overlay text.
 * @param {(objects: any, dot?: number) => void} [options.clearColoredMultilineMaybeTroika] Helper that fully clears previously rendered multiline overlay text.
 * @param {() => number} options.vrYawPerScreen Helper that converts the current VR HUD width into yaw-per-screen units.
 * @param {() => number} options.vrPitchPerScreen Helper that converts the current VR HUD height into pitch-per-screen units.
 * @param {number} options.vrDistance Shared VR HUD distance used when anchoring overlay windows in depth.
 * @param {(key: string, state: any) => void} options.setVrVirtualWindowState Helper that publishes VR overlay window placement state.
 * @param {(x: number, y: number) => number} options.hitTestHotbarSlotIndex Helper that resolves a hovered hotbar slot index for overlay hover text.
 * @param {(text: string) => Promise<boolean>} options.copyTextToClipboard Clipboard helper used by context-menu copy actions.
 * @param {(entries: any) => string} options.normalizeEntriesToText Helper that converts HUD line entries into copyable text.
 * @returns {{layoutTooltip: () => void, layoutContextMenu: () => void, updateOverlayHover: (dt: number) => void, handleContextMenuClick: (pointer: {x: number, y: number}) => Promise<boolean>, getContextTargetAt: (px: number, py: number) => {windowKey: string | null, lineText: string | null, holdEligible: boolean} | null, openContextMenuAtPointer: (pointer: {x: number, y: number}) => void, closeContextMenu: () => void, runContextMenuAction: (action: any) => Promise<void>}} Overlay controller with tooltip/context-menu layout hooks, hover updates, menu hit testing, menu opening and closing, and async menu action dispatch.
 * Side effects: allocates VR tooltip anchoring temporaries, mutates HUD overlay and window state, updates VR virtual-window placement, may copy text to the clipboard, may clear window lines or collapse windows through context-menu actions, and invokes `markDirty()` whenever overlay state changes require rerendering.
 */
export function createHudUiOverlays({
  THREE,
  renderer,
  hud,
  markDirty,
  setHudInteractionActive,
  bringToFront,
  clamp,
  rectContains,
  positionRect,

  // Text helpers
  hideColorLayers,
  setColoredMultilineText,
  setPlainTextMaybeTroika,
  clearPlainTextMaybeTroika,
  clearColoredMultilineMaybeTroika,

  // VR layout helpers
  vrYawPerScreen,
  vrPitchPerScreen,
  vrDistance,
  setVrVirtualWindowState,

  // Hotbar hover helper
  hitTestHotbarSlotIndex,

  // Clipboard/actions
  copyTextToClipboard,
  normalizeEntriesToText,
} = {}) {
  const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

  // Tooltip VR anchoring temps (avoid per-frame allocations)
  const _vrTooltipHudPosW = new THREE.Vector3();
  const _vrTooltipHudQuatW = new THREE.Quaternion();
  const _vrTooltipHudQuatWInv = new THREE.Quaternion();
  const _vrTooltipLocalW = new THREE.Vector3();
  const _vrTooltipDirL = new THREE.Vector3();

  function clampTooltipXY({ x, y, w, h, isVr }) {
    if (isVr) return { x: Number(x), y: Number(y) };
    return {
      x: clamp(
        x,
        HUD_OVERLAY_PADDING_PX,
        Math.max(HUD_OVERLAY_PADDING_PX, hud.layoutW - w - HUD_OVERLAY_PADDING_PX)
      ),
      y: clamp(
        y,
        HUD_OVERLAY_PADDING_PX,
        Math.max(HUD_OVERLAY_PADDING_PX, hud.layoutH - h - HUD_OVERLAY_PADDING_PX)
      ),
    };
  }

  function layoutTooltip() {
    const tip = hud.overlay?.externalTooltip?.visible
      ? hud.overlay.externalTooltip
      : hud.overlay?.tooltip;

    const o = hud.objects.overlay;
    const hasEntries = Array.isArray(tip?.entries) && tip.entries.length > 0;
    const hasText = !!String(tip?.text ?? "");
    if (!tip?.visible || (!hasEntries && !hasText) || !o) {
      setVrVirtualWindowState?.("__tooltip", null);
      if (o) {
        o.tooltipBg.visible = false;
        o.tooltipText.mesh.visible = false;
        hideColorLayers(o);
        clearColoredMultilineMaybeTroika?.(o, getHudGlyphDotSizePx(renderer));
        clearPlainTextMaybeTroika(o.tooltipText);
      }
      return;
    }

    const isVr = !!renderer.xr.isPresenting;
    const dot = getHudGlyphDotSizePx(renderer);
    const pad = HUD_OVERLAY_PADDING_PX;

    const entries = hasEntries ? tip.entries : null;
    // Long tooltip lines wrap at a fixed text width instead of stretching
    // the tip across the HUD (from Aether Forge, 2026-10).
    // `hud.ui.data.tooltipTextWidthPx` changes the width; default 260.
    const tipTextW = Math.max(80, Number(hud.ui?.data?.tooltipTextWidthPx) || 260);
    const wrapTip = (line) => {
      const raw = String(line ?? "");
      if (!raw || estimateTextWidthPx(raw, dot) <= tipTextW) return [raw];
      const out = [];
      let current = "";
      for (const word of raw.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (current && estimateTextWidthPx(next, dot) > tipTextW) {
          out.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) out.push(current);
      return out.length ? out : [raw];
    };
    const lines = (entries
      ? entries.map((e) => String((typeof e === "object" && e ? e.text : e) ?? ""))
      : String(tip.text ?? "").split("\n")
    ).flatMap(wrapTip);

    const textW = lines.reduce((m, s) => Math.max(m, estimateTextWidthPx(s, dot)), 0);
    const w = clamp(Math.min(textW, tipTextW) + pad * 2, 80, Math.max(80, hud.layoutW - 20));
    const lineH = getHudTextLineHeightPx(dot);
    const h = clamp(
      lines.length * lineH + pad * 2,
      lineH + pad * 2,
      Math.max(lineH + pad * 2, hud.layoutH - 20)
    );

    // Desktop clamps tooltips to the screen. In VR, tooltips must stay anchored
    // just right+down from the collision dot; clamping can move them far away.
    const xy = clampTooltipXY({ x: tip.x, y: tip.y, w, h, isVr });
    let x = xy.x;
    let y = xy.y;

    // Safety: never try to place/render tooltips at non-finite coordinates.
    // (Otherwise they can snap to 0/0 or flicker when upstream coords go invalid.)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setVrVirtualWindowState?.("__tooltip", null);
      o.tooltipBg.visible = false;
      o.tooltipText.mesh.visible = false;
      hideColorLayers(o);
      clearColoredMultilineMaybeTroika?.(o, dot);
      clearPlainTextMaybeTroika(o.tooltipText);
      return;
    }

    if (isVr) {
      const isExternal = tip === hud.overlay?.externalTooltip;

      if (isExternal) {
        // External tooltip (hover panel): keep stable placement so it doesn't jitter
        // with UI hit-tests. If caller provides a world anchor, place it at that
        // yaw/pitch/depth instead.
        const HOVER_DISTANCE = 8;
        let tooltipVrZ = vrDistance - HOVER_DISTANCE; // negative pushes further out

        let tooltipX = hud.layoutW * 0.5 + 60;
        let tooltipY = hud.layoutH * 0.5 + 60;

        const wp = tip?.vrWorldPos;
        if (wp && Number.isFinite(wp.x) && Number.isFinite(wp.y) && Number.isFinite(wp.z)) {
          try {
            hud.root.updateMatrixWorld(true);
          } catch {
            // no-op
          }

          const m = hud.root.matrixWorld;
          _vrTooltipHudPosW.setFromMatrixPosition(m);
          _vrTooltipHudQuatW.setFromRotationMatrix(m);
          _vrTooltipHudQuatWInv.copy(_vrTooltipHudQuatW).invert();

          _vrTooltipLocalW.copy(wp).sub(_vrTooltipHudPosW);
          _vrTooltipLocalW.applyQuaternion(_vrTooltipHudQuatWInv);
          const r = _vrTooltipLocalW.length();
          if (Number.isFinite(r) && r > 1e-5) {
            _vrTooltipDirL.copy(_vrTooltipLocalW).multiplyScalar(1 / r);
            const yaw = Math.atan2(_vrTooltipDirL.x, -_vrTooltipDirL.z);
            const pitch = Math.asin(clamp(_vrTooltipDirL.y, -1, 1));
            const yawPer = vrYawPerScreen();
            const pitchPer = vrPitchPerScreen();

            if (
              Number.isFinite(yawPer) &&
              yawPer > 1e-6 &&
              Number.isFinite(pitchPer) &&
              pitchPer > 1e-6
            ) {
              const winCx = (yaw / yawPer + 0.5) * hud.layoutW;
              const winCy = (0.5 - pitch / pitchPer) * hud.layoutH;
              tooltipX = winCx - w / 2;
              tooltipY = winCy - h / 2;

              // positionRect uses: radius = vrDistance - (vrZ + z)
              // => vrZ = vrDistance - radius - z
              tooltipVrZ = vrDistance - r - 0.006;
            }
          }
        }

        tooltipX = clamp(tooltipX, 10, hud.layoutW - w - 10);
        tooltipY = clamp(tooltipY, 10, hud.layoutH - h - 10);

        setVrVirtualWindowState?.("__tooltip", {
          x: tooltipX,
          y: tooltipY,
          w,
          h,
          collapsed: false,
          vrZ: tooltipVrZ,
        });
      } else {
        // Small hover tooltip: keep it near the current UI hit (x/y) and slightly
        // in front of the hovered panel (so it reads cleanly over the surface).
        const HOVER_FRONT_Z_M = 0.06;
        const baseVrZ = Number(tip?._hoverVrZ ?? 0);
        const tooltipVrZ = (Number.isFinite(baseVrZ) ? baseVrZ : 0) + HOVER_FRONT_Z_M;

        setVrVirtualWindowState?.("__tooltip", {
          x,
          y,
          w,
          h,
          collapsed: false,
          vrZ: tooltipVrZ,
        });
      }
    } else {
      setVrVirtualWindowState?.("__tooltip", null);
    }

    positionRect(o.tooltipBg, x, y, w, h, 0.006);

    if (entries) {
      // Colored per-line tooltip.
      o.tooltipText.mesh.visible = true;
      setColoredMultilineText({
        objs: o,
        entries,
        x: x + pad,
        y: y + pad,
        dot,
        maxWidth: Math.max(0, w - pad * 2),
        defaultColor: HUD_TEXT_DEFAULT_COLOR,
      });
    } else {
      // Plain text tooltip.
      hideColorLayers(o);

      setPlainTextMaybeTroika({
        pixel: o.tooltipText,
        text: lines.join("\n"),
        x: x + pad,
        y: y + pad,
        dot,
        maxWidth: Math.max(0, w - pad * 2),
        color: HUD_TEXT_DEFAULT_COLOR,
        zLift: 0,
        renderOrder: 9010,
        truncateSingleLine: false,
      });
    }
  }

  function layoutContextMenu() {
    const menu = hud.overlay?.contextMenu;
    const o = hud.objects.overlay;
    if (!menu?.open || !o) {
      setVrVirtualWindowState?.("__menu", null);
      if (o) {
        o.menuBg.visible = false;
        o.menuHover.visible = false;
        clearPlainTextMaybeTroika(o.menuTextEnabled);
        clearPlainTextMaybeTroika(o.menuTextDisabled);
      }
      return;
    }

    const dot = getHudGlyphDotSizePx(renderer);
    const pad = HUD_OVERLAY_PADDING_PX;
    const itemH = getHudTextLineHeightPx(dot);
    const items = menu.items ?? [];
    const labels = items.map((it) => String(it?.label ?? ""));
    const maxLabelW = labels.reduce((m, s) => Math.max(m, estimateTextWidthPx(s, dot)), 0);
    const w = clamp(maxLabelW + pad * 2, 140, Math.max(140, hud.layoutW - 20));
    const h = clamp(labels.length * itemH + pad * 2, pad * 2 + itemH, hud.layoutH - 20);
    const x = clamp(menu.x, pad, Math.max(pad, hud.layoutW - w - pad));
    const y = clamp(menu.y, pad, Math.max(pad, hud.layoutH - h - pad));

    menu.w = w;
    menu.h = h;
    menu.x = x;
    menu.y = y;

    if (renderer.xr.isPresenting) {
      setVrVirtualWindowState?.("__menu", {
        x,
        y,
        w,
        h,
        collapsed: false,
        vrZ: 0,
      });
    } else {
      setVrVirtualWindowState?.("__menu", null);
    }

    positionRect(o.menuBg, x, y, w, h, 0.006);

    const enabledLines = labels.map((s, i) => (items[i]?.disabled ? "" : s));
    const disabledLines = labels.map((s, i) => (items[i]?.disabled ? s : ""));

    setPlainTextMaybeTroika({
      pixel: o.menuTextEnabled,
      text: enabledLines.join("\n"),
      x: x + pad,
      y: y + pad,
      dot,
      maxWidth: w - pad * 2,
      color: HUD_TEXT_DEFAULT_COLOR,
      zLift: 0,
      renderOrder: 9010,
      truncateSingleLine: false,
    });
    setPlainTextMaybeTroika({
      pixel: o.menuTextDisabled,
      text: disabledLines.join("\n"),
      x: x + pad,
      y: y + pad,
      dot,
      maxWidth: w - pad * 2,
      color: HUD_TEXT_DISABLED_COLOR,
      zLift: 0,
      renderOrder: 9010,
      truncateSingleLine: false,
    });

    if (Number.isFinite(menu.hoverIndex) && menu.hoverIndex >= 0) {
      const hy = y + pad + menu.hoverIndex * itemH - 2;
      positionRect(o.menuHover, x + 2, hy, w - 4, itemH + 4, 0.0065);
    } else {
      o.menuHover.visible = false;
    }
  }

  function closeContextMenu() {
    const menu = hud.overlay?.contextMenu;
    if (!menu?.open) return;
    menu.open = false;
    menu.items = [];
    menu.target = null;
    menu.hoverIndex = -1;
    setHudInteractionActive(false);
  }

  function getContextTargetAt(px, py) {
    for (let i = hud.ui.order.length - 1; i >= 0; i--) {
      const key = hud.ui.order[i];
      const w = hud.ui.windows[key];
      const objs = hud.objects.windows?.[key];
      if (!w) continue;

      const h = w.collapsed ? titleH : w.h;
      if (!rectContains(w.x, w.y, w.w, h, px, py)) continue;

      // Eligible only when pointing at a visible content row that is NOT a tree toggle.
      let lineText = null;
      let holdEligible = false;

      const meta = objs?._visibleLineMeta;
      if (meta && meta.length && !w.collapsed) {
        const dot = getHudGlyphDotSizePx(renderer);
        const pad = HUD_OVERLAY_PADDING_PX;
        const contentX = w.x + pad;
        const contentY = w.y + titleH + pad;
        const hasScroll = !!objs.scrollTrack;
        const contentW = w.w - pad * 2 - (hasScroll ? HUD_SCROLLBAR_RESERVED_WIDTH_PX : 0);
        const contentH = h - titleH - pad * 2;
        if (rectContains(contentX, contentY, contentW, contentH, px, py)) {
          const lineH = getHudTextLineHeightPx(dot);
          const idx = Math.floor((py - contentY) / lineH);
          const row = meta[idx];
          if (row && typeof row.text === "string") lineText = row.text;
          holdEligible = !!row && !row.toggleKey;
        }
      }

      return { windowKey: key, lineText, holdEligible };
    }

    return null;
  }

  function openContextMenuAtPointer(pointer) {
    const px = pointer.x;
    const py = pointer.y;
    const hit = getContextTargetAt(px, py);

    if (!hit?.windowKey) {
      closeContextMenu();
      markDirty();
      return;
    }

    if (hit?.windowKey) bringToFront(hit.windowKey);

    const menu = hud.overlay.contextMenu;
    const items = [];

    items.push({
      label: "Copy Line",
      action: { type: "copyText", text: hit?.lineText ?? "" },
      disabled: !hit?.lineText,
    });

    if (hit?.windowKey) {
      const w = hud.ui.windows?.[hit.windowKey];
      if (w && typeof w.linesKey === "function") {
        const entries = hud.ui.data?.[w.linesKey()];
        const hasEntries = !!(entries && entries.length);
        items.push({
          label: "Copy All",
          action: { type: "copyAll", windowKey: hit.windowKey },
          disabled: !hasEntries,
        });
        items.push({
          label: "Clear",
          action: { type: "clearLines", windowKey: hit.windowKey },
          disabled: !hasEntries,
        });
      }
      if (w?.minimizable) {
        items.push({
          label: w.collapsed ? "Expand" : "Collapse",
          action: { type: "toggleCollapse", windowKey: hit.windowKey },
        });
      }
    }

    items.push({ label: "Close Menu", action: { type: "close" } });

    menu.open = true;
    menu.x = px;
    menu.y = py;
    menu.items = items;
    menu.target = hit;
    menu.hoverIndex = -1;
    setHudInteractionActive(true);
    markDirty();
  }

  async function runContextMenuAction(action) {
    const a = action && typeof action === "object" ? action : { type: "close" };
    if (a.type === "close") {
      closeContextMenu();
      markDirty();
      return;
    }
    if (a.type === "copyText") {
      await copyTextToClipboard(String(a.text ?? ""));
      closeContextMenu();
      markDirty();
      return;
    }
    if (a.type === "copyAll") {
      const key = String(a.windowKey ?? "");
      const w = hud.ui.windows?.[key];
      const entries = w && typeof w.linesKey === "function" ? hud.ui.data?.[w.linesKey()] : null;
      await copyTextToClipboard(normalizeEntriesToText(entries));
      closeContextMenu();
      markDirty();
      return;
    }
    if (a.type === "clearLines") {
      const key = String(a.windowKey ?? "");
      const w = hud.ui.windows?.[key];
      if (w && typeof w.linesKey === "function") {
        const storeKey = w.linesKey();
        if (hud.ui.data) hud.ui.data[storeKey] = [];
        w.scrollTop = 0;
        w.scrollMode = "top";
      }
      closeContextMenu();
      markDirty();
      return;
    }
    if (a.type === "toggleCollapse") {
      const key = String(a.windowKey ?? "");
      const w = hud.ui.windows?.[key];
      if (w?.minimizable) {
        if (typeof w.toggleCollapsed === "function") {
          w.toggleCollapsed();
        } else if (typeof w.setCollapsed === "function") {
          w.setCollapsed(!w.collapsed);
        } else {
          w.collapsed = !w.collapsed;
        }
      }
      closeContextMenu();
      markDirty();
      return;
    }
    closeContextMenu();
    markDirty();
  }

  // Returns true if click was fully handled by the context menu overlay.
  function handleContextMenuClick(pointer) {
    const px = pointer.x;
    const py = pointer.y;

    const menu = hud.overlay?.contextMenu;
    if (!menu?.open) return false;

    // Click inside menu selects; click outside closes.
    if (rectContains(menu.x, menu.y, menu.w, menu.h, px, py)) {
      const dot = getHudGlyphDotSizePx(renderer);
      const pad = HUD_OVERLAY_PADDING_PX;
      const itemH = getHudTextLineHeightPx(dot);
      const idx = Math.floor((py - (menu.y + pad)) / itemH);
      const item = menu.items?.[idx];
      if (item) {
        if (item.disabled) {
          closeContextMenu();
          markDirty();
          return true;
        }
        void runContextMenuAction(item.action);
        return true;
      }
      return true;
    }

    closeContextMenu();
    markDirty();
    return true;
  }

  function updateOverlayHover(pointer, dt) {
    const dot = getHudGlyphDotSizePx(renderer);

    // Context menu hover
    const menu = hud.overlay?.contextMenu;
    if (menu?.open) {
      const pad = HUD_OVERLAY_PADDING_PX;
      const itemH = getHudTextLineHeightPx(dot);
      let idx = -1;
      if (rectContains(menu.x, menu.y, menu.w, menu.h, pointer.x, pointer.y)) {
        idx = Math.floor((pointer.y - (menu.y + pad)) / itemH);
        if (!Number.isFinite(idx) || idx < 0 || idx >= (menu.items?.length ?? 0)) idx = -1;
      }

      // Disabled items are not hover-highlighted.
      const it = idx >= 0 ? menu.items?.[idx] : null;
      if (it?.disabled) idx = -1;

      if (idx !== menu.hoverIndex) {
        menu.hoverIndex = idx;
        markDirty();
      }

      // Tooltips are suppressed while menu is open.
      const tip = hud.overlay.tooltip;
      if (tip.visible) {
        tip.visible = false;
        tip.text = "";
        markDirty();
      }
      return;
    }

    // Tooltip hover
    const tip = hud.overlay.tooltip;
    if (!pointer.active) {
      if (tip.visible || tip.text) {
        tip.visible = false;
        tip.text = "";
        tip._hoverId = "";
        tip._timer = 0;
        markDirty();
      }
      return;
    }

    let hoverId = "";
    let hoverText = "";
    let hoverVrZ = 0; // Track vrZ of hovered window

    // VR: anchor near the collision dot (slightly right + a little down).
    // Desktop: keep classic mouse-tooltip offset.
    const isVr = !!renderer.xr.isPresenting;
    let anchorX = pointer.x + (isVr ? 26 : 16);
    let anchorY = pointer.y + (isVr ? 12 : 16);

    for (let i = hud.ui.order.length - 1; i >= 0; i--) {
      const key = hud.ui.order[i];
      const w = hud.ui.windows[key];
      const objs = hud.objects.windows?.[key];
      if (!w) continue;

      const h = w.collapsed ? titleH : w.h;
      if (!rectContains(w.x, w.y, w.w, h, pointer.x, pointer.y)) continue;

      // Capture vrZ from this window for tooltip positioning
      hoverVrZ = w.vrZ ?? 0;

      const controls = getHudWindowControlRects(w, objs, titleH);

      // Close — same rect as the drawn button (9-slice windows sit on the nameplate).
      if (
        w.closeable &&
        controls.close &&
        rectContains(controls.close.x, controls.close.y, controls.close.w, controls.close.h, pointer.x, pointer.y)
      ) {
        hoverId = `${key}:close`;
        hoverText = "Close";
        break;
      }

      // Minimize
      if (
        w.minimizable &&
        controls.min &&
        rectContains(controls.min.x, controls.min.y, controls.min.w, controls.min.h, pointer.x, pointer.y)
      ) {
        hoverId = `${key}:min`;
        hoverText = w.collapsed ? "Expand" : "Collapse";
        break;
      }

      // Resize — same rect as the drawn grip (9-slice windows inset the handle).
      const resizeRect = controls.resize;
      if (
        w.resizable &&
        !w.collapsed &&
        resizeRect &&
        rectContains(resizeRect.x, resizeRect.y, resizeRect.w, resizeRect.h, pointer.x, pointer.y)
      ) {
        hoverId = `${key}:resize`;
        hoverText = "Resize";
        break;
      }

      // Scrollbar
      if (objs?.scrollTrack && !w.collapsed) {
        const metrics = objs._scrollMetrics;
        const trackX = metrics?.trackX ?? (w.x + w.w - HUD_SCROLLBAR_RIGHT_INSET_PX);
        const trackY = metrics?.trackY ?? (w.y + titleH + HUD_WINDOW_CONTENT_TOP_MARGIN_PX);
        const trackH = metrics?.trackH ?? Math.max(0, h - titleH - HUD_SCROLLBAR_RESERVED_WIDTH_PX);
        if (rectContains(trackX, trackY, HUD_SCROLLBAR_TRACK_WIDTH_PX, trackH, pointer.x, pointer.y)) {
          hoverId = `${key}:scroll`;
          hoverText = "Scroll";
          break;
        }
      }

      // Hotbar slot hover tooltips
      if (key === "hotbar" && !w.collapsed && typeof hitTestHotbarSlotIndex === "function") {
        const idx = hitTestHotbarSlotIndex(w, pointer.x, pointer.y);
        if (idx >= 0) {
          const tips = hud.ui?.data?.hotbarTooltips;
          const t = Array.isArray(tips) ? String(tips[idx] ?? "") : "";
          if (t) {
            hoverId = `${key}:slot:${idx}`;
            hoverText = t;
            break;
          }
        }
      }

      // Content line / tree
      const meta = objs?._visibleLineMeta;
      if (meta && meta.length && !w.collapsed) {
        const pad = HUD_OVERLAY_PADDING_PX;
        const contentX = w.x + pad;
        const contentY = w.y + titleH + pad;
        const hasScroll = !!objs.scrollTrack;
        const contentW = w.w - pad * 2 - (hasScroll ? HUD_SCROLLBAR_RESERVED_WIDTH_PX : 0);
        const contentH = h - titleH - pad * 2;
        if (rectContains(contentX, contentY, contentW, contentH, pointer.x, pointer.y)) {
          const lineH = getHudTextLineHeightPx(dot);
          const idx = Math.floor((pointer.y - contentY) / lineH);
          const row = meta[idx];
          if (
            row?.actionButton &&
            Number.isFinite(row.actionButton.x) &&
            Number.isFinite(row.actionButton.y) &&
            Number.isFinite(row.actionButton.w) &&
            Number.isFinite(row.actionButton.h) &&
            rectContains(
              row.actionButton.x,
              row.actionButton.y,
              row.actionButton.w,
              row.actionButton.h,
              pointer.x,
              pointer.y
            )
          ) {
            hoverId = `${key}:action:${idx}`;
            hoverText =
              typeof row.actionButton.hoverText === "string" && row.actionButton.hoverText.trim()
                ? row.actionButton.hoverText.trim()
                : "Click to interact";
          } else if (row?.toggleKey) {
            hoverId = `${key}:tree:${idx}`;
            hoverText = "Expand/Collapse";
          } else if (typeof row?.hoverText === "string" && row.hoverText.trim()) {
            hoverId = `${key}:content:${idx}`;
            hoverText = row.hoverText.trim();
          } else if (typeof row?.onClick === "function") {
            hoverId = `${key}:content:${idx}`;
            hoverText = "Click to interact";
          } else {
            hoverId = `${key}:content:${idx}`;
            hoverText = renderer.xr.isPresenting ? "Hold to open menu" : "";
          }
          break;
        }
      }

      break;
    }

    if (hoverId !== tip._hoverId) {
      tip._hoverId = hoverId;
      tip._hoverVrZ = hoverVrZ;
      tip._timer = 0;
      if (tip.visible) {
        tip.visible = false;
        tip.text = "";
        markDirty();
      }
    }

    if (!hoverId || !hoverText) {
      if (tip.visible || tip.text) {
        tip.visible = false;
        tip.text = "";
        tip._timer = 0;
        markDirty();
      }
      return;
    }

    tip._timer += dt;
    const SHOW_DELAY = 0.35;
    if (tip._timer >= SHOW_DELAY) {
      const nextText = hoverText;
      const nextVisible = true;
      const nx = anchorX;
      const ny = anchorY;
      if (tip.text !== nextText || tip.visible !== nextVisible || tip.x !== nx || tip.y !== ny) {
        tip.text = nextText;
        tip.visible = nextVisible;
        tip.x = nx;
        tip.y = ny;
        markDirty();
      }
    }
  }

  return {
    layoutTooltip,
    layoutContextMenu,
    updateOverlayHover,
    handleContextMenuClick,
    getContextTargetAt,
    openContextMenuAtPointer,
    closeContextMenu,
    runContextMenuAction,
  };
}
