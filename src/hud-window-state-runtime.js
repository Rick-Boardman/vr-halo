// SPDX-License-Identifier: Apache-2.0
/**
 * Create shared window-state helpers for HUD text content, tooltip state, and UI hit testing.
 * @param {object} [options={}] Window-state runtime dependencies.
 * @param {{ layoutW?: number, layoutH?: number, ui?: { windows?: Record<string, any>, order?: Array<string>, data?: Record<string, any> }, overlay?: { contextMenu?: any, externalTooltip?: any } }} options.hud Shared HUD state model.
 * @param {{ xr?: { isPresenting?: boolean } }} options.renderer Renderer used to gate desktop-only hit testing while XR is presenting.
 * @param {any} options.dom Canvas/DOM element used for client-to-layout coordinate conversion.
 * @param {() => void} options.markDirty Callback invoked whenever window state changes require a HUD rerender.
 * @param {(x: number, y: number, w: number, h: number, px: number, py: number) => boolean} options.rectContains Rectangle hit-test helper.
 * @param {(clientX: number, clientY: number, dom: any) => {x:number,y:number}|null} options.getNormalizedClientPoint Client-coordinate normalization helper.
 * @param {number} options.titleHeightPx Window title-bar height in layout pixels.
 * @returns {{setWindowLines: (windowKey: string, entries: Array<unknown> | unknown, options?: {append?: boolean, scrollMode?: string, footerEntries?: Array<unknown> | null}) => void, setWindowTextCaret: (windowKey: string, caretState: object | null | undefined) => void, setWindowScrollTop: (windowKey: string, scrollTop: number, scrollMode?: string) => void, setWindowTextSelection: (windowKey: string, selectionState: object | null | undefined) => void, setExternalTooltip: (options?: { visible?: boolean, text?: string, entries?: Array<unknown> | null, x?: number, y?: number, vrWorldPos?: unknown }) => void, appendChatLine: (entry: unknown, options?: {scrollMode?: string}) => void, isPointOverUi: (px: number, py: number) => boolean, isClientPointOverUi: (clientX: number, clientY: number) => boolean}} Window-state helpers for shared HUD APIs.
 * Side effects: mutates `hud.ui` and `hud.overlay` data stores, updates caret/selection/scroll state, and marks HUD rendering dirty.
 */
export function createHudWindowStateRuntime({
  hud,
  renderer,
  dom,
  markDirty,
  rectContains,
  getNormalizedClientPoint,
  titleHeightPx,
} = {}) {
  function setWindowLines(windowKey, entries, options = {}) {
    const w = hud.ui.windows?.[windowKey];
    const storeKey =
      w && typeof w.linesKey === "function"
        ? w.linesKey()
        : `${String(windowKey ?? "")}Lines`;
    if (!hud.ui.data) hud.ui.data = {};

    const next = Array.isArray(entries) ? entries : [entries];
    if (options.append) {
      const cur = Array.isArray(hud.ui.data[storeKey])
        ? hud.ui.data[storeKey]
        : [];
      let combined = cur.concat(next);
      const max =
        w && Number.isFinite(w.maxLines) && w.maxLines > 0 ? w.maxLines : null;
      if (max && combined.length > max) combined = combined.slice(-max);
      hud.ui.data[storeKey] = combined;
    } else {
      hud.ui.data[storeKey] = next;
    }

    if (w) {
      if (Object.prototype.hasOwnProperty.call(options, "footerEntries")) {
        w._footerEntries = Array.isArray(options.footerEntries)
          ? options.footerEntries.slice()
          : [];
      } else if (!options.append) {
        w._footerEntries = [];
      }
      if (options.scrollMode) w.scrollMode = options.scrollMode;
      else if (options.append) w.scrollMode = "end";
    }
    markDirty();
  }

  function setWindowTextCaret(windowKey, caretState) {
    const w = hud.ui?.windows?.[windowKey];
    if (!w) return;
    w._textCaret = caretState && typeof caretState === "object" ? caretState : { visible: false };
    markDirty();
  }

  function setWindowScrollTop(windowKey, scrollTop, scrollMode = "manual") {
    const w = hud.ui?.windows?.[windowKey];
    if (!w || !Number.isFinite(scrollTop)) return;
    w.scrollTop = Math.max(0, Math.floor(scrollTop));
    w.scrollMode = scrollMode;
    markDirty();
  }

  function setWindowTextSelection(windowKey, selectionState) {
    const w = hud.ui?.windows?.[windowKey];
    if (!w) return;
    w._textSelection =
      selectionState && typeof selectionState === "object"
        ? selectionState
        : { visible: false };
    markDirty();
  }

  function setExternalTooltip({ visible, text, entries, x, y, vrWorldPos } = {}) {
    if (!hud.overlay) hud.overlay = {};
    if (!hud.overlay.externalTooltip) {
      hud.overlay.externalTooltip = {
        visible: false,
        text: "",
        entries: null,
        x: 0,
        y: 0,
        vrWorldPos: null,
      };
    }
    const tip = hud.overlay.externalTooltip;
    tip.visible = !!visible;
    tip.text = String(text ?? "");
    tip.entries = Array.isArray(entries) ? entries : null;
    if (Number.isFinite(x)) tip.x = Number(x);
    if (Number.isFinite(y)) tip.y = Number(y);
    tip.vrWorldPos = vrWorldPos || null;
    markDirty();
  }

  function appendChatLine(entry, options = {}) {
    setWindowLines("chat", entry, {
      append: true,
      scrollMode: options.scrollMode ?? "end",
    });
  }

  function isPointOverUi(px, py) {
    const x = Number(px);
    const y = Number(py);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const menu = hud.overlay?.contextMenu;
    if (menu?.open) {
      if (rectContains(menu.x, menu.y, menu.w, menu.h, x, y)) return true;
    }

    const order = Array.isArray(hud.ui?.order) ? hud.ui.order : [];
    for (let i = order.length - 1; i >= 0; i--) {
      const key = order[i];
      const w = hud.ui?.windows?.[key];
      if (!w) continue;
      const h = w.collapsed ? titleHeightPx : w.h;
      if (rectContains(w.x, w.y, w.w, h, x, y)) return true;
    }

    return false;
  }

  function isClientPointOverUi(clientX, clientY) {
    if (renderer.xr.isPresenting) return false;
    const point = getNormalizedClientPoint(clientX, clientY, dom);
    if (!point) return false;
    const px = point.x * hud.layoutW;
    const py = point.y * hud.layoutH;
    return isPointOverUi(px, py);
  }

  return {
    setWindowLines,
    setWindowTextCaret,
    setWindowScrollTop,
    setWindowTextSelection,
    setExternalTooltip,
    appendChatLine,
    isPointOverUi,
    isClientPointOverUi,
  };
}
