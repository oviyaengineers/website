"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import {
  isWeightUnit,
  milligramsToGramsText,
  toMilligrams,
  validateMasterEntry,
  validateRate,
  MASTER_PROBLEM_TEXT,
  RATE_PROBLEM_TEXT,
  type WeightUnit,
} from "@/lib/weight";
import { weightSaveErrorMessage } from "@/lib/weight-save-errors";
import { moduleLockedError } from "@/lib/module-lock-server";
import { scrapRateGroupKey } from "@/lib/scrap-rate-groups";

/**
 * Weight / Scrap and Weight Master changes.
 *
 * The browser checks the same rules first, and these check them again, but
 * neither is what protects the data: migration 0031 refuses a non-admin, a
 * locked session, weights that break the rules, and any attempt to type a
 * line's weights or Sent Qty. Sent Qty is never sent from here.
 */

const clean = (text: string) => text.trim().replace(/,/g, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Weight / Scrap unlocked and an admin, or the reason not. */
async function adminGate(): Promise<string | null> {
  // Weight / Scrap sits behind the PIN (0030); the database refuses the data regardless.
  const locked = await moduleLockedError("weight");
  if (locked) return locked;
  const { profile } = await getCurrentUserAndProfile();
  if (profile?.role !== "admin") return "Only an admin can change Weight / Scrap.";
  return null;
}

function refresh() {
  revalidatePath("/dashboard/weight", "layout");
  revalidatePath("/dashboard/settings/weight-master");
  revalidatePath("/dashboard/settings/scrap-rates");
}

/** Add a material to the DC picklist if needed, and set its current scrap rate. */
export async function saveScrapMaterialRateAction(input: {
  materialId?: string;
  materialName?: string;
  rateText: string;
}): Promise<MasterResult> {
  const gate = await adminGate();
  if (gate) return { error: gate };
  const rateText = String(input?.rateText ?? "").trim();
  const rateProblem = validateRate(rateText);
  if (rateProblem) return { error: RATE_PROBLEM_TEXT[rateProblem] };

  const supabase = await createClient();
  let materialId = typeof input.materialId === "string" ? input.materialId : "";
  let materialName = "";
  if (materialId) {
    if (!UUID.test(materialId)) return { error: "Choose a material from the DC list." };
    const { data } = await supabase
      .from("dc_picklist_items")
      .select("id, name")
      .eq("id", materialId)
      .eq("kind", "material")
      .maybeSingle();
    if (!data) return { error: "That material is no longer in the DC list." };
    materialName = data.name;
  } else {
    const name = String(input.materialName ?? "").trim();
    if (!name) return { error: "Enter a material name." };
    const { data: existing } = await supabase
      .from("dc_picklist_items")
      .select("id, name")
      .eq("kind", "material");
    const match = (existing ?? []).find(
      (row) => row.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (match) {
      materialId = match.id;
      materialName = match.name;
    } else {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("dc_picklist_items")
        .insert({ kind: "material", name, created_by: auth.user?.id ?? null })
        .select("id, name")
        .single();
      if (error || !data) return { error: error?.message ?? "Could not add that material." };
      materialId = data.id;
      materialName = data.name;
    }
  }

  const { data: materialRows } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("kind", "material");
  const group = scrapRateGroupKey(materialName);
  const materialIds = (materialRows ?? [])
    .filter((row) => scrapRateGroupKey(row.name) === group)
    .map((row) => row.id);
  const { error } = await supabase.from("scrap_material_rates").upsert(
    materialIds.map((id) => ({ material_id: id, rate_per_kg: Number(clean(rateText)) })),
    { onConflict: "material_id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/dashboard/settings/components");
  refresh();
  return { error: null };
}

/** Approve a rate for an inclusive DC-date range without editing prior periods. */
export async function approveScrapRatePeriodAction(input: {
  materialId: string;
  rateText: string;
  from: string;
  to: string;
}): Promise<MasterResult> {
  const gate = await adminGate();
  if (gate) return { error: gate };
  const rateText = String(input?.rateText ?? "").trim();
  const rateProblem = validateRate(rateText);
  if (rateProblem) return { error: RATE_PROBLEM_TEXT[rateProblem] };
  const from = String(input?.from ?? "");
  const to = String(input?.to ?? "");
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to)) return { error: "Choose valid From and To dates." };
  if (to < from) return { error: "To date must be on or after From date." };
  if (typeof input.materialId !== "string" || !UUID.test(input.materialId)) {
    return { error: "Choose a material from the DC list." };
  }

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("id", input.materialId)
    .eq("kind", "material")
    .maybeSingle();
  if (!material) return { error: "That material is no longer in the DC list." };

  const { error } = await supabase.from("scrap_rate_periods").insert({
    material_group: scrapRateGroupKey(material.name),
    effective_from: from,
    effective_to: to,
    rate_per_kg: Number(clean(rateText)),
  });
  if (error) {
    if (error.message.includes("SCRAP_RATE_PERIOD_OVERLAP")) {
      return { error: "An approved rate already covers one or more of those dates for this material." };
    }
    return { error: error.message };
  }
  refresh();
  return { error: null };
}

// ---------------------------------------------------------------------------
// DC lines

export type WeightLineInput =
  /** Record from the active master, or change a recorded line's rate. */
  | { dcItemId: string; kind: "rate"; rateText: string }
  /** Use the line's current Sent Qty for its recorded totals. */
  | { dcItemId: string; kind: "acceptSentQty" }
  | { dcItemId: string; kind: "remove" };

export type SaveWeightsResult = { error: string | null; saved: number; removed: number };

/** Save the changed lines of one DC, all or nothing. */
export async function saveWeightsAction(
  dcId: string,
  lines: WeightLineInput[]
): Promise<SaveWeightsResult> {
  const fail = (error: string): SaveWeightsResult => ({ error, saved: 0, removed: 0 });
  const gate = await adminGate();
  if (gate) return fail(gate);
  if (typeof dcId !== "string" || !UUID.test(dcId)) return fail("This DC no longer exists.");
  if (!Array.isArray(lines) || lines.length === 0) return fail("Nothing to save.");

  const payload: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (typeof line?.dcItemId !== "string" || !UUID.test(line.dcItemId)) {
      return fail("A line is no longer on this DC. Reload the page.");
    }
    if (line.kind === "remove") {
      payload.push({ dc_item_id: line.dcItemId, remove: true });
    } else if (line.kind === "acceptSentQty") {
      payload.push({ dc_item_id: line.dcItemId, accept_sent_qty: true });
    } else if (line.kind === "rate") {
      const problem = validateRate(String(line.rateText ?? ""));
      if (problem) return fail(RATE_PROBLEM_TEXT[problem]);
      payload.push({ dc_item_id: line.dcItemId, scrap_rate: clean(String(line.rateText)) });
    } else {
      return fail("Nothing to save.");
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_dc_line_weights", {
    p_dc_id: dcId,
    p_lines: payload,
  });
  if (error) return fail(weightSaveErrorMessage(error.message, error.code));

  const row = Array.isArray(data) ? data[0] : data;
  refresh();
  return { error: null, saved: row?.saved ?? 0, removed: row?.removed ?? 0 };
}

// ---------------------------------------------------------------------------
// Weight Master

export type WeightMasterInput = {
  /** Present when editing. The component and material of a record stay fixed. */
  id?: string;
  componentId: string;
  material: string;
  unit: WeightUnit;
  roughText: string;
  finishedText: string;
  isActive: boolean;
};

export type MasterResult = { error: string | null };

export async function saveWeightMasterAction(input: WeightMasterInput): Promise<MasterResult> {
  const gate = await adminGate();
  if (gate) return { error: gate };
  if (!isWeightUnit(input?.unit)) return { error: "Choose g or kg." };
  const problems = validateMasterEntry({
    roughText: String(input.roughText ?? ""),
    finishedText: String(input.finishedText ?? ""),
    unit: input.unit,
  });
  if (problems.length > 0) return { error: MASTER_PROBLEM_TEXT[problems[0]] };

  const values = {
    unit: input.unit,
    rough_weight_g: Number(milligramsToGramsText(toMilligrams(input.roughText, input.unit) ?? 0)),
    finished_weight_g: Number(
      milligramsToGramsText(toMilligrams(input.finishedText, input.unit) ?? 0)
    ),
    is_active: input.isActive !== false,
  };

  const supabase = await createClient();
  if (input.id) {
    if (!UUID.test(input.id)) return { error: "This master no longer exists." };
    const { data, error } = await supabase
      .from("weight_master")
      .update(values)
      .eq("id", input.id)
      .select("id");
    if (error) return { error: weightSaveErrorMessage(error.message, error.code) };
    if (!data || data.length === 0) return { error: "This master no longer exists." };
  } else {
    if (typeof input.componentId !== "string" || !UUID.test(input.componentId)) {
      return { error: "Choose a component from Components & Materials." };
    }
    const material = String(input.material ?? "").trim();
    if (!material) return { error: "Choose a material from Components & Materials." };
    const { error } = await supabase
      .from("weight_master")
      .insert({ ...values, component_id: input.componentId, material });
    if (error) return { error: weightSaveErrorMessage(error.message, error.code) };
  }
  refresh();
  return { error: null };
}

export async function setWeightMasterActiveAction(
  id: string,
  isActive: boolean
): Promise<MasterResult> {
  const gate = await adminGate();
  if (gate) return { error: gate };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "This master no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weight_master")
    .update({ is_active: isActive === true })
    .eq("id", id)
    .select("id");
  if (error) return { error: weightSaveErrorMessage(error.message, error.code) };
  if (!data || data.length === 0) return { error: "This master no longer exists." };
  refresh();
  return { error: null };
}

/** Only for a master no DC line has used; the database refuses the rest. */
export async function deleteWeightMasterAction(id: string): Promise<MasterResult> {
  const gate = await adminGate();
  if (gate) return { error: gate };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "This master no longer exists." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("weight_master").delete().eq("id", id).select("id");
  if (error) return { error: weightSaveErrorMessage(error.message, error.code) };
  if (!data || data.length === 0) return { error: "This master no longer exists." };
  refresh();
  return { error: null };
}
