// SPDX-License-Identifier: Apache-2.0
import {
  HUD_TEXT_BRIGHT_COLOR,
  HUD_TEXT_MUTED_COLOR,
} from "../../hud-text-style.js";

const DEFAULT_PROMPT_WINDOW = {
  x: 16,
  y: 56,
  w: 360,
  h: 180,
  minW: 280,
  minH: 140,
  draggable: true,
  minimizable: false,
  resizable: true,
  scrollable: true,
  scrollMode: "top",
};

const PROMPT_CONFIRM_BUTTON_BG_COLOR = 0x587c5e;
const PROMPT_CANCEL_BUTTON_BG_COLOR = 0x5d6675;
const PROMPT_BUTTON_ICONS = Object.freeze({
  cancel: "X",
  close: "X",
  create: "+",
  save: "[]",
  confirm: ">",
});

/**
 * Create a reusable HUD-native text prompt.
 * Purpose: collect short or multiline text in the shared runtime HUD without visible DOM overlays or browser dialogs; the bound editor may create Halo's invisible input endpoint for a supported immersive system keyboard.
 * @param {object} [options={}] Prompt configuration.
 * @param {object} options.hudSystem Shared HUD runtime used for window creation and text rendering.
 * @param {object} options.renderer Three.js renderer forwarded to createHudTextEditor(...).
 * @param {string} options.windowKey Persistent HUD window key used for the prompt.
 * @param {string} [options.title="PROMPT"] Default prompt title.
 * @param {object} [options.windowOptions] Default createWindow(...) overrides for the prompt window.
 * @param {(context: { label: string, role: "cancel" | "confirm", title: string, state: object }) => unknown} [options.resolveButtonIconTexture] Optional resolver for texture-backed footer buttons.
 * @param {(options: object) => { focus?: () => void, blur?: () => void, isTyping?: () => boolean, getText?: () => string, setText?: (text: string) => void, dispose?: () => void }} [options.createTextEditor] Optional text editor factory override used by tests.
 * @returns {{show: (prompt?: object) => boolean, hide: () => void, isOpen: () => boolean, isTyping: () => boolean, getText: () => string, dispose: () => void}} HUD-native prompt controller.
 * Side effects: creates and destroys HUD windows, instantiates the shared HUD text editor, and invokes prompt callbacks when the user confirms or cancels.
 */
export function createHudTextPrompt({
  hudSystem,
  renderer,
  windowKey,
  title = "PROMPT",
  windowOptions = {},
  resolveButtonIconTexture = null,
  createTextEditor = null,
} = {}) {
  if (!hudSystem?.createWindow || !hudSystem?.destroyWindow) {
    throw new Error("createHudTextPrompt: hudSystem with createWindow(...) and destroyWindow(...) is required");
  }
  if (!renderer) throw new Error("createHudTextPrompt: renderer is required");
  const key = String(windowKey ?? "").trim();
  if (!key) throw new Error("createHudTextPrompt: windowKey is required");
  if (typeof createTextEditor !== "function") {
    throw new Error("createHudTextPrompt: createTextEditor must be a function");
  }

  let textEditor = null;
  let promptState = null;

  function disposeEditor() {
    if (!textEditor) return;
    try {
      textEditor.dispose?.();
    } catch {
      // no-op
    }
    textEditor = null;
  }

  function hide() {
    disposeEditor();
    promptState = null;
    try {
      hudSystem.destroyWindow(key);
    } catch {
      // no-op
    }
  }

  function buildWindowOptions() {
    const layoutW = Number(hudSystem?.hud?.layoutW) || 1280;
    const layoutH = Number(hudSystem?.hud?.layoutH) || 720;
    const requestedW = Number.isFinite(windowOptions.w) ? Number(windowOptions.w) : DEFAULT_PROMPT_WINDOW.w;
    const requestedH = Number.isFinite(windowOptions.h) ? Number(windowOptions.h) : DEFAULT_PROMPT_WINDOW.h;
    const width = Math.min(Math.max(DEFAULT_PROMPT_WINDOW.minW, requestedW), Math.max(DEFAULT_PROMPT_WINDOW.minW, layoutW - 32));
    const height = Math.min(Math.max(DEFAULT_PROMPT_WINDOW.minH, requestedH), Math.max(DEFAULT_PROMPT_WINDOW.minH, layoutH - 32));
    const centeredX = Math.max(16, Math.floor((layoutW - width) * 0.5));
    const centeredY = Math.max(16, Math.floor((layoutH - height) * 0.5));
    return {
      ...DEFAULT_PROMPT_WINDOW,
      ...windowOptions,
      x: Number.isFinite(windowOptions.x) ? Number(windowOptions.x) : centeredX,
      y: Number.isFinite(windowOptions.y) ? Number(windowOptions.y) : centeredY,
      w: width,
      h: height,
      minW: Number.isFinite(windowOptions.minW) ? Number(windowOptions.minW) : DEFAULT_PROMPT_WINDOW.minW,
      minH: Number.isFinite(windowOptions.minH) ? Number(windowOptions.minH) : DEFAULT_PROMPT_WINDOW.minH,
    };
  }

  function ensureWindow(promptTitle) {
    const win = hudSystem.createWindow(key, {
      ...buildWindowOptions(),
      title: String(promptTitle ?? title),
    });
    if (win && typeof win === "object") {
      win.title = String(promptTitle ?? title);
      win.collapsed = false;
    }
    hudSystem.setWindowCollapsed?.(key, false);
    return win;
  }

  async function confirmPrompt() {
    const state = promptState;
    if (!state) return false;
    const value = textEditor?.getText?.() ?? "";
    hide();
    try {
      await state.onConfirm?.(value);
    } catch {
      // no-op
    }
    return true;
  }

  function cancelPrompt() {
    const state = promptState;
    hide();
    try {
      state?.onCancel?.();
    } catch {
      // no-op
    }
  }

  function buildFooterEntries(state) {
    const cancelIconTexture = typeof resolveButtonIconTexture === "function"
      ? (resolveButtonIconTexture({ label: state.cancelLabel, role: "cancel", title: state.title, state }) ?? null)
      : null;
    const confirmIconTexture = typeof resolveButtonIconTexture === "function"
      ? (resolveButtonIconTexture({ label: state.confirmLabel, role: "confirm", title: state.title, state }) ?? null)
      : null;
    return [
      {
        text: "",
        color: HUD_TEXT_MUTED_COLOR,
        actionButtonText: cancelIconTexture ? "" : resolvePromptButtonIcon(state.cancelLabel, "cancel"),
        actionButtonIconTexture: cancelIconTexture,
        actionButtonHoverText: `Cancel ${state.title.toLowerCase()}`,
        actionButtonOnClick: cancelPrompt,
        actionButtonWidthPx: 36,
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonBgColor: PROMPT_CANCEL_BUTTON_BG_COLOR,
        actionButtonBgOpacity: 0.9,
      },
      {
        text: "",
        color: HUD_TEXT_MUTED_COLOR,
        actionButtonText: confirmIconTexture ? "" : resolvePromptButtonIcon(state.confirmLabel, "confirm"),
        actionButtonIconTexture: confirmIconTexture,
        actionButtonHoverText: `${state.confirmLabel} ${state.title.toLowerCase()}`,
        actionButtonOnClick: () => {
          void confirmPrompt();
        },
        actionButtonWidthPx: 36,
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonBgColor: PROMPT_CONFIRM_BUTTON_BG_COLOR,
        actionButtonBgOpacity: 0.94,
      },
    ];
  }

  function show(prompt = {}) {
    hide();
    promptState = {
      title: String(prompt.title ?? title ?? "PROMPT"),
      value: String(prompt.value ?? ""),
      confirmLabel: String(prompt.confirmLabel ?? "OK"),
      cancelLabel: String(prompt.cancelLabel ?? "Cancel"),
      multiline: prompt.multiline === true,
      readOnly: prompt.readOnly === true,
      displayMode: prompt.displayMode ?? "plain",
      language: prompt.language ?? "plain",
      showLineNumbers: prompt.showLineNumbers,
      onConfirm: typeof prompt.onConfirm === "function" ? prompt.onConfirm : null,
      onCancel: typeof prompt.onCancel === "function" ? prompt.onCancel : null,
    };

    ensureWindow(promptState.title);
    hudSystem.bringToFront?.(key);
    textEditor = createTextEditor({
      renderer,
      hudSystem,
      windowKey: key,
      initialText: promptState.value,
      onSubmit: () => {
        void confirmPrompt();
      },
      footerEntries: buildFooterEntries(promptState),
      readOnly: promptState.readOnly,
      displayMode: promptState.displayMode,
      language: promptState.language,
      showLineNumbers: promptState.showLineNumbers,
      submitOnEnter: !promptState.multiline && !promptState.readOnly,
      submitOnMetaEnter: promptState.multiline && !promptState.readOnly,
    });
    textEditor?.focus?.();
    return true;
  }

  return {
    show,
    hide,
    isOpen: () => !!promptState,
    isTyping: () => !!textEditor?.isTyping?.(),
    getText: () => String(textEditor?.getText?.() ?? ""),
    dispose() {
      hide();
    },
  };
}

function resolvePromptButtonIcon(label, fallbackKind = "confirm") {
  const normalized = String(label ?? "").trim().toLowerCase();
  if (normalized.includes("cancel")) return PROMPT_BUTTON_ICONS.cancel;
  if (normalized.includes("close")) return PROMPT_BUTTON_ICONS.close;
  if (normalized.includes("create") || normalized.includes("new") || normalized.includes("add")) return PROMPT_BUTTON_ICONS.create;
  if (normalized.includes("save")) return PROMPT_BUTTON_ICONS.save;
  if (normalized.includes("ok") || normalized.includes("confirm") || normalized.includes("apply")) return PROMPT_BUTTON_ICONS.confirm;
  return fallbackKind === "cancel" ? PROMPT_BUTTON_ICONS.cancel : PROMPT_BUTTON_ICONS.confirm;
}
