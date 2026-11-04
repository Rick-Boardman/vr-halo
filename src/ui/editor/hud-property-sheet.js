// SPDX-License-Identifier: Apache-2.0
import * as THREE from "three";
import { getCaretAtPoint as _getCaretAtPoint } from "troika-three-text";
import {
  HUD_TEXT_BRIGHT_COLOR,
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_INFO_COLOR,
  HUD_TEXT_MUTED_COLOR,
} from "../../hud-text-style.js";
import {
  HUD_TEXT_ASCENDER_NUDGE_FACTOR,
  HUD_OVERLAY_PADDING_PX,
  HUD_SCROLLBAR_RESERVED_WIDTH_PX,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  getHudGlyphDotSizePx,
  getHudTextLineHeightPx,
} from "../../hud-layout-policy.js";
import { wrapEntriesToLines } from "../../ui-text-layout.js";

const DEFAULT_SHEET_WINDOW = {
  x: 16,
  y: 56,
  w: 420,
  h: 320,
  minW: 260,
  minH: 180,
  draggable: true,
  minimizable: true,
  resizable: true,
  scrollable: true,
  scrollMode: "top",
};

const ANCHORED_WINDOW_GUTTER_PX = 16;
const PROPERTY_SHEET_EDITOR_SAVE_BUTTON_BG_COLOR = 0x587c5e;
const PROPERTY_SHEET_EDITOR_CANCEL_BUTTON_BG_COLOR = 0x5d6675;
const PROPERTY_SHEET_ROW_BUTTON_BG_COLOR = 0x4f617b;
const PROPERTY_SHEET_FIELD_BG_COLOR = 0x243242;
const PROPERTY_SHEET_FIELD_ACTIVE_BG_COLOR = 0x30445e;
const PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR = 0x1b2734;
const PROPERTY_SHEET_DROPDOWN_ACTIVE_ROW_BG_COLOR = 0x4b6683;
const PROPERTY_SHEET_DROPDOWN_OPTION_ROW_HEIGHT_PX = 26;
const PROPERTY_SHEET_MULTILINE_PREVIEW_MAX_CHARS = 42;
const PROPERTY_SHEET_PICK_CLOSED_ICON = "↓";
const PROPERTY_SHEET_PICK_OPEN_ICON = "↑";
const PROPERTY_SHEET_DATE_POPUP_MIN_WIDTH_PX = 344;
const PROPERTY_SHEET_DATE_POPUP_WIDTH_PX = 380;
const PROPERTY_SHEET_DATE_HEADER_ROW_HEIGHT_PX = 44;
const PROPERTY_SHEET_DATE_WEEKDAY_ROW_HEIGHT_PX = 34;
const PROPERTY_SHEET_DATE_WEEK_ROW_HEIGHT_PX = 52;
const PROPERTY_SHEET_DATE_YEAR_OPTION_RADIUS = 4;
const PROPERTY_SHEET_CALENDAR_WEEKDAY_LABELS = Object.freeze(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
const PROPERTY_SHEET_CALENDAR_MONTH_LABELS = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);
const PROPERTY_SHEET_BUTTON_ICONS = Object.freeze({
  edit: "/",
  pick: PROPERTY_SHEET_PICK_CLOSED_ICON,
  view: "o",
  run: ">",
  save: "[]",
  test: "*",
  create: "+",
  confirm: ">",
  close: "X",
  cancel: "X",
});

/**
 * Create a reusable HUD-native property sheet that renders rows into the shared
 * runtime window system and opens either a HUD text editor or an in-HUD choice
 * list when editable rows are activated.
 *
 * Row kinds:
 * - `section`: visual heading row.
 * - `readonly`: label and value only.
 * - `text`: edits in an inline input box inside the same property-sheet window.
 * - `date`: edits inline like a short text field and can open an anchored HUD calendar chooser from the value-field arrow gutter.
 * - `multiline`: opens the shared HUD text editor in an anchored companion window.
 * - `viewer`: opens the shared HUD text editor in read-only document mode.
 * - `select`: opens an in-panel dropdown state inside the current property-sheet window.
 * - `boolean`: in-panel dropdown specialization with ON/OFF options.
 * - `action`: clickable command row that invokes `row.onPress(...)`.
 *
 * @param {object} [options] Controller configuration.
 * @param {object} options.hudSystem Shared HUD runtime returned by createHudSystem(...).
 * @param {object} options.renderer Three.js renderer used by createHudTextEditor(...).
 * @param {string} options.windowKey Persistent HUD window key for the main property sheet.
 * @param {string} [options.title="PROPERTIES"] Initial HUD window title.
 * @param {Array<object>} [options.rows=[]] Initial property rows.
 * @param {string} [options.editorWindowKey] Ephemeral HUD window key used for text editing.
 * @param {string} [options.chooserWindowKey] Ephemeral HUD window key used for pickers or edit actions.
 * @param {string} [options.editorTitle="EDIT"] Base title for the text-edit window.
 * @param {string} [options.chooserTitle="CHOOSE"] Base title for the chooser or action window.
 * @param {boolean} [options.showInteractionPrefixes=true] When false, editable rows render as plain label/value lines instead of showing `[edit]` or `[pick]` prefixes.
 * @param {object} [options.sheetWindow] Overrides for the main window createWindow(...) options.
 * @param {object} [options.editorWindow] Overrides for the text-editor window createWindow(...) options.
 * @param {object} [options.chooserWindow] Overrides for the chooser window createWindow(...) options.
 * @param {(event: { key: string, value: unknown, row: object, rows: Array<object> }) => void} [options.onChange] Callback invoked after editable rows commit a new value.
 * @param {(event: { key: string, value: unknown, row: object, rows: Array<object>, reverted?: boolean }) => void} [options.onPreviewChange] Callback invoked while editable rows are being edited before commit.
 * @param {(event: { key: string, row: object, rows: Array<object> }) => void} [options.onAction] Callback invoked after action rows fire.
 * @param {(context: { row: object, role: "editable" | "action" | "close" | "cancel" | "save" }) => unknown} [options.resolveButtonIconTexture] Optional resolver for texture-backed row and footer action buttons.
 * @param {(options: object) => { focus?: () => void, blur?: () => void, isTyping?: () => boolean, setText?: (text: string) => void, getText?: () => string, dispose?: () => void }} [options.createTextEditor] Optional editor factory override for tests or runtime wiring.
 * @returns {{show: () => void, hide: () => void, setTitle: (nextTitle: string) => void, setRows: (nextRows: Array<object>) => void, getRows: () => Array<object>, getRow: (rowKey: string) => object | null, getValue: (rowKey: string) => unknown, setRowValue: (rowKey: string, nextValue: unknown, options?: { silent?: boolean }) => boolean, activateRow: (rowKey: string) => boolean, finalizeActiveEditor: () => boolean, closeActiveEditor: () => void, refresh: () => void, isEditing: () => boolean, isTyping: () => boolean, dispose: () => void}} Property-sheet controller API.
 * Side effects: creates the main HUD window lazily on show() or row activation, updates and destroys HUD windows as needed, installs the shared HUD text editor when text rows are opened, and invokes row and controller callbacks when rows change.
 */
export function createHudPropertySheet(options) {
  const {
  hudSystem,
  renderer,
  windowKey,
  title = "PROPERTIES",
  rows = [],
  editorWindowKey = `${String(windowKey ?? "").trim()}-editor`,
  chooserWindowKey = `${String(windowKey ?? "").trim()}-chooser`,
  editorTitle = "EDIT",
  chooserTitle = "CHOOSE",
  showInteractionPrefixes = true,
  sheetWindow = {},
  editorWindow = {},
  chooserWindow = {},
  onChange = null,
  onPreviewChange = null,
  onAction = null,
  resolveButtonIconTexture = null,
  createTextEditor = null,
  } = options ?? {};
  const mainWindowKey = String(windowKey ?? "").trim();
  if (!hudSystem || typeof hudSystem.createWindow !== "function" || typeof hudSystem.setWindowLines !== "function") {
    throw new Error("createHudPropertySheet: hudSystem with createWindow(...) and setWindowLines(...) is required");
  }
  if (!mainWindowKey) {
    throw new Error("createHudPropertySheet: windowKey is required");
  }

  let currentTitle = String(title ?? "PROPERTIES");
  let currentRows = normalizeRows(rows);
  let textEditor = null;
  let activeEdit = null;
  let visible = false;
  let inlineTextState = null;
  let dateChooserState = null;
  let dateChooserWindowRestoreState = null;
  let dateChooserTextures = [];
  let pickerArrowDownTexture = null;
  let pickerArrowUpTexture = null;

  const handleInlineTextKeyDown = (event) => {
    if (isDateChooserEdit()) {
      if (event.key === "Tab") {
        const handled = commitAndActivateAdjacentEditableRow(event.shiftKey ? -1 : 1);
        if (!handled) return;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return;
      }
      const row = getRow(activeEdit?.rowKey);
      if (!row) {
        cancelActiveEdit();
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return;
      }
      const handled = applyDateChooserKey(activeEdit, row, event);
      if (!handled) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }

    if (isInlineChoiceEdit()) {
      if (event.key === "Tab") {
        const handled = commitAndActivateAdjacentEditableRow(event.shiftKey ? -1 : 1);
        if (!handled) return;
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return;
      }
      const row = getRow(activeEdit?.rowKey);
      if (!row) {
        cancelActiveEdit();
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return;
      }
      const handled = applyInlineChoiceKey(activeEdit, row, event);
      if (!handled) return;
      renderMainWindow();
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }

    if (!isInlineTextEdit() || !inlineTextState) return;

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
      const shortcutKey = String(event.key ?? "").toLowerCase();
      if (shortcutKey === "a") {
        inlineTextState.selectionAnchor = 0;
        inlineTextState.caret = inlineTextState.text.length;
        renderMainWindow();
        event.preventDefault();
        event.stopImmediatePropagation?.();
        return;
      }
      if (shortcutKey === "v") {
        return;
      }
    }

    if (event.key === "Escape") {
      cancelActiveEdit();
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (event.key === "Enter") {
      commitTextEdit();
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (event.key === "Tab") {
      const handled = commitAndActivateAdjacentEditableRow(event.shiftKey ? -1 : 1);
      if (!handled) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }

    const handled = applyInlineTextKey(inlineTextState, event);
    if (!handled) return;
    const row = getRow(activeEdit?.rowKey);
    if (row && String(inlineTextState.text ?? "") !== String(row.value ?? "")) {
      emitPreviewChange(row, inlineTextState.text);
    }
    renderMainWindow();
    event.preventDefault();
    event.stopImmediatePropagation?.();
  };

  const handleInlineTextPaste = (event) => {
    if (!isInlineTextEdit() || !inlineTextState) return;
    const pastedText = event?.clipboardData?.getData?.("text/plain") ?? "";
    if (!pastedText) return;
    replaceInlineTextSelection(inlineTextState, pastedText.replace(/[\r\n]+/g, " "));
    const row = getRow(activeEdit?.rowKey);
    if (row && String(inlineTextState.text ?? "") !== String(row.value ?? "")) {
      emitPreviewChange(row, inlineTextState.text);
    }
    renderMainWindow();
    event.preventDefault();
    event.stopImmediatePropagation?.();
  };

  function clearWindowTextCaret() {
    hudSystem.setWindowTextCaret?.(mainWindowKey, { visible: false });
  }

  function clearWindowTextSelection() {
    hudSystem.setWindowTextSelection?.(mainWindowKey, { visible: false });
  }

  function installInlineTextListeners() {
    if (typeof window === "undefined" || !window?.addEventListener) return;
    window.addEventListener("keydown", handleInlineTextKeyDown, { capture: true });
    window.addEventListener("paste", handleInlineTextPaste, { capture: true });
  }

  function removeInlineTextListeners() {
    if (typeof window === "undefined" || !window?.removeEventListener) return;
    window.removeEventListener("keydown", handleInlineTextKeyDown, { capture: true });
    window.removeEventListener("paste", handleInlineTextPaste, { capture: true });
  }

  installInlineTextListeners();

  function isInlineTextEdit(edit = activeEdit) {
    return edit?.mode === "inline-text";
  }

  function isInlineChoiceEdit(edit = activeEdit) {
    return edit?.mode === "inline-choice";
  }

  function isDateChooserEdit(edit = activeEdit) {
    return edit?.mode === "date-chooser";
  }

  const sheetWindowDefaults = {
    ...DEFAULT_SHEET_WINDOW,
    ...sheetWindow,
  };

  function ensureWindow(key, windowTitle, options = {}) {
    const win = hudSystem.createWindow(key, {
      ...options,
      title: windowTitle,
    });
    if (win && typeof win === "object") {
      win.title = windowTitle;
    }
    if (typeof hudSystem.setWindowCollapsed === "function") {
      hudSystem.setWindowCollapsed(key, false);
    } else if (win && typeof win === "object") {
      win.collapsed = false;
    }
    return win;
  }

  function ensureMainWindow() {
    return ensureWindow(mainWindowKey, currentTitle, sheetWindowDefaults);
  }

  function getMainWindow() {
    return hudSystem?.hud?.ui?.windows?.[mainWindowKey] ?? null;
  }

  function resolveEntryRowHeightPx(entry, fallbackLineHeight) {
    const rowHeight = Number(entry?.rowHeightPx);
    return Number.isFinite(rowHeight) && rowHeight > 0
      ? rowHeight
      : fallbackLineHeight;
  }

  function notifyMainWindowLayoutChange(windowInstance) {
    if (!windowInstance || typeof windowInstance !== "object") return;
    windowInstance._hud?._onLayoutChange?.();
    if (hudSystem?.hud) hudSystem.hud._dirty = true;
  }

  function resolveMainWindowContentWidth(windowInstance) {
    const nineSliceCorner = Number(
      hudSystem?.hud?.objects?.windows?.[mainWindowKey]?.nineSlice?.cornerSize
    );
    const cornerInset = Number.isFinite(nineSliceCorner) ? Math.max(0, nineSliceCorner) * 2 : 0;
    const scrollReserve = windowInstance?.scrollable ? HUD_SCROLLBAR_RESERVED_WIDTH_PX : 0;
    return Math.max(
      0,
      Math.floor(Number(windowInstance?.w ?? DEFAULT_SHEET_WINDOW.w) - cornerInset - HUD_OVERLAY_PADDING_PX * 2 - scrollReserve),
    );
  }

  function resolveWrappedLineCount(entries, labelDot, maxWidth) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    return wrapEntriesToLines({
      entries,
      dot: labelDot,
      maxWidth,
      defaultColor: HUD_TEXT_DEFAULT_COLOR,
    }).length;
  }

  function restoreMainWindowDateChooserLayout(windowInstance) {
    if (!windowInstance || !dateChooserWindowRestoreState) return false;

    const restore = dateChooserWindowRestoreState;
    dateChooserWindowRestoreState = null;

    let changed = false;
    if (Number.isFinite(restore.y) && Number(windowInstance.y) !== Number(restore.y)) {
      windowInstance.y = Number(restore.y);
      changed = true;
    }
    if (Number.isFinite(restore.h) && Number(windowInstance.h) !== Number(restore.h)) {
      windowInstance.h = Number(restore.h);
      changed = true;
    }
    if (Number.isFinite(restore.minH) && Number(windowInstance.minH) !== Number(restore.minH)) {
      windowInstance.minH = Number(restore.minH);
      changed = true;
    }

    if (changed) {
      notifyMainWindowLayoutChange(windowInstance);
    }
    return changed;
  }

  function syncMainWindowDateChooserLayout(windowInstance, entries) {
    if (!windowInstance || !Array.isArray(entries)) return;

    if (!isDateChooserEdit() || !activeEdit?.rowKey) {
      restoreMainWindowDateChooserLayout(windowInstance);
      return;
    }

    const activeRowIndex = entries.findIndex((entry) => entry?.rowKey === activeEdit.rowKey);
    if (activeRowIndex < 0) return;

    let chooserEndIndex = activeRowIndex;
    for (let index = activeRowIndex + 1; index < entries.length; index += 1) {
      if (entries[index]?.rowKey != null) break;
      chooserEndIndex = index;
    }
    if (chooserEndIndex <= activeRowIndex) return;

    if (!dateChooserWindowRestoreState) {
      dateChooserWindowRestoreState = {
        y: Number.isFinite(windowInstance?.y) ? Number(windowInstance.y) : Number.NaN,
        h: Number.isFinite(windowInstance?.h) ? Number(windowInstance.h) : Number.NaN,
        minH: Number.isFinite(windowInstance?.minH) ? Number(windowInstance.minH) : Number.NaN,
      };
    }

    const labelDot = getHudGlyphDotSizePx(renderer);
    const lineHeight = getHudTextLineHeightPx(labelDot);
    const chromeHeight = HUD_WINDOW_TITLE_HEIGHT_PX + HUD_OVERLAY_PADDING_PX * 2;
    const contentWidth = resolveMainWindowContentWidth(windowInstance);
    const wrappedLineOffset = resolveWrappedLineCount(entries.slice(0, activeRowIndex), labelDot, contentWidth);
    const maxScrollTop = Math.max(0, resolveWrappedLineCount(entries, labelDot, contentWidth) - 1);

    const resolveChooserContentHeight = (startIndex) => {
      let total = 0;
      for (let index = startIndex; index <= chooserEndIndex; index += 1) {
        total += resolveEntryRowHeightPx(entries[index], lineHeight);
      }
      return total;
    };

    let targetScrollTop = clampNumber(wrappedLineOffset, 0, maxScrollTop);
    let chooserContentHeight = resolveChooserContentHeight(activeRowIndex);

    const layoutHeight = Number(hudSystem?.hud?.layoutH);
    const maxWindowHeight = Number.isFinite(layoutHeight) && layoutHeight > ANCHORED_WINDOW_GUTTER_PX * 2
      ? Math.max(DEFAULT_SHEET_WINDOW.minH, Math.floor(layoutHeight - ANCHORED_WINDOW_GUTTER_PX * 2))
      : Math.max(
          chromeHeight + chooserContentHeight,
          Number(windowInstance.h ?? 0),
          Number(dateChooserWindowRestoreState?.h ?? 0),
          DEFAULT_SHEET_WINDOW.h,
        );

    if (chromeHeight + chooserContentHeight > maxWindowHeight && activeRowIndex > 0) {
      const compactScrollTop = activeRowIndex;
      const compactContentHeight = resolveChooserContentHeight(compactScrollTop);
      if (compactContentHeight < chooserContentHeight) {
        chooserContentHeight = compactContentHeight;
      }
    }

    const baseHeight = Number.isFinite(dateChooserWindowRestoreState?.h)
      ? Number(dateChooserWindowRestoreState.h)
      : Number(windowInstance.h ?? DEFAULT_SHEET_WINDOW.h);
    const baseMinHeight = Number.isFinite(dateChooserWindowRestoreState?.minH)
      ? Number(dateChooserWindowRestoreState.minH)
      : Number(windowInstance.minH ?? DEFAULT_SHEET_WINDOW.minH);
    const targetHeight = clampNumber(
      Math.max(baseHeight, Math.ceil(chromeHeight + chooserContentHeight)),
      Math.max(DEFAULT_SHEET_WINDOW.minH, baseMinHeight),
      maxWindowHeight,
    );

    const baseY = Number.isFinite(dateChooserWindowRestoreState?.y)
      ? Number(dateChooserWindowRestoreState.y)
      : Number(windowInstance.y ?? DEFAULT_SHEET_WINDOW.y);
    let targetY = baseY;
    if (Number.isFinite(layoutHeight) && layoutHeight > ANCHORED_WINDOW_GUTTER_PX * 2) {
      const maxY = Math.max(ANCHORED_WINDOW_GUTTER_PX, Math.floor(layoutHeight - targetHeight - ANCHORED_WINDOW_GUTTER_PX));
      targetY = clampNumber(baseY, ANCHORED_WINDOW_GUTTER_PX, maxY);
    }

    let changed = false;
    if (Number(windowInstance.scrollTop) !== targetScrollTop || String(windowInstance.scrollMode ?? "") !== "manual") {
      windowInstance.scrollTop = targetScrollTop;
      windowInstance.scrollMode = "manual";
      changed = true;
    }
    if (Number(windowInstance.minH) !== targetHeight) {
      windowInstance.minH = targetHeight;
      changed = true;
    }
    if (Number(windowInstance.h) !== targetHeight) {
      windowInstance.h = targetHeight;
      changed = true;
    }
    if (Number(windowInstance.y) !== targetY) {
      windowInstance.y = targetY;
      changed = true;
    }

    if (changed) {
      notifyMainWindowLayoutChange(windowInstance);
    }
  }

  function buildAnchoredWindowOptions(baseWindow, defaults, overrides) {
    const baseX = Number.isFinite(baseWindow?.x) ? Number(baseWindow.x) : DEFAULT_SHEET_WINDOW.x;
    const baseY = Number.isFinite(baseWindow?.y) ? Number(baseWindow.y) : DEFAULT_SHEET_WINDOW.y;
    const baseW = Number.isFinite(baseWindow?.w) ? Number(baseWindow.w) : DEFAULT_SHEET_WINDOW.w;
    const baseH = Number.isFinite(baseWindow?.h) ? Number(baseWindow.h) : DEFAULT_SHEET_WINDOW.h;

    const layoutW = Number(hudSystem?.hud?.layoutW);
    const layoutH = Number(hudSystem?.hud?.layoutH);
    const hasLayoutW = Number.isFinite(layoutW) && layoutW > ANCHORED_WINDOW_GUTTER_PX * 2;
    const hasLayoutH = Number.isFinite(layoutH) && layoutH > ANCHORED_WINDOW_GUTTER_PX * 2;
    const requested = {
      x: baseX + baseW + ANCHORED_WINDOW_GUTTER_PX,
      y: baseY,
      w: baseW + 80,
      h: baseH,
      minW: Math.max(320, Math.min(baseW + 80, 420)),
      minH: Math.max(180, Math.min(baseH, 220)),
      draggable: true,
      minimizable: true,
      resizable: true,
      ...defaults,
      ...overrides,
    };

    let width = Number.isFinite(requested.w) ? Number(requested.w) : baseW + 80;
    let height = Number.isFinite(requested.h) ? Number(requested.h) : baseH;
    let minW = Number.isFinite(requested.minW) ? Number(requested.minW) : width;
    let minH = Number.isFinite(requested.minH) ? Number(requested.minH) : height;

    if (hasLayoutW) {
      const maxWidth = Math.max(220, layoutW - ANCHORED_WINDOW_GUTTER_PX * 2);
      width = Math.min(width, maxWidth);
      minW = Math.min(minW, width);
    }
    if (hasLayoutH) {
      const maxHeight = Math.max(160, layoutH - ANCHORED_WINDOW_GUTTER_PX * 2);
      height = Math.min(height, maxHeight);
      minH = Math.min(minH, height);
    }

    let x = Number.isFinite(requested.x) ? Number(requested.x) : baseX + baseW + ANCHORED_WINDOW_GUTTER_PX;
    if (hasLayoutW) {
      const rightX = baseX + baseW + ANCHORED_WINDOW_GUTTER_PX;
      const leftX = baseX - width - ANCHORED_WINDOW_GUTTER_PX;
      const maxX = Math.max(ANCHORED_WINDOW_GUTTER_PX, layoutW - width - ANCHORED_WINDOW_GUTTER_PX);
      if (rightX + width + ANCHORED_WINDOW_GUTTER_PX <= layoutW) {
        x = rightX;
      } else if (leftX >= ANCHORED_WINDOW_GUTTER_PX) {
        x = leftX;
      } else {
        x = clampNumber(rightX, ANCHORED_WINDOW_GUTTER_PX, maxX);
      }
    }

    let y = Number.isFinite(requested.y) ? Number(requested.y) : baseY;
    if (hasLayoutH) {
      const maxY = Math.max(ANCHORED_WINDOW_GUTTER_PX, layoutH - height - ANCHORED_WINDOW_GUTTER_PX);
      y = clampNumber(y, ANCHORED_WINDOW_GUTTER_PX, maxY);
    }

    return {
      ...requested,
      x,
      y,
      w: width,
      h: height,
      minW,
      minH,
    };
  }

  function buildChooserWindowOptions(baseWindow) {
    const anchored = buildAnchoredWindowOptions(baseWindow, {
      w: 260,
      h: 220,
      minW: 220,
      minH: 160,
      scrollable: true,
      scrollMode: "top",
    }, chooserWindow);
    return anchored;
  }

  function buildEditorWindowOptions(baseWindow) {
    const anchored = buildAnchoredWindowOptions(baseWindow, {
      w: 500,
      h: Math.max(260, Number(baseWindow?.h) || DEFAULT_SHEET_WINDOW.h),
      minW: 360,
      minH: 200,
      scrollable: true,
      scrollMode: "top",
    }, editorWindow);
    return anchored;
  }

  function safeDestroyWindow(key) {
    if (typeof hudSystem.destroyWindow !== "function") return;
    try {
      hudSystem.destroyWindow(key);
    } catch {
      // no-op
    }
  }

  function disposeTextEditor() {
    if (!textEditor) return;
    try {
      textEditor.dispose?.();
    } catch {
      // no-op
    }
    textEditor = null;
  }

  function resetActiveEditPreview() {
    if (!activeEdit) return;
    const row = getRow(activeEdit.rowKey);
    if (!row) return;

    if (activeEdit.mode === "inline-text") {
      const previewValue = String(inlineTextState?.text ?? "");
      const committedValue = String(row.value ?? "");
      if (previewValue !== committedValue) {
        emitPreviewChange(row, row.value, { reverted: true });
      }
      return;
    }

    if (activeEdit.mode === "text") {
      const previewValue = String(textEditor?.getText?.() ?? "");
      const committedValue = String(row.value ?? "");
      if (previewValue !== committedValue) {
        emitPreviewChange(row, row.value, { reverted: true });
      }
    }
  }

  function closeActiveEditor({ suppressPreviewReset = false } = {}) {
    const wasInlineEditor = isInlineTextEdit(activeEdit) || isInlineChoiceEdit(activeEdit);
    const shouldRefreshMainWindow = visible && (wasInlineEditor || isDateChooserEdit(activeEdit));
    const restoreScrollTop = Number.isFinite(activeEdit?.restoreScrollTop)
      ? Math.max(0, Math.floor(Number(activeEdit.restoreScrollTop)))
      : null;
    if (!suppressPreviewReset) {
      resetActiveEditPreview();
    }
    disposeTextEditor();
    disposeDateChooserTextures();
    activeEdit = null;
    inlineTextState = null;
    dateChooserState = null;
    clearWindowTextSelection();
    clearWindowTextCaret();
    safeDestroyWindow(editorWindowKey);
    safeDestroyWindow(chooserWindowKey);
    if (restoreScrollTop != null) {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.scrollTop = restoreScrollTop;
        mainWindow.scrollMode = "manual";
      }
    }
    if (shouldRefreshMainWindow) {
      renderMainWindow({ forceCreate: true });
    }
  }

  function resolveMainWindowEntryIndex(rowKey) {
    const mainWindow = getMainWindow();
    if (!mainWindow) return -1;
    const storeKey = typeof mainWindow.linesKey === "function"
      ? mainWindow.linesKey()
      : `${mainWindowKey}Lines`;
    const entries = Array.isArray(hudSystem?.hud?.ui?.data?.[storeKey])
      ? hudSystem.hud.ui.data[storeKey]
      : [];
    return entries.findIndex((entry) => entry?.rowKey === rowKey);
  }

  function findRowIndex(rowKey) {
    const key = String(rowKey ?? "").trim();
    if (!key) return -1;
    return currentRows.findIndex((row) => row.key === key);
  }

  function getRow(rowKey) {
    const rowIndex = findRowIndex(rowKey);
    return rowIndex >= 0 ? currentRows[rowIndex] : null;
  }

  function findAdjacentEditableRow(rowKey, direction = 1) {
    const startIndex = findRowIndex(rowKey);
    if (startIndex < 0) return null;

    const step = direction < 0 ? -1 : 1;
    for (let index = startIndex + step; index >= 0 && index < currentRows.length; index += step) {
      const row = currentRows[index];
      if (isRowEditable(row)) return row;
    }
    return null;
  }

  function finalizeActiveEditForTransition(nextRowKey = null) {
    if (!activeEdit) return true;
    if (nextRowKey != null && String(activeEdit.rowKey ?? "") === String(nextRowKey ?? "")) return true;

    if (activeEdit.mode === "viewer") {
      closeActiveEditor();
      return true;
    }

    if (activeEdit.mode === "inline-choice") {
      const row = getRow(activeEdit.rowKey);
      if (!row) {
        closeActiveEditor();
        return false;
      }
      const options = normalizeOptions(row);
      const optionIndex = resolveInlineChoiceIndex(row, activeEdit);
      return applyChoice(row, options[optionIndex]?.value);
    }

    return !!commitTextEdit();
  }

  function commitAndActivateAdjacentEditableRow(direction = 1) {
    if (!activeEdit?.rowKey) return false;
    const nextRow = findAdjacentEditableRow(activeEdit.rowKey, direction);
    const finalized = finalizeActiveEditForTransition(nextRow?.key ?? null);
    if (!finalized) return false;
    if (!nextRow) return true;
    return activateRow(nextRow.key);
  }

  function getValue(rowKey) {
    return getRow(rowKey)?.value;
  }

  function emitChange(row, nextValue) {
    const payload = {
      key: row.key,
      value: nextValue,
      row,
      rows: currentRows.slice(),
    };

    try {
      row.onChange?.(payload);
    } catch {
      // no-op
    }
    try {
      onChange?.(payload);
    } catch {
      // no-op
    }
  }

  function emitPreviewChange(row, nextValue, { reverted = false } = {}) {
    if (!row) return;
    const payload = {
      key: row.key,
      value: nextValue,
      row,
      rows: currentRows.slice(),
      reverted,
    };

    try {
      row.onPreviewChange?.(payload);
    } catch {
      // no-op
    }
    try {
      onPreviewChange?.(payload);
    } catch {
      // no-op
    }
  }

  function emitAction(row) {
    const payload = {
      key: row.key,
      row,
      rows: currentRows.slice(),
    };

    try {
      row.onPress?.(payload);
    } catch {
      // no-op
    }
    try {
      onAction?.(payload);
    } catch {
      // no-op
    }
  }

  function setRowValue(rowKey, nextValue, { silent = false } = {}) {
    const rowIndex = findRowIndex(rowKey);
    if (rowIndex < 0) return false;

    const prevRow = currentRows[rowIndex];
    const normalizedValue = normalizeCommittedRowValue(prevRow, nextValue);
    const nextRow = {
      ...prevRow,
      value: normalizedValue,
    };
    currentRows = currentRows.map((row, index) => (index === rowIndex ? nextRow : row));
    renderMainWindow();
    if (!silent) emitChange(nextRow, normalizedValue);
    return true;
  }

  function formatChoiceLabel(row, optionValue) {
    const options = normalizeOptions(row);
    const match = options.find((option) => isSameValue(option.value, optionValue));
    if (match) return match.label;
    return formatValue(optionValue);
  }

  function formatRowValue(row) {
    if (typeof row.renderValue === "function") {
      try {
        return String(row.renderValue(row.value, row) ?? "");
      } catch {
        return String(formatValue(row.value));
      }
    }

    if (row.kind === "multiline" || row.kind === "viewer") {
      return summarizeMultilineValue(row.value);
    }
    if (row.kind === "date") {
      return formatDateDisplayValue(row.value);
    }
    if (row.kind === "select") {
      return formatChoiceLabel(row, row.value);
    }
    if (row.kind === "boolean") {
      return row.value ? "ON" : "OFF";
    }
    return formatValue(row.value);
  }

  function summarizeMultilineValue(value) {
    const text = String(formatValue(value) ?? "").replace(/\r/g, "");
    const trimmedText = text.trim();
    if (!trimmedText) return "(empty)";

    const lines = text.split("\n");
    const firstLine = String(lines[0] ?? "").trim();
    const preview = firstLine.length > PROPERTY_SHEET_MULTILINE_PREVIEW_MAX_CHARS
      ? `${firstLine.slice(0, PROPERTY_SHEET_MULTILINE_PREVIEW_MAX_CHARS - 3).trimEnd()}...`
      : firstLine;

    if (lines.length <= 1) {
      return preview || "(empty)";
    }
    return `${preview || "(empty)"} (${lines.length} lines)`;
  }

  function buildInlineFieldRowEntry({ row, label, activeInlineText, activeInlineChoice, activeDateChooser }) {
    const hoverText = row.hoverText ?? buildHoverText(row, label);
    if (activeInlineText) {
      const fieldText = formatInlineTextRowValue(activeInlineText);
      return {
        text: `${label}:`,
        color: row.color ?? HUD_TEXT_DEFAULT_COLOR,
        rowKey: row.key,
        hoverText,
        onClick: (event) => {
          if (!placeInlineTextCursorAtPointer({ row, label, event, target: "label" })) return;
          renderMainWindow({ forceCreate: true });
        },
        actionButtonText: fieldText,
        actionButtonHoverText: hoverText,
        actionButtonOnClick: (event) => {
          if (!placeInlineTextCursorAtPointer({ row, label, event, target: "actionButton" })) return;
          renderMainWindow({ forceCreate: true });
        },
        actionButtonWidthPx: getPropertySheetFieldButtonWidth(fieldText),
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonBgColor: PROPERTY_SHEET_FIELD_ACTIVE_BG_COLOR,
        actionButtonBgOpacity: 0.95,
        actionButtonSourceText: activeInlineText.text,
        actionButtonDisplayPrefixLength: 0,
        actionButtonTextInsetPx: 8,
        actionButtonForceVisible: true,
      };
    }

    const isChoiceRow = row.kind === "select" || row.kind === "boolean";
    const isDateRow = row.kind === "date";
    const valueText = isChoiceRow
      ? formatChoiceLabel(row, row.value)
      : formatRowValue(row);
    const pickerIconTexture = isChoiceRow || isDateRow
      ? getPickerArrowTexture(activeInlineChoice || activeDateChooser ? "up" : "down")
      : null;
    const actionButtonText = isChoiceRow || isDateRow
      ? (pickerIconTexture
          ? valueText
          : `${valueText} ${activeInlineChoice || activeDateChooser ? PROPERTY_SHEET_PICK_OPEN_ICON : PROPERTY_SHEET_PICK_CLOSED_ICON}`)
      : valueText;
    const actionButtonWidthPx = getPropertySheetFieldButtonWidth(actionButtonText, {
      includesPickerIcon: pickerIconTexture != null,
    });
    return {
      text: `${label}:`,
      color: row.color ?? HUD_TEXT_DEFAULT_COLOR,
      rowKey: row.key,
      hoverText,
      onClick: () => {
        if (isDateRow) {
          openDateChooser(row);
          return;
        }
        activateRow(row.key);
      },
      actionButtonText,
      actionButtonIconTexture: pickerIconTexture,
      actionButtonHoverText: isDateRow ? `Pick ${label}` : hoverText,
      actionButtonOnClick: () => {
        if (isDateRow) {
          openDateChooser(row);
          return;
        }
        activateRow(row.key);
      },
      actionButtonWidthPx,
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonBgColor: activeInlineChoice || activeDateChooser ? PROPERTY_SHEET_FIELD_ACTIVE_BG_COLOR : PROPERTY_SHEET_FIELD_BG_COLOR,
      actionButtonBgOpacity: activeInlineChoice || activeDateChooser ? 0.96 : 0.92,
      actionButtonTextInsetPx: 8,
    };
  }

  function resolveCurrentOptionIndex(row) {
    const options = normalizeOptions(row);
    const matchIndex = options.findIndex((option) => isSameValue(option.value, row?.value));
    return matchIndex >= 0 ? matchIndex : 0;
  }

  function resolveInlineChoiceIndex(row, edit = activeEdit) {
    const options = normalizeOptions(row);
    if (!options.length) return 0;
    const rawIndex = Number(edit?.optionIndex);
    if (!Number.isFinite(rawIndex)) {
      const nextIndex = resolveCurrentOptionIndex(row);
      if (edit && typeof edit === "object") edit.optionIndex = nextIndex;
      return nextIndex;
    }
    const index = clampNumber(Math.floor(rawIndex), 0, options.length - 1);
    if (edit && typeof edit === "object") edit.optionIndex = index;
    return index;
  }

  function applyInlineChoiceKey(edit, row, event) {
    if (!edit || !row || !event) return false;
    const options = normalizeOptions(row);
    if (!options.length) {
      cancelActiveEdit();
      return true;
    }
    const currentIndex = resolveInlineChoiceIndex(row, edit);
    switch (event.key) {
      case "Escape":
        cancelActiveEdit();
        return true;
      case "Enter":
        return !!applyChoice(row, options[currentIndex]?.value);
      case "ArrowDown":
        edit.optionIndex = clampNumber(currentIndex + 1, 0, options.length - 1);
        return true;
      case "ArrowUp":
        edit.optionIndex = clampNumber(currentIndex - 1, 0, options.length - 1);
        return true;
      case "Home":
        edit.optionIndex = 0;
        return true;
      case "End":
        edit.optionIndex = options.length - 1;
        return true;
      default:
        return false;
    }
  }

  function getInlineChoicePopupWidth(row) {
    const options = normalizeOptions(row);
    const currentValueText = row.kind === "boolean"
      ? (row.value ? "ON" : "OFF")
      : formatChoiceLabel(row, row.value);
    let widest = getPropertySheetFieldButtonWidth(currentValueText, { includesPickerIcon: true });
    for (const option of options) {
      widest = Math.max(widest, getPropertySheetFieldButtonWidth(option.label));
    }
    return clampNumber(widest, 120, 260);
  }

  function buildPopupOptionEntry({ label, hoverText, active, onClick, widthPx }) {
    return {
      text: "",
      color: active ? HUD_TEXT_BRIGHT_COLOR : HUD_TEXT_DEFAULT_COLOR,
      hoverText,
      onClick,
      actionButtonText: String(label ?? ""),
      actionButtonHoverText: hoverText,
      actionButtonOnClick: onClick,
      actionButtonWidthPx: widthPx,
      rowHeightPx: PROPERTY_SHEET_DROPDOWN_OPTION_ROW_HEIGHT_PX,
      actionButtonTextColor: active ? HUD_TEXT_BRIGHT_COLOR : HUD_TEXT_DEFAULT_COLOR,
      actionButtonBgColor: active ? PROPERTY_SHEET_DROPDOWN_ACTIVE_ROW_BG_COLOR : PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR,
      actionButtonBgOpacity: active ? 0.96 : 0.9,
      actionButtonTextInsetPx: 10,
      actionButtonForceVisible: true,
    };
  }

  function buildRowEntries() {
    const entries = [];
    const activeRowKey = String(activeEdit?.rowKey ?? "");

    for (const row of currentRows) {
      if (row.kind === "spacer") {
        entries.push({ text: "", color: HUD_TEXT_MUTED_COLOR });
        continue;
      }

      if (row.kind === "section") {
        if (entries.length > 0 && entries[entries.length - 1]?.text !== "") {
          entries.push({ text: "", color: HUD_TEXT_MUTED_COLOR });
        }
        entries.push({
          text: String(row.label ?? "").toUpperCase(),
          color: row.color ?? HUD_TEXT_INFO_COLOR,
        });
        continue;
      }

      if (row.kind === "action") {
        const label = String(row.label ?? row.key);
        const hoverText = row.hoverText ?? `Activate ${label}`;
        const buttonIconTexture = resolvePropertySheetButtonIconTexture(resolveButtonIconTexture, row, "action");
        const buttonText = buttonIconTexture ? "" : resolveActionRowButtonText(row);
        entries.push({
          text: label,
          color: row.color ?? HUD_TEXT_EMPHASIS_COLOR,
          hoverText,
          actionButtonText: buttonText,
          actionButtonIconTexture: buttonIconTexture,
          actionButtonHoverText: hoverText,
          actionButtonOnClick: () => {
            emitAction(row);
          },
          actionButtonWidthPx: getPropertySheetRowButtonWidth(buttonText),
          actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
          actionButtonBgColor: resolveActionRowButtonBgColor(row),
          actionButtonBgOpacity: 0.9,
          onClick: () => {
            emitAction(row);
          },
        });
        continue;
      }

      const label = String(row.label ?? row.key);
      const activeInlineText = isInlineTextEdit() && row.key === activeRowKey ? inlineTextState : null;
      const activeInlineChoice = isInlineChoiceEdit() && row.key === activeRowKey;
      if (row.kind === "text" || row.kind === "date" || row.kind === "select" || row.kind === "boolean") {
        entries.push(buildInlineFieldRowEntry({
          row,
          label,
          activeInlineText,
          activeInlineChoice,
          activeDateChooser: isDateChooserEdit() && row.key === activeRowKey,
        }));

        if (activeInlineChoice) {
          const options = normalizeOptions(row);
          const activeChoiceIndex = resolveInlineChoiceIndex(row);
          const popupWidthPx = getInlineChoicePopupWidth(row);
          for (let index = 0; index < options.length; index += 1) {
            const option = options[index];
            const isSelected = isSameValue(option.value, row.value);
            const isActiveOption = index === activeChoiceIndex;
            entries.push(buildPopupOptionEntry({
              label: option.label,
              hoverText: `Choose ${option.label}`,
              active: isActiveOption || isSelected,
              onClick: () => applyChoice(row, option.value),
              widthPx: popupWidthPx,
            }));
          }
        } else if (row.kind === "date" && isDateChooserEdit() && row.key === activeRowKey) {
          entries.push(...buildDateChooserEntries(row, dateChooserState));
        }
        continue;
      }

      const valueText = formatRowValue(row);
      const prefix = showInteractionPrefixes && isRowEditable(row)
        ? row.kind === "select" || row.kind === "boolean"
          ? "[pick]"
          : "[edit]"
        : "";
      const prefixText = prefix ? `${prefix} ` : "";
      const text = valueText ? `${prefixText}${label}: ${valueText}` : `${prefixText}${label}`;
      const entry = {
        text,
        color: row.color ?? (isRowEditable(row) ? HUD_TEXT_DEFAULT_COLOR : HUD_TEXT_MUTED_COLOR),
        rowKey: row.key,
      };

      if (activeInlineText) {
        entry.sourceText = activeInlineText.text;
        entry.displayPrefixLength = `${prefixText}${label}: `.length;
      }

      if (isRowEditable(row)) {
        entry.hoverText = row.hoverText ?? buildHoverText(row, label);
        entry.onClick = () => {
          activateRow(row.key);
        };
        if (!showInteractionPrefixes) {
          const buttonIconTexture = resolvePropertySheetButtonIconTexture(resolveButtonIconTexture, row, "editable");
          const buttonText = buttonIconTexture ? "" : resolveEditableRowButtonText(row);
          entry.actionButtonText = buttonText;
          entry.actionButtonIconTexture = buttonIconTexture;
          entry.actionButtonHoverText = entry.hoverText;
          entry.actionButtonOnClick = entry.onClick;
          entry.actionButtonWidthPx = getPropertySheetRowButtonWidth(buttonText);
          entry.actionButtonTextColor = HUD_TEXT_BRIGHT_COLOR;
          entry.actionButtonBgColor = PROPERTY_SHEET_ROW_BUTTON_BG_COLOR;
          entry.actionButtonBgOpacity = 0.9;
        }
      }

      entries.push(entry);
    }

    if (entries.length === 0) {
      entries.push({ text: "No fields", color: HUD_TEXT_MUTED_COLOR });
    }
    return entries;
  }

  function renderMainWindow({ forceCreate = false, resetScroll = false } = {}) {
    const existingWindow = getMainWindow();
    const windowInstance = existingWindow ?? ((forceCreate || visible) ? ensureMainWindow() : null);
    if (!windowInstance) return;
    windowInstance.title = currentTitle;
    const shouldResetScroll = resetScroll || !existingWindow;
    disposeDateChooserTextures();
    const entries = buildRowEntries();
    syncMainWindowDateChooserLayout(windowInstance, entries);
    hudSystem.setWindowLines(
      mainWindowKey,
      entries,
      isDateChooserEdit()
        ? { scrollMode: "manual" }
        : shouldResetScroll
          ? { scrollMode: "top" }
          : {}
    );
    if (isInlineTextEdit()) {
      renderInlineTextCaret();
    } else {
      clearWindowTextSelection();
      clearWindowTextCaret();
    }
  }

  function placeInlineTextCursorAtPointer({ row, label, event, target = "actionButton" } = {}) {
    if (!isInlineTextEdit() || !inlineTextState || activeEdit?.rowKey !== row?.key) return false;
    const pointer = event?.pointer;
    if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return false;

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.collapsed) return false;

    if (target !== "actionButton") {
      inlineTextState.caret = 0;
      clearInlineTextSelection(inlineTextState);
      return true;
    }

    const activeLine = resolveActiveInlineTextLineMeta();
    const button = activeLine?.meta?.actionButton ?? null;
    const entry = activeLine?.entry ?? null;

    const labelDot = getHudGlyphDotSizePx(renderer);
    const lineHeight = getHudTextLineHeightPx(labelDot);
    const buttonWidth = Number.isFinite(button?.w)
      ? Number(button.w)
      : Number.isFinite(entry?.actionButtonWidthPx)
        ? Number(entry.actionButtonWidthPx)
        : getPropertySheetFieldButtonWidth(String(entry?.actionButtonText ?? inlineTextState.text ?? ""));
    const buttonHeight = Number.isFinite(button?.h)
      ? Number(button.h)
      : Math.max(8, lineHeight - 4);
    const buttonX = Number.isFinite(button?.x)
      ? Number(button.x)
      : Number(mainWindow.x ?? 0) + Math.max(0, Number(mainWindow.w ?? 0) - buttonWidth - 2);
    const buttonY = Number.isFinite(button?.y)
      ? Number(button.y)
      : Number(mainWindow.y ?? 0)
        + HUD_WINDOW_TITLE_HEIGHT_PX
        + HUD_OVERLAY_PADDING_PX
        + Math.max(0, (activeLine?.activeLineIndex ?? 0) - (Number(mainWindow.scrollTop) || 0)) * lineHeight
        + Math.max(1, Math.floor((lineHeight - buttonHeight) / 2));
    const buttonTextInsetPx = Number.isFinite(button?.textInsetPx)
      ? Number(button.textInsetPx)
      : Number.isFinite(entry?.actionButtonTextInsetPx)
        ? Number(entry.actionButtonTextInsetPx)
        : 8;
    const buttonDot = Number.isFinite(button?.dot) ? Number(button.dot) : Math.max(1, labelDot * 0.85);
    const sourceText = String(button?.sourceText ?? entry?.actionButtonSourceText ?? inlineTextState.text ?? "");
    let nextCaret = null;

    try {
      const tri = button?.labelObject?._textMesh?.textRenderInfo;
      if (tri && typeof _getCaretAtPoint === "function") {
        const localX = pointer.x - Number(button?.textX ?? (buttonX + buttonTextInsetPx));
        const topNudge = (7 * buttonDot) * HUD_TEXT_ASCENDER_NUDGE_FACTOR;
        const localY = -(pointer.y - Number(button?.textY ?? (buttonY + 1))) - topNudge;
        const caret = _getCaretAtPoint(tri, localX, localY);
        if (caret && Number.isFinite(caret.charIndex)) {
          nextCaret = clampNumber(Math.floor(caret.charIndex), 0, sourceText.length);
        }
      }
    } catch {
      // no-op
    }

    if (!Number.isFinite(nextCaret)) {
      const textStartX = Number(button?.textX ?? (buttonX + buttonTextInsetPx));
      const charWidth = Math.max(1, 6 * buttonDot);
      nextCaret = clampNumber(
        Math.round((pointer.x - textStartX) / Math.max(1, charWidth)),
        0,
        sourceText.length
      );
    }

    inlineTextState.caret = nextCaret;
    clearInlineTextSelection(inlineTextState);
    return true;
  }

  function resolveActiveInlineTextLineMeta() {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const storeKey = typeof mainWindow.linesKey === "function"
      ? mainWindow.linesKey()
      : `${mainWindowKey}Lines`;
    const entries = Array.isArray(hudSystem?.hud?.ui?.data?.[storeKey])
      ? hudSystem.hud.ui.data[storeKey]
      : [];
    const activeLineIndex = entries.findIndex((entry) => entry?.rowKey === activeEdit?.rowKey);
    if (activeLineIndex < 0) return null;

    const meta = Array.isArray(hudSystem?.hud?.objects?.windows?.[mainWindowKey]?._visibleLineMeta)
      ? hudSystem.hud.objects.windows[mainWindowKey]._visibleLineMeta[activeLineIndex] ?? null
      : null;
    return { activeLineIndex, meta, entry: entries[activeLineIndex] ?? null };
  }

  function commitTextEdit() {
    if (!activeEdit) return false;
    if (activeEdit.mode === "date-chooser") {
      const row = getRow(activeEdit.rowKey);
      if (!row) {
        closeActiveEditor();
        return false;
      }
      return applyChoice(row, dateChooserState?.selectedDateValue ?? row.value ?? "");
    }
    if (activeEdit.mode === "inline-text") {
      const rowKey = activeEdit.rowKey;
      const nextValue = String(inlineTextState?.text ?? "");
      closeActiveEditor({ suppressPreviewReset: true });
      return setRowValue(rowKey, nextValue);
    }
    if ((activeEdit.mode !== "text" && activeEdit.mode !== "inline-text") || !textEditor) return false;
    const rowKey = activeEdit.rowKey;
    const nextValue = textEditor.getText?.() ?? "";
    closeActiveEditor({ suppressPreviewReset: true });
    return setRowValue(rowKey, nextValue);
  }

  function cancelActiveEdit() {
    closeActiveEditor();
  }

  function applyChoice(row, nextValue) {
    closeActiveEditor();
    return setRowValue(row.key, nextValue);
  }

  function openDateChooser(row) {
    if (!row) return false;
    if (isDateChooserEdit() && activeEdit?.rowKey === row.key && dateChooserState) {
      renderDateChooser(row);
      return true;
    }
    if (!finalizeActiveEditForTransition(row.key)) return false;
    closeActiveEditor();
    visible = true;
    const mainWindow = getMainWindow() ?? ensureMainWindow();
    const restoreScrollTop = Number.isFinite(mainWindow?.scrollTop)
      ? Math.max(0, Math.floor(Number(mainWindow.scrollTop)))
      : 0;
    dateChooserState = createDateChooserState(row.value);
    activeEdit = {
      rowKey: row.key,
      mode: "date-chooser",
      restoreScrollTop,
    };
    renderDateChooser(row);
    return true;
  }

  function createDateChooserState(value) {
    const selectedParts = parseDateValue(value) ?? getTodayDateParts();
    return {
      displayYear: selectedParts.year,
      displayMonthIndex: selectedParts.monthIndex,
      selectedDateValue: formatDateParts(selectedParts.year, selectedParts.monthIndex, selectedParts.day),
      pickerMode: null,
    };
  }

  function disposeDateChooserTextures() {
    for (const texture of dateChooserTextures) {
      try {
        texture?.dispose?.();
      } catch {
        // no-op
      }
    }
    dateChooserTextures = [];
  }

  function disposePickerArrowTextures() {
    const textures = [pickerArrowDownTexture, pickerArrowUpTexture];
    for (const texture of textures) {
      try {
        texture?.dispose?.();
      } catch {
        // no-op
      }
    }
    pickerArrowDownTexture = null;
    pickerArrowUpTexture = null;
  }

  function getDateChooserReferenceTexture() {
    const windowObjects = hudSystem?.hud?.objects?.windows ?? null;
    if (!windowObjects || typeof windowObjects !== "object") return null;
    const candidateKeys = [chooserWindowKey, mainWindowKey];
    for (const key of candidateKeys) {
      const objects = windowObjects[key];
      const texture = objects?.scrollDownBtn?.material?.map
        ?? objects?.scrollUpBtn?.material?.map
        ?? objects?.closeBtn?.material?.map
        ?? objects?.minBtn?.material?.map
        ?? objects?.bg?.material?.map
        ?? null;
      if (texture?.constructor) {
        return texture;
      }
    }
    for (const objects of Object.values(windowObjects)) {
      const texture = objects?.scrollDownBtn?.material?.map
        ?? objects?.scrollUpBtn?.material?.map
        ?? objects?.closeBtn?.material?.map
        ?? objects?.minBtn?.material?.map
        ?? objects?.bg?.material?.map
        ?? null;
      if (texture?.constructor) {
        return texture;
      }
    }
    return null;
  }

  function trackDateChooserTexture(texture) {
    if (texture) dateChooserTextures.push(texture);
    return texture;
  }

  function createHudCanvasTexture(width, height, draw, { track = false } = {}) {
    if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
    const referenceTexture = getDateChooserReferenceTexture();
    const CanvasTextureCtor = THREE?.CanvasTexture ?? referenceTexture?.constructor;
    if (typeof CanvasTextureCtor !== "function") return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(16, Math.floor(Number(width) || 0));
    canvas.height = Math.max(16, Math.floor(Number(height) || 0));
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(ctx, canvas.width, canvas.height);

    const texture = new CanvasTextureCtor(canvas);
    try {
      texture.minFilter = referenceTexture?.minFilter ?? THREE.LinearFilter;
      texture.magFilter = referenceTexture?.magFilter ?? THREE.LinearFilter;
      texture.wrapS = referenceTexture?.wrapS ?? THREE.ClampToEdgeWrapping;
      texture.wrapT = referenceTexture?.wrapT ?? THREE.ClampToEdgeWrapping;
      if (referenceTexture && Object.prototype.hasOwnProperty.call(referenceTexture, "colorSpace")) {
        texture.colorSpace = referenceTexture.colorSpace;
      }
      texture.needsUpdate = true;
    } catch {
      // no-op
    }
    return track ? trackDateChooserTexture(texture) : texture;
  }

  function createDateChooserCanvasTexture(width, height, draw) {
    return createHudCanvasTexture(width, height, draw, { track: true });
  }

  function getDateChooserTextureCanvasSize(displayWidthPx, displayHeightPx, scale = 2) {
    return {
      width: Math.max(64, Math.round(Math.max(1, Number(displayWidthPx) || 0) * scale)),
      height: Math.max(32, Math.round(Math.max(1, Number(displayHeightPx) || 0) * scale)),
    };
  }

  function drawPickerArrowTexture(ctx, direction) {
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(68, 0);
    ctx.quadraticCurveTo(80, 0, 80, 12);
    ctx.lineTo(80, 68);
    ctx.quadraticCurveTo(80, 80, 68, 80);
    ctx.lineTo(20, 80);
    ctx.quadraticCurveTo(8, 80, 8, 68);
    ctx.lineTo(8, 12);
    ctx.quadraticCurveTo(8, 0, 20, 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(83,179,203,0.92)";
    ctx.fill();

    ctx.beginPath();
    if (direction === "up") {
      ctx.moveTo(44, 22);
      ctx.lineTo(24, 48);
      ctx.lineTo(64, 48);
    } else {
      ctx.moveTo(24, 30);
      ctx.lineTo(64, 30);
      ctx.lineTo(44, 56);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fill();
  }

  function getPickerArrowTexture(direction = "down") {
    if (direction === "up") {
      if (!pickerArrowUpTexture) {
        pickerArrowUpTexture = createHudCanvasTexture(88, 80, (ctx) => {
          drawPickerArrowTexture(ctx, "up");
        });
      }
      return pickerArrowUpTexture;
    }
    if (!pickerArrowDownTexture) {
      pickerArrowDownTexture = createHudCanvasTexture(88, 80, (ctx) => {
        drawPickerArrowTexture(ctx, "down");
      });
    }
    return pickerArrowDownTexture;
  }

  function formatHudColorCss(color, alpha = 1) {
    const normalized = Number(color) >>> 0;
    const red = (normalized >> 16) & 0xff;
    const green = (normalized >> 8) & 0xff;
    const blue = normalized & 0xff;
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, Number(alpha) || 0))})`;
  }

  function drawDateChooserRoundedRect(ctx, x, y, width, height, radius) {
    const clampedRadius = Math.max(0, Math.min(Number(radius) || 0, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + clampedRadius, y);
    ctx.lineTo(x + width - clampedRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
    ctx.lineTo(x + width, y + height - clampedRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
    ctx.lineTo(x + clampedRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
    ctx.lineTo(x, y + clampedRadius);
    ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
    ctx.closePath();
  }

  function createDateChooserWeekdayTexture(displayWidthPx, displayHeightPx) {
    const canvasSize = getDateChooserTextureCanvasSize(displayWidthPx, displayHeightPx, 2.2);
    return createDateChooserCanvasTexture(
      canvasSize.width,
      canvasSize.height,
      (ctx, width, height) => {
        ctx.fillStyle = formatHudColorCss(PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR, 0.96);
        drawDateChooserRoundedRect(ctx, 2, 4, width - 4, height - 8, 10);
        ctx.fill();

        const cellWidth = width / 7;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = formatHudColorCss(HUD_TEXT_MUTED_COLOR, 0.96);
        ctx.font = `700 ${Math.max(24, Math.floor(height * 0.42))}px sans-serif`;

        for (let index = 0; index < PROPERTY_SHEET_CALENDAR_WEEKDAY_LABELS.length; index += 1) {
          ctx.fillText(
            PROPERTY_SHEET_CALENDAR_WEEKDAY_LABELS[index],
            cellWidth * index + cellWidth * 0.5,
            height * 0.56,
          );
        }
      }
    );
  }

  function createDateChooserWeekTexture(week, displayWidthPx, displayHeightPx) {
    const canvasSize = getDateChooserTextureCanvasSize(displayWidthPx, displayHeightPx, 2.2);
    return createDateChooserCanvasTexture(
      canvasSize.width,
      canvasSize.height,
      (ctx, width, height) => {
        const cellWidth = width / 7;
        ctx.fillStyle = formatHudColorCss(PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR, 0.96);
        drawDateChooserRoundedRect(ctx, 2, 4, width - 4, height - 8, 10);
        ctx.fill();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${Math.max(24, Math.floor(height * 0.38))}px sans-serif`;

        for (let index = 0; index < week.length; index += 1) {
          const cell = week[index] ?? null;
          const cellX = cellWidth * index;
          const cellY = 0;

          if (cell?.isSelected) {
            ctx.fillStyle = formatHudColorCss(PROPERTY_SHEET_DROPDOWN_ACTIVE_ROW_BG_COLOR, 0.98);
            drawDateChooserRoundedRect(ctx, cellX + 6, cellY + 6, cellWidth - 12, height - 12, 12);
            ctx.fill();
          }

          if (!cell?.dateValue) continue;

          ctx.fillStyle = formatHudColorCss(cell?.isSelected ? HUD_TEXT_BRIGHT_COLOR : HUD_TEXT_DEFAULT_COLOR, 0.98);
          ctx.fillText(
            String(cell.day).padStart(2, "0"),
            cellX + cellWidth * 0.5,
            height * 0.56,
          );

        }
      }
    );
  }

  function createDateChooserHeaderTexture(state, displayWidthPx, displayHeightPx) {
    const canvasSize = getDateChooserTextureCanvasSize(displayWidthPx, displayHeightPx, 2.2);
    return createDateChooserCanvasTexture(
      canvasSize.width,
      canvasSize.height,
      (ctx, width, height) => {
        const titleText = `${String(PROPERTY_SHEET_CALENDAR_MONTH_LABELS[state?.displayMonthIndex] ?? "Month").toUpperCase()} ${state?.displayYear ?? ""}`.trim();
        const navSlot = Math.max(64, Math.floor(width * 0.12));
        const titleX = 18;
        const titleY = height * 0.56;
        const prevX = width - navSlot * 2 + navSlot * 0.5;
        const nextX = width - navSlot + navSlot * 0.5;

        ctx.fillStyle = formatHudColorCss(PROPERTY_SHEET_FIELD_BG_COLOR, 0.96);
        drawDateChooserRoundedRect(ctx, 2, 4, width - 4, height - 8, 10);
        ctx.fill();

        ctx.font = `700 ${Math.max(34, Math.floor(height * 0.5))}px sans-serif`;
        const measuredTitleWidth = Math.min(width - navSlot * 2 - 48, ctx.measureText(titleText).width);
        const caretX = titleX + measuredTitleWidth + 20;
        const caretY = titleY + 2;
        ctx.beginPath();
        ctx.moveTo(caretX - 10, caretY - 6);
        ctx.lineTo(caretX + 10, caretY - 6);
        ctx.lineTo(caretX, caretY + 8);
        ctx.closePath();
        ctx.fillStyle = formatHudColorCss(HUD_TEXT_MUTED_COLOR, 0.96);
        ctx.fill();

        ctx.strokeStyle = formatHudColorCss(HUD_TEXT_MUTED_COLOR, 0.96);
        ctx.lineWidth = 6;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(prevX + 8, titleY - 16);
        ctx.lineTo(prevX - 8, titleY);
        ctx.lineTo(prevX + 8, titleY + 16);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(nextX - 8, titleY - 16);
        ctx.lineTo(nextX + 8, titleY);
        ctx.lineTo(nextX - 8, titleY + 16);
        ctx.stroke();
      }
    );
  }

  function shiftDateValueByDays(dateValue, deltaDays) {
    const parts = parseDateValue(dateValue) ?? getTodayDateParts();
    const next = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day));
    next.setUTCDate(next.getUTCDate() + Math.trunc(Number(deltaDays) || 0));
    return formatDateParts(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
  }

  function shiftDateValueByMonths(dateValue, deltaMonths) {
    const parts = parseDateValue(dateValue) ?? getTodayDateParts();
    const absoluteMonth = parts.year * 12 + parts.monthIndex + Math.trunc(Number(deltaMonths) || 0);
    const nextYear = Math.floor(absoluteMonth / 12);
    const nextMonthIndex = ((absoluteMonth % 12) + 12) % 12;
    const nextDay = Math.min(parts.day, getDaysInMonth(nextYear, nextMonthIndex));
    return formatDateParts(nextYear, nextMonthIndex, nextDay);
  }

  function updateDateChooserSelection(row, nextDateValue, { syncDisplayMonth = true, pickerMode } = {}) {
    const nextParts = parseDateValue(nextDateValue);
    if (!nextParts || !dateChooserState) return false;
    dateChooserState.selectedDateValue = formatDateParts(nextParts.year, nextParts.monthIndex, nextParts.day);
    if (syncDisplayMonth) {
      dateChooserState.displayYear = nextParts.year;
      dateChooserState.displayMonthIndex = nextParts.monthIndex;
    }
    if (pickerMode !== undefined) {
      dateChooserState.pickerMode = pickerMode;
    }
    renderMainWindow({ forceCreate: true });
    return true;
  }

  function toggleDateChooserPickerMode(mode) {
    if (!dateChooserState) return false;
    dateChooserState.pickerMode = dateChooserState.pickerMode === mode ? null : mode;
    renderMainWindow({ forceCreate: true });
    return true;
  }

  function setDateChooserDisplayMonth(row, monthIndex) {
    const selectedParts = parseDateValue(dateChooserState?.selectedDateValue) ?? getTodayDateParts();
    const nextDay = Math.min(selectedParts.day, getDaysInMonth(selectedParts.year, monthIndex));
    return updateDateChooserSelection(row, formatDateParts(selectedParts.year, monthIndex, nextDay), {
      pickerMode: null,
    });
  }

  function setDateChooserDisplayYear(row, year) {
    const selectedParts = parseDateValue(dateChooserState?.selectedDateValue) ?? getTodayDateParts();
    const nextDay = Math.min(selectedParts.day, getDaysInMonth(year, selectedParts.monthIndex));
    return updateDateChooserSelection(row, formatDateParts(year, selectedParts.monthIndex, nextDay), {
      pickerMode: null,
    });
  }

  function getDateChooserPopupWidth(row) {
    const baseText = formatDateDisplayValue(dateChooserState?.selectedDateValue ?? row?.value ?? "");
    return clampNumber(
      getPropertySheetFieldButtonWidth(baseText, { includesPickerIcon: true }) + 40,
      PROPERTY_SHEET_DATE_POPUP_MIN_WIDTH_PX,
      PROPERTY_SHEET_DATE_POPUP_WIDTH_PX,
    );
  }

  function resolveMainWindowActionButtonLocalX(event) {
    const rowIndex = Math.floor(Number(event?.rowIndex));
    const meta = hudSystem?.hud?.objects?.windows?.[mainWindowKey]?._visibleLineMeta?.[rowIndex] ?? null;
    const button = meta?.actionButton ?? null;
    const pointerX = Number(event?.pointer?.x);
    const buttonX = Number(button?.x);
    const buttonW = Number(button?.w);
    if (Number.isFinite(pointerX) && Number.isFinite(buttonX) && Number.isFinite(buttonW) && buttonW > 0) {
      return clampNumber(pointerX - buttonX, 0, buttonW);
    }
    if (Number.isFinite(event?.localX)) {
      return Number(event.localX);
    }
    return null;
  }

  function resolveDateChooserWeekColumn(event) {
    const localX = resolveMainWindowActionButtonLocalX(event);
    const rowIndex = Math.floor(Number(event?.rowIndex));
    const buttonW = Number(hudSystem?.hud?.objects?.windows?.[mainWindowKey]?._visibleLineMeta?.[rowIndex]?.actionButton?.w);
    if (!Number.isFinite(localX) || !Number.isFinite(buttonW) || buttonW <= 0) {
      return -1;
    }
    return clampNumber(Math.floor(localX / (buttonW / 7)), 0, 6);
  }

  function handleDateChooserHeaderClick(row, event, popupWidth) {
    const localX = resolveMainWindowActionButtonLocalX(event);
    const navSlot = 34;
    if (!Number.isFinite(localX)) {
      return toggleDateChooserPickerMode("month");
    }
    if (localX >= popupWidth - navSlot) {
      return updateDateChooserSelection(row, shiftDateValueByMonths(dateChooserState?.selectedDateValue, 1), { pickerMode: null });
    }
    if (localX >= popupWidth - navSlot * 2) {
      return updateDateChooserSelection(row, shiftDateValueByMonths(dateChooserState?.selectedDateValue, -1), { pickerMode: null });
    }
    const titleRegionWidth = popupWidth - navSlot * 2 - 10;
    if (localX <= Math.max(60, titleRegionWidth * 0.66)) {
      return toggleDateChooserPickerMode("month");
    }
    return toggleDateChooserPickerMode("year");
  }

  function buildDateChooserEntries(row, state) {
    const weeks = buildDateChooserWeeks(state);
    const popupWidth = getDateChooserPopupWidth(row);
    const headerButtonHeight = Math.max(8, PROPERTY_SHEET_DATE_HEADER_ROW_HEIGHT_PX - 4);
    const weekdayButtonHeight = Math.max(8, PROPERTY_SHEET_DATE_WEEKDAY_ROW_HEIGHT_PX - 4);
    const weekButtonHeight = Math.max(8, PROPERTY_SHEET_DATE_WEEK_ROW_HEIGHT_PX - 4);
    const monthLabel = PROPERTY_SHEET_CALENDAR_MONTH_LABELS[state?.displayMonthIndex] ?? "Month";
    const headerTexture = createDateChooserHeaderTexture(state, popupWidth, headerButtonHeight);
    const weekdayTexture = createDateChooserWeekdayTexture(popupWidth, weekdayButtonHeight);
    const entries = [];

    entries.push({
      text: "",
      color: HUD_TEXT_INFO_COLOR,
      hoverText: "Pick month or year",
      onClick: (event) => handleDateChooserHeaderClick(row, event, popupWidth),
      actionButtonText: `${String(monthLabel).toUpperCase()} ${state?.displayYear ?? ""}`.trim(),
      actionButtonIconTexture: headerTexture,
      actionButtonHoverText: "Pick month or year",
      actionButtonOnClick: (event) => handleDateChooserHeaderClick(row, event, popupWidth),
      actionButtonWidthPx: popupWidth,
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonTextInsetPx: 18,
      actionButtonIconFitMode: "fill",
      rowHeightPx: PROPERTY_SHEET_DATE_HEADER_ROW_HEIGHT_PX,
      actionButtonBgColor: PROPERTY_SHEET_FIELD_BG_COLOR,
      actionButtonBgOpacity: headerTexture ? 0 : 0.94,
      actionButtonForceVisible: headerTexture != null,
    });

    if (state?.pickerMode === "month") {
      for (let monthIndex = 0; monthIndex < PROPERTY_SHEET_CALENDAR_MONTH_LABELS.length; monthIndex += 1) {
        entries.push(buildPopupOptionEntry({
          label: PROPERTY_SHEET_CALENDAR_MONTH_LABELS[monthIndex],
          hoverText: `Choose ${PROPERTY_SHEET_CALENDAR_MONTH_LABELS[monthIndex]}`,
          active: monthIndex === state?.displayMonthIndex,
          onClick: () => setDateChooserDisplayMonth(row, monthIndex),
          widthPx: popupWidth,
        }));
      }
      return entries;
    }

    if (state?.pickerMode === "year") {
      const centerYear = Number.isFinite(Number(state?.displayYear)) ? Number(state.displayYear) : getTodayDateParts().year;
      for (let offset = -PROPERTY_SHEET_DATE_YEAR_OPTION_RADIUS; offset <= PROPERTY_SHEET_DATE_YEAR_OPTION_RADIUS; offset += 1) {
        const year = centerYear + offset;
        entries.push(buildPopupOptionEntry({
          label: String(year),
          hoverText: `Choose ${year}`,
          active: year === state?.displayYear,
          onClick: () => setDateChooserDisplayYear(row, year),
          widthPx: popupWidth,
        }));
      }
      return entries;
    }

    entries.push({
      text: "",
      color: HUD_TEXT_MUTED_COLOR,
      actionButtonText: "",
      actionButtonIconTexture: weekdayTexture,
      actionButtonOnClick: () => {},
      actionButtonWidthPx: popupWidth,
      actionButtonTextColor: HUD_TEXT_MUTED_COLOR,
      actionButtonTextInsetPx: 12,
      actionButtonIconFitMode: "fill",
      rowHeightPx: PROPERTY_SHEET_DATE_WEEKDAY_ROW_HEIGHT_PX,
      actionButtonBgColor: PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR,
      actionButtonBgOpacity: weekdayTexture ? 0 : 0.0,
    });

    weeks.forEach((week) => {
      const weekTexture = createDateChooserWeekTexture(week, popupWidth, weekButtonHeight);
      entries.push({
        text: "",
        color: HUD_TEXT_BRIGHT_COLOR,
        hoverText: `Pick ${String(row?.label ?? row?.key ?? "date")}`,
        actionButtonText: "",
        actionButtonIconTexture: weekTexture,
        actionButtonWidthPx: popupWidth,
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonTextInsetPx: 12,
        actionButtonIconFitMode: "fill",
        rowHeightPx: PROPERTY_SHEET_DATE_WEEK_ROW_HEIGHT_PX,
        onClick: (event) => {
          const col = resolveDateChooserWeekColumn(event);
          const cell = col >= 0
            ? (week[col] ?? null)
            : (week.find((candidate) => candidate?.isSelected && candidate?.dateValue) ?? week.find((candidate) => candidate?.dateValue) ?? null);
          if (!cell?.dateValue) return false;
          return applyChoice(row, cell.dateValue);
        },
        actionButtonOnClick: (event) => {
          const col = resolveDateChooserWeekColumn(event);
          const cell = col >= 0
            ? (week[col] ?? null)
            : (week.find((candidate) => candidate?.isSelected && candidate?.dateValue) ?? week.find((candidate) => candidate?.dateValue) ?? null);
          if (!cell?.dateValue) return false;
          return applyChoice(row, cell.dateValue);
        },
        actionButtonBgColor: PROPERTY_SHEET_DROPDOWN_ROW_BG_COLOR,
        actionButtonBgOpacity: weekTexture ? 0 : 0.86,
      });
    });

    return entries;
  }

  function buildDateChooserFooterEntries() {
    const makeFooterEntry = (actionButtonText, hoverText, actionButtonOnClick, bgColor = PROPERTY_SHEET_ROW_BUTTON_BG_COLOR) => ({
      text: "",
      color: HUD_TEXT_MUTED_COLOR,
      actionButtonText,
      actionButtonHoverText: hoverText,
      actionButtonOnClick,
      actionButtonWidthPx: getPropertySheetRowButtonWidth(actionButtonText),
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonBgColor: bgColor,
      actionButtonBgOpacity: 0.9,
    });

    return [
      makeFooterEntry("Prev", "Previous month", () => {
        const nextValue = shiftDateValueByMonths(dateChooserState?.selectedDateValue, -1);
        updateDateChooserSelection(getRow(activeEdit?.rowKey), nextValue);
      }),
      makeFooterEntry("Today", "Pick today", () => {
        const today = getTodayDateParts();
        const row = getRow(activeEdit?.rowKey);
        if (!row) return false;
        return applyChoice(row, formatDateParts(today.year, today.monthIndex, today.day));
      }, PROPERTY_SHEET_EDITOR_SAVE_BUTTON_BG_COLOR),
      makeFooterEntry("Next", "Next month", () => {
        const nextValue = shiftDateValueByMonths(dateChooserState?.selectedDateValue, 1);
        updateDateChooserSelection(getRow(activeEdit?.rowKey), nextValue);
      }),
      makeFooterEntry(PROPERTY_SHEET_BUTTON_ICONS.cancel, "Close calendar", cancelActiveEdit, PROPERTY_SHEET_EDITOR_CANCEL_BUTTON_BG_COLOR),
    ];
  }

  function renderDateChooser(row) {
    if (!row || !dateChooserState) return;
    safeDestroyWindow(chooserWindowKey);
    disposeDateChooserTextures();
    renderMainWindow({ forceCreate: true });
  }

  function applyDateChooserKey(edit, row, event) {
    if (!edit || !row || !event || !dateChooserState) return false;

    switch (event.key) {
      case "Escape":
        if (dateChooserState.pickerMode) {
          dateChooserState.pickerMode = null;
          renderMainWindow({ forceCreate: true });
          return true;
        }
        cancelActiveEdit();
        return true;
      case "Enter":
        return !!commitTextEdit();
      case "ArrowLeft":
        return updateDateChooserSelection(row, shiftDateValueByDays(dateChooserState.selectedDateValue, -1));
      case "ArrowRight":
        return updateDateChooserSelection(row, shiftDateValueByDays(dateChooserState.selectedDateValue, 1));
      case "ArrowUp":
        return updateDateChooserSelection(row, shiftDateValueByDays(dateChooserState.selectedDateValue, -7));
      case "ArrowDown":
        return updateDateChooserSelection(row, shiftDateValueByDays(dateChooserState.selectedDateValue, 7));
      case "PageUp":
        return updateDateChooserSelection(row, shiftDateValueByMonths(dateChooserState.selectedDateValue, -1));
      case "PageDown":
        return updateDateChooserSelection(row, shiftDateValueByMonths(dateChooserState.selectedDateValue, 1));
      case "Home":
        return updateDateChooserSelection(
          row,
          formatDateParts(dateChooserState.displayYear, dateChooserState.displayMonthIndex, 1),
          { syncDisplayMonth: false }
        );
      case "End":
        return updateDateChooserSelection(
          row,
          formatDateParts(
            dateChooserState.displayYear,
            dateChooserState.displayMonthIndex,
            getDaysInMonth(dateChooserState.displayYear, dateChooserState.displayMonthIndex)
          ),
          { syncDisplayMonth: false }
        );
      default:
        return false;
    }
  }

  function openTextEditor(row) {
    if (!row) return false;
    if (!finalizeActiveEditForTransition(row.key)) return false;
    closeActiveEditor();
    visible = true;
    renderMainWindow({ forceCreate: true });
    const baseWindow = getMainWindow() ?? ensureMainWindow();
    const isViewer = row.kind === "viewer";
    const useInlineEditor = (row.kind === "text" || row.kind === "date") && !isViewer;
    if (useInlineEditor) {
      inlineTextState = createInlineTextState(row.value);
      activeEdit = {
        rowKey: row.key,
        mode: "inline-text",
      };
      renderMainWindow({ forceCreate: true });
      return true;
    }
    if (typeof createTextEditor !== "function") {
      throw new Error("createHudPropertySheet: multiline and viewer rows require a createTextEditor(...) factory");
    }
    if (!useInlineEditor) {
      ensureWindow(editorWindowKey, `${editorTitle}: ${String(row.label ?? row.key)}`, buildEditorWindowOptions(baseWindow));
    }
    const rowEditorOptions = row.editorOptions && typeof row.editorOptions === "object"
      ? row.editorOptions
      : {};
    const wrapLines = rowEditorOptions.wrapLines === true
      || (row.kind === "multiline"
        && rowEditorOptions.wrapLines !== false
        && String(rowEditorOptions.displayMode ?? "plain").trim().toLowerCase() !== "structured"
        && String(rowEditorOptions.language ?? "plain").trim().toLowerCase() === "plain");

    const footerEntries = buildTextEditorFooterEntries(row, isViewer
      ? { onClose: cancelActiveEdit }
      : {
          onSave: commitTextEdit,
          onCancel: cancelActiveEdit,
        }, {
          resolveButtonIconTexture,
        });

    textEditor = createTextEditor({
      renderer,
      hudSystem,
      windowKey: editorWindowKey,
      initialText: String(row.value ?? ""),
      onDirty: isViewer
        ? null
        : () => {
            const previewRow = getRow(row.key);
            if (!previewRow) return;
            const previewValue = String(textEditor?.getText?.() ?? "");
            if (previewValue === String(previewRow.value ?? "")) return;
            emitPreviewChange(previewRow, previewValue);
          },
      onSubmit: isViewer ? cancelActiveEdit : commitTextEdit,
      footerEntries,
      wrapLines,
      ...rowEditorOptions,
      readOnly: isViewer || rowEditorOptions.readOnly === true,
      submitOnEnter: isViewer ? false : row.kind === "text" || row.kind === "date",
      submitOnMetaEnter: isViewer ? false : row.kind === "multiline",
    });
    textEditor?.focus?.();

    activeEdit = {
      rowKey: row.key,
      mode: isViewer ? "viewer" : "text",
    };
    return true;
  }

  function openChooser(row) {
    if (!row) return false;
    if (!finalizeActiveEditForTransition(row.key)) return false;
    closeActiveEditor();
    visible = true;
    activeEdit = {
      rowKey: row.key,
      mode: "inline-choice",
      optionIndex: resolveCurrentOptionIndex(row),
    };
    renderMainWindow({ forceCreate: true });
    return true;
  }

  function activateRow(rowKey) {
    const row = getRow(rowKey);
    if (!row) return false;

    if (isInlineChoiceEdit() && activeEdit?.rowKey === row.key && (row.kind === "select" || row.kind === "boolean")) {
      cancelActiveEdit();
      return true;
    }

    if (row.kind === "text" || row.kind === "date" || row.kind === "multiline" || row.kind === "viewer") {
      openTextEditor(row);
      return true;
    }
    if (row.kind === "select" || row.kind === "boolean") {
      openChooser(row);
      return true;
    }
    if (row.kind === "action") {
      emitAction(row);
      return true;
    }
    return false;
  }

  function setRows(nextRows, { resetScroll = false } = {}) {
    currentRows = normalizeRows(nextRows);
    if (activeEdit && !getRow(activeEdit.rowKey)) {
      closeActiveEditor();
    }
    renderMainWindow({ resetScroll });
  }

  function setTitle(nextTitle) {
    currentTitle = String(nextTitle ?? "").trim() || currentTitle;
    renderMainWindow();
  }

  function show({ resetScroll = false } = {}) {
    visible = true;
    const existingWindow = getMainWindow();
    if (!existingWindow || existingWindow.collapsed) {
      ensureMainWindow();
    }
    hudSystem.bringToFront?.(mainWindowKey);
    renderMainWindow({ forceCreate: true, resetScroll: resetScroll || !existingWindow });
  }

  function hide() {
    visible = false;
    closeActiveEditor();
    if (typeof hudSystem.setWindowCollapsed === "function") {
      hudSystem.setWindowCollapsed(mainWindowKey, true);
      return;
    }
    const win = hudSystem?.hud?.ui?.windows?.[mainWindowKey];
    if (win) win.collapsed = true;
  }

  function refresh() {
    renderMainWindow();
  }

  function finalizeActiveEditor() {
    return finalizeActiveEditForTransition(null);
  }

  function isEditing() {
    return !!activeEdit;
  }

  function isTyping() {
    return isInlineTextEdit() || !!textEditor?.isTyping?.();
  }

  function dispose() {
    visible = false;
    closeActiveEditor();
    disposePickerArrowTextures();
    removeInlineTextListeners();
    safeDestroyWindow(mainWindowKey);
  }

  return {
    show,
    hide,
    setTitle,
    setRows,
    getRows: () => currentRows.slice(),
    getRow,
    getValue,
    setRowValue,
    activateRow,
    finalizeActiveEditor,
    closeActiveEditor,
    refresh,
    isEditing,
    isTyping,
    dispose,
  };

  function renderInlineTextCaret() {
    const mainWindow = getMainWindow();
    if (!mainWindow || !inlineTextState) return;

    const activeLine = resolveActiveInlineTextLineMeta();
    const activeLineIndex = activeLine?.activeLineIndex ?? -1;
    if (activeLineIndex < 0) return;

    const dot = getHudGlyphDotSizePx(renderer);
    const lineHeight = getHudTextLineHeightPx(dot);
    const contentHeight = Math.max(0, Number(mainWindow.h ?? 0) - HUD_WINDOW_TITLE_HEIGHT_PX - HUD_OVERLAY_PADDING_PX * 2);
    const visibleLines = Math.max(1, Math.floor(contentHeight / Math.max(1, lineHeight)));
    const visibleRow = activeLineIndex - (Number(mainWindow.scrollTop) || 0);
    if (visibleRow < 0 || visibleRow >= visibleLines) {
      clearWindowTextCaret();
      clearWindowTextSelection();
      return;
    }

    hudSystem.setWindowTextCaret?.(mainWindowKey, {
      visible: true,
      row: activeLineIndex,
      col: clampNumber(Number(inlineTextState.caret) || 0, 0, inlineTextState.text.length),
      wPx: Math.max(1, Math.floor(dot)),
      color: HUD_TEXT_BRIGHT_COLOR,
      target: "actionButton",
    });

    const selection = getInlineTextSelectionRange(inlineTextState);
    hudSystem.setWindowTextSelection?.(mainWindowKey, selection
      ? {
          visible: true,
          startRow: activeLineIndex,
          startCol: selection.start,
          endRow: activeLineIndex,
          endCol: selection.end,
          color: 0x5b7aa6,
          textColor: HUD_TEXT_BRIGHT_COLOR,
          opacity: 0.65,
          target: "actionButton",
        }
      : { visible: false });
  }
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => normalizeRow(row, index)).filter(Boolean);
}

function normalizeRow(row, index) {
  if (!row || typeof row !== "object") return null;

  const rawKind = String(row.kind ?? inferRowKind(row)).trim().toLowerCase();
  const kind = rawKind || "readonly";
  const label = row.label ?? row.title ?? row.name ?? row.key ?? `Row ${index + 1}`;
  const key = String(row.key ?? `${kind}-${index}`).trim();

  if (kind === "boolean") {
    return {
      ...row,
      kind,
      key,
      label,
      value: !!row.value,
    };
  }

  return {
    ...row,
    kind,
    key,
    label,
    value: row.value,
  };
}

function inferRowKind(row) {
  if (typeof row.onPress === "function") return "action";
  if (row.kind === "section" || row.kind === "spacer") return row.kind;
  if (typeof row.value === "boolean") return "boolean";
  if (Array.isArray(row.options)) return "select";
  return "readonly";
}

function normalizeOptions(row) {
  if (row.kind === "boolean") {
    return [
      { value: true, label: "ON" },
      { value: false, label: "OFF" },
    ];
  }

  const source = Array.isArray(row.options) ? row.options : [];
  return source.map((option) => {
    if (option && typeof option === "object" && !(option instanceof Date) && Object.prototype.hasOwnProperty.call(option, "value")) {
      return {
        value: option.value,
        label: String(option.label ?? option.text ?? option.value ?? ""),
      };
    }
    return {
      value: option,
      label: formatValue(option),
    };
  });
}

function normalizeCommittedRowValue(row, nextValue) {
  if (row?.kind === "boolean") return !!nextValue;
  if (row?.kind === "date") return normalizeDateInputValue(nextValue);
  return nextValue;
}

function normalizeDateInputValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const isoParts = parseIsoDateParts(text);
  if (isoParts) return formatDateParts(isoParts.year, isoParts.monthIndex, isoParts.day);

  const yearFirstMatch = text.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (yearFirstMatch) {
    const parts = buildDateParts(Number(yearFirstMatch[1]), Number(yearFirstMatch[2]) - 1, Number(yearFirstMatch[3]));
    if (parts) return formatDateParts(parts.year, parts.monthIndex, parts.day);
  }

  const monthFirstMatch = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (monthFirstMatch) {
    const parts = buildDateParts(Number(monthFirstMatch[3]), Number(monthFirstMatch[1]) - 1, Number(monthFirstMatch[2]));
    if (parts) return formatDateParts(parts.year, parts.monthIndex, parts.day);
  }

  return text;
}

function parseIsoDateParts(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return buildDateParts(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseDateValue(value) {
  return parseIsoDateParts(normalizeDateInputValue(value));
}

function buildDateParts(year, monthIndex, day) {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) return null;
  if (monthIndex < 0 || monthIndex > 11 || day < 1) return null;
  const probe = new Date(Date.UTC(year, monthIndex, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== monthIndex
    || probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, monthIndex, day };
}

function formatDateParts(year, monthIndex, day) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function getTodayDateParts() {
  const today = new Date();
  return buildDateParts(today.getFullYear(), today.getMonth(), today.getDate())
    ?? { year: 2000, monthIndex: 0, day: 1 };
}

function formatDateDisplayValue(value) {
  const normalized = normalizeDateInputValue(value);
  return normalized || "Pick date";
}

function buildDateChooserWeeks(state) {
  const displayYear = Number(state?.displayYear);
  const displayMonthIndex = Number(state?.displayMonthIndex);
  const daysInMonth = getDaysInMonth(displayYear, displayMonthIndex);
  const firstWeekday = new Date(Date.UTC(displayYear, displayMonthIndex, 1)).getUTCDay();
  const weeks = [];
  let cursorDay = 1 - firstWeekday;

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      if (cursorDay >= 1 && cursorDay <= daysInMonth) {
        const dateValue = formatDateParts(displayYear, displayMonthIndex, cursorDay);
        week.push({
          day: cursorDay,
          dateValue,
          isSelected: dateValue === state?.selectedDateValue,
        });
      } else {
        week.push({ day: null, dateValue: null, isSelected: false });
      }
      cursorDay += 1;
    }
    weeks.push(week);
  }

  return weeks;
}

function formatDateChooserWeekText(week) {
  return week.map((cell) => {
    if (!cell?.dateValue) return "    ";
    const dayText = String(cell.day).padStart(2, "0");
    return cell.isSelected ? `[${dayText}]` : ` ${dayText} `;
  }).join("");
}

function isRowEditable(row) {
  return row.kind === "text"
    || row.kind === "date"
    || row.kind === "multiline"
    || row.kind === "viewer"
    || row.kind === "select"
    || row.kind === "boolean";
}

function buildHoverText(row, label) {
  if (row.kind === "viewer") {
    return `View ${label}`;
  }
  if (row.kind === "date") {
    return `Edit ${label}`;
  }
  if (row.kind === "select" || row.kind === "boolean") {
    return `Open ${label}`;
  }
  return `Edit ${label}`;
}

function resolveEditableRowButtonText(row) {
  if (row.kind === "viewer") {
    return PROPERTY_SHEET_BUTTON_ICONS.view;
  }
  if (row.kind === "date") {
    return PROPERTY_SHEET_BUTTON_ICONS.pick;
  }
  if (row.kind === "select" || row.kind === "boolean") {
    return PROPERTY_SHEET_BUTTON_ICONS.pick;
  }
  return PROPERTY_SHEET_BUTTON_ICONS.edit;
}

function resolveActionRowButtonText(row) {
  const explicitIcon = String(row?.buttonIcon ?? "").trim();
  if (explicitIcon) {
    return explicitIcon;
  }
  if (typeof row?.buttonText === "string" && row.buttonText.trim()) {
    const mappedFromText = mapPropertySheetButtonIcon(row.buttonText);
    if (mappedFromText) {
      return mappedFromText;
    }
  }
  const mappedFromLabel = mapPropertySheetButtonIcon(row?.label ?? row?.key ?? "");
  return mappedFromLabel || PROPERTY_SHEET_BUTTON_ICONS.run;
}

function resolveActionRowButtonBgColor(row) {
  if (Number.isFinite(row?.actionButtonBgColor)) {
    return Number(row.actionButtonBgColor);
  }
  return row?.color === HUD_TEXT_EMPHASIS_COLOR
    ? PROPERTY_SHEET_EDITOR_SAVE_BUTTON_BG_COLOR
    : PROPERTY_SHEET_ROW_BUTTON_BG_COLOR;
}

function getPropertySheetRowButtonWidth(buttonText) {
  const text = String(buttonText ?? "").trim();
  if (text.length <= 2) {
    return 32;
  }
  return clampNumber(22 + text.length * 8, 56, 96);
}

function mapPropertySheetButtonIcon(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("test")) return PROPERTY_SHEET_BUTTON_ICONS.test;
  if (normalized.includes("save")) return PROPERTY_SHEET_BUTTON_ICONS.save;
  if (normalized.includes("create") || normalized.includes("new") || normalized.includes("add")) return PROPERTY_SHEET_BUTTON_ICONS.create;
  if (normalized.includes("close")) return PROPERTY_SHEET_BUTTON_ICONS.close;
  if (normalized.includes("cancel")) return PROPERTY_SHEET_BUTTON_ICONS.cancel;
  if (normalized.includes("confirm") || normalized === "ok" || normalized.includes("apply")) return PROPERTY_SHEET_BUTTON_ICONS.confirm;
  if (normalized.includes("view")) return PROPERTY_SHEET_BUTTON_ICONS.view;
  if (normalized.includes("pick") || normalized.includes("choose") || normalized.includes("select")) return PROPERTY_SHEET_BUTTON_ICONS.pick;
  if (normalized.includes("edit")) return PROPERTY_SHEET_BUTTON_ICONS.edit;
  if (normalized.includes("run")) return PROPERTY_SHEET_BUTTON_ICONS.run;
  return "";
}

function formatValue(value) {
  if (value == null) return "(none)";
  if (typeof value === "string") return value || "(empty)";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry)).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function isSameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left === "number" && typeof right === "number" && Number.isNaN(left) && Number.isNaN(right)) return true;
  return false;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolvePropertySheetButtonIconTexture(resolver, row, role) {
  if (row?.buttonIconTexture != null) return row.buttonIconTexture;
  if (typeof resolver !== "function") return null;
  return resolver({ row, role }) ?? null;
}

function buildChooserFooterEntries(row, { onCancel } = {}, { resolveButtonIconTexture = null } = {}) {
  if (typeof onCancel !== "function") return [];
  const cancelIconTexture = typeof resolveButtonIconTexture === "function"
    ? (resolveButtonIconTexture({ row, role: "cancel" }) ?? null)
    : null;
  return [
    {
      text: "",
      color: HUD_TEXT_MUTED_COLOR,
      actionButtonText: cancelIconTexture ? "" : PROPERTY_SHEET_BUTTON_ICONS.cancel,
      actionButtonIconTexture: cancelIconTexture,
      actionButtonHoverText: "Keep current value",
      actionButtonOnClick: onCancel,
      actionButtonWidthPx: 36,
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonBgColor: PROPERTY_SHEET_EDITOR_CANCEL_BUTTON_BG_COLOR,
      actionButtonBgOpacity: 0.9,
    },
  ];
}

function buildTextEditorFooterEntries(row, { onSave, onCancel, onClose } = {}, { resolveButtonIconTexture = null } = {}) {
  const label = String(row?.label ?? row?.key ?? "value");
  if (typeof onSave !== "function") {
    const closeIconTexture = typeof resolveButtonIconTexture === "function"
      ? (resolveButtonIconTexture({ row, role: "close" }) ?? null)
      : null;
    return [
      {
        text: "",
        color: HUD_TEXT_MUTED_COLOR,
        actionButtonText: closeIconTexture ? "" : PROPERTY_SHEET_BUTTON_ICONS.close,
        actionButtonIconTexture: closeIconTexture,
        actionButtonHoverText: `Close ${label}`,
        actionButtonOnClick: onClose ?? onCancel,
        actionButtonWidthPx: 36,
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonBgColor: PROPERTY_SHEET_EDITOR_CANCEL_BUTTON_BG_COLOR,
        actionButtonBgOpacity: 0.9,
      },
    ];
  }
  const cancelIconTexture = typeof resolveButtonIconTexture === "function"
    ? (resolveButtonIconTexture({ row, role: "cancel" }) ?? null)
    : null;
  const saveIconTexture = typeof resolveButtonIconTexture === "function"
    ? (resolveButtonIconTexture({ row, role: "save" }) ?? null)
    : null;
  return [
    {
      text: "",
      color: HUD_TEXT_MUTED_COLOR,
      actionButtonText: cancelIconTexture ? "" : PROPERTY_SHEET_BUTTON_ICONS.cancel,
      actionButtonIconTexture: cancelIconTexture,
      actionButtonHoverText: "Discard change",
      actionButtonOnClick: onCancel,
      actionButtonWidthPx: 36,
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonBgColor: PROPERTY_SHEET_EDITOR_CANCEL_BUTTON_BG_COLOR,
      actionButtonBgOpacity: 0.9,
    },
    {
      text: "",
      color: HUD_TEXT_MUTED_COLOR,
      actionButtonText: saveIconTexture ? "" : PROPERTY_SHEET_BUTTON_ICONS.save,
      actionButtonIconTexture: saveIconTexture,
      actionButtonHoverText: `Save ${label}`,
      actionButtonOnClick: onSave,
      actionButtonWidthPx: 36,
      actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
      actionButtonBgColor: PROPERTY_SHEET_EDITOR_SAVE_BUTTON_BG_COLOR,
      actionButtonBgOpacity: 0.94,
    },
  ];
}

function createInlineTextState(value) {
  const text = String(value ?? "");
  return {
    text,
    caret: text.length,
    selectionAnchor: text.length > 0 ? 0 : null,
  };
}

function formatInlineTextRowValue(state) {
  const text = String(state?.text ?? "");
  return text || "";
}

function getPropertySheetFieldButtonWidth(buttonText, { includesPickerIcon = false } = {}) {
  const text = String(buttonText ?? "").trim();
  return clampNumber(90 + text.length * 7 + (includesPickerIcon ? 28 : 0), 120, 260);
}

function getInlineTextSelectionRange(state) {
  if (!state || !Number.isFinite(state.selectionAnchor) || state.selectionAnchor === state.caret) return null;
  return {
    start: Math.max(0, Math.min(state.selectionAnchor, state.caret)),
    end: Math.max(0, Math.max(state.selectionAnchor, state.caret)),
  };
}

function clearInlineTextSelection(state) {
  if (!state) return;
  state.selectionAnchor = null;
}

function replaceInlineTextSelection(state, nextText) {
  if (!state) return false;
  const text = String(nextText ?? "");
  const selection = getInlineTextSelectionRange(state);
  const start = selection ? selection.start : state.caret;
  const end = selection ? selection.end : state.caret;
  state.text = `${state.text.slice(0, start)}${text}${state.text.slice(end)}`;
  state.caret = start + text.length;
  clearInlineTextSelection(state);
  return true;
}

function applyInlineTextKey(state, event) {
  if (!state || !event) return false;
  const shift = !!event.shiftKey;
  const currentText = String(state.text ?? "");
  const selection = getInlineTextSelectionRange(state);
  const clampCaret = () => {
    state.caret = clampNumber(Number(state.caret) || 0, 0, String(state.text ?? "").length);
  };
  const moveCaret = (nextCaret) => {
    const resolved = clampNumber(Number(nextCaret) || 0, 0, String(state.text ?? "").length);
    if (shift) {
      if (!Number.isFinite(state.selectionAnchor)) state.selectionAnchor = state.caret;
    } else {
      clearInlineTextSelection(state);
    }
    state.caret = resolved;
  };

  if (event.key === "Backspace") {
    if (selection) {
      replaceInlineTextSelection(state, "");
      return true;
    }
    if (state.caret <= 0) return true;
    state.text = `${currentText.slice(0, state.caret - 1)}${currentText.slice(state.caret)}`;
    state.caret -= 1;
    clearInlineTextSelection(state);
    clampCaret();
    return true;
  }

  if (event.key === "Delete") {
    if (selection) {
      replaceInlineTextSelection(state, "");
      return true;
    }
    if (state.caret >= currentText.length) return true;
    state.text = `${currentText.slice(0, state.caret)}${currentText.slice(state.caret + 1)}`;
    clearInlineTextSelection(state);
    clampCaret();
    return true;
  }

  if (event.key === "ArrowLeft") {
    moveCaret(state.caret - 1);
    return true;
  }
  if (event.key === "ArrowRight") {
    moveCaret(state.caret + 1);
    return true;
  }
  if (event.key === "Home") {
    moveCaret(0);
    return true;
  }
  if (event.key === "End") {
    moveCaret(currentText.length);
    return true;
  }

  const char = resolveInlineTextCharacter(event);
  if (char == null) return false;
  replaceInlineTextSelection(state, char);
  return true;
}

function resolveInlineTextCharacter(event) {
  if (!event || typeof event.key !== "string") return null;
  if (event.key.length !== 1) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return event.key;
}
