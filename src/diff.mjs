export function parseDiff(patch, plain = false) {
  let before = 0, after = 0, inHunk = false;
  const lines = patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  // Combined diffs have one prefix/line range per parent. Keep the original
  // patch intact rather than presenting misleading two-column line numbers.
  if (lines.some(line => /^diff --(?:cc|combined) |^@{3,} /.test(line))) {
    return [{ type: 'raw', text: lines.join('\n') }];
  }
  const start = lines.findIndex(line => /^@@ /.test(line));
  const rows = [];
  for (const line of lines.slice(Math.max(0, start))) {
    // A type change can contain several file sections for the same path.
    // Source lines have a diff prefix, so they cannot match this boundary.
    if (line.startsWith('diff --git ')) inHunk = false;
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      before = Number(hunk[1]); after = Number(hunk[2]); inHunk = true;
      if (!plain) rows.push({ type: 'meta', text: line });
      continue;
    }
    if (!inHunk || line.startsWith('\\')) { rows.push({ type: 'meta', text: line }); continue; }
    const sign = line[0];
    const type = sign === '+' ? 'addition' : sign === '-' ? 'deletion' : 'context';
    rows.push({ type: plain ? 'plain' : type, text: line.slice(1), sign: plain ? '' : sign,
      before: type === 'addition' ? '' : before++, after: type === 'deletion' ? '' : after++ });
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a.type !== 'deletion' || b.type !== 'addition') continue;
    let left = 0, right = 0;
    while (left < Math.min(a.text.length, b.text.length) && a.text[left] === b.text[left]) left++;
    while (right < Math.min(a.text.length, b.text.length) - left && a.text.at(-right - 1) === b.text.at(-right - 1)) right++;
    a.highlight = [left, a.text.length - right]; b.highlight = [left, b.text.length - right];
  }
  return rows;
}
export function changeGroups(files) {
  return {
    unstaged: files.filter(f => !f.untracked && f.worktree !== ' ').map(f => ({ ...f, status: f.conflict ? 'U' : f.worktree })),
    staged: files.filter(f => !f.untracked && f.index !== ' ').map(f => ({ ...f, status: f.conflict ? 'U' : f.index })),
    untracked: files.filter(f => f.untracked).map(f => ({ ...f, status: '?' })),
  };
}
