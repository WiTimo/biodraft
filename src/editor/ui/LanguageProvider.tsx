import { useEffect } from 'react';

import { useCanvasState } from '../state/CanvasState';
import i18n, { DEFAULT_LANGUAGE, isRtlLanguage } from '../../i18n';
import type { LanguageCode } from '../../config/languages';

export default function LanguageProvider() {
  const language = useCanvasState((s) => s.language as LanguageCode | undefined);

  useEffect(() => {
    const lang = (language ?? DEFAULT_LANGUAGE) as LanguageCode;
    if (i18n.language !== lang) {
      void i18n.changeLanguage(lang);
    }

    const root = document.documentElement;
    root.lang = lang;
    root.dir = isRtlLanguage(lang) ? 'rtl' : 'ltr';
  }, [language]);

  return null;
}
