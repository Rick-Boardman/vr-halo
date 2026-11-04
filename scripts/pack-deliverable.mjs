// Build a versioned Apache-2.0 delivery with a SHA-256 manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const outDir = path.join(root, 'dist');
await mkdir(outDir, { recursive: true });

// The contract checks first. A delivery that has not been checked is a
// delivery somebody else gets to debug.
execFileSync('node', [path.join(root, 'scripts', 'check-relative-imports.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync('node', [path.join(root, 'scripts', 'check-exports.mjs')], { cwd: root, stdio: 'inherit' });

if (!process.env.npm_execpath) throw new Error('Run npm run pack:deliverable.');
const packed = execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--pack-destination', outDir, '--json'], {
  cwd: root,
  encoding: 'utf8',
});
const [result] = JSON.parse(packed);
const tarball = path.join(outDir, result.filename);
const bytes = await readFile(tarball);
const digest = createHash('sha256').update(bytes).digest('hex');

const delivery = {
  name: manifest.name,
  version: manifest.version,
  tarball: path.relative(root, tarball).split(path.sep).join('/'),
  bytes: bytes.length,
  sha256: digest,
  packedAt: new Date().toISOString(),
  // What the consumer must install BESIDE this, exactly. three is a peer on
  // purpose: two copies in one page is a broken app, not a slow one.
  peerDependencies: manifest.peerDependencies ?? {},
  exports: Object.keys(manifest.exports ?? {}),
  files: result.files?.map((file) => file.path) ?? [],
  install: `npm i "file:${path.relative(root, tarball).split(path.sep).join('/')}"`,
  licence: 'Apache-2.0; third-party assets retain their terms in THIRD_PARTY.md',
};

const manifestPath = path.join(outDir, `${result.name.replace('@', '').replace('/', '-')}-${manifest.version}.json`);
await writeFile(manifestPath, `${JSON.stringify(delivery, null, 2)}\n`, 'utf8');

console.log(`\nDelivered ${manifest.name}@${manifest.version}`);
console.log(`  tarball : ${delivery.tarball} (${bytes.length} bytes, ${delivery.files.length} files)`);
console.log(`  sha256  : ${digest}`);
console.log(`  manifest: ${path.relative(root, manifestPath).split(path.sep).join('/')}`);
console.log(`  install : ${delivery.install}`);
console.log(`  peers   : ${Object.entries(delivery.peerDependencies).map(([name, range]) => `${name}@${range}`).join(', ')}`);
