import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

// A fitted view stays fitted when its pane changes size, until someone moves it (owner, 2026-11-08: a workflow in a
// taller, narrower pane was cut off at both sides).
let observed = null;
globalThis.ResizeObserver = class { constructor(callback) { observed = callback; } observe() {} disconnect() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const { createFlatSceneViewportControls } = await import("../src/navigation/flat-scene-viewport-controls.js");

function view(width, height) {
  const listeners = {};
  const dom = { clientWidth: width, clientHeight: height, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: dom.clientWidth, height: dom.clientHeight }), setPointerCapture() {}, releasePointerCapture() {} };
  const camera = new THREE.PerspectiveCamera(60, width / height);
  const rig = { player: new THREE.Object3D() };
  const look = { setYaw() {}, setPitch() {}, applyLook() {} };
  const controls = createFlatSceneViewportControls({ THREE, renderer: { domElement: dom, xr: {} }, camera, rig, look, flatPlane: "xy", minDistance: 1 });
  return { dom, controls, listeners };
}
const wide = new THREE.Box3(new THREE.Vector3(-50, -2, 0), new THREE.Vector3(50, 2, 0));
const resize = (v, width, height) => { v.dom.clientWidth = width; v.dom.clientHeight = height; observed(); };

test("a fit follows the pane when it changes shape", () => {
  const v = view(1600, 800);
  v.controls.fitBounds(wide, { padding: 1.1 });
  const before = v.controls.getDistance();
  resize(v, 800, 1000);
  assert.ok(v.controls.getDistance() > before * 2, "a narrower pane moves back to keep the width in view");
  const aspect = 0.8;
  const halfWidth = Math.tan(Math.PI / 6) * aspect * v.controls.getDistance();
  assert.ok(halfWidth >= 55 - 1e-6, "the whole width is in view");
});

test("once the view is moved it stays where it was put", () => {
  const v = view(1600, 800);
  v.controls.fitBounds(wide);
  v.controls.setDistance(40);
  resize(v, 800, 1000);
  assert.equal(v.controls.getDistance(), 40);
  v.controls.fitBounds(wide);
  v.controls.setTarget(new THREE.Vector3(3, 0, 0));
  const placed = v.controls.getDistance();
  resize(v, 1600, 800);
  assert.equal(v.controls.getDistance(), placed);
  assert.equal(v.controls.getTarget().x, 3);
});

test("an application's offset is kept when the view fits again", () => {
  const v = view(1600, 800);
  v.controls.fitBounds(wide, { shiftX: -0.22 });
  assert.ok(Math.abs(v.controls.getTarget().x - -22) < 1e-6);
  resize(v, 900, 900);
  assert.ok(Math.abs(v.controls.getTarget().x - -22) < 1e-6);
});
