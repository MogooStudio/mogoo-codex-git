import React, { useState } from 'react';
import { dateLabel, useResource } from './api.js';
import { CommitInspector, Message } from './components.jsx';

export function StashesView({ repo }) {
  const { data, loading, error } = useResource('stashes', { path: repo.root }, repo.refreshedAt);
  const [selected, setSelected] = useState('');
  const [part, setPart] = useState('tracked');
  const entry = data?.entries.find(item => item.oid === selected) || data?.entries[0];
  const snapshots = entry ? [['tracked', '全部已跟踪', entry.oid],
    ['index', '已暂存', entry.parents[1]], ['untracked', '未跟踪', entry.parents[2]]].filter(([, , oid]) => oid) : [];
  const active = snapshots.find(([id]) => id === part) || snapshots[0];
  if (error) return <Message error>{error}</Message>;
  if (!entry) return <Message>{loading ? '正在读取 Stash…' : '当前仓库没有 Stash'}</Message>;
  return <section className="tool-view stash-view" aria-label="只读 Stash">
    <div className="tool-options">
      <label><span>Stash</span><select aria-label="选择 Stash" value={entry.oid} onChange={event => {
        setSelected(event.target.value);
        setPart('tracked');
      }}>{data.entries.map(item => <option key={item.label} value={item.oid}>{item.label} · {item.subject}</option>)}</select></label>
      <select aria-label="Stash 快照" value={active[0]} onChange={event => setPart(event.target.value)}>
        {snapshots.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>
    <div className="tool-context"><code>{entry.label}</code><span>{dateLabel(entry.date)}</span><span>只读快照</span>{data.hasMore && <span>显示最近 100 条</span>}</div>
    <CommitInspector key={active[2]} repoPath={repo.root} oid={active[2]} comparison={active[1]} historyBase={entry.parents[0]} readAttribution={false} />
  </section>;
}
