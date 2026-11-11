import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { startAnimationLoop } from "../src/frame-loop.js";

function fakeRenderer() {
  return {
    callback: null,
    setAnimationLoop(callback) {
      this.callback = callback;
    },
  };
}

test("startAnimationLoop feeds the loop timestamp through THREE.Timer", () => {
  const renderer = fakeRenderer();
  const frames = [];
  startAnimationLoop({ renderer, THREE, onFrame: (payload) => frames.push(payload) });
  const start = performance.now();
  renderer.callback(start + 1000, null);
  renderer.callback(start + 1016, "xr-frame");
  assert.equal(frames.length, 2);
  assert.ok(Math.abs(frames[1].dt - 0.016) < 1e-9, `dt was ${frames[1].dt}`);
  assert.equal(frames[1].timestamp, start + 1016);
  assert.equal(frames[1].frame, "xr-frame");
});

test("startAnimationLoop clamps dt to maxDelta", () => {
  const renderer = fakeRenderer();
  const frames = [];
  startAnimationLoop({ renderer, THREE, maxDelta: 0.05, onFrame: (payload) => frames.push(payload) });
  const start = performance.now();
  renderer.callback(start + 10, null);
  renderer.callback(start + 2010, null);
  assert.equal(frames[1].dt, 0.05);
});

test("startAnimationLoop refuses a namespace without Timer", () => {
  assert.throws(
    () => startAnimationLoop({ renderer: fakeRenderer(), THREE: { Clock: class {} }, onFrame() {} }),
    /missing THREE\.Timer/,
  );
});
