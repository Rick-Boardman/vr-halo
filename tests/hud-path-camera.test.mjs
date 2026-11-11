import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createHudPathCameraMount,
  createHudPathCameraPanels,
  HUD_PATH_CAMERA_SIDE_YAW_RAD,
} from "../src/hud-path-camera.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function rig({ presenting = true } = {}) {
  const scene = new THREE.Scene();
  const anchor = new THREE.Group();
  anchor.position.set(3, 1.6, -2);
  anchor.rotation.y = 0.4;
  scene.add(anchor);
  const root = new THREE.Group();
  root.position.set(0.1, 0.05, -0.02); // Halo's captured head point in the anchor's frame
  anchor.add(root);
  const renderer = { xr: { isPresenting: presenting } };
  return { scene, anchor, root, renderer, hud: { root } };
}

test("the mount turns the sphere about the captured head point and leaves root coordinates alone", () => {
  const { scene, anchor, root, renderer, hud } = rig();
  const centreBefore = root.getWorldPosition(new THREE.Vector3());
  const mount = createHudPathCameraMount({ THREE, renderer, hud });
  assert.equal(mount.update({ yaw: 0.7, pitch: -0.2 }), true);
  assert.equal(root.parent, mount.mount);
  assert.equal(mount.mount.parent, anchor);
  assert.deepEqual([root.rotation.x, root.rotation.y, root.rotation.z], [0, 0, 0]);
  assert.deepEqual(root.position.toArray(), [0.1, 0.05, -0.02]);
  const centreAfter = root.getWorldPosition(new THREE.Vector3());
  assert.ok(centreAfter.distanceTo(centreBefore) < 1e-9, "sphere centre does not move");
  scene.updateMatrixWorld(true);
});

test("a ray along the look hits the window at the layout centre through root.matrixWorld", () => {
  const { anchor, root, renderer, hud } = rig();
  const mount = createHudPathCameraMount({ THREE, renderer, hud });
  const look = { yaw: 1.1, pitch: 0.15 };
  mount.update(look);
  // A window panel on the sphere, in root-local coordinates, straight ahead of
  // the sphere centre (layout centre): what Halo's pointer would pick.
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial());
  panel.position.set(0, 0, -4.2);
  root.add(panel);
  root.updateMatrixWorld(true);
  // Pointer basis Halo reads: root.matrixWorld.
  const qHud = new THREE.Quaternion().setFromRotationMatrix(root.matrixWorld);
  const origin = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
  // The look in the anchor's frame, taken to world.
  const qAnchor = anchor.getWorldQuaternion(new THREE.Quaternion());
  const qLook = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), look.pitch));
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(qAnchor.clone().multiply(qLook));
  assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(qHud).angleTo(dir) < 1e-6, "root -Z follows the look");
  const hits = new THREE.Raycaster(origin, dir).intersectObject(panel);
  assert.equal(hits.length, 1);
  // The same ray, brought into root-local space the way the VR pointer does,
  // maps back to the layout centre.
  const dirL = dir.clone().applyQuaternion(qHud.clone().invert());
  assert.ok(near(Math.atan2(dirL.x, -dirL.z), 0) && near(Math.asin(dirL.y), 0));
});

test("leaving VR, release and dispose give the root back to its anchor", () => {
  const { anchor, root, renderer, hud } = rig();
  const mount = createHudPathCameraMount({ THREE, renderer, hud });
  mount.update({ yaw: 0.5 });
  renderer.xr.isPresenting = false;
  assert.equal(mount.update({ yaw: 0.5 }), false);
  assert.equal(root.parent, anchor);
  assert.ok(near(mount.mount.quaternion.w, 1));

  // Halo moves the root to the desktop camera on exit; the mount must not take it.
  const camera = new THREE.Group();
  camera.add(root);
  assert.equal(mount.update({ yaw: 0.5 }), false);
  assert.equal(root.parent, camera);

  // Re-entering VR: Halo puts the root back under its VR parent; the mount follows.
  renderer.xr.isPresenting = true;
  anchor.add(root);
  mount.update({ yaw: 0.2 });
  assert.equal(root.parent, mount.mount);
  mount.dispose();
  assert.equal(root.parent, anchor);
  assert.equal(mount.mount.parent, null);
  assert.equal(mount.update({ yaw: 0.2 }), false, "a disposed mount does nothing");
  assert.equal(root.parent, anchor);
});

test("createHudPathCameraMount fails loudly without THREE or a HUD root", () => {
  assert.throws(() => createHudPathCameraMount({ renderer: {}, hud: { root: {} } }), /\[halo:path-camera\]/);
  assert.throws(() => createHudPathCameraMount({ THREE, renderer: {}, hud: {} }), /\[halo:path-camera\]/);
});

function hudSystemWith(windows, { layoutW = 2800, layoutH = 1400 } = {}) {
  let drag = null;
  return {
    hud: { layoutW, layoutH, ui: { windows } },
    getVrYawPerScreen: () => 2 * Math.atan(3.1 / 4.2),
    getVrPitchPerScreen: () => 2 * Math.atan(1.95 / 4.2),
    getDragWindowKey: () => drag,
    setDrag(key) { drag = key; },
  };
}

test("columns stack open windows at their yaw and leave hidden windows untouched", () => {
  const windows = {
    race: { x: 0, y: 0, w: 300, h: 200 },
    help: { x: 0, y: -2000, w: 300, h: 200, _hiddenX: 40, _hiddenY: 60 },
    settings: { x: 0, y: 10, w: 400, h: 300 },
    xr: { x: 2000, y: -2000, w: 240, h: 64 },
  };
  const sys = hudSystemWith(windows);
  const panels = createHudPathCameraPanels({
    hudSystem: sys,
    columns: [
      { yaw: -HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: ["race", "help"] },
      { yaw: HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: ["settings"], showKeys: ["xr"] },
    ],
  });
  panels.place();
  const span = sys.getVrYawPerScreen();
  const leftCx = 2800 * (0.5 - HUD_PATH_CAMERA_SIDE_YAW_RAD / span);
  const rightCx = 2800 * (0.5 + HUD_PATH_CAMERA_SIDE_YAW_RAD / span);
  assert.equal(windows.race.x, Math.round(leftCx - 150));
  assert.equal(windows.race.y, Math.round(700 - 100), "a lone window centres on the look");
  assert.deepEqual(
    [windows.help.x, windows.help.y, windows.help._hiddenX, windows.help._hiddenY],
    [0, -2000, 40, 60],
    "hidden window and its restore point are kept",
  );
  assert.equal(windows.settings.x, Math.round(rightCx - 200));
  assert.equal(windows.xr.y, windows.settings.y + 300 + 24, "showKeys window is placed even when parked");
});

test("pitch moves the stacks, and unnamed open windows join the emptier column without overlap", () => {
  const windows = {
    a: { x: 0, y: 0, w: 200, h: 100 },
    b: { x: 0, y: 0, w: 200, h: 100 },
    extra: { x: 0, y: 0, w: 200, h: 100 },
  };
  const sys = hudSystemWith(windows);
  const panels = createHudPathCameraPanels({
    hudSystem: sys,
    columns: [{ yaw: -0.8, keys: ["a", "b"] }, { yaw: 0.8, keys: [] }],
  });
  panels.place({ pitch: 0.1 });
  assert.ok(windows.a.y < 700 - 100 - 24, "positive pitch raises the stack");
  assert.equal(windows.b.y, windows.a.y + 100 + 24);
  assert.ok(windows.extra.x > 1400, "extra went to the empty right column");
  createHudPathCameraPanels({ hudSystem: sys, columns: [{ yaw: 0, keys: ["a"] }], placeOthers: false }).place();
  assert.ok(windows.extra.x > 1400, "placeOthers: false leaves unnamed windows alone");
});

test("a dragged window is not moved while held and keeps its drop point until reset", () => {
  const windows = { a: { x: 0, y: 0, w: 200, h: 100 }, b: { x: 0, y: 0, w: 200, h: 100 } };
  const sys = hudSystemWith(windows);
  const panels = createHudPathCameraPanels({ hudSystem: sys, columns: [{ yaw: 0, keys: ["a", "b"] }] });
  panels.place();
  const staged = { ...windows.b };
  sys.setDrag("a");
  windows.a.x = 77;
  windows.a.y = 88;
  panels.place();
  assert.deepEqual([windows.a.x, windows.a.y], [77, 88], "held window untouched");
  assert.deepEqual([windows.b.x, windows.b.y], [staged.x, staged.y], "the rest of the stack holds its slots");
  sys.setDrag(null);
  panels.place();
  assert.ok(panels.isUserPlaced("a"));
  assert.deepEqual([windows.a.x, windows.a.y], [77, 88], "dropped window keeps its spot");
  panels.reset();
  panels.place();
  assert.notDeepEqual([windows.a.x, windows.a.y], [77, 88], "reset restages it");
});

test("placement invalidates a clean HUD only when coordinates change", () => {
  const sys = hudSystemWith({ a: { x: 0, y: 0, w: 200, h: 100 } });
  const panels = createHudPathCameraPanels({ hudSystem: sys, columns: [{ yaw: 0.9, keys: ["a"] }] });
  sys.hud._dirty = false;
  panels.place();
  assert.equal(sys.hud._dirty, true);
  sys.hud._dirty = false;
  panels.place();
  assert.equal(sys.hud._dirty, false, "unchanged layout does not render every frame");
  panels.place({ pitch: 0.2 });
  assert.equal(sys.hud._dirty, true, "pitch changes request rendering");
});

test("createHudPathCameraPanels fails loudly on bad options", () => {
  assert.throws(() => createHudPathCameraPanels({ columns: [{ yaw: 0 }] }), /\[halo:path-camera\]/);
  assert.throws(() => createHudPathCameraPanels({ hudSystem: hudSystemWith({}), columns: [] }), /\[halo:path-camera\]/);
  assert.throws(() => createHudPathCameraPanels({ hudSystem: hudSystemWith({}), columns: [{ keys: [] }] }), /\[halo:path-camera\]/);
});
