// Render and exercise the included settings-window example with Playwright:
// the form controls must paint on the HUD's settings window and take real mouse
// clicks, touch taps and typing, and reach the calibration only through the
// callbacks the page injects.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const shotDir = path.resolve(args.includes('--shots') ? args[args.indexOf('--shots') + 1] : path.join(root, 'dist', 'shots'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

let failures = 0;
function step(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(50)} ${detail}`);
  if (!ok) {
    failures += 1;
    throw new Error(`failed at: ${label}`);
  }
}

/** The whole repo is the document root, as for the chat-panel check. */
function serveRepo() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('outside the repo');
      return;
    }
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const { chromium } = await import('playwright');
const { server, port } = await serveRepo();
const origin = `http://127.0.0.1:${port}`;
console.log(`Looking at the HUD settings window — ${origin}/examples/settings-window/`);

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function openPage(contextOptions) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${origin}/examples/settings-window/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__haloSettingsWindow?.mesh?.material?.map), null, { timeout: 30000 });
  return { context, page, errors };
}

/** Client coordinates inside a control (or a dropdown option, by label). */
function pointOf(page, key, fx = 0.5) {
  return page.evaluate(({ key, fx }) => {
    const hud = globalThis.__haloSettingsExample.hudSystem.hud;
    const win = hud.ui.windows.settings;
    const items = globalThis.__haloSettingsWindow.form.layout(win.w, win.h);
    const item = items.find((entry) => entry.key === key)
      ?? items.flatMap((entry) => entry.options ?? []).find((option) => option.label === key);
    const box = item.box ?? item;
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return {
      x: rect.left + ((win.x + box.x + box.w * fx) / hud.layoutW) * rect.width,
      y: rect.top + ((win.y + box.y + box.h / 2) / hud.layoutH) * rect.height,
    };
  }, { key, fx });
}

const state = (page) => page.evaluate(() => {
  const { calibration, grid } = globalThis.__haloSettingsExample;
  return {
    index: calibration.index,
    mode: calibration.mode,
    level: calibration.audio.level,
    muted: calibration.audio.muted,
    grid: grid().visible,
    typing: globalThis.__haloSettingsWindow.isTyping(),
    open: globalThis.__haloSettingsWindow.form.openKey,
  };
});
const frames = (page) => page.waitForTimeout(150);
const thrown = (errors) => errors.filter((line) => !/Failed to load resource/i.test(line));

try {
  const { context, page, errors } = await openPage({});
  step('the scene boots and the window paints a texture', true, 'createHudSettingsWindow');
  const mounted = await page.evaluate(() => {
    const win = globalThis.__haloSettingsExample.hudSystem.hud.ui.windows.settings;
    const mesh = globalThis.__haloSettingsWindow.mesh;
    const map = mesh.material.map;
    return {
      shown: win.y > -1000 && !win.collapsed,
      visible: mesh.visible,
      sized: map.image.width > 0 && map.image.height > 0,
      inScene: Boolean(mesh.parent),
    };
  });
  step('the control plane sits on the open settings window',
    mounted.shown && mounted.visible && mounted.sized && mounted.inScene, JSON.stringify(mounted));

  await mkdir(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, 'settings-window.png') });

  const quality = await pointOf(page, 'quality');
  await page.mouse.click(quality.x, quality.y);
  await frames(page);
  step('a mouse click opens the quality dropdown', (await state(page)).open === 'quality');
  await page.screenshot({ path: path.join(shotDir, 'settings-window-dropdown.png') });
  const low = await pointOf(page, 'Low');
  await page.mouse.click(low.x, low.y);
  await frames(page);
  let now = await state(page);
  step('choosing Low locks tier 0 through the callback',
    now.index === 0 && now.mode === 'manual' && now.open === '', JSON.stringify(now));

  const volume = await pointOf(page, 'volume', 0.02);
  const volumeEnd = await pointOf(page, 'volume', 0.98);
  await page.mouse.move(volume.x, volume.y);
  await page.mouse.down();
  await frames(page);
  const pressed = (await state(page)).level;
  await page.mouse.move(volumeEnd.x, volumeEnd.y, { steps: 5 });
  await frames(page);
  const dragged = (await state(page)).level;
  await page.mouse.up();
  await frames(page);
  step('pressing then dragging the volume slider sets the level', pressed < 0.1 && dragged > 0.9, `${pressed} -> ${dragged}`);

  const ratio = await pointOf(page, 'ratio');
  await page.mouse.click(ratio.x, ratio.y);
  await frames(page);
  step('clicking the ratio field starts typing', (await state(page)).typing);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Backspace');
  await page.keyboard.type('0.75');
  await page.keyboard.press('Enter');
  await frames(page);
  now = await state(page);
  const tiers = await page.evaluate(() => globalThis.__haloSettingsExample.calibration.tiers);
  step('typed 0.75 commits the nearest tier',
    !now.typing && tiers[now.index] === 0.75, JSON.stringify({ index: now.index, tiers }));

  // A window raised over the settings window takes the press on the covered Mute.
  const before = (await state(page)).muted;
  await page.evaluate(() => {
    const { hudSystem } = globalThis.__haloSettingsExample;
    const win = hudSystem.hud.ui.windows.settings;
    hudSystem.createWindow('review-cover', { title: 'Cover', x: win.x, y: win.y, w: win.w, h: win.h });
    hudSystem.bringToFront('review-cover');
  });
  await frames(page);
  const covered = await pointOf(page, 'mute');
  await page.mouse.click(covered.x, covered.y);
  await frames(page);
  const coverFocus = await page.evaluate(() => globalThis.__haloSettingsExample.hudSystem.hud.ui.focus);
  now = await state(page);
  step('a window over the settings window takes the click', now.muted === before && coverFocus === 'review-cover',
    JSON.stringify({ muted: now.muted, focus: coverFocus }));
  await page.evaluate(() => globalThis.__haloSettingsExample.hudSystem.destroyWindow('review-cover'));
  await frames(page);

  // Shrunk to the stock minimum, the window grows back to fit its rows.
  const fitted = await page.evaluate(() => {
    const win = globalThis.__haloSettingsExample.hudSystem.hud.ui.windows.settings;
    win.h = 220;
    win.minH = 220;
    return new Promise((resolve) => setTimeout(() => {
      const items = globalThis.__haloSettingsWindow.form.layout(win.w, win.h);
      const last = items[items.length - 1];
      resolve({ h: win.h, minH: win.minH, bottom: last.box.y + last.box.h });
    }, 150));
  });
  step('the minimum height keeps every row on the window',
    fitted.minH >= fitted.bottom && fitted.h >= fitted.minH, JSON.stringify(fitted));
  const reachable = await pointOf(page, 'mute');
  await page.mouse.click(reachable.x, reachable.y);
  await frames(page);
  now = await state(page);
  step('Mute is reachable after the shrink', now.muted === !before, JSON.stringify({ muted: now.muted }));

  step('nothing threw on the desktop page', thrown(errors).length === 0, thrown(errors).slice(0, 2).join(' | ') || 'clean');
  await page.evaluate(() => globalThis.__haloSettingsWindow.dispose());
  step('dispose removes the control plane', await page.evaluate(() => globalThis.__haloSettingsWindow.mesh === null));
  await context.close();

  const touch = await openPage({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 600 } });
  const mute = await pointOf(touch.page, 'mute');
  await touch.page.touchscreen.tap(mute.x, mute.y);
  await frames(touch.page);
  const grid = await pointOf(touch.page, 'grid');
  await touch.page.touchscreen.tap(grid.x, grid.y);
  await frames(touch.page);
  now = await state(touch.page);
  step('touch taps toggle Mute and the app-owned row', now.muted === true && now.grid === false, JSON.stringify(now));
  await touch.page.screenshot({ path: path.join(shotDir, 'settings-window-touch.png') });
  step('nothing threw on the touch page', thrown(touch.errors).length === 0,
    thrown(touch.errors).slice(0, 2).join(' | ') || 'clean');
  await touch.context.close();
  console.log(`  shots in ${shotDir}`);
  console.log('DONE');
} finally {
  await browser.close();
  server.close();
}

process.exit(failures ? 1 : 0);
