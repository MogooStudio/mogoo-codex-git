import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4317';
const files = Array.from({ length: 60 }, (_, i) => ({ path: `src/file-${String(i).padStart(2, '0')}.js`, status: 'M', index: 'M', worktree: 'M' }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/commit?*', route => route.fulfill({ json: { body: 'Many changed files', author: 'Test', date: '2026-10-10T00:00:00Z', parents: [], files } }));
  await page.route('**/api/repository?*', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), files } });
  });
  await page.route('**/api/patch?*', route => route.fulfill({ json: { patch: '@@ -1 +1 @@\n-old\n+new\n' } }));
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd() })}`);
  const trigger = page.locator('.file-menu summary:visible');
  await trigger.waitFor();
  for (const [width, height] of [[390,600], [390,500], [760,420], [1600,1000]]) {
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
  await page.getByRole('button', {name:'改动',exact:true}).click();
  await trigger.click();
  await page.locator('.file-menu-list button').last().click();
  assert.match(await trigger.innerText(), /file-59/);
  await trigger.click();
  await page.locator('.project').click();
  assert.equal(await page.locator('.file-menu-popup').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: 60 files, last-item mouse/keyboard access, resize while open, changes picker and outside/Escape dismissal at desktop and low-height narrow sizes.');
} finally { await browser.close(); }
