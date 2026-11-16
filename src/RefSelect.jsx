import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ListFilter, Search, X } from 'lucide-react';
import { BranchIcon } from './icons.jsx';

export default function RefSelect({ refs, hasHead, currentBranch, value, onChange }) {
  const id = useId(), root = useRef(null), trigger = useRef(null), input = useRef(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const defaults = [{ name: '', label: '所有分支与标签' }];
  if (hasHead) defaults.push({ name: 'HEAD', label: '当前 HEAD 的历史' });
  const currentRef = currentBranch ? `refs/heads/${currentBranch}` : '';
  const isCurrent = item => item.kind === 'local' && item.name === currentRef;
  const groups = [{ label: '', items: defaults }, ...[['local', '本地分支'], ['remote', '远程分支'], ['tag', '标签']]
    .map(([kind, label]) => ({
      label,
      items: refs.filter(ref => ref.kind === kind).sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a))),
    }))];
  const label = [...defaults, ...refs].find(item => item.name === value)?.label || defaults[0].label;
  const term = query.trim().toLowerCase();
  const shown = groups.map(group => ({ ...group, total: group.items.length, items: group.items.filter(item =>
    item.label.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)) })).filter(group => group.items.length);
  const items = shown.flatMap(group => group.items);
  const index = Math.min(active, items.length - 1);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (open && index >= 0) document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, index, id, term]);

  const show = () => {
    setQuery('');
    setActive(Math.max(0, groups.flatMap(group => group.items).findIndex(item => item.name === value)));
    setOpen(true);
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = item => { onChange(item.name); close(); };
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.nativeEvent.isComposing || !items.length) return;
    if (event.key === 'Enter') { event.preventDefault(); choose(items[index]); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    }
    if (!query && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : items.length - 1);
    }
  };

  let offset = 0;
  return <div className="scope" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" ref={trigger} className="scope-trigger" role="combobox" aria-label="提交范围" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} title={label} onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}>
      <ListFilter aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" />
    </button>
    {open && <div className="scope-menu">
      <label className="search scope-search"><Search /><input ref={input} placeholder="搜索分支或标签" aria-label="搜索分支或标签"
        value={query} onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={keyDown} aria-controls={`${id}-list`} aria-activedescendant={index >= 0 ? `${id}-${index}` : undefined} />
        {query && <button type="button" className="icon-button scope-clear" aria-label="清除分支或标签搜索"
          onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(''); setActive(0); input.current?.focus(); }}>
          <X aria-hidden="true" />
        </button>}
      </label>
      <div id={`${id}-list`} className="scope-results" role="listbox" aria-label="提交范围">
        {shown.map(group => <div key={group.label} role={group.label ? 'group' : undefined} aria-label={group.label || undefined}
          className={group.label ? 'scope-group' : undefined}>
          {group.label && <div className="scope-group-label">
            <span>{group.label}</span><span className="scope-group-count">{term ? `${group.items.length}/${group.total}` : group.total}</span>
          </div>}
          {group.items.map(item => {
            const itemIndex = offset++;
            const current = isCurrent(item);
            return <div key={item.name} id={`${id}-${itemIndex}`} role="option" aria-selected={item.name === value}
              aria-label={item.label} aria-current={current ? 'true' : undefined}
              aria-description={current ? '当前检出的本地分支' : undefined}
              className={`scope-option ${index === itemIndex ? 'highlighted' : ''}`} title={item.label}
              onMouseEnter={() => setActive(itemIndex)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
              <span className="scope-option-label">{item.label}</span>
              {current && <small className="scope-current" aria-hidden="true"><BranchIcon />当前</small>}
              {item.name === value && <Check aria-hidden="true" />}
            </div>;
          })}
        </div>)}
      </div>
      {!items.length && <p className="file-menu-empty" role="status">没有匹配的分支或标签。</p>}
    </div>}
  </div>;
}
