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
  // Synthetic history is injected at the HTTP boundary; no repository writes.
  await page.route('**/api/history?*', route => route.fulfill({ json: {
    commits: [['a','d'], ['b','e'], ['c','f'], ['d','root'], ['e','root'], ['f','root'], ['root']].map(([oid, parent]) => ({ oid: oid.padEnd(40, '0'), parents: parent ? [parent.padEnd(40, '0')] : [], subject: `Parallel branch ${oid}`, author: 'Test', date: '2026-10-10T00:00:00Z' })), hasMore: false,
  } }));
  await page.route('**/api/commit?*', route => route.fulfill({ json: { body: 'Graph layout fixture', author: 'Test', date: '2026-10-10T00:00:00Z', parents: [], files: [] } }));
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd() })}`);
  await page.locator('.commit').nth(6).waitFor();
  for (const width of [1600, 760, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let selected = 0; selected < 7; selected++) {
      await page.locator('.commit').nth(selected).click();
      const geometry = await page.locator('.commit').evaluateAll(rows => rows.map(row => {
        const titleLeft = row.querySelector('.commit-text').getBoundingClientRect().left;
        const rightmost = Math.max(...[...row.querySelectorAll('circle,path')].map(shape => shape.getBoundingClientRect().right));
        return { titleLeft, rightmost };
      }));
      for (const row of geometry) assert.ok(row.rightmost + 1 < row.titleLeft, `${width}px: graph overlaps title: ${JSON.stringify(row)}`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: three parallel branches, all active halos and edges fit before titles at 1600/760/390px.');
} finally { await browser.close(); }
