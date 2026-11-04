// SPDX-License-Identifier: Apache-2.0
/**
 * Connect an immersive HUD text editor to Meta Quest Browser's system keyboard.
 * The DOM textarea is an invisible input-method endpoint; the visible editor stays in WebGL.
 */
export function createWebXrSystemKeyboardBridge({
  renderer,
  getValue = () => "",
  onInput = null,
  onDismiss = null,
  documentRef = globalThis.document
} = {}) {
  let field = null;
  let session = null;

  const isSupported = () => renderer?.xr?.isPresenting === true
    && renderer.xr.getSession?.()?.isSystemKeyboardSupported === true;

  function close({ notify = false } = {}) {
    const previous = field;
    field = null;
    if (session) session.removeEventListener?.("end", handleSessionEnd);
    session = null;
    if (previous) {
      previous.removeEventListener?.("input", handleInput);
      previous.removeEventListener?.("blur", handleBlur);
      previous.remove?.();
    }
    if (notify) onDismiss?.();
  }

  function handleInput() {
    if (field) onInput?.(String(field.value ?? ""));
  }
  function handleBlur() {
    close({ notify: true });
  }
  function handleSessionEnd() {
    close({ notify: true });
  }

  function open() {
    if (!isSupported() || !documentRef?.createElement || !documentRef?.body?.appendChild) return false;
    close();
    session = renderer.xr.getSession();
    field = documentRef.createElement("textarea");
    field.setAttribute("aria-label", "Immersive text input");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocomplete", "off");
    field.setAttribute("spellcheck", "false");
    field.value = String(getValue?.() ?? "");
    Object.assign(field.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none"
    });
    field.addEventListener("input", handleInput);
    field.addEventListener("blur", handleBlur);
    session.addEventListener?.("end", handleSessionEnd);
    documentRef.body.appendChild(field);
    field.focus();
    return documentRef.activeElement === field || typeof documentRef.activeElement === "undefined";
  }

  return { open, close, isSupported, isOpen: () => !!field };
}
