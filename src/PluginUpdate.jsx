import React, { useCallback, useEffect, useRef, useState } from 'react';
import { version } from '../package.json';
import { api, isCodexPanel, openPanelLink } from './api.js';

function statusText(info) {
  if (info?.operation?.state === 'running') return info.operation.message;
  if (info?.pending) return '新版已安装，新开聊天或重启 Codex 后生效。';
  if (info?.checking) return '正在检查更新…';
  if (info?.operation?.state === 'error') return info.operation.message;
  if (info?.available) return info.canInstall ? `发现 v${info.target}。Codex 可能已在后台更新。` :
    `发现 v${info.target}。可查看手动更新命令。`;
  if (info?.remoteStatus === 'unavailable') return '暂时无法读取发行版本，请稍后再试。';
  if (info?.dismissed) return `已忽略 v${info.target}。`;
  if (info?.latest) return '当前已是最新版本。';
  return info ? '远端版本未知，可立即检查。' : '正在读取版本…';
}

export function PluginUpdate() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [autoChoice, setAutoChoice] = useState(null);
  const lifecycle = useRef(null), inFlight = useRef(null);
  const dialog = useRef(null), trigger = useRef(null), cancel = useRef(null);

  const request = useCallback(async (action, values = {}) => {
    const signal = lifecycle.current?.signal;
    const interactive = !['status', 'auto'].includes(action);
    if (!signal || signal.aborted || (inFlight.current && (!interactive || inFlight.current.interactive))) return;
    inFlight.current?.controller.abort();
    const token = { controller: new AbortController(), interactive };
    const requestSignal = AbortSignal.any([signal, token.controller.signal]);
    inFlight.current = token;
    if (interactive) { setBusy(action); setNotice(''); }
    try {
      const data = await api('update', { action, ...values }, requestSignal);
      if (!requestSignal.aborted) setInfo(data);
    } catch (error) {
      if (!requestSignal.aborted && interactive) setNotice(error.name === 'TimeoutError' ? '请求超时，请查看更新状态后重试。' : error.message);
    } finally {
      if (inFlight.current === token) inFlight.current = null;
      if (!signal.aborted && interactive) setBusy('');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    const checkOnOpen = async () => {
      if (document.hidden) return;
      await request('status');
      await request('auto');
    };
    void checkOnOpen();
    document.addEventListener('visibilitychange', checkOnOpen);
    return () => {
      controller.abort();
      inFlight.current = null;
      document.removeEventListener('visibilitychange', checkOnOpen);
    };
  }, [request]);

  const installing = info?.operation?.state === 'running';
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void request('status');
    }, open || installing || info?.checking ? 1400 : 30000);
    return () => clearInterval(timer);
  }, [open, installing, info?.checking, request]);

  useEffect(() => { if (confirmation) cancel.current?.focus(); }, [confirmation]);

  const label = installing ? '更新中…' : info?.pending ? '等待生效' :
    info?.available ? `有新版本 v${info.target}` :
    info?.operation?.state === 'error' ? '更新未完成' : `v${version}`;
  const commands = info?.commands?.join('\n');
  const manual = commands && !info?.pending && (info?.available || info?.operation?.state === 'error');
  const versions = [['运行中', version], ['已安装', info?.installed],
    ['市场快照', info?.snapshot], ['远端', info?.latest]];

  const show = () => {
    setNotice('');
    setOpen(true);
    dialog.current.showModal();
    void request('status');
  };
  const close = () => {
    setOpen(false);
    setConfirmation(null);
    trigger.current?.focus();
  };
  const confirm = () => {
    const target = confirmation.target;
    setConfirmation(null);
    void request('install', { target, confirmed: true });
  };
  const setAuto = async enabled => {
    setAutoChoice(enabled);
    await request('configure', { enabled });
    setAutoChoice(null);
    if (enabled) void request('auto');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands);
      setNotice('已复制更新命令。');
    } catch { setNotice('未能复制，可选中下方命令手动复制。'); }
  };
  const changelog = async () => {
    try { await openPanelLink(info.changelog); }
    catch { setNotice('未能打开更新内容，请在发行仓库查看 CHANGELOG.zh.md。'); }
  };

  return <>
    <button className="plugin-update-entry" ref={trigger} type="button" aria-haspopup="dialog"
      aria-label={`插件更新 · ${label}`} aria-controls="plugin-update-dialog"
      data-attention={Boolean(info?.pending || info?.available || info?.operation?.state === 'error')}
      title="插件更新" onClick={show}>{label}</button>
    <dialog className="plugin-update-dialog" id="plugin-update-dialog" ref={dialog} aria-labelledby="plugin-update-title"
      onClose={close} onCancel={event => {
        if (confirmation) { event.preventDefault(); setConfirmation(null); }
      }}>
      {confirmation ? <>
        <h2 id="plugin-update-title">确认更新到 v{confirmation.target}？</h2>
        <p>Codex 会跳过已经完成的步骤。新版安装后，新开聊天或重启 Codex 后生效。</p>
        <pre>{confirmation.commands}</pre>
        <div className="plugin-update-actions">
          <button type="button" ref={cancel} onClick={() => setConfirmation(null)}>取消</button>
          <button type="button" className="plugin-update-primary" onClick={confirm}>确认更新</button>
        </div>
      </> : <>
        <h2 id="plugin-update-title">插件更新</h2>
        <dl className="plugin-update-versions">
          {versions.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ? `v${value}` : '未知'}</dd></div>)}
        </dl>
        <p role="status">{busy === 'check' ? '正在检查更新…' : statusText(info)}</p>
        <div className="plugin-update-options">
          {isCodexPanel && <label>
            <input type="checkbox" checked={autoChoice ?? info?.autoCheck ?? true} disabled={!info || Boolean(busy)}
              onChange={event => void setAuto(event.target.checked)} /> 自动检查更新
          </label>}
          <button type="button" disabled={Boolean(busy || info?.checking || installing)}
            onClick={() => void request('check')}>立即检查</button>
        </div>
        {manual && !installing && <details>
          <summary>手动更新命令</summary>
          <pre>{commands}</pre>
          <button type="button" onClick={copy}>复制命令</button>
        </details>}
        <p className="plugin-update-notice" role="status" hidden={!notice}>{notice}</p>
        <div className="plugin-update-actions">
          {info?.changelog && <button type="button" onClick={changelog}>查看更新内容</button>}
          {isCodexPanel && info?.available && !installing && <button type="button" disabled={Boolean(busy)}
            onClick={() => void request('dismiss', { target: info.target })}>忽略此版本</button>}
          <button type="button" onClick={() => dialog.current.close()}>关闭</button>
          {info?.canInstall && <button type="button" className="plugin-update-primary" disabled={Boolean(busy)}
            onClick={() => setConfirmation({ target: info.target, commands })}>立即更新</button>}
        </div>
      </>}
    </dialog>
  </>;
}
