import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Folder, X, CodeXml, Network } from 'lucide-react';
import { api, useResource } from './api.js';
import { Sidebar, CommitList, CommitInspector, Changes, Worktrees, Message } from './components.jsx';
import { BranchIcon as GitBranch } from './icons.jsx';
import { changeGroups } from './diff.mjs';
import { readTheme, applyTheme } from './theme.js';
import RefSelect from './RefSelect.jsx';

function RepositoryWorkspace({ repo, mobileOpen, close }) {
  const [view, setView] = useState('history');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [selection, setSelection] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('unstaged');
  const [selectedFile, setSelectedFile] = useState('');
  const groups = useMemo(() => changeGroups(repo.files), [repo.files]);
  const file = groups[mode].find(f => f.path === selectedFile) || groups[mode][0];
  const validFilter = repo.refs.some(ref => ref.name === filter) ? filter : '';
  const { data, error, loading } = useResource('history', view === 'history' ? { path: repo.root, ref: validFilter, limit } : null, repo.refreshedAt, JSON.stringify([repo.root, validFilter]));
  const selected = data?.commits.some(c => c.oid === selection) ? selection : data?.commits[0]?.oid;
  const selectFile = (id, path) => { setMode(id); setSelectedFile(path); setView('changes'); close(); };
  const openView = id => {
    if (id === 'changes' && !groups[mode].length) setMode(['unstaged','staged','untracked'].find(key => groups[key].length) || 'unstaged');
    setView(id);
  };
  return <div className="workspace"><Sidebar repo={repo} groups={groups} view={view} mode={mode} selected={file?.path} onSelect={selectFile} mobileOpen={mobileOpen} close={close} /><main className="main"><nav className="tabs" aria-label="仓库导航">{[['changes','改动',CodeXml],['history','历史',GitBranch],['worktrees','工作树',Network]].map(([id,label,Icon]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => openView(id)}><Icon />{label}</button>)}{view === 'history' && <RefSelect refs={repo.refs} value={validFilter} onChange={value => { setFilter(value); setLimit(100); setSelection(''); }} />}</nav>
    {view === 'history' && <div className="history-content"><section className="log">{loading && !data ? <Message>正在读取提交记录…</Message> : error ? <Message error>{error}</Message> : <CommitList data={data} loading={loading} repo={repo} selected={selected} onSelect={setSelection} search={search} setSearch={setSearch} loadMore={() => setLimit(n => Math.min(2000, n + 100))} />}</section><CommitInspector repoPath={repo.root} oid={selected} /></div>}
    {view === 'changes' && <Changes repo={repo} groups={groups} mode={mode} setMode={value => { setMode(value); setSelectedFile(''); }} file={file} onSelect={setSelectedFile} />}
    {view === 'worktrees' && <Worktrees repo={repo} />}
  </main></div>;
}

export default function App() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
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
    } catch (err) { if (!controller.signal.aborted) { setContext(previous => ({ ...previous, state: 'error' })); setError(err.name === 'TimeoutError' ? '读取超时，请重试。' : err.message); } }
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
  return <div className="app-shell"><header className="toolbar"><span className="project"><Folder />mogoo-codex-git</span>{repo && <span className="branch" title={repo.branch || (repo.head ? '分离的 HEAD' : '尚无提交')}><GitBranch /><span className="branch-name">{repo.branch || (repo.head ? '分离的 HEAD' : '尚无提交')}</span></span>}<code className="toolbar-path" title={context.root || context.cwd}>{context.root || context.cwd}</code><span className="toolbar-actions"><span className="theme-switch" role="group" aria-label="界面主题">{[['light','浅色'],['dark','深色']].map(([id,label]) => <button key={id} className={`theme-${id}`} aria-pressed={theme === id} onClick={() => setTheme(id)}>{label}</button>)}</span><span className="readonly">只读</span><button className="refresh" disabled={loading || !chatCwd} onClick={loadChat} title="重新读取当前聊天目录，不联网 fetch"><RefreshCw className={loading ? 'spinning' : ''} />刷新</button></span></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X /></button></div>}
    {repo ? <RepositoryWorkspace key={repo.root} repo={repo} mobileOpen={mobileOpen} close={() => setMobileOpen(false)} /> : <main className="welcome"><Folder size={32} /><h1>{loading ? '正在关联当前聊天…' : empty[0]}</h1><p>{empty[1]}</p>{context.cwd && <code>{context.cwd}</code>}</main>}
    <footer className="footer"><i className="status-dot" /><span title={repo ? `最近刷新 ${new Date(repo.refreshedAt).toLocaleTimeString('zh-CN', {hour12:false})}` : ''}>{loading ? '读取中…' : repo ? '当前聊天仓库' : '未关联仓库'}</span><label className="auto"><input type="checkbox" disabled={!repo} checked={auto} onChange={e => setAuto(e.target.checked)} />15 秒自动刷新</label></footer>
  </div>;
}
