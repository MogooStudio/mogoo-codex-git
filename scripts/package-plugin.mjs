import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 白名单复制，发布物不包含仓库内容、开发依赖、缓存或本机配置。
export async function packagePlugin(outputRoot) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'codex', 'plugin.json'), 'utf8'));
  if (manifest.name !== pkg.name) throw new Error('插件清单与 package.json 名称不一致。');
  if (manifest.version !== pkg.version) throw new Error('插件清单与 package.json 版本不一致。');
  await access(path.join(root, 'dist', 'index.html'));
  const output = path.resolve(outputRoot || path.join(root, 'release', `${manifest.name}-${pkg.version}`));
  try { await access(output); throw new Error('输出目录已存在，请选择新目录或先归档旧发布物。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const pluginRoot = path.join(output, 'plugins', manifest.name);
  await mkdir(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
  await mkdir(path.join(pluginRoot, 'scripts'), { recursive: true });
  const overlay = { name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author, homepage: manifest.homepage, repository: manifest.repository, license: manifest.license, skills: './skills/', interface: manifest.extensions['com.openai'].interface };
  const json = value => JSON.stringify(value, null, 2) + '\n';
  await writeFile(path.join(pluginRoot, 'plugin.json'), json(manifest));
  await writeFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), json(overlay));
  await writeFile(path.join(pluginRoot, 'package.json'), json({
    name: pkg.name, version: pkg.version, private: true, type: 'module', license: pkg.license, author: pkg.author, homepage: pkg.homepage, repository: pkg.repository, packageManager: pkg.packageManager, engines: pkg.engines,
    scripts: { 'open:chat': 'node scripts/open-chat.mjs', start: 'node server/index.mjs' },
  }));
  // 已构建的运行包没有依赖；隔离父目录工作区，启动时不触发自动安装。
  await writeFile(path.join(pluginRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "."\nverifyDepsBeforeRun: false\n');
  for (const [source, destination] of [
    ['dist', 'dist'], ['server', 'server'], ['codex/skills', 'skills'], ['codex/assets', 'assets'],
    ['scripts/open-chat.mjs', 'scripts/open-chat.mjs'], ['codex/PLUGIN-README.md', 'README.md'], ['LICENSE', 'LICENSE'], ['THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.md'],
  ]) await cp(path.join(root, source), path.join(pluginRoot, destination), { recursive: true });
  const marketplace = {
    name: manifest.name, interface: { displayName: manifest.extensions['com.openai'].interface.displayName },
    plugins: [{ name: manifest.name, source: { source: 'local', path: `./plugins/${manifest.name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }],
  };
  await mkdir(path.join(output, '.agents', 'plugins'), { recursive: true });
  await writeFile(path.join(output, '.agents', 'plugins', 'marketplace.json'), json(marketplace));
  await cp(path.join(root, 'codex', 'PLUGIN-README.md'), path.join(output, 'README.md'));
  return { version: pkg.version, marketplaceRoot: output, pluginRoot };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { output: { type: 'string' } } });
    console.log(JSON.stringify(await packagePlugin(values.output)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
