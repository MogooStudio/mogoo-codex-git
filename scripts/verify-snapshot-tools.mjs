import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/index.mjs';
import { createPanelHandler } from '../server/git-panel.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temporary = await realpath(os.tmpdir());
const root = await mkdtemp(path.join(temporary, 'git-lens-snapshot-ui-'));
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let server, browser;
try {
  git('init', '-b', 'main');
  git('config', 'user.name', 'Snapshot Tester');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  await writeFile(path.join(root, 'before.txt'), 'original\nshared\ncontext\n');
  git('add', '.'); git('commit', '-m', 'Initial file');
  git('mv', 'before.txt', 'after.txt'); git('commit', '-m', 'Rename file');
  await writeFile(path.join(root, 'after.txt'), 'committed\nshared\ncontext\n');
  git('commit', '-am', 'Change first line');
  const head = git('rev-parse', 'HEAD');
  await writeFile(path.join(root, 'after.txt'), 'staged\nshared\ncontext\n'); git('add', '.');
  await writeFile(path.join(root, 'after.txt'), 'working\nshared\ncontext\n');
  await writeFile(path.join(root, 'stash-untracked.txt'), 'saved untracked content\n');
  git('stash', 'push', '-u', '-m', 'Snapshot fixture');
  await writeFile(path.join(root, 'after.txt'), 'uncommitted\nshared\ncontext\n');

  const token = 'snapshot-test-token';
  server = await createServer({ token });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 588, height: 880 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/?${new URLSearchParams({ cwd: root, token })}`);
  const nav = page.getByRole('navigation', { name: '仓库导航' });
  const view = name => nav.getByRole('button', { name, exact: true });
  const patch = page.locator('.patch:visible');
  const expectText = async (locator, pattern) => {
    await locator.waitFor();
    assert.match((await locator.innerText()).replace(/\s+/g, ' '), pattern);
  };

  await nav.waitFor();
  assert.deepEqual(await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['改动', '历史', '工作树', 'Stash']);
  assert.equal(await page.getByRole('button', { name: '与 HEAD 比较' }).count(), 0);
  await view('工作树').click();
  await expectText(page.locator('.worktree-list'), /当前聊天/);
  await view('改动').click();
  await expectText(patch, /uncommitted/);

  await page.getByRole('button', { name: '文件历史', exact: true }).click();
  const history = page.getByRole('region', { name: '文件历史' });
  await expectText(history.getByRole('button', { name: /Rename file/ }), /before\.txt → after\.txt/);
  await history.getByRole('button', { name: /Change first line/ }).click();
  await expectText(patch, /\+\s*committed/);
  assert.doesNotMatch(await patch.innerText(), /uncommitted/);
  await page.getByRole('button', { name: '行归属', exact: true }).click();
  await page.getByRole('button', { name: '查看新第 1 行归属' }).click();
  await page.locator(`.line-attribution code[title="${head}"]`).waitFor();
  await expectText(page.locator('.line-attribution'), /Snapshot Tester.*Change first line/);
  await page.getByRole('button', { name: '行归属', exact: true }).click();
  await page.getByRole('button', { name: '文件历史', exact: true }).click();
  await history.getByRole('button', { name: /Initial file/ }).click();
  await expectText(page.locator('.diff-title'), /before\.txt/);
  await expectText(patch, /original/);
  await page.getByRole('button', { name: '返回原差异' }).click();
  await expectText(patch, /uncommitted/);

  await page.setViewportSize({ width: 390, height: 844 });
  await view('历史').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await view('Stash').click();
  assert.equal(await view('Stash').getAttribute('aria-current'), 'page');
  await expectText(patch, /working/);
  const snapshot = page.getByRole('group', { name: 'Stash 快照' });
  await snapshot.getByRole('button', { name: '已暂存', exact: true }).click();
  await expectText(patch, /staged/);
  await snapshot.getByRole('button', { name: '未跟踪', exact: true }).click();
  await expectText(patch, /saved untracked content/);
  assert.equal(await page.getByRole('button', { name: '行归属' }).count(), 0);

  const handle = createPanelHandler({ lookupCwd: async () => root });
  const { contents: [resource] } = await handle('resources/read', { uri: 'ui://mogoo-codex-git/panel.html' });
  await page.exposeFunction('callSnapshotTool', async params => handle('tools/call', {
    ...params, _meta: { threadId: '00000000-0000-0000-0000-000000000123' },
  }));
  const host = `<!doctype html><iframe sandbox="allow-scripts" src="/mcp-test-panel" style="width:100%;height:95vh;border:0"></iframe>
    <script>
      const panel = document.querySelector('iframe');
      window.addEventListener('message', async ({source,data}) => {
        if (source !== panel.contentWindow || data?.id == null) return;
        const result = data.method === 'ui/initialize' ? { hostContext: { theme: 'dark' } } : await window.callSnapshotTool(data.params);
        source.postMessage({jsonrpc:'2.0',id:data.id,result}, '*');
      });
    </script>`;
  await page.route(`${origin}/mcp-test-host`, route => route.fulfill({ contentType: 'text/html', body: host }));
  await page.route(`${origin}/mcp-test-panel`, route => route.fulfill({ contentType: 'text/html', body: resource.text }));
  await page.setViewportSize({ width: 588, height: 880 });
  await page.goto(`${origin}/mcp-test-host`);
  const frame = page.frameLocator('iframe');
  await expectText(frame.locator('.branch-name'), /^main$/);
  await frame.getByRole('button', { name: 'Stash', exact: true }).click();
  await frame.getByRole('group', { name: 'Stash 快照' }).getByRole('button', { name: '未跟踪', exact: true }).click();
  await expectText(frame.locator('.patch:visible'), /saved untracked content/);
  assert.deepEqual(errors, []);
  assert.equal(git('rev-parse', 'HEAD'), head);
  assert.match(git('stash', 'list'), /Snapshot fixture/);
  console.log('PASS: visible worktree and Stash tabs, narrow layout, source rename history and attribution, all stash snapshots, sandboxed MCP entry.');
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(await realpath(root)), temporary);
  assert.ok(path.basename(root).startsWith('git-lens-snapshot-ui-'));
  await rm(root, { recursive: true, force: true });
}
