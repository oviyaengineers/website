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

/** Each language as one or two letters, for the phone-width toggle. */
const SHORT_NAMES: Record<Lang, string> = {
  en: "EN",
  ta: "த",
};

/**
 * English | தமிழ். The choice is kept in a cookie in this browser, so it
 * stays through navigation and reloads, and the server renders the next page
 * in it straight away. Only the application's words change; every name,
 * number and quantity on screen stays exactly as stored.
 */
export function LanguageSwitcher({
  className = "",
  compact = false,
}: {
  className?: string;
  /**
   * On a phone, a single button that switches to the other language. The
   * dashboard header has no room for both names: with them it ran 44px wider
   * than a 375px screen, pushing the scan button off the edge and letting
   * every page scroll sideways.
   */
  compact?: boolean;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    rememberLang(next);
    startTransition(() => router.refresh());
  }

  const other = LANGUAGES.find((code) => code !== lang) ?? lang;

  return (
    <>
      {compact && (
        <button
          type="button"
          lang={other}
          disabled={pending}
          onClick={() => choose(other)}
          aria-label={`${t("header.language")}: ${LANGUAGE_NAMES[other]}`}
          title={LANGUAGE_NAMES[other]}
          className={`size-11 shrink-0 rounded-md border bg-background text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden ${className}`}
        >
          {SHORT_NAMES[other]}
        </button>
      )}
      <div
        role="group"
        aria-label={t("header.language")}
        className={`${compact ? "hidden sm:inline-flex" : "inline-flex"} shrink-0 overflow-hidden rounded-md border text-xs ${className}`}
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
    </>
  );
}
