// SPDX-License-Identifier: Apache-2.0
// HUD-native visible text editor. Intended for small code/text entry.
//
// Scope:
// - Focus toggled by caller (hotbar/button)
// - Desktop keyboard edits and Meta Quest's native system keyboard in supported WebXR sessions
// - Optional clipboard paste (best-effort; permissions vary)
//
// Rendering:
// - Renders into a shared runtime window via setWindowLines.
// - Shows a caret via a HUD-rendered quad (not part of the text string).

import { getCaretAtPoint as _getCaretAtPoint } from "troika-three-text";
import { copyTextToClipboard } from "./ui/clipboard.js";
import {
  buildHudTextEditorLineEntry as buildEditorLineEntry,
  normalizeHudTextEditorDisplayMode as normalizeEditorDisplayMode,
  normalizeHudTextEditorLanguage as normalizeEditorLanguage,
} from "./ui/editor/hud-text-editor-display.js";
import {
  HUD_TEXT_ASCENDER_NUDGE_FACTOR,
  HUD_OVERLAY_PADDING_PX,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  getHudGlyphDotSizePx,
  getHudTextLineHeightPx,
} from "./hud-layout-policy.js";
import { HUD_TEXT_DEFAULT_COLOR, HUD_TEXT_MUTED_COLOR, HUD_TEXT_BRIGHT_COLOR } from "./hud-text-style.js";
import { getNormalizedClientPoint } from "./pointer-coordinates.js";
import { clamp } from "./scalar-math.js";
import { createWebXrSystemKeyboardBridge } from "./webxr-system-keyboard.js";

function splitLines(text) {
  const s = String(text ?? "");
  // Preserve empty last line if text ends with newline.
  const parts = s.split("\n");
  return parts.length ? parts : [""];
}

function joinLines(lines) {
  return (lines ?? []).join("\n");
}

function safeChar(e) {
  if (!e || typeof e.key !== "string") return null;
  if (e.key.length !== 1) return null;
  // Ignore control/meta combinations.
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return e.key;
}

/**
 * Canonical selection background tint for the shared HUD text editor.
 * Purpose: define the default highlight color applied behind selected HUD editor text when callers do not override the selection background.
 * @type {number}
 * Side effects: none.
 */
const HUD_TEXT_EDITOR_SELECTION_BG_COLOR = 0x5b7aa6;

/**
 * Canonical selection text color for the shared HUD text editor.
 * Purpose: define the default foreground color applied to selected HUD editor text when callers do not override the selection text tint.
 * @type {number}
 * Side effects: none.
 */
const HUD_TEXT_EDITOR_SELECTION_TEXT_COLOR = 0xffffff;
/**
 * Selection highlight opacity when the editor window has focus.
 * @type {number}
 */
const HUD_TEXT_EDITOR_SELECTION_OPACITY_FOCUSED_DEFAULT = 0.65;
/**
 * Selection highlight opacity when the editor has lost focus (dimmed).
 * @type {number}
 */
const HUD_TEXT_EDITOR_SELECTION_OPACITY_BLURRED_DEFAULT = 0.45;

/**
 * Create the shared HUD-native text editor controller for a runtime window.
 * Purpose: provide keyboard-editable, selection-aware text entry inside the shared WebGL HUD without relying on DOM overlays, while integrating with HUD window text, caret rendering, and clipboard helpers.
 * @param {object} [options={}] HUD text editor configuration.
 * @param {any} options.renderer Three.js renderer whose canvas receives pointer input and whose XR state controls clipboard behavior.
 * @param {any} options.hudSystem Shared HUD system that exposes the window text, caret, and render hooks used by the editor.
 * @param {string} options.windowKey Window identifier whose HUD text surface will host the editor contents.
 * @param {string} [options.initialText=""] Initial text loaded into the editor.
 * @param {() => void} [options.onDirty] Optional callback invoked after mutations that change the editor contents or rendered state.
 * @param {(text: string) => void} [options.onSubmit] Optional callback invoked when the configured submit shortcut is triggered.
 * @param {Array<object>} [options.footerEntries=[]] Optional HUD line entries rendered at the bottom of the same editor window, typically for inline action buttons.
 * @param {number} [options.maxDisplayLines=500] Maximum number of lines rendered into the HUD window at once.
 * @param {number} [options.selectionBgColor] Optional override for the selection background color.
 * @param {number} [options.selectionTextColor] Optional override for the selection text color.
 * @param {number} [options.selectionOpacityFocused] Optional override for selection opacity while focused.
 * @param {number} [options.selectionOpacityBlurred] Optional override for selection opacity while blurred.
 * @param {boolean} [options.readOnly=false] When true, navigation, selection, and copy remain enabled but text mutations are suppressed.
 * @param {boolean} [options.wrapLines=false] When true, the HUD window wraps long display lines instead of forcing a single unwrapped row.
 * @param {"plain"|"structured"} [options.displayMode="plain"] Render mode for the editor surface. Structured mode can add line numbers and syntax tinting.
 * @param {"plain"|"json"|"javascript"|"python"} [options.language="plain"] Language hint used by structured mode syntax tinting.
 * @param {boolean} [options.showLineNumbers] Override for line-number gutter visibility. Defaults to true in structured mode and false otherwise.
 * @param {boolean} [options.submitOnEnter=false] When true, plain Enter submits instead of inserting a newline.
 * @param {boolean} [options.submitOnMetaEnter=false] When true, Ctrl/Cmd+Enter submits instead of inserting a newline.
 * @param {"window"|"footer"} [options.surface="window"] Where the editable text is drawn. "footer" docks a single-line field in the window footer and leaves the window's own lines alone.
 * @param {string} [options.placeholder=""] Muted text shown in a footer field while it is empty.
 * @returns {{focus: () => void, blur: () => void, isTyping: () => boolean, isSystemKeyboardSupported: () => boolean, setText: (text: string) => void, getText: () => string, pasteFromClipboard: () => Promise<boolean>, dispose: () => void}} Editor controller exposing focus/blur, text getters and setters, immersive system-keyboard detection, clipboard paste, typing state, and disposal hooks.
 * Side effects: validates required renderer and HUD handles, mutates HUD window text plus caret state, registers window keyboard and paste listeners and renderer-canvas pointer and mouse listeners, creates a temporary invisible DOM textarea for supported immersive system keyboards, starts and clears caret timers, reads clipboard contents when available, and invokes `onDirty` after editor state changes.
 */
export function createHudTextEditor({
  renderer,
  hudSystem,
  windowKey,
  initialText = "",
  onDirty,
  onSubmit,
  footerEntries = [],
  maxDisplayLines = 500,
  selectionBgColor,
  selectionTextColor,
  selectionOpacityFocused,
  selectionOpacityBlurred,
  readOnly = false,
  wrapLines = false,
  displayMode = "plain",
  language = "plain",
  showLineNumbers,
  submitOnEnter = false,
  submitOnMetaEnter = false,
  surface = "window",
  placeholder = "",
} = {}) {
  if (!renderer) throw new Error("createHudTextEditor: renderer is required");
  if (!hudSystem) throw new Error("createHudTextEditor: hudSystem is required");
  const key = String(windowKey ?? "").trim();
  if (!key) throw new Error("createHudTextEditor: windowKey is required");
  const docked = surface === "footer";
  const placeholderText = String(placeholder ?? "").trim();

  let focused = false;
  let caretVisible = true;
  let caretTimer = null;

  // Selection anchor (in line/column coordinates). If null => no selection.
  let selAx = null;
  let selAy = null;

  let lines = splitLines(initialText);
  let cx = 0;
  let cy = 0;

  const _selectionBgColor =
    selectionBgColor != null ? selectionBgColor : HUD_TEXT_EDITOR_SELECTION_BG_COLOR;
  const _selectionTextColor =
    selectionTextColor != null ? selectionTextColor : HUD_TEXT_EDITOR_SELECTION_TEXT_COLOR;
  const _selectionOpacityFocused =
    selectionOpacityFocused != null
      ? Number(selectionOpacityFocused)
      : HUD_TEXT_EDITOR_SELECTION_OPACITY_FOCUSED_DEFAULT;
  const _selectionOpacityBlurred =
    selectionOpacityBlurred != null
      ? Number(selectionOpacityBlurred)
      : HUD_TEXT_EDITOR_SELECTION_OPACITY_BLURRED_DEFAULT;
  const resolvedDisplayMode = normalizeEditorDisplayMode(displayMode);
  const resolvedShowLineNumbers = showLineNumbers === true
    || (showLineNumbers !== false && resolvedDisplayMode === "structured");
  let shouldScrollCursorIntoView = !readOnly;
  let mouseSelectionActive = false;
  const systemKeyboard = createWebXrSystemKeyboardBridge({
    renderer,
    getValue: () => getText(),
    onInput: value => setText(value),
    onDismiss: () => blur({ closeSystemKeyboard: false })
  });

  function moveCursorToTextEnd() {
    cy = Math.max(0, lines.length - 1);
    cx = String(lines[cy] ?? "").length;
  }

  function normalizeCursor() {
    cy = clamp(cy, 0, Math.max(0, lines.length - 1));
    const line = lines[cy] ?? "";
    cx = clamp(cx, 0, line.length);
  }

  function notifyDirty() {
    try {
      onDirty?.();
    } catch {
      // no-op
    }
  }

  function samePos(ax, ay, bx, by) {
    return ax === bx && ay === by;
  }

  function clearSelection() {
    selAx = null;
    selAy = null;
  }

  function hasSelection() {
    if (selAx == null || selAy == null) return false;
    return !samePos(selAx, selAy, cx, cy);
  }

  function releaseCollapsedAnchor() {
    // A click plants an anchor on the caret so a drag can grow a selection.
    // Leaving it there makes the first typed character the selection, and the
    // second character replaces it.
    if (!hasSelection()) clearSelection();
  }

  function ensureSelectionAnchor() {
    if (selAx == null || selAy == null) {
      selAx = cx;
      selAy = cy;
    }
  }

  function comparePos(ax, ay, bx, by) {
    if (ay < by) return -1;
    if (ay > by) return 1;
    if (ax < bx) return -1;
    if (ax > bx) return 1;
    return 0;
  }

  function getSelectionRange() {
    if (!hasSelection()) return null;
    const aFirst = comparePos(selAx, selAy, cx, cy) <= 0;
    const startX = aFirst ? selAx : cx;
    const startY = aFirst ? selAy : cy;
    const endX = aFirst ? cx : selAx;
    const endY = aFirst ? cy : selAy;
    return { startX, startY, endX, endY };
  }

  function deleteSelectionIfAny() {
    const r = getSelectionRange();
    if (!r) {
      // A click may leave a collapsed selection anchor. Do not let insertion
      // turn that old anchor into a selection of the newly typed character.
      clearSelection();
      return false;
    }

    const { startX, startY, endX, endY } = r;
    if (startY === endY) {
      const line = lines[startY] ?? "";
      lines[startY] = line.slice(0, startX) + line.slice(endX);
    } else {
      const first = (lines[startY] ?? "").slice(0, startX);
      const last = (lines[endY] ?? "").slice(endX);
      lines.splice(startY, endY - startY + 1, first + last);
    }
    cy = startY;
    cx = startX;
    clearSelection();
    normalizeCursor();
    return true;
  }

  async function copySelectionToClipboard() {
    const r = getSelectionRange();
    if (!r) return false;
    const { startX, startY, endX, endY } = r;
    let text = "";
    if (startY === endY) {
      text = (lines[startY] ?? "").slice(startX, endX);
    } else {
      const parts = [];
      parts.push((lines[startY] ?? "").slice(startX));
      for (let y = startY + 1; y < endY; y++) parts.push(lines[y] ?? "");
      parts.push((lines[endY] ?? "").slice(0, endX));
      text = parts.join("\n");
    }
    return copyTextToClipboard(text);
  }

  function renderCaretAndSelection() {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w) return;

    w.noWrap = !wrapLines;

    // Allow the HUD focus manager to notify this editor when it loses focus.
    if (!w._hudTextEditorHooksInstalled) {
      w._hudTextEditorHooksInstalled = true;
      w._onHudBlur = () => {
        try {
          blur();
        } catch {
          // no-op
        }
      };
    }

    const dot = getHudGlyphDotSizePx(renderer);
    hudSystem.setWindowTextCaret(key, {
      visible: !!focused && !!caretVisible && !hasSelection(),
      row: cy,
      col: cx,
      wPx: Math.max(1, Math.floor(dot)),
      color: HUD_TEXT_BRIGHT_COLOR,
    });

    const r = getSelectionRange();
    if (r) {
      const { startX, startY, endX, endY } = r;
      hudSystem.setWindowTextSelection(key, {
        visible: true,
        startRow: startY,
        startCol: startX,
        endRow: endY,
        endCol: endX,
        color: _selectionBgColor,
        textColor: _selectionTextColor,
        opacity: focused ? _selectionOpacityFocused : _selectionOpacityBlurred,
      });
    } else {
      hudSystem.setWindowTextSelection(key, { visible: false });
    }
  }

  function scrollCursorIntoView(lineCount) {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w || !w.scrollable || w.collapsed) return;

    const dot = getHudGlyphDotSizePx(renderer);
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
    const pad = HUD_OVERLAY_PADDING_PX;
    const lineH = getHudTextLineHeightPx(dot);
    const footerReserve = Math.max(0, Number(w._footerReservedHeightPx) || 0);
    const contentH = Math.max(0, w.h - titleH - pad * 2 - footerReserve);
    const visibleLines = Math.max(1, Math.floor(contentH / Math.max(1, lineH)));

    const cursorDisplayIdx = clamp(cy, 0, lines.length - 1);
    const maxTop = Math.max(0, lineCount - visibleLines);
    const nextTop = clamp(cursorDisplayIdx - Math.floor(visibleLines * 0.5), 0, maxTop);
    hudSystem.setWindowScrollTop(key, nextTop);
  }

  function draftText() {
    return joinLines(lines);
  }

  function dockedFooterEntries() {
    if (!docked) return [];
    const draft = draftText();
    const showingPlaceholder = !draft;
    return [{
      actionButtonText: showingPlaceholder ? (placeholderText || " ") : draft,
      actionButtonSourceText: draft,
      actionButtonOnClick: () => focus({ scrollCursorIntoView: false }),
      actionButtonWidthPx: 10000,
      actionButtonTextInsetPx: 10,
      actionButtonTextColor: showingPlaceholder ? HUD_TEXT_MUTED_COLOR : HUD_TEXT_DEFAULT_COLOR,
      actionButtonBgColor: 0x12161c,
      actionButtonBgOpacity: 0.96,
      actionButtonHeightPx: 44,
    }];
  }

  function renderFooterCaret() {
    hudSystem.setWindowTextCaret(key, {
      visible: !!focused && !!caretVisible && !hasSelection(),
      target: "footer",
      row: 0,
      col: cx,
      wPx: Math.max(1, Math.floor(getHudGlyphDotSizePx(renderer))),
      color: HUD_TEXT_BRIGHT_COLOR,
    });
    // Selection highlighting is drawn on the window's transcript lines.
    // A footer field must not paint that highlight over the chat.
    hudSystem.setWindowTextSelection(key, { visible: false, target: "footer" });
  }

  function render() {
    if (docked) {
      renderFooterCaret();
      return;
    }
    // Render all text lines as HUD window content.
    const out = [];

    // Clamp display for performance.
    const max = Math.max(0, Math.floor(maxDisplayLines));
    const show = max ? Math.min(lines.length, max) : lines.length;

    const resolvedLanguage = normalizeEditorLanguage(language, lines);
    for (let i = 0; i < show; i++) {
      const raw = lines[i] ?? "";
      out.push(buildEditorLineEntry(raw, i, lines.length, {
        displayMode: resolvedDisplayMode,
        language: resolvedLanguage,
        showLineNumbers: resolvedShowLineNumbers,
      }));
    }

    if (show < lines.length) {
      out.push({ text: "… (truncated)", color: HUD_TEXT_MUTED_COLOR });
    }

    // Editor should not auto-jump to end; keep manual scroll behavior.
    hudSystem.setWindowLines(key, out, {
      scrollMode: "manual",
      footerEntries: Array.isArray(footerEntries) ? footerEntries : [],
    });

    // Drive caret + selection via the HUD window object.
    try {
      renderCaretAndSelection();
    } catch {
      // no-op
    }

    // Best-effort: keep the cursor line visible while focused.
    if (focused && shouldScrollCursorIntoView) {
      try {
        scrollCursorIntoView(show);
      } catch {
        // no-op
      }
      shouldScrollCursorIntoView = false;
    }
  }

  function setText(text) {
    lines = splitLines(text);
    moveCursorToTextEnd();
    clearSelection();
    normalizeCursor();
    shouldScrollCursorIntoView = !readOnly;
    render();
    notifyDirty();
  }

  function getText() {
    return joinLines(lines);
  }

  function focus({ scrollCursorIntoView = !readOnly } = {}) {
    try {
      hudSystem.bringToFront?.(key);
    } catch {
      // no-op
    }
    focused = true;
    caretVisible = true;
    if (!caretTimer) {
      caretTimer = window.setInterval(() => {
        if (!focused) return;
        caretVisible = !caretVisible;
        // Blink should not be treated as a content edit.
        render();
      }, 500);
    }
    shouldScrollCursorIntoView = !!scrollCursorIntoView;
    render();
    notifyDirty();
    if (!readOnly && renderer.xr?.isPresenting) systemKeyboard.open();
  }

  function blur({ closeSystemKeyboard = true } = {}) {
    if (closeSystemKeyboard) systemKeyboard.close();
    focused = false;
    caretVisible = true;
    shouldScrollCursorIntoView = !readOnly;
    if (caretTimer) {
      try {
        window.clearInterval(caretTimer);
      } catch {
        // no-op
      }
      caretTimer = null;
    }

    // Hide caret quad. Keep selection visible (dimmed) so losing focus doesn't
    // make selection appear to vanish.
    try {
      hudSystem.setWindowTextCaret(key, { visible: false });
    } catch {
      // no-op
    }
    render();
    notifyDirty();
  }

  function isTyping() {
    return !!focused;
  }

  function insertChar(ch) {
    releaseCollapsedAnchor();
    deleteSelectionIfAny();
    const line = lines[cy] ?? "";
    lines[cy] = line.slice(0, cx) + ch + line.slice(cx);
    cx += ch.length;
  }

  function insertTextAtCursor(text) {
    const s = String(text ?? "");
    if (!s) return false;

    releaseCollapsedAnchor();
    deleteSelectionIfAny();
    // A docked field is one line. A pasted break becomes a space so the caret
    // stays in that line instead of opening a second row the footer cannot show.
    const normalized = docked
      ? s.replace(/\r\n/g, " ").replace(/[\r\n]/g, " ")
      : s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    if (parts.length === 1) {
      const line = lines[cy] ?? "";
      lines[cy] = line.slice(0, cx) + parts[0] + line.slice(cx);
      cx += parts[0].length;
    } else {
      const cur = lines[cy] ?? "";
      const left = cur.slice(0, cx);
      const right = cur.slice(cx);
      lines[cy] = left + parts[0];
      for (let i = 1; i < parts.length; i++) {
        lines.splice(cy + i, 0, parts[i]);
      }
      cy += parts.length - 1;
      cx = (lines[cy] ?? "").length;
      lines[cy] = (lines[cy] ?? "") + right;
    }
    normalizeCursor();
    return true;
  }

  function backspace() {
    releaseCollapsedAnchor();
    if (deleteSelectionIfAny()) return;
    const line = lines[cy] ?? "";
    if (cx > 0) {
      lines[cy] = line.slice(0, cx - 1) + line.slice(cx);
      cx -= 1;
      return;
    }
    if (cy > 0) {
      const prev = lines[cy - 1] ?? "";
      lines[cy - 1] = prev + line;
      lines.splice(cy, 1);
      cy -= 1;
      cx = prev.length;
    }
  }

  function del() {
    releaseCollapsedAnchor();
    if (deleteSelectionIfAny()) return;
    const line = lines[cy] ?? "";
    if (cx < line.length) {
      lines[cy] = line.slice(0, cx) + line.slice(cx + 1);
      return;
    }
    if (cy < lines.length - 1) {
      const next = lines[cy + 1] ?? "";
      lines[cy] = line + next;
      lines.splice(cy + 1, 1);
    }
  }

  function newline() {
    releaseCollapsedAnchor();
    deleteSelectionIfAny();
    const line = lines[cy] ?? "";
    const left = line.slice(0, cx);
    const right = line.slice(cx);
    lines[cy] = left;
    lines.splice(cy + 1, 0, right);
    cy += 1;
    cx = 0;
  }

  function moveLeft() {
    if (cx > 0) {
      cx -= 1;
      return;
    }
    if (cy > 0) {
      cy -= 1;
      cx = (lines[cy] ?? "").length;
    }
  }

  function moveRight() {
    const line = lines[cy] ?? "";
    if (cx < line.length) {
      cx += 1;
      return;
    }
    if (cy < lines.length - 1) {
      cy += 1;
      cx = 0;
    }
  }

  function moveUp() {
    if (cy > 0) cy -= 1;
    cx = clamp(cx, 0, (lines[cy] ?? "").length);
  }

  function moveDown() {
    if (cy < lines.length - 1) cy += 1;
    cx = clamp(cx, 0, (lines[cy] ?? "").length);
  }

  function moveDocumentHome() {
    cy = 0;
    cx = 0;
  }

  function moveDocumentEnd() {
    cy = Math.max(0, lines.length - 1);
    cx = (lines[cy] ?? "").length;
  }

  function home() {
    cx = 0;
  }

  function end() {
    cx = (lines[cy] ?? "").length;
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (!insertTextAtCursor(t)) return false;
      render();
      notifyDirty();
      return true;
    } catch {
      return false;
    }
  }

  function pasteText(text) {
    return insertTextAtCursor(text);
  }

  function handleClipboardShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
    const k = e.key.toLowerCase();

    // Paste: Ctrl/Cmd+V
    if (k === "v") {
      if (readOnly) {
        e.preventDefault();
        return true;
      }
      // Desktop: allow the browser `paste` event to provide clipboard data even on
      // insecure contexts where navigator.clipboard.readText() is blocked.
      if (!renderer.xr.isPresenting) return true;

      // XR / fallback path.
      pasteFromClipboard().then(() => {
        render();
        notifyDirty();
      });
      e.preventDefault();
      return true;
    }

    // Select all: Ctrl/Cmd+A
    if (k === "a") {
      selAx = 0;
      selAy = 0;
      cy = Math.max(0, lines.length - 1);
      cx = (lines[cy] ?? "").length;
      normalizeCursor();
      shouldScrollCursorIntoView = !readOnly;
      render();
      e.preventDefault();
      return true;
    }

    // Copy: Ctrl/Cmd+C
    if (k === "c") {
      if (hasSelection()) {
        void copySelectionToClipboard();
        e.preventDefault();
      }
      return true;
    }

    // Cut: Ctrl/Cmd+X
    if (k === "x") {
      if (readOnly) {
        e.preventDefault();
        return true;
      }
      if (hasSelection()) {
        copySelectionToClipboard().then(() => {
          deleteSelectionIfAny();
          render();
          notifyDirty();
        });
        e.preventDefault();
      }
      return true;
    }

    return false;
  }

  function handleEditCommand(e) {
    const shift = !!e.shiftKey;

    function beforeMove() {
      if (shift) ensureSelectionAnchor();
      else clearSelection();
    }

    switch (e.key) {
      case "Backspace":
        if (readOnly) {
          e.preventDefault();
          return true;
        }
        backspace();
        break;
      case "Delete":
        if (readOnly) {
          e.preventDefault();
          return true;
        }
        del();
        break;
      case "Enter":
        if (readOnly) {
          e.preventDefault();
          return true;
        }
        newline();
        break;
      case "ArrowLeft":
        beforeMove();
        moveLeft();
        break;
      case "ArrowRight":
        beforeMove();
        moveRight();
        break;
      case "ArrowUp":
        beforeMove();
        moveUp();
        break;
      case "ArrowDown":
        beforeMove();
        moveDown();
        break;
      case "Home":
        beforeMove();
        if (e.ctrlKey || e.metaKey) moveDocumentHome();
        else home();
        break;
      case "End":
        beforeMove();
        if (e.ctrlKey || e.metaKey) moveDocumentEnd();
        else end();
        break;
      default:
        return false;
    }

    normalizeCursor();
    shouldScrollCursorIntoView = !readOnly || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End";
    render();
    notifyDirty();
    e.preventDefault();
    return true;
  }

  function onKeyDown(e) {
    if (!focused) return;
    if (renderer.xr.isPresenting && (e.metaKey || e.ctrlKey)) {
      // Allow system shortcuts in XR.
    }
    const wantsSubmitOnEnter =
      e.key === "Enter"
      && !e.shiftKey
      && !e.altKey
      && ((submitOnEnter && !e.ctrlKey && !e.metaKey)
        || (submitOnMetaEnter && (e.ctrlKey || e.metaKey)));
    if (wantsSubmitOnEnter) {
      e.stopImmediatePropagation();
      let replacement;
      try {
        replacement = onSubmit?.(joinLines(lines));
      } catch {
        // no-op
      }
      if (typeof replacement === "string") setText(replacement);
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      blur();
      e.preventDefault();
      return;
    }
    if (handleClipboardShortcut(e)) {
      // Desktop paste keeps its browser default so the paste event still fires.
      e.stopImmediatePropagation();
      return;
    }
    const ch = safeChar(e);
    if (ch != null) {
      e.stopImmediatePropagation();
      if (readOnly) {
        e.preventDefault();
        return;
      }
      insertChar(ch);
      normalizeCursor();
      shouldScrollCursorIntoView = !readOnly;
      render();
      notifyDirty();
      e.preventDefault();
      return;
    }
    if (handleEditCommand(e)) e.stopImmediatePropagation();
  }

  // Handle focused text input before scene-level keyboard listeners, including
  // listeners on window that were installed before this editor.
  window.addEventListener("keydown", onKeyDown, true);

  function onPaste(e) {
    if (!focused) return;
    if (readOnly) {
      e.preventDefault();
      return;
    }
    try {
      const t = e?.clipboardData?.getData?.("text/plain") ?? "";
      if (!t) return;
      if (pasteText(t)) {
        shouldScrollCursorIntoView = !readOnly;
        render();
        notifyDirty();
      }
      e.preventDefault();
    } catch {
      // no-op
    }
  }

  window.addEventListener("paste", onPaste);

  function clientToHudPoint(clientX, clientY) {
    const hud = hudSystem?.hud;
    const layoutW = Number(hud?.layoutW);
    const layoutH = Number(hud?.layoutH);
    if (!Number.isFinite(layoutW) || !Number.isFinite(layoutH) || layoutW <= 0 || layoutH <= 0) return null;

    const point = getNormalizedClientPoint(clientX, clientY, renderer.domElement);
    if (!point) return null;
    return { x: point.x * layoutW, y: point.y * layoutH };
  }

  function resolveCursorPositionAtPoint(p) {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w || w.collapsed) return null;

    const dot = getHudGlyphDotSizePx(renderer);
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
    const pad = HUD_OVERLAY_PADDING_PX;
    const lineH = getHudTextLineHeightPx(dot);
    const contentX = w.x + pad;
    const contentY = w.y + titleH + pad;

    const scrollTop = Number.isFinite(w.scrollTop) ? Number(w.scrollTop) : 0;

    const localX = p.x - contentX;
    const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
    const localY = -(p.y - contentY) - topNudge;

    let nextX = cx;
    let nextY = cy;
    let placed = false;

    try {
      const objs = hud?.objects?.windows?.[key];
      const troikaText = objs?._troikaContentText?._textMesh;
      const tri = troikaText?.textRenderInfo;
      const meta = Array.isArray(objs?._visibleLineMeta) ? objs._visibleLineMeta : null;
      if (tri && meta && typeof _getCaretAtPoint === "function") {
        const caret = _getCaretAtPoint(tri, localX, localY);
        if (caret && Number.isFinite(caret.charIndex)) {
          const visibleText = meta.map((m) => String(m?.text ?? "")).join("\n");
          const idx = clamp(Math.floor(caret.charIndex), 0, visibleText.length);
          let rowLocal = 0;
          let lastNl = -1;
          for (let i = 0; i < idx; i += 1) {
            if (visibleText.charCodeAt(i) === 10) {
              rowLocal += 1;
              lastNl = i;
            }
          }
          const colLocal = idx - (lastNl + 1);
          const resolvedRow = clamp(scrollTop + rowLocal, 0, Math.max(0, lines.length - 1));
          const prefix = Math.max(0, Math.floor(Number(meta[rowLocal]?.displayPrefixLength) || 0));
          const source = String(meta[rowLocal]?.sourceText ?? meta[rowLocal]?.text ?? lines[resolvedRow] ?? "");
          nextY = resolvedRow;
          nextX = clamp(colLocal - prefix, 0, source.length);
          placed = true;
        }
      }
    } catch {
      // no-op
    }

    if (!placed) {
      const displayIdx = Math.floor((p.y - contentY) / Math.max(1, lineH));
      const lineIdx = clamp(displayIdx + scrollTop, 0, Math.max(0, lines.length - 1));
      nextY = lineIdx;

      const charW = 6 * dot;
      const meta = Array.isArray(hud?.objects?.windows?.[key]?._visibleLineMeta)
        ? hud.objects.windows[key]._visibleLineMeta
        : null;
      const localRow = clamp(displayIdx, 0, Math.max(0, (meta?.length ?? 1) - 1));
      const prefix = Math.max(0, Math.floor(Number(meta?.[localRow]?.displayPrefixLength) || 0));
      const line = String(meta?.[localRow]?.sourceText ?? lines[nextY] ?? "");
      const nextCx = Math.round(localX / Math.max(1, charW)) - prefix;
      nextX = clamp(nextCx, 0, line.length);
    }

    return { x: nextX, y: nextY };
  }

  function isPointInsideFooter(px, py) {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w || w.collapsed) return false;
    const footerReserve = Math.max(0, Number(w._footerReservedHeightPx) || 0);
    if (footerReserve <= 0) return false;
    if (px < w.x || px > w.x + w.w) return false;
    const bottom = w.y + w.h;
    return py >= bottom - footerReserve && py <= bottom;
  }

  function resolveFooterCursor(p) {
    const draft = lines[0] ?? "";
    const meta = hudSystem?.hud?.objects?.windows?.[key]?._footerActionMeta?.[0];
    if (!meta || !Number.isFinite(meta.textX)) return { x: draft.length, y: 0 };
    const dot = Number.isFinite(meta.dot) ? Number(meta.dot) : getHudGlyphDotSizePx(renderer);
    const localX = p.x - meta.textX;
    let col = clamp(Math.round(localX / Math.max(1, 6 * dot)), 0, draft.length);
    try {
      const tri = meta.labelObject?._textMesh?.textRenderInfo;
      const rendered = typeof tri?.parameters?.text === "string" ? tri.parameters.text : "";
      if (draft && rendered === draft && tri && typeof _getCaretAtPoint === "function") {
        const topNudge = (7 * dot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
        const localY = -(p.y - meta.textY) - topNudge;
        const caret = _getCaretAtPoint(tri, localX, localY);
        if (caret && Number.isFinite(caret.charIndex)) {
          col = clamp(Math.floor(caret.charIndex), 0, draft.length);
        }
      }
    } catch {
      // no-op
    }
    return { x: col, y: 0 };
  }

  function isPointInsideEditorContent(px, py) {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w) return false;
    const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
    const h = w.collapsed ? titleH : w.h;
    const footerReserve = Math.max(0, Number(w._footerReservedHeightPx) || 0);
    if (px < w.x || px > w.x + w.w) return false;
    if (py < w.y || py > w.y + h) return false;
    // Only focus when clicking the content area, not the titlebar.
    if (py < w.y + titleH) return false;
    if (!w.collapsed && footerReserve > 0 && py > w.y + h - footerReserve) return false;
    return true;
  }

  function isPointInsideEditorWindow(px, py) {
    const hud = hudSystem?.hud;
    const w = hud?.ui?.windows?.[key];
    if (!w) return false;
    const h = w.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : w.h;
    if (px < w.x || px > w.x + w.w) return false;
    if (py < w.y || py > w.y + h) return false;
    return true;
  }

  function placeCursorAtClick(p) {
    const nextPos = resolveCursorPositionAtPoint(p);
    if (!nextPos) return;
    cx = nextPos.x;
    cy = nextPos.y;
    clearSelection();
    normalizeCursor();
    shouldScrollCursorIntoView = !readOnly;
    render();
  }

  function onPointerDown(e) {
    if (renderer.xr.isPresenting || !focused) return;
    if (Number.isFinite(e?.button) && e.button !== 0) return;
    const p = clientToHudPoint(e.clientX, e.clientY);
    if (!p || isPointInsideEditorWindow(p.x, p.y)) return;
    // Release focus before navigation handles this same pointerdown. Waiting
    // for mousedown would discard the first world drag while still typing.
    mouseSelectionActive = false;
    blur();
  }

  function onMouseDown(e) {
    if (renderer.xr.isPresenting) return;
    if (Number.isFinite(e?.button) && e.button !== 0) return;
    const p = clientToHudPoint(e.clientX, e.clientY);
    if (!p) return;
    if (docked) {
      if (isPointInsideFooter(p.x, p.y)) {
        focus({ scrollCursorIntoView: false });
        const nextPos = resolveFooterCursor(p);
        cx = nextPos.x;
        cy = 0;
        clearSelection();
        normalizeCursor();
        shouldScrollCursorIntoView = false;
        render();
        notifyDirty();
        return;
      }
      if (focused) blur();
      return;
    }
    if (isPointInsideEditorContent(p.x, p.y)) {
      focus({ scrollCursorIntoView: false });
      try {
        const nextPos = resolveCursorPositionAtPoint(p);
        if (!nextPos) return;
        if (e.shiftKey) {
          ensureSelectionAnchor();
        } else {
          selAx = nextPos.x;
          selAy = nextPos.y;
        }
        cx = nextPos.x;
        cy = nextPos.y;
        normalizeCursor();
        shouldScrollCursorIntoView = false;
        mouseSelectionActive = true;
        render();
      } catch {
        // no-op
      }
    }
    else if (isPointInsideEditorWindow(p.x, p.y)) {
      mouseSelectionActive = false;
    }
  }

  function onMouseMove(e) {
    if (renderer.xr.isPresenting) return;
    if (!mouseSelectionActive) return;
    if ((Number(e?.buttons) || 0) === 0) {
      mouseSelectionActive = false;
      return;
    }
    const p = clientToHudPoint(e.clientX, e.clientY);
    if (!p) return;
    try {
      const nextPos = resolveCursorPositionAtPoint(p);
      if (!nextPos) return;
      cx = nextPos.x;
      cy = nextPos.y;
      normalizeCursor();
      shouldScrollCursorIntoView = false;
      render();
    } catch {
      // no-op
    }
  }

  function onMouseUp() {
    mouseSelectionActive = false;
    if (!hasSelection()) clearSelection();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  renderer.domElement.addEventListener("mousedown", onMouseDown, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("mouseup", onMouseUp, { passive: true });

  function dispose() {
    systemKeyboard.close();
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("paste", onPaste);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    try {
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
    } catch {
      // no-op
    }
    if (caretTimer) {
      try {
        window.clearInterval(caretTimer);
      } catch {
        // no-op
      }
      caretTimer = null;
    }
  }

  // Initial render.
  moveCursorToTextEnd();
  normalizeCursor();
  render();

  return {
    focus,
    blur,
    isTyping,
    setText,
    getText,
    footerEntries: dockedFooterEntries,
    pasteFromClipboard,
    isSystemKeyboardSupported: systemKeyboard.isSupported,
    dispose,
  };
}

export {
  HUD_TEXT_EDITOR_SELECTION_BG_COLOR,
  HUD_TEXT_EDITOR_SELECTION_TEXT_COLOR,
};
