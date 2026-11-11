import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Read only committed origin/main metadata. A sibling's branch, dirty files and
// node_modules are never inputs, and neither fetch nor install runs in that sibling.
export async function prepareConsumers(sourceRoot, scratch, only = [], install = installDependencies) {
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, 'consumer-gate-'));
  const dispose = () => rm(root, { recursive: true, force: true });
  try {
    const consumers = [];
    for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || (only.length && !only.includes(entry.name))) continue;
      const source = join(sourceRoot, entry.name);
      let commit;
      let pkg;
      try {
        // Non-repositories and libraries without an index are not consumers.
        commit = git(source, 'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}');
        git(source, 'cat-file', '-e', `${commit}:index.html`);
        git(source, 'cat-file', '-e', `${commit}:package.json`);
      } catch (error) {
        if (only.includes(entry.name)) throw new Error(`consumer gate: cannot read ${entry.name} origin/main consumer metadata`, { cause: error });
        continue;
      }
      pkg = JSON.parse(git(source, 'show', `${commit}:package.json`));
      const pin = pkg.dependencies?.['@rb/halo'] || pkg.devDependencies?.['@rb/halo'];
      if (!pin) continue;
      const folder = join(root, entry.name);
      console.log(`consumer gate: preparing ${entry.name} origin/main ${commit}`);
      git(sourceRoot, 'clone', '--no-hardlinks', '--no-checkout', '--', source, folder);
      git(folder, 'checkout', '--detach', commit);
      // npm ci must fail on absent/stale locks instead of using a live install.
      await readFile(join(folder, 'package-lock.json'));
      await install(folder);
      consumers.push({ name: entry.name, folder, pin, commit });
    }
    const missing = only.filter((name) => !consumers.some((consumer) => consumer.name === name));
    if (missing.length) throw new Error(`consumer gate: selected consumers not found: ${missing.join(', ')}`);
    if (!consumers.length) throw new Error(`consumer gate: no origin/main consumer under ${sourceRoot}`);
    return { root, consumers, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

function installDependencies(folder) {
  const options = { cwd: folder, stdio: 'inherit' };
  if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/c', 'npm ci --no-audit --no-fund'], options);
  else execFileSync('npm', ['ci', '--no-audit', '--no-fund'], options);
}
