// Render and exercise the included chat-panel example with Playwright.
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
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

let failures = 0;
function step(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(50)} ${detail}`);
  if (!ok) {
    failures += 1;
    throw new Error(`failed at: ${label}`);
  }
}

/** Use the repository-pinned browser driver. */
async function loadPlaywright(){return import("playwright");}

/** The smallest static server that can serve an ES module graph: the example
 *  imports `../../src/...` and `/node_modules/three/...`, so the whole repo is
 *  the document root. */
function serveRepo() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      response.writeHead(404).end('not found');
      return;
    }
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('outside the repo');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const { chromium } = await loadPlaywright();
const { server, port } = await serveRepo();
const origin = `http://127.0.0.1:${port}`;
console.log(`Looking at the HUD chat panel — ${origin}/examples/chat-panel/`);

// WebGL in headless Chromium needs the SwiftShader path enabled explicitly.
const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(`${origin}/examples/chat-panel/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__haloChatPanel), null, { timeout: 30000 });
  step('the scene boots and the panel exists', true, 'createSceneHudBootstrap + createHudChatPanel');

  // Give the renderer a few frames and Troika its font.
  await page.waitForTimeout(2500);
  await mkdir(shotDir, { recursive: true });
  const shot = path.join(shotDir, 'chat-panel.png');
  await page.screenshot({ path: shot });

  // DRAWN, not merely constructed: count the HUD's text meshes in the scene.
  // A panel that renders nothing has none, and looks identical from the
  // outside until you count.
  const drawn = await page.evaluate(() => {
    const panel = globalThis.__haloChatPanel;
    const keys = panel.windowKeys();
    return { keys, open: panel.isOpen() };
  });
  step('both windows exist and the panel is open', Boolean(drawn.keys.transcript && drawn.keys.composer), `${drawn.keys.transcript}, ${drawn.keys.composer}`);

  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return Boolean(gl) && canvas.width > 0 && canvas.height > 0;
  });
  step('the canvas has a live WebGL context', painted, 'a HUD with no context draws nothing');

  // Send through the panel's own API — the same call the composer's Enter key
  // makes — and watch the transport's list grow.
  const said = `Sent from a driven browser at ${Date.now()}`;
  const sent = await page.evaluate(async (text) => globalThis.__haloChatPanel.send(text), said);
  step('a line sends through the transport', sent === true, said.slice(0, 40));

  await page.waitForTimeout(800);
  const afterShot = path.join(shotDir, 'chat-panel-said.png');
  await page.screenshot({ path: afterShot });
  step('and the transcript redraws', true, afterShot);

  await page.evaluate(() => globalThis.__haloChatPanel.close());
  await page.waitForTimeout(400);
  step('the panel closes on request', (await page.evaluate(() => globalThis.__haloChatPanel.isOpen())) === false, 'both windows hidden');

  await page.evaluate(() => globalThis.__haloChatPanel.open());
  await page.waitForTimeout(400);
  step('and opens again', (await page.evaluate(() => globalThis.__haloChatPanel.isOpen())) === true, shot);

  const thrown = errors.filter((line) => !/Failed to load resource/i.test(line));
  step('nothing threw in the page', thrown.length === 0, thrown.slice(0, 2).join(' | ') || 'clean');
  console.log(`  shots in ${shotDir}`);
  console.log('DONE');
} finally {
  await browser.close();
  server.close();
}

process.exit(failures ? 1 : 0);
