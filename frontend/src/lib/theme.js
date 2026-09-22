// Explicit light/dark toggle, stacked on top of the CSS prefers-color-scheme
// default already in index.css. "system" (no stored choice) follows the OS;
// picking a theme stores it and stamps data-theme on <html>, which the CSS
// variable overrides key off.

const STORAGE_KEY = 'theme'; // 'light' | 'dark' | absent (= system)

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

export function setTheme(theme) {
  try {
    if (theme === 'light' || theme === 'dark') {
      localStorage.setItem(STORAGE_KEY, theme);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    /* localStorage unavailable, still apply for this session */
  }
  applyTheme(theme);
}

// Call once on app start so a stored choice survives a reload.
export function initTheme() {
  applyTheme(getStoredTheme());
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Effective theme right now (resolves "system" down to light/dark), for
// deciding what the toggle button should show/do next.
export function getEffectiveTheme() {
  const stored = getStoredTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark() ? 'dark' : 'light';
}
