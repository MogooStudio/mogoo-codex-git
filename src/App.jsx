import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronDown, ExternalLink, FileCode2, Folder, Layers, LoaderCircle, Monitor, Moon, Network, Palette, RefreshCw, Sun, X } from 'lucide-react';
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

const views = [['source', '改动', FileCode2], ['history', '历史', GitBranch],
  ['worktrees', '工作树', Network], ['stashes', 'Stash', Layers]];

function ThemePicker({ mode, followLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null), options = useRef(null);
  const choices = [['follow', followLabel, Monitor], ['light', '浅色', Sun], ['dark', '深色', Moon]];
  const label = choices.find(([id]) => id === mode)[1];
  useEffect(() => {
    if (!open) return;
    options.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="theme-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const buttons = [...options.current.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    <button className="theme-trigger" ref={trigger} aria-label="界面主题" aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
      <Palette /><span>{mode === 'follow' ? '跟随' : label}</span><ChevronDown className="theme-chevron" />
    </button>
    {open && <div ref={options} className="theme-options" role="group" aria-label="主题选项">
      {choices.map(([id, name, Icon]) => <button key={id} className={`theme-${id}`} aria-pressed={id === mode} onClick={() => {
        onChange(id);
        setOpen(false);
        trigger.current?.focus();
      }}><Icon aria-hidden="true" /><span>{name}</span>{id === mode && <Check aria-hidden="true" />}</button>)}
    </div>}
  </div>;
}

function RepositoryWorkspace({ repo }) {
  const [view, setView] = useState('history');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  const [selection, setSelection] = useState('');
  const [inspecting, setInspecting] = useState(true);
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const historyView = useRef(null);
  const restoreCommitFocus = useRef(false);
  const [sourceOpened, setSourceOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [historyRetry, setHistoryRetry] = useState(0);
  const [stashSelection, setStashSelection] = useState({ oid: '', part: 'tracked' });
  const [fileSelection, setFileSelection] = useState({ mode: 'unstaged', path: '' });
  const groups = useMemo(() => changeGroups(repo.files), [repo.files]);
  const mode = groups[fileSelection.mode].length ? fileSelection.mode :
    ['conflict', 'unstaged', 'staged', 'untracked'].find(id => groups[id].length) || 'unstaged';
  const file = groups[mode].find(f => f.path === fileSelection.path) || groups[mode][0];
  const validFilter = (filter === 'HEAD' ? repo.head : repo.refs.some(ref => ref.name === filter)) ? filter : '';
  const historyRevision = useMemo(() => JSON.stringify([historyRetry, repo.head, repo.refs.map(ref => [ref.name, ref.oid])]),
    [historyRetry, repo.head, repo.refs]);
  const { data, error, loading } = useResource('history', { path: repo.root, ref: validFilter, limit }, historyRevision, JSON.stringify([repo.root, validFilter]));
  const defaultSelection = !validFilter && data?.commits.find(commit => commit.oid === repo.head)?.oid;
  const selected = data?.commits.some(commit => commit.oid === selection) ? selection : defaultSelection || data?.commits[0]?.oid;
  const showInspector = inspecting && Boolean(selected);
  const showCompactDetail = showInspector && compactDetailOpen && selection === selected;
  useLayoutEffect(() => {
    if (compactDetailOpen || !restoreCommitFocus.current) return;
    restoreCommitFocus.current = false;
    historyView.current?.querySelector(`[data-oid="${selected}"]`)?.focus();
  }, [compactDetailOpen, selected]);
  const openCommit = oid => {
    setSelection(oid);
    setInspecting(true);
    setCompactDetailOpen(true);
  };
  const returnToHistory = () => {
    restoreCommitFocus.current = true;
    setCompactDetailOpen(false);
  };
  const openSource = () => { setSourceOpened(true); setView('source'); };
  const selectFile = (mode, path) => { setFileSelection({ mode, path }); openSource(); };
  return <ResizableWorkspace source={view === 'source'} sidebar={
    <Sidebar groups={groups} count={repo.files.length} mode={mode} selected={sourceOpened ? file?.path : ''} onSelect={selectFile} />
  }>
    <main className="main">
      <nav className="tabs" aria-label="仓库导航">
        {views.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''}
          aria-label={label} aria-description={id === 'source' ? `${repo.files.length} 个改动文件` : undefined}
          aria-current={view === id ? 'page' : undefined} onClick={() => id === 'source' ? openSource() : setView(id)}>
          <Icon aria-hidden="true" />{label}
          {id === 'source' && repo.files.length > 0 && <span className="tab-count" aria-hidden="true">{repo.files.length > 99 ? '99+' : repo.files.length}</span>}
        </button>)}
        {view === 'history' && <RefSelect refs={repo.refs} hasHead={Boolean(repo.head)} currentBranch={repo.branch} value={validFilter}
          onChange={value => {
            setFilter(value);
            setLimit(100);
            setSelection('');
            setInspecting(true);
            setCompactDetailOpen(false);
          }} />}
      </nav>
      <div ref={historyView} className={`history-content ${showInspector ? '' : 'history-only'} ${showCompactDetail ? 'compact-history-detail' : ''}`}
        hidden={view !== 'history'}>
        <section className="log">
          {error && <Message error compact={Boolean(data)} onRetry={() => setHistoryRetry(n => n + 1)}>{error}</Message>}
          {loading && !data && <Message>正在读取提交记录…</Message>}
          {(data || (!loading && !error)) &&
            <CommitList data={data} loading={loading} repo={repo} selected={inspecting ? selected : null}
              onSelect={openCommit}
              search={search} setSearch={setSearch}
              loadMore={() => setLimit(n => Math.min(2000, n + 100))} />}
        </section>
        {showInspector && <CommitInspector repoPath={repo.root} oid={selected}
          onClose={() => { setInspecting(false); setCompactDetailOpen(false); }}
          onBack={showCompactDetail ? returnToHistory : undefined} showReviewTools={false} />}
      </div>
      {sourceOpened && <Changes hidden={view !== 'source'} repo={repo} groups={groups} mode={mode} file={file} onSelect={selectFile} />}
      {view === 'worktrees' && <Worktrees repo={repo} />}
      {view === 'stashes' && <StashesView repo={repo} selection={stashSelection} onSelect={setStashSelection} />}
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
    'no-repository': ['当前聊天没有 Git 仓库', '在关联 Git 仓库的聊天里打开面板，即可查看改动和历史。'],
    missing: ['当前聊天的目录不可用', '确认工作目录仍存在后，重试读取。'],
    error: ['无法读取当前聊天的仓库', '重试读取，或从该仓库的聊天重新打开面板。'],
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
    <label className="auto" title="面板可见时每 15 秒刷新 Git 状态">
      <input type="checkbox" aria-label="自动刷新" disabled={!repo} checked={auto} onChange={e => setAuto(e.target.checked)} />
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
    {repo ? <RepositoryWorkspace key={repo.root} repo={repo} /> : <main className="welcome">
      {loading ? <LoaderCircle className="spinning" size={28} aria-hidden="true" /> : <Folder size={28} aria-hidden="true" />}
      <h1>{loading ? '正在关联当前聊天…' : empty[0]}</h1>
      <p>{loading ? '正在读取当前聊天的工作目录。' : empty[1]}</p>
      {context.cwd && <code title={context.cwd}>{context.cwd}</code>}
      {!loading && ['error', 'missing'].includes(context.state) &&
        <button type="button" className="panel-action welcome-retry" onClick={() => loadChat()}>重试读取仓库</button>}
    </main>}
    <footer className="footer">
      <i className={`status-dot ${watching && !failed && !loading ? 'observing' : ''}`} aria-hidden="true" />
      <span role="status" title={repo ? `${repo.root}\n${watching ? '可见时每 15 秒读取本地状态\n' : ''}最近刷新 ${new Date(repo.refreshedAt).toLocaleTimeString('zh-CN', {hour12:false})}` : ''}>{observation}</span>
      {track && <span className="tracking" title={repo.upstream ? `相对本地记录的 ${repo.upstream}` : undefined}>{track}</span>}
      <PluginUpdate />
      <span className="readonly">只读</span>
    </footer>
  </div>;
}
