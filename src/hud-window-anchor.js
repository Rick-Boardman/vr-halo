// SPDX-License-Identifier: Apache-2.0
/**
 * Where a HUD window sits relative to the viewer. A window is not part of the scene: when the viewer changes size it keeps
 * its place against the nearest edge on each axis (or against the centre, when it is in the middle third).
 */

/** The edge a window is measured from on one axis, and its offset from it. */
export function axisAnchor(position, size, extent) {
  const centre = position + size / 2;
  if (centre < extent / 3) return { edge: "start", offset: position };
  if (centre > (2 * extent) / 3) return { edge: "end", offset: extent - position - size };
  return { edge: "centre", offset: centre - extent / 2 };
}

/** The position that anchor gives in an extent. */
export function axisPlace(anchor, size, extent) {
  if (anchor.edge === "start") return Math.round(anchor.offset);
  if (anchor.edge === "end") return Math.round(extent - anchor.offset - size);
  return Math.round(extent / 2 + anchor.offset - size / 2);
}

/** A saved position, saved in a viewer of another size, in this one. */
export function placeSaved(position, size, savedExtent, extent) {
  if (!(savedExtent > 0) || !(extent > 0)) return position;
  return axisPlace(axisAnchor(position, size, savedExtent), size, extent);
}
