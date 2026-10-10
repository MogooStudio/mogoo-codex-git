const key = 'mogoo-codex-git-theme';
export function readTheme() {
  try { return localStorage.getItem(key) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(key, theme); } catch { /* Switching still works without storage. */ }
}
