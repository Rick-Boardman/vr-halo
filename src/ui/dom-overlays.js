// SPDX-License-Identifier: Apache-2.0
/**
 * Apply a bag of CSS style values to a DOM element.
 * Purpose: provide a tiny shared helper for overlay modules that need to assign inline DOM styles from plain objects.
 * @param {HTMLElement} element DOM element whose style object should be mutated.
 * @param {Record<string, unknown>} [styles={}] Style entries to assign onto `element.style`.
 * @returns {HTMLElement} The same element after the inline styles are applied.
 * Side effects: mutates the supplied element's inline style properties.
 */
export function applyDomStyles(element, styles = {}) {
  for (const [key, value] of Object.entries(styles)) {
    if (value == null) continue;
    element.style[key] = String(value);
  }
  return element;
}

/**
 * Create and append a configured DOM overlay element.
 * Purpose: build lightweight app-local DOM overlays from a shared helper instead of duplicating element creation boilerplate.
 * @param {object} [options={}] Overlay creation settings.
 * @param {string} [options.tagName="div"] HTML tag name used for the created element.
 * @param {HTMLElement} [options.parent=document.body] Parent element that receives the overlay.
 * @param {Record<string, unknown>} [options.styles={}] Inline styles applied to the created element.
 * @param {string} [options.className=""] Optional class name assigned to the element.
 * @param {unknown} [options.textContent] Optional text content written to the element.
 * @param {unknown} [options.html] Optional HTML string assigned through `innerHTML`.
 * @param {boolean} [options.hidden=false] Whether the overlay should start hidden via `display: none`.
 * @returns {HTMLElement} Newly created overlay element appended to the requested parent.
 * Side effects: creates a DOM element, may set text or innerHTML, mutates inline styles, and appends the element to the DOM.
 */
export function createDomOverlay({
  tagName = "div",
  parent = document.body,
  styles = {},
  className = "",
  textContent,
  html,
  hidden = false,
} = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent != null) element.textContent = String(textContent);
  if (html != null) element.innerHTML = String(html);
  applyDomStyles(element, styles);
  if (hidden) element.style.display = "none";
  parent.appendChild(element);
  return element;
}

/**
 * Show or hide a DOM overlay by toggling its display property.
 * Purpose: centralize the shared visibility convention for lightweight DOM overlays.
 * @param {HTMLElement | null | undefined} element Overlay element to show or hide.
 * @param {boolean} visible Whether the overlay should be visible.
 * @param {string} [displayValue="block"] CSS display value used when the overlay is visible.
 * @returns {void} Does not return a value.
 * Side effects: mutates the supplied element's inline `display` style when the element exists.
 */
export function setDomOverlayVisible(element, visible, displayValue = "block") {
  if (!element) return;
  element.style.display = visible ? displayValue : "none";
}

/**
 * Toggle a DOM overlay between hidden and visible display states.
 * Purpose: provide a shared one-call visibility toggle for lightweight DOM overlays.
 * @param {HTMLElement | null | undefined} element Overlay element to toggle.
 * @param {string} [displayValue="block"] CSS display value used when the overlay becomes visible.
 * @returns {boolean} `true` when the overlay was hidden and is now shown, otherwise `false`.
 * Side effects: reads computed style and mutates the supplied element's inline `display` style when the element exists.
 */
export function toggleDomOverlay(element, displayValue = "block") {
  if (!element) return false;
  const isHidden = element.style.display === "none" || getComputedStyle(element).display === "none";
  setDomOverlayVisible(element, isHidden, displayValue);
  return isHidden;
}

/**
 * Show a DOM overlay for a limited duration before hiding it again.
 * Purpose: support transient overlay messages with a shared timer-based visibility helper.
 * @param {(HTMLElement & { __hudOverlayHideTimer?: ReturnType<typeof setTimeout> }) | null | undefined} element Overlay element to show temporarily.
 * @param {number} [duration=2000] Visible duration in milliseconds before the overlay is hidden again.
 * @param {string} [displayValue="block"] CSS display value used while the overlay is visible.
 * @returns {void} Does not return a value.
 * Side effects: mutates the overlay's inline `display` style, clears any prior hide timer, and schedules a new timeout on the element.
 */
export function showTimedDomOverlay(element, duration = 2000, displayValue = "block") {
  if (!element) return;
  setDomOverlayVisible(element, true, displayValue);
  clearTimeout(element.__hudOverlayHideTimer);
  element.__hudOverlayHideTimer = setTimeout(() => {
    setDomOverlayVisible(element, false, displayValue);
  }, duration);
}
