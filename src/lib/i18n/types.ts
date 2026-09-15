import type { en } from "@/lib/i18n/dictionaries/en/index";

/** The shape of a dictionary: the English one, with every leaf a string. */
export type Messages<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};

/** Every language's dictionary must have exactly the English keys. */
export type Dictionary = Messages<typeof en>;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A dotted path to one message, e.g. "nav.allDcs". A typo is a type error. */
export type TranslationKey = Leaves<typeof en>;

/**
 * Values placed into a message, such as a DC number or a component name.
 * They are inserted exactly as given and never translated.
 */
export type TranslateParams = Record<string, string | number | null | undefined>;

export type Translate = (key: TranslationKey, params?: TranslateParams) => string;
