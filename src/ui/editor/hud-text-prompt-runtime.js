// SPDX-License-Identifier: Apache-2.0
import { createHudTextEditor } from "../../hud-text-editor.js?v=workflow4-icon-buttons-1";
import { createHudTextPrompt as createHudTextPromptCore } from "./hud-text-prompt.js?v=workflow4-icon-buttons-2";

/**
 * Create the shared HUD text prompt with the canonical runtime text editor pre-bound.
 * Purpose: provide a browser-runtime entrypoint for in-HUD prompts without exposing Troika-backed editor imports to Node-only tests.
 * @param {object} [options={}] Prompt options forwarded to createHudTextPrompt(...).
 * @returns {ReturnType<typeof createHudTextPromptCore>} HUD-native text prompt controller bound to createHudTextEditor(...).
 * Side effects: see createHudTextPrompt(...); additionally imports the shared Troika-backed HUD text editor for browser runtime usage.
 */
export function createHudTextPrompt(options = {}) {
  return createHudTextPromptCore({
    ...options,
    createTextEditor: options.createTextEditor ?? createHudTextEditor,
  });
}
