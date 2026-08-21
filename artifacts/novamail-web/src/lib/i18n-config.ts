export const LOCALES = [
  "en",
  "ar",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "tr",
  "ru",
  "zh-CN",
  "ja",
  "ko",
  "hi",
  "id",
  "ur",
] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "it", label: "Italiano" },
  { value: "tr", label: "Türkçe" },
  { value: "ru", label: "Русский" },
  { value: "zh-CN", label: "简体中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "hi", label: "हिन्दी" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ur", label: "اردو" },
] as const;

export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ar: "ar",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  tr: "tr-TR",
  ru: "ru-RU",
  "zh-CN": "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  hi: "hi-IN",
  id: "id-ID",
  ur: "ur-PK",
};

export const RTL_LOCALES = new Set<Locale>(["ar", "ur"]);

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && LOCALES.includes(value as Locale));
}

export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function getIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

export function formatLocaleDateTime(value: Date | number | string, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatLocaleNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(value);
}
