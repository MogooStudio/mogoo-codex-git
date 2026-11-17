import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const analytics = readFileSync(new URL('../docs/site/analytics.js', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../docs/site/site.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const config = Object.fromEntries([...html.matchAll(/data-(clarity-project|site-url|product)="([^"]+)"/g)]
  .map(([, key, value]) => [key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
const canonical = config.siteUrl;

function browser(url = canonical, options = {}) {
  const handlers = {}, scripts = [], removed = [], clipboard = [];
  let factory;
  const scope = {
    URL, location: new URL(url),
    navigator: { clipboard: { writeText: async value => { clipboard.push(value); } }, ...options.navigator },
    document: {
      currentScript: { dataset: { ...config, ...options.config } },
      referrer: options.referrer || '',
      addEventListener: (event, fn) => { (handlers[event] ||= []).push(fn); },
      createElement: tag => ({ tag, style: {}, select() {}, remove() { removed.push(tag); } }),
      head: { appendChild: element => scripts.push(element) },
      body: { append() {} }, execCommand: options.execCommand || (() => false),
    },
    addEventListener() {},
    Alpine: { data: (_, value) => { factory = value; } },
  };
  scope.window = scope;
  const context = vm.createContext(scope);
  function run(source) { vm.runInContext(source, context); }
  function fire(event, value) { for (const fn of handlers[event] || []) fn(value); }
  function calls() { return JSON.parse(JSON.stringify(scope.mogooAnalyticsDebug || Array.from(scope.clarity?.q || [], args => Array.from(args)))); }
  run(analytics);
  return { scope, scripts, removed, clipboard, fire, run, calls,
    install() { run(installer); fire('alpine:init'); return factory(); } };
}

test('only canonical production paths load Clarity; preview, captures and opt-out stay offline', () => {
  for (const url of [canonical, canonical + 'index.html', canonical.replace(/\/$/, '')]) {
    const b = browser(url);
    assert.deepEqual(b.scripts.map(s => s.src), ['https://www.clarity.ms/tag/' + config.clarityProject]);
    assert.deepEqual(b.calls()[0], ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }]);
  }
  for (const url of ['http://localhost:8765/mogoo-codex-git/', 'https://preview.example/mogoo-codex-git/',
    'https://mogoostudio.github.io/another-plugin/', canonical.replace('/mogoo-codex-git/', '/mogoo-codex-git-extra/'),
    canonical + '?capture=1', canonical + '?analytics=off']) {
    const b = browser(url);
    assert.equal(b.scripts.length, 0, url);
    assert.equal(b.scope.mogooAnalytics, undefined, url);
  }
  assert.equal(browser(canonical, { navigator: { globalPrivacyControl: true } }).scripts.length, 0);
  assert.equal(browser(canonical, { config: { clarityProject: '' } }).scripts.length, 0);
});

test('UTM sources and placements stay available for installation events; referrer is a fallback', () => {
  for (const channel of ['x', 'bilibili']) {
    const b = browser(canonical + `?utm_source=${channel}&utm_medium=social&utm_campaign=launch&utm_content=profile`);
    b.scope.mogooAnalytics.track('install_copy_success', { method: 'agent', text: 'must not send' });
    assert.ok(b.calls().some(c => c[0] === 'set' && c[1] === 'channel' && c[2] === channel));
    assert.ok(b.calls().some(c => c[1] === 'campaign_content' && c[2] === 'profile'));
    assert.deepEqual(b.calls().at(-1), ['event', 'install_copy_success']);
    assert.ok(!JSON.stringify(b.calls()).includes('must not send'));
  }
  for (const [referrer, expected] of [['https://t.co/abc', 'x'], ['https://www.bilibili.com/video/abc', 'bilibili'],
    ['', 'direct_or_unknown'], ['https://evilbilibili.com/', 'other']]) {
    assert.ok(browser(canonical, { referrer }).calls().some(c => c[1] === 'channel' && c[2] === expected));
  }
});

test('a nested install link click emits once; non-install controls do not emit', () => {
  const b = browser();
  b.run(analytics); // Reinsertion must not attach duplicate listeners.
  b.fire('click', { target: { closest: () => ({ dataset: { installEntry: 'hero' } }) } });
  b.fire('click', { target: { closest: () => null } });
  assert.deepEqual(b.calls().filter(c => c[0] === 'event'), [['event', 'install_click']]);
  assert.equal(b.scripts.length, 1);
});

test('explicit localhost debug records calls without contacting Clarity', () => {
  const b = browser('http://127.0.0.1:8765/mogoo-codex-git/?analytics=debug&utm_source=bilibili');
  b.scope.mogooAnalytics.track('install_click', { entry: 'nav' });
  assert.equal(b.scripts.length, 0);
  assert.equal(b.scope.clarity, undefined);
  assert.deepEqual(b.calls().at(-1), ['event', 'install_click']);
  for (let i = 0; i < 150; i++) b.scope.mogooAnalytics.track('install_click');
  assert.equal(b.calls().length, 100);
});

test('successful clipboard writes and successful fallback each emit one success', async () => {
  for (const fallback of [false, true]) {
    const b = browser(canonical, fallback ? { navigator: { clipboard: { writeText: async () => { throw Error('denied'); } } }, execCommand: () => true } : {});
    const app = b.install();
    app.switchMode('terminal');
    await app.copy();
    assert.equal(app.status, '已复制 ✓');
    assert.equal(app.copying, false);
    assert.deepEqual(b.calls().filter(c => c[0] === 'event'), [['event', 'install_copy_success']]);
    assert.ok(b.calls().some(c => c[1] === 'install_method' && c[2] === 'terminal'));
    if (fallback) assert.deepEqual(b.removed, ['textarea']);
    else assert.deepEqual(b.clipboard, [app.command]);
  }
});

test('copy failure emits no success and cleans up fallback field', async () => {
  for (const execCommand of [() => false, () => { throw Error('denied'); }]) {
    const b = browser(canonical, { navigator: { clipboard: undefined }, execCommand });
    const app = b.install();
    await app.copy();
    assert.equal(app.status, '请选中文字复制');
    assert.equal(app.copying, false);
    assert.deepEqual(b.calls().filter(c => c[0] === 'event'), []);
    assert.deepEqual(b.removed, ['textarea']);
  }
});

test('pending copy ignores repeated clicks and records its original method after tab switch', async () => {
  let resolve;
  const b = browser(canonical, { navigator: { clipboard: { writeText: () => new Promise(r => { resolve = r; }) } } });
  const app = b.install();
  const pending = app.copy();
  await app.copy();
  app.switchMode('terminal');
  resolve();
  await pending;
  assert.equal(app.status, '复制');
  assert.equal(app.copying, false);
  assert.ok(b.calls().some(c => c[1] === 'install_method' && c[2] === 'agent'));
  assert.equal(b.calls().filter(c => c[0] === 'event').length, 1);
});

test('missing, blocked and throwing analytics never turn a successful copy into a failure', async () => {
  const local = browser('http://localhost/');
  const blocked = browser();
  blocked.scripts[0].onerror();
  const throwing = browser();
  throwing.scope.clarity = () => { throw Error('blocked'); };
  for (const b of [local, blocked, throwing]) {
    const app = b.install();
    await app.copy();
    assert.equal(app.status, '已复制 ✓');
    assert.equal(b.clipboard.length, 1);
  }
  assert.equal(blocked.calls().length, 0);
});
