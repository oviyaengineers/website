"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DcNumberSeriesRow } from "@/types/database";

export type DcNumberSeriesState = { error: string | null; saved?: boolean };

/**
 * The single row that decides what the next challan will be numbered.
 *
 * Returns null when migration 0015 has not been applied yet, so the settings
 * screen can say so plainly instead of failing. Numbering itself keeps working
 * either way: the insert trigger allocates the number, not this.
 */
export async function getDcNumberSeries(): Promise<DcNumberSeriesRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("dc_number_series").select("*").maybeSingle();
  return data ?? null;
}

export async function updateDcNumberSeriesAction(
  _prevState: DcNumberSeriesState,
  formData: FormData
): Promise<DcNumberSeriesState> {
  const prefix = String(formData.get("prefix") ?? "").trim();
  const fyLabel = String(formData.get("fy_label") ?? "").trim();
  const padding = Number(formData.get("padding") ?? 3);
  const nextSerial = Number(formData.get("next_serial") ?? 1);

  if (!fyLabel) return { error: "Enter the financial year, for example 26-27." };
  if (!/^[A-Za-z0-9\-/]{2,12}$/.test(fyLabel)) {
    return { error: "The financial year may only contain letters, digits, - and /." };
  }
  if (prefix.length > 12) return { error: "Keep the prefix to 12 characters or fewer." };
  if (!Number.isInteger(padding) || padding < 1 || padding > 8) {
    return { error: "Serial digits must be between 1 and 8." };
  }
  if (!Number.isInteger(nextSerial) || nextSerial < 1) {
    return { error: "The next serial must be 1 or more." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // .select() matters: an RLS refusal comes back as a success with no rows
  // matched, so without reading the row back a staff user would be told their
  // change had saved when nothing moved.
  const { data, error } = await supabase
    .from("dc_number_series")
    .update({
      prefix,
      fy_label: fyLabel,
      padding,
      next_serial: nextSerial,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq("id", true)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing was saved. Only an admin can change DC numbering." };
  }

  revalidatePath("/dashboard/settings/dc-numbers");
  revalidatePath("/dashboard/dc/new");
  return { error: null, saved: true };
}
