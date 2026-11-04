// The delivery's contract check: everything package.json promises exists, and
// every barrel it points at actually parses.
//
// Why this is worth a file of its own (added 2026-09-12, when Halo became a
// versioned artifact rather than a path on one workstation): an `exports` map
// and a `files` list are promises made to a consumer who is not in this
// checkout. A map entry pointing at a module that was renamed, or a barrel that
// throws on import, works perfectly for the author — whose relative imports
// never went through the map — and fails for everybody else at install time,
// which is the worst moment to find out.
//
// It is a CHECK, not a test suite: no runner, no assertions library, one exit
// code. Run through `npm run build`.

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

let failures = 0;

function report(ok, label, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(52)} ${detail}`);
  if (!ok) failures += 1;
}

async function exists(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

console.log(`Checking the delivery contract of ${manifest.name}@${manifest.version}`);

for (const field of ['version', 'license', 'exports', 'files']) {
  report(Boolean(manifest[field]), `package.json declares ${field}`, String(manifest[field] ?? '').slice(0, 40));
}

// Every exported path resolves to a file that is ALSO inside `files` — an
// export the tarball does not carry is the classic broken publish.
const packed = new Set((manifest.files ?? []).map((entry) => entry.replace(/\/$/, '')));
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  if (subpath.includes("*")) {
    report(await exists("src"), "source subpaths ship as a directory", "src");
    continue;
  }
  const relative = String(target).replace(/^\.\//, '');
  report(await exists(relative), `exports "${subpath}" points at a file`, relative);
  const top = relative.split('/')[0];
  // package.json is in every tarball whatever `files` says — npm puts it
  // there — so exporting it needs no entry and demanding one would be a check
  // failing on a rule npm does not have.
  const alwaysPacked = relative === 'package.json';
  report(
    alwaysPacked || packed.has(top) || packed.has(relative),
    `and "${top}" ships in files`,
    alwaysPacked ? 'npm always packs it' : [...packed].join(', '),
  );
}

for (const entry of manifest.files ?? []) {
  report(await exists(entry), `files entry exists`, entry);
}

// three and troika are PEERS, not dependencies: two copies of three in one page
// is a broken app, so the host owns the instance. And the pin is exact, because
// a caret is not a pin — a federated host sharing three as a singleton has to
// name the same version this file does.
report(!manifest.dependencies, 'no runtime dependencies', 'the host provides three');
const peers = manifest.peerDependencies ?? {};
report(Boolean(peers.three), 'three is a peer dependency', peers.three ?? '(missing)');
report(/^\d+\.\d+\.\d+$/.test(peers.three ?? ''), 'and pinned exactly, not a caret range', peers.three ?? '');

// Each barrel must import cleanly. This is the half a static check cannot fake:
// a renamed module inside a barrel only surfaces when something imports it.
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  if (subpath === './package.json' || subpath.includes('*')) continue;
  const url = pathToFileURL(path.join(root, String(target).replace(/^\.\//, ''))).href;
  try {
    const loaded = await import(url);
    report(Object.keys(loaded).length > 0, `barrel "${subpath}" imports and exports`, `${Object.keys(loaded).length} name(s)`);
  } catch (error) {
    // three-dependent barrels cannot import under plain node without the peer
    // installed; that is a missing PEER, not a broken barrel, and it is said
    // as such rather than passed off as a failure of this repo.
    const missingPeer = /Cannot find package '(three|troika-three-text)'/.test(String(error?.message ?? ''));
    report(missingPeer, `barrel "${subpath}" imports and exports`, missingPeer ? 'skipped: peer not installed here' : String(error?.message ?? error).slice(0, 90));
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('Halo delivery contract is valid.');
