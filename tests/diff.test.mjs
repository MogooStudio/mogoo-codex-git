import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, changeGroups } from '../src/diff.mjs';

test('unified diff preserves line numbers and source beginning with +++ / ---', () => {
  const rows = parseDiff('--- a/f\n+++ b/f\n@@ -2,2 +2,2 @@\n---old\n+++new\n context\n\\ No newline at end of file\n@@ -12 +15 @@\n-x\n+y\n');
  assert.deepEqual(rows.filter(r => r.type !== 'meta').map(r => [r.before,r.after,r.text]), [[2,'','--old'],['',2,'++new'],[3,3,'context'],[12,'','x'],['',15,'y']]);
  assert.equal(rows[4].type, 'meta');
});
test('untracked source removes diff scaffolding without dropping blank lines', () => {
  const rows = parseDiff('--- /dev/null\n+++ b/f\n@@ -0,0 +1,3 @@\n+one\n+\n+<script>literal</script>\n', true);
  assert.deepEqual(rows.map(r => [r.after,r.text,r.type]), [[1,'one','plain'],[2,'','plain'],[3,'<script>literal</script>','plain']]);
});
test('file/symlink type changes keep subsequent section headers out of source rows', () => {
  for (const [oldMode, newMode] of [['100644', '120000'], ['120000', '100644']]) {
    const patch = `diff --git a/f b/f\ndeleted file mode ${oldMode}\n--- a/f\n+++ /dev/null\n@@ -1,2 +0,0 @@\n---old\n-diff --git source text\ndiff --git a/f b/f\nnew file mode ${newMode}\nindex 0000000..abcdef0\n--- /dev/null\n+++ b/f\n@@ -0,0 +1,2 @@\n+++new\n+diff --git source text\n`;
    const rows = parseDiff(patch);
    assert.deepEqual(rows.filter(r => r.type !== 'meta').map(r => [r.type, r.before, r.after, r.text]), [
      ['deletion', 1, '', '--old'], ['deletion', 2, '', 'diff --git source text'],
      ['addition', '', 1, '++new'], ['addition', '', 2, 'diff --git source text'],
    ]);
    assert.ok(rows.filter(r => r.type === 'meta').every(r => r.before === undefined && r.after === undefined));
    assert.ok(rows.some(r => r.type === 'meta' && r.text === '+++ b/f'));
  }
});
test('groups retain both index and working changes, conflicts and untracked status', () => {
  const groups = changeGroups([{path:'both',index:'M',worktree:'M'}, {path:'conflict',index:'U',worktree:'U',conflict:true}, {path:'new',index:'?',worktree:'?',untracked:true}]);
  assert.deepEqual(groups.staged.map(f => f.status), ['M','U']);
  assert.deepEqual(groups.unstaged.map(f => f.status), ['M','U']);
  assert.equal(groups.untracked[0].status, '?');
});
test('combined conflict patches retain all prefixes, indentation and blank lines', () => {
  for (const [header, hunk] of [
    ['diff --cc conflict.js', '@@@ -1,3 -1,3 +1,7 @@@'],
    ['diff --combined conflict.js', '@@@@ -1,3 -1,3 -1,3 +1,7 @@@@'],
  ]) {
    const patch = `${header}\nindex a,b..c\n--- a/conflict.js\n+++ b/conflict.js\n${hunk}\n  function run() {\n++<<<<<<< HEAD\n +\t    ours();\n++=======\n+     theirs();\n++>>>>>>> topic\n  }\n\n`;
    assert.deepEqual(parseDiff(patch), [{ type: 'raw', text: patch.slice(0, -1) }]);
  }
});
