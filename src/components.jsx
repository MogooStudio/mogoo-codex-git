import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FileCode2, FileText, FlaskConical, CodeXml, Search, ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Copy, Check, AlertCircle, X, LockKeyhole, TriangleAlert } from 'lucide-react';
import { layoutGraph } from './graph.mjs';
import { dateLabel, useResource } from './api.js';
import { ChatIcon } from './icons.jsx';
import { DiffViewer } from './DiffViewer.jsx';

const comparisons = { conflict: '合并冲突', staged: 'HEAD → 暂存区', unstaged: '暂存区 → 工作区', untracked: '工作区新文件' };
const sides = { staged: ['HEAD', '暂存区'], unstaged: ['暂存区', '工作区'] };
function sourceSections(groups) {
  return [
    ['conflict', '合并的更改', groups.conflict],
    ['staged', '暂存的更改', groups.staged],
    ['working', '更改', [...groups.unstaged, ...groups.untracked].sort((a, b) => a.path.localeCompare(b.path))],
  ].filter(([, , files]) => files.length);
}
const sourceMode = (group, file) => group === 'working' ? (file.untracked ? 'untracked' : 'unstaged') : group;
const statusName = status => ({ M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', U: '冲突', '?': '未跟踪', T: '类型变化' }[status] || status);
const filterByPath = (files, query) => files.filter(file =>
  file.path.toLowerCase().includes(query) || file.originalPath?.toLowerCase().includes(query));
export function Message({ children, error = false }) {
  return <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error && <AlertCircle size={18} />}<span>{children}</span></div>;
}

function FileIcon({ path }) {
  if (/\btest\.[cm]?[jt]sx?$/.test(path)) return <FlaskConical className="file-icon file-test" />;
  if (/\.[jt]sx$/.test(path)) return <FileCode2 className="file-icon file-react" />;
  if (/\.[cm]?[jt]s$/.test(path)) return <FileCode2 className="file-icon file-script" />;
  if (/\.css$/.test(path)) return <FileCode2 className="file-icon file-style" />;
  return <FileText className="file-icon" />;
}

function FileTree({ files, prefix = '', selected, onSelect, expanded }) {
  const folders = new Map(), leaves = [];
  for (const file of files) {
    const relative = file.path.slice(prefix.length), slash = relative.indexOf('/');
    if (slash < 0) leaves.push(file);
    else {
      const name = relative.slice(0, slash);
      if (!folders.has(name)) folders.set(name, []);
      folders.get(name).push(file);
    }
  }
  return <>
    {[...folders].map(([name, children]) => <details className="folder-tree" key={name}
      open={expanded ?? (!prefix || children.some(selected))}>
      <summary className="root-folder" title={prefix + name}><ChevronRight className="disclosure" /><span>{name}</span></summary>
      <div className="folder-files"><FileTree files={children} prefix={prefix + name + '/'} selected={selected} onSelect={onSelect} expanded={expanded} /></div>
    </details>)}
    {leaves.map(file => <button className={`workspace-file ${selected(file) ? 'selected' : ''}`} key={file.path}
      title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} aria-pressed={selected(file)} onClick={() => onSelect(file)}>
      <FileIcon path={file.path} /><span className="name">{file.path.slice(prefix.length)}</span>
      <span className={`state status-${file.status}`} title={statusName(file.status)}>{file.untracked ? 'U' : file.status}</span>
    </button>)}
  </>;
}

export function Sidebar({ groups, count, mode, selected, onSelect }) {
  const sidebar = useRef(null);
  const [search, setSearch] = useState('');
  const [tree, setTree] = useState({ revision: 0, expanded: undefined });
  const [hasCollapsedNodes, setHasCollapsedNodes] = useState(true);
  const query = search.trim().toLowerCase();
  const sections = sourceSections(groups).map(([id, label, files]) => ({
    id, label, total: files.length, files: filterByPath(files, query),
  })).filter(section => section.files.length);
  useLayoutEffect(() => {
    const element = sidebar.current;
    const sync = () => setHasCollapsedNodes(element.querySelector('details:not([open])') !== null);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(element, { subtree: true, childList: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);
  const shouldExpand = hasCollapsedNodes || !sections.length;
  const toggleLabel = shouldExpand ? '全部展开' : '全部收起';
  const ToggleIcon = shouldExpand ? ChevronsUpDown : ChevronsDownUp;
  // Reset native disclosures together while keeping each folder individually toggleable.
  const setTreeExpansion = expanded => setTree(previous => ({ revision: previous.revision + 1, expanded }));
  const changeSearch = value => {
    setSearch(value);
    if (tree.expanded !== undefined) setTreeExpansion(undefined);
  };
  return <aside id="source-control-sidebar" className="sidebar" aria-label="源代码管理" ref={sidebar}>
    <header className="source-control-heading">
      <h1>源代码管理</h1>
      <span className="source-control-count" title={`${count} 个文件`}>{count} 个文件</span>
      <button type="button" className="icon-button source-control-toggle" title={toggleLabel} aria-label={toggleLabel}
        disabled={!sections.length} onClick={() => setTreeExpansion(shouldExpand)}><ToggleIcon aria-hidden="true" /></button>
    </header>
    <label className="search change-filter"><Search /><input aria-label="按文件名或路径筛选" placeholder="按文件名或路径筛选"
      value={search} onChange={event => changeSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') changeSearch(''); }} /></label>
    {sections.map(({ id, label, total, files }) => <details className="change-group" open={tree.expanded !== false}
      key={`${id}-${Boolean(query)}-${tree.revision}`}>
      <summary className={`group ${id === 'conflict' ? 'conflict-group' : ''}`}><ChevronRight className="disclosure" />
        {label}<span className="count">{query ? `${files.length}/${total}` : total}</span>
      </summary>
      <FileTree files={files} selected={file => mode === sourceMode(id, file) && selected === file.path}
        onSelect={file => onSelect(sourceMode(id, file), file.path)} expanded={tree.expanded ?? (query ? true : undefined)} />
    </details>)}
    {!sections.length && <p className="file-menu-empty" role="status">{query ? '没有匹配的路径。' : '工作区干净。'}</p>}
  </aside>;
}

function GraphCell({ row, width, active }) {
  const x = lane => 18 + lane * 18, y = value => value === 23 ? 20 : value === 46 ? 56 : 0;
  const color = value => `var(--graph-${['#8ad4b1','#b69af2','#6ba8ed','#e2ba7b','#e397b2','#74c7cc'].indexOf(value)}, var(--green))`;
  return <svg width={width} height="56" className="graph" aria-hidden="true">{row.edges.map((edge, i) => <path key={i} d={`M${x(edge.from)},${y(edge.start)} C${x(edge.from)},${(y(edge.start)+y(edge.end))/2} ${x(edge.to)},${(y(edge.start)+y(edge.end))/2} ${x(edge.to)},${y(edge.end)}`} fill="none" stroke={color(edge.color)} strokeWidth="1.5" />)}{active && <circle cx={x(row.lane)} cy="20" r="8.5" fill="var(--halo)" stroke="none" />}<circle cx={x(row.lane)} cy="20" r="4" fill={active ? color(row.color) : 'var(--bg)'} stroke={color(row.color)} strokeWidth="1.5" /></svg>;
}

export function CommitList({ data, loading, repo, selected, onSelect, search, setSearch, loadMore }) {
  const commits = data?.commits || [], graph = useMemo(() => layoutGraph(commits), [commits]);
  const matches = commit => `${commit.subject} ${commit.author} ${commit.oid}`.toLowerCase().includes(search.toLowerCase());
  const firstMatch = search ? commits.find(matches)?.oid : selected;
  const scroll = useRef(null);
  useEffect(() => {
    if (firstMatch) scroll.current?.querySelector(`[data-oid="${firstMatch}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [firstMatch]);
  return <>
    <div className="history-tools">
      <label className="search"><Search /><input aria-label="搜索已加载提交" placeholder="搜索提交、作者或哈希"
        value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="icon-button" aria-label="清除搜索" onClick={() => setSearch('')}><X /></button>}
      </label>
    </div>
    <div className="commit-scroll" ref={scroll}>
      {search && <p className="search-result" role="status">{commits.filter(matches).length} 个匹配 · 保留提交关系</p>}
      {commits.map((commit, index) => <button key={commit.oid} data-oid={commit.oid}
        className={`commit ${selected === commit.oid ? 'active' : ''} ${!matches(commit) ? 'dimmed' : ''}`}
        style={{ '--graph-width': `${graph.width}px` }} aria-pressed={selected === commit.oid} onClick={() => onSelect(commit.oid)}
        title={`${commit.subject}\n${commit.author} · ${dateLabel(commit.date)}\n${commit.oid}`}>
        <GraphCell row={graph.rows[index]} width={graph.width} active={selected === commit.oid} />
        <span className="commit-text">
          <span className="commit-title">{commit.subject || '（无提交说明）'}</span>
          <span className="commit-ref">
            {repo.refs.filter(ref => ref.oid === commit.oid).map(ref => <span key={ref.name}
              className={`ref-chip ${ref.kind === 'remote' ? 'remote-chip' : ''}`} title={ref.name}>{ref.label}</span>)}
            {repo.head === commit.oid && <span className="head-label">← HEAD</span>}
          </span>
        </span>
      </button>)}
      {!commits.length && <Message>这个范围还没有提交。</Message>}
      {data?.hasMore && <button className="load-more" onClick={loadMore} disabled={loading || data.limit >= 2000}>
        {loading ? '正在读取…' : data.limit >= 2000 ? '已达 2000 条，请选择分支缩小范围' : '加载更多提交'}
      </button>}
    </div>
  </>;
}

export function FilePicker({ files, file, onSelect, sections, mode, count }) {
  const menu = useRef(null), popup = useRef(null), filter = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null);
  const [query, setQuery] = useState('');
  const options = sections ? sections.map(([id, label, items]) => [id, label, filterByPath(items, query.trim().toLowerCase())])
    .filter(([, , items]) => items.length) : [['', '', files]];
  const close = () => { menu.current.open = false; setOpen(false); };
  const navigate = event => {
    if (!open) return;
    const buttons = [...popup.current.querySelectorAll('button')];
    if (event.target === filter.current && event.key !== 'ArrowDown') return;
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement);
    if (index < 0 && (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))) {
      event.preventDefault(); buttons[0].focus();
    } else if (index >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    } else if (event.key === 'Tab' && ((event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1))) {
      event.preventDefault(); close(); menu.current.querySelector('summary').focus();
    }
  };
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = menu.current.querySelector('summary');
    const place = () => {
      if (!anchor.getClientRects().length) { close(); return; }
      const rect = anchor.getBoundingClientRect(), gap = 4, margin = 8;
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const upward = below < 240 && above > below;
      const width = Math.min(sections ? Math.max(rect.width, 340) : rect.width, window.innerWidth - margin * 2);
      setPosition({ left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), width,
        top: upward ? 'auto' : rect.bottom + gap,
        bottom: upward ? window.innerHeight - rect.top + gap : 'auto',
        maxHeight: Math.min(460, upward ? above : below) });
    };
    const outside = event => { if (!menu.current.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); close(); anchor.focus(); } };
    place();
    const focus = sections ? requestAnimationFrame(() => filter.current?.focus()) : null;
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      if (focus !== null) cancelAnimationFrame(focus);
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, Boolean(sections)]);
  return <details className="file-menu" ref={menu} onKeyDown={navigate} onToggle={event => {
    const next = event.currentTarget.open;
    if (next) setQuery('');
    setOpen(next);
  }}>
    <summary className="file-select">
      {sections ? <><Folder /><span className="path">更改文件</span><span className="position">{count} 个文件</span></> :
        <><CodeXml /><span className="path" title={file?.path}>{file?.path || '没有文件变化'}</span><span className="position">{file ? `${files.indexOf(file) + 1} / ${files.length} · ${statusName(file.status)}` : '0 / 0'}</span></>}
      <ChevronDown />
    </summary>
    {open && createPortal(<div className="file-menu-list file-menu-popup" ref={popup} style={position || { visibility: 'hidden' }}>
      {sections && <label className="search file-menu-filter"><Search /><input ref={filter} aria-label="按文件名或路径筛选" placeholder="按文件名或路径筛选" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      {options.map(([id, label, items]) => <div key={id} role={label ? 'group' : undefined} aria-label={label || undefined}>
        {label && <div className={`file-menu-group ${id === 'conflict' ? 'conflict-group' : ''}`}>{label}<span>{items.length}</span></div>}
        {items.map(item => {
          const itemMode = sourceMode(id, item);
          const selected = item.path === file?.path && (!sections || mode === itemMode);
          return <button key={item.path} className={selected ? 'selected' : ''} aria-pressed={selected}
            title={item.originalPath ? `${item.originalPath} → ${item.path}` : item.path}
            onClick={() => {
              if (sections) onSelect(itemMode, item.path);
              else onSelect(item.path);
              close();
              menu.current.querySelector('summary').focus();
            }}>
            <FileIcon path={item.path} /><span className="name">{item.path}</span><span className={`state status-${item.status}`}>{item.untracked ? 'U' : item.status}</span>
          </button>;
        })}
      </div>)}
      {!options.length && <div className="file-menu-empty" role="status">{query.trim() ? '没有匹配的路径。' : '工作区没有文件变化。'}</div>}
    </div>, document.body)}
  </details>;
}

export function CommitInspector({ repoPath, oid, onClose, comparison, historyBase, readAttribution, showReviewTools }) {
  const { data, loading, error } = useResource('commit', oid ? { path: repoPath, oid } : null);
  const [selectedFile, setSelectedFile] = useState('');
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const timer = useRef(null);
  useEffect(() => { setCopied(false); setCopyError(''); return () => clearTimeout(timer.current); }, [oid]);
  const file = data?.files.find(f => f.path === selectedFile) || data?.files[0];
  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(oid);
      setCopied(true);
      setCopyError('');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { setCopyError('复制失败，请重试'); }
  };
  if (!oid) return <section className="details"><Message>选择一条提交，查看文件与差异。</Message></section>;
  return <section className="details">
    {loading ? <Message>正在读取提交详情…</Message> : error ? <Message error>{error}</Message> : data && <>
      <div className="detail-titlebar">
        <h2 className="detail-heading">{data.body.split('\n')[0] || '（无提交说明）'}</h2>
        {onClose && <button className="panel-action" aria-label="关闭提交详情" title="关闭提交详情" onClick={onClose}><X /></button>}
      </div>
      <div className="comparison">
        <button className="copy-sha" title="复制完整提交哈希" aria-label="复制完整提交哈希" onClick={copySha}>
          {copied ? <Check /> : <Copy />}<code>{oid.slice(0, 7)}</code>
        </button>
        <span>{data.author}</span><time>{dateLabel(data.date)}</time><span>·</span><span>{data.files.length} 个文件</span>
        {!comparison && data.parents.length > 1 && <span>合并提交 · 对比第一个父提交</span>}
        {copyError && <span role="alert">{copyError}</span>}
      </div>
      {data.body.includes('\n') && <details className="commit-body"><summary>完整提交说明</summary><pre>{data.body}</pre></details>}
      {onClose && data.files.length > 0 && <div className="commit-files" aria-label="提交变更文件">
        {data.files.map(item => <button key={item.path} className="commit-file" aria-pressed={item.path === file?.path}
          title={item.path} onClick={() => setSelectedFile(item.path)}>
          <FileIcon path={item.path} /><code>{item.path}</code>
          <span className={`status-label status-${item.status}`}>{statusName(item.status)}</span>
        </button>)}
      </div>}
      <div className={onClose && data.files.length ? 'commit-picker' : undefined}>
        <FilePicker files={data.files} file={file} onSelect={setSelectedFile} />
      </div>
      <DiffViewer repoPath={repoPath} file={file} mode="commit" oid={oid} oldOid={data.parents[0]} comparison={comparison}
        historyBase={historyBase} readAttribution={readAttribution} showReviewTools={showReviewTools}
        filePosition={onClose && file ? `${data.files.indexOf(file) + 1} / ${data.files.length}` : undefined} />
    </>}
  </section>;
}

export function Changes({ repo, groups, mode, file, onSelect, hidden }) {
  return <section className="changes-view" hidden={hidden}>
    <DiffViewer repoPath={repo.root} file={file} mode={mode === 'conflict' ? 'unstaged' : mode} revision={repo.refreshedAt} comparison={comparisons[mode]}
      historyBase={repo.head} sides={sides[mode]} sourceView
      actions={<>
        <div className="change-file-picker"><FilePicker sections={sourceSections(groups)} count={repo.files.length}
          file={file} mode={mode} onSelect={onSelect} /></div>
        {groups.conflict.length > 0 && <button className="panel-action conflict-group" onClick={() => {
          const first = groups.conflict[0];
          onSelect('conflict', first.path);
        }}><TriangleAlert />{groups.conflict.length} 个冲突</button>}
      </>} />
  </section>;
}

export function Worktrees({ repo }) {
  return <section className="worktrees-content"><table className="worktree-table"><thead><tr><th>路径</th><th>分支</th><th>HEAD</th><th>聊天</th></tr></thead><tbody>{repo.worktrees.map(tree => <tr key={tree.worktree}><td><span className="worktree-value"><Folder /><code>{tree.worktree}</code></span>{tree.locked && <span className="tree-note"><LockKeyhole size={13} />已锁定</span>}{tree.prunable && <span className="tree-note">路径不可用</span>}</td><td><code className="ref">{tree.branch?.replace('refs/heads/', '') || (tree.bare ? '裸仓库' : '分离的 HEAD')}</code></td><td><code className="ref">{tree.HEAD?.slice(0,7) || '—'}</code></td><td>{tree.worktree.replaceAll('\\','/').toLowerCase() === repo.root.replaceAll('\\','/').toLowerCase() && <span className="worktree-value"><ChatIcon />当前聊天</span>}</td></tr>)}</tbody></table>{repo.worktrees.length === 1 && <p className="worktree-note">没有其他工作树</p>}{!repo.worktrees.length && <Message>没有可显示的工作树。</Message>}</section>;
}
