// SPDX-License-Identifier: Apache-2.0
/**
 * WebGL HUD form controls: dropdown, number field, checkbox, slider, button and
 * status line, laid out in rows, hit-tested in window pixels and painted on a
 * 2D canvas that the caller uploads as a texture.
 *
 * This module holds no Three.js objects and no DOM listeners. The caller feeds
 * it pointer samples in window coordinates (desktop mouse, touch and the XR
 * controller ray all arrive as the HUD's `pointer` or `vrPointer`, already in
 * layout pixels) and key events; `hud-settings-window.js` is the standard
 * caller. Every value a control shows is read through a callback, and every
 * change is reported through one, so persistence and policy stay with the app.
 *
 * Coordinates: origin at the window's top-left, +y down, in HUD layout pixels.
 */

const DEFAULT_METRICS = Object.freeze({
  top: 40,
  pad: 16,
  labelW: 118,
  rowH: 36,
  gap: 8,
  statusH: 22,
  buttonH: 36,
  optionH: 32,
  sliderInset: 14,
  sliderValueW: 64,
});

/** Colours a consumer may override; any CSS colour string. */
export const DEFAULT_FORM_PALETTE = Object.freeze({
  field: "#1c2433",
  fieldEdge: "#7f95b8",
  ink: "#e8eef7",
  accent: "#9cc4ff",
  hot: "#2a3a55",
  well: "#121822",
  font: "Segoe UI, Trebuchet MS, sans-serif",
});

const KINDS = new Set(["status", "dropdown", "number", "checkbox", "slider", "button"]);

/**
 * Whether a point lies inside a box (left/top inclusive, right/bottom exclusive).
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function contains(box, x, y) {
  return !!box && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
}

/**
 * Keep digits and, when allowed, one decimal point; stop at maxLength characters.
 * @param {unknown} value
 * @param {{ maxLength?: number, allowDecimal?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeNumberText(value, { maxLength = 5, allowDecimal = true } = {}) {
  let out = "";
  let dot = false;
  for (const ch of String(value ?? "")) {
    if (out.length >= maxLength) break;
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && allowDecimal && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

function validateRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("[halo:form] rows must be an array");
  const keys = new Set();
  for (const row of rows) {
    if (!row || !KINDS.has(row.kind)) {
      throw new TypeError(`[halo:form] unknown row kind: ${row?.kind}`);
    }
    if (typeof row.key !== "string" || !row.key) throw new TypeError("[halo:form] every row needs a key");
    if (keys.has(row.key)) throw new TypeError(`[halo:form] duplicate row key: ${row.key}`);
    keys.add(row.key);
  }
}

function readOptions(row) {
  const list = typeof row.options === "function" ? row.options() : row.options;
  if (!Array.isArray(list)) return [];
  return list.map((option) => ({ value: option?.value, label: String(option?.label ?? option?.value ?? "") }));
}

/**
 * Lay rows out top to bottom: status lines and checkboxes and buttons span the
 * window, the others sit right of a label column. A dropdown's option list
 * opens below its field, or above it when it would run past the window bottom.
 * @param {Array<object>} rows Row descriptors (see createHudFormController).
 * @param {number} width Window width in layout pixels.
 * @param {number} height Window height in layout pixels.
 * @param {Partial<typeof DEFAULT_METRICS>} [metrics]
 * @returns {Array<{ key: string, kind: string, row: object, box: { x: number, y: number, w: number, h: number }, options?: Array<{ value: unknown, label: string, x: number, y: number, w: number, h: number }> }>}
 */
export function layoutFormRows(rows, width, height, metrics = {}) {
  const m = { ...DEFAULT_METRICS, ...metrics };
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const controlX = m.pad + m.labelW;
  const controlW = Math.max(80, w - controlX - m.pad);
  const fullW = Math.max(1, w - m.pad * 2);
  let y = m.top + 12;
  const items = [];
  for (const row of rows) {
    let box;
    if (row.kind === "status") box = { x: m.pad, y, w: fullW, h: m.statusH };
    else if (row.kind === "checkbox") box = { x: m.pad, y, w: fullW, h: m.rowH };
    else if (row.kind === "button") box = { x: m.pad, y, w: fullW, h: m.buttonH };
    else if (row.kind === "slider") box = { x: controlX, y, w: Math.max(80, controlW - m.sliderValueW), h: m.rowH };
    else box = { x: controlX, y, w: controlW, h: m.rowH };
    const item = { key: row.key, kind: row.kind, row, box };
    if (row.kind === "dropdown") {
      const named = readOptions(row);
      let options = named.map((option, i) => ({
        ...option,
        x: box.x,
        y: box.y + box.h + 4 + i * m.optionH,
        w: box.w,
        h: m.optionH,
      }));
      const bottom = options.length ? options[options.length - 1].y + m.optionH : 0;
      if (bottom > h - 8) {
        const listH = options.length * m.optionH;
        options = options.map((option, i) => ({ ...option, y: box.y - 4 - listH + i * m.optionH }));
      }
      item.options = options;
    }
    items.push(item);
    y += box.h + m.gap;
  }
  return items;
}

/**
 * Pointer, keyboard and paint state for one set of form rows.
 *
 * Row descriptors (all callbacks are the app's; none is required to persist):
 * - `{ kind: "status", key, text: () => string }`
 * - `{ kind: "dropdown", key, label, options: () => Array<{ value, label }>, value: () => unknown, text?: () => string, onSelect: (value) => void }`
 * - `{ kind: "number", key, label, value: () => string, sanitize?: (text) => string, onCommit: (text) => void }`
 * - `{ kind: "checkbox", key, label, checked: () => boolean, onToggle: (next: boolean) => void }`
 * - `{ kind: "slider", key, label, value: () => number (0..1), onInput: (value: number) => void, format?: (value) => string }`
 * - `{ kind: "button", key, label, onPress: () => void }`
 *
 * A number field takes typing from `handleKey` (desktop) or from `keyboard`, an
 * object with `open()`, `close()` and `isSupported()` such as
 * `createWebXrSystemKeyboardBridge` returns, whose `getValue`/`onInput`/`onDismiss`
 * the caller wires to `draftText`, `setDraft` and `commit`.
 *
 * @param {object} options
 * @param {Array<object>} options.rows
 * @param {Partial<typeof DEFAULT_FORM_PALETTE>} [options.palette]
 * @param {Partial<typeof DEFAULT_METRICS>} [options.metrics]
 * @param {{ open: () => boolean, close: () => void, isSupported: () => boolean } | null} [options.keyboard]
 * @param {() => number} [options.now] Clock for the caret blink, in milliseconds.
 */
export function createHudFormController({ rows, palette = {}, metrics = {}, keyboard = null, now = () => Date.now() } = {}) {
  validateRows(rows);
  const colors = { ...DEFAULT_FORM_PALETTE, ...palette };
  const sizes = { ...DEFAULT_METRICS, ...metrics };
  let kb = keyboard;
  let openKey = "";
  let focusKey = "";
  let draft = "";
  let slideKey = "";
  let hoverKey = "";
  let dirty = 1;

  const byKey = (key) => rows.find((row) => row.key === key) ?? null;
  const layout = (width, height) => layoutFormRows(rows, width, height, sizes);

  function hitKey(items, x, y) {
    if (openKey) {
      const open = items.find((item) => item.key === openKey);
      const option = open?.options?.find((entry) => contains(entry, x, y));
      if (option) return `${openKey}:${option.label}`;
    }
    const item = items.find((entry) => entry.kind !== "status" && contains(entry.box, x, y));
    return item ? item.key : "";
  }

  function slideTo(item, x) {
    const span = Math.max(1, item.box.w - sizes.sliderInset * 2);
    const t = (x - (item.box.x + sizes.sliderInset)) / span;
    item.row.onInput?.(Math.min(1, Math.max(0, t)));
    dirty += 1;
  }

  function focus(row) {
    if (focusKey === row.key) return;
    commit();
    focusKey = row.key;
    draft = String(row.value?.() ?? "");
    dirty += 1;
    if (kb?.isSupported?.()) kb.open();
  }

  /** Commit the focused number field's draft through its onCommit. */
  function commit() {
    if (!focusKey) return;
    const row = byKey(focusKey);
    const text = draft;
    focusKey = "";
    draft = "";
    kb?.close?.();
    dirty += 1;
    if (row && text !== "" && text !== ".") row.onCommit?.(text);
  }

  /** Drop the focused number field's draft without committing it. */
  function cancel() {
    if (!focusKey) return;
    focusKey = "";
    draft = "";
    kb?.close?.();
    dirty += 1;
  }

  function press(items, x, y) {
    if (openKey) {
      const open = items.find((item) => item.key === openKey);
      const option = open?.options?.find((entry) => contains(entry, x, y));
      openKey = "";
      dirty += 1;
      if (option) {
        commit();
        open.row.onSelect?.(option.value);
        return;
      }
      if (open && contains(open.box, x, y)) {
        commit();
        return;
      }
    }
    const item = items.find((entry) => entry.kind !== "status" && contains(entry.box, x, y));
    if (item?.kind === "number") {
      focus(item.row);
      return;
    }
    commit();
    if (!item) return;
    dirty += 1;
    if (item.kind === "dropdown") openKey = item.key;
    else if (item.kind === "checkbox") item.row.onToggle?.(!item.row.checked?.());
    else if (item.kind === "slider") {
      slideKey = item.key;
      slideTo(item, x);
    } else if (item.kind === "button") item.row.onPress?.();
  }

  /**
   * Feed one pointer sample, in window pixels.
   * @param {{ x: number, y: number, down: boolean, pressed: boolean, width: number, height: number }} sample
   */
  function pointer({ x, y, down, pressed, width, height }) {
    const items = layout(width, height);
    const px = Number(x);
    const py = Number(y);
    if (slideKey && down) {
      const item = items.find((entry) => entry.key === slideKey);
      if (item) slideTo(item, px);
    }
    if (!down) slideKey = "";
    // A press only lands inside the window's visible area; rows a short window
    // clips off its bottom take no input.
    const inside = Number.isFinite(px) && Number.isFinite(py) && px >= 0 && py >= 0 && px < width && py < height;
    if (pressed && inside) press(items, px, py);
    const nextHover = (down || openKey) && Number.isFinite(px) && Number.isFinite(py) ? hitKey(items, px, py) : "";
    if (nextHover !== hoverKey) {
      hoverKey = nextHover;
      dirty += 1;
    }
  }

  /**
   * The window was hidden: close menus, stop sliding, commit any typing.
   */
  function reset() {
    if (openKey || slideKey || hoverKey) dirty += 1;
    openKey = "";
    slideKey = "";
    hoverKey = "";
    commit();
  }

  /**
   * Desktop typing into the focused number field.
   * @param {{ key: string, preventDefault?: () => void, stopPropagation?: () => void, stopImmediatePropagation?: () => void }} event
   * @returns {boolean} Whether the event was consumed.
   */
  function handleKey(event) {
    if (!focusKey) return false;
    const key = event?.key;
    if (key === "Tab") return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    if (key === "Escape") cancel();
    else if (key === "Enter") commit();
    else if (key === "Backspace") setDraft(draft.slice(0, -1));
    else if (typeof key === "string" && key.length === 1) setDraft(draft + key);
    return true;
  }

  /** Replace the focused field's draft, sanitized. Used by the XR system keyboard. */
  function setDraft(text) {
    if (!focusKey) return;
    const row = byKey(focusKey);
    const clean = typeof row?.sanitize === "function" ? row.sanitize(String(text ?? "")) : sanitizeNumberText(text);
    if (clean === draft) return;
    draft = clean;
    dirty += 1;
  }

  /**
   * The window height every row needs: the bottom of the last row plus the pad.
   * @param {number} width
   * @param {number} [extra=0] Height the caller paints under the last row.
   */
  function contentHeight(width, extra = 0) {
    const items = layout(width, Number.MAX_SAFE_INTEGER);
    const last = items[items.length - 1];
    const bottom = last ? last.box.y + last.box.h : sizes.top;
    return Math.ceil(bottom + Math.max(0, Number(extra) || 0) + sizes.pad);
  }

  function blinkOn() {
    return !!focusKey && Math.floor(now() / 450) % 2 === 0;
  }

  /**
   * A string that changes whenever a paint would differ. Callers skip the
   * paint and the texture upload when it is unchanged.
   * @param {number} width
   * @param {number} height
   */
  function signature(width, height) {
    const values = rows.map((row) => {
      if (row.kind === "status") return row.text?.();
      if (row.kind === "dropdown") return `${row.text?.() ?? row.value?.()}/${readOptions(row).map((o) => o.label).join(",")}`;
      if (row.kind === "number") return row.value?.();
      if (row.kind === "checkbox") return !!row.checked?.();
      if (row.kind === "slider") return Number(row.value?.()).toFixed(3);
      return "";
    });
    return [width, height, dirty, blinkOn(), ...values].join("|");
  }

  function rounded(ctx, box, fill, stroke) {
    const radius = Math.min(8, box.h / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(box.x, box.y, box.w, box.h, radius);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function text(ctx, value, x, y, { size = 16, color = colors.ink, align = "left" } = {}) {
    ctx.font = `${size}px ${colors.font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(String(value ?? ""), x, y);
  }

  function selectedLabel(row) {
    if (typeof row.text === "function") return String(row.text() ?? "");
    const current = row.value?.();
    const match = readOptions(row).find((option) => option.value === current);
    return match ? match.label : String(current ?? "");
  }

  /**
   * Paint every row. The caller clears the canvas and sets its transform.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  function draw(ctx, width, height) {
    const items = layout(width, height);
    const blink = blinkOn();
    for (const item of items) {
      const { row, box } = item;
      const hot = hoverKey === item.key;
      const midY = box.y + box.h / 2;
      if (row.label && (item.kind === "dropdown" || item.kind === "number" || item.kind === "slider")) {
        text(ctx, row.label, sizes.pad, midY, { size: 15, color: colors.accent });
      }
      if (item.kind === "status") {
        text(ctx, row.text?.(), box.x, midY, { size: 14 });
      } else if (item.kind === "dropdown") {
        rounded(ctx, box, colors.field, hot || openKey === item.key ? colors.accent : colors.fieldEdge);
        text(ctx, selectedLabel(row), box.x + 12, midY);
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const cx = box.x + box.w - 18;
        ctx.moveTo(cx - 5, midY - 2);
        ctx.lineTo(cx, midY + 3);
        ctx.lineTo(cx + 5, midY - 2);
        ctx.stroke();
      } else if (item.kind === "number") {
        const focused = focusKey === item.key;
        const shown = focused ? draft : String(row.value?.() ?? "");
        rounded(ctx, box, colors.field, focused || hot ? colors.accent : colors.fieldEdge);
        text(ctx, shown, box.x + 12, midY);
        if (focused && blink) {
          const caret = box.x + 12 + (ctx.measureText?.(shown)?.width ?? 0) + 2;
          ctx.fillStyle = colors.ink;
          ctx.fillRect(caret, box.y + 8, 1.5, box.h - 16);
        }
      } else if (item.kind === "checkbox") {
        const on = !!row.checked?.();
        const mark = { x: box.x, y: box.y + (box.h - 22) / 2, w: 22, h: 22 };
        rounded(ctx, mark, on ? colors.hot : colors.field, hot || on ? colors.accent : colors.fieldEdge);
        if (on) {
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mark.x + 5, mark.y + 11);
          ctx.lineTo(mark.x + 9, mark.y + 16);
          ctx.lineTo(mark.x + 17, mark.y + 6);
          ctx.stroke();
        }
        text(ctx, row.label, mark.x + 32, midY);
      } else if (item.kind === "slider") {
        const level = Math.min(1, Math.max(0, Number(row.value?.()) || 0));
        const track = { x: box.x, y: midY - 5, w: box.w, h: 10 };
        rounded(ctx, track, colors.field, colors.fieldEdge);
        const span = Math.max(1, box.w - sizes.sliderInset * 2);
        const knob = box.x + sizes.sliderInset + level * span;
        rounded(ctx, { x: box.x + 2, y: track.y, w: Math.max(8, knob - box.x - 2), h: track.h }, colors.accent, colors.accent);
        ctx.beginPath();
        ctx.fillStyle = hot || slideKey === item.key ? colors.accent : colors.ink;
        ctx.arc(knob, midY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colors.well;
        ctx.lineWidth = 1;
        ctx.stroke();
        const label = typeof row.format === "function" ? row.format(level) : `${Math.round(level * 100)}%`;
        text(ctx, label, box.x + box.w + 12, midY, { size: 14 });
      } else if (item.kind === "button") {
        rounded(ctx, box, hot ? colors.hot : colors.field, hot ? colors.accent : colors.fieldEdge);
        text(ctx, row.label, box.x + box.w / 2, midY, { align: "center" });
      }
    }
    // The open list is drawn last so it covers the rows beneath it.
    const open = items.find((item) => item.key === openKey);
    if (open?.options) {
      const current = open.row.value?.();
      for (const option of open.options) {
        const hot = hoverKey === `${open.key}:${option.label}` || option.value === current;
        rounded(ctx, option, hot ? colors.hot : colors.well, colors.fieldEdge);
        text(ctx, option.label, option.x + 12, option.y + option.h / 2);
      }
    }
    return items;
  }

  return {
    rows,
    layout,
    contentHeight,
    pointer,
    reset,
    handleKey,
    setDraft,
    commit,
    cancel,
    signature,
    draw,
    setKeyboard(next) {
      kb = next ?? null;
    },
    get draftText() {
      return draft;
    },
    get focusedKey() {
      return focusKey;
    },
    get openKey() {
      return openKey;
    },
    get hoverKey() {
      return hoverKey;
    },
    /** The slider holding the pointer while it is down, or "". */
    get slidingKey() {
      return slideKey;
    },
    isTyping: () => !!focusKey,
  };
}
