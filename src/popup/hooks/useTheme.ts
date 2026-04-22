import { useState, useEffect } from 'react';
import type { ThemeMode } from '@/shared/storage';
import { getSettings } from '@/shared/storage';

function getSystemPreference(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'system' && getSystemPreference());
  document.documentElement.classList.toggle('dark', isDark);
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>('system');

  useEffect(() => {
    getSettings().then((s) => {
      setTheme(s.theme);
      applyTheme(s.theme);
    });
  }, []);

  // Listen for system preference changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const updateTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode);
  };

  return { theme, updateTheme };
}
