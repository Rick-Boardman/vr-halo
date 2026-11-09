// The consumer gate: this working copy of Halo, run by every consumer beside this checkout.
//
//   npm run gate                       # every consumer under ../ (the nexus/vr folder)
//   npm run gate -- --only chorus,demo # some of them
//   npm run gate -- --root E:\apps     # consumers live somewhere else
//
// Consumers pin a Halo tag (github:Rick-Boardman/vr-halo#vX.Y.Z) and load it from their own
// node_modules through an import map, so a Halo release can break nobody until a consumer moves
// its pin. This gate answers the question before the tag: what would break when they do? It
// serves the consumers' parent folder on a local port and answers every request for
// <consumer>/node_modules/@rb/halo/<path> from THIS checkout, so each consumer runs the candidate
// in place of its pinned tag. A consumer is a folder with an index.html and @rb/halo in its
// package.json dependencies. For each, headless Chromium loads the page, waits for a canvas,
// clicks it and presses a few keys (the HUD's input path), and the consumer fails on any page
// error, console error, or Halo file that did not answer 200 (a consumer that never asked for a
// Halo file did not run the candidate and fails too). Other failed requests, such as a consumer
// probing a backend a bare local serve cannot answer, are reported, not failed. Exit code 1 when
// any consumer fails. Nothing is written.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const halo = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = resolve(flag('root', resolve(halo, '..')));
const only = (flag('only', '') || '').split(',').map((x) => x.trim()).filter(Boolean);

const consumers = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const folder = join(root, entry.name);
  if (resolve(folder) === halo || !existsSync(join(folder, 'index.html')) || !existsSync(join(folder, 'package.json'))) continue;
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  const pin = (pkg.dependencies || {})['@rb/halo'] || (pkg.devDependencies || {})['@rb/halo'];
  if (!pin) continue;
  if (only.length && !only.includes(entry.name)) continue;
  consumers.push({ name: entry.name, folder, pin });
}
if (!consumers.length) {
  console.error(`consumer gate: no consumer under ${root}${only.length ? ` named ${only.join(', ')}` : ''}`);
  process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const CANDIDATE = /^\/([^/]+)\/node_modules\/@rb\/halo(\/.*)?$/;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const candidate = CANDIDATE.exec(pathname);
  const base = candidate ? halo : root;
  const relative = candidate ? candidate[2] || '/' : pathname;
  const path = normalize(join(base, relative));
  if (!path.startsWith(base + sep) && path !== base) return void response.writeHead(403).end();
  try {
    const target = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
    response.writeHead(200, { 'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream' });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const version = JSON.parse(await readFile(join(halo, 'package.json'), 'utf8')).version;
console.log(`consumer gate: Halo ${version} (this checkout) against ${consumers.length} consumer(s) under ${root}\n`);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
for (const consumer of consumers) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  const notes = [];
  let haloFiles = 0;
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|Failed to load resource/i.test(message.text())) problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const where = new URL(r.url());
    if (where.origin === origin && CANDIDATE.test(where.pathname)) {
      haloFiles += 1;
      if (r.status() !== 200) problems.push(`halo ${r.status()}: ${where.pathname}`);
    } else if (r.status() >= 400 && !/favicon/i.test(where.pathname)) {
      notes.push(`${r.status()}: ${where.origin === origin ? where.pathname : r.url()}`);
    }
  });
  try {
    await page.goto(`${origin}/${consumer.name}/`, { waitUntil: 'load', timeout: 30000 });
    const canvas = await page.waitForSelector('canvas', { timeout: 20000 });
    await page.waitForTimeout(2500);
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    for (const key of ['Tab', 'KeyW', 'Escape']) await page.keyboard.press(key);
    await page.waitForTimeout(1500);
    if (!haloFiles) problems.push('loaded no Halo file from this checkout: the candidate was not exercised');
  } catch (error) {
    problems.push(`did not render: ${String(error.message || error).split('\n')[0]}`);
  }
  if (problems.length) failed += 1;
  const lines = [...problems.slice(0, 8), ...notes.slice(0, 4).map((n) => `(note) ${n}`)];
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${consumer.name} (pins ${consumer.pin}; ${haloFiles} Halo files from this checkout)${lines.length ? '\n     ' + lines.join('\n     ') : ''}`);
  await page.close();
}
await browser.close();
server.close();
console.log(failed ? `\nCONSUMER GATE FAILED: ${failed} of ${consumers.length} consumers` : `\nconsumer gate passed: ${consumers.length} consumers run Halo ${version}`);
process.exit(failed ? 1 : 0);
