import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ExternalLink, FileCode2, Folder, Layers, LoaderCircle, Network, Palette, RefreshCw, X } from 'lucide-react';
import { api, isCodexPanel, openPanelLink, useResource } from './api.js';
import { Sidebar, CommitList, CommitInspector, Changes, Worktrees, Message } from './components.jsx';
import { BranchIcon as GitBranch } from './icons.jsx';
import { changeGroups } from './diff.mjs';
import { applyTheme, getDefaultTheme, readThemeMode, saveThemeMode, subscribeTheme, withPanelTheme } from './theme.js';
import RefSelect from './RefSelect.jsx';
import { StashesView } from './StashesView.jsx';
import { ResizableWorkspace } from './ResizableWorkspace.jsx';
import { PluginUpdate } from './PluginUpdate.jsx';
import { GitCommandPicker } from './GitCommandPicker.jsx';

const views = [['source', '源码', FileCode2], ['history', '分支', GitBranch],
  ['worktrees', '工作树', Network], ['stashes', 'Stash', Layers]];

function ThemePicker({ mode, followLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null);
  const choices = [['follow', followLabel], ['light', '浅色'], ['dark', '深色']];
  const label = choices.find(([id]) => id === mode)[1];
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="theme-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button className="theme-trigger" ref={trigger} aria-label="界面主题" aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
      <Palette /><span>{mode === 'follow' ? '跟随' : label}</span><ChevronDown className="theme-chevron" />
    </button>
    {open && <div className="theme-options" role="group" aria-label="主题选项">
      {choices.map(([id, name]) => <button key={id} className={`theme-${id}`} aria-pressed={id === mode} onClick={() => {
        onChange(id);
        setOpen(false);
        trigger.current?.focus();
      }}><span>{name}</span>{id === mode && <Check />}</button>)}
    </div>}
  </div>;
}

function RepositoryWorkspace({ repo }) {
  const [view, setView] = useState('history');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [selection, setSelection] = useState('');
  const [inspecting, setInspecting] = useState(true);
  const [sourceOpened, setSourceOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [fileSelection, setFileSelection] = useState({ mode: 'unstaged', path: '' });
  const groups = useMemo(() => changeGroups(repo.files), [repo.files]);
  const mode = groups[fileSelection.mode].length ? fileSelection.mode :
    ['conflict', 'unstaged', 'staged', 'untracked'].find(id => groups[id].length) || 'unstaged';
  const file = groups[mode].find(f => f.path === fileSelection.path) || groups[mode][0];
  const validFilter = (filter === 'HEAD' ? repo.head : repo.refs.some(ref => ref.name === filter)) ? filter : '';
  const historyRevision = useMemo(() => JSON.stringify([repo.head, repo.refs.map(ref => [ref.name, ref.oid])]), [repo.head, repo.refs]);
  const { data, error, loading } = useResource('history', { path: repo.root, ref: validFilter, limit }, historyRevision, JSON.stringify([repo.root, validFilter]));
  const selected = data?.commits.some(c => c.oid === selection) ? selection : data?.commits[0]?.oid;
  const openSource = () => { setSourceOpened(true); setView('source'); };
  const selectFile = (mode, path) => { setFileSelection({ mode, path }); openSource(); };
  return <ResizableWorkspace source={view === 'source'} sidebar={
    <Sidebar groups={groups} count={repo.files.length} mode={mode} selected={sourceOpened ? file?.path : ''} onSelect={selectFile} />
  }>
    <main className="main">
      <nav className="tabs" aria-label="仓库导航">
        {views.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''}
          aria-current={view === id ? 'page' : undefined} onClick={() => id === 'source' ? openSource() : setView(id)}>
          <Icon />{label}
        </button>)}
        {view === 'history' && <RefSelect refs={repo.refs} hasHead={Boolean(repo.head)} currentBranch={repo.branch} value={validFilter}
          onChange={value => { setFilter(value); setLimit(100); setSelection(''); setInspecting(true); }} />}
      </nav>
      <div className={`history-content ${inspecting && selected ? '' : 'history-only'}`} hidden={view !== 'history'}>
        <section className="log">
          {loading && !data ? <Message>正在读取提交记录…</Message> : error ? <Message error>{error}</Message> :
            <CommitList data={data} loading={loading} repo={repo} selected={inspecting ? selected : null}
              onSelect={oid => { setSelection(oid); setInspecting(true); }}
              search={search} setSearch={setSearch}
              loadMore={() => setLimit(n => Math.min(2000, n + 100))} />}
        </section>
        {inspecting && selected && <CommitInspector repoPath={repo.root} oid={selected}
          onClose={() => setInspecting(false)} showReviewTools={false} />}
      </div>
      {sourceOpened && <Changes hidden={view !== 'source'} repo={repo} groups={groups} mode={mode} file={file} onSelect={selectFile} />}
      {view === 'worktrees' && <Worktrees repo={repo} />}
      {view === 'stashes' && <StashesView repo={repo} />}
    </main>
  </ResizableWorkspace>;
}

export default function App() {
  const [themeMode, setThemeMode] = useState(readThemeMode);
  const defaultTheme = useSyncExternalStore(subscribeTheme, getDefaultTheme);
  const theme = themeMode === 'follow' ? defaultTheme : themeMode;
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);
  const selectTheme = mode => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };
  const followLabel = isCodexPanel ? '跟随 Codex' : '跟随系统';
  const [chatCwd] = useState(() => new URLSearchParams(window.location.search).get('cwd') || '');
  const [context, setContext] = useState({ state: 'connecting', cwd: chatCwd, root: '' });
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [browserError, setBrowserError] = useState('');
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const browserPending = useRef(false);
  const [auto, setAuto] = useState(true);
  const pending = useRef(null);
  const loadChat = useCallback(async (quiet = false) => {
    if (quiet && pending.current) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const source = await api('context', { cwd: chatCwd }, controller.signal);
      if (controller.signal.aborted) return;
      setContext(source);
      if (source.state !== 'ready') { setRepo(null); setError(''); return; }
      setRepo(previous => previous?.root === source.root ? previous : null);
      const next = await api('repository', { path: source.root }, controller.signal);
      if (controller.signal.aborted) return;
      setRepo(next);
      setError('');
    } catch (err) {
      if (!controller.signal.aborted) {
        if (isCodexPanel && !quiet) setRepo(null);
        setContext(previous => ({ ...previous, state: 'error' }));
        setError(err.name === 'TimeoutError' ? '读取超时，请重试。' : err.message);
      }
    }
    finally {
      if (pending.current === controller) {
        pending.current = null;
        if (!quiet) setLoading(false);
      }
    }
  }, [chatCwd]);
  useEffect(() => { loadChat(); return () => pending.current?.abort(); }, [loadChat]);
  const watching = auto && Boolean(repo);
  useEffect(() => {
    if (!watching) return;
    const refreshVisible = () => { if (!document.hidden) loadChat(true); };
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [watching, loadChat]);
  const empty = {
    unbound: ['等待当前聊天关联', '在当前 Codex 聊天中说“打开 Git 面板”，即可自动关联仓库。'],
    'no-repository': ['当前聊天没有 Git 仓库', '此聊天的工作目录不是 Git 仓库，也没有可读取的 worktree。'],
    missing: ['当前聊天的目录不可用', '工作目录可能已移动或删除。请在聊天中重新打开 Git 面板。'],
    error: ['无法读取当前聊天的仓库', '请检查上方错误提示，或点击刷新重试。'],
  }[context.state] || ['正在关联当前聊天…', '正在读取当前聊天的工作目录。'];
  const repoName = repo?.name || 'Mogoo Codex Git';
  const repoPath = repo?.root || context.root || context.cwd;
  const branch = repo?.branch || (repo?.head ? '分离的 HEAD' : '尚无提交');
  const ahead = repo?.track?.match(/\bahead (\d+)/)?.[1];
  const behind = repo?.track?.match(/\bbehind (\d+)/)?.[1];
  const track = [ahead && `领先 ${ahead} 个提交`, behind && `落后 ${behind} 个提交`].filter(Boolean).join(' · ') || repo?.track;
  const failed = context.state === 'error' || Boolean(error);
  const observation = loading ? '读取中…' : failed ? (watching ? '观察中断' : '读取失败') :
    watching ? '实时观察' : repo ? '观察已暂停' : '未关联仓库';
  const openBrowser = async () => {
    if (browserPending.current || !repo || loading || context.state !== 'ready' || context.root !== repo.root) return;
    browserPending.current = true;
    setOpeningBrowser(true);
    setBrowserError('');
    try {
      const result = await api('browser-link', { path: repo.root });
      if (!result.url) throw new Error('未能获取 Git 面板链接，请重试。');
      await openPanelLink(withPanelTheme(result.url, themeMode, theme), { inCodexBrowser: true });
    } catch (err) { setBrowserError(err.message || '未能在 Codex 浏览器打开 Git 面板，请重试。'); }
    finally { browserPending.current = false; setOpeningBrowser(false); }
  };
  return <div className="app-shell"><header className="toolbar"><span className="project" title={repoPath || repoName}><Folder /><span>{repoName}</span></span>{repo && <span className="branch" title={branch}><GitBranch /><span className="branch-name">{branch}</span></span>}<div className="toolbar-actions">
    <label className="auto">
      <input type="checkbox" disabled={!repo} checked={auto} onChange={e => setAuto(e.target.checked)} />
      <span>自动刷新</span>
    </label>
    {isCodexPanel && <button className="toolbar-icon" aria-label="浏览器打开" title="在 Codex 右侧浏览器打开当前仓库"
      aria-busy={openingBrowser} disabled={openingBrowser || loading || !repo || context.state !== 'ready' || context.root !== repo.root}
      onClick={openBrowser}>{openingBrowser ? <LoaderCircle className="spinning" /> : <ExternalLink />}</button>}
    <GitCommandPicker key={repo?.root || ''} refs={repo?.refs || []} ready={Boolean(repo && context.state === 'ready' && context.root === repo.root && !loading)} />
    <button className="refresh toolbar-icon" aria-label="刷新" disabled={loading || (!isCodexPanel && !chatCwd)}
      onClick={() => loadChat()} title="刷新本地仓库"><RefreshCw className={loading ? 'spinning' : ''} /></button>
    <ThemePicker mode={themeMode} followLabel={followLabel} onChange={selectTheme} />
    </div></header>
    {(error || browserError) && <div className="error-banner" role="alert"><span>{error || browserError}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => { setError(''); setBrowserError(''); }}><X /></button></div>}
    {repo ? <RepositoryWorkspace key={repo.root} repo={repo} /> : <main className="welcome"><Folder size={32} /><h1>{loading ? '正在关联当前聊天…' : empty[0]}</h1><p>{empty[1]}</p>{context.cwd && <code>{context.cwd}</code>}</main>}
    <footer className="footer">
      <i className={`status-dot ${watching && !failed && !loading ? 'observing' : ''}`} aria-hidden="true" />
      <span role="status" title={repo ? `${repo.root}\n${watching ? '可见时每 15 秒读取本地状态\n' : ''}最近刷新 ${new Date(repo.refreshedAt).toLocaleTimeString('zh-CN', {hour12:false})}` : ''}>{observation}</span>
      {track && <span className="tracking" title={repo.upstream ? `相对本地记录的 ${repo.upstream}` : undefined}>{track}</span>}
      <PluginUpdate />
      <span className="readonly">只读</span>
    </footer>
  </div>;
}
