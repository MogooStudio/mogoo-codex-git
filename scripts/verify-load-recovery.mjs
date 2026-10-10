import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const refresh = page.getByRole('button', { name: '刷新', exact: true });
  const fail = route => route.fulfill({ status: 503, json: { error: 'Temporary repository read failure' } });
  // Context resolves successfully, but the first repository request fails.
  await page.route('**/api/repository?*', fail);
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd() })}`);
  await page.getByRole('heading', { name: '无法读取当前聊天的仓库', exact: true }).waitFor();
  assert.equal(await refresh.isEnabled(), true);
  await page.getByRole('button', { name: '关闭错误提示' }).click();
  assert.equal(await page.getByRole('heading', { name: '无法读取当前聊天的仓库', exact: true }).isVisible(), true);
  assert.equal(await page.getByText('正在关联当前聊天…', { exact: true }).count(), 0);
  // Retrying successfully must leave the empty state and load real repository data.
  await page.unroute('**/api/repository?*', fail);
  await refresh.click();
  await page.locator('.commit').last().click();
  await page.locator('.details .patch .line').first().waitFor();
  const selected = await page.locator('.commit.active').getAttribute('data-oid');
  // Failures after a successful load retain the selected commit and its content.
  for (const endpoint of ['repository', 'context']) {
    await page.route(`**/api/${endpoint}?*`, fail);
    await refresh.click();
    await page.locator('.error-banner').waitFor();
    assert.equal(await page.locator('.commit.active').getAttribute('data-oid'), selected);
    assert.equal(await page.locator('.welcome').count(), 0);
    await page.getByRole('button', { name: '关闭错误提示' }).click();
    assert.equal(await page.locator('.commit.active').getAttribute('data-oid'), selected);
    await page.unroute(`**/api/${endpoint}?*`, fail);
    await refresh.click();
    await page.waitForFunction(() => !document.querySelector('.refresh').disabled);
    assert.equal(await page.locator('.error-banner').count(), 0);
    assert.equal(await page.locator('.commit.active').getAttribute('data-oid'), selected);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: initial repository failure, dismissible error with persistent failure state, retry recovery, and cached selection retained after context/repository refresh failures.');
} finally { await browser.close(); }
