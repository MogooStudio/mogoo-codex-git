import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, CodeXml, History, Search, UserRound, X } from 'lucide-react';
import { dateLabel, useResource } from './api.js';
import { parseDiff, splitDiffRows } from './diff.mjs';

function SourceText({ row, json }) {
  if (row.highlight) {
    const [start, end] = row.highlight;
    return <>{row.text.slice(0, start)}<mark className={row.type === 'addition' ? 'token-add' : 'token-remove'}>{row.text.slice(start, end)}</mark>{row.text.slice(end)}</>;
  }
  if (!json || row.type !== 'plain') return row.text;
  return row.text.split(/("(?:[^"\\]|\\.)*")/g).map((part, i, parts) =>
    <span key={i} className={part.startsWith('"') && !/^\s*:/.test(parts[i + 1] || '') ? 'str' : undefined}>{part}</span>);
}

function SearchText({ text, hits, active }) {
  let offset = 0;
  return <>{hits.map(({ index, start, end }) => {
    const prefix = text.slice(offset, start);
    offset = end;
    return <React.Fragment key={index}>{prefix}<mark className="diff-hit" data-diff-match={index}
      data-active={index === active}>{text.slice(start, end)}</mark></React.Fragment>;
  })}{text.slice(offset)}</>;
}

function FileHistoryList({ repoPath, file, oid, onSelect }) {
  const [limit, setLimit] = useState(50);
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useResource('file-history', { path: repoPath, file, oid, limit }, retry, JSON.stringify([file, oid]));
  return <div className="file-history-list" role="region" aria-label="文件历史">
    <div className="file-history-heading"><strong>文件历史</strong><code title={file}>{file}</code></div>
    {error && <div className="tool-status tool-error"><span role="alert">{error}</span>
      <button className="panel-action retry-action" onClick={() => setRetry(n => n + 1)}>重试</button></div>}
    {!data && !error && <div className="tool-status" role="status">正在读取文件历史…</div>}
    {data && (
      !data.entries.length ? <div className="tool-status">这个路径还没有提交记录。</div> : <>
        {data.entries.map(entry => <button key={entry.oid} className="file-history-entry" onClick={() => onSelect(entry)}>
          <span>{entry.subject || '（无提交说明）'}</span>
          <small><code>{entry.oid.slice(0, 7)}</code> · {entry.author} · {dateLabel(entry.date)}
            {entry.originalPath && <span className="file-history-rename" title={`${entry.originalPath} → ${entry.path}`}>
              {entry.originalPath} → {entry.path}
            </span>}
          </small>
        </button>)}
        {data.hasMore && <button className="load-more" disabled={loading || limit >= 500} onClick={() => setLimit(n => Math.min(500, n + 50))}>
          {limit >= 500 ? '已显示最近 500 条' : loading ? '正在读取…' : '加载更多文件历史'}
        </button>}
      </>)}
  </div>;
}

export function DiffViewer({
  repoPath, file: sourceFile, mode: sourceMode, oid: sourceOid, oldOid, revision, comparison, actions,
  historyBase = sourceOid, readAttribution = true, sides, sourceView = false, filePosition, showReviewTools = true, hidePathHeading = false,
}) {
  const sourceKey = JSON.stringify([sourceMode, sourceFile?.path, sourceOid, historyBase]);
  const [history, setHistory] = useState(null);
  const currentHistory = history?.key === sourceKey ? history : null;
  const point = currentHistory?.point;
  const file = point ? { path: point.path } : sourceFile;
  const mode = point ? 'commit' : sourceMode;
  const oid = point?.oid || sourceOid;
  const previous = point ? null : oldOid;
  const historyPath = sourceOid ? sourceFile?.path : sourceFile?.originalPath || sourceFile?.path;
  const canHistory = Boolean(showReviewTools && historyBase && historyPath);
  const changeHistory = next => setHistory({ key: sourceKey, open: false, point: null, ...next });
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useResource('patch', file ? {
    path: repoPath, file: file.path, mode, ...(oid ? { oid } : {}),
  } : null, `${mode === 'commit' ? '' : revision}:${retry}`);
  const rows = useMemo(() => {
    const parsed = data?.patch ? parseDiff(data.patch, mode === 'untracked') : [];
    if (parsed[0]?.type === 'raw') return parsed[0].text.split('\n').map(text => ({ type: 'raw', text }));
    return parsed;
  }, [data?.patch, mode]);
  const lineStats = useMemo(() => {
    let added = 0, removed = 0;
    for (const row of rows) {
      if (row.type === 'addition') added++;
      if (row.type === 'deletion') removed++;
    }
    return { added, removed };
  }, [rows]);
  const hasLineStats = lineStats.added > 0 || lineStats.removed > 0;
  const hunks = useMemo(() => rows.flatMap((row, index) =>
    (row.type === 'meta' || row.type === 'raw') && /^@{2,} /.test(row.text) ? [index] : []), [rows]);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState(0);
  const [hunk, setHunk] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [attributing, setAttributing] = useState(false);
  const [line, setLine] = useState(null);
  const [layout, setLayout] = useState('split');
  const [wide, setWide] = useState(false);
  const panel = useRef(null);
  const canAttribute = Boolean(showReviewTools && (readAttribution || point) && oid &&
    rows.some(row => row.after || (previous && row.before)));
  const canSplit = Boolean(wide && sides && !point && rows.some(row => row.before || row.after));
  const canFind = showReviewTools && !sourceView && rows.length > 0;
  const split = canSplit && layout === 'split';
  const pairs = useMemo(() => split ? splitDiffRows(rows) : [], [rows, split]);
  const attributed = useResource('attribution', attributing && canAttribute && line
    ? { path: repoPath, file: file.path, oid: line.oid, line: line.number } : null);
  const scroll = useRef(null), findInput = useRef(null), findButton = useRef(null);
  const copyTimeout = useRef(null), copyRequest = useRef(0);
  const { hitsByRow, count } = useMemo(() => {
    if (!finding || !query) return { hitsByRow: [], count: 0 };
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    let count = 0;
    const hitsByRow = rows.map(row => Array.from(row.text.matchAll(pattern), hit =>
      ({ index: count++, start: hit.index, end: hit.index + hit[0].length })));
    return { hitsByRow, count };
  }, [rows, finding, query]);
  const active = Math.min(match, Math.max(0, count - 1));
  useEffect(() => {
    if (!sourceView) return;
    const observer = new ResizeObserver(([entry]) => {
      // Hidden tabs report zero width. Retain the layout while they are hidden.
      if (entry.contentRect.width) setWide(entry.contentRect.width >= 680);
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [sourceView]);
  useEffect(() => {
    setFinding(false);
    setQuery('');
    setMatch(0);
    setHunk(null);
    setFeedback('');
    setAttributing(false);
    setLine(null);
    if (scroll.current) { scroll.current.scrollTop = 0; scroll.current.scrollLeft = 0; }
    return () => {
      copyRequest.current++;
      clearTimeout(copyTimeout.current);
    };
  }, [file?.path, mode, oid, previous]);
  useEffect(() => { if (finding) findInput.current?.focus(); }, [finding]);
  useEffect(() => {
    if (count) scroll.current?.querySelector(`[data-diff-match="${active}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [hitsByRow, active, count]);

  const closeFind = () => {
    setFinding(false);
    setQuery('');
    setMatch(0);
    findButton.current?.focus();
  };
  const nextMatch = direction => { if (count) setMatch((active + direction + count) % count); };
  const jumpHunk = direction => {
    if (!scroll.current || !hunks.length) return;
    const position = hunks.indexOf(hunk);
    const next = position < 0 ? (direction === 1 ? Math.min(1, hunks.length - 1) : 0) :
      (position + direction + hunks.length) % hunks.length;
    setHunk(hunks[next]);
    scroll.current.querySelector(`[data-diff-hunk="${hunks[next]}"]`)?.scrollIntoView({ block: 'start', inline: 'nearest' });
  };
  const copyLine = async line => {
    const request = ++copyRequest.current;
    const position = `${file.path}:${line}`;
    let message;
    try {
      await navigator.clipboard.writeText(position);
      message = `已复制 ${position}`;
    } catch {
      message = `复制失败 · ${position}`;
    }
    if (copyRequest.current !== request) return;
    setFeedback(message);
    clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setFeedback(''), 2500);
  };
  const content = (row, index) => hitsByRow[index]?.length ?
    <SearchText text={row.text} hits={hitsByRow[index]} active={active} /> : <SourceText row={row} json={file.path.endsWith('.json')} />;
  const hunkProps = (row, index) => (row.type === 'meta' || row.type === 'raw') && /^@{2,} /.test(row.text) ?
    { 'data-diff-hunk': index, 'data-current-hunk': hunk === index } : {};
  const lineNumber = (number, old) => {
    const revision = old ? previous : oid;
    const canRead = attributing && revision;
    if (!number || (old && !canRead)) return <span className="num">{number}</span>;
    const label = canRead ? `查看${old ? '旧' : '新'}第 ${number} 行归属` : `复制第 ${number} 行位置`;
    return <button className="num line-copy" title={label} aria-label={label}
      aria-pressed={canRead ? line?.oid === revision && line?.number === number : undefined}
      onClick={() => canRead ? setLine({ number, oid: revision, old }) : copyLine(number)}>{number}</button>;
  };
  const title = point ? `历史提交 ${oid.slice(0, 7)}` : comparison;
  const splitCell = (index, old) => {
    const row = rows[index];
    return <div className={`split-cell ${row?.type === 'addition' ? 'add' : row?.type === 'deletion' ? 'remove' : ''}`}>
      {row && <>{lineNumber(old ? row.before : row.after, old)}<code className="content">{content(row, index)}</code></>}
    </div>;
  };

  return <section className="diff-panel" ref={panel} aria-label="文件差异" onKeyDown={event => {
    if (canFind && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setFinding(true);
      findInput.current?.focus();
    }
    if (finding && event.key === 'Escape' && event.target === findInput.current) { event.preventDefault(); closeFind(); }
  }}>
    <div className={`diff-header ${wide && sourceView ? 'wide-source-header' : ''}`}>
      {(actions || filePosition || canHistory || canAttribute || canFind || feedback || hasLineStats) && <div className="diff-tools">
        {actions}
        {filePosition && file && <div className="diff-file-caption">
          <code title={file.path}>{file.path}</code><span>{filePosition}</span>
        </div>}
        <div className="diff-actions">
          <span className="line-copy-feedback" role="status" title={feedback}>{feedback}</span>
          {hasLineStats && <span className="diff-stats" title={`已显示差异：新增 ${lineStats.added} 行，删除 ${lineStats.removed} 行`}
            aria-label={`新增 ${lineStats.added} 行，删除 ${lineStats.removed} 行`}>
            <span className="diff-added">+{lineStats.added}</span><span className="diff-removed">−{lineStats.removed}</span>
          </span>}
          {canHistory && <button className="panel-action" aria-expanded={Boolean(currentHistory?.open)} aria-label="文件历史" title="文件历史"
            onClick={() => changeHistory({ point, open: !currentHistory?.open })}><History /><span>文件历史</span></button>}
          {canAttribute && <button className="panel-action" aria-pressed={attributing} aria-label="行归属" title="行归属"
            onClick={() => { setAttributing(value => !value); setLine(null); }}><UserRound /><span>行归属</span></button>}
          {canFind && <>
            <button className="panel-action" ref={findButton} aria-expanded={finding} aria-label="查找差异" title="查找差异（Ctrl+F）"
              onClick={() => finding ? closeFind() : setFinding(true)}><Search /><span>查找</span></button>
            <button className="panel-action" aria-label="上一处差异" title="上一处差异" disabled={hunks.length < 2} onClick={() => jumpHunk(-1)}><ChevronUp /></button>
            <button className="panel-action" aria-label="下一处差异" title="下一处差异" disabled={hunks.length < 2} onClick={() => jumpHunk(1)}><ChevronDown /></button>
          </>}
        </div>
        {canSplit && <div className="diff-layout" role="group" aria-label="差异布局">
          {[['split', '左右对照'], ['unified', '统一差异']].map(([id, label]) =>
            <button className="panel-action" key={id} aria-pressed={layout === id} onClick={() => setLayout(id)}>{label}</button>)}
        </div>}
      </div>}
      {title && file && (!hidePathHeading || point) && <div className="diff-title">
        {!sourceView && <CodeXml />}
        <span className="diff-path" title={file.path}>
          <strong>{file.path.split('/').at(-1)}</strong>
          {sourceView ? <small>{title}</small> : <code>{file.path}</code>}
        </span>
        {!sourceView && <small>{title}</small>}
        {point && <button className="panel-action" onClick={() => changeHistory({})}>返回原差异</button>}
      </div>}
    </div>
    {currentHistory?.open && canHistory && <FileHistoryList key={sourceKey} repoPath={repoPath}
      file={historyPath} oid={historyBase} onSelect={entry => changeHistory({ point: entry })} />}
    {attributing && canAttribute && <div className="line-attribution" role="status">
      {!line ? <span>点行号查看该版本的归属，再点「行归属」恢复复制。</span> :
        attributed.error ? <span>{attributed.error}</span> : !attributed.data ? <span>正在读取第 {line.number} 行归属…</span> : <>
          <span>{line.old ? '旧' : '新'}行 {line.number}</span>
          <strong>{attributed.data.author}</strong><time>{dateLabel(attributed.data.date)}</time>
          <code title={attributed.data.oid}>{attributed.data.oid.slice(0, 7)}</code>
          <span className="attribution-subject" title={attributed.data.subject}>{attributed.data.subject}</span>
          {attributed.data.boundary && <span>历史边界</span>}
        </>}
    </div>}
    {file?.conflict && <div className="diff-notice">此文件存在合并冲突。</div>}
    {data?.notice && !(mode === 'untracked' && rows.length) && <div className="diff-notice" role="status">{data.notice}</div>}
    {data?.truncated && <div className="diff-notice">差异较大，仅显示前 5000 行 / 400000 字符。</div>}
    {finding && canFind && <div className="diff-find">
      <label className="search"><Search /><input ref={findInput} aria-label="在当前差异中查找" placeholder="在当前差异中查找"
        value={query} onChange={event => { setQuery(event.target.value); setMatch(0); }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1); }
        }} /></label>
      <output aria-live="polite">{query ? `${count ? active + 1 : 0} / ${count}` : ''}</output>
      <button className="panel-action" disabled={!count} aria-label="上一个匹配项" title="上一个匹配项" onClick={() => nextMatch(-1)}><ChevronUp /></button>
      <button className="panel-action" disabled={!count} aria-label="下一个匹配项" title="下一个匹配项" onClick={() => nextMatch(1)}><ChevronDown /></button>
      <button className="panel-action" aria-label="关闭查找" title="关闭查找" onClick={closeFind}><X /></button>
    </div>}
    {split && <div className="split-head"><span>{sides[0]}</span><span>{sides[1]}</span></div>}
    {rows.length > 0 && <div className={`patch ${split ? 'split-patch' : mode === 'untracked' ? 'plain-source' : ''}`} ref={scroll} tabIndex="0" aria-label={`${file.path} 内容`}>
      {split ? pairs.map(({ meta, left, right }, index) => meta !== undefined
        ? <div className="hunk" key={index} {...hunkProps(rows[meta], meta)}>{content(rows[meta], meta)}</div>
        : <div className="split-pair" key={index}>{splitCell(left, true)}{splitCell(right, false)}</div>)
        : rows[0].type === 'raw' ? <pre className="raw-diff">{rows.map((row, index) =>
        <React.Fragment key={index}>{index > 0 && '\n'}<span {...hunkProps(row, index)}>{content(row, index)}</span></React.Fragment>)}</pre> :
        rows.map((row, index) => row.type === 'meta' ? <div className="hunk" key={index} {...hunkProps(row, index)}>{content(row, index)}</div> :
          <div className={`line ${row.type === 'addition' ? 'add' : row.type === 'deletion' ? 'remove' : ''}`} key={index}>
            {mode !== 'untracked' && lineNumber(row.before, true)}
            {lineNumber(row.after, false)}
            {mode !== 'untracked' && <span className="sign">{row.sign}</span>}
            <code className="content">{content(row, index)}</code>
          </div>)}
    </div>}
    {error && <div className={`message error ${rows.length ? 'message-compact' : ''}`}>
      <span role="alert">{error}</span>
      <button className="panel-action retry-action" type="button" onClick={() => setRetry(n => n + 1)}>重试读取差异</button>
    </div>}
    {!error && !rows.length && !data?.notice && <div className="message" role="status">
      {loading ? '正在读取文件差异…' : !file ? '此范围没有文件变化' : '没有可显示的文本差异。'}
    </div>}
  </section>;
}
