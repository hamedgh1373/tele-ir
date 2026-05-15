"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  defaultLocale,
  getDictionary,
  getDirection,
  getLocaleTag,
  isLocale,
  type Locale
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  tForLocale: (locale: Locale, key: string) => string;
  dir: "rtl" | "ltr";
  localeTag: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
    document.cookie = `kaman_locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = getDictionary(locale);
    return {
      locale,
      setLocale(next) {
        setLocaleState(isLocale(next) ? next : defaultLocale);
      },
      t(key) {
        return dictionary[key] || key;
      },
      tForLocale(nextLocale, key) {
        return getDictionary(nextLocale)[key] || key;
      },
      dir: getDirection(locale),
      localeTag: getLocaleTag(locale)
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
