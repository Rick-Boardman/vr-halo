// SPDX-License-Identifier: Apache-2.0
import {
  HUD_HOTBAR_SLOT_GAP_PX,
  HUD_HOTBAR_SLOT_SIZE_PX,
  HUD_OVERLAY_PADDING_PX,
} from "./hud-layout-policy.js";
import {
  HUD_HOTBAR_SLOT_COUNT,
  HUD_SYSTEM_HOTBAR_DEBUG_SLOT_INDEX,
  HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX,
} from "./hud-hotbar-policy.js";
import { HUD_PRIMARY_HIGHLIGHT_COLOR } from "./hud-highlight-style.js";
import { HUD_SURFACE_ACCENT_COLOR } from "./hud-surface-style.js";
import { rectContains } from "./hud-format.js";
import { clamp } from "./scalar-math.js";
import { estimateTextWidthPx, HUD_TEXT_ESTIMATE_GAP_PX } from "./text-measurement.js";

const HOTBAR_HEADER_TEXT_OFFSET_X_PX = 44;
const HOTBAR_HEADER_COMPACT_TEXT_OFFSET_X_PX = 26;
const HOTBAR_HEADER_TEXT_DOT_PX = 2;
const HOTBAR_STATUS_TEXT_DOT_PX = 2;
const HOTBAR_HEADER_LEFT_GUTTER_PX = 84;
const HOTBAR_HEADER_RIGHT_GUTTER_PX = 112;
const HOTBAR_HEADER_COMPACT_LEFT_GUTTER_PX = 66;
const HOTBAR_HEADER_COMPACT_RIGHT_GUTTER_PX = 88;
const HOTBAR_HEADER_GUTTER_RIGHT_PADDING_PX = 18;
const HOTBAR_STATUS_GUTTER_PADDING_PX = 22;
const HOTBAR_STATUS_MIN_WIDTH_PX = 92;
const HOTBAR_WINDOW_VERTICAL_PADDING_PX = 8;
const HOTBAR_WINDOW_CHROME_VERTICAL_PADDING_PX = 10;
const HOTBAR_SPACER_MIN_WIDTH_PX = 8;
const HOTBAR_SPACER_GAP_PX = 4;

/**
 * Purpose: Create runtime hotbar helpers that encapsulate slot layout, hit-testing, and system-slot actions for the shared HUD.
 * @param {object} [options={}] Hotbar runtime dependencies.
 * @param {{ ui?: { data?: { hotbarTooltips?: Array<string>, hotbarItems?: Array<object> | null, hotbarActiveIndex?: number } }, debug?: { enabled?: boolean } } | null} [options.hud=null] HUD state object used to read and mutate hotbar/debug presentation data.
 * @param {number} [options.hotbarSlotCount=HUD_HOTBAR_SLOT_COUNT] Total number of visible hotbar slots.
 * @param {boolean} [options.reserveSystemHotbarSlots=true] Whether the shared debug/help hotbar slots stay reserved.
 * @param {(() => void) | null} [options.toggleHelp=null] Callback invoked when the Help system slot is pressed.
 * @param {(() => void) | null} [options.markDirty=null] Callback used to request a HUD rerender after state changes.
 * @returns {{
 *   getPreferredHotbarWindowSize: () => { w: number, h: number, minW: number, minH: number, stripW: number, leftGutter: number, rightGutter: number, chrome: boolean },
 *   syncHotbarWindowSize: () => { w: number, h: number, minW: number, minH: number, stripW: number, leftGutter: number, rightGutter: number, chrome: boolean } | null,
 *   getHotbarSlotLayout: (win: { x: number, y: number, w: number }) => { pad: number, titleH: number, slot: number, gap: number, slots: number, startX: number, startY: number },
 *   hitTestHotbarSlotIndex: (win: { x: number, y: number, w: number, collapsed?: boolean } | null, px: number, py: number) => number,
 *   setHotbarItems: (nextItems: Array<object> | null | undefined) => void,
 *   setHotbarActiveIndex: (nextIndex: number | null | undefined) => void,
 *   updateSystemHotbarPresentation: () => void,
 *   handleSystemHotbarSlot: (idx: number) => boolean,
 * }} Hotbar helpers bound to the provided runtime dependencies.
 * Side effects: returned methods can mutate `hud.ui.data.hotbarTooltips`, `hud.ui.data.hotbarItems`, `hud.ui.data.hotbarActiveIndex`, and `hud.debug.enabled`, and may call `toggleHelp()` and `markDirty()`.
 */
export function createHudHotbarRuntime({
  hud = null,
  hotbarSlotCount = HUD_HOTBAR_SLOT_COUNT,
  hotbarSlotSizePx = HUD_HOTBAR_SLOT_SIZE_PX,
  reserveSystemHotbarSlots = true,
  toggleHelp = null,
  toggleDebug = null,
  markDirty = null,
} = {}) {
  const slots = Number.isFinite(hotbarSlotCount)
    ? Math.max(1, Math.floor(hotbarSlotCount))
    : HUD_HOTBAR_SLOT_COUNT;
  const defaultSlotSize = Number.isFinite(hotbarSlotSizePx)
    ? Math.max(20, Math.floor(Number(hotbarSlotSizePx)))
    : HUD_HOTBAR_SLOT_SIZE_PX;
  const shouldReserveSystemHotbarSlots = reserveSystemHotbarSlots !== false;

  if (hud?.ui?.data) {
    hud.ui.data.reserveSystemHotbarSlots = shouldReserveSystemHotbarSlots;
  }

  function hasToolbarChrome() {
    const title = String(hud?.ui?.data?.hotbarHeaderTitle ?? "").trim();
    const status = String(hud?.ui?.data?.hotbarStatusText ?? "").trim();
    return !!title || !!status;
  }

  function getHotbarItems() {
    return Array.isArray(hud?.ui?.data?.hotbarItems)
      ? hud.ui.data.hotbarItems
      : [];
  }

  function getCompactHeaderTitle(title) {
    return String(title ?? "")
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  function getCompactStatusText(status) {
    const resolved = String(status ?? "").trim();
    if (!resolved) return "";
    if (resolved.includes("•")) {
      return resolved.split("•").pop()?.trim() || resolved;
    }
    return resolved;
  }

  function getTitleTextWidthPx(title) {
    const resolved = String(title ?? "").trim();
    if (!resolved) return 0;
    return estimateTextWidthPx(resolved, HOTBAR_HEADER_TEXT_DOT_PX, HUD_TEXT_ESTIMATE_GAP_PX);
  }

  function getStatusBadgeWidthPx(status) {
    const resolved = String(status ?? "").trim();
    if (!resolved) return 0;
    const badgeTextW = estimateTextWidthPx(resolved, HOTBAR_STATUS_TEXT_DOT_PX, HUD_TEXT_ESTIMATE_GAP_PX);
    return Math.max(HOTBAR_STATUS_MIN_WIDTH_PX, badgeTextW + 28);
  }

  function getPreferredLeftGutterPx(pad = HUD_OVERLAY_PADDING_PX) {
    const title = String(hud?.ui?.data?.hotbarHeaderTitle ?? "").trim();
    if (!title) return pad;
    return Math.max(
      HOTBAR_HEADER_LEFT_GUTTER_PX,
      HOTBAR_HEADER_TEXT_OFFSET_X_PX + getTitleTextWidthPx(title) + HOTBAR_HEADER_GUTTER_RIGHT_PADDING_PX
    );
  }

  function getPreferredRightGutterPx(pad = HUD_OVERLAY_PADDING_PX) {
    const status = String(hud?.ui?.data?.hotbarStatusText ?? "").trim();
    if (!status) return pad;
    return Math.max(
      HOTBAR_HEADER_RIGHT_GUTTER_PX,
      getStatusBadgeWidthPx(status) + HOTBAR_STATUS_GUTTER_PADDING_PX
    );
  }

  function getCompactLeftGutterPx(pad = HUD_OVERLAY_PADDING_PX) {
    const compactTitle = getCompactHeaderTitle(hud?.ui?.data?.hotbarHeaderTitle ?? "");
    if (!compactTitle) return pad;
    return Math.max(
      HOTBAR_HEADER_COMPACT_LEFT_GUTTER_PX,
      HOTBAR_HEADER_COMPACT_TEXT_OFFSET_X_PX
        + estimateTextWidthPx(compactTitle, HOTBAR_HEADER_TEXT_DOT_PX, HUD_TEXT_ESTIMATE_GAP_PX)
        + 12
    );
  }

  function getCompactRightGutterPx(pad = HUD_OVERLAY_PADDING_PX) {
    const compactStatus = getCompactStatusText(hud?.ui?.data?.hotbarStatusText ?? "");
    if (!compactStatus) return pad;
    return Math.max(
      HOTBAR_HEADER_COMPACT_RIGHT_GUTTER_PX,
      getStatusBadgeWidthPx(compactStatus) + 12
    );
  }

  function getResolvedSlotWidth(item, defaultSlot) {
    if (Number.isFinite(item?.slotWidthPx)) {
      return Math.max(item?.spacer === true ? HOTBAR_SPACER_MIN_WIDTH_PX : 16, Math.floor(Number(item.slotWidthPx)));
    }
    if (item?.spacer === true) {
      return Math.max(HOTBAR_SPACER_MIN_WIDTH_PX, Math.floor(defaultSlot * 0.22));
    }
    return defaultSlot;
  }

  function getResolvedGapAfter(index, defaultGap, items) {
    const current = items[index] ?? null;
    const next = items[index + 1] ?? null;
    if (current?.spacer === true || next?.spacer === true) {
      return Math.max(2, Math.min(defaultGap, HOTBAR_SPACER_GAP_PX));
    }
    return defaultGap;
  }

  function getStripWidth(slot, gap, items = getHotbarItems()) {
    let width = 0;
    for (let index = 0; index < slots; index += 1) {
      width += getResolvedSlotWidth(items[index], slot);
      if (index < slots - 1) {
        width += getResolvedGapAfter(index, gap, items);
      }
    }
    return width;
  }

  function buildSlotMetrics(startX, startY, slot, gap, items = getHotbarItems()) {
    const metrics = new Array(slots);
    let cursorX = startX;
    for (let index = 0; index < slots; index += 1) {
      const width = getResolvedSlotWidth(items[index], slot);
      metrics[index] = {
        index,
        x: cursorX,
        y: startY,
        w: width,
        h: slot,
      };
      cursorX += width;
      if (index < slots - 1) {
        cursorX += getResolvedGapAfter(index, gap, items);
      }
    }
    return metrics;
  }

  function getHotbarSlotLayout(win) {
    const pad = HUD_OVERLAY_PADDING_PX;
    const titleH = 0;
    let slot = defaultSlotSize;
    let gap = HUD_HOTBAR_SLOT_GAP_PX;
    const items = getHotbarItems();
    let stripW = getStripWidth(slot, gap, items);
    const chrome = hasToolbarChrome();
    let leftGutter = chrome ? getPreferredLeftGutterPx(pad) : pad;
    let rightGutter = chrome ? getPreferredRightGutterPx(pad) : pad;
    const minLeftGutter = chrome ? getCompactLeftGutterPx(pad) : pad;
    const minRightGutter = chrome ? getCompactRightGutterPx(pad) : pad;

    let usableW = Math.max(slot, win.w - leftGutter - rightGutter);
    if (chrome && usableW < stripW) {
      const overflow = stripW - usableW;
      const shrinkRight = Math.min(rightGutter - minRightGutter, Math.ceil(overflow * 0.6));
      rightGutter -= Math.max(0, shrinkRight);
      usableW = Math.max(slot, win.w - leftGutter - rightGutter);

      const remainingOverflow = stripW - usableW;
      const shrinkLeft = Math.min(leftGutter - minLeftGutter, Math.max(0, remainingOverflow));
      leftGutter -= Math.max(0, shrinkLeft);
      usableW = Math.max(slot, win.w - leftGutter - rightGutter);
    }

    if (usableW < stripW) {
      const minGap = slots > 1 ? 4 : 0;
      const compactSlot = Math.floor((usableW - Math.max(0, slots - 1) * minGap) / Math.max(1, slots));
      slot = Math.max(20, Math.min(defaultSlotSize, compactSlot));
      gap = slots > 1
        ? Math.max(3, Math.floor((usableW - slots * slot) / Math.max(1, slots - 1)))
        : 0;
      stripW = getStripWidth(slot, gap, items);
    }

    if (chrome && usableW < stripW) {
      leftGutter = pad;
      rightGutter = pad;
      usableW = Math.max(slot, win.w - leftGutter - rightGutter);
      const minGap = slots > 1 ? 2 : 0;
      const compactSlot = Math.floor((usableW - Math.max(0, slots - 1) * minGap) / Math.max(1, slots));
      slot = Math.max(20, Math.min(slot, compactSlot));
      gap = slots > 1
        ? Math.max(2, Math.floor((usableW - slots * slot) / Math.max(1, slots - 1)))
        : 0;
      stripW = getStripWidth(slot, gap, items);
    }

    usableW = Math.max(slot, win.w - leftGutter - rightGutter);
    const startX = win.x + leftGutter + Math.max(0, Math.floor((usableW - stripW) / 2));
    const startY = win.y + Math.max(0, Math.floor((win.h - slot) / 2));
    const slotMetrics = buildSlotMetrics(startX, startY, slot, gap, items);
    return {
      pad,
      titleH,
      slot,
      gap,
      slots,
      stripW,
      startX,
      startY,
      slotMetrics,
      leftGutter,
      rightGutter,
      chrome,
    };
  }

  function getPreferredHotbarWindowSize() {
    const pad = HUD_OVERLAY_PADDING_PX;
    const slot = defaultSlotSize;
    const gap = HUD_HOTBAR_SLOT_GAP_PX;
    const items = getHotbarItems();
    const stripW = getStripWidth(slot, gap, items);
    const chrome = hasToolbarChrome();
    const leftGutter = chrome ? getPreferredLeftGutterPx(pad) : pad;
    const rightGutter = chrome ? getPreferredRightGutterPx(pad) : pad;
    const verticalPad = chrome
      ? HOTBAR_WINDOW_CHROME_VERTICAL_PADDING_PX
      : HOTBAR_WINDOW_VERTICAL_PADDING_PX;
    const width = Math.round(Math.max(stripW + leftGutter + rightGutter, stripW + pad * 2));
    const height = Math.round(slot + verticalPad * 2);
    return {
      w: width,
      h: height,
      minW: width,
      minH: height,
      stripW,
      leftGutter,
      rightGutter,
      chrome,
    };
  }

  function syncHotbarWindowSize() {
    const win = hud?.ui?.windows?.hotbar;
    if (!win) return null;

    const preferred = getPreferredHotbarWindowSize();
    const layoutW = Number.isFinite(Number(hud?.layoutW))
      ? Math.max(1, Math.round(Number(hud.layoutW)))
      : null;
    const layoutH = Number.isFinite(Number(hud?.layoutH))
      ? Math.max(1, Math.round(Number(hud.layoutH)))
      : null;
    const nextMinW = layoutW == null
      ? preferred.minW
      : Math.min(preferred.minW, layoutW);
    const nextMinH = layoutH == null
      ? preferred.minH
      : Math.min(preferred.minH, layoutH);
    const nextW = layoutW == null
      ? preferred.w
      : clamp(preferred.w, nextMinW, layoutW);
    const nextH = layoutH == null
      ? preferred.h
      : clamp(preferred.h, nextMinH, layoutH);
    const previousWidth = Number.isFinite(Number(win.w)) ? Number(win.w) : preferred.w;
    const previousCenterX = Number.isFinite(Number(win.x))
      ? Number(win.x) + previousWidth * 0.5
      : null;
    let changed = false;

    if (Math.round(Number(win.minW) || 0) !== nextMinW) {
      win.minW = nextMinW;
      changed = true;
    }
    if (Math.round(Number(win.minH) || 0) !== nextMinH) {
      win.minH = nextMinH;
      changed = true;
    }
    if (Math.round(Number(win.w) || 0) !== nextW) {
      win.w = nextW;
      changed = true;
    }
    if (Math.round(Number(win.h) || 0) !== nextH) {
      win.h = nextH;
      changed = true;
    }
    if (Number.isFinite(previousCenterX) && Number(win.y) >= -1000) {
      const unclampedX = Math.round(previousCenterX - nextW * 0.5);
      const maxX = layoutW == null ? null : Math.max(0, layoutW - nextW);
      const nextX = maxX == null ? unclampedX : clamp(unclampedX, 0, maxX);
      if (Math.round(Number(win.x) || 0) !== nextX) {
        win.x = nextX;
        changed = true;
      }
    }

    if (changed && typeof markDirty === "function") {
      markDirty();
    }
    return preferred;
  }

  function hitTestHotbarSlotIndex(win, px, py) {
    if (!win || win.collapsed) return -1;
    const { slot, startX, startY, stripW, slotMetrics } = getHotbarSlotLayout(win);
    if (
      !rectContains(
        startX,
        startY,
        stripW,
        slot,
        px,
        py
      )
    ) {
      return -1;
    }
    for (let index = 0; index < slotMetrics.length; index += 1) {
      const metric = slotMetrics[index];
      if (!metric) continue;
      if (!rectContains(metric.x, metric.y, metric.w, metric.h, px, py)) continue;
      const item = Array.isArray(hud?.ui?.data?.hotbarItems)
        ? hud.ui.data.hotbarItems[index] ?? null
        : null;
      if (item?.interactive === false) return -1;
      return index;
    }
    return -1;
  }

  function getSystemHotbarSlotIndices() {
    if (!shouldReserveSystemHotbarSlots) {
      return { helpIdx: -1, dbgIdx: -1 };
    }
    const helpIdx = slots === HUD_HOTBAR_SLOT_COUNT
      ? HUD_SYSTEM_HOTBAR_HELP_SLOT_INDEX
      : Math.max(0, slots - 1);
    const dbgIdx = slots === HUD_HOTBAR_SLOT_COUNT
      ? HUD_SYSTEM_HOTBAR_DEBUG_SLOT_INDEX
      : Math.max(0, helpIdx - 1);
    return { helpIdx, dbgIdx };
  }

  function normalizeHotbarItems(nextItems) {
    const source = Array.isArray(nextItems) ? nextItems : [];
    const resolved = new Array(slots).fill(null);
    for (let index = 0; index < slots; index += 1) {
      const entry = source[index];
      if (!entry || typeof entry !== "object") continue;
      resolved[index] = {
        ...entry,
        tooltip: entry.tooltip == null ? undefined : String(entry.tooltip),
        shortLabel: entry.shortLabel == null ? undefined : String(entry.shortLabel),
        iconText: entry.iconText == null ? undefined : String(entry.iconText),
      };
    }
    return resolved;
  }

  function setHotbarItems(nextItems) {
    if (!hud?.ui?.data) return;
    hud.ui.data.hotbarItems = normalizeHotbarItems(nextItems);
    updateSystemHotbarPresentation();
    syncHotbarWindowSize();
    if (typeof markDirty === "function") markDirty();
  }

  function setHotbarActiveIndex(nextIndex) {
    if (!hud?.ui?.data) return;
    hud.ui.data.hotbarActiveIndex = Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < slots
      ? Number(nextIndex)
      : -1;
    if (typeof markDirty === "function") markDirty();
  }

  function updateSystemHotbarPresentation() {
    if (!hud?.ui?.data) return;
    const { helpIdx, dbgIdx } = getSystemHotbarSlotIndices();
    const items = normalizeHotbarItems(hud.ui.data.hotbarItems);

    const tips = Array.isArray(hud.ui.data.hotbarTooltips)
      ? hud.ui.data.hotbarTooltips.slice()
      : new Array(slots).fill("");

    for (let index = 0; index < slots; index += 1) {
      const tooltip = items[index]?.tooltip;
      if (typeof tooltip === "string") {
        tips[index] = tooltip;
      }
    }

    hud.ui.data.hotbarTooltips = tips;
    hud.ui.data.hotbarItems = items;
    if (!Number.isInteger(hud.ui.data.hotbarActiveIndex)) {
      hud.ui.data.hotbarActiveIndex = -1;
    }

    const helpItem = helpIdx >= 0 ? items[helpIdx] : null;
    const debugItem = dbgIdx >= 0 ? items[dbgIdx] : null;
    const appOwnsTailSlots = helpItem?.systemSlot === false || debugItem?.systemSlot === false;

    if (!shouldReserveSystemHotbarSlots || helpIdx < 0 || dbgIdx < 0 || appOwnsTailSlots) {
      return;
    }

    tips[helpIdx] = "Help";
    const dbgWin = hud.ui?.windows?.debug;
    tips[dbgIdx] = dbgWin && Number(dbgWin.y) >= -1000 ? "Debug: ON" : "Debug: OFF";
    items[helpIdx] = {
      ...(items[helpIdx] ?? {}),
      tooltip: items[helpIdx]?.tooltip ?? "Help",
      shortLabel: items[helpIdx]?.shortLabel ?? "HLP",
      iconText: items[helpIdx]?.iconText ?? "HLP",
      outlineColor: items[helpIdx]?.outlineColor ?? HUD_SURFACE_ACCENT_COLOR,
      activeOutlineColor: items[helpIdx]?.activeOutlineColor ?? HUD_PRIMARY_HIGHLIGHT_COLOR,
    };
    items[dbgIdx] = {
      ...(items[dbgIdx] ?? {}),
      tooltip: items[dbgIdx]?.tooltip ?? tips[dbgIdx],
      shortLabel: items[dbgIdx]?.shortLabel ?? "DBG",
      iconText: items[dbgIdx]?.iconText ?? "DBG",
      outlineColor: items[dbgIdx]?.outlineColor ?? HUD_SURFACE_ACCENT_COLOR,
      activeOutlineColor: items[dbgIdx]?.activeOutlineColor ?? HUD_PRIMARY_HIGHLIGHT_COLOR,
    };
    hud.ui.data.hotbarTooltips = tips;
    hud.ui.data.hotbarItems = items;
    syncHotbarWindowSize();
  }

  function handleSystemHotbarSlot(idx) {
    if (!shouldReserveSystemHotbarSlots) return false;
    const item = Array.isArray(hud?.ui?.data?.hotbarItems)
      ? hud.ui.data.hotbarItems[idx] ?? null
      : null;
    if (item?.systemSlot === false) return false;
    const { helpIdx, dbgIdx } = getSystemHotbarSlotIndices();
    if (idx === helpIdx) {
      if (typeof toggleHelp === "function") toggleHelp();
      if (typeof markDirty === "function") markDirty();
      return true;
    }
    if (idx === dbgIdx) {
      if (typeof toggleDebug === "function") toggleDebug();
      if (typeof markDirty === "function") markDirty();
      return true;
    }
    return false;
  }

  return {
    getPreferredHotbarWindowSize,
    syncHotbarWindowSize,
    getHotbarSlotLayout,
    hitTestHotbarSlotIndex,
    setHotbarItems,
    setHotbarActiveIndex,
    updateSystemHotbarPresentation,
    handleSystemHotbarSlot,
  };
}
