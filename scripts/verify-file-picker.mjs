import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4317';
const files = Array.from({ length: 60 }, (_, i) => ({ path: `src/file-${String(i).padStart(2, '0')}.js`, status: 'M', index: 'M', worktree: 'M' }));
const conflict = { path: 'src/conflict.js', status: 'U', index: 'U', worktree: 'U', conflict: true };
const patch = '@@ -1 +1,2 @@\n-old\n+needle[1] needle[1]\n+nearby\n@@ -10 +11 @@\n-old\n+needle[1]\n';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1036, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/commit?*', route => route.fulfill({ json: { body: 'Many changed files', author: 'Test', date: '2026-10-10T00:00:00Z', parents: [], files } }));
  await page.route('**/api/repository?*', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), files: [...files, conflict] } });
  });
  await page.route('**/api/patch?*', route => route.fulfill({ json: { patch } }));
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd(), token: process.env.UI_AUTH_TOKEN || '' })}`);
  const trigger = page.locator('.file-menu summary:visible');
  await trigger.waitFor();
  await page.locator('.commit.active').click();
  await trigger.click();
  const commitFilter = page.locator('.file-menu-popup').getByRole('textbox', { name: '按文件名或路径筛选' });
  await commitFilter.fill('FILE-59');
  assert.equal(await page.locator('.file-menu-list button').count(), 1);
  await commitFilter.press('Enter');
  assert.match(await trigger.innerText(), /file-59/);
  for (const [width, height] of [[390,600], [390,500], [760,420], [1036,1000], [1440,900], [1036,900]]) {
    await page.setViewportSize({ width, height });
    await trigger.click();
    const last = page.locator('.file-menu-list button').last();
    await last.scrollIntoViewIfNeeded();
    const rect = await last.boundingBox();
    assert.ok(rect.y >= 0 && rect.y + rect.height <= height, `last option clipped at ${width}x${height}`);
    await last.click();
    assert.match(await trigger.innerText(), /file-59/);
    assert.equal(await page.locator('.file-menu-popup').count(), 0);
    await trigger.click();
    await page.locator('.file-menu-popup').waitFor();
    await trigger.press('Tab');
    await page.keyboard.press('End');
    assert.equal(await page.locator('.file-menu-list button').last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  }
  await trigger.click();
  await page.setViewportSize({ width:390, height:600 });
  await page.locator('.file-menu-list button').last().click();
  await page.locator('.history-content .patch').focus();
  for (const name of ['文件历史', '行归属', '查找差异', '上一处差异', '下一处差异']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
  }
  await page.keyboard.press('Control+f');
  assert.equal(await page.locator('.history-content .diff-find').count(), 0);

  await page.getByRole('button', {name:'改动',exact:true}).click();
  await page.getByRole('button', {name:'1 个冲突',exact:true}).click();
  await page.getByText('此文件存在合并冲突。', {exact:true}).waitFor();
  assert.match(await page.locator('.diff-title').innerText(), /conflict\.js/);
  await trigger.click();
  await page.locator('.file-menu-popup').waitFor();
  assert.deepEqual(await page.locator('.file-menu-group').allTextContents(), ['合并的更改1', '暂存的更改60', '更改60']);
  const pathFilter = page.locator('.file-menu-popup').getByRole('textbox', {name:'按文件名或路径筛选'});
  await pathFilter.fill('SRC/FILE-59');
  assert.equal(await page.locator('.file-menu-list button').count(), 2);
  await page.locator('.file-menu-list [aria-label="暂存的更改"] button').click();
  const title = page.locator('.changes-view .diff-title');
  assert.equal(await title.locator('strong').innerText(), 'file-59.js');
  assert.equal(await title.locator('.diff-path small').innerText(), 'HEAD → 暂存区');
  assert.equal(await title.locator('svg,code').count(), 0);
  for (const name of ['查找差异', '上一处差异', '下一处差异']) {
    assert.equal(await page.getByRole('button', { name, exact:true }).count(), 0);
  }
  await page.locator('.patch:visible').focus();
  await page.keyboard.press('Control+f');
  assert.equal(await page.locator('.changes-view .diff-find').count(), 0);
  await page.getByRole('button', { name: '复制第 11 行位置' }).click();
  await page.waitForFunction(() => document.querySelector('.changes-view .line-copy-feedback').textContent === '已复制 src/file-59.js:11');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'src/file-59.js:11');
  await trigger.click();
  await page.locator('.project').click();
  assert.equal(await page.locator('.file-menu-popup').count(), 0);
  await trigger.click();
  await page.setViewportSize({ width: 1036, height: 900 });
  await page.locator('.file-menu-popup').waitFor({state:'detached'});
  const sidebar = page.locator('.sidebar');
  await sidebar.getByRole('textbox', {name:'按文件名或路径筛选'}).fill('src/file-59');
  await sidebar.getByRole('button', {name:/file-59/}).first().waitFor();
  assert.equal(await sidebar.getByRole('button', {name:/file-59/}).count(), 2);
  await page.locator('.split-patch').waitFor();
  assert.equal(await page.locator('.split-pair .remove').count(), 2);
  assert.equal(await page.locator('.split-pair .add').count(), 3);
  await page.getByRole('button', {name:'统一差异'}).click();
  assert.equal(await page.locator('.split-patch').count(), 0);
  await page.getByRole('button', {name:'左右对照'}).click();
  await page.setViewportSize({width:588,height:880});
  await page.getByRole('button', {name:'左右对照'}).waitFor({state:'hidden'});
  await page.getByRole('button', {name:'历史',exact:true}).click();
  await page.locator('.history-content').waitFor();
  await page.getByRole('button', {name:'改动',exact:true}).click();
  assert.match(await page.locator('.diff-title:visible').innerText(), /file-59\.js/);
  assert.deepEqual(errors, []);
  console.log('PASS: commit picker keyboard/resize, branch diff tools hidden, grouped changes and conflict jump, narrow/wide path filtering, line clipboard.');
} finally { await browser.close(); }
