import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { packagePlugin } from './package-plugin.mjs';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'mogoo-marketplace-')));

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Generated package must not contain symlinks: ${name}`);
    if (entry.isDirectory()) result.push(...await files(directory, name));
    else result.push(name);
  }
  return result.sort();
}

try {
  const generated = await packagePlugin(path.join(temporary, 'marketplace'));
  const name = 'mogoo-codex-git';
  assert.equal(path.basename(generated.pluginRoot), name);
  const pluginParent = path.join(root, 'plugins');
  const destination = path.join(pluginParent, name);
  const catalogPath = path.join('.agents', 'plugins', 'marketplace.json');
  const catalogSource = path.join(generated.marketplaceRoot, catalogPath);
  const catalogDestination = path.join(root, catalogPath);
  if (values.check) {
    const expected = await files(generated.pluginRoot);
    assert.deepEqual(await files(destination), expected, 'Bundled plugin files are stale; run pnpm marketplace:sync');
    for (const file of expected) assert.deepEqual(await readFile(path.join(destination, file)), await readFile(path.join(generated.pluginRoot, file)), `Stale bundled file: ${file}`);
    assert.deepEqual(await readFile(catalogDestination), await readFile(catalogSource), 'Marketplace catalog is stale');
    console.log('Repository marketplace matches the built plugin.');
  } else {
    await mkdir(pluginParent, { recursive: true });
    // Only replace our generated package, never follow a linked parent/target.
    assert.equal(await realpath(pluginParent), pluginParent);
    assert.equal(path.dirname(destination), pluginParent);
    const existing = await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existing) {
      assert.ok(existing.isDirectory() && !existing.isSymbolicLink(), 'Refusing to replace a linked package');
      assert.equal(JSON.parse(await readFile(path.join(destination, 'plugin.json'), 'utf8')).name, name);
      await rm(destination, { recursive: true });
    }
    await cp(generated.pluginRoot, destination, { recursive: true });
    await mkdir(path.dirname(catalogDestination), { recursive: true });
    await cp(catalogSource, catalogDestination);
    console.log(`Updated ${path.relative(root, destination)} and ${catalogPath}`);
  }
} finally {
  assert.equal(path.dirname(temporary), await realpath(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('mogoo-marketplace-'));
  await rm(temporary, { recursive: true, force: true });
}
