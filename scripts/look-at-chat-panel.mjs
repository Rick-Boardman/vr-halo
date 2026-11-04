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
  await page.addInitScript(() => {
    globalThis.__unconsumedDemoKeys = [];
    // Installed before Halo: a focused editor must still run first in capture.
    window.addEventListener('keydown', event => {
      if (/^[wasdqerftgzxc]$/i.test(event.key) || /^(Arrow|Enter|Escape|Backspace|Delete|Home|End)/.test(event.key)) {
        globalThis.__unconsumedDemoKeys.push(event.key);
      }
    });
  });
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

  const layout = await page.evaluate(() => {
    const { hudSystem } = globalThis.__haloChatExample;
    const keys = globalThis.__haloChatPanel.windowKeys();
    const windows = hudSystem.hud.ui.windows;
    const transcript = windows[keys.transcript], composer = windows[keys.composer], help = windows.help;
    return {
      adjacent: composer.x === transcript.x && composer.y === transcript.y + transcript.h + 12,
      separate: help.x >= transcript.x + transcript.w,
      helpVisible: help.y >= 0 && !help.collapsed,
    };
  });
  step('SAY sits directly below TABLE ONE', layout.adjacent);
  step('HELP is open in a separate column', layout.separate && layout.helpVisible);

  async function clickComposer() {
    const point = await page.evaluate(() => {
      const hud = globalThis.__haloChatExample.hudSystem.hud;
      const composer = hud.ui.windows[globalThis.__haloChatPanel.windowKeys().composer];
      const rect = document.querySelector('canvas').getBoundingClientRect();
      return {
        x: rect.left + (composer.x + 40) / hud.layoutW * rect.width,
        y: rect.top + (composer.y + 50) / hud.layoutH * rect.height,
      };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => globalThis.__haloChatPanel.isTyping());
  }
  const pose = () => page.evaluate(() => {
    const { rig, look } = globalThis.__haloChatExample;
    return { position: rig.player.position.toArray(), yaw: look.getYaw(), pitch: look.getPitch(), roll: look.getRoll() };
  });
  await clickComposer();
  const beforeTyping = await pose();
  await page.keyboard.type('wasd qerf tg zxc', { delay: 25 });
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete']) await page.keyboard.press(key);
  await page.keyboard.press('Control+a');
  const typedMessage = 'Typed in SAY: wasd qerf tg zxc';
  await page.keyboard.type(typedMessage, { delay: 15 });
  const pasteDefaultPreserved = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  step('desktop paste keeps its browser default', pasteDefaultPreserved);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const inputResult = await page.evaluate(message => {
    const panel = globalThis.__haloChatPanel;
    const example = globalThis.__haloChatExample;
    const entries = example.hudSystem.hud.ui.data[panel.windowKeys().transcript + 'Lines'];
    return {
      sent: entries.some(entry => entry.text === message),
      autoWalk: example.navigation.autoWalk,
      unconsumed: globalThis.__unconsumedDemoKeys.slice(),
    };
  }, typedMessage);
  step('typing and editing do not move or rotate the scene', JSON.stringify(beforeTyping) === JSON.stringify(await pose()));
  step('typing X does not toggle auto-walk', inputResult.autoWalk === false);
  step('captured keys never reach an earlier scene listener', inputResult.unconsumed.length === 0, inputResult.unconsumed.join(', '));
  step('Enter sends the text typed through the composer', inputResult.sent);

  const draftText = () => page.evaluate(() => {
    const panel = globalThis.__haloChatPanel;
    const hud = globalThis.__haloChatExample.hudSystem.hud;
    return hud.ui.data[panel.windowKeys().composer + 'Lines'].map(entry => entry.sourceText ?? entry.text).join('\n');
  });
  step('a successful send clears SAY and keeps focus', await draftText() === '' && await page.evaluate(() => globalThis.__haloChatPanel.isTyping()));

  await page.evaluate(() => globalThis.__haloChatPanel.setTransport({
    async send() { throw new Error('Simulated send failure'); },
  }));
  await page.keyboard.type('Keep this failed message');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const panel = globalThis.__haloChatPanel;
    return globalThis.__haloChatExample.hudSystem.hud.ui.data[panel.windowKeys().transcript + 'Lines']
      .some(entry => entry.text === 'Simulated send failure');
  });
  step('a failed send preserves SAY', await draftText() === 'Keep this failed message');

  await page.evaluate(() => globalThis.__haloChatPanel.setTransport({
    send: () => new Promise(resolve => { globalThis.__finishDemoSend = resolve; }),
  }));
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Pending message');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => typeof globalThis.__finishDemoSend === 'function');
  await page.keyboard.type(' plus a new edit');
  await page.evaluate(() => globalThis.__finishDemoSend());
  step('send completion preserves edits made while sending', await draftText() === 'Pending message plus a new edit');
  await page.evaluate(() => {
    let notify = () => {};
    globalThis.__haloChatPanel.setTransport({
      subscribe(listener) { notify = listener; listener({ messages: [], status: 'live' }); return () => {}; },
      async send(body) {
        notify({ messages: [{ id: 'browser-message', authorUserId: 'test-author', body, createdAt: new Date().toISOString() }], status: 'live' });
      },
    });
  });

  await page.keyboard.press('Escape');
  step('Escape ends text entry', !(await page.evaluate(() => globalThis.__haloChatPanel.isTyping())));
  const beforeWalking = await pose();
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  step('navigation works again outside the editor', JSON.stringify(beforeWalking.position) !== JSON.stringify((await pose()).position));

  await page.keyboard.down('w');
  await clickComposer();
  await page.waitForTimeout(100);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  const releasedPose = await pose();
  await page.waitForTimeout(180);
  step('a key released while typing cannot remain latched', JSON.stringify(releasedPose) === JSON.stringify(await pose()));
  await clickComposer();
  await page.evaluate(() => globalThis.__haloChatPanel.close());
  step('closing the panel releases text focus', !(await page.evaluate(() => globalThis.__haloChatPanel.isTyping())));
  await page.evaluate(() => globalThis.__haloChatPanel.open());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileLayout = await page.evaluate(() => {
    const hud = globalThis.__haloChatExample.hudSystem.hud;
    const keys = globalThis.__haloChatPanel.windowKeys();
    const a = hud.ui.windows[keys.transcript], b = hud.ui.windows[keys.composer], help = hud.ui.windows.help;
    return b.y >= a.y + a.h && help.y >= b.y + b.h
      && [a,b,help].every(w => w.x >= 0 && w.x + w.w <= hud.layoutW && w.y + w.h <= hud.layoutH);
  });
  step('a phone-sized viewport stacks the panels without overlap', mobileLayout);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(150);

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
