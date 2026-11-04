// SPDX-License-Identifier: Apache-2.0
import { createHudTextEditor } from "../../hud-text-editor.js?v=workflow4-inline-editor-25";
import { createHudPropertySheet as createHudPropertySheetCore } from "./hud-property-sheet.js?v=workflow4-inline-editor-25";

/**
 * Create the shared HUD property sheet with the canonical runtime text editor
 * pre-bound for text and multiline rows.
 *
 * @param {object} [options={}] Property-sheet options forwarded to createHudPropertySheet(...).
 * @returns {ReturnType<typeof createHudPropertySheetCore>} HUD property-sheet controller bound to createHudTextEditor(...).
 * Side effects: see createHudPropertySheet(...); additionally imports the shared Troika-backed HUD text editor for browser runtime usage.
 */
export function createHudPropertySheet(options = {}) {
  return createHudPropertySheetCore({
    ...options,
    createTextEditor: options.createTextEditor ?? createHudTextEditor,
  });
}
