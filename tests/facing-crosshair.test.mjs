import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFacingCrosshairOverlay } from "../src/navigation/facing-crosshair-overlay.js";

// Conduit's and Loom's viewports move the camera without the navigation rig: the mark must stay at the centre of the
// view however the camera got there (owner, 2026-11-08: "When I drag the scene in Conduit, the crosshairs jumps all over").
function centreOf(overlay, camera, scene) {
  overlay.sync();
  const mark = scene.children.find(child => child.isGroup);
  camera.updateMatrixWorld(true);
  const onScreen = mark.position.clone().applyMatrix4(camera.matrixWorldInverse);
  return { mark, onScreen };
}

test("the desktop mark stays at the centre of the view wherever the camera is moved", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const renderer = { xr: { isPresenting: false } };
  const overlay = createFacingCrosshairOverlay({ THREE, renderer, camera, scene, isEnabled: () => true, distance: 3 });
  for (const [position, target] of [[[0, 0, 10], [0, 0, 0]], [[40, 25, -60], [5, 0, 3]], [[-300, 12, 7], [-280, 0, 90]]]) {
    camera.position.set(...position);
    camera.lookAt(...target);
    const { mark, onScreen } = centreOf(overlay, camera, scene);
    assert.ok(Math.abs(onScreen.x) < 1e-6 && Math.abs(onScreen.y) < 1e-6, "centred");
    assert.ok(Math.abs(onScreen.z + 3) < 1e-6, "at its distance ahead of the camera");
    assert.ok(mark.quaternion.angleTo(camera.quaternion) < 1e-6, "facing the viewer");
  }
});

test("the mark follows a camera held in a moving rig", () => {
  const scene = new THREE.Scene();
  const rig = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  rig.add(camera);
  scene.add(rig);
  const overlay = createFacingCrosshairOverlay({ THREE, renderer: { xr: { isPresenting: false } }, camera, scene, isEnabled: () => true, distance: 3 });
  rig.position.set(10, 0, 0);
  rig.rotation.y = 1.1;
  overlay.sync();
  const mark = scene.children.find(child => child.isGroup && child !== rig);
  const world = new THREE.Vector3(0, 0, -3).applyQuaternion(rig.quaternion).add(rig.position);
  assert.ok(mark.position.distanceTo(world) < 1e-6);
});

test("nothing is placed when the mark is turned off, and XR keeps its own update", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const off = createFacingCrosshairOverlay({ THREE, renderer: { xr: { isPresenting: false } }, camera, scene, isEnabled: () => false });
  off.sync();
  assert.equal(scene.children.length, 0);
  const xr = createFacingCrosshairOverlay({ THREE, renderer: { xr: { isPresenting: true } }, camera, scene, isEnabled: () => true });
  xr.sync();
  assert.equal(scene.children.length, 0, "sync is for desktop; update() places it in XR");
});
