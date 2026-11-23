// SPDX-License-Identifier: Apache-2.0
/**
 * Convert a browser client-space pointer position into element-local normalized coordinates.
 * Purpose: map viewport pointer coordinates into the shared 0..1 layout space used by runtime hit-testing helpers.
 * @param {number} clientX Pointer x position in browser client pixels.
 * @param {number} clientY Pointer y position in browser client pixels.
 * @param {{ getBoundingClientRect?: (() => { left: number, top: number, width: number, height: number }) | null } | null | undefined} domElement DOM element whose client rectangle defines the normalization bounds.
 * @returns {{ x: number, y: number } | null} Normalized element-local pointer coordinates, or `null` when the inputs are invalid or the element has no client rectangle.
 * Side effects: none; pure coordinate-conversion helper.
 */
export function getNormalizedClientPoint(clientX, clientY, domElement) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const rect = domElement?.getBoundingClientRect?.();
  if (!validClientRect(rect)) return null;

  return {
    // Normalize client pixels into element space with x = (clientX - left) / width
    // and y = (clientY - top) / height so pointer math becomes element-relative.
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function validClientRect(rect) {
  return Number.isFinite(rect?.left) && Number.isFinite(rect?.top) &&
    Number.isFinite(rect?.width) && rect.width > 0 &&
    Number.isFinite(rect?.height) && rect.height > 0;
}

export function projectClientPointToHud(clientX, clientY, domElement, layoutW, layoutH) {
  const point = getNormalizedClientPoint(Number(clientX), Number(clientY), domElement);
  if (!point || !Number.isFinite(layoutW) || layoutW <= 0 ||
      !Number.isFinite(layoutH) || layoutH <= 0) return null;
  return { x: point.x * layoutW, y: point.y * layoutH };
}

export function projectNdcToClient(point, rect) {
  if (!validClientRect(rect) || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  return { x: rect.left + (point.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - (point.y + 1) * 0.5) * rect.height };
}

/**
 * Convert a browser client-space pointer position into WebGL-style normalized device coordinates.
 * Purpose: map browser pointer input into the shared -1..1 NDC space used by runtime raycasting and hover tests.
 * @param {number} clientX Pointer x position in browser client pixels.
 * @param {number} clientY Pointer y position in browser client pixels.
 * @param {{ getBoundingClientRect?: (() => { left: number, top: number, width: number, height: number }) | null } | null | undefined} domElement DOM element whose client rectangle defines the NDC conversion bounds.
 * @returns {{ x: number, y: number } | null} NDC pointer coordinates, or `null` when normalization fails.
 * Side effects: none; pure coordinate-conversion helper.
 */
export function getClientPointNdc(clientX, clientY, domElement) {
  const point = getNormalizedClientPoint(clientX, clientY, domElement);
  if (!point) return null;

  return {
    // NDC remap: x_ndc = 2x - 1 and y_ndc = -(2y - 1). The negative Y flips DOM
    // screen space (top-down) into WebGL clip space where positive Y points upward.
    x: point.x * 2 - 1,
    y: -(point.y * 2 - 1),
  };
}
