import { useEffect } from 'react';
import { useCanvasState } from '../state/CanvasState';

export default function ThemeProvider() {
  const theme = useCanvasState((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    function apply(isDark: boolean) {
      if (isDark) root.classList.add('theme-dark');
      else root.classList.remove('theme-dark');
    }

    // Determine initial
    if (theme === 'system') {
      const m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      apply(m ? m.matches : false);
      const listener = (e: MediaQueryListEvent) => apply(e.matches);
      m?.addEventListener?.('change', listener);
      return () => m?.removeEventListener?.('change', listener);
    } else {
      apply(theme === 'dark');
      return;
    }
  }, [theme]);

  return null;
}
