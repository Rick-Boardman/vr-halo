// Emulated headset (IWER): the chat-panel example's own HUD Enter VR opens an immersive-vr session; a controller
// ray picks HUD windows; ending the session restores the desktop. Not a physical headset.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installEmulatedHeadset, enterVr, exitVr, hudWindowPoint, aimController, pullTrigger, clearShot } from '../testing/emulated-headset.mjs';
import { frames, hudWindow, shownHudWindows, hudToClient, hudRowPoint, hotbarSlotPoint } from '../testing/hud-pointing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

function step(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(58)} ${detail}`);
  if (!ok) throw new Error(`failed at: ${label}`);
}

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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Looking at the emulated headset — ${origin}/examples/chat-panel/`);

const { chromium } = await import('playwright');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await installEmulatedHeadset(context, { from: root });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
// SwiftShader's own GL performance notes ("GPU stall due to ReadPixels") are the software renderer, not the app.
page.on('console', (message) => {
  if ((message.type() === 'error' || message.type() === 'warning') && !/GL Driver Message/.test(message.text())) errors.push(`${message.type()}: ${message.text()}`);
});
const runtime = 'globalThis.__haloChatExample';
try {
  await page.goto(`${origin}/examples/chat-panel/`);
  await page.waitForFunction(() => globalThis.__haloChatExample?.hudSystem, null, { timeout: 30000 });
  await frames(page, 10);

  // Desktop pointing helpers: a row and a hotbar slot land on Halo's own UI hit test.
  const overUi = (p) => page.evaluate(({ x, y }) => globalThis.__haloChatExample.hudSystem.isClientPointOverUi(x, y), p);
  const row = await hudRowPoint(page, runtime, 'help', /roll/i);
  step('hudRowPoint finds a help row by its text', row.found, row.found ? row.text : JSON.stringify(row.rows));
  const rowClient = await hudToClient(page, runtime, row);
  const helpWin = await hudWindow(page, runtime, 'help');
  step('the row point is inside its window and over the UI', row.y > helpWin.y && row.y < helpWin.y + helpWin.h && await overUi(rowClient), JSON.stringify(rowClient));
  const slot = await hotbarSlotPoint(page, runtime, /\S/);
  step('hotbarSlotPoint finds a slot over the hotbar', !!slot && await overUi(slot), JSON.stringify(slot && { index: slot.index, x: Math.round(slot.x), y: Math.round(slot.y) }));
  const shown = await shownHudWindows(page, runtime);
  step('shownHudWindows lists the open windows', shown.windows.some((w) => w.key === 'help'), shown.windows.map((w) => w.key).join(', '));

  // A tall window of pressable rows, to aim at precisely in the headset.
  await page.evaluate(() => {
    const { hudSystem } = globalThis.__haloChatExample;
    globalThis.__pressedRows = [];
    // Between the table and help windows, above the hotbar: covering none of them.
    hudSystem.createWindow('tall-list', { title: 'Tall list', x: 486, y: 16, w: 310, h: 690, scrollable: false });
    hudSystem.setWindowLines('tall-list', Array.from({ length: 30 }, (_, i) => ({ text: `Row ${i + 1}`, onClick: () => globalThis.__pressedRows.push(i + 1) })));
  });
  await frames(page, 6);

  await enterVr(page, runtime);
  const presenting = await page.evaluate(() => {
    const { renderer, hudSystem } = globalThis.__haloChatExample;
    return { three: renderer.xr.isPresenting, hud: hudSystem.hud.xr.presenting, session: !!renderer.xr.getSession() };
  });
  step('the HUD Enter VR opens an immersive-vr session', presenting.three && presenting.hud && presenting.session, JSON.stringify(presenting));

  const keys = await page.evaluate(() => {
    const hud = globalThis.__haloChatExample.hudSystem.hud;
    return hud.ui.order.filter((key) => { const w = hud.ui.windows[key]; return w && !w.hidden && Number(w.y) > -1000 && key !== 'xr'; });
  });
  step('the example shows HUD windows in the headset', keys.length >= 2, keys.join(', '));
  for (const key of keys.slice(0, 2).reverse()) {
    const point = await hudWindowPoint(page, runtime, key, { v: 0.6 });
    step(`a ray from the HUD root meets ${key}`, point.onWindow, JSON.stringify(point));
    await aimController(page, runtime, point, { from: { x: 0.2, y: 1.45, z: -0.1 } });
    await pullTrigger(page);
    const front = await page.evaluate(() => globalThis.__haloChatExample.hudSystem.hud.ui.order.at(-1));
    step(`the trigger on ${key} brings it to the front`, front === key, `front ${front}`);
  }

  // Rows near the bottom of a tall window are hit exactly: the point is placed on the window's own mesh.
  // In the headset the HUD is laid out smaller with larger rows, so row 15 is near the bottom of what shows.
  for (const wanted of [15, 3]) {
    const row = await hudRowPoint(page, runtime, 'tall-list', new RegExp(`^Row ${wanted}$`));
    step(`row ${wanted} shows in the headset`, row.found, row.found ? '' : JSON.stringify(row.rows));
    const at = await hudWindowPoint(page, runtime, 'tall-list', { u: row.u, v: row.v });
    await aimController(page, runtime, at, { from: { x: 0.2, y: 1.45, z: -0.1 } });
    await pullTrigger(page);
  }
  const pressed = await page.evaluate(() => globalThis.__pressedRows);
  step('the trigger on a row of a tall window presses exactly that row', pressed.join() === '15,3', JSON.stringify(pressed));

  const helpPoint = await hudWindowPoint(page, runtime, 'help', { v: 0.6 });
  const shot = await clearShot(page, runtime, [{ id: 'help', world: [helpPoint.x, helpPoint.y, helpPoint.z] }], { idKey: 'windowKey' });
  step('clearShot finds an uncovered point on a HUD window', shot?.id === 'help', JSON.stringify(shot));

  await exitVr(page, runtime);
  const after = await page.evaluate(() => {
    const { renderer, hudSystem } = globalThis.__haloChatExample;
    const hud = hudSystem.hud;
    const inView = Object.entries(hud.ui.windows).filter(([, w]) => !w.hidden && Number(w.y) > -1000)
      .every(([, w]) => w.x >= 0 && w.y >= 0 && w.x < hud.layoutW && w.y < hud.layoutH);
    return { presenting: renderer.xr.isPresenting, hud: hud.xr.presenting, inView };
  });
  step('ending the session restores the desktop HUD in view', !after.presenting && !after.hud && after.inView, JSON.stringify(after));
  step('nothing threw or warned in the page', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
  console.log('DONE');
} finally {
  await browser.close();
  server.close();
}
