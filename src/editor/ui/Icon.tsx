import { useEffect, useMemo, useState } from 'react';
import { useCanvasState } from '../state/CanvasState';

const svgCache = new Map<string, string>();

export default function Icon({ src, className, alt, style }: { src: string; className?: string; alt?: string; style?: any }) {
  const theme = useCanvasState((s) => s.theme);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const isDark = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // system
    try {
      const m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      return !!m && m.matches;
    } catch {
      return false;
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const key = src;
        let original = svgCache.get(key);
        if (!original) {
          const res = await fetch(src);
          original = await res.text();
          svgCache.set(key, original);
        }

        let modified = original;
        if (isDark) {
          // Replace hex colors exactly '#000000' and shorthand '#000' (case-insensitive) with white
          modified = modified.replace(/#000000/gi, '#ffffff');
          modified = modified.replace(/#000(?![0-9a-f])/gi, '#fff');
          // also replace literal 'black' (simple) -> '#ffffff'
          modified = modified.replace(/\bblack\b/gi, '#ffffff');
        }

        // encode and set as data URL so it can be used in <img>
        const encoded = 'data:image/svg+xml;utf8,' + encodeURIComponent(modified);
        if (!cancelled) setDataUrl(encoded);
      } catch (err) {
        // fall back to raw src
        if (!cancelled) setDataUrl(src);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [src, isDark]);

  // Render an <img> using either the data URL or original src while preserving sizing classes
  return <img src={dataUrl || src} className={className} alt={alt} style={style} />;
}
