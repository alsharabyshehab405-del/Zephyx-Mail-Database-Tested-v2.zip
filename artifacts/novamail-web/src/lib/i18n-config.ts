export type Locale =
  | "en"
  | "ar"
  | "fr"
  | "es"
  | "de"
  | "pt"
  | "tr"
  | "zh"
  | "hi"
  | "id";

export const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "tr", label: "Türkçe" },
  { value: "zh", label: "简体中文" },
  { value: "hi", label: "हिन्दी" },
  { value: "id", label: "Bahasa Indonesia" },
] as const;

export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ar: "ar",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  tr: "tr-TR",
  zh: "zh-CN",
  hi: "hi-IN",
  id: "id-ID",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && LOCALE_OPTIONS.some((option) => option.value === value));
}

export function isRtlLocale(locale: Locale): boolean {
  return locale === "ar";
}

export function getIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}
