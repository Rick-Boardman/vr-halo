// SPDX-License-Identifier: Apache-2.0
/**
 * Re-export the shared HUD text-editor runtime and its canonical selection color constants.
 * Purpose: provide a narrow browser-safe entrypoint for app harnesses that need the shared HUD text editor without importing unrelated runtime UI modules.
 * Parameters and return values: forwarded from createHudTextEditor(...), createWebXrSystemKeyboardBridge(...), and the exported selection color constants.
 * Side effects: none in this barrel file; importing it forwards the underlying HUD text-editor module exports.
 */
export {
	createHudTextEditor,
	HUD_TEXT_EDITOR_SELECTION_BG_COLOR,
	HUD_TEXT_EDITOR_SELECTION_TEXT_COLOR,
} from "../../hud-text-editor.js?v=workflow4-inline-editor-25";
export { createWebXrSystemKeyboardBridge } from "../../webxr-system-keyboard.js";

/**
 * Re-export the shared HUD text prompt runtime.
 * Purpose: provide a reusable in-HUD prompt primitive for apps that need short or multiline text entry without browser dialogs.
 */
export { createHudTextPrompt } from "./hud-text-prompt-runtime.js?v=workflow4-inline-editor-25";

/**
 * Re-export the shared HUD-native property-sheet controller that composes the
 * existing runtime window system and HUD text editor into a reusable inspector
 * surface for app editors.
 */
export { createHudPropertySheet } from "./hud-property-sheet-runtime.js?v=workflow4-inline-editor-25";
