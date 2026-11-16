import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { AppError, repositoryReads as reads, resolveRepo } from './git.mjs';
import { chatContext } from './chat-context.mjs';
import { readThreadCwd } from './codex-thread.mjs';
import { createPluginUpdater } from './plugin-update.mjs';
import { prepareBrowserPanel } from './browser-panel.mjs';

const uri = 'ui://mogoo-codex-git/panel.html';
const mimeType = 'text/html;profile=mcp-app';
const dist = new URL('../dist/', import.meta.url);
const protocols = ['2025-11-25', '2025-06-18', '2025-03-26'];
const threadIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const tools = [{
  name: 'git_panel',
  title: 'Git 面板',
  description: '在当前聊天右侧打开本机只读 Git 面板，自动识别仓库或工作树。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations,
  _meta: {
    ui: { resourceUri: uri, visibility: ['model', 'app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }] },
  },
}, {
  name: 'git_panel_read',
  description: '为 Git 面板读取当前聊天的仓库、提交或文件差异。',
  inputSchema: {
    type: 'object',
    properties: { endpoint: { enum: ['context', ...Object.keys(reads)] }, params: { type: 'object' } },
    required: ['endpoint', 'params'],
    additionalProperties: false,
  },
  annotations,
  _meta: { ui: { visibility: ['app'] } },
}, {
  name: 'git_panel_update',
  description: '为 Git 面板检查插件版本，保存更新设置或安装用户确认的发行版。',
  inputSchema: {
    type: 'object',
    properties: {
      action: { enum: ['status', 'auto', 'check', 'configure', 'dismiss', 'install'] },
      enabled: { type: 'boolean' },
      target: { type: 'string' },
      confirmed: { type: 'boolean' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  _meta: { ui: { visibility: ['app'] } },
}, {
  name: 'git_panel_browser_link',
  description: '为 Codex 内置浏览器准备当前聊天仓库的 Git 面板链接。',
  inputSchema: {
    type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] } },
}];

async function readPanelHtml() {
  const html = await readFile(new URL('index.html', dist), 'utf8');
  const script = html.match(/<script\b[^>]*src="\/(assets\/[\w.-]+\.js)"[^>]*><\/script>/);
  const style = html.match(/<link\b[^>]*href="\/(assets\/[\w.-]+\.css)"[^>]*>/);
  if (!script || !style) throw new Error('Git panel build is incomplete');
  const [js, css] = await Promise.all([script, style].map(([, file]) => readFile(new URL(file, dist), 'utf8')));
  return html.replace('<html ', '<html data-mcp-app ')
    .replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
    .replace(style[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}

export function createPanelHandler({ lookupCwd = readThreadCwd, update = createPluginUpdater(), browserLink = prepareBrowserPanel } = {}) {
  const bindings = new Map();
  let panelHtml;
  return async function handle(method, params = {}) {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: protocols.includes(params.protocolVersion) ? params.protocolVersion : protocols[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'mogoo-codex-git', title: 'Mogoo-codex-git', version: '1' },
        };
      case 'ping': return {};
      case 'tools/list': return { tools };
      case 'resources/list': return { resources: [{ uri, name: 'git-panel', mimeType }] };
      case 'resources/templates/list': return { resourceTemplates: [] };
      case 'resources/read':
        if (params.uri !== uri) throw new AppError('未知 Git 面板资源。');
        panelHtml ??= await readPanelHtml();
        return { contents: [{
          uri, mimeType, text: panelHtml,
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, permissions: { clipboardWrite: {} } } },
        }] };
      case 'tools/call': {
        const args = params.arguments ?? {};
        if (typeof args !== 'object' || Array.isArray(args)) throw new AppError('无效的 Git 面板请求。');
        if (params.name === 'git_panel' && Object.keys(args).length === 0) {
          return { content: [{ type: 'text', text: '已请求打开当前聊天的 Git 面板。' }], structuredContent: { opened: true }, _meta: { ui: { resourceUri: uri } } };
        }
        if (params.name === 'git_panel_update') {
          if (!threadIdPattern.test(params._meta?.threadId ?? '')) throw new AppError('请在 Codex 聊天中打开 Git 面板。');
          return { content: [], structuredContent: await update(args, true) };
        }
        if (params.name === 'git_panel_browser_link') {
          const threadId = params._meta?.threadId;
          if (!threadIdPattern.test(threadId ?? '')) throw new AppError('Codex 未提供当前聊天标识，请重新打开 Git 面板。');
          if (typeof args.path !== 'string' || Object.keys(args).some(key => key !== 'path')) throw new AppError('无效的浏览器面板请求。');
          const binding = bindings.get(threadId);
          const previous = await binding;
          const current = await lookupCwd(threadId).then(chatContext);
          if (current.state !== 'ready' || previous?.root !== args.path || current.root !== args.path
            || binding !== bindings.get(threadId)) throw new AppError('当前聊天的仓库关联已变化，请刷新面板。');
          return { content: [], structuredContent: await browserLink({ cwd: current.cwd, root: current.root }) };
        }
        const { endpoint, params: query } = args;
        if (params.name !== 'git_panel_read' || !query || typeof query !== 'object' || Array.isArray(query)
          || (endpoint !== 'context' && !Object.hasOwn(reads, endpoint))) throw new AppError('无效的 Git 面板请求。');
        const threadId = params._meta?.threadId;
        if (typeof threadId !== 'string' || !threadIdPattern.test(threadId)) throw new AppError('Codex 未提供当前聊天标识，请重新打开 Git 面板。');
        let data;
        if (endpoint === 'context') {
          const binding = lookupCwd(threadId).then(chatContext);
          bindings.delete(threadId);
          bindings.set(threadId, binding);
          if (bindings.size > 64) bindings.delete(bindings.keys().next().value);
          data = await binding;
        } else {
          const binding = bindings.get(threadId);
          const context = await binding;
          if (context?.state !== 'ready' || context.root !== query.path || await resolveRepo(context.root) !== context.root
            || binding !== bindings.get(threadId)) throw new AppError('当前聊天的仓库关联已变化，请刷新面板。');
          data = await reads[endpoint](context.root, query);
        }
        return { content: [], structuredContent: data };
      }
      default: throw new AppError('不支持的 Git 面板请求。', 404);
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const handle = createPanelHandler();
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', async line => {
    let request;
    try { request = JSON.parse(line); } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: '无效的 JSON。' } }) + '\n');
      return;
    }
    if (request?.id == null) return;
    const reply = { jsonrpc: '2.0', id: request.id };
    try {
      reply.result = await handle(request.method, request.params);
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Git 面板请求失败，请重试。';
      if (request.method === 'tools/call') reply.result = { isError: true, content: [{ type: 'text', text: message }] };
      else reply.error = { code: error.status === 404 ? -32601 : -32603, message };
    }
    process.stdout.write(JSON.stringify(reply) + '\n');
  });
}
