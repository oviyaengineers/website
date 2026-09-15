import { DEFAULT_LANG, type Lang } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en/index";
import { ta } from "@/lib/i18n/dictionaries/ta/index";
import type { Dictionary, Translate, TranslateParams, TranslationKey } from "@/lib/i18n/types";

export type { Translate, TranslateParams, TranslationKey } from "@/lib/i18n/types";

export const DICTIONARIES: Record<Lang, Dictionary> = { en, ta };

function lookup(dictionary: Dictionary, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Fills {name} placeholders. Values go in exactly as given: a customer,
 * component or DC number is never translated. A placeholder with no value is
 * left visible, so a missing value shows up in testing instead of vanishing.
 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === null || value === undefined ? match : String(value);
  });
}

/**
 * A translator for one language. A message missing from that language falls
 * back to English, and a key missing everywhere shows the key itself, so the
 * screen never goes blank.
 */
export function createTranslator(lang: Lang): Translate {
  const dictionary = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANG];
  return (key: TranslationKey, params?: TranslateParams) =>
    interpolate(lookup(dictionary, key) ?? lookup(DICTIONARIES[DEFAULT_LANG], key) ?? key, params);
}

/** Every leaf key of a dictionary, for the completeness tests. */
export function dictionaryKeys(dictionary: unknown, prefix = ""): string[] {
  if (dictionary === null || typeof dictionary !== "object") return [];
  return Object.entries(dictionary as Record<string, unknown>).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : dictionaryKeys(value, `${prefix}${key}.`)
  );
}

/** The message stored at a key, or undefined. Used by the completeness tests. */
export function messageAt(dictionary: Dictionary, key: string): string | undefined {
  return lookup(dictionary, key);
}
