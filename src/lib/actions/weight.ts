"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { isWeightUnit, validateWeightEntry, type WeightUnit } from "@/lib/weight";
import { weightSaveErrorMessage } from "@/lib/weight-save-errors";

export type WeightLineInput =
  | {
      dcItemId: string;
      remove?: false;
      roughText: string;
      roughUnit: WeightUnit;
      finishedText: string;
      finishedUnit: WeightUnit;
      rateText: string;
    }
  | { dcItemId: string; remove: true };

export type SaveWeightsResult = { error: string | null; saved: number; removed: number };

const clean = (text: string) => text.trim().replace(/,/g, "");

/**
 * Save the changed lines of one DC, all or nothing.
 *
 * The browser checks the same rules first, and this checks them again, but
 * neither is what protects the data: save_dc_line_weights (0029) refuses a
 * non-admin, a line from another DC, and any weight that breaks the rules, and
 * the table's own constraints and row-level security stand behind that.
 * Sent Qty is never sent from here; the database reads it from the line.
 */
export async function saveWeightsAction(
  dcId: string,
  lines: WeightLineInput[]
): Promise<SaveWeightsResult> {
  const { lang, t } = await getTranslator();
  const fail = (error: string): SaveWeightsResult => ({ error, saved: 0, removed: 0 });

  if (!Array.isArray(lines) || lines.length === 0) return fail(t("weight.nothingToSave"));

  const { profile } = await getCurrentUserAndProfile();
  if (profile?.role !== "admin") return fail(t("weight.error.adminOnly"));

  const payload: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (typeof line?.dcItemId !== "string" || !line.dcItemId)
      return fail(t("weight.error.lineNotOnDc"));
    if (line.remove === true) {
      payload.push({ dc_item_id: line.dcItemId, remove: true });
      continue;
    }
    if (!isWeightUnit(line.roughUnit) || !isWeightUnit(line.finishedUnit)) {
      return fail(t("weight.fixLines"));
    }
    const problems = validateWeightEntry({
      roughText: String(line.roughText ?? ""),
      roughUnit: line.roughUnit,
      finishedText: String(line.finishedText ?? ""),
      finishedUnit: line.finishedUnit,
      rateText: String(line.rateText ?? ""),
    });
    if (problems.length > 0) return fail(t("weight.fixLines"));
    payload.push({
      dc_item_id: line.dcItemId,
      rough_value: clean(String(line.roughText)),
      rough_unit: line.roughUnit,
      finished_value: clean(String(line.finishedText)),
      finished_unit: line.finishedUnit,
      scrap_rate: clean(String(line.rateText ?? "")),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_dc_line_weights", {
    p_dc_id: dcId,
    p_lines: payload,
  });
  if (error) return fail(weightSaveErrorMessage(error.message, error.code, lang));

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/dashboard/weight");
  revalidatePath(`/dashboard/weight/${dcId}`);
  return { error: null, saved: row?.saved ?? 0, removed: row?.removed ?? 0 };
}
