import React, { useId, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { chatDraft } from './api.js';

const templates = [
  { title: '提交这次改动', text: '本地提交代码' },
  { title: '把当前分支的提交整理成一条', text: '当前分支的提交压成一条' },
  { title: '更新主分支后提交', text: '本地 master或main 对齐远端最新基线，然后提交' },
  { title: '更新主分支后推送', text: '本地 master或main 对齐远端最新基线，然后推送' },
  { title: '从最新主分支开始新任务', field: 'task', text: '本地 master或main 对齐远端最新基线，然后创建分支准备做 XXX' },
  { title: '把分支合回主分支，先不推送', field: 'branch', text: '分支 XXX 合并回 master或main，先把本地 master或main 对齐远端最新基线再合并，保证提交历史线性，先不要推送' },
];
const fields = {
  task: { label: '任务名', placeholder: '例如：修复更新状态提示' },
  branch: { label: '分支名', placeholder: '输入或选择分支名' },
};

export function GitCommandPicker({ refs, ready }) {
  const id = useId();
  const picker = useRef(null), inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [values, setValues] = useState({ task: '', branch: '' });
  const [canFillDraft, setCanFillDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [delivery, setDelivery] = useState(null);
  const template = templates[selected];
  const field = fields[template.field];
  const value = field ? values[template.field].trim() : '';
  const [before, after] = field ? template.text.split('XXX') : [template.text];
  const text = field ? value && before + value + after : before;
  const branches = [...new Set(refs.filter(ref => ref.kind === 'local').map(ref => ref.label))];

  const choose = index => {
    setSelected(index);
    setNotice('');
    setDelivery(null);
  };
  const toggle = event => {
    const visible = event.currentTarget.matches(':popover-open');
    setOpen(visible);
    if (!visible) return;
    if (delivery?.status === 'sent') {
      setNotice('');
      setDelivery(null);
    }
    event.currentTarget.querySelector('.git-command-option[aria-pressed="true"]')?.focus();
    if (chatDraft) void chatDraft.supported().then(setCanFillDraft, () => setCanFillDraft(false));
  };
  const blocked = delivery?.text === text;
  const fillDraft = async () => {
    if (!chatDraft || !canFillDraft || !ready || !text || inFlight.current ||
      blocked || !picker.current?.matches(':popover-open')) return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      const accepted = await chatDraft.fill(text);
      if (accepted) {
        setDelivery({ text, status: 'sent' });
        picker.current?.hidePopover();
      } else {
        setNotice('未能填入聊天，可复制常用语');
      }
    } catch {
      setDelivery({ text, status: 'unknown' });
      setNotice('填入结果待确认，请先查看当前聊天草稿');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('');
      picker.current?.hidePopover();
    } catch { setNotice('可选中预览文本手动复制'); }
  };

  return <>
    <button className="toolbar-icon git-command-trigger" type="button" popoverTarget={id}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label="Git 常用语" title="Git 常用语">
      <MessageSquare aria-hidden="true" />
    </button>
    <section className="git-command-popover" id={id} ref={picker} popover="auto" role="dialog"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onToggle={toggle}>
      <header className="git-command-heading">
        <MessageSquare aria-hidden="true" /><h2 id={`${id}-title`}>Git 常用语</h2>
      </header>
      <p id={`${id}-description`} className="git-command-description">选一句常用描述，按需修改后发给 Codex</p>
      <div role="group" aria-label="常用语列表">
        {templates.map((item, index) => <button key={item.title} type="button" className="git-command-option"
          aria-pressed={selected === index} disabled={busy} onClick={() => choose(index)}>
          <span className="git-command-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span>{item.title}</span>
          {item.field && <small aria-hidden="true">填{fields[item.field].label}</small>}
        </button>)}
      </div>
      <div className="git-command-form">
        {field && <label>{field.label}
          <input value={values[template.field]} placeholder={field.placeholder} autoComplete="off"
            list={template.field === 'branch' && branches.length ? `${id}-branches` : undefined}
            disabled={busy} onChange={event => {
              setValues(previous => ({ ...previous, [template.field]: event.target.value }));
              setNotice('');
              setDelivery(null);
            }} />
        </label>}
        {template.field === 'branch' && branches.length > 0 && <datalist id={`${id}-branches`}>
          {branches.map(branch => <option key={branch} value={branch} />)}
        </datalist>}
        <div id={`${id}-preview`} className="git-command-preview-label">发给 Codex 的内容</div>
        <p className="git-command-preview" aria-labelledby={`${id}-preview`}>{text || <>{before}<mark>〈{field.label}〉</mark>{after}</>}</p>
        <div className="git-command-actions">
          <button type="button" disabled={!text || busy} onClick={copy}>复制</button>
          {canFillDraft && <button type="button" className="git-command-draft" onClick={() => void fillDraft()}
            disabled={!ready || !text || busy || blocked}>{busy ? '正在填入…' : '填入聊天'}</button>}
        </div>
        <p className="git-command-notice" role="status">{notice || (!ready && canFillDraft ? '关联当前聊天的仓库后即可发送' : '')}</p>
      </div>
    </section>
  </>;
}
