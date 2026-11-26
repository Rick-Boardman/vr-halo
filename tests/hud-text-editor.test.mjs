import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHudTextEditor } from "../src/hud-text-editor.js";
import { wrapEntriesToLines } from "../src/ui-text-layout.js";
import { toTroikaColorRanges } from "../src/hud-troika-text-runtime.js";

const bus = new EventTarget();

function listenerOptions(opts) {
  if (opts === true) return { capture: true };
  if (opts === false) return { capture: false };
  return opts;
}

globalThis.window = {
  addEventListener: (type, fn, opts) => bus.addEventListener(type, fn, listenerOptions(opts)),
  removeEventListener: (type, fn, opts) => bus.removeEventListener(type, fn, listenerOptions(opts)),
  dispatchEvent: (event) => bus.dispatchEvent(event),
  setInterval,
  clearInterval,
};

function key(name) {
  const event = new Event("keydown", { cancelable: true });
  event.key = name;
  event.preventDefault = () => {};
  window.dispatchEvent(event);
}

function pointer(target, type, x, y, extra = {}) {
  const event = new Event(type);
  event.clientX = x;
  event.clientY = y;
  event.button = extra.button ?? 0;
  event.buttons = extra.buttons ?? 0;
  event.shiftKey = !!extra.shiftKey;
  target.dispatchEvent(event);
}

function harness() {
  const canvas = new EventTarget();
  const domElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
    addEventListener: (type, fn, opts) => canvas.addEventListener(type, fn, listenerOptions(opts)),
    removeEventListener: (type, fn, opts) => canvas.removeEventListener(type, fn, listenerOptions(opts)),
    dispatchEvent: (event) => canvas.dispatchEvent(event),
  };
  const win = {
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    collapsed: false,
    scrollable: true,
    scrollTop: 0,
    _footerReservedHeightPx: 48,
  };
  const hudSystem = {
    hud: {
      layoutW: 800,
      layoutH: 800,
      ui: { windows: { chat: win } },
      objects: { windows: { chat: {} } },
    },
    bringToFront() {},
    setWindowLines() {},
    setWindowTextCaret() {},
    setWindowTextSelection() {},
    setWindowScrollTop(_key, top) {
      win.scrollTop = top;
    },
  };
  return {
    renderer: { domElement, xr: { isPresenting: false } },
    hudSystem,
    clickFooter() {
      pointer(domElement, "mousedown", 40, 280);
      pointer(window, "mouseup", 40, 280);
    },
    clickAt(x, y) {
      pointer(domElement, "mousedown", x, y);
      pointer(window, "mouseup", x, y);
    },
    clickLine() {
      pointer(domElement, "mousedown", 12, 50);
      pointer(window, "mouseup", 12, 50);
    },
    dragLine() {
      pointer(domElement, "mousedown", 12, 50);
      pointer(window, "mousemove", 58, 50, { buttons: 1 });
      pointer(window, "mouseup", 58, 50);
    },
  };
}

describe("hud text editor", { concurrency: false }, () => {
test("a click in the footer field keeps every typed character", () => {
  const env = harness();
  const editor = createHudTextEditor({
    renderer: env.renderer,
    hudSystem: env.hudSystem,
    windowKey: "chat",
    surface: "footer",
    placeholder: "Say something",
  });
  try {
    env.clickFooter();
    key("a");
    key("b");
    key("c");
    assert.equal(editor.getText(), "abc");
  } finally {
    editor.dispose();
  }
});

test("a press on a window drawn over the editor does not focus the editor", () => {
  const env = harness();
  const ui = env.hudSystem.hud.ui;
  ui.windows.palette = { x: 0, y: 30, w: 200, h: 100, collapsed: false };
  ui.order = ["chat", "palette"];
  ui.focus = "palette";
  const fronted = [];
  env.hudSystem.bringToFront = (k) => fronted.push(k);
  const editor = createHudTextEditor({ renderer: env.renderer, hudSystem: env.hudSystem, windowKey: "chat" });
  try {
    env.clickLine();
    key("a");
    assert.equal(editor.getText(), "", "the covered editor took no typing");
    assert.deepEqual(fronted, [], "the covered editor did not lift itself over the palette");
    env.clickAt(300, 50);
    key("b");
    assert.equal(editor.getText(), "b", "a press on the uncovered part still focuses it");
  } finally {
    editor.dispose();
  }
});

test("a click in the window field keeps every typed character", () => {
  const env = harness();
  const editor = createHudTextEditor({
    renderer: env.renderer,
    hudSystem: env.hudSystem,
    windowKey: "chat",
  });
  try {
    env.clickLine();
    key("a");
    key("b");
    assert.equal(editor.getText(), "ab");
  } finally {
    editor.dispose();
  }
});

test("clicks inside and below wrapped content resolve to logical source columns", () => {
  const env = harness();
  const editor = createHudTextEditor({
    renderer: env.renderer,
    hudSystem: env.hudSystem,
    windowKey: "chat",
    wrapLines: true,
    initialText: "abcd efgh  ",
  });
  const { objects, ui } = env.hudSystem.hud;
  objects.windows.chat._visibleLineMeta = [
    { text: "abcd", sourceText: "abcd", sourceRow: 0, sourceStartCol: 0, rowTopPx: 0, rowHeightPx: 16 },
    { text: "efgh", sourceText: "efgh", sourceRow: 0, sourceStartCol: 5, rowTopPx: 16, rowHeightPx: 16 },
  ];
  ui.windows.chat._scrollTotalLines = 2;
  try {
    env.clickAt(11, 63);
    key("Z");
    assert.equal(editor.getText(), "abcd Zefgh  ");
    env.clickAt(12, 160);
    key("!");
    assert.equal(editor.getText(), "abcd Zefgh  !");
  } finally {
    editor.dispose();
  }
});

test("wrapped editor fragments retain source offsets across spaces and copied indentation", () => {
  const source = "  first second second last  ";
  const wrapped = wrapEntriesToLines({
    entries: [{ text: source, sourceText: source, displayPrefixLength: 0 }],
    dot: 2, maxWidth: 90,
  });
  assert.ok(wrapped.length > 1);
  for (const row of wrapped) {
    assert.equal(row.sourceRow, 0);
    assert.equal(source.slice(row.sourceStartCol, row.sourceStartCol + row.sourceText.length), row.sourceText);
    assert.equal(row.text.slice(row.displayPrefixLength), row.sourceText);
  }
  assert.ok(wrapped[1].sourceStartCol > wrapped[0].sourceText.length);
  assert.ok(wrapped[1].displayPrefixLength > 0);
});

test("Troika palette restores previous ink at each selection boundary", () => {
  assert.deepEqual(toTroikaColorRanges([
    { start: 1, end: 6, color: 0x222222 },
    { start: 2, end: 4, color: 0xffffff },
  ], 8, 0x111111), {
    0: 0x111111, 1: 0x222222, 2: 0xffffff, 4: 0x222222, 6: 0x111111,
  });
});

test("typing replaces a dragged selection and leaves the new character", () => {
  const env = harness();
  const editor = createHudTextEditor({
    renderer: env.renderer,
    hudSystem: env.hudSystem,
    windowKey: "chat",
    initialText: "abcd",
  });
  try {
    env.dragLine();
    key("Z");
    assert.equal(editor.getText(), "Z");
  } finally {
    editor.dispose();
  }
});
});
