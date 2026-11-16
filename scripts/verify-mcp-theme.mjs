import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPanelHandler } from '../server/git-panel.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const handle = createPanelHandler();
const uri = 'ui://mogoo-codex-git/panel.html';
const { contents: [panel] } = await handle('resources/read', { uri });
const base = 'http://127.0.0.1:4317';
const dark = 'rgb(40, 44, 52)';
const light = 'rgb(250, 250, 250)';

// Model the host's theme attribute separately from its MCP theme notifications.
const app = panel.text.replace('</head>', `<script>
window.addEventListener('message', ({ source, data }) => {
  if (source !== parent) return;
  const theme = data?.result?.hostContext?.theme ?? data?.params?.theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
});
</script></head>`);
const host = `<!doctype html><meta charset="utf-8"><iframe sandbox="allow-scripts" src="/panel"></iframe>
<style>iframe { width: 100%; height: 90vh; border: 0; }</style>
<script>
const panel = document.querySelector('iframe');
const hostContext = location.search ? {} : { theme: 'dark' };
window.changeHostTheme = theme => panel.contentWindow.postMessage({
  jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme },
}, '*');
window.addEventListener('message', ({ source, data }) => {
  if (source !== panel.contentWindow || data?.id == null) return;
  const result = data.method === 'ui/initialize'
    ? { hostContext }
    : { structuredContent: { state: 'unbound', cwd: '', root: '' } };
  source.postMessage({ jsonrpc: '2.0', id: data.id, result }, '*');
});
</script>`;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ colorScheme: 'light', viewport: { width: 600, height: 900 } });
  await page.route(`${base}/**`, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: new URL(route.request().url()).pathname === '/panel' ? app : host,
  }));
  await page.goto(base);
  const frame = page.frameLocator('iframe');
  const body = frame.locator('body');
  const picker = frame.getByRole('button', { name: '界面主题' });
  const chosen = picker.locator('span');
  const background = () => body.evaluate(el => getComputedStyle(el).backgroundColor);
  await frame.getByRole('heading', { name: '等待当前聊天关联' }).waitFor();
  assert.equal(await background(), dark, '打开面板时使用 Codex 深色，即使系统是浅色');
  assert.notEqual(await chosen.textContent(), '浅色', '深色面板不能显示浅色已选中');
  assert.equal(await chosen.textContent(), '跟随');

  const changeHostTheme = theme => page.evaluate(value => window.changeHostTheme(value), theme);
  await changeHostTheme('light');
  await frame.locator('html[data-git-theme="light"]').waitFor({ state: 'attached' });
  assert.equal(await background(), light);
  assert.equal(await chosen.textContent(), '跟随');

  await picker.click();
  await frame.getByRole('button', { name: '深色', exact: true }).click();
  assert.equal(await background(), dark);
  assert.equal(await chosen.textContent(), '深色');
  await changeHostTheme('dark');
  await changeHostTheme('light');
  await frame.locator('html[data-theme="light"]').waitFor({ state: 'attached' });
  assert.equal(await background(), dark, '宿主切换主题时保留手动选择');

  await picker.click();
  await frame.getByRole('button', { name: '跟随 Codex', exact: true }).click();
  assert.equal(await background(), light);
  assert.equal(await chosen.textContent(), '跟随');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${base}/?without-host-theme`);
  await frame.getByRole('heading', { name: '等待当前聊天关联' }).waitFor();
  assert.equal(await background(), dark);
  await page.emulateMedia({ colorScheme: 'light' });
  await frame.locator('html[data-git-theme="light"]').waitFor({ state: 'attached' });
  assert.equal(await background(), light);
  console.log('PASS: initial and live Codex theme, manual override, return to follow mode and system fallback.');
} finally {
  await browser.close();
}
