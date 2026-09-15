"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LANG, type Lang } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import type { Translate } from "@/lib/i18n/types";

type I18nValue = { lang: Lang; t: Translate };

const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  t: createTranslator(DEFAULT_LANG),
});

/**
 * The chosen language for interactive screens. The dashboard layout reads the
 * language cookie on the server and passes it in, so the first paint is
 * already in the right language.
 */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: createTranslator(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
