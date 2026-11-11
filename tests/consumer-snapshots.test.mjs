import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareConsumers } from '../scripts/consumer-snapshots.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('consumer snapshots ignore another branch, dirty sources and missing live dependencies', async () => {
  const scratch = resolve('.scratchpad');
  await mkdir(scratch, { recursive: true });
  const fixture = await mkdtemp(join(scratch, 'consumer-snapshots-test-'));
  let snapshot;
  try {
    const sourceRoot = join(fixture, 'siblings');
    const source = join(sourceRoot, 'game');
    await mkdir(join(source, 'vendor', 'halo'), { recursive: true });
    await writeFile(join(source, 'index.html'), '<canvas></canvas>');
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'game', version: '1.0.0', dependencies: { '@rb/halo': 'file:vendor/halo' } }));
    await writeFile(join(source, 'vendor', 'halo', 'package.json'), JSON.stringify({ name: '@rb/halo', version: '1.0.0' }));
    await writeFile(join(source, 'vendor', 'halo', 'core.js'), 'export const baseline = true;');
    await writeFile(join(source, 'package-lock.json'), JSON.stringify({
      name: 'game', version: '1.0.0', lockfileVersion: 3, requires: true,
      packages: {
        '': { name: 'game', version: '1.0.0', dependencies: { '@rb/halo': 'file:vendor/halo' } },
        'node_modules/@rb/halo': { resolved: 'vendor/halo', link: true },
        'vendor/halo': { name: '@rb/halo', version: '1.0.0' },
      },
    }));
    git(source, 'init', '-b', 'main');
    git(source, 'add', '.');
    git(source, '-c', 'user.name=Gate test', '-c', 'user.email=gate@example.invalid', 'commit', '-m', 'baseline');
    const commit = git(source, 'rev-parse', 'HEAD');
    git(source, 'update-ref', 'refs/remotes/origin/main', commit);
    git(source, 'switch', '-c', 'other-agent');
    await writeFile(join(source, 'index.html'), 'broken unrelated branch');
    await writeFile(join(source, 'package.json'), '{}');
    git(source, 'add', '.');
    git(source, '-c', 'user.name=Gate test', '-c', 'user.email=gate@example.invalid', 'commit', '-m', 'unrelated changes');
    await rm(join(source, 'vendor', 'halo', 'core.js'));
    const status = git(source, 'status', '--porcelain');
    const head = git(source, 'rev-parse', 'HEAD');

    snapshot = await prepareConsumers(sourceRoot, join(fixture, 'runs'));
    assert.equal(snapshot.consumers.length, 1);
    assert.equal(snapshot.consumers[0].commit, commit);
    const folder = snapshot.consumers[0].folder;
    assert.equal(await readFile(join(folder, 'index.html'), 'utf8'), '<canvas></canvas>');
    assert.equal(await readFile(join(folder, 'node_modules', '@rb', 'halo', 'core.js'), 'utf8'), 'export const baseline = true;');
    assert.equal(git(source, 'rev-parse', 'HEAD'), head);
    assert.equal(git(source, 'branch', '--show-current'), 'other-agent');
    assert.equal(git(source, 'status', '--porcelain'), status);

    await assert.rejects(prepareConsumers(sourceRoot, join(fixture, 'failed'), ['game'], () => { throw new Error('install failed'); }), /install failed/);
    assert.deepEqual(await readdir(join(fixture, 'failed')), []);
    await assert.rejects(prepareConsumers(sourceRoot, join(fixture, 'missing'), ['typo']), /selected consumers not found/);
    assert.deepEqual(await readdir(join(fixture, 'missing')), []);

    git(source, 'switch', 'main');
    await rm(join(source, 'package-lock.json'));
    git(source, 'add', 'package-lock.json');
    git(source, '-c', 'user.name=Gate test', '-c', 'user.email=gate@example.invalid', 'commit', '-m', 'missing lockfile');
    git(source, 'update-ref', 'refs/remotes/origin/main', git(source, 'rev-parse', 'HEAD'));
    await assert.rejects(prepareConsumers(sourceRoot, join(fixture, 'unlocked'), ['game'], () => assert.fail('must require a lock before installing')), /ENOENT/);
    assert.deepEqual(await readdir(join(fixture, 'unlocked')), []);
  } finally {
    await snapshot?.dispose();
    await rm(fixture, { recursive: true, force: true });
  }
});
