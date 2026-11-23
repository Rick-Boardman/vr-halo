// SPDX-License-Identifier: Apache-2.0
/** Native, decorative control surfaces; keeps each existing mesh and hit rectangle. */
export function createHudNativeControlTextures(THREE) {
  const textures = new Map();
  const legacy = new WeakMap();
  const css = color => `#${(color >>> 0).toString(16).padStart(6, "0")}`;

  function apply(mesh, glyph, colors) {
    const mat = mesh?.material;
    if (!mat) return;
    if (!colors) {
      const state = legacy.get(mat);
      if (state) {
        mat.map = state.map; mat.color.setHex(state.color); mat.opacity = state.opacity;
        mat.needsUpdate = true; legacy.delete(mat);
      }
      return;
    }
    if (!THREE?.CanvasTexture || typeof document === "undefined") return;
    const { fill, border, ink } = colors;
    const key = [glyph, fill, border, ink].join(":");
    let texture = textures.get(key);
    if (!texture) {
      const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 80;
      const c = canvas.getContext("2d");
      if (!c) return;
      const trim = glyph === "resize" ? 9 : glyph === "close" || glyph === "min" ? 8 : 5;
      c.beginPath();
      const y = glyph === "resize" ? 9 : 5;
      if (typeof c.roundRect === "function") c.roundRect(trim, y, 80 - trim * 2, 80 - y * 2, 11);
      else c.rect(trim, y, 80 - trim * 2, 80 - y * 2);
      c.fillStyle = css(fill); c.fill();
      c.strokeStyle = css(border); c.lineWidth = 4; c.stroke();
      c.strokeStyle = css(ink); c.lineWidth = 8; c.lineCap = "round"; c.lineJoin = "round";
      c.beginPath();
      if (glyph === "close") { c.moveTo(26, 26); c.lineTo(54, 54); c.moveTo(54, 26); c.lineTo(26, 54); }
      if (glyph === "min") { c.moveTo(26, 40); c.lineTo(54, 40); }
      if (glyph === "up") { c.moveTo(24, 46); c.lineTo(40, 29); c.lineTo(56, 46); }
      if (glyph === "down") { c.moveTo(24, 34); c.lineTo(40, 51); c.lineTo(56, 34); }
      if (glyph === "resize") {
        c.lineWidth = 5.5;
        // Inset the traditional stair-step grip instead of filling the tile.
        for (const d of [12, 25, 38]) {
          c.moveTo(59 - d, 59); c.lineTo(59, 59 - d);
        }
      }
      c.stroke();
      if (glyph === "grip") {
        c.fillStyle = css(ink);
        for (const y of [23, 40, 57]) {
          for (const x of [30, 50]) {
            c.beginPath(); c.arc(x, y, 5.8, 0, Math.PI * 2); c.fill();
          }
        }
      }
      texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      textures.set(key, texture);
    }
    if (!legacy.has(mat)) legacy.set(mat, { map: mat.map, color: mat.color.getHex(), opacity: mat.opacity });
    if (mat.map !== texture) { mat.map = texture; mat.needsUpdate = true; }
    mat.color.setHex(0xffffff); mat.opacity = 1;
  }
  return { apply, dispose() { for (const t of textures.values()) t.dispose(); textures.clear(); } };
}
