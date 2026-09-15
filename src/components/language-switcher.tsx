"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import {
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  type Lang,
} from "@/lib/i18n/config";

/** Remembers the chosen language in this browser for a year. */
function rememberLang(next: Lang) {
  document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * English | தமிழ். The choice is kept in a cookie in this browser, so it
 * stays through navigation and reloads, and the server renders the next page
 * in it straight away. Only the application's words change; every name,
 * number and quantity on screen stays exactly as stored.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    rememberLang(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("header.language")}
      className={`inline-flex shrink-0 overflow-hidden rounded-md border text-xs ${className}`}
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          disabled={pending}
          onClick={() => choose(code)}
          className={`h-11 px-2.5 font-medium transition-colors md:h-8 ${
            lang === code
              ? "bg-[#10233f] text-white"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
