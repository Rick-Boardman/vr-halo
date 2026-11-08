import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHudTextEditor } from "../src/hud-text-editor.js";

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
