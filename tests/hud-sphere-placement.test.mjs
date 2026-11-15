import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHudWorldPointRuntime } from "../src/hud-world-point-runtime.js";
import { createHudPositionRectRuntime } from "../src/hud-position-rect-runtime.js";
import { createHudVrAutoLayoutRuntime } from "../src/hud-vr-auto-layout-runtime.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function geometry(presenting = true) {
  const anchor = new THREE.Group(), root = new THREE.Group();
  anchor.add(root);
  const camera = new THREE.PerspectiveCamera(70, 1.5, 0.05, 200);
  const renderer = { xr: { isPresenting: presenting } };
  const hud = { root, layoutW: 1400, layoutH: 800, ui: { windows: {} } };
  const yawSpan = 2 * Math.atan(8.5 / 2 / 4.4), pitchSpan = 2 * Math.atan(4.86 / 2 / 4.4);
  const project = createHudWorldPointRuntime({ THREE, renderer, camera, hud,
    getVrYawPerScreen: () => yawSpan, getVrPitchPerScreen: () => pitchSpan });
  const placement = createHudPositionRectRuntime({ renderer, hud, titleHeightPx: 28, vrDistance: 4.4,
    getDragMode: () => null, getDragWindowKey: () => null,
    vrYawPerScreen: () => yawSpan, vrPitchPerScreen: () => pitchSpan,
    vrMetersPerPxX: () => 8.5 / hud.layoutW, vrMetersPerPxY: () => 4.86 / hud.layoutH,
    rectToLocalCenter: (x, y, w, h) => ({ lx: (x + w / 2) / hud.layoutW - .5, ly: .5 - (y + h / 2) / hud.layoutH }),
    sizeToLocalScale: (w, h) => ({ sx: w / hud.layoutW, sy: h / hud.layoutH }),
    vrDir: new THREE.Vector3(), vrToHead: new THREE.Vector3(), vrUp: new THREE.Vector3(),
    vrGravityUpL: new THREE.Vector3(0, 1, 0), vrRight: new THREE.Vector3(), vrBasisMat: new THREE.Matrix4(),
  });
  return { anchor, camera, renderer, hud, project, placement, yawSpan, pitchSpan };
}

test("world anchors invert sphere placement through translated and rotated rig/mount ancestry", () => {
  const { anchor, camera, hud, project, yawSpan, pitchSpan } = geometry();
  anchor.position.set(12, 3, -4); anchor.rotation.set(.2, .8, -.1);
  hud.root.position.set(.2, 1.6, .1); hud.root.rotation.y = .3;
  hud.root.updateWorldMatrix(true, false);
  const yaw = -.7, pitch = .25;
  const world = hud.root.localToWorld(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(20));
  const first = project(world);
  near(first.x, hud.layoutW * (.5 + yaw / yawSpan));
  near(first.y, hud.layoutH * (.5 - pitch / pitchSpan));
  camera.rotation.y = Math.PI / 2;
  assert.deepEqual(project(world), first, "physical head turns must not change rig-sphere anchors");
  assert.equal(project(hud.root.getWorldPosition(new THREE.Vector3())), null);
  assert.equal(project({ x: NaN, y: 1, z: 2 }), null);
});

test("custom content coincides with native quads after panel move, depth and mode changes", () => {
  const { hud, renderer, placement } = geometry();
  const win = hud.ui.windows.test = { x: 100, y: 200, w: 340, h: 280, vrZ: .6 };
  const group = new THREE.Group(), child = new THREE.Object3D(), native = new THREE.Object3D();
  hud.root.add(group, native); group.add(child); native.userData.windowKey = "test";
  for (const presenting of [true, false, true]) {
    renderer.xr.isPresenting = presenting;
    for (const [x, y] of [[100, 200], [850, 50]]) {
      win.x = x; win.y = y;
      placement.placeWindowContent(group, "test");
      child.position.set(55, -42, .003);
      placement.positionRect(native, x + 55, y + 42, 0, 0, .003);
      hud.root.updateMatrixWorld(true);
      near(child.getWorldPosition(new THREE.Vector3()).distanceTo(native.getWorldPosition(new THREE.Vector3())), 0);
    }
  }
  win.collapsed = true;
  assert.equal(placement.placeWindowContent(group, "test"), false);
  assert.equal(group.visible, false);
  win.collapsed = false; win.y = -2000;
  assert.equal(placement.placeWindowContent(group, "test"), false);
});

test("VR layout separates actual application heights and wraps collapsed rows without overlap", () => {
  const windows = Object.fromEntries([["xr", 300, 136], ["season", 300, 120], ["population", 300, 140],
    ["resources", 300, 200], ["assignments", 340, 280], ["tileInfo", 300, 280], ["eventLog", 340, 280]]
    .map(([key, w, h]) => [key, { x: 0, y: 0, w, h }]));
  for (let i = 0; i < 4; i++) windows[`closed${i}`] = { x: 0, y: 0, w: 400, h: 300, collapsed: true };
  windows.hidden = { x: 20, y: -2000, w: 300, h: 200 };
  const hud = { layoutW: 1024, layoutH: 640, ui: { windows, order: Object.keys(windows) } };
  createHudVrAutoLayoutRuntime({ hud, clamp: THREE.MathUtils.clamp, markDirty() {}, rightX: 2000,
    outerPaddingPx: 32, interWindowGapXPx: 64, interWindowGapYPx: 48, titleHeightPx: 28 }).autoLayoutWindowsForVr();
  const visible = Object.entries(windows).filter(([, w]) => w.y >= -1000);
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const [ak, a] = visible[i], [bk, b] = visible[j];
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + (a.collapsed ? 28 : a.h), b.y + (b.collapsed ? 28 : b.h)) - Math.max(a.y, b.y);
    assert.ok(overlapX <= 0 || overlapY <= 0, `${ak} overlaps ${bk}`);
  }
  assert.equal(windows.hidden.y, -2000);
  assert.equal(hud.ui._vrAutoLayoutDone, true);
});
