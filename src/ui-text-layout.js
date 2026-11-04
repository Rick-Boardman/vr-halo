// SPDX-License-Identifier: Apache-2.0
// Internal UI text layout helpers (pure, no THREE dependencies).
// Extracted from hud.js for Phase 2 modularization.

import { HUD_TEXT_DEFAULT_COLOR } from "./hud-text-style.js";
import {
  estimateHudGlyphAdvancePx,
  estimateTextWidthPx,
  HUD_TEXT_ESTIMATE_GAP_PX,
} from "./text-measurement.js";

/**
 * Purpose: Normalize a UI text entry into the shared `{ text, color }` shape consumed by the HUD text-layout helpers.
 * @param {string | number | null | undefined | { text?: unknown, color?: number, sourceText?: unknown, displayPrefixLength?: number, colorRanges?: Array<{ start?: number, end?: number, color?: number }> }} entry Raw line entry, either a primitive value or an object with display text plus optional editor metadata.
 * @param {number} [defaultColor] Fallback color applied when the entry does not provide a numeric color. Defaults to HUD_TEXT_DEFAULT_COLOR.
 * @returns {{ text: string, color: number, sourceText?: string, displayPrefixLength?: number, colorRanges?: Array<{ start: number, end: number, color: number }> }} Normalized line entry with string text, a resolved numeric color, and optional editor metadata preserved for the runtime HUD renderer.
 * Side effects: none; pure normalization helper.
 */
export function normalizeLineEntry(entry, defaultColor = HUD_TEXT_DEFAULT_COLOR) {
  if (entry && typeof entry === "object") {
    const colorRanges = Array.isArray(entry.colorRanges)
      ? entry.colorRanges
        .map((range) => ({
          start: Math.max(0, Math.floor(Number(range?.start) || 0)),
          end: Math.max(0, Math.floor(Number(range?.end) || 0)),
          color: typeof range?.color === "number" ? Number(range.color) >>> 0 : defaultColor,
        }))
        .filter((range) => range.end > range.start)
      : undefined;
    const normalized = {
      text: String(entry.text ?? ""),
      color: typeof entry.color === "number" ? entry.color : defaultColor,
    };
    if (entry.sourceText != null) {
      normalized.sourceText = String(entry.sourceText);
    }
    if (Number.isFinite(entry.displayPrefixLength)) {
      normalized.displayPrefixLength = Math.max(0, Math.floor(Number(entry.displayPrefixLength)));
    }
    if (colorRanges?.length) {
      normalized.colorRanges = colorRanges;
    }
    return normalized;
  }
  return { text: String(entry ?? ""), color: defaultColor };
}

function tokenizeWrapRuns(content) {
  const matches = String(content ?? "").match(/\S+\s*|\s+/g);
  return Array.isArray(matches) && matches.length ? matches : [String(content ?? "")];
}

/**
 * Purpose: Wrap a single line of text while preserving its leading indentation on each wrapped continuation line.
 * @param {string | number | null | undefined} line Source line to wrap.
 * @param {number | null | undefined} maxChars Maximum character count allowed per output line. Non-positive values disable wrapping.
 * @returns {string[]} Wrapped line segments that preserve the original indentation prefix.
 * Side effects: none; pure string-wrapping helper.
 */
export function wrapLinePreserveIndent(line, maxChars) {
  const raw = String(line ?? "");
  if (!maxChars || maxChars <= 0) return [raw];
  if (raw.length <= maxChars) return [raw];

  const m = raw.match(/^(\s*)(.*)$/);
  const indent = m?.[1] ?? "";
  const content = m?.[2] ?? raw;

  // If indent itself exceeds maxChars, hard-wrap everything.
  const indentLen = indent.length;
  const usable = Math.max(1, maxChars - indentLen);

  const runs = tokenizeWrapRuns(content);

  const out = [];
  let current = "";

  function pushCurrent() {
    if (current.length) out.push(indent + current.trimEnd());
    current = "";
  }

  for (const run of runs) {
    if (run.length > usable) {
      pushCurrent();
      let rest = run;
      while (rest.length > usable) {
        out.push(indent + rest.slice(0, usable));
        rest = rest.slice(usable);
      }
      current = rest;
      continue;
    }

    const candidate = current + run;
    if (!current.length && run.length <= usable) {
      current = run;
      continue;
    }

    if (candidate.length <= usable) {
      current = candidate;
    } else {
      pushCurrent();
      current = run;
    }
  }

  pushCurrent();
  return out.length ? out : [raw];
}

function wrapSegmentByEstimatedWidth(segment, maxWidth, dot) {
  const raw = String(segment ?? "");
  if (!raw.length || !Number.isFinite(maxWidth) || maxWidth <= 0) return [raw];
  if (estimateTextWidthPx(raw, dot) <= maxWidth) return [raw];

  const out = [];
  let current = "";
  for (const glyph of raw) {
    const candidate = current + glyph;
    if (current.length && estimateTextWidthPx(candidate, dot) > maxWidth) {
      out.push(current);
      current = glyph;
      continue;
    }
    current = candidate;
  }
  if (current.length) out.push(current);
  return out.length ? out : [raw];
}

function wrapLinePreserveIndentByWidth(line, maxWidth, dot) {
  const raw = String(line ?? "");
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [raw];
  if (estimateTextWidthPx(raw, dot) <= maxWidth) return [raw];

  const m = raw.match(/^(\s*)(.*)$/);
  const indent = m?.[1] ?? "";
  const content = m?.[2] ?? raw;
  const indentWidth = estimateTextWidthPx(indent, dot);
  const usableWidth = Math.max(dot, maxWidth - indentWidth);

  const runs = tokenizeWrapRuns(content);

  const out = [];
  let current = "";

  function pushCurrent() {
    if (current.length) out.push(indent + current.trimEnd());
    current = "";
  }

  for (const run of runs) {
    if (estimateTextWidthPx(run, dot) > usableWidth) {
      pushCurrent();
      const parts = wrapSegmentByEstimatedWidth(run, usableWidth, dot);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i < parts.length - 1) {
          out.push(indent + part);
        } else {
          current = part;
        }
      }
      continue;
    }

    const candidate = current + run;
    if (!current.length || estimateTextWidthPx(indent + candidate, dot) <= maxWidth) {
      current = candidate;
    } else {
      pushCurrent();
      current = run;
    }
  }

  pushCurrent();
  return out.length ? out : [raw];
}

/**
 * Purpose: Convert an available text width in pixels into the approximate fixed-width character budget used by the HUD layout helpers.
 * @param {object} options Width-budget inputs.
 * @param {number | null | undefined} options.maxWidth Maximum text width in pixels. `null` or `undefined` disables the character-budget calculation.
 * @param {number} options.dot Base HUD dot size used to derive the fixed-width glyph estimate.
 * @returns {number | null} Maximum number of characters that fit in the requested width, or `null` when no width cap was supplied.
 * Side effects: none; pure sizing helper.
 */
export function calcMaxCharsForWidthPx({ maxWidth, dot }) {
  // HUD glyphs render narrower than the legacy 5*dot estimate; use the
  // shared measured advance so lines do not wrap with obvious spare space.
  const perChar = estimateHudGlyphAdvancePx(dot, HUD_TEXT_ESTIMATE_GAP_PX);
  if (maxWidth == null) return null;
  return Math.max(1, Math.floor(maxWidth / perChar));
}

/**
 * Purpose: Normalize colored UI text entries and wrap them into renderable line records that preserve first-line toggle keys and optional row-action metadata.
 * @param {object} options Entry-wrapping inputs.
 * @param {Array<string | number | null | undefined | { text?: unknown, color?: number, toggleKey?: string | null, hoverText?: string | null, onClick?: Function | null, actionButtonText?: string | null, actionButtonIconTexture?: unknown, actionButtonHoverText?: string | null, actionButtonOnClick?: Function | null, actionButtonWidthPx?: number | null, actionButtonTextColor?: number | null, actionButtonBgColor?: number | null, actionButtonBgOpacity?: number | null }>} [options.entries] Source text entries to normalize and wrap.
 * @param {number} options.dot Base HUD dot size used to estimate character capacity.
 * @param {number | null | undefined} [options.maxWidth] Maximum width in pixels for each wrapped line.
 * @param {number} [options.defaultColor] Fallback color applied to entries that do not provide a numeric color. Defaults to HUD_TEXT_DEFAULT_COLOR.
 * @returns {Array<{ text: string, color: number, toggleKey: string | null, hoverText?: string | null, onClick?: Function | null, actionButtonText?: string | null, actionButtonIconTexture?: unknown, actionButtonHoverText?: string | null, actionButtonOnClick?: Function | null, actionButtonWidthPx?: number | null, actionButtonTextColor?: number | null, actionButtonBgColor?: number | null, actionButtonBgOpacity?: number | null, _wrapCont: boolean }>} Wrapped line entries ready for HUD rendering.
 * Side effects: none; pure normalization and wrapping helper.
 */
export function wrapEntriesToLines({ entries, dot, maxWidth, defaultColor }) {
  const widthBudget = Number.isFinite(maxWidth) ? Number(maxWidth) : null;

  const out = [];
  const orig = entries ?? [];
  for (let entryIndex = 0; entryIndex < orig.length; entryIndex++) {
    const src = orig[entryIndex];
    const l = normalizeLineEntry(src, defaultColor);
    const toggleKey = src && typeof src === "object" ? src.toggleKey ?? null : null;
    const hoverText = src && typeof src === "object" ? src.hoverText ?? null : null;
    const onClick = src && typeof src === "object" && typeof src.onClick === "function"
      ? src.onClick
      : null;
    const rowBgColor =
      src && typeof src === "object" && typeof src.rowBgColor === "number"
        ? src.rowBgColor
        : null;
    const rowBgOpacity =
      src && typeof src === "object" && Number.isFinite(src.rowBgOpacity)
        ? Number(src.rowBgOpacity)
        : null;
    const rowHeightPx =
      src && typeof src === "object" && Number.isFinite(src.rowHeightPx)
        ? Number(src.rowHeightPx)
        : null;
    const actionButtonText =
      src && typeof src === "object" && typeof src.actionButtonText === "string" && src.actionButtonText.trim()
        ? src.actionButtonText.trim()
        : null;
    const actionButtonIconTexture =
      src && typeof src === "object" && src.actionButtonIconTexture != null
        ? src.actionButtonIconTexture
        : null;
    const actionButtonHoverText =
      src && typeof src === "object" && typeof src.actionButtonHoverText === "string" && src.actionButtonHoverText.trim()
        ? src.actionButtonHoverText.trim()
        : null;
    const actionButtonOnClick =
      src && typeof src === "object" && typeof src.actionButtonOnClick === "function"
        ? src.actionButtonOnClick
        : null;
    const actionButtonWidthPx =
      src && typeof src === "object" && Number.isFinite(src.actionButtonWidthPx)
        ? Number(src.actionButtonWidthPx)
        : null;
    const actionButtonTextColor =
      src && typeof src === "object" && typeof src.actionButtonTextColor === "number"
        ? src.actionButtonTextColor
        : null;
    const actionButtonBgColor =
      src && typeof src === "object" && typeof src.actionButtonBgColor === "number"
        ? src.actionButtonBgColor
        : null;
    const actionButtonBgOpacity =
      src && typeof src === "object" && Number.isFinite(src.actionButtonBgOpacity)
        ? Number(src.actionButtonBgOpacity)
        : null;
    const actionButtonSourceText =
      src && typeof src === "object" && src.actionButtonSourceText != null
        ? String(src.actionButtonSourceText)
        : null;
    const actionButtonDisplayPrefixLength =
      src && typeof src === "object" && Number.isFinite(src.actionButtonDisplayPrefixLength)
        ? Math.max(0, Math.floor(Number(src.actionButtonDisplayPrefixLength)))
        : null;
    const actionButtonTextInsetPx =
      src && typeof src === "object" && Number.isFinite(src.actionButtonTextInsetPx)
        ? Number(src.actionButtonTextInsetPx)
        : null;
    const actionButtonIconFitMode =
      src && typeof src === "object" && typeof src.actionButtonIconFitMode === "string" && src.actionButtonIconFitMode.trim()
        ? src.actionButtonIconFitMode.trim()
        : null;
    const actionButtonForceVisible =
      src && typeof src === "object" && src.actionButtonForceVisible === true;
    const reservedActionWidth = actionButtonText || actionButtonIconTexture || actionButtonForceVisible
      ? Math.max(18, Number.isFinite(actionButtonWidthPx) ? Number(actionButtonWidthPx) : 72) + dot * 2
      : 0;
    const entryWidthBudget = widthBudget != null
      ? Math.max(dot, widthBudget - reservedActionWidth)
      : null;
    const parts = entryWidthBudget != null
      ? wrapLinePreserveIndentByWidth(l.text, entryWidthBudget, dot)
      : [l.text];
    for (let i = 0; i < parts.length; i++) {
      out.push({
        text: parts[i],
        color: l.color,
        sourceText: i === 0 && l.sourceText != null ? l.sourceText : undefined,
        displayPrefixLength: i === 0 && Number.isFinite(l.displayPrefixLength)
          ? l.displayPrefixLength
          : undefined,
        toggleKey: i === 0 ? toggleKey : null,
        hoverText,
        onClick,
        actionButtonText: i === 0 ? actionButtonText : null,
        actionButtonIconTexture: i === 0 ? actionButtonIconTexture : null,
        actionButtonHoverText: i === 0 ? actionButtonHoverText : null,
        actionButtonOnClick: i === 0 ? actionButtonOnClick : null,
        actionButtonWidthPx: i === 0 ? actionButtonWidthPx : null,
        actionButtonTextColor: i === 0 ? actionButtonTextColor : null,
        actionButtonBgColor: i === 0 ? actionButtonBgColor : null,
        actionButtonBgOpacity: i === 0 ? actionButtonBgOpacity : null,
        actionButtonSourceText: i === 0 ? actionButtonSourceText : null,
        actionButtonDisplayPrefixLength: i === 0 ? actionButtonDisplayPrefixLength : null,
        actionButtonTextInsetPx: i === 0 ? actionButtonTextInsetPx : null,
        actionButtonIconFitMode: i === 0 ? actionButtonIconFitMode : null,
        actionButtonForceVisible: i === 0 ? actionButtonForceVisible : false,
        rowBgColor,
        rowBgOpacity,
        rowHeightPx: i === 0 ? rowHeightPx : null,
        _wrapCont: i > 0,
      });
    }
  }
  return out;
}

function applyTreeCore({ length, state, getText, buildLeaf, buildNode }) {
  const expanded = state ?? {};
  const out = [];
  const stack = []; // { indent, key, expanded }

  function countIndent(s) {
    const m = String(s ?? "").match(/^(\s*)/);
    return (m?.[1] ?? "").length;
  }

  function makeKey(path, label) {
    const clean = String(label ?? "").trim();
    return path.length ? `${path.join("/")}/${clean}` : clean;
  }

  for (let i = 0; i < length; i++) {
    const raw = getText(i);
    const indent = countIndent(raw);
    const trimmed = raw.trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();

    const hiddenByAncestor = stack.some((node) => node.expanded === false);
    if (hiddenByAncestor) continue;

    const nodeMatch = trimmed.match(/^\[(\+|-)\]\s*(.*)$/);
    if (!nodeMatch) {
      out.push(buildLeaf({ index: i, raw }));
      continue;
    }

    const label = nodeMatch[2] ?? "";
    const path = stack.map((node) => node.key);
    const key = makeKey(path, label);

    let hasChild = false;
    for (let j = i + 1; j < length; j++) {
      const next = getText(j);
      if (!next.trim()) continue;
      const nextIndent = countIndent(next);
      if (nextIndent > indent) hasChild = true;
      break;
    }

    if (hasChild && expanded[key] === undefined) expanded[key] = true;
    const isExpanded = hasChild ? expanded[key] !== false : true;
    const marker = hasChild ? (isExpanded ? "[-]" : "[+]") : "[ ]";
    const prefix = raw.match(/^(\s*)/)?.[1] ?? "";
    const display = `${prefix}${marker} ${label}`;

    out.push(buildNode({ index: i, raw, display, key, hasChild }));
    stack.push({ indent, key, expanded: isExpanded });
  }

  return { out, state: expanded };
}

/**
 * Purpose: Apply the indentation-based tree-expansion model to plain string lines and return the visible lines plus the updated expansion state.
 * @param {object} options Tree-shaping inputs.
 * @param {string[]} options.lines Source lines whose indentation and `[+]` or `[-]` markers define the tree.
 * @param {Record<string, boolean>} [options.state] Existing expansion-state map keyed by the derived node path.
 * @returns {{ lines: Array<{ text: string, toggleKey: string | null }>, state: Record<string, boolean> }} Visible line records and the normalized expansion-state map.
 * Side effects: mutates the supplied `state` object when it needs to seed missing expansion keys for discovered parent nodes.
 */
export function applyTreeToStringLines({ lines, state }) {
  // Simple indentation-based tree:
  // - Nodes are lines whose trimmed text begins with [+] or [-]
  // - Children are subsequent lines with greater indentation
  // - Clicking a node toggles its expanded state
  const result = applyTreeCore({
    length: lines.length,
    state,
    getText: (index) => String(lines[index] ?? ""),
    buildLeaf: ({ raw }) => ({ text: raw, toggleKey: null }),
    buildNode: ({ display, key, hasChild }) => ({
      text: display,
      toggleKey: hasChild ? key : null,
    }),
  });

  return { lines: result.out, state: result.state };
}

/**
 * Purpose: Apply the indentation-based tree-expansion model to colored entry records while preserving per-line colors in the visible output.
 * @param {object} options Tree-shaping inputs.
 * @param {Array<string | number | null | undefined | { text?: unknown, color?: number, toggleKey?: string | null }>} [options.entries] Source entries whose text content defines the tree and whose colors should be preserved.
 * @param {Record<string, boolean>} [options.state] Existing expansion-state map keyed by the derived node path.
 * @param {number} [options.defaultColor] Fallback color applied to entries that do not provide a numeric color. Defaults to HUD_TEXT_DEFAULT_COLOR.
 * @returns {{ entries: Array<{ text: string, color: number, toggleKey: string | null }>, state: Record<string, boolean> }} Visible entry records and the normalized expansion-state map.
 * Side effects: mutates the supplied `state` object when it needs to seed missing expansion keys for discovered parent nodes.
 */
export function applyTreeToEntries({ entries, state, defaultColor = HUD_TEXT_DEFAULT_COLOR }) {
  // Same as applyTreeToStringLines, but preserves per-line colors from entries.
  const normalized = (entries ?? []).map((e) => normalizeLineEntry(e, defaultColor));

  const result = applyTreeCore({
    length: normalized.length,
    state,
    getText: (index) => String(normalized[index]?.text ?? ""),
    buildLeaf: ({ index, raw }) => ({
      text: raw,
      color: Number(normalized[index]?.color ?? defaultColor) >>> 0,
      toggleKey: null,
    }),
    buildNode: ({ index, display, key, hasChild }) => ({
      text: display,
      color: Number(normalized[index]?.color ?? defaultColor) >>> 0,
      toggleKey: hasChild ? key : null,
    }),
  });

  return { entries: result.out, state: result.state };
}
