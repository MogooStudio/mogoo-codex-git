// Interaction checks only. Visual evidence is captured with Oil UI shoot.
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    const file = path.resolve(__dirname, name);
    if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const check = async expected => {
      await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, expected);
      assert.equal(await page.locator(`.theme-${expected}`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    };
    await page.goto(`${base}/oil-history.html`);
    await check('light');
    await page.locator('.theme-dark').click();
    await check('dark');
    await page.reload();
    await check('dark');
    for (const name of ['changes', 'worktrees', 'narrow']) {
      await page.setViewportSize({ width: name === 'narrow' ? 760 : 1600, height: 1000 });
      await page.goto(`${base}/oil-${name}.html`);
      await check('dark');
    }
    await page.locator('.theme-light').focus();
    await page.keyboard.press('Enter');
    await check('light');
    await page.reload();
    await check('light');
    // A storage failure must not prevent the visual switch.
    await context.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('storage unavailable'); };
      Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };
    });
    await page.reload();
    await check('light');
    await page.locator('.theme-dark').click();
    await check('dark');
    assert.deepEqual(errors, []);
    console.log('PASS: click, keyboard, refresh persistence, four pages, narrow viewport, storage failure, no page errors.');
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
