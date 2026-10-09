import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, History, FileDiff, FolderGit2, Cloud, Tag, Search, ChevronRight, LockKeyhole, GitCommitHorizontal, Copy, Check, AlertCircle, X } from 'lucide-react';
import { layoutGraph } from './graph.mjs';
import { dateLabel, useResource } from './api.js';

export function Message({ children, error = false }) {
  return <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error && <AlertCircle size={18} />}<span>{children}</span></div>;
}

export function Sidebar({ repo, view, setView, filter, setFilter, mobileOpen, close }) {
  const nav = (id, label, Icon, count) => <button className={`nav-row ${view === id ? 'active' : ''}`} onClick={() => { setView(id); close(); }}><Icon size={18} /><span>{label}</span>{count > 0 && <small>{count}</small>}</button>;
  return <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
    <div className="repo-heading"><div><strong title={repo.root}>{repo.name}</strong><span><GitBranch size={13} />{repo.branch || (repo.head ? '分离的 HEAD' : '尚无提交')}</span></div><button className="icon-button mobile-only" aria-label="关闭导航" onClick={close}><X size={18} /></button></div>
    <nav aria-label="仓库导航">
      {nav('history', '提交记录', History)}
      {nav('changes', '工作区改动', FileDiff, repo.files.length)}
      {nav('worktrees', '工作树', FolderGit2)}
    </nav>
    <div className="ref-sections">
      <button className={`nav-row all-refs ${!filter && view === 'history' ? 'chosen' : ''}`} onClick={() => { setFilter(''); setView('history'); close(); }}><GitCommitHorizontal size={17} /><span>全部提交</span></button>
      {[['local', '本地分支', GitBranch], ['remote', '远程分支', Cloud], ['tag', '标签', Tag]].map(([kind, title, Icon]) => {
        const refs = repo.refs.filter(ref => ref.kind === kind);
        return <section className="ref-section" key={kind}><h2>{title}<span>{refs.length}</span></h2>{refs.length ? refs.map(ref => <button key={ref.name} title={ref.label} className={`nav-row ref-row ${filter === ref.name && view === 'history' ? 'chosen' : ''}`} onClick={() => { setFilter(ref.name); setView('history'); close(); }}><Icon size={16} /><span>{ref.label}</span>{ref.name === `refs/heads/${repo.branch}` && <i className="current-dot" />}</button>) : <p className="muted empty-ref">暂无{title}</p>}</section>;
      })}
    </div>
    <div className="remote-note"><Cloud size={15} /><span>{repo.upstream ? <>{repo.upstream}<br /><b>{repo.track.includes('gone') ? '跟踪引用已不存在' : repo.track ? repo.track.replace(/\[|\]/g, '').replace('ahead', '领先').replace('behind', '落后') : '与本地跟踪引用一致'}</b></> : '未设置上游分支'}<small>远程信息来自本机，未联网刷新</small></span></div>
  </aside>;
}

function GraphCell({ row, width }) {
  const x = lane => 18 + lane * 18;
  return <svg width={width} height="46" className="graph" aria-hidden="true">{row.edges.map((edge, i) => <path key={i} d={`M${x(edge.from)},${edge.start} C${x(edge.from)},${(edge.start + edge.end) / 2} ${x(edge.to)},${(edge.start + edge.end) / 2} ${x(edge.to)},${edge.end}`} fill="none" stroke={edge.color} strokeWidth="2" />)}<circle cx={x(row.lane)} cy="23" r="4.5" fill={row.color} stroke="var(--bg)" strokeWidth="1.5" /></svg>;
}

export function CommitList({ data, loading, repo, selected, onSelect, search, setSearch, loadMore }) {
  const commits = data?.commits || [];
  const graph = useMemo(() => layoutGraph(commits), [commits]);
  const refsByOid = useMemo(() => {
    const map = new Map();
    repo.refs.forEach(ref => { map.set(ref.oid, [...(map.get(ref.oid) || []), ref]); });
    return map;
  }, [repo.refs]);
  const matches = commit => `${commit.subject} ${commit.author} ${commit.oid}`.toLowerCase().includes(search.toLowerCase());
  const count = commits.filter(matches).length;
  const scrollRef = useRef(null);
  const firstMatch = search ? commits.find(matches)?.oid : selected;
  useEffect(() => {
    if (firstMatch) scrollRef.current?.querySelector(`[data-oid="${firstMatch}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [firstMatch, search]);
  return <>
    <div className="section-heading"><div><h1>提交记录</h1><span className="muted">{search ? `${count} 个匹配 · 保留图形上下文` : `${commits.length} 条已加载`}</span></div><label className="search"><Search size={16} /><input aria-label="搜索已加载提交" placeholder="搜索提交、作者或哈希…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button" aria-label="清除搜索" onClick={() => setSearch('')}><X size={14} /></button>}</label></div>
    <div className="commit-scroll" ref={scrollRef}><div className="commit-table" style={{ '--graph-width': `${graph.width}px` }}>
      <div className="commit-header"><span>图形</span><span>提交信息</span><span className="sha-col">哈希</span><span className="author-col">作者</span><span className="date-col">日期</span></div>
      {commits.map((commit, index) => <button key={commit.oid} data-oid={commit.oid} className={`commit-row ${selected === commit.oid ? 'selected' : ''} ${!matches(commit) ? 'dimmed' : ''}`} aria-pressed={selected === commit.oid} onClick={() => onSelect(commit.oid)} title={`${commit.subject}\n${commit.oid}`}>
        <GraphCell row={graph.rows[index]} width={graph.width} /><span className="commit-subject"><span>{commit.subject || '（无提交说明）'}</span><span className="ref-badges">{(refsByOid.get(commit.oid) || []).slice(0, 2).map(ref => <span key={ref.name} className={`ref-badge ${ref.kind}`} title={ref.label}>{ref.kind === 'tag' ? <Tag size={11} /> : <GitBranch size={11} />}{ref.label}</span>)}</span></span><code className="sha-col muted">{commit.oid.slice(0, 7)}</code><span className="author-col muted truncate">{commit.author}</span><time className="date-col muted" title={dateLabel(commit.date)}>{dateLabel(commit.date, true)}</time>
      </button>)}
      {!commits.length && <Message>这个范围还没有提交。</Message>}
    </div>{data?.hasMore && <button className="load-more" onClick={loadMore} disabled={loading || data.limit >= 2000}>{loading ? '正在读取更多提交…' : data.limit >= 2000 ? '已达 2000 条上限，请选择分支缩小范围' : '加载更多提交'}</button>}</div>
  </>;
}

function diffLines(patch) {
  let oldLine = 0, newLine = 0;
  const lines = patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const firstHunk = lines.findIndex(line => /^@@/.test(line));
  return lines.slice(Math.max(0, firstHunk)).map((line, index) => {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); }
    const meta = hunk || /^(diff |index |--- |\+\+\+ |new file |deleted file |old mode |new mode |Binary |Submodule |\\)/.test(line);
    const type = meta ? 'meta' : line.startsWith('+') ? 'addition' : line.startsWith('-') ? 'deletion' : 'context';
    const before = !meta && type !== 'addition' && oldLine ? oldLine++ : '';
    const after = !meta && type !== 'deletion' && newLine ? newLine++ : '';
    return <div className={`diff-line ${type}`} key={index}><span className="line-number">{before}</span><span className="line-number">{after}</span><code>{line || ' '}</code></div>;
  });
}

export function DiffViewer({ repoPath, file, mode, oid, revision }) {
  const { data, loading, error } = useResource('patch', file ? { path: repoPath, file: file.path, mode, ...(oid ? { oid } : {}) } : null, mode === 'commit' ? '' : revision);
  const rendered = useMemo(() => data?.patch ? diffLines(data.patch) : null, [data?.patch]);
  return <section className="diff-panel" aria-label="文件差异"><div className="diff-title"><FileDiff size={15} /><span title={file?.path}>{file?.path || '文件差异'}</span><small>{mode === 'staged' ? 'HEAD → 暂存区' : mode === 'unstaged' ? '暂存区 → 工作区' : mode === 'untracked' ? '未跟踪' : '统一差异'}</small></div>
    {!file ? <Message>选择一个文件查看差异。</Message> : loading ? <Message>正在读取文件差异…</Message> : error ? <Message error>{error}</Message> : <>{data?.notice && <div className="diff-notice">{data.notice}</div>}{data?.truncated && <div className="diff-notice">差异较大，仅显示前 5000 行 / 400000 字符。</div>}<div className="diff-content">{rendered || <Message>{data?.notice ? '没有可显示的文本差异。' : '没有文本差异，文件可能仅包含模式变化或已被外部更新。'}</Message>}</div></>}
  </section>;
}

export function FileList({ files, selected, onSelect, title = '变更的文件' }) {
  return <div className="file-list"><div className="file-list-title">{title}<span>{files.length}</span></div><div className="file-list-scroll">{files.map(file => <button key={file.path} className={`file-row ${selected === file.path ? 'selected' : ''}`} onClick={() => onSelect(file.path)} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}><span className={`file-status status-${file.status}`}>{file.status || 'M'}</span><span>{file.path}</span><ChevronRight size={13} /></button>)}{!files.length && <p className="muted empty-ref">没有文件变化</p>}</div></div>;
}

export function CommitInspector({ repoPath, oid }) {
  const { data, loading, error } = useResource('commit', oid ? { path: repoPath, oid } : null);
  const [selectedFile, setSelectedFile] = useState('');
  const [copied, setCopied] = useState(false);
  const file = data?.files.find(f => f.path === selectedFile) || data?.files[0];
  if (!oid) return <div className="inspector inspector-empty"><GitCommitHorizontal size={30} /><p>选择一条提交，查看它的文件与差异。</p></div>;
  return <div className="inspector">{loading ? <Message>正在读取提交详情…</Message> : error ? <Message error>{error}</Message> : data && <><div className="inspector-heading"><h2>{data.body.split('\n')[0] || '（无提交说明）'}</h2><div className="commit-meta"><button className="copy-sha" title="复制完整提交哈希" onClick={async () => { try { await navigator.clipboard.writeText(oid); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }}><code>{oid.slice(0, 10)}</code>{copied ? <Check size={13} /> : <Copy size={13} />}</button><span>{data.author}</span><time>{dateLabel(data.date)}</time>{data.parents.length > 1 && <span>合并提交 · 对比第一个父提交</span>}</div>{data.body.includes('\n') && <details className="commit-body"><summary>完整提交说明</summary><pre>{data.body}</pre></details>}</div><div className="file-diff-layout"><FileList files={data.files} selected={file?.path} onSelect={setSelectedFile} /><DiffViewer repoPath={repoPath} file={file} mode="commit" oid={oid} /></div></>}</div>;
}

export function Changes({ repo }) {
  const [mode, setMode] = useState('unstaged');
  const [selected, setSelected] = useState('');
  const groups = useMemo(() => ({
    unstaged: repo.files.filter(f => !f.untracked && f.worktree !== ' ').map(f => ({ ...f, status: f.conflict ? 'U' : f.worktree })),
    staged: repo.files.filter(f => !f.untracked && f.index !== ' ').map(f => ({ ...f, status: f.conflict ? 'U' : f.index })),
    untracked: repo.files.filter(f => f.untracked).map(f => ({ ...f, status: '?' })),
  }), [repo.files]);
  const files = groups[mode];
  const file = files.find(f => f.path === selected) || files[0];
  return <section className="changes-view"><div className="section-heading"><div><h1>工作区改动</h1><span className="muted">{repo.files.length} 个文件 · 同一文件可能同时有已暂存和未暂存改动</span></div></div><div className="change-tabs" role="tablist" aria-label="改动范围">{[['unstaged', '未暂存'], ['staged', '已暂存'], ['untracked', '未跟踪']].map(([id, label]) => <button role="tab" aria-selected={mode === id} className={mode === id ? 'active' : ''} key={id} onClick={() => { setMode(id); setSelected(''); }}>{label}<span>{groups[id].length}</span></button>)}</div>{repo.files.some(f => f.conflict) && <div className="diff-notice">检测到合并冲突。此面板只展示状态与差异，不会解决冲突或修改文件。</div>}<div className="file-diff-layout"><FileList files={files} selected={file?.path} onSelect={setSelected} /><DiffViewer repoPath={repo.root} file={file} mode={mode} revision={repo.refreshedAt} /></div></section>;
}

export function Worktrees({ repo }) {
  return <section className="worktrees-view"><div className="section-heading"><div><h1>工作树</h1><span className="muted">面板始终绑定当前聊天目录，其他工作树仅展示信息</span></div></div><div className="worktree-list">{repo.worktrees.map(tree => <div className="worktree-row" key={tree.worktree}><FolderGit2 size={24} /><div><strong>{tree.branch?.replace('refs/heads/', '') || (tree.bare ? '裸仓库' : '分离的 HEAD')}</strong><code>{tree.worktree}</code><small>{tree.HEAD?.slice(0, 10)}{tree.locked && <> · <LockKeyhole size={11} /> 已锁定</>}{tree.prunable && ' · 路径不可用'}</small></div>{tree.worktree.replaceAll('\\', '/') === repo.root.replaceAll('\\', '/') && <span className="current-worktree">当前聊天</span>}</div>)}</div></section>;
}
