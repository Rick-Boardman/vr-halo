// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createHudXrSceneDepthRuntime } from "../src/hud-xr-scene-depth-runtime.js";

function setup({ presenting = true, windows = {} } = {}) {
  const renderer = { xr: { isPresenting: presenting } };
  const root = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }));
  const keepsDepth = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ depthTest: true }));
  root.add(panel, keepsDepth);
  const hud = { root, ui: { order: Object.keys(windows), windows } };
  return { renderer, hud, panel, keepsDepth, runtime: createHudXrSceneDepthRuntime({ hud, renderer, vrDistance: 4.2 }) };
}

test("in a headset HUD materials test the scene's depth, and get their own setting back afterwards", () => {
  const { renderer, panel, keepsDepth, runtime } = setup();
  runtime.syncHudDepth();
  assert.equal(panel.material.depthTest, true);
  assert.equal(panel.material.depthWrite, false);
  assert.equal(keepsDepth.material.depthTest, true);
  renderer.xr.isPresenting = false;
  runtime.syncHudDepth();
  assert.equal(panel.material.depthTest, false);
  assert.equal(keepsDepth.material.depthTest, true);
});

test("on the desktop the HUD keeps drawing over the scene", () => {
  const { panel, runtime } = setup({ presenting: false });
  runtime.syncHudDepth();
  assert.equal(panel.material.depthTest, false);
});

test("a ray leaves the HUD to scene content nearer than the panel it reaches, in a headset only", () => {
  const { renderer, runtime } = setup();
  const o = new THREE.Vector3(), d = new THREE.Vector3(0, 0, -1);
  assert.equal(runtime.sceneIsNearerAlongRay(o, d, 4.2), false, "no scene test: the HUD keeps the ray");
  runtime.setXrSceneRayTest(() => 3);
  assert.equal(runtime.sceneIsNearerAlongRay(o, d, 4.2), true);
  assert.equal(runtime.sceneIsNearerAlongRay(o, d, 2.5), false, "scene behind the panel");
  runtime.setXrSceneRayTest(() => null);
  assert.equal(runtime.sceneIsNearerAlongRay(o, d, 4.2), false, "nothing in the scene on that ray");
  runtime.setXrSceneRayTest(() => 3);
  renderer.xr.isPresenting = false;
  assert.equal(runtime.sceneIsNearerAlongRay(o, d, 4.2), false, "desktop keeps its own rules");
  assert.throws(() => runtime.setXrSceneRayTest(42), /function or null/);
});

test("the focus distance is in front of every visible panel", () => {
  const near = { y: 10, vrZ: 1.2 }, hidden = { y: -5000, vrZ: 2.4 }, far = { y: 10, vrZ: 0 };
  const { runtime } = setup({ windows: { near, hidden, far } });
  assert.ok(Math.abs(runtime.getXrFocusDistance() - (4.2 - 1.2 - 0.002 - 0.5)) < 1e-9);
  const { runtime: none } = setup();
  assert.equal(none.getXrFocusDistance(), 3.7);
  const { runtime: pushed } = setup({ windows: { close: { y: 0, vrZ: 4 } } });
  assert.equal(pushed.getXrFocusDistance(), 1.25, "a panel is never nearer than the minimum radius");
});

test("the focus distance measures shown panels where they are drawn, from the given point", () => {
  const hitAt = (x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1)); m.position.set(x, y, z); m.updateMatrixWorld(true); return m; };
  const windows = { a: { y: 0 }, b: { y: 0 }, gone: { y: -5000 } };
  const hud = { root: new THREE.Group(), ui: { order: ["a", "b", "gone"], windows },
    objects: { windows: { a: { hit: hitAt(0, 1.6, -3) }, b: { hit: hitAt(0, 1.6, -4) }, gone: { hit: hitAt(0, 1.6, -1) } } } };
  const runtime = createHudXrSceneDepthRuntime({ hud, renderer: { xr: { isPresenting: true } }, vrDistance: 4.2,
    getHeadPosition: () => new THREE.Vector3(0, 1.6, 0) });
  assert.ok(Math.abs(runtime.getXrFocusDistance() - 2.5) < 1e-9, "from the head: nearest panel 3 m, less the margin");
  assert.ok(Math.abs(runtime.getXrFocusDistance({ from: new THREE.Vector3(0, 1.6, -1) }) - 1.5) < 1e-9, "from a point a meter in front");
});
