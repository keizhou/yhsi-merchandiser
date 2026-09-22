import { useState } from 'react';
import { getEffectiveTheme, setTheme } from '../lib/theme';

export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getEffectiveTheme);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button onClick={toggle} title="Ganti tema terang/gelap" style={{ padding: '6px 10px', fontSize: 13 }}>
      {theme === 'dark' ? '☀️ Terang' : '🌙 Gelap'}
    </button>
  );
}
