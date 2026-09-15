/**
 * The languages the ERP screens can be shown in.
 *
 * Only the application's own words are translated. Anything a person entered
 * or the system numbered (customer, component and material names, DC and
 * invoice numbers, GSTIN, HSN/SAC, quantities, rates) is always shown exactly
 * as stored. Adding a language means adding it here and one dictionary.
 */
export const LANGUAGES = ["en", "ta"] as const;

export type Lang = (typeof LANGUAGES)[number];

export const DEFAULT_LANG: Lang = "en";

/** Browser cookie holding the chosen language, read by the server on every request. */
export const LANG_COOKIE = "oe_lang";

/** One year: the choice stays until the person changes it. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language named in itself, as shown on the switcher. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  ta: "தமிழ்",
};

/** A cookie or query value as a supported language; anything else is the default. */
export function parseLang(value: string | null | undefined): Lang {
  return (LANGUAGES as readonly string[]).includes(value ?? "") ? (value as Lang) : DEFAULT_LANG;
}
