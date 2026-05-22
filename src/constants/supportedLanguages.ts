import { z } from 'zod';

/** Taught language — vocabulary sourceText is always English. */
export const FIXED_SOURCE_LANG = 'en' as const;

export const SUPPORTED_TARGET_LANGS = [
  'tr',
  'en',
  'de',
  'fr',
  'it',
  'es',
  'pt',
  'ru',
  'ja',
  'ko',
  'hi',
  'zh',
] as const;

export type SupportedTargetLang = (typeof SUPPORTED_TARGET_LANGS)[number];

export const DEFAULT_TARGET_LANG: SupportedTargetLang = 'tr';

export const SUPPORTED_TARGET_LANG_LABELS: Record<SupportedTargetLang, string> = {
  tr: 'Turkish',
  en: 'English',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  zh: 'Chinese',
};

const supportedTargetLangSet = new Set<string>(SUPPORTED_TARGET_LANGS);

export function isSupportedTargetLang(value: string): value is SupportedTargetLang {
  return supportedTargetLangSet.has(value);
}

export function normalizeSupportedTargetLang(
  value: string | null | undefined,
  fallback: SupportedTargetLang = DEFAULT_TARGET_LANG,
): SupportedTargetLang {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed && isSupportedTargetLang(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export const supportedTargetLangSchema = z.enum(SUPPORTED_TARGET_LANGS, {
  errorMap: () => ({
    message: `targetLang must be one of: ${SUPPORTED_TARGET_LANGS.join(', ')}`,
  }),
});
