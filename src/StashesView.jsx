import React, { useState } from 'react';
import { useResource } from './api.js';
import { CommitInspector, Message } from './components.jsx';

export function StashesView({ repo, selection, onSelect }) {
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useResource('stashes', { path: repo.root }, `${repo.refreshedAt}:${retry}`);
  const entry = data?.entries.find(item => item.oid === selection.oid) || data?.entries[0];
  const snapshots = entry ? [['tracked', '全部已跟踪', entry.oid],
    ['index', '已暂存', entry.parents[1]], ['untracked', '未跟踪', entry.parents[2]]].filter(([, , oid]) => oid) : [];
  const active = snapshots.find(([id]) => entry?.oid === selection.oid && id === selection.part) || snapshots[0];
  const retryRead = () => setRetry(n => n + 1);
  return <section className="tool-view stash-view" aria-label="只读 Stash">
    {error && <Message error compact={Boolean(entry)} onRetry={retryRead} retryLabel="重试读取 Stash">{error}</Message>}
    {!entry && !error && <Message>{loading || !data ? '正在读取 Stash…' : '当前仓库没有 Stash'}</Message>}
    {entry && <>
    <div className="tool-options">
      <label><span>选择 Stash</span><select aria-label="选择 Stash" value={entry.oid}
        onChange={event => onSelect({ oid: event.target.value, part: 'tracked' })}>
        {data.entries.map(item => <option key={item.label} value={item.oid}>{item.label} · {item.subject}</option>)}
      </select></label>
    </div>
    <div className="stash-context">
      <div className="stash-snapshots" role="group" aria-label="Stash 快照">
        {snapshots.map(([id, label]) => <button className="panel-action" type="button" key={id} aria-pressed={id === active[0]}
          onClick={() => onSelect({ oid: entry.oid, part: id })}>{label}</button>)}
      </div>
      {data.hasMore && <span className="tool-context">最近 100 条</span>}
    </div>
    <CommitInspector key={active[2]} repoPath={repo.root} oid={active[2]} comparison={active[1]}
      historyBase={entry.parents[0]} readAttribution={false} hidePathHeading />
    </>}
  </section>;
}
