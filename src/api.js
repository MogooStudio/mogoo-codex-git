import { useEffect, useState } from 'react';
import { createPanelApi } from './mcp-panel.js';
import { setHostTheme } from './theme.js';

export const isCodexPanel = document.documentElement.hasAttribute('data-mcp-app');
const panelApi = isCodexPanel ? createPanelApi(window, setHostTheme) : null;
export const chatMessage = panelApi && { capabilities: panelApi.messageCapabilities, submit: panelApi.message };
const browserToken = new URLSearchParams(window.location.search).get('token') || '';

export async function api(endpoint, params, signal) {
  const timeout = AbortSignal.timeout(25000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  if (panelApi) return panelApi.call(endpoint, params, requestSignal);
  const response = await fetch(`/api/${endpoint}?${new URLSearchParams(params)}`, {
    headers: { 'X-Git-Lens': '1', 'X-Git-Lens-Token': browserToken }, signal: requestSignal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '读取失败。');
  return data;
}

export async function openPanelLink(url, options) {
  if (panelApi) return panelApi.openLink(url, options);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function useResource(endpoint, params, revision = '', continuityKey = '') {
  const key = params ? JSON.stringify(params) : '';
  const scope = key ? continuityKey || key : '';
  const [state, setState] = useState({ data: null, error: '', loading: false, key: '', scope: '' });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState(previous => ({ data: previous.scope === scope ? previous.data : null, error: '', loading: true, key, scope }));
    api(endpoint, JSON.parse(key), controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, error: '', loading: false, key, scope });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ data: null, error: error.name === 'TimeoutError' ? '读取超时，请重试。' : error.message, loading: false, key, scope });
    });
    return () => controller.abort();
  }, [endpoint, key, scope, revision]);
  return key && state.scope === scope ? state : { data: null, error: '', loading: !!key };
}

export function dateLabel(date, short = false) {
  return new Date(date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', ...(short ? {} : { year: 'numeric', hour: '2-digit', minute: '2-digit' }), hour12: false });
}
