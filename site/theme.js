// The site's theme: 'auto' (follow the system), 'light' or 'dark'. It lives on <html> as data-theme,
// is remembered between visits, and is announced so every control showing it can stay in sync.
const KEY = 'lgw:theme';
const html = document.documentElement;
const listeners = new Set();

export const THEMES = ['auto', 'light', 'dark'];
export const getTheme = () => html.dataset.theme ?? 'auto';

// `source` names whoever is changing it, so that control can skip re-applying its own change.
export function setTheme(mode, source) {
  if (!THEMES.includes(mode) || mode === getTheme()) return;
  if (mode === 'auto') delete html.dataset.theme; else html.dataset.theme = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* private mode: fine, it just won't persist */ }
  listeners.forEach((fn) => fn(mode, source));
}

// Calls fn(mode, source) whenever the theme changes. Returns an unsubscribe function.
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.includes(saved) && saved !== 'auto') html.dataset.theme = saved;
  } catch { /* ignore */ }
}
