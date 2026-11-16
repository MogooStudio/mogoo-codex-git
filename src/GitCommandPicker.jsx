import React, { useId, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { chatMessage } from './api.js';

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
  const [capabilities, setCapabilities] = useState({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [delivery, setDelivery] = useState(null);
  const [sendConfirmation, setSendConfirmation] = useState(null);
  const template = templates[selected];
  const field = fields[template.field];
  const value = field ? values[template.field].trim() : '';
  const [before, after] = field ? template.text.split('XXX') : [template.text];
  const text = field ? value && before + value + after : before;
  const confirmingSend = Boolean(text && sendConfirmation === text);
  const branches = [...new Set(refs.filter(ref => ref.kind === 'local').map(ref => ref.label))];

  const choose = index => {
    setSelected(index);
    setNotice('');
    setDelivery(null);
    setSendConfirmation(null);
  };
  const toggle = event => {
    const visible = event.currentTarget.matches(':popover-open');
    setOpen(visible);
    setSendConfirmation(null);
    if (!visible) return;
    if (delivery?.status === 'sent') {
      setNotice('');
      setDelivery(null);
    }
    event.currentTarget.querySelector('.git-command-option[aria-pressed="true"]')?.focus();
    if (chatMessage) void chatMessage.capabilities().then(setCapabilities, () => setCapabilities({}));
  };
  const blocked = mode => delivery?.mode === mode && delivery?.text === text;
  const submit = async mode => {
    if (!chatMessage || !capabilities[mode] || !ready || !text || inFlight.current ||
      blocked(mode) || !picker.current?.matches(':popover-open')) return;
    if (mode === 'send' && !confirmingSend) {
      setSendConfirmation(text);
      setNotice('');
      return;
    }
    setSendConfirmation(null);
    inFlight.current = true;
    setBusy(mode);
    setNotice('');
    try {
      const accepted = await chatMessage.submit(text, mode);
      if (accepted) {
        setDelivery({ mode, text, status: 'sent' });
        picker.current?.hidePopover();
      } else {
        setNotice(mode === 'draft' ? '未能填入聊天，可复制常用语' : '未能发送，可填入聊天后手动发送');
      }
    } catch {
      setDelivery({ mode, text, status: 'unknown' });
      setNotice(mode === 'draft' ? '填入结果待确认，请先查看当前聊天草稿' : '发送结果待确认，请先查看当前聊天记录');
    } finally {
      inFlight.current = false;
      setBusy('');
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
          aria-pressed={selected === index} disabled={Boolean(busy)} onClick={() => choose(index)}>
          <span className="git-command-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span>{item.title}</span>
          {item.field && <small aria-hidden="true">填{fields[item.field].label}</small>}
        </button>)}
      </div>
      <div className="git-command-form">
        {field && <label>{field.label}
          <input value={values[template.field]} placeholder={field.placeholder} autoComplete="off"
            list={template.field === 'branch' && branches.length ? `${id}-branches` : undefined}
            disabled={Boolean(busy)} onChange={event => {
              setValues(previous => ({ ...previous, [template.field]: event.target.value }));
              setNotice('');
              setDelivery(null);
              setSendConfirmation(null);
            }} />
        </label>}
        {template.field === 'branch' && branches.length > 0 && <datalist id={`${id}-branches`}>
          {branches.map(branch => <option key={branch} value={branch} />)}
        </datalist>}
        <div id={`${id}-preview`} className="git-command-preview-label">发给 Codex 的内容</div>
        <p className="git-command-preview" aria-labelledby={`${id}-preview`}>{text || <>{before}<mark>〈{field.label}〉</mark>{after}</>}</p>
        <div className="git-command-actions">
          <button type="button" disabled={!text || Boolean(busy)} onClick={copy}>复制</button>
          {capabilities.draft && <button type="button" className="git-command-draft" onClick={() => void submit('draft')}
            disabled={!ready || !text || Boolean(busy) || blocked('draft')}>{busy === 'draft' ? '正在填入…' : '填入聊天'}</button>}
          {capabilities.send && <button type="button" className={confirmingSend ? 'git-command-confirm' : undefined}
            onClick={() => void submit('send')} onBlur={() => setSendConfirmation(null)}
            disabled={!ready || !text || Boolean(busy) || blocked('send')}>{busy === 'send' ? '正在发送…' : confirmingSend ? '确认发送' : '发送给 Codex'}</button>}
        </div>
        <p className="git-command-notice" role="status">{notice || (!ready && (capabilities.draft || capabilities.send) ? '关联当前聊天的仓库后即可发送' : '')}</p>
      </div>
    </section>
  </>;
}
