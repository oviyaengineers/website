import { format, type Locale } from "date-fns";
import { ta as tamil } from "date-fns/locale/ta";
import type { Lang } from "@/lib/i18n/config";

/** The date-fns locale for a language; English uses date-fns' built-in default. */
export function dateLocale(lang: Lang): Locale | undefined {
  return lang === "ta" ? tamil : undefined;
}

/**
 * A date in the chosen language: month names in Tamil or English, digits
 * unchanged. A plain "YYYY-MM-DD" business date is read as that calendar day,
 * so it never shifts by a day with the time zone.
 */
export function formatDate(value: Date | string | number, pattern: string, lang: Lang): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return format(date, pattern, { locale: dateLocale(lang) });
}
