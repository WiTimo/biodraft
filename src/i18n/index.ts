import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './resources';
import type { LanguageCode } from '../config/languages';

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const RTL_LANGUAGES = new Set<LanguageCode>(['ar']);

export function isRtlLanguage(lang: LanguageCode) {
  return RTL_LANGUAGES.has(lang);
}

// Initialize once.
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: resources as any,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
    });
}

export default i18n;
