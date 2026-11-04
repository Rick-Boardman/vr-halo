// SPDX-License-Identifier: Apache-2.0
/**
 * Copy text to the clipboard using the best available browser mechanism with optional prompt fallback.
 * Purpose: give runtime apps one shared clipboard helper that prefers the async Clipboard API but still works in older or restricted browser contexts.
 * @param {unknown} text Value coerced to string before copying.
 * @param {object} [options={}] Clipboard fallback configuration.
 * @param {string | null} [options.promptLabel=null] Optional label passed to `window.prompt(...)` when browser clipboard APIs are unavailable.
 * @returns {Promise<boolean>} Resolves to `true` when any clipboard or prompt fallback path succeeds, otherwise `false`.
 * Side effects: may write to the system clipboard, create and focus a temporary textarea element, call `document.execCommand("copy")`, open a browser prompt, and mutate the DOM while the fallback textarea exists.
 */
export async function copyTextToClipboard(text, { promptLabel = null } = {}) {
  const clipboardText = String(text ?? "");

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(clipboardText);
      return true;
    }
  } catch {
    // Fall through to browser-safe fallbacks.
  }

  try {
    if (
      typeof document !== "undefined" &&
      document?.body &&
      typeof document.createElement === "function" &&
      typeof document.execCommand === "function"
    ) {
      const textArea = document.createElement("textarea");
      textArea.value = clipboardText;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textArea);
      return !!ok;
    }
  } catch {
    // Fall through to optional prompt fallback.
  }

  if (promptLabel) {
    try {
      window.prompt(String(promptLabel), clipboardText);
      return true;
    } catch {
      // Fall through to failure.
    }
  }

  return false;
}
