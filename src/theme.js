const isCodexPanel = document.documentElement.hasAttribute('data-mcp-app');
const key = isCodexPanel
  ? 'mogoo-codex-git-codex-theme'
  : 'mogoo-codex-git-theme';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();
let hostTheme;
const parameters = new URL(window.location.href).searchParams;
const launchMode = parameters.get('theme');
const launchTheme = parameters.get('colorScheme');
const inheritsPanelTheme = !isCodexPanel && ['follow', 'light', 'dark'].includes(launchMode)
  && ['light', 'dark'].includes(launchTheme);
let inheritedMode = inheritsPanelTheme ? launchMode : undefined;
let inheritedTheme = inheritsPanelTheme ? launchTheme : undefined;

export function withPanelTheme(url, mode, theme) {
  const target = new URL(url);
  target.searchParams.set('theme', mode);
  target.searchParams.set('colorScheme', theme);
  return target.href;
}

function syncThemeLink() {
  if (!inheritsPanelTheme) return;
  const target = withPanelTheme(window.location.href, inheritedMode, document.documentElement.dataset.gitTheme || getDefaultTheme());
  if (target === window.location.href) return;
  try { window.history.replaceState(window.history.state, '', target); }
  catch { /* Theme switching still works when history access is unavailable. */ }
}

export function getDefaultTheme() {
  return hostTheme ?? inheritedTheme ?? (systemTheme.matches ? 'dark' : 'light');
}

export function setHostTheme(theme) {
  if ((theme !== 'light' && theme !== 'dark') || theme === hostTheme) return;
  hostTheme = theme;
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  const systemChanged = () => {
    inheritedTheme = undefined;
    listener();
  };
  systemTheme.addEventListener('change', systemChanged);
  return () => {
    listeners.delete(listener);
    systemTheme.removeEventListener('change', systemChanged);
  };
}

export function readThemeMode() {
  if (inheritedMode) return inheritedMode;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Sandboxed panels may not have storage access. */ }
  return 'follow';
}

export function saveThemeMode(mode) {
  if (inheritsPanelTheme) inheritedMode = mode;
  const resumeSystem = mode === 'follow' && inheritedTheme !== undefined;
  if (resumeSystem) inheritedTheme = undefined;
  try {
    if (mode === 'follow') localStorage.removeItem(key);
    else localStorage.setItem(key, mode);
  } catch { /* Switching still works without storage. */ }
  syncThemeLink();
  if (resumeSystem) for (const listener of listeners) listener();
}

export function applyTheme(theme) {
  document.documentElement.dataset.gitTheme = theme;
  syncThemeLink();
}
