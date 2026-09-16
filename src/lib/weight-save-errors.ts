import type { Lang } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * What the operator is told when saving weights fails.
 *
 * save_dc_line_weights (0029) runs as one transaction and raises short coded
 * messages, so any failure means no line on the DC was changed. Component
 * names from the message are passed through unchanged.
 */
export function weightSaveErrorMessage(
  message: string | null | undefined,
  code?: string | null,
  lang: Lang = "en"
): string {
  const t = createTranslator(lang);
  const text = message ?? "";
  const named = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();

  if (text.includes("WEIGHT_ADMIN_ONLY") || code === "42501" || /permission denied/i.test(text)) {
    return t("weight.error.adminOnly");
  }
  if (text.includes("WEIGHT_DRAFT_DC")) return t("weight.error.draftDc");
  if (text.includes("WEIGHT_DC_NOT_FOUND")) return t("weight.error.dcNotFound");
  if (text.includes("WEIGHT_LINE_NOT_ON_DC") || text.includes("WEIGHT_LINE_NOT_FOUND")) {
    return t("weight.error.lineNotOnDc");
  }
  if (text.includes("WEIGHT_DUPLICATE_LINE")) return t("weight.error.duplicateLine");
  if (text.includes("WEIGHT_NO_LINES")) return t("weight.error.noLines");

  const coded: [RegExp, Parameters<typeof t>[0]][] = [
    [/WEIGHT_BAD_UNIT:(.*)/, "weight.error.badUnit"],
    [/WEIGHT_BAD_NUMBER:(.*)/, "weight.error.badNumber"],
    [/WEIGHT_MISSING:(.*)/, "weight.error.missing"],
    [/WEIGHT_NEGATIVE:(.*)/, "weight.error.negative"],
    [/WEIGHT_FINISHED_OVER_ROUGH:(.*)/, "weight.error.finishedOverRough"],
  ];
  for (const [pattern, key] of coded) {
    const component = named(pattern);
    if (component !== undefined) return t(key, { component });
  }
  if (/finished_within_rough/.test(text)) return t("weight.problem.finishedOverRough");
  if (/not_negative/.test(text)) return t("weight.problem.negative");

  return text ? t("weight.error.genericWithDetail", { detail: text }) : t("weight.error.generic");
}
