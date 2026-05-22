import { z } from "zod";
const FIXED_SOURCE_LANG = "en";
const SUPPORTED_TARGET_LANGS = [
  "tr",
  "en",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "ru",
  "ja",
  "ko",
  "hi",
  "zh"
];
const DEFAULT_TARGET_LANG = "tr";
const SUPPORTED_TARGET_LANG_LABELS = {
  tr: "Turkish",
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  zh: "Chinese"
};
const supportedTargetLangSet = new Set(SUPPORTED_TARGET_LANGS);
function isSupportedTargetLang(value) {
  return supportedTargetLangSet.has(value);
}
function normalizeSupportedTargetLang(value, fallback = DEFAULT_TARGET_LANG) {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed && isSupportedTargetLang(trimmed)) {
    return trimmed;
  }
  return fallback;
}
const supportedTargetLangSchema = z.enum(SUPPORTED_TARGET_LANGS, {
  errorMap: () => ({
    message: `targetLang must be one of: ${SUPPORTED_TARGET_LANGS.join(", ")}`
  })
});
export {
  DEFAULT_TARGET_LANG,
  FIXED_SOURCE_LANG,
  SUPPORTED_TARGET_LANGS,
  SUPPORTED_TARGET_LANG_LABELS,
  isSupportedTargetLang,
  normalizeSupportedTargetLang,
  supportedTargetLangSchema
};
