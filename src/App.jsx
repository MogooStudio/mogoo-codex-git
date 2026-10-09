import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, RefreshCw, Menu, ShieldCheck, FolderGit2, X } from 'lucide-react';
import { api, useResource } from './api.js';
import { Sidebar, CommitList, CommitInspector, Changes, Worktrees, Message } from './components.jsx';

function RepositoryWorkspace({ repo, mobileOpen, close }) {
  const [view, setView] = useState('history');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [selection, setSelection] = useState('');
  const [search, setSearch] = useState('');
  const validFilter = repo.refs.some(ref => ref.name === filter) ? filter : '';
  const { data, error, loading } = useResource('history', view === 'history' ? { path: repo.root, ref: validFilter, limit } : null, repo.refreshedAt, JSON.stringify([repo.root, validFilter]));
  const selected = data?.commits.some(c => c.oid === selection) ? selection : data?.commits[0]?.oid;
  return <div className="workspace"><Sidebar repo={repo} view={view} setView={setView} filter={validFilter} setFilter={value => { setFilter(value); setLimit(100); setSelection(''); }} mobileOpen={mobileOpen} close={close} /><main className={`main-panel ${view}`}>
    {view === 'history' && <><div className="history-list">{loading && !data ? <Message>正在读取提交记录…</Message> : error ? <Message error>{error}</Message> : <CommitList data={data} loading={loading} repo={repo} selected={selected} onSelect={setSelection} search={search} setSearch={setSearch} loadMore={() => setLimit(n => Math.min(2000, n + 100))} />}</div><CommitInspector repoPath={repo.root} oid={selected} /></>}
    {view === 'changes' && <Changes repo={repo} />}
    {view === 'worktrees' && <Worktrees repo={repo} />}
  </main>{mobileOpen && <button className="sidebar-scrim" aria-label="关闭侧栏" onClick={close} />}</div>;
}

export default function App() {
  const [chatCwd] = useState(() => new URLSearchParams(window.location.search).get('cwd') || '');
  const [context, setContext] = useState({ state: 'connecting', cwd: chatCwd, root: '' });
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auto, setAuto] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pending = useRef(null);
  const loadChat = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError('');
    try {
      const source = await api('context', { cwd: chatCwd }, controller.signal);
      if (controller.signal.aborted) return;
      setContext(source);
      if (source.state !== 'ready') { setRepo(null); return; }
      const next = await api('repository', { path: source.root }, controller.signal);
      if (controller.signal.aborted) return;
      setRepo(next); setMobileOpen(false);
    } catch (err) { if (!controller.signal.aborted) { setRepo(null); setContext(previous => ({ ...previous, state: 'error' })); setError(err.name === 'TimeoutError' ? '读取超时，请重试。' : err.message); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [chatCwd]);
  useEffect(() => { loadChat(); return () => pending.current?.abort(); }, [loadChat]);
  useEffect(() => {
    if (!auto || !repo) return;
    const timer = setInterval(() => { if (!document.hidden && !loading) loadChat(); }, 15000);
    return () => clearInterval(timer);
  }, [auto, repo, loading, loadChat]);
  const empty = {
    unbound: ['等待当前聊天关联', '在当前 Codex 聊天中说“打开 Git 面板”，即可自动关联仓库。'],
    'no-repository': ['当前聊天没有 Git 仓库', '此聊天的工作目录不是 Git 仓库，也没有可读取的 worktree。'],
    missing: ['当前聊天的目录不可用', '工作目录可能已移动或删除。请在聊天中重新打开 Git 面板。'],
    error: ['无法读取当前聊天的仓库', '请检查上方错误提示，或点击刷新重试。'],
  }[context.state] || ['正在关联当前聊天…', '正在读取当前聊天的工作目录。'];
  return <div className="app-shell"><header className="toolbar"><div className="brand"><button className="icon-button mobile-only" aria-label="打开导航" disabled={!repo} onClick={() => setMobileOpen(true)}><Menu size={20} /></button><GitBranch size={27} strokeWidth={1.7} /><span>Git Lens</span></div><div className="chat-location" aria-label="当前聊天目录"><FolderGit2 size={18} /><div><span>{context.state === 'ready' ? `当前聊天 · ${context.isWorktree ? 'Worktree' : '仓库'}` : '当前聊天'}</span><code title={context.root || context.cwd}>{context.root || context.cwd || '由 Codex 聊天入口自动关联'}</code></div></div><button className="refresh-button" disabled={loading || !chatCwd} onClick={loadChat} title="重新读取当前聊天目录，不联网 fetch"><RefreshCw size={16} className={loading ? 'spinning' : ''} /><span>刷新</span></button></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
    {repo ? <RepositoryWorkspace key={repo.root} repo={repo} mobileOpen={mobileOpen} close={() => setMobileOpen(false)} /> : <main className="welcome"><div className="welcome-symbol"><FolderGit2 size={42} strokeWidth={1.3} /></div><h1>{loading ? '正在关联当前聊天…' : empty[0]}</h1><p>{empty[1]}</p>{context.cwd && <code className="empty-context-path">{context.cwd}</code>}<p className="welcome-note">自动跟随聊天入口 · 不使用其他聊天的历史仓库</p></main>}
    <footer className="statusbar"><span><ShieldCheck size={14} /><span>只读模式<span className="footer-detail"> · 所有 Git 数据在本机读取</span></span></span><div><label className="auto-refresh"><input type="checkbox" disabled={!repo} checked={auto} onChange={event => setAuto(event.target.checked)} />15 秒自动刷新</label><span>{loading ? '读取中…' : repo ? `最近刷新 ${new Date(repo.refreshedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : '未读取任何仓库'}</span></div></footer>
  </div>;
}
