import test from 'node:test';
import assert from 'node:assert/strict';

let fixtureId = 0;
async function themeFixture(t, { panel = false, dark = false, saved, url = 'http://127.0.0.1:4317/?cwd=repo' } = {}) {
  const keys = ['window', 'document', 'matchMedia', 'localStorage'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  t.after(() => keys.forEach((key, index) => {
    if (previous[index]) Object.defineProperty(globalThis, key, previous[index]);
    else delete globalThis[key];
  }));
  const storageKey = panel ? 'mogoo-codex-git-codex-theme' : 'mogoo-codex-git-theme';
  const storage = new Map(saved ? [[storageKey, saved]] : []);
  const changes = new Set();
  const media = {
    matches: dark,
    addEventListener: (_, listener) => changes.add(listener),
    removeEventListener: (_, listener) => changes.delete(listener),
  };
  const win = { location: new URL(url), history: {
    state: null,
    replaceState(_state, _title, target) { win.location = new URL(target, win.location); },
  } };
  globalThis.window = win;
  globalThis.document = { documentElement: { hasAttribute: () => panel, dataset: {} } };
  globalThis.matchMedia = () => media;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const theme = await import(`../src/theme.js?fixture=${++fixtureId}`);
  return { theme, win, storage, media, changeSystem(value) {
    media.matches = value;
    for (const listener of changes) listener();
  } };
}

test('从 Codex 打开的网页继承跟随模式和当前颜色，覆盖网页旧选择并响应系统变化', async t => {
  const { theme, win, changeSystem } = await themeFixture(t, {
    saved: 'light', dark: false,
    url: 'http://127.0.0.1:4317/?cwd=repo&theme=follow&colorScheme=dark',
  });
  assert.equal(theme.readThemeMode(), 'follow');
  assert.equal(theme.getDefaultTheme(), 'dark', '打开时继承源面板颜色，不能跳到浏览器默认浅色');
  theme.applyTheme(theme.getDefaultTheme());
  let notifications = 0;
  const unsubscribe = theme.subscribeTheme(() => { notifications++; theme.applyTheme(theme.getDefaultTheme()); });
  changeSystem(true);
  changeSystem(false);
  assert.equal(theme.getDefaultTheme(), 'light');
  assert.equal(notifications, 2);
  assert.equal(win.location.searchParams.get('colorScheme'), 'light', '刷新链接不能恢复过期颜色');
  unsubscribe();
});

test('网页手动改色后刷新保留新选择，显式打开时保留中文 worktree 和目录参数', async t => {
  const { theme, win } = await themeFixture(t, {
    saved: 'light', url: 'http://127.0.0.1:4317/?cwd=repo&theme=follow&colorScheme=dark',
  });
  theme.saveThemeMode('light');
  theme.applyTheme('light');
  assert.equal(theme.readThemeMode(), 'light');
  assert.equal(win.location.searchParams.get('theme'), 'light');
  assert.equal(win.location.searchParams.get('colorScheme'), 'light');
  const original = new URL('http://127.0.0.1:4320/?cwd=repo');
  original.searchParams.set('cwd', 'E:\\项目 # & 空格\\聊天 worktree');
  for (const mode of ['follow', 'light', 'dark']) {
    const url = new URL(theme.withPanelTheme(original.href, mode, 'dark'));
    assert.equal(url.searchParams.get('cwd'), original.searchParams.get('cwd'));
    assert.equal(url.searchParams.get('theme'), mode);
    assert.equal(url.searchParams.get('colorScheme'), 'dark');
  }
});

test('从手动主题恢复跟随时清除启动颜色，立即使用当前系统主题', async t => {
  const { theme } = await themeFixture(t, {
    dark: false, url: 'http://127.0.0.1:4317/?cwd=repo&theme=dark&colorScheme=dark',
  });
  assert.equal(theme.readThemeMode(), 'dark');
  let notifications = 0;
  const unsubscribe = theme.subscribeTheme(() => { notifications++; });
  theme.saveThemeMode('follow');
  assert.equal(theme.readThemeMode(), 'follow');
  assert.equal(theme.getDefaultTheme(), 'light');
  assert.equal(notifications, 1);
  unsubscribe();
});

test('直接打开的网页仍跟随系统；原生面板仍优先跟随 Codex 的主题通知', async t => {
  const { theme, changeSystem } = await themeFixture(t, { dark: false });
  assert.equal(theme.readThemeMode(), 'follow');
  assert.equal(theme.getDefaultTheme(), 'light');
  const unsubscribe = theme.subscribeTheme(() => {});
  changeSystem(true);
  assert.equal(theme.getDefaultTheme(), 'dark');
  theme.setHostTheme('light');
  assert.equal(theme.getDefaultTheme(), 'light');
  changeSystem(true);
  assert.equal(theme.getDefaultTheme(), 'light');
  unsubscribe();
});

test('原生面板忽略网页启动参数，保留自己的主题选择', async t => {
  const { theme } = await themeFixture(t, {
    panel: true, saved: 'dark', url: 'http://127.0.0.1:4317/?theme=light&colorScheme=light',
  });
  assert.equal(theme.readThemeMode(), 'dark');
});

test('无效网页主题参数不会覆盖已有选择', async t => {
  const { theme } = await themeFixture(t, {
    saved: 'dark', url: 'http://127.0.0.1:4317/?theme=follow&colorScheme=invalid',
  });
  assert.equal(theme.readThemeMode(), 'dark');
  assert.equal(theme.getDefaultTheme(), 'light');
});
