import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import IntlMessageFormat from "intl-messageformat";
import {
  getIntlLocale,
  isLocale,
  isRtlLocale,
  type Locale,
} from "@/lib/i18n-config";

export type I18nValue = string | number | Date;
export type I18nValues = Record<string, I18nValue>;
type NamespaceMessages = Record<string, string>;
type FlatMessages = Record<string, string>;

type I18nContextType = {
  locale: Locale;
  setLocale: (locale: Locale, options?: { syncAccount?: boolean }) => void;
  t: (key: string, values?: I18nValues) => string;
};

const eagerEnglish = import.meta.glob("../locales/en/*.json", {
  eager: true,
  import: "default",
}) as Record<string, NamespaceMessages>;

const lazyLocaleFiles = import.meta.glob("../locales/*/*.json", {
  import: "default",
}) as Record<string, () => Promise<NamespaceMessages>>;

function flattenNamespaces(namespaces: ReadonlyArray<readonly [string, NamespaceMessages]>): FlatMessages {
  return Object.fromEntries(
    namespaces.flatMap(([namespace, messages]) =>
      Object.entries(messages).map(([key, value]) => [`${namespace}.${key}`, value]),
    ),
  );
}

const englishMessages = flattenNamespaces(
  Object.entries(eagerEnglish).map(([path, messages]) => [
    path.split("/").at(-1)!.replace(/\.json$/, ""),
    messages,
  ]),
);

const messageCache: Partial<Record<Locale, FlatMessages>> = { en: englishMessages };
const localeLoading = new Map<Locale, Promise<FlatMessages>>();

export async function loadLocaleMessages(locale: Locale): Promise<FlatMessages> {
  const cached = messageCache[locale];
  if (cached) return cached;

  const existing = localeLoading.get(locale);
  if (existing) return existing;

  const promise = Promise.all(
    Object.entries(lazyLocaleFiles)
      .filter(([path]) => path.includes(`/locales/${locale}/`))
      .map(async ([path, loader]) => [
        path.split("/").at(-1)!.replace(/\.json$/, ""),
        await loader(),
      ] as const),
  ).then((namespaces) => {
    const messages = flattenNamespaces(namespaces);
    messageCache[locale] = messages;
    return messages;
  });

  localeLoading.set(locale, promise);
  return promise;
}

function fallbackLabel(key: string): string {
  const leaf = key.split(".").pop() || key;
  const human = leaf
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return human ? human.charAt(0).toUpperCase() + human.slice(1) : key;
}

export function translateForLocale(locale: Locale, key: string, values?: I18nValues): string {
  const template = messageCache[locale]?.[key] ?? englishMessages[key] ?? fallbackLabel(key);
  try {
    return String(new IntlMessageFormat(template, getIntlLocale(locale)).format(values));
  } catch {
    return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) =>
      values?.[name] === undefined ? match : String(values[name]),
    );
  }
}

function readPersistedLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem("novamail-locale");
  return isLocale(saved) ? saved : null;
}

function syncLocaleToAccount(locale: Locale): void {
  if (typeof window === "undefined") return;
  void fetch("/api/users/me", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  }).catch(() => undefined);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readPersistedLocale() ?? "en");
  const [loadedLocale, setLoadedLocale] = useState<Locale>("en");

  useEffect(() => {
    let active = true;
    void loadLocaleMessages(locale).then(() => {
      if (active) setLoadedLocale(locale);
    }).catch(() => {
      if (active) setLoadedLocale("en");
    });
    return () => {
      active = false;
    };
  }, [locale]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
    document.documentElement.lang = getIntlLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined" || readPersistedLocale()) return;
    void fetch("/api/users/me", { credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<{ locale?: string }> : null)
      .then((profile) => {
        if (profile?.locale && isLocale(profile.locale)) {
          setLocaleState(profile.locale);
          window.localStorage.setItem("novamail-locale", profile.locale);
        }
      })
      .catch(() => undefined);
  }, []);

  const setLocale = (nextLocale: Locale, options?: { syncAccount?: boolean }) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") window.localStorage.setItem("novamail-locale", nextLocale);
    if (options?.syncAccount !== false) syncLocaleToAccount(nextLocale);
  };

  const contextValue = useMemo<I18nContextType>(() => ({
    locale,
    setLocale,
    t: (key, values) => translateForLocale(loadedLocale === locale ? locale : "en", key, values),
  }), [locale, loadedLocale]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
