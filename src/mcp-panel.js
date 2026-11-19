export function createPanelApi(win, onTheme) {
  const pending = new Map();
  let sequence = 0;
  let connected;
  let closed = false;
  const send = message => win.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');

  win.addEventListener('message', event => {
    if (event.source !== win.parent || event.data?.jsonrpc !== '2.0') return;
    const { id, method, result, error, params } = event.data;
    if (!method) pending.get(id)?.(result, error);
    else if (method === 'ui/notifications/host-context-changed') onTheme(params?.theme);
    else if (method === 'ping' || method === 'ui/resource-teardown') {
      if (method === 'ui/resource-teardown') closed = true;
      if (id != null) send({ id, result: {} });
    }
  });

  function request(method, params, signal) {
    signal.throwIfAborted();
    const id = `git-${++sequence}`;
    return new Promise((resolve, reject) => {
      const finish = (result, error) => {
        pending.delete(id);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(result);
      };
      const abort = () => finish(undefined, signal.reason);
      pending.set(id, (result, error) => finish(result, error && new Error(error.message || 'Codex 面板请求失败。')));
      signal.addEventListener('abort', abort, { once: true });
      try { send({ id, method, params }); }
      catch (error) { finish(undefined, error); }
    });
  }

  function connect() {
    connected ??= request('ui/initialize', {
      appInfo: { name: 'mogoo-codex-git', version: '1' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      protocolVersion: '2026-01-26',
    }, AbortSignal.timeout(10000)).then(result => {
      onTheme(result?.hostContext?.theme);
      send({ method: 'ui/notifications/initialized', params: {} });
      return result?.hostCapabilities;
    })
      .catch(error => { connected = undefined; throw error; });
    return connected;
  }

  async function call(endpoint, params, signal) {
    await connect();
    const tool = endpoint === 'update' ? { name: 'git_panel_update', arguments: params } : endpoint === 'browser-link' ? {
      name: 'git_panel_browser_link', arguments: params,
    } : {
      name: 'git_panel_read',
      arguments: { endpoint, params: endpoint === 'context' ? {} : params },
    };
    const result = await request('tools/call', tool, signal);
    if (result?.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || '读取失败。');
    if (!result?.structuredContent) throw new Error('Codex 未返回 Git 面板数据。');
    return result.structuredContent;
  }

  async function canFillDraft() {
    const host = await connect();
    const extension = host?.experimental?.['openai/message'];
    return Boolean(extension && typeof extension === 'object');
  }

  return {
    call,
    canFillDraft,
    async fillDraft(text) {
      const supported = await canFillDraft();
      if (closed || win.document.hidden || !supported || !text.trim()) return false;
      const params = {
        role: 'user',
        content: [{ type: 'text', text }],
        _meta: { 'openai/message': { target: 'active', send: false } },
      };
      const result = await request('ui/message', params, AbortSignal.timeout(10000));
      return !result?.isError;
    },
    async openLink(url, { inCodexBrowser = false } = {}) {
      await connect();
      if (closed || win.document.hidden) throw new Error('请在当前聊天的 Git 面板中打开链接。');
      let target = url;
      if (inCodexBrowser) {
        const panel = URL.parse(url);
        if (!panel || panel.protocol !== 'http:' || panel.hostname !== '127.0.0.1' || panel.username || panel.password
          || panel.pathname !== '/' || !panel.searchParams.has('cwd') || !panel.searchParams.has('token') || panel.hash) throw new Error('无效的 Git 面板链接。');
        // Codex's widget link handler ignores plain HTTP. Its browser deep link
        // explicitly accepts local HTTP URLs and opens the built-in browser.
        const browser = new URL('codex://browser');
        browser.searchParams.set('url', url);
        target = browser.href;
      }
      const result = await request('ui/open-link', { url: target }, AbortSignal.timeout(10000));
      if (result?.isError) throw new Error('Codex 未能打开链接，请重试。');
    },
  };
}
