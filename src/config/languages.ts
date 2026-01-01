export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (US)', meta: 'Default' },
  { value: 'es', label: 'Español', meta: 'Latinoamérica' },
  { value: 'fr', label: 'Français', meta: 'Europe' },
  { value: 'de', label: 'Deutsch', meta: 'Europa' },
  { value: 'pt', label: 'Português (BR)', meta: 'Brasil' },
  { value: 'it', label: 'Italiano', meta: 'Europa' },
  { value: 'ru', label: 'Русский', meta: 'Европа' },
  { value: 'hi', label: 'हिन्दी', meta: 'भारत' },
  { value: 'ja', label: '日本語', meta: 'アジア' },
  { value: 'ko', label: '한국어', meta: '아시아' },
  { value: 'zh', label: '简体中文', meta: '中国' },
  { value: 'ar', label: 'العربية', meta: 'الشرق الأوسط' },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['value'];
