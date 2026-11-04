import test from "node:test";
import assert from "node:assert/strict";
import { createWebXrSystemKeyboardBridge } from "../src/webxr-system-keyboard.js";

function harness({ supported = true } = {}) {
  const listeners = new Map();
  const session = {
    isSystemKeyboardSupported: supported,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type)
  };
  const documentRef = {
    activeElement: null,
    body: { appendChild: field => { field.parent = documentRef.body; } },
    createElement: () => {
      const fieldListeners = new Map();
      return {
        style: {}, value: "", setAttribute() {},
        addEventListener: (type, listener) => fieldListeners.set(type, listener),
        removeEventListener: type => fieldListeners.delete(type),
        focus() { documentRef.activeElement = this; },
        remove() { this.removed = true; },
        dispatch(type) { fieldListeners.get(type)?.(); }
      };
    }
  };
  return { renderer: { xr: { isPresenting: true, getSession: () => session } }, session, listeners, documentRef };
}

test("Quest system keyboard bridge synchronizes and removes its DOM endpoint", () => {
  const env = harness();
  const inputs = [];
  let dismissed = 0;
  const bridge = createWebXrSystemKeyboardBridge({
    ...env,
    getValue: () => "existing",
    onInput: value => inputs.push(value),
    onDismiss: () => dismissed += 1
  });
  assert.equal(bridge.open(), true);
  const field = env.documentRef.activeElement;
  assert.equal(field.value, "existing");
  field.value = "replacement";
  field.dispatch("input");
  assert.deepEqual(inputs, ["replacement"]);
  field.dispatch("blur");
  assert.equal(field.removed, true);
  assert.equal(bridge.isOpen(), false);
  assert.equal(dismissed, 1);
});

test("bridge does not create an input for unsupported or nonimmersive sessions", () => {
  const env = harness({ supported: false });
  const bridge = createWebXrSystemKeyboardBridge(env);
  assert.equal(bridge.open(), false);
  env.session.isSystemKeyboardSupported = true;
  env.renderer.xr.isPresenting = false;
  assert.equal(bridge.open(), false);
});
