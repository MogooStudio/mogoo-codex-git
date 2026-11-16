import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelApi } from '../src/mcp-panel.js';

function hostFixture(hostCapabilities, messageResult = {}) {
  const requests = [];
  let receive;
  const document = { hidden: false };
  const parent = {
    postMessage(request) {
      requests.push(request);
      if (request.id == null || !request.method) return;
      const result = request.method === 'ui/initialize' ? { hostCapabilities } :
        typeof messageResult === 'function' ? messageResult(request) : messageResult;
      queueMicrotask(() => notify({ id: request.id, result }));
    },
  };
  const notify = data => receive({ source: parent, data: { jsonrpc: '2.0', ...data } });
  const api = createPanelApi({ document, parent, addEventListener: (_, listener) => { receive = listener; } }, () => {});
  const messages = () => requests.filter(request => request.method === 'ui/message').map(request => request.params);
  return { api, document, notify, messages, requests };
}

test('聊天指令只有显式调用才发送，草稿和直接发送使用不同的宿主参数', async () => {
  const { api, messages } = hostFixture({ experimental: { 'openai/message': {} } });
  assert.deepEqual(await api.messageCapabilities(), { draft: true, send: true });
  assert.deepEqual(messages(), []);
  const text = '分支 feature/abc 合并回 master，先不要推送';
  const message = { role: 'user', content: [{ type: 'text', text }] };
  assert.equal(await api.message(text, 'draft'), true);
  assert.equal(await api.message(text, 'send'), true);
  assert.deepEqual(messages(), [
    { ...message, _meta: { 'openai/message': { target: 'active', send: false } } },
    message,
  ]);
});

test('宿主不支持、面板隐藏或卸载时不会提交聊天消息', async () => {
  const { api, document, notify, messages } = hostFixture({ message: { text: {} } });
  assert.deepEqual(await api.messageCapabilities(), { draft: false, send: true });
  assert.equal(await api.message('本地提交代码', 'draft'), false);
  assert.equal(await api.message('  ', 'send'), false);
  document.hidden = true;
  assert.equal(await api.message('本地提交代码', 'send'), false);
  document.hidden = false;
  notify({ id: 'teardown', method: 'ui/resource-teardown' });
  assert.equal(await api.message('本地提交代码', 'send'), false);
  assert.deepEqual(messages(), []);
});

test('宿主拒绝发送时返回失败，避免自动重试', async () => {
  const { api, messages } = hostFixture({ message: { text: {} } }, { isError: true });
  assert.equal(await api.message('本地提交代码', 'send'), false);
  assert.equal(messages().length, 1);
});

test('浏览器打开先准备当前仓库链接，再交给 Codex 宿主，不发送聊天消息', async () => {
  const url = 'http://127.0.0.1:4317/?cwd=repo&token=test';
  const opened = [];
  const { api, requests, messages } = hostFixture({ openLinks: {} }, request => {
    if (request.method === 'tools/call') return { structuredContent: { url } };
    if (request.method === 'ui/open-link') {
      // Codex's widget link handler silently ignores plain HTTP URLs.
      const target = new URL(request.params.url);
      if (/^(https|codex|codex-dev):$/.test(target.protocol)) opened.push(target);
    }
    return {};
  });
  assert.equal(requests.length, 0);
  const result = await api.call('browser-link', { path: '/chat/repo' }, AbortSignal.timeout(1000));
  await api.openLink(result.url, { inCodexBrowser: true });
  assert.deepEqual(requests.filter(request => request.method === 'tools/call').map(request => request.params), [
    { name: 'git_panel_browser_link', arguments: { path: '/chat/repo' } },
  ]);
  assert.equal(opened.length, 1, '宿主必须接收浏览器打开请求，不能无操作却返回成功');
  assert.equal(opened[0].protocol, 'codex:');
  assert.equal(opened[0].hostname, 'browser');
  assert.equal(opened[0].pathname, '');
  assert.equal(opened[0].searchParams.get('url'), url);
  assert.equal(opened[0].searchParams.size, 1);
  assert.equal(requests.filter(request => request.method === 'ui/open-link').length, 1);
  assert.deepEqual(messages(), []);
});

test('普通更新链接保留 HTTPS，内置浏览器链接保留特殊字符并拒绝非面板地址', async () => {
  const { api, requests } = hostFixture({ openLinks: {} });
  const changelog = 'https://github.com/MogooStudio/mogoo-codex-git/blob/main/CHANGELOG.zh.md';
  await api.openLink(changelog);
  const url = new URL('http://127.0.0.1:4320/');
  url.searchParams.set('cwd', 'E:\\项目 # & 空格\\chat worktree');
  url.searchParams.set('token', 'test');
  await api.openLink(url.href, { inCodexBrowser: true });
  const links = requests.filter(request => request.method === 'ui/open-link');
  assert.deepEqual(links[0].params, { url: changelog });
  assert.equal(new URL(links[1].params.url).searchParams.get('url'), url.href);
  for (const invalid of ['https://example.com/', 'http://127.0.0.1.example.com/', 'file:///repo', 'http://user@127.0.0.1/', 'http://127.0.0.1:4317/?cwd=repo']) {
    await assert.rejects(() => api.openLink(invalid, { inCodexBrowser: true }), /无效的 Git 面板链接/);
  }
  assert.equal(requests.filter(request => request.method === 'ui/open-link').length, 2);
});

test('宿主拒绝打开链接、面板隐藏或卸载时不重试或回退启动系统浏览器', async () => {
  const { api, document, notify, requests } = hostFixture({}, { isError: true });
  await assert.rejects(() => api.openLink('http://127.0.0.1:4317/?cwd=repo&token=test', { inCodexBrowser: true }), /Codex 未能打开链接/);
  assert.equal(requests.filter(request => request.method === 'ui/open-link').length, 1);
  document.hidden = true;
  await assert.rejects(() => api.openLink('http://127.0.0.1:4317/?cwd=repo', { inCodexBrowser: true }), /当前聊天/);
  document.hidden = false;
  notify({ id: 'teardown', method: 'ui/resource-teardown' });
  await assert.rejects(() => api.openLink('http://127.0.0.1:4317/?cwd=repo', { inCodexBrowser: true }), /当前聊天/);
  assert.equal(requests.filter(request => request.method === 'ui/open-link').length, 1);
});
