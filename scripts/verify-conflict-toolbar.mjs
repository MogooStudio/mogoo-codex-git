import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4317';
const branch = 'feature/' + 'long-branch-name-'.repeat(30);
const patch = 'diff --cc conflict.js\nindex a,b..c\n--- a/conflict.js\n+++ b/conflict.js\n@@@ -1,3 -1,3 +1,7 @@@\n  function run() {\n++<<<<<<< HEAD\n +\t    ours();\n++=======\n+     theirs();\n++>>>>>>> topic\n  }\n';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Override response data only; do not create branches or conflict files.
  await page.route('**/api/repository?*', async route => {
    const response = await route.fetch();
    const repo = await response.json();
    await route.fulfill({ json: { ...repo, branch, files: [{ path: 'conflict.js', index: 'U', worktree: 'U', conflict: true }] } });
  });
  await page.route('**/api/patch?*', route => route.fulfill({ json: { patch } }));
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd(), token: process.env.UI_AUTH_TOKEN || '' })}`);
  await page.locator('.branch-name').waitFor();
  assert.equal(await page.locator('.branch').getAttribute('title'), branch);
  for (const width of [1600, 1100, 760, 601, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const controls = await page.locator('.toolbar-actions button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    assert.ok(controls.every(rect => rect.width > 0 && rect.left >= 0 && rect.right <= width), `toolbar clipped at ${width}px`);
    assert.equal(await page.locator('.branch-name').isVisible(), true);
    if (width > 600) assert.ok(await page.locator('.branch-name').evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis'));
    await page.getByRole('button', { name: '界面主题' }).click();
    await page.locator('.theme-dark').click();
    assert.equal(await page.locator('html').getAttribute('data-git-theme'), 'dark');
    await page.getByRole('button', { name: '界面主题' }).click();
    await page.locator('.theme-light').click();
    assert.equal(await page.locator('html').getAttribute('data-git-theme'), 'light');
  }
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('button', { name: '刷新', exact: true }).isEnabled();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const raw = page.locator('.changes-view .raw-diff');
  await raw.waitFor();
  assert.equal(await raw.textContent(), patch.slice(0, -1));
  assert.equal(await raw.evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
  assert.equal(await page.locator('.changes-view .patch .hunk').count(), 0);
  assert.equal(await page.getByRole('button', {name:'查找差异'}).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: conflict patch whitespace and prefixes preserved; long branch ellipsis, full-name tooltip and toolbar controls at 1600/1100/760/601/390px.');
} finally { await browser.close(); }
