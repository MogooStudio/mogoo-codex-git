import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, File, CodeXml, Search, ChevronRight, ChevronDown, Copy, Check, AlertCircle, X, LockKeyhole } from 'lucide-react';
import { layoutGraph } from './graph.mjs';
import { dateLabel, useResource } from './api.js';
import { ChatIcon } from './icons.jsx';
import { parseDiff } from './diff.mjs';

export const modes = [['unstaged', '未暂存'], ['staged', '已暂存'], ['untracked', '未跟踪']];
const statusName = status => ({ M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', U: '冲突', '?': '未跟踪', T: '类型变化' }[status] || status);
export function Message({ children, error = false }) {
  return <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error && <AlertCircle size={18} />}<span>{children}</span></div>;
}

function FileTree({ files, prefix = '', selected, onSelect, expanded }) {
  const folders = new Map(), leaves = [];
  files.forEach(file => {
    const relative = file.path.slice(prefix.length), slash = relative.indexOf('/');
    if (slash < 0) leaves.push(file);
    else { const name = relative.slice(0, slash); if (!folders.has(name)) folders.set(name, []); folders.get(name).push(file); }
  });
  return <>{[...folders].map(([name, children]) => <details className="folder-tree" key={name} open={(expanded && children.some(file => file.path === selected)) || undefined}><summary className="root-folder" title={prefix + name}><ChevronRight className="disclosure" /><Folder /><span>{name}</span><span className="folder-count">{children.length}</span></summary><div className="folder-files"><FileTree files={children} prefix={prefix + name + '/'} selected={selected} onSelect={onSelect} expanded={expanded} /></div></details>)}{leaves.map(file => <button className={`workspace-file ${selected === file.path ? 'selected' : ''}`} key={file.path} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} aria-pressed={selected === file.path} onClick={() => onSelect(file.path)}><File /><span className="name">{file.path.slice(prefix.length)}</span><span className={`state status-${file.status}`}>{file.status}</span></button>)}</>;
}

export function Sidebar({ groups, view, mode, selected, onSelect, mobileOpen, close }) {
  return <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="源代码管理"><h1>源代码管理<button className="icon-button sidebar-close" aria-label="关闭文件栏" onClick={close}><X /></button></h1>{modes.map(([id, label]) => <details className="change-group" open key={id}><summary className="group"><ChevronRight className="disclosure" />{label}<span className="count">{groups[id].length}</span></summary><FileTree key={`${id}-${view}`} files={groups[id]} selected={view === 'changes' && mode === id ? selected : ''} onSelect={path => onSelect(id, path)} expanded={view === 'changes'} /></details>)}</aside>;
}

function GraphCell({ row, width, active }) {
  const x = lane => 18 + lane * 18, y = value => value === 23 ? 20 : value === 46 ? 56 : 0;
  const color = value => `var(--graph-${['#8ad4b1','#b69af2','#6ba8ed','#e2ba7b','#e397b2','#74c7cc'].indexOf(value)}, var(--green))`;
  return <svg width={width} height="56" className="graph" aria-hidden="true">{row.edges.map((edge, i) => <path key={i} d={`M${x(edge.from)},${y(edge.start)} C${x(edge.from)},${(y(edge.start)+y(edge.end))/2} ${x(edge.to)},${(y(edge.start)+y(edge.end))/2} ${x(edge.to)},${y(edge.end)}`} fill="none" stroke={color(edge.color)} strokeWidth="1.5" />)}{active && <circle cx={x(row.lane)} cy="20" r="8.5" fill="var(--halo)" stroke="none" />}<circle cx={x(row.lane)} cy="20" r="4" fill={active ? color(row.color) : 'var(--bg)'} stroke={color(row.color)} strokeWidth="1.5" /></svg>;
}

export function CommitList({ data, loading, repo, selected, onSelect, search, setSearch, loadMore }) {
  const commits = data?.commits || [], graph = useMemo(() => layoutGraph(commits), [commits]);
  const matches = commit => `${commit.subject} ${commit.author} ${commit.oid}`.toLowerCase().includes(search.toLowerCase());
  const firstMatch = search ? commits.find(matches)?.oid : selected, scroll = useRef(null);
  useEffect(() => { if (firstMatch) scroll.current?.querySelector(`[data-oid="${firstMatch}"]`)?.scrollIntoView({ block: 'nearest' }); }, [firstMatch]);
  return <><label className="search"><Search /><input aria-label="搜索已加载提交" placeholder="搜索提交、作者或哈希" value={search} onChange={e => setSearch(e.target.value)} />{search && <button className="icon-button" aria-label="清除搜索" onClick={() => setSearch('')}><X /></button>}</label><div className="commit-scroll" ref={scroll}>{search && <p className="search-result" role="status">{commits.filter(matches).length} 个匹配 · 保留提交关系</p>}{commits.map((commit, index) => <button key={commit.oid} data-oid={commit.oid} className={`commit ${selected === commit.oid ? 'active' : ''} ${!matches(commit) ? 'dimmed' : ''}`} style={{ '--graph-width': `${graph.width}px` }} aria-pressed={selected === commit.oid} onClick={() => onSelect(commit.oid)} title={`${commit.subject}\n${commit.author} · ${dateLabel(commit.date)}\n${commit.oid}`}><GraphCell row={graph.rows[index]} width={graph.width} active={selected === commit.oid} /><span className="commit-text"><span className="commit-title">{commit.subject || '（无提交说明）'}</span><span className="commit-ref">{repo.refs.filter(ref => ref.oid === commit.oid && !ref.name.endsWith("/HEAD")).map(ref => <span key={ref.name} className={`ref-chip ${ref.kind === 'remote' ? 'remote-chip' : ''}`} title={ref.name}>{ref.label}</span>)}{repo.head === commit.oid && <span className="head-label">← HEAD</span>}</span></span></button>)}{!commits.length && <Message>这个范围还没有提交。</Message>}{data?.hasMore && <button className="load-more" onClick={loadMore} disabled={loading || data.limit >= 2000}>{loading ? '正在读取…' : data.limit >= 2000 ? '已达 2000 条，请选择分支缩小范围' : '加载更多提交'}</button>}</div></>;
}

export function FilePicker({ files, file, onSelect }) {
  const menu = useRef(null), popup = useRef(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null);
  const close = () => { menu.current.open = false; setOpen(false); };
  const navigate = event => {
    if (!open) return;
    const buttons = [...popup.current.querySelectorAll('button')];
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
      const rect = anchor.getBoundingClientRect(), gap = 4, margin = 8;
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const upward = below < 240 && above > below;
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      setPosition({ left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), width,
        top: upward ? 'auto' : rect.bottom + gap,
        bottom: upward ? window.innerHeight - rect.top + gap : 'auto',
        maxHeight: Math.min(460, upward ? above : below) });
    };
    const outside = event => { if (!menu.current.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); close(); anchor.focus(); } };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <details className="file-menu" ref={menu} onKeyDown={navigate} onToggle={event => setOpen(event.currentTarget.open)}><summary className="file-select"><CodeXml /><span className="path" title={file?.path}>{file?.path || '没有文件变化'}</span><span className="position">{file ? `${files.indexOf(file) + 1} / ${files.length} · ${statusName(file.status)}` : '0 / 0'}</span><ChevronDown /></summary>{open && createPortal(<div className="file-menu-list file-menu-popup" ref={popup} style={position || { visibility: 'hidden' }}>{files.map(item => <button key={item.path} className={item.path === file?.path ? 'selected' : ''} aria-pressed={item.path === file?.path} title={item.originalPath ? `${item.originalPath} → ${item.path}` : item.path} onClick={() => { onSelect(item.path); close(); menu.current.querySelector('summary').focus(); }}><File /><span className="name">{item.path}</span><span className="state">{item.status}</span></button>)}</div>, document.body)}</details>;
}

function SourceText({ row, json }) {
  if (row.highlight) { const [a, b] = row.highlight; return <>{row.text.slice(0,a)}<mark className={row.type === 'addition' ? 'token-add' : 'token-remove'}>{row.text.slice(a,b)}</mark>{row.text.slice(b)}</>; }
  if (!json || row.type !== 'plain') return row.text;
  return row.text.split(/("(?:[^"\\]|\\.)*")/g).map((part, i, parts) => <span key={i} className={part.startsWith('"') && !/^\s*:/.test(parts[i+1] || '') ? 'str' : undefined}>{part}</span>);
}

export function DiffViewer({ repoPath, file, mode, oid, revision, title = false }) {
  const { data, loading, error } = useResource('patch', file ? { path: repoPath, file: file.path, mode, ...(oid ? { oid } : {}) } : null, mode === 'commit' ? '' : revision);
  const rows = useMemo(() => data?.patch ? parseDiff(data.patch, mode === 'untracked') : [], [data?.patch, mode]), scroll = useRef(null);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [file?.path, mode, oid]);
  return <section className="diff-panel" aria-label="文件差异">{title && <div className="diff-title"><CodeXml /><span title={file?.path}>{file?.path || '选择文件'}</span><small>工作区 · {modes.find(([id]) => id === mode)?.[1]}</small></div>}{!file ? <Message>此范围没有文件变化。</Message> : loading ? <Message>正在读取文件差异…</Message> : error ? <Message error>{error}</Message> : <>{data?.notice && !(mode === 'untracked' && rows.length) && <div className="diff-notice">{data.notice}</div>}{data?.truncated && <div className="diff-notice">差异较大，仅显示前 5000 行 / 400000 字符。</div>}<div className={`patch ${mode === 'untracked' ? 'plain-source' : ''}`} ref={scroll} tabIndex="0" aria-label={`${file.path} 内容`}>{rows.length ? rows.map((row, i) => row.type === 'raw' ? <pre className="raw-diff" key={i}>{row.text}</pre> : row.type === 'meta' ? <div className="hunk" key={i}>{row.text}</div> : <div className={`line ${row.type === 'addition' ? 'add' : row.type === 'deletion' ? 'remove' : ''}`} key={i}>{mode !== 'untracked' && <><span className="num">{row.before}</span><span className="num">{row.after}</span><span className="sign">{row.sign}</span></>}{mode === 'untracked' && <span className="num">{row.after}</span>}<code className="content"><SourceText row={row} json={file.path.endsWith('.json')} /></code></div>) : <Message>没有可显示的文本差异。</Message>}</div></>}</section>;
}

export function CommitInspector({ repoPath, oid }) {
  const { data, loading, error } = useResource('commit', oid ? { path: repoPath, oid } : null);
  const [selectedFile, setSelectedFile] = useState(''), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState('');
  const timer = useRef(null);
  useEffect(() => { setCopied(false); setCopyError(''); return () => clearTimeout(timer.current); }, [oid]);
  const file = data?.files.find(f => f.path === selectedFile) || data?.files[0];
  if (!oid) return <section className="details"><Message>选择一条提交，查看文件与差异。</Message></section>;
  return <section className="details">{loading ? <Message>正在读取提交详情…</Message> : error ? <Message error>{error}</Message> : data && <><h2 className="detail-heading">{data.body.split('\n')[0] || '（无提交说明）'}</h2><div className="comparison"><button className="copy-sha" title="复制完整提交哈希" aria-label="复制完整提交哈希" onClick={async () => { try { await navigator.clipboard.writeText(oid); setCopied(true); setCopyError(''); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500); } catch { setCopyError('复制失败，请重试'); } }}>{copied ? <Check /> : <Copy />}<code>{oid.slice(0,7)}</code></button><span>{data.author}</span><time>{dateLabel(data.date)}</time><span>·</span><span>{data.files.length} 个文件</span>{data.parents.length > 1 && <span>合并提交 · 对比第一个父提交</span>}{copyError && <span role="alert">{copyError}</span>}</div>{data.body.includes('\n') && <details className="commit-body"><summary>完整提交说明</summary><pre>{data.body}</pre></details>}<FilePicker files={data.files} file={file} onSelect={setSelectedFile} /><DiffViewer repoPath={repoPath} file={file} mode="commit" oid={oid} /></>}</section>;
}

export function Changes({ repo, groups, mode, setMode, file, onSelect }) {
  return <section className="changes-view"><div className="narrow-change-controls"><select aria-label="改动范围" value={mode} onChange={e => setMode(e.target.value)}>{modes.map(([id,label]) => <option key={id} value={id}>{label} · {groups[id].length}</option>)}</select><FilePicker files={groups[mode]} file={file} onSelect={onSelect} /></div>{file?.conflict && <div className="diff-notice">此文件存在合并冲突。</div>}<DiffViewer repoPath={repo.root} file={file} mode={mode} revision={repo.refreshedAt} title /></section>;
}

export function Worktrees({ repo }) {
  return <section className="worktrees-content"><table className="worktree-table"><thead><tr><th>路径</th><th>分支</th><th>HEAD</th><th>聊天</th></tr></thead><tbody>{repo.worktrees.map(tree => <tr key={tree.worktree}><td><span className="worktree-value"><Folder /><code>{tree.worktree}</code></span>{tree.locked && <span className="tree-note"><LockKeyhole size={13} />已锁定</span>}{tree.prunable && <span className="tree-note">路径不可用</span>}</td><td><code className="ref">{tree.branch?.replace('refs/heads/', '') || (tree.bare ? '裸仓库' : '分离的 HEAD')}</code></td><td><code className="ref">{tree.HEAD?.slice(0,7) || '—'}</code></td><td>{tree.worktree.replaceAll('\\','/').toLowerCase() === repo.root.replaceAll('\\','/').toLowerCase() && <span className="worktree-value"><ChatIcon />当前聊天</span>}</td></tr>)}</tbody></table>{repo.worktrees.length === 1 && <p className="worktree-note">没有其他工作树</p>}{!repo.worktrees.length && <Message>没有可显示的工作树。</Message>}</section>;
}
