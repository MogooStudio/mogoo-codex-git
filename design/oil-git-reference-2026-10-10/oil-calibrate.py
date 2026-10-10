from pathlib import Path
import re,html
root=Path(__file__).resolve().parent
p=root/'oil-simple.css'
s=p.read_text(encoding='utf-8')
s=s.replace('--selected:#e9ebef','--selected:#e4e7eb').replace('--line:#dedfdd','--line:#c8cad0')
s=s.replace('grid-template-rows:44px minmax(0,1fr) 26px','grid-template-rows:60px minmax(0,1fr) 26px')
s=s.replace('grid-template-columns:190px minmax(0,1fr)','grid-template-columns:250px minmax(0,1fr)')
s=s.replace('.workspace-file{width:100%;height:30px','.workspace-file{width:100%;height:34px')
s=s.replace('.tabs{height:40px;display:flex;align-items:center;gap:4px;padding:0 12px','.tabs{height:40px;display:flex;align-items:center;gap:0;padding:0')
s=s.replace('.tabs button{display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;color:var(--muted);border-radius:6px}', '.tabs button{display:flex;align-items:center;gap:6px;height:40px;padding:0 18px;color:var(--muted);border-radius:0}')
s=s.replace('.commit{width:100%;min-height:72px','.commit{width:100%;min-height:56px;height:56px')
s=s.replace('.commit.active{background:var(--selected)}','.commit.active{background:#f0f1f3}')
s=s.replace('.commit.active .node{background:var(--green)}','.commit.active .node{background:var(--green);box-shadow:0 0 0 4px #e6ecdf}')
s=s.replace('.commit-title{display:block;line-height:20px;font-weight:400;overflow-wrap:anywhere}', '.commit-title{display:block;font-size:14px;line-height:20px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}')
s=s.replace('.detail-heading{font-size:16px;font-weight:600;line-height:24px', '.detail-heading{font-size:14px;font-weight:500;line-height:22px')
s=s.replace('.hunk{background:var(--side)', '.hunk{background:#f0f1f3')
s+='\n.tabs .scope{margin-left:auto;font-size:13px}.tabs .scope svg{width:13px;height:13px}.commit>span:last-child{min-width:0}.commit-ref{display:flex;align-items:center;gap:5px;white-space:nowrap;font-size:12px}.ref-chip{background:#e1ead6;color:#35612f;padding:0 4px;border-radius:3px}.remote-chip{background:#e1e8f0;color:#40566f;padding:0 4px;border-radius:3px}.head-label{color:var(--muted)}.folder-tree>summary{list-style:none;cursor:default}.folder-tree>summary::-webkit-details-marker{display:none}.root-folder .folder-count{margin-left:auto;overflow:visible;font:13px var(--mono)}.folder-tree .disclosure{width:11px;height:11px}.folder-tree[open] .disclosure{transform:rotate(90deg)}\n'
p.write_text(s,encoding='utf-8')
p=root/'oil-history.html'
s=p.read_text(encoding='utf-8')
pattern=r'<div class="root-folder"[^>]*>.*?</div>(.*?)</aside>'
match=re.search(pattern,s,re.S)
assert match
folder='<details class="folder-tree"><summary class="root-folder" title="design/ui-exploration-2026-10-10/"><svg class="disclosure"><use href="#right"/></svg><svg><use href="#folder"/></svg><span>design</span><span class="folder-count">25</span></summary><div class="folder-files">'+match.group(1)+'</div></details></aside>'
s=re.sub(pattern,lambda _:folder,s,flags=re.S)
scope='<button class="scope">全部提交<svg><use href="#chevron"/></svg></button>'
s=s.replace('</nav><div class="history-content">',scope+'</nav><div class="history-content">')
s=re.sub(r'<div class="log-tools">.*?</div>','',s,flags=re.S)
s=s.replace('<span class="commit-ref">master ← HEAD</span>','<span class="commit-ref"><span class="ref-chip">master</span><span class="remote-chip">origin/master</span><span class="head-label">← HEAD</span></span>')
def title_attr(m):
    tag=m.group(1)
    text=re.sub('<[^>]*>','',m.group(2)).strip()
    return tag[:-1]+' title="'+html.escape(text,quote=True)+'">'+m.group(2)
s=re.sub(r'(<button class="commit(?: active)?">)(.*?)(?=</button>)',title_attr,s,flags=re.S)
p.write_text(s,encoding='utf-8')
print('Calibrated to Oil Git desktop source; history folder starts collapsed')
