import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, type Lang } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import type { Translate } from "@/lib/i18n/types";

/** The language chosen in this browser, for server components and server actions. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return parseLang(store.get(LANG_COOKIE)?.value);
}

/** The chosen language and a translator for it. */
export async function getTranslator(): Promise<{ lang: Lang; t: Translate }> {
  const lang = await getLang();
  return { lang, t: createTranslator(lang) };
}
