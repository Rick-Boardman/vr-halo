// SPDX-License-Identifier: Apache-2.0
/**
 * Troika-only text rendering subsystem extracted from hud.js.
 *
 * Owns the TroikaPixelText class, colored-multiline and plain-text helpers,
 * the shared troikaTextInstances registry, and font-parser debug filtering.
 *
 * VR billboard math uses private scratch vectors — no shared mutable state
 * with other VR subsystems.
 *
 * @param {object} deps
 * @param {object} deps.THREE            — three.js namespace
 * @param {object} deps.hud              — HUD state (.plane, .layoutW, .layoutH, .ui, .objects)
 * @param {object} deps.renderer         — WebGL renderer (.xr.isPresenting)
 * @param {number} deps.vrDistance        — VR spherical-shell radius (meters)
 * @param {() => number} deps.vrYawPerScreen    — total yaw span for the full HUD width
 * @param {() => number} deps.vrPitchPerScreen  — total pitch span for the full HUD height
 * @param {() => number} deps.vrMetersPerPxX    — meters-per-pixel in X
 * @param {() => number} deps.vrMetersPerPxY    — meters-per-pixel in Y
 * @param {() => string|null} deps.getDragMode             — current drag mode
 * @param {() => string|null} deps.getDragWindowKey         — key of window being dragged
 * @param {() => boolean}     deps.getVrResizeDragBasisActive — whether VR resize drag basis is active
 * @param {() => string|null} deps.getVrResizeDragKey       — key of window being VR-resized
 * @param {() => object}      deps.getVrResizeDragBasis     — frozen resize-drag basis object
 * @returns {{
 *   TroikaPixelText: Function,
 *   troikaTextInstances: Set,
 *   hideColorLayers: Function,
 *   setColoredMultilineText: Function,
 *   setPlainTextMaybeTroika: Function,
 *   clearPlainTextMaybeTroika: Function,
 *   clearColoredMultilineMaybeTroika: Function,
 * }}
 */
import { Text as TroikaText } from "troika-three-text";
import { normalizeLineEntry } from "./ui-text-layout.js";
import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_BRIGHT_COLOR,
  HUD_TEXT_FONT_URL,
  HUD_TEXT_HEADER_FONT_WEIGHT,
  HUD_TEXT_SDF_GLYPH_SIZE,
  HUD_TEXT_UNICODE_FONTS_URL,
} from "./hud-text-style.js";
import { estimateHudGlyphAdvancePx, HUD_TEXT_ESTIMATE_GAP_PX } from "./text-measurement.js";
import {
  HUD_TEXT_ASCENDER_NUDGE_FACTOR,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_Z_CONTENT_TEXT,
  HUD_Z_SURFACE_FG,
  HUD_Z_WINDOW_BG,
} from "./hud-layout-policy.js";

export function createHudTroikaTextRuntime({
  THREE,
  hud,
  renderer,
  vrDistance,
  vrYawPerScreen,
  vrPitchPerScreen,
  vrMetersPerPxX,
  vrMetersPerPxY,
  getDragMode,
  getDragWindowKey,
  getVrResizeDragBasisActive,
  getVrResizeDragKey,
  getVrResizeDragBasis,
}) {
  // ---- private VR scratch vectors (billboard math) ----
  // Each setText() call recomputes from scratch; no cross-function coupling.
  const _vrDir = new THREE.Vector3();
  const _vrToHead = new THREE.Vector3();
  const _vrUp = new THREE.Vector3();
  const _vrRight = new THREE.Vector3();
  const _vrGravityUpL = new THREE.Vector3(0, 1, 0);
  const _vrBasisMat = new THREE.Matrix4();
  const _vrPlaneQuat = new THREE.Quaternion();

  // ---- module state ----
  let _troikaTextCtor = TroikaText;
  const _troikaTextInstances = new Set();
  let _troikaDebugFilterInstalled = false;

  // ---- internal helpers ----

  function _installTroikaFontParserDebugFilterOnce() {
    if (_troikaDebugFilterInstalled) return;
    _troikaDebugFilterInstalled = true;
    try {
      const orig = console.debug;
      if (typeof orig !== "function") return;
      console.debug = (...args) => {
        try {
          const msg = String(args?.[0] ?? "");
          if (
            msg.includes("unsupported GPOS table LookupType") ||
            msg.includes("unsupported GSUB table LookupType")
          ) {
            return;
          }
        } catch {
          // no-op
        }
        return orig(...args);
      };
    } catch {
      // no-op
    }
  }

  function _ensureTroikaThreeTextLoading() {
    // Troika can emit very noisy debug logs for unsupported font GPOS/GSUB
    // lookup formats. Those are non-fatal for our spike and drown out useful
    // HUD logs, so suppress them.
    _installTroikaFontParserDebugFilterOnce();

    // Troika-only: module is statically imported; keep this as a compatibility no-op.
    try {
      if (!_troikaTextCtor) _troikaTextCtor = TroikaText;
    } catch {
      // no-op
    }
    return Promise.resolve();
  }

  function _setMaterialHudText(mat, depthTest) {
    if (!mat) return;
    try {
      const dt = !!depthTest;
      // IMPORTANT: depthTest/depthWrite do NOT require shader recompiles.
      // Avoid setting needsUpdate for these so we don't induce render-time flicker.
      if (mat.depthTest !== dt) mat.depthTest = dt;
      if (mat.depthWrite !== false) mat.depthWrite = false;

      // NOTE: transparent/toneMapped can affect shader program selection.
      // Only set needsUpdate if these fields actually change.
      let needsUpdate = false;
      if (mat.transparent !== true) {
        mat.transparent = true;
        needsUpdate = true;
      }
      // HUD text should render in UI space without lighting/tonemapping surprises.
      if ("toneMapped" in mat && mat.toneMapped !== false) {
        mat.toneMapped = false;
        needsUpdate = true;
      }
      if (needsUpdate) mat.needsUpdate = true;
    } catch {
      // no-op
    }
  }

  function _setRenderOrderDeep(root, ro) {
    if (!root) return;
    const v = Math.floor(Number(ro));
    if (!Number.isFinite(v)) return;
    try {
      root.renderOrder = v;
    } catch {
      // no-op
    }
    try {
      if (typeof root.traverse === "function") {
        root.traverse((obj) => {
          try {
            obj.renderOrder = v;
          } catch {
            // no-op
          }
        });
      }
    } catch {
      // no-op
    }
  }

  // ---- public helpers ----

  function hideTroikaColorLayers(objs) {
    if (!objs?._troikaColorLayers) return;
    for (const layer of objs._troikaColorLayers.values()) {
      try {
        layer.mesh.visible = false;
      } catch {
        // no-op
      }
    }
  }

  function hideTroikaLineTexts(objs) {
    if (!Array.isArray(objs?._troikaLineTexts)) return;
    for (const lineText of objs._troikaLineTexts) {
      try {
        if (lineText?.mesh) lineText.mesh.visible = false;
      } catch {
        // no-op
      }
    }
  }

  function hideColorLayers(objs) {
    // Legacy helper name; keep for call-site stability.
    // Troika-only: hide colored multiline text helpers without clearing text.
    hideTroikaColorLayers(objs);
    hideTroikaLineTexts(objs);
  }

  function hideLegacyColoredTextMeshes(objs) {
    if (!objs) return;
    for (const key of ["contentText", "tooltipText"]) {
      try {
        if (objs?.[key]?.mesh) objs[key].mesh.visible = false;
      } catch {
        // no-op
      }
    }
  }

  function setPlainTextMaybeTroika({
    pixel,
    text,
    x,
    y,
    dot,
    gap = HUD_TEXT_ESTIMATE_GAP_PX,
    maxWidth = null,
    color = HUD_TEXT_DEFAULT_COLOR,
    zLift = 0,
    renderOrder = null,
    truncateSingleLine = true,
    outlineWidth = 0,
    outlineColor = 0x000000,
    outlineOpacity = 0,
    fontWeight = null,
  }) {
    if (!pixel) return;
    // Troika-only text path.
    _ensureTroikaThreeTextLoading();
    try {
      if (pixel?.mesh) pixel.mesh.visible = true;
    } catch {
      // no-op
    }
    try {
      if (renderOrder != null && typeof pixel?.setRenderOrder === "function") {
        pixel.setRenderOrder(Math.floor(Number(renderOrder)));
      } else if (renderOrder != null && pixel?.mesh) {
        pixel.mesh.renderOrder = Math.floor(Number(renderOrder));
      }
    } catch {
      // no-op
    }
    try {
      pixel?.setZOffset?.(Number(zLift) || 0);
    } catch {
      // no-op
    }
    pixel.setText({
      text,
      x,
      y,
      dot,
      gap,
      maxWidth,
      color: Number(color) >>> 0,
      truncateSingleLine,
      outlineWidth,
      outlineColor,
      outlineOpacity,
      fontWeight,
    });
  }

  function getTroikaColorLayer(objs, hex) {
    _ensureTroikaThreeTextLoading();
    if (!_troikaTextCtor) return null;

    if (!objs._troikaColorLayers) objs._troikaColorLayers = new Map();
    const key = Number(hex) >>> 0;
    if (objs._troikaColorLayers.has(key)) return objs._troikaColorLayers.get(key);

    let layer = null;
    try {
      layer = new TroikaPixelText({ color: key, z: HUD_Z_CONTENT_TEXT, depthTest: false });
    } catch {
      layer = null;
    }
    if (!layer) return null;

    try {
      layer.mesh.userData.hudRoOffset = 31;
    } catch {
      // no-op
    }

    // Optional overrides (used by overlay tooltip layers).
    if (objs && Number.isFinite(objs._colorLayerZOverride)) {
      layer._baseZ = Number(objs._colorLayerZOverride);
      layer.mesh.position.z = layer._baseZ;
    }
    if (objs && Number.isFinite(objs._colorLayerRenderOrderOverride)) {
      layer.setRenderOrder(Math.floor(objs._colorLayerRenderOrderOverride));
    }

    // Ensure correct VR anchoring by inheriting the windowKey.
    try {
      const windowKey =
        objs?._windowKey ??
        objs?.contentText?.mesh?.userData?.windowKey ??
        objs?.titleText?.mesh?.userData?.windowKey ??
        null;
      if (windowKey) layer.mesh.userData.windowKey = windowKey;
    } catch {
      // no-op
    }

    objs._troikaColorLayers.set(key, layer);
    return layer;
  }

  function getTroikaLineText(objs, index, color) {
    _ensureTroikaThreeTextLoading();
    if (!_troikaTextCtor || !objs) return null;

    const resolvedIndex = Math.max(0, Math.floor(Number(index) || 0));
    if (!Array.isArray(objs._troikaLineTexts)) objs._troikaLineTexts = [];

    let lineText = objs._troikaLineTexts[resolvedIndex] ?? null;
    if (!lineText) {
      try {
        lineText = new TroikaPixelText({
          color: Number(color) >>> 0,
          z: HUD_Z_CONTENT_TEXT,
          depthTest: false,
        });
        const windowKey = objs?._windowKey ?? objs?.contentText?.mesh?.userData?.windowKey ?? null;
        if (windowKey) lineText.mesh.userData.windowKey = windowKey;
        lineText.mesh.userData.hudRoOffset = 30;
      } catch {
        lineText = null;
      }
      // Optional overrides (used by overlay tooltip layers). Without these the
      // per-line colored text keeps the default renderOrder (0), which sits
      // BEHIND the overlay tooltip background (renderOrder 9000) and makes the
      // hover-panel text render behind its panel. Mirror getTroikaColorLayer.
      if (lineText && objs && Number.isFinite(objs._colorLayerZOverride)) {
        lineText._baseZ = Number(objs._colorLayerZOverride);
        lineText.mesh.position.z = lineText._baseZ;
      }
      if (lineText && objs && Number.isFinite(objs._colorLayerRenderOrderOverride)) {
        lineText.setRenderOrder(Math.floor(objs._colorLayerRenderOrderOverride));
      }
      objs._troikaLineTexts[resolvedIndex] = lineText;
    }

    try {
      lineText?.setColor?.(Number(color) >>> 0);
    } catch {
      // no-op
    }

    return lineText;
  }

  function destroyTroikaLineText(objs, index) {
    if (!Array.isArray(objs?._troikaLineTexts)) return;
    const resolvedIndex = Math.max(0, Math.floor(Number(index) || 0));
    const lineText = objs._troikaLineTexts[resolvedIndex] ?? null;
    if (!lineText) return;
    try {
      _troikaTextInstances.delete(lineText);
    } catch {
      // no-op
    }
    try {
      lineText._textMesh?.dispose?.();
    } catch {
      // no-op
    }
    try {
      lineText.mesh?.parent?.remove?.(lineText.mesh);
    } catch {
      // no-op
    }
    objs._troikaLineTexts[resolvedIndex] = null;
  }

  function setColoredMultilineText({
    objs,
    entries,
    x,
    y,
    dot,
    maxWidth,
    defaultColor = HUD_TEXT_DEFAULT_COLOR,
    colorRanges = null,
  }) {
    const zLift = objs && Number.isFinite(objs._zLift) ? Number(objs._zLift) : 0;
    const roTextBase =
      objs && Number.isFinite(objs._textRenderOrderBase)
        ? Math.floor(objs._textRenderOrderBase)
        : null;
    const lines = (entries ?? []).map((e) => {
      const normalized = normalizeLineEntry(e, defaultColor);
      if (e && typeof e === "object" && Number.isFinite(e.rowHeightPx)) {
        normalized.rowHeightPx = Number(e.rowHeightPx);
      }
      return normalized;
    });
    const resolvedDefaultColor = Number(defaultColor) >>> 0;
    const hasInlineColorRanges = lines.some((line) => Array.isArray(line?.colorRanges) && line.colorRanges.length > 0);
    const hasInheritedColorRanges = Array.isArray(colorRanges) && colorRanges.length > 0;
    const hasPerLineColors = lines.some((line) => {
      const lineColor = typeof line?.color === "number"
        ? Number(line.color) >>> 0
        : resolvedDefaultColor;
      return lineColor !== resolvedDefaultColor;
    });

    if (hasPerLineColors && !hasInlineColorRanges && !hasInheritedColorRanges) {
      _ensureTroikaThreeTextLoading();
      hideColorLayers(objs);
      hideLegacyColoredTextMeshes(objs);
      try {
        if (objs?._troikaContentText?.mesh) objs._troikaContentText.mesh.visible = false;
      } catch {
        // no-op
      }

      const lineStep = 12 * dot;
      let yCursor = y;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const text = String(line?.text ?? "");
        const lineColor = typeof line?.color === "number"
          ? Number(line.color) >>> 0
          : resolvedDefaultColor;
        const rowH = Number.isFinite(line?.rowHeightPx)
          ? Math.max(1, Math.floor(Number(line.rowHeightPx)))
          : lineStep;
        const existingText = String(objs?._troikaLineTexts?.[index]?._textMesh?.text ?? "");
        if (existingText !== text) {
          destroyTroikaLineText(objs, index);
        }
        const lineText = getTroikaLineText(objs, index, lineColor);
        if (!lineText) {
          yCursor += rowH;
          continue;
        }
        try {
          if (roTextBase != null) lineText.setRenderOrder(roTextBase);
        } catch {
          // no-op
        }
        try {
          lineText.setZOffset(zLift);
        } catch {
          // no-op
        }
        lineText.mesh.visible = text.length > 0;
        lineText.setText({
          text,
          x,
          y: yCursor,
          dot,
          maxWidth,
          color: lineColor,
          truncateSingleLine: false,
        });
        yCursor += rowH;
      }

      if (Array.isArray(objs?._troikaLineTexts)) {
        for (let index = lines.length; index < objs._troikaLineTexts.length; index += 1) {
          try {
            if (objs._troikaLineTexts[index]?.mesh) objs._troikaLineTexts[index].mesh.visible = false;
          } catch {
            // no-op
          }
        }
      }
      return;
    }

    hideTroikaLineTexts(objs);
    const mergedColorRanges = buildMergedColorRanges(lines, colorRanges, defaultColor);

    // Troika-only
    _ensureTroikaThreeTextLoading();
    hideColorLayers(objs);

    const baseLines = lines.map((l) => l.text);

    // Base (defaultColor)
    if (!objs._troikaContentText) {
      try {
        objs._troikaContentText = new TroikaPixelText({
          color: Number(defaultColor) >>> 0,
          z: HUD_Z_CONTENT_TEXT,
          depthTest: false,
        });
        try {
          const windowKey = objs?._windowKey ?? objs?.contentText?.mesh?.userData?.windowKey ?? null;
          if (windowKey) objs._troikaContentText.mesh.userData.windowKey = windowKey;
        } catch {
          // no-op
        }
        try {
          objs._troikaContentText.mesh.userData.hudRoOffset = 30;
        } catch {
          // no-op
        }
      } catch {
        objs._troikaContentText = null;
      }
    }

    if (objs._troikaContentText) {
      objs._troikaContentText.mesh.visible = true;
      hideLegacyColoredTextMeshes(objs);
      if (roTextBase != null) objs._troikaContentText.setRenderOrder(roTextBase);
      try {
        objs._troikaContentText.setZOffset(zLift);
      } catch {
        // no-op
      }
      objs._troikaContentText.setText({
        text: baseLines.join("\n"),
        x,
        y,
        dot,
        maxWidth,
        color: Number(defaultColor) >>> 0,
        colorRanges: mergedColorRanges,
      });
    }

    const colors = new Set();
    _updateColoredTroikaLayers({ objs, lines, colors, defaultColor, x, y, dot, maxWidth, zLift, roTextBase });
  }

  function _updateColoredTroikaLayers({ objs, lines, colors, defaultColor, x, y, dot, maxWidth, zLift, roTextBase }) {
    for (const c of colors) {
      const layer = getTroikaColorLayer(objs, c);
      if (!layer) continue;
      layer.mesh.visible = true;
      try {
        const ro =
          objs && Number.isFinite(objs._colorLayerRenderOrderOverride)
            ? Math.floor(objs._colorLayerRenderOrderOverride)
            : roTextBase != null
              ? roTextBase + 1
              : null;
        if (ro != null) layer.setRenderOrder(ro);
      } catch {
        // no-op
      }
      try {
        layer.setZOffset(zLift);
      } catch {
        // no-op
      }
      const layerLines = lines.map((l) => (l.color === c ? l.text : ""));
      layer.setText({ text: layerLines.join("\n"), x, y, dot, maxWidth });
    }

    // Hide any Troika color layers not used this frame (do NOT clear text;
    // clearing triggers async sync() churn and can cause flicker).
    try {
      if (objs._troikaColorLayers && objs._troikaColorLayers instanceof Map) {
        for (const [k, layer] of objs._troikaColorLayers.entries()) {
          if (!layer?.mesh) continue;
          if (!colors.has(Number(k) >>> 0)) layer.mesh.visible = false;
        }
      }
    } catch {
      // no-op
    }
  }

  function buildMergedColorRanges(lines, inheritedRanges, defaultColor) {
    const syntaxRanges = [];
    let charOffset = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const text = String(line?.text ?? "");
      const lineColor = typeof line?.color === "number"
        ? Number(line.color) >>> 0
        : Number(defaultColor) >>> 0;

      if (text.length > 0 && lineColor !== (Number(defaultColor) >>> 0)) {
        syntaxRanges.push({
          start: charOffset,
          end: charOffset + text.length,
          color: lineColor,
        });
      }

      const lineRanges = Array.isArray(line?.colorRanges) ? line.colorRanges : [];

      for (const range of lineRanges) {
        const start = Math.max(0, Math.min(text.length, Math.floor(Number(range?.start) || 0)));
        const end = Math.max(0, Math.min(text.length, Math.floor(Number(range?.end) || 0)));
        if (end <= start) continue;
        syntaxRanges.push({
          start: charOffset + start,
          end: charOffset + end,
          color: typeof range?.color === "number" ? Number(range.color) >>> 0 : Number(defaultColor) >>> 0,
        });
      }

      charOffset += text.length;
      if (index < lines.length - 1) charOffset += 1;
    }

    const overlayRanges = Array.isArray(inheritedRanges)
      ? inheritedRanges
        .map((range) => ({
          start: Math.max(0, Math.floor(Number(range?.start) || 0)),
          end: Math.max(0, Math.floor(Number(range?.end) || 0)),
          color: typeof range?.color === "number" ? Number(range.color) >>> 0 : Number(defaultColor) >>> 0,
        }))
        .filter((range) => range.end > range.start)
      : [];

    const merged = syntaxRanges.concat(overlayRanges);
    return merged.length ? merged : null;
  }

  function clearPlainTextMaybeTroika(pixel, dot = 2) {
    if (!pixel) return;
    // Troika-only: hide without clearing text (avoids unnecessary sync churn).
    try {
      if (pixel?.mesh) pixel.mesh.visible = false;
    } catch {
      // no-op
    }
  }

  function clearColoredMultilineMaybeTroika(objs, dot = 2) {
    if (!objs) return;
    try {
      hideColorLayers(objs);
    } catch {
      // no-op
    }
    try {
      hideTroikaLineTexts(objs);
    } catch {
      // no-op
    }
    try {
      hideTroikaColorLayers(objs);
    } catch {
      // no-op
    }
    try {
      if (objs?._troikaContentText?.mesh) {
        objs._troikaContentText.mesh.visible = false;
        objs._troikaContentText.setText({ text: "", x: 0, y: 0, dot });
      }
    } catch {
      // no-op
    }
  }

  // ---- TroikaPixelText class ----

  class TroikaPixelText {
    constructor({ color = HUD_TEXT_BRIGHT_COLOR, z = 0.003, depthTest = false, fontWeight = null, fontUrl = undefined, unicodeFontsURL = undefined } = {}) {
      this._baseZ = z;
      this._zOffset = 0;
      this._color = color;
      this._depthTest = !!depthTest;
      this._fontWeight = typeof fontWeight === "string" && fontWeight.trim() ? fontWeight.trim() : null;
      this._fontUrl = fontUrl === undefined
        ? HUD_TEXT_FONT_URL
        : (typeof fontUrl === "string" && fontUrl.trim() ? fontUrl.trim() : null);
      this._unicodeFontsURL = unicodeFontsURL === undefined
        ? HUD_TEXT_UNICODE_FONTS_URL
        : (typeof unicodeFontsURL === "string" && unicodeFontsURL.trim() ? unicodeFontsURL.trim() : null);

      // CRITICAL: Do NOT use THREE.Group here.
      // In three.js, Group.renderOrder becomes "groupOrder" during sorting,
      // and groupOrder is compared *before* renderOrder. If we set a high
      // renderOrder on a Group, its descendants can incorrectly draw above
      // later HUD layers even when their renderOrder appears correct.
      // Use Object3D to avoid that special-case.
      this.mesh = new THREE.Object3D();
      this.mesh.renderOrder = 30;
      this.mesh.frustumCulled = false;
      this.mesh.position.z = z;

      const TextCtor = _troikaTextCtor;
      if (!TextCtor) throw new Error("TroikaPixelText: Text ctor not ready");

      this._textMesh = new TextCtor();
      this._textMesh.text = "";
      this._textMesh.anchorX = "left";
      this._textMesh.anchorY = "top";
      this._textMesh.color = color;
      this._textMesh.fontSize = 14;
      if (this._fontUrl) this._textMesh.font = this._fontUrl;
      if (this._fontWeight) this._textMesh.fontWeight = this._fontWeight;
      if (this._unicodeFontsURL) this._textMesh.unicodeFontsURL = this._unicodeFontsURL;
      this._textMesh.sdfGlyphSize = HUD_TEXT_SDF_GLYPH_SIZE;
      // Keep a stable, HUD-tuned lineHeight so existing layout constants
      // (12*dot) continue to match the perceived line spacing.
      this._textMesh.lineHeight = 12 / 7;

      // IMPORTANT: Troika may replace materials during sync(). Apply no-depth
      // settings now and again after each sync.
      this._applyMaterialSettings();

      this._textMesh.renderOrder = 30;
      this._textMesh.frustumCulled = false;

      this.mesh.add(this._textMesh);
      hud.plane.add(this.mesh);

      try {
        _troikaTextInstances.add(this);
      } catch {
        // no-op
      }

      this._lastSig = "";
      this._vrAnchorCx = null;
      this._vrAnchorCy = null;
    }

    _applyMaterialSettings() {
      try {
        // Troika may create child meshes/materials on sync(). Apply to the root
        // and any descendants so depth behavior is stable.
        const applyToObj = (obj) => {
          if (!obj) return;

          // IMPORTANT: Troika's renderable glyph meshes are descendants.
          // Reassert our invariants at draw time on the actual meshes.
          try {
            if ((obj.isMesh || obj.isInstancedMesh) && !obj.userData?._hudTroikaBeforeRender) {
              const orig = obj.onBeforeRender;
              obj.userData._hudTroikaBeforeRender = true;
              obj.onBeforeRender = (...args) => {
                let r;
                try {
                  if (typeof orig === "function") r = orig.apply(obj, args);
                } catch {
                  // no-op
                }
                try {
                  // Keep renderOrder stable even if Troika mutates internals.
                  obj.renderOrder = Math.floor(this.mesh.renderOrder);
                } catch {
                  // no-op
                }
                try {
                  const mat = obj.material;
                  if (Array.isArray(mat)) {
                    for (const m of mat) _setMaterialHudText(m, this._depthTest);
                  } else {
                    _setMaterialHudText(mat, this._depthTest);
                  }
                } catch {
                  // no-op
                }
                return r;
              };
            }
          } catch {
            // no-op
          }

          const mat = obj.material;
          if (Array.isArray(mat)) {
            for (const m of mat) _setMaterialHudText(m, this._depthTest);
          } else {
            _setMaterialHudText(mat, this._depthTest);
          }
          try {
            obj.frustumCulled = false;
          } catch {
            // no-op
          }
        };

        applyToObj(this._textMesh);
        if (typeof this._textMesh?.traverse === "function") {
          this._textMesh.traverse((obj) => applyToObj(obj));
        }
      } catch {
        // no-op
      }
    }

    setRenderOrder(renderOrder) {
      const ro = Number(renderOrder);
      if (!Number.isFinite(ro)) return;
      this.mesh.renderOrder = ro;

      // Troika may render via child meshes, not only the Text object itself.
      // Ensure the entire subtree shares the same renderOrder so window stacking
      // is deterministic (fixes under-window text drawing on top during drag).
      _setRenderOrderDeep(this.mesh, ro);
    }

    setZOffset(zOffset) {
      const v = Number(zOffset);
      this._zOffset = Number.isFinite(v) ? v : 0;
    }

    setColor(hex) {
      const c = Number(hex);
      if (Number.isFinite(c)) {
        this._color = c;
        try {
          this._textMesh.color = c;
        } catch {
          // no-op
        }
      }
    }

    /**
     * Position and render a text label in either desktop or VR mode.
     *
     * Desktop path: scales the mesh to fill the HUD plane in normalized coords.
     *
     * VR path (renderer.xr.isPresenting):
     *   When an anchor mesh is available (the window's bg or title-bar plane),
     *   the text inherits its orientation and derives meters-per-pixel from the
     *   mesh scale, keeping text pinned to the rendered panel even during drag.
     *
     *   Fallback billboard path: computes a roll-locked billboard basis from
     *   spherical coordinates (yaw, pitch) derived from the anchor pixel position.
     *   Uses Gram–Schmidt orthogonalisation against gravity-up (0,1,0) to produce
     *   a right-handed {right, up, toHead} frame, then converts via Matrix4 →
     *   Quaternion. Coordinate convention: +X right, +Y up, −Z into screen
     *   (three.js default camera convention).
     *
     * @param {object} opts
     * @param {string} opts.text       — text content to render
     * @param {number} opts.x          — left edge in layout-px
     * @param {number} opts.y          — top edge in layout-px
     * @param {number} [opts.dot=4]    — glyph dot size
     * @param {number} [opts.gap]      — inter-glyph gap (px)
     * @param {number} [opts.color]    — override color (hex int)
     * @param {number|null} [opts.maxWidth] — wrapping width (layout-px)
    * @param {Array|null} [opts.colorRanges] — per-char color ranges
    * @param {boolean} [opts.truncateSingleLine=true] — whether single-line text should be truncated to fit maxWidth.
     */
      setText({ text, x, y, dot = 4, gap = HUD_TEXT_ESTIMATE_GAP_PX, color, maxWidth = null, colorRanges = null, truncateSingleLine = true, outlineWidth = 0, outlineColor = 0x000000, outlineOpacity = 0, fontWeight = null }) {
      if (typeof color === "number") this.setColor(color);
      try {
        const ow = Number(outlineWidth);
        this._textMesh.outlineWidth = Number.isFinite(ow) && ow > 0 ? ow : 0;
        this._textMesh.outlineColor = Number(outlineColor) >>> 0;
        const oo = Number(outlineOpacity);
        this._textMesh.outlineOpacity = Number.isFinite(oo) ? oo : 0;
      } catch {
        // no-op
      }
      try {
        if (typeof fontWeight === "string" && fontWeight.trim()) {
          this._textMesh.fontWeight = fontWeight.trim();
        } else if (this._fontWeight) {
          this._textMesh.fontWeight = this._fontWeight;
        }
      } catch {
        // no-op
      }

      // Troika's font metrics include ascenders above the visible cap-height, which
      // can make top-anchored text appear shifted down. Nudge up in proportion to
      // fontSize to keep HUD alignment stable.
      const fontSize = 7 * dot;
      const topNudge = fontSize * HUD_TEXT_ASCENDER_NUDGE_FACTOR;

      // Match legacy VR billboard math so text stays stable relative to panels.
      if (renderer.xr.isPresenting) {
        const key = this.mesh?.userData?.windowKey;
        const role = String(this.mesh?.userData?.hudRole || "");
        const win = key
          ? hud.ui?.windows?.[key] ?? hud.ui?._vrVirtualWindows?.[key]
          : null;

        const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;
        const winH = win ? (win.collapsed ? titleH : win.h) : 0;

        let anchorCx = win ? win.x + win.w / 2 : x;
        let anchorCy = win ? win.y + winH / 2 : y;
        if (
          key &&
          getDragMode() === "resize" &&
          getDragWindowKey() === key &&
          getVrResizeDragBasisActive() &&
          getVrResizeDragKey() === key
        ) {
          const basis = getVrResizeDragBasis();
          const fx = Number(basis.winCx);
          const fy = Number(basis.winCy);
          if (Number.isFinite(fx)) anchorCx = fx;
          if (Number.isFinite(fy)) anchorCy = fy;
        }

        // IMPORTANT:
        // Derive the billboard basis from the actual window mesh when available.
        // This guarantees text cannot diverge from the panel during VR drag/resize,
        // even when other paths (e.g. frozen resize basis or theoretical picking)
        // are in play.
        let objs = key ? hud.objects?.windows?.[key] : null;
        if (!objs && key === "__tooltip") {
          const overlay = hud.objects?.overlay ?? null;
          if (overlay?.tooltipBg) {
            objs = {
              bg: overlay.tooltipBg,
            };
          }
        } else if (!objs && key === "__menu") {
          const overlay = hud.objects?.overlay ?? null;
          if (overlay?.menuBg) {
            objs = {
              bg: overlay.menuBg,
            };
          }
        }

        // Prefer anchoring to the exact rendered mesh for the text's "home" plane.
        // Title text is on the title bar plane, not the full window bg.
        let anchorMesh = objs?.bg;
        let anchorBaseZ = HUD_Z_WINDOW_BG;
        let denomX = win ? win.w : null;
        let denomY = win ? (win.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : win.h) : null;

        if (role === "titleText" && objs?.title) {
          anchorMesh = objs.title;
          anchorBaseZ = 0.002;
          denomX = win ? win.w : denomX;
          denomY = HUD_WINDOW_TITLE_HEIGHT_PX;
          if (win) {
            anchorCx = win.x + win.w / 2;
            anchorCy = win.y + 14;
          }
        } else if (role === "minLabel" && objs?.minBtn) {
          anchorMesh = objs.minBtn;
          anchorBaseZ = HUD_Z_SURFACE_FG;
          denomX = HUD_WINDOW_TITLE_HEIGHT_PX;
          denomY = HUD_WINDOW_TITLE_HEIGHT_PX;
          if (win) {
            const closeSlot = objs.closeBtn ? 2 : 1;
            anchorCx = win.x + win.w - HUD_WINDOW_TITLE_HEIGHT_PX * closeSlot + 14;
            anchorCy = win.y + 14;
          }
        } else if (role === "closeLabel" && objs?.closeBtn) {
          anchorMesh = objs.closeBtn;
          anchorBaseZ = HUD_Z_SURFACE_FG;
          denomX = HUD_WINDOW_TITLE_HEIGHT_PX;
          denomY = HUD_WINDOW_TITLE_HEIGHT_PX;
          if (win) {
            anchorCx = win.x + win.w - HUD_WINDOW_TITLE_HEIGHT_PX + 14;
            anchorCy = win.y + 14;
          }
        } else if (role === "actionLabel" && objs?.actionBtn) {
          anchorMesh = objs.actionBtn;
          anchorBaseZ = HUD_Z_SURFACE_FG;
          denomX = HUD_WINDOW_TITLE_HEIGHT_PX;
          denomY = HUD_WINDOW_TITLE_HEIGHT_PX;
          if (win) {
            const actionBtnCount = (objs.closeBtn ? 1 : 0) + (objs.minBtn ? 1 : 0) + 1;
            anchorCx = win.x + win.w - HUD_WINDOW_TITLE_HEIGHT_PX * actionBtnCount + 14;
            anchorCy = win.y + 14;
          }
        }

        const canUseAnchorMesh =
          !!win &&
          !!anchorMesh &&
          anchorMesh.isObject3D &&
          Number.isFinite(anchorMesh?.scale?.x) &&
          Number.isFinite(anchorMesh?.scale?.y) &&
          Number.isFinite(denomX) &&
          Number.isFinite(denomY);

        if (canUseAnchorMesh) {
          const mppX = anchorMesh.scale.x / Math.max(1, denomX);
          const mppY = anchorMesh.scale.y / Math.max(1, denomY);

          // Align to the exact rendered plane (orientation + center)
          // and then offset along the plane normal to the desired local z.
          this.mesh.position.copy(anchorMesh.position);
          this.mesh.quaternion.copy(anchorMesh.quaternion);

          // Offset toward the head by the difference between this text layer's
          // base z and the anchor plane base z.
          // NOTE: Focus lift (zOffset) cancels out because it is applied to both.
          const dzLocal = (Number(this._baseZ) || 0) - Number(anchorBaseZ || 0);
          if (Number.isFinite(dzLocal) && Math.abs(dzLocal) > 1e-8) {
            _vrToHead.set(0, 0, 1).applyQuaternion(anchorMesh.quaternion).normalize();
            this.mesh.position.addScaledVector(_vrToHead, dzLocal);
          }

          this.mesh.scale.set(
            (Number.isFinite(mppX) ? mppX : vrMetersPerPxX()) * 0.95,
            (Number.isFinite(mppY) ? mppY : vrMetersPerPxY()) * 0.95,
            1
          );
        } else {
          // Fallback billboard: spherical yaw/pitch → roll-locked basis.
          // yaw = horizontal angle from center; pitch = vertical angle from center.
          const yaw = (anchorCx / hud.layoutW - 0.5) * vrYawPerScreen();
          const pitch = (0.5 - anchorCy / hud.layoutH) * vrPitchPerScreen();

          // Direction vector from origin toward the billboard position on the
          // spherical shell. Convention: −Z is forward, +Y is up.
          _vrDir
            .set(
              Math.sin(yaw) * Math.cos(pitch),
              Math.sin(pitch),
              -Math.cos(yaw) * Math.cos(pitch)
            )
            .normalize();

          const vrZ = Number(win?.vrZ ?? 0);
          const dz = Number.isFinite(vrZ) ? vrZ : 0;
          const zLocal = this._baseZ + (Number(this._zOffset) || 0);
          const radius = Math.max(0.12, vrDistance - (dz + zLocal));

          // toHead = unit vector from billboard back toward the camera origin.
          _vrToHead.copy(_vrDir).multiplyScalar(-1).normalize();

          // Gram–Schmidt: project gravity-up onto the plane perpendicular to
          // toHead, yielding the billboard's local "up" axis.
          _vrUp.copy(_vrGravityUpL);
          _vrUp.addScaledVector(_vrToHead, -_vrUp.dot(_vrToHead));
          if (_vrUp.lengthSq() < 1e-6) {
            _vrUp.set(0, 1, 0);
            _vrUp.addScaledVector(_vrToHead, -_vrUp.dot(_vrToHead));
          }
          _vrUp.normalize();
          // right = up × toHead (right-handed frame).
          _vrRight.crossVectors(_vrUp, _vrToHead).normalize();
          // Re-orthogonalise up to remove floating-point drift.
          _vrUp.crossVectors(_vrToHead, _vrRight).normalize();

          // Construct rotation matrix from {right, up, toHead} then extract quaternion.
          _vrBasisMat.makeBasis(_vrRight, _vrUp, _vrToHead);
          _vrPlaneQuat.setFromRotationMatrix(_vrBasisMat);

          // Billboard quaternion (roll-locked).
          this.mesh.quaternion.copy(_vrPlaneQuat);
          this.mesh.position.copy(_vrDir).multiplyScalar(radius);
          this.mesh.scale.set(
            vrMetersPerPxX() * 0.95,
            vrMetersPerPxY() * 0.95,
            1
          );
        }

        this._vrAnchorCx = anchorCx;
        this._vrAnchorCy = anchorCy;

        // Position text in "px units" relative to the anchor, then rely on
        // group scaling to convert px->meters.
        this._textMesh.position.set(x - anchorCx, anchorCy - y + topNudge, 0);
      } else {
        this.mesh.quaternion.identity();
        this.mesh.position.set(0, 0, this._baseZ + (Number(this._zOffset) || 0));
        this.mesh.scale.set(1 / hud.layoutW, 1 / hud.layoutH, 1);
        this._vrAnchorCx = null;
        this._vrAnchorCy = null;

        // Convert layout px to centered px coords (0,0 at center) and rely on
        // group scaling to map to HUD plane normalized space.
        this._textMesh.position.set(
          x - hud.layoutW * 0.5,
          hud.layoutH * 0.5 - y + topNudge,
          0
        );
      }

      const rawText = String(text ?? "");
      const normalizedText = rawText.trim().length === 0 ? "" : rawText;
      const isMultiline = normalizedText.includes("\n");

      // For single-line labels (titlebar, buttons), preserve legacy truncation
      // behavior to avoid wrapping into multiple lines.
      let finalText = normalizedText;
      const mw = maxWidth != null ? Number(maxWidth) : null;
      if (truncateSingleLine && !isMultiline && mw != null && Number.isFinite(mw)) {
        const perChar = estimateHudGlyphAdvancePx(dot, gap);
        const maxChars = Math.max(0, Math.floor((mw + gap) / Math.max(1, perChar)));
        if (finalText.length > maxChars) finalText = finalText.slice(0, maxChars);
      }

      // Use Troika layout for multiline text so width is respected regardless
      // of font metrics (prevents mission/list lines from overflowing panels).
      const wantWrap = isMultiline && mw != null && Number.isFinite(mw);
      try {
        this._textMesh.whiteSpace = wantWrap ? "pre-wrap" : "nowrap";
      } catch {
        // no-op
      }
      try {
        this._textMesh.overflowWrap = wantWrap ? "break-word" : "normal";
      } catch {
        // no-op
      }
      try {
        // Troika measures in local units; our local units are "px" (via group scaling).
        this._textMesh.maxWidth = wantWrap ? Math.max(0, mw) : Infinity;
      } catch {
        // no-op
      }

      // Hard clip to content width so no glyph can render past the boundary,
      // even if font metrics differ from our width estimates.
      try {
        if (mw != null && Number.isFinite(mw) && mw > 0) {
          this._textMesh.clipRect = [-10, -100000, mw, 100];
        } else {
          this._textMesh.clipRect = null;
        }
      } catch {
        // no-op
      }

      let crKey = "-";
      try {
        if (Array.isArray(colorRanges) && colorRanges.length) {
          crKey = colorRanges
            .map((r) => {
              const s = Math.max(0, Math.floor(Number(r?.start) || 0));
              const e = Math.max(0, Math.floor(Number(r?.end) || 0));
              const c = Number(r?.color) >>> 0;
              return `${s}:${e}:${c}`;
            })
            .join(",");
        }
      } catch {
        crKey = "-";
      }

      const sig = `${finalText}|${fontSize}|${this._color}|${wantWrap ? Math.floor(mw) : "-"}|cr:${crKey}`;
      if (sig !== this._lastSig) {
        this._lastSig = sig;
        this._textMesh.text = finalText;
        this._textMesh.fontSize = fontSize;
        this._textMesh.sdfGlyphSize = HUD_TEXT_SDF_GLYPH_SIZE;
        this._textMesh.color = this._color;
        try {
          this._textMesh.colorRanges =
            Array.isArray(colorRanges) && colorRanges.length ? colorRanges : null;
        } catch {
          // no-op
        }
        try {
          const p = this._textMesh.sync();
          if (p && typeof p.then === "function") {
            p.then(() => {
              try {
                this._applyMaterialSettings();
                // Some Troika updates can reset/replace internal meshes.
                // Re-assert renderOrder for the full subtree.
                if (Number.isFinite(this.mesh?.renderOrder)) {
                  _setRenderOrderDeep(this._textMesh, this.mesh.renderOrder);
                }
              } catch {
                // no-op
              }
            });
          } else {
            this._applyMaterialSettings();
          }
        } catch {
          // no-op
        }
      }
    }
  }

  return {
    TroikaPixelText,
    troikaTextInstances: _troikaTextInstances,
    hideColorLayers,
    setColoredMultilineText,
    setPlainTextMaybeTroika,
    clearPlainTextMaybeTroika,
    clearColoredMultilineMaybeTroika,
  };
}
