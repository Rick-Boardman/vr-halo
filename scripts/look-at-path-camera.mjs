// Drive the path-camera HUD mount and panel placement in a real page.
//
// Desktop: the mount stays out of the way and a mouse click still picks the HUD.
// Simulated XR: `renderer.xr.isPresenting` is forced true with no XR session,
// so Halo's own placement moves the root to its VR anchor and lays windows on
// the sphere. A ray along each column's yaw, cast from the HUD root through
// Halo's real per-window hit meshes, must land on the window placed there.
// This is not a headset check: there is no XR session, no controllers and no
// Quest compositor here.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headed = process.argv.includes('--headed');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

function step(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(58)} ${detail}`);
  if (!ok) throw new Error(`failed at: ${label}`);
}

function serveRepo() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(root)) return void response.writeHead(403).end('outside the repo');
    try {
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      return void response.writeHead(404).end('not found');
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const { chromium } = await import('playwright');
const { server, port } = await serveRepo();
const origin = `http://127.0.0.1:${port}`;
console.log(`Looking at the path-camera HUD mount — ${origin}/examples/chat-panel/`);
const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const frames = (n = 6) => page.evaluate((count) => new Promise((done) => {
  let left = count;
  const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}), n);

let failed = false;
try {
  await page.goto(`${origin}/examples/chat-panel/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__haloChatPanel && globalThis.__haloChatExample?.renderer), null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Install the mount and placement the way an application would, driven
  // every frame after Halo's own placement.
  const installed = await page.evaluate(async () => {
    const THREE = await import('three');
    const api = await import('/src/hud.js');
    const { hudSystem, renderer } = globalThis.__haloChatExample;
    const chatKey = globalThis.__haloChatPanel.windowKeys().transcript;
    const mount = api.createHudPathCameraMount({ THREE, renderer, hud: hudSystem.hud });
    const panels = api.createHudPathCameraPanels({
      hudSystem,
      columns: [
        { yaw: -api.HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: [chatKey] },
        { yaw: api.HUD_PATH_CAMERA_SIDE_YAW_RAD, keys: ['help'], showKeys: ['xr'] },
      ],
      placeOthers: false,
    });
    const look = { yaw: 0.6, pitch: 0.12 };
    const state = { held: false, frames: 0 };
    const tick = () => {
      if (state.stopped) return;
      state.held = mount.update(look);
      if (state.held) panels.place();
      state.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    globalThis.__pathCamera = { THREE, mount, panels, look, state, chatKey };
    return { chatKey, exported: typeof api.createHudPathCameraMount === 'function' };
  });
  step('the mount and placement are exported from @rb/halo/hud', installed.exported);
  await frames();

  const desktop = await page.evaluate(() => {
    const { hudSystem, camera } = globalThis.__haloChatExample;
    const { mount, state } = globalThis.__pathCamera;
    return { held: state.held, underCamera: hudSystem.hud.root.parent === camera, mountEmpty: mount.mount.children.length === 0 };
  });
  step('desktop: the mount leaves the HUD root on the camera', !desktop.held && desktop.underCamera && desktop.mountEmpty, JSON.stringify(desktop));

  async function clickComposer() {
    const point = await page.evaluate(() => {
      const hud = globalThis.__haloChatExample.hudSystem.hud;
      const chat = hud.ui.windows[globalThis.__haloChatPanel.windowKeys().transcript];
      const rect = document.querySelector('canvas').getBoundingClientRect();
      const footerH = Math.max(24, Number(chat._footerReservedHeightPx) || 40);
      return { x: rect.left + (chat.x + 40) / hud.layoutW * rect.width, y: rect.top + (chat.y + chat.h - footerH / 2) / hud.layoutH * rect.height };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => globalThis.__haloChatPanel.isTyping(), null, { timeout: 5000 });
    await page.keyboard.press('Escape');
  }
  await clickComposer();
  step('desktop: a mouse click still picks a HUD window', true, 'composer took focus');

  // Simulated XR: no session, Halo's VR branch only.
  await page.evaluate(() => { globalThis.__haloChatExample.renderer.xr.isPresenting = true; });
  await page.evaluate(() => { globalThis.__pathCameraProbe = () => {
    const { hudSystem } = globalThis.__haloChatExample;
    const { THREE, mount, look, state, chatKey } = globalThis.__pathCamera;
    if (!mount.mount.parent) return { held: false, chat: {}, help: {}, chatKey };
    const hud = hudSystem.hud;
    const rootObj = hud.root;
    rootObj.updateWorldMatrix(true, true);
    const qRoot = new THREE.Quaternion().setFromRotationMatrix(rootObj.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(rootObj.matrixWorld);
    const anchor = mount.mount.parent;
    const qAnchor = anchor.getWorldQuaternion(new THREE.Quaternion());
    const qLook = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), look.pitch));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(qRoot);
    const want = new THREE.Vector3(0, 0, -1).applyQuaternion(qAnchor.multiply(qLook));
    const yawSpan = hudSystem.getVrYawPerScreen();
    const pitchSpan = hudSystem.getVrPitchPerScreen();
    const meshes = [];
    for (const key of hud.ui.order) {
      const hit = hud.objects?.windows?.[key]?.hit;
      if (hit?.isMesh) meshes.push(hit);
    }
    function pick(key) {
      const w = hud.ui.windows[key];
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      const yaw = (cx / hud.layoutW - 0.5) * yawSpan;
      const pitch = (0.5 - cy / hud.layoutH) * pitchSpan;
      const dirL = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const dir = dirL.applyQuaternion(qRoot).normalize();
      const hits = new THREE.Raycaster(origin, dir).intersectObjects(meshes, false);
      const first = hits.find((h) => h.object.userData?.windowKey && h.object.userData.windowKey !== '__tooltip');
      return { key: first?.object.userData.windowKey ?? null, yawDeg: Math.round(yaw * 180 / Math.PI) };
    }
    return {
      held: state.held,
      rootInMount: rootObj.parent === mount.mount,
      rotationZero: rootObj.rotation.x === 0 && rootObj.rotation.y === 0 && rootObj.rotation.z === 0,
      followsLook: fwd.angleTo(want) < 1e-4,
      chat: pick(chatKey),
      help: pick('help'),
      chatKey,
      layout: [hud.layoutW, hud.layoutH],
    };
  }; });
  // Halo re-lays the VR surface over a few frames; wait for it to settle.
  await page.waitForFunction(() => {
    const p = globalThis.__pathCameraProbe();
    return p.held && p.chat.key === p.chatKey && p.help.key === 'help';
  }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  const xr = await page.evaluate(() => globalThis.__pathCameraProbe());
  step('simulated XR: the mount holds the HUD root', xr.held && xr.rootInMount, JSON.stringify({ held: xr.held, rootInMount: xr.rootInMount }));
  step('simulated XR: root rotation stays 0 and its -Z follows the look', xr.rotationZero && xr.followsLook);
  step('simulated XR: a ray at the left column picks the chat window', xr.chat.key === xr.chatKey, JSON.stringify({ ...xr.chat, layout: xr.layout }));
  step('simulated XR: a ray at the right column picks HELP', xr.help.key === 'help', JSON.stringify(xr.help));

  const hidden = await page.evaluate(async () => {
    const { hudSystem } = globalThis.__haloChatExample;
    hudSystem.setWindowHidden('help', true);
    const before = { ...hudSystem.hud.ui.windows.help };
    await new Promise((r) => setTimeout(r, 300));
    const after = hudSystem.hud.ui.windows.help;
    return { stillHidden: after.y < -1000, sameRestore: after._hiddenX === before._hiddenX && after._hiddenY === before._hiddenY };
  });
  step('simulated XR: a hidden window stays hidden with its restore point', hidden.stillHidden && hidden.sameRestore, JSON.stringify(hidden));
  await page.evaluate(() => globalThis.__haloChatExample.hudSystem.setWindowHidden('help', false));

  // Leave simulated XR: Halo moves the root to the desktop camera; the mount lets go.
  await page.evaluate(() => { globalThis.__haloChatExample.renderer.xr.isPresenting = false; });
  await frames(10);
  const left = await page.evaluate(() => {
    const { hudSystem, camera } = globalThis.__haloChatExample;
    const { mount, state } = globalThis.__pathCamera;
    return { held: state.held, underCamera: hudSystem.hud.root.parent === camera, mountEmpty: mount.mount.children.length === 0 };
  });
  step('after XR: the HUD root is back on the camera', !left.held && left.underCamera && left.mountEmpty, JSON.stringify(left));

  const disposed = await page.evaluate(() => {
    const { mount, state } = globalThis.__pathCamera;
    state.stopped = true;
    mount.dispose();
    return { detached: mount.mount.parent === null, noop: mount.update({ yaw: 1 }) === false };
  });
  step('dispose detaches the mount and later updates do nothing', disposed.detached && disposed.noop);
  await frames();
  await clickComposer();
  step('desktop picking works after dispose', true);

  // Freeze application frames so unrelated metrics/input cannot invalidate the
  // HUD. Drive only normal HUD updates, with no controllers aimed at the panel.
  const refresh = await page.evaluate(async () => {
    const { hudSystem, renderer } = globalThis.__haloChatExample;
    const { THREE, chatKey } = globalThis.__pathCamera;
    const api = await import('/src/hud.js');
    renderer.setAnimationLoop(null);
    renderer.xr.isPresenting = true;
    for (let i = 0; i < 30; i++) hudSystem.update(0);
    const mount = api.createHudPathCameraMount({ THREE, renderer, hud: hudSystem.hud });
    mount.update();
    const panels = api.createHudPathCameraPanels({
      hudSystem, columns: [{ yaw: 0.9, keys: [chatKey] }], placeOthers: false,
    });
    panels.place();
    // Baseline rendering is intentional; the pitch change below must render
    // without bringToFront or any other independent invalidation.
    hudSystem.bringToFront(chatKey);
    for (let i = 0; i < 30; i++) { hudSystem.update(0); mount.update(); }
    const hud = hudSystem.hud;
    const hit = hud.objects.windows[chatKey].hit;
    const before = hit.getWorldPosition(new THREE.Vector3());
    const clean = hud._dirty === false;
    panels.place({ pitch: 0.2 });
    const invalidated = hud._dirty === true;
    for (let i = 0; i < 10; i++) { hudSystem.update(0); mount.update(); }
    const after = hit.getWorldPosition(new THREE.Vector3());
    const win = hud.ui.windows[chatKey];
    const yaw = ((win.x + win.w / 2) / hud.layoutW - 0.5) * hudSystem.getVrYawPerScreen();
    const pitch = (0.5 - (win.y + win.h / 2) / hud.layoutH) * hudSystem.getVrPitchPerScreen();
    const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
      .applyQuaternion(hud.root.getWorldQuaternion(new THREE.Quaternion()));
    const origin = hud.root.getWorldPosition(new THREE.Vector3());
    const picked = new THREE.Raycaster(origin, direction).intersectObject(hit).length > 0;
    const result = { clean, invalidated, moved: before.distanceTo(after) > 0.1, picked, pointerActive: !!hud.vrPointer?.active };
    renderer.xr.isPresenting = false;
    hudSystem.update(0);
    mount.dispose();
    return result;
  });
  step('clean HUD: pitch change refreshes geometry and picking',
    refresh.clean && refresh.invalidated && refresh.moved && refresh.picked && !refresh.pointerActive, JSON.stringify(refresh));

  const thrown = errors.filter((line) => !/Failed to load resource/i.test(line));
  step('nothing threw in the page', thrown.length === 0, thrown.slice(0, 2).join(' | ') || 'clean');
  console.log('DONE');
} catch (error) {
  failed = true;
  console.error(error.message);
  const thrown = errors.filter((line) => !/Failed to load resource/i.test(line));
  if (thrown.length) console.error('page errors:', thrown.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
