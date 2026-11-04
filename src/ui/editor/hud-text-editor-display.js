// SPDX-License-Identifier: Apache-2.0
import { HUD_TEXT_DEFAULT_COLOR, HUD_TEXT_MUTED_COLOR } from "../../hud-text-style.js";

const HUD_TEXT_EDITOR_GUTTER_COLOR = HUD_TEXT_MUTED_COLOR;
const HUD_TEXT_EDITOR_JSON_KEY_COLOR = 0x53b3cb;
const HUD_TEXT_EDITOR_STRING_COLOR = 0x69c084;
const HUD_TEXT_EDITOR_NUMBER_COLOR = 0xe7c25a;
const HUD_TEXT_EDITOR_LITERAL_COLOR = 0xe88d73;
const HUD_TEXT_EDITOR_COMMENT_COLOR = 0x8899aa;
const HUD_TEXT_EDITOR_PUNCT_COLOR = 0xa7b5c7;
const HUD_TEXT_EDITOR_KEYWORD_COLOR = 0xc98aff;
const HUD_TEXT_EDITOR_FUNCTION_COLOR = 0x7ccbe8;

const HUD_TEXT_EDITOR_JAVASCRIPT_KEYWORDS = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
  "do", "else", "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof",
  "let", "new", "return", "switch", "throw", "try", "typeof", "var", "void", "while", "with", "yield",
  "true", "false", "null", "undefined",
]);

const HUD_TEXT_EDITOR_PYTHON_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else",
  "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None",
  "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
]);

function pushColorRange(ranges, start, end, color) {
  const lo = Math.max(0, Math.floor(Number(start) || 0));
  const hi = Math.max(0, Math.floor(Number(end) || 0));
  if (!Array.isArray(ranges) || hi <= lo || typeof color !== "number") return;
  ranges.push({ start: lo, end: hi, color: Number(color) >>> 0 });
}

function rangeOverlaps(ranges, start, end) {
  const lo = Math.max(0, Math.floor(Number(start) || 0));
  const hi = Math.max(0, Math.floor(Number(end) || 0));
  return Array.isArray(ranges) && ranges.some((range) => hi > range.start && lo < range.end);
}

export function normalizeHudTextEditorDisplayMode(value) {
  return String(value ?? "plain").trim().toLowerCase() === "structured" ? "structured" : "plain";
}

export function normalizeHudTextEditorLanguage(value, lines) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "json" || normalized === "javascript" || normalized === "python") return normalized;
  const joined = Array.isArray(lines) ? lines.join("\n").trim() : "";
  if (joined.startsWith("{") || joined.startsWith("[")) return "json";
  return "plain";
}

function collectQuotedRanges(line, quoteChars) {
  const ranges = [];
  const allowedQuotes = new Set(Array.isArray(quoteChars) ? quoteChars : ["\"", "'"]);
  let activeQuote = null;
  let start = -1;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const glyph = line[index];
    if (!activeQuote) {
      if (allowedQuotes.has(glyph)) {
        activeQuote = glyph;
        start = index;
        escaped = false;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (glyph === "\\") {
      escaped = true;
      continue;
    }
    if (glyph === activeQuote) {
      ranges.push({ start, end: index + 1 });
      activeQuote = null;
      start = -1;
      escaped = false;
    }
  }

  if (activeQuote && start >= 0) {
    ranges.push({ start, end: line.length });
  }

  return ranges;
}

function findCommentStart(line, language, stringRanges) {
  const insideString = (index) => stringRanges.some((range) => index >= range.start && index < range.end);

  if (language === "python") {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === "#" && !insideString(index)) return index;
    }
    return -1;
  }

  for (let index = 0; index < line.length - 1; index += 1) {
    if (line[index] === "/" && line[index + 1] === "/" && !insideString(index)) {
      return index;
    }
  }
  return -1;
}

function buildJsonColorRanges(line, offset) {
  const ranges = [];
  const stringRanges = collectQuotedRanges(line, ["\""]);
  for (const range of stringRanges) {
    const suffix = line.slice(range.end);
    const color = /^\s*:/.test(suffix) ? HUD_TEXT_EDITOR_JSON_KEY_COLOR : HUD_TEXT_EDITOR_STRING_COLOR;
    pushColorRange(ranges, offset + range.start, offset + range.end, color);
  }

  const tokenPatterns = [
    { regex: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, color: HUD_TEXT_EDITOR_NUMBER_COLOR },
    { regex: /\b(?:true|false|null)\b/g, color: HUD_TEXT_EDITOR_LITERAL_COLOR },
    { regex: /[{}\[\],:]/g, color: HUD_TEXT_EDITOR_PUNCT_COLOR },
  ];

  for (const { regex, color } of tokenPatterns) {
    regex.lastIndex = 0;
    let match = regex.exec(line);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (!rangeOverlaps(ranges, offset + start, offset + end)) {
        pushColorRange(ranges, offset + start, offset + end, color);
      }
      match = regex.exec(line);
    }
  }

  return ranges;
}

function buildCodeColorRanges(line, offset, { language }) {
  const ranges = [];
  const stringRanges = collectQuotedRanges(line, language === "javascript" ? ["\"", "'", "`"] : ["\"", "'"]);
  for (const range of stringRanges) {
    pushColorRange(ranges, offset + range.start, offset + range.end, HUD_TEXT_EDITOR_STRING_COLOR);
  }

  const commentStart = findCommentStart(line, language, stringRanges);
  const commentLimit = commentStart >= 0 ? commentStart : line.length;
  if (commentStart >= 0) {
    pushColorRange(ranges, offset + commentStart, offset + line.length, HUD_TEXT_EDITOR_COMMENT_COLOR);
  }

  const keywordSet = language === "python" ? HUD_TEXT_EDITOR_PYTHON_KEYWORDS : HUD_TEXT_EDITOR_JAVASCRIPT_KEYWORDS;
  const wordRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  let wordMatch = wordRegex.exec(line);
  while (wordMatch) {
    const start = wordMatch.index;
    const end = start + wordMatch[0].length;
    const token = wordMatch[0];
    if (end <= commentLimit && !rangeOverlaps(ranges, offset + start, offset + end)) {
      if (keywordSet.has(token)) {
        pushColorRange(ranges, offset + start, offset + end, HUD_TEXT_EDITOR_KEYWORD_COLOR);
      } else {
        const suffix = line.slice(end);
        if (/^\s*\(/.test(suffix)) {
          pushColorRange(ranges, offset + start, offset + end, HUD_TEXT_EDITOR_FUNCTION_COLOR);
        }
      }
    }
    wordMatch = wordRegex.exec(line);
  }

  const numberRegex = /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
  let numberMatch = numberRegex.exec(line);
  while (numberMatch) {
    const start = numberMatch.index;
    const end = start + numberMatch[0].length;
    if (end <= commentLimit && !rangeOverlaps(ranges, offset + start, offset + end)) {
      pushColorRange(ranges, offset + start, offset + end, HUD_TEXT_EDITOR_NUMBER_COLOR);
    }
    numberMatch = numberRegex.exec(line);
  }

  const punctuationRegex = /[{}\[\](),.:]/g;
  let punctuationMatch = punctuationRegex.exec(line);
  while (punctuationMatch) {
    const start = punctuationMatch.index;
    const end = start + punctuationMatch[0].length;
    if (end <= commentLimit && !rangeOverlaps(ranges, offset + start, offset + end)) {
      pushColorRange(ranges, offset + start, offset + end, HUD_TEXT_EDITOR_PUNCT_COLOR);
    }
    punctuationMatch = punctuationRegex.exec(line);
  }

  return ranges;
}

function buildStructuredColorRanges(line, offset, language) {
  if (language === "json") {
    return buildJsonColorRanges(line, offset);
  }
  if (language === "javascript" || language === "python") {
    return buildCodeColorRanges(line, offset, { language });
  }
  return [];
}

export function buildHudTextEditorLineEntry(line, lineIndex, lineCount, {
  displayMode = "plain",
  language = "plain",
  showLineNumbers = false,
} = {}) {
  const sourceText = String(line ?? "");
  const displayText = sourceText.length ? sourceText : " ";
  if (displayMode !== "structured") {
    return {
      text: displayText,
      color: HUD_TEXT_DEFAULT_COLOR,
      sourceText,
      displayPrefixLength: 0,
    };
  }

  const digits = Math.max(1, String(Math.max(1, lineCount)).length);
  const prefix = showLineNumbers ? `${String(lineIndex + 1).padStart(digits, " ")} | ` : "";
  const colorRanges = [];
  if (prefix) {
    pushColorRange(colorRanges, 0, prefix.length, HUD_TEXT_EDITOR_GUTTER_COLOR);
  }
  colorRanges.push(...buildStructuredColorRanges(sourceText, prefix.length, language));

  return {
    text: `${prefix}${displayText}`,
    color: HUD_TEXT_DEFAULT_COLOR,
    sourceText,
    displayPrefixLength: prefix.length,
    colorRanges: colorRanges.length ? colorRanges : undefined,
  };
}
