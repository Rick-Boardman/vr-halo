// SPDX-License-Identifier: Apache-2.0
/**
 * Browser tests for a Halo app in an emulated headset: Meta's Immersive Web Emulator (IWER, MIT) supplies a real
 * WebXR runtime in the page, so the app's own Enter VR control opens an `immersive-vr` session, three.js renders
 * through it, and scripted controllers aim rays and pull triggers. This is not a physical headset: no device
 * optics, tracking, performance or system UI.
 *
 * Node side, for Playwright. The consumer adds `iwer` as a devDependency (this helper reads its browser bundle from
 * the consumer's node_modules). `runtime` is an expression evaluated in the page that yields the app's
 * `{ renderer, hudSystem }` (for example "window.conduitApp.ctx").
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Install an emulated headset (Meta Quest 3 by default) in every page of `context`, before the page's scripts run. */
export async function installEmulatedHeadset(context, { device = "metaQuest3", iwerPath = null, from = process.cwd() } = {}) {
  const bundle = iwerPath ?? createRequire(path.join(from, "package.json")).resolve("iwer/build/iwer.min.js");
  if (!/^[A-Za-z0-9]+$/.test(device)) throw new Error(`installEmulatedHeadset: device must be an IWER preset name, not ${device}`);
  await context.addInitScript({
    content: `${readFileSync(bundle, "utf8")}
;(() => {
  const device = new IWER.XRDevice(IWER[${JSON.stringify(device)}]);
  // Chromium ships navigator.xr without a headset; the emulated runtime replaces it.
  device.installRuntime({ forceInstall: true });
  globalThis.__haloEmulatedHeadset = device;
})();`,
  });
}

/**
 * Enter VR the way a person does on desktop: a click on the HUD's VR window, whose handler requests the session
 * inside the click's user activation. Resolves once three.js is presenting.
 */
export async function enterVr(page, runtime, { timeout = 15000 } = {}) {
  await page.waitForFunction(expr => {
    const { hudSystem } = (0, eval)(expr);
    const w = hudSystem?.hud?.ui?.windows?.xr;
    return hudSystem?.hud?.xr?.supported === true && w && Number(w.y) > -1000 && !w.hidden;
  }, runtime, { timeout });
  const point = await page.evaluate(expr => {
    const { hudSystem, renderer } = (0, eval)(expr);
    const w = hudSystem.hud.ui.windows.xr;
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = rect.width / hudSystem.hud.layoutW, sy = rect.height / hudSystem.hud.layoutH;
    return { x: rect.left + (w.x + w.w / 2) * sx, y: rect.top + (w.y + Math.min(w.h, 60) / 2 + 10) * sy };
  }, runtime);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(expr => (0, eval)(expr).renderer.xr.isPresenting === true, runtime, { timeout });
  await settle(400);
}

/** End the session, as the headset's own menu would; resolves once three.js has stopped presenting. */
export async function exitVr(page, runtime, { timeout = 10000 } = {}) {
  await page.evaluate(async expr => { await (0, eval)(expr).renderer.xr.getSession()?.end(); }, runtime);
  await page.waitForFunction(expr => (0, eval)(expr).renderer.xr.isPresenting === false, runtime, { timeout });
  await settle(300);
}

/**
 * The world point at the centre of a HUD window (or at u, v across it, v down from its top) while presenting. The point
 * is placed on the window's own hit mesh, as Halo's hit test reads it: its local rectangle is the window's rectangle.
 * (Mapping layout pixels to angles across the whole HUD drifted by a row or more on a tall window.)
 */
export function hudWindowPoint(page, runtime, key, { u = 0.5, v = 0.5 } = {}) {
  return page.evaluate(async ({ expr, key, u, v }) => {
    const { hudSystem } = (0, eval)(expr);
    const THREE = await import("three");
    const hud = hudSystem.hud;
    const w = hud.ui.windows[key];
    if (!w) throw new Error(`no HUD window ${key}`);
    hud.root.updateWorldMatrix(true, true);
    const origin = new THREE.Vector3().setFromMatrixPosition(hud.root.matrixWorld);
    const mesh = hud.objects?.windows?.[key]?.hit;
    let target;
    if (mesh?.geometry) {
      mesh.updateWorldMatrix(true, false);
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      target = mesh.localToWorld(new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * u, bb.max.y - (bb.max.y - bb.min.y) * v, (bb.min.z + bb.max.z) / 2));
    } else {
      const qRoot = new THREE.Quaternion().setFromRotationMatrix(hud.root.matrixWorld);
      const height = w.collapsed ? 28 : w.h;
      const yaw = ((w.x + w.w * u) / hud.layoutW - 0.5) * hudSystem.getVrYawPerScreen();
      const pitch = (0.5 - (w.y + height * v) / hud.layoutH) * hudSystem.getVrPitchPerScreen();
      target = origin.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(qRoot));
    }
    // Onto the surface itself (a window may curve with the HUD), along the line from the HUD's centre.
    const dir = target.clone().sub(origin).normalize();
    const hit = mesh ? new THREE.Raycaster(origin, dir).intersectObject(mesh, false)[0] : null;
    const point = hit?.point ?? target;
    return { x: point.x, y: point.y, z: point.z, onWindow: !!hit };
  }, { expr: runtime, key, u, v });
}

/**
 * Point a controller's ray at a world point. The controller stays where it is (or moves to `from`, in tracking space)
 * and turns so its -Z axis runs through the point; three.js reads the new pose on the next XR frames.
 */
export async function aimController(page, runtime, at, { hand = "right", from = null } = {}) {
  await page.evaluate(async ({ expr, at, hand, from }) => {
    const { renderer } = (0, eval)(expr);
    const THREE = await import("three");
    const device = globalThis.__haloEmulatedHeadset;
    const controller = device.controllers[hand];
    if (from) controller.position.set(from.x, from.y, from.z);
    const object = renderer.xr.getController(hand === "right" ? 1 : 0);
    object.parent.updateWorldMatrix(true, false);
    const local = new THREE.Vector3(at.x, at.y, at.z).applyMatrix4(object.parent.matrixWorld.clone().invert());
    const position = new THREE.Vector3(controller.position.x, controller.position.y, controller.position.z);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), local.sub(position).normalize());
    controller.quaternion.set(q.x, q.y, q.z, q.w);
  }, { expr: runtime, at, hand, from });
  await settle(250);
}

/**
 * The first object a controller can hit cleanly: candidates are `[{ id, world: [x, y, z] }]` and scene meshes carry
 * `userData[idKey]`. A candidate qualifies when the ray from the controller to its point (or to one of a few points
 * across the object) meets that object and no other candidate anywhere along the ray, and no HUD window stands in
 * front of it (the HUD takes a press first), so a trigger there can only mean it. HUD windows are candidates' blockers
 * unless the candidates are HUD windows themselves (`idKey: "windowKey"`). Returns `{ id, point }`, or null when every candidate is covered. It searches the runtime's `scene`, or
 * the scene the HUD is mounted in.
 */
export function clearShot(page, runtime, candidates, { hand = "right", idKey = "id" } = {}) {
  return page.evaluate(async ({ expr, candidates, hand, idKey }) => {
    const { renderer, scene: given, hudSystem } = (0, eval)(expr);
    const THREE = await import("three");
    // The app's scene, or the scene the HUD is mounted in.
    let scene = given ?? hudSystem?.hud?.root ?? null;
    while (!given && scene?.parent) scene = scene.parent;
    if (!scene) throw new Error("clearShot: the runtime gives no scene and no HUD root");
    const from = renderer.xr.getController(hand === "right" ? 1 : 0).getWorldPosition(new THREE.Vector3());
    const ids = new Set(candidates.map((c) => c.id));
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh && o.visible && ids.has(o.userData?.[idKey])) meshes.push(o); });
    const blockers = idKey === "windowKey" ? [] : Object.values(hudSystem?.hud?.objects?.windows ?? {})
      .map((objects) => objects?.hit).filter((hit) => hit?.isMesh && hit.visible);
    for (const c of candidates) {
      const own = meshes.filter((m) => m.userData[idKey] === c.id);
      const points = [new THREE.Vector3(...c.world)];
      for (const m of own.slice(0, 1)) {
        m.geometry?.computeBoundingBox?.();
        const bb = m.geometry?.boundingBox;
        if (!bb) continue;
        for (const [u, v] of [[0.5, 0.8], [0.5, 0.2], [0.2, 0.5], [0.8, 0.5]]) {
          points.push(m.localToWorld(new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * u, bb.min.y + (bb.max.y - bb.min.y) * v, 0)));
        }
      }
      for (const p of points) {
        const ray = new THREE.Raycaster(from, p.clone().sub(from).normalize());
        const hits = ray.intersectObjects(meshes, false);
        if (!hits.length || !hits.every((h) => h.object.userData[idKey] === c.id)) continue;
        const hud = ray.intersectObjects(blockers, false)[0];
        if (hud && hud.distance < hits[0].distance) continue;
        return { id: c.id, point: { x: p.x, y: p.y, z: p.z } };
      }
    }
    return null;
  }, { expr: runtime, candidates, hand, idKey });
}

/** Press and release a controller's trigger: a WebXR select. */
export async function pullTrigger(page, { hand = "right", holdMs = 150 } = {}) {
  await page.evaluate(hand => globalThis.__haloEmulatedHeadset.controllers[hand].updateButtonValue("trigger", 1), hand);
  await settle(holdMs);
  await page.evaluate(hand => globalThis.__haloEmulatedHeadset.controllers[hand].updateButtonValue("trigger", 0), hand);
  await settle(250);
}
