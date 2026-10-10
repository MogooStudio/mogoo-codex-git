import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function RefSelect({ refs, value, onChange }) {
  const id = useId(), root = useRef(null), search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const groups = useMemo(() => [['local', '本地分支'], ['remote', '远程分支'], ['tag', '标签']]
    .map(([kind, label]) => ({ label, items: refs.filter(ref => ref.kind === kind) }))
    .filter(group => group.items.length), [refs]);
  const items = useMemo(() => [{ name: '', label: '全部提交' }, ...groups.flatMap(group => group.items)], [groups]);
  const selected = Math.max(0, items.findIndex(item => item.name === value));
  const activeIndex = Math.min(active, items.length - 1);

  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, id]);

  const show = () => { setActive(selected); setOpen(true); search.current.text = ''; };
  const choose = index => { onChange(items[index].name); setOpen(false); };
  const keyDown = event => {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape') { if (open) event.preventDefault(); setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(activeIndex); return; }
      setActive(event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
        (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault();
      const now = Date.now();
      search.current.text = (now - search.current.time < 600 ? search.current.text : '') + event.key.toLowerCase();
      search.current.time = now;
      const match = items.findIndex(item => item.label.toLowerCase().startsWith(search.current.text));
      if (match >= 0) { setActive(match); setOpen(true); }
    }
  };
  const option = (item, index) => <div key={item.name} id={`${id}-${index}`} role="option" aria-selected={item.name === value}
    className={`scope-option ${activeIndex === index ? 'highlighted' : ''}`} title={item.label}
    onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
    <span>{item.label}</span>{item.name === value && <Check aria-hidden="true" />}
  </div>;

  let offset = 1;
  return <div className="scope" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="scope-trigger" role="combobox" aria-label="提交范围" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
      title={items[selected].label} onKeyDown={keyDown} onClick={() => open ? setOpen(false) : show()}>
      <span>{items[selected].label}</span><ChevronDown aria-hidden="true" />
    </button>
    {open && <div id={`${id}-list`} className="scope-menu" role="listbox" aria-label="提交范围">
      {option(items[0], 0)}{groups.map((group, groupIndex) => {
        const start = offset; offset += group.items.length;
        return <div role="group" aria-labelledby={`${id}-group-${groupIndex}`} className="scope-group" key={group.label}>
          <div id={`${id}-group-${groupIndex}`} className="scope-group-label">{group.label}</div>
          {group.items.map((item, index) => option(item, start + index))}
        </div>;
      })}
    </div>}
  </div>;
}
