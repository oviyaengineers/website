"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CostFormState = { error: string | null };

function extractCost(formData: FormData) {
  return {
    job_name: String(formData.get("job_name") ?? "").trim(),
    dc_id: (formData.get("dc_id") as string) || null,
    invoice_id: (formData.get("invoice_id") as string) || null,
    material_cost: Number(formData.get("material_cost") ?? 0) || 0,
    machine_hours: Number(formData.get("machine_hours") ?? 0) || 0,
    machine_rate: Number(formData.get("machine_rate") ?? 0) || 0,
    labor_cost: Number(formData.get("labor_cost") ?? 0) || 0,
    tooling_cost: Number(formData.get("tooling_cost") ?? 0) || 0,
    overhead_cost: Number(formData.get("overhead_cost") ?? 0) || 0,
  };
}

export async function createCostAction(
  _prevState: CostFormState,
  formData: FormData
): Promise<CostFormState> {
  const values = extractCost(formData);
  if (!values.job_name) return { error: "Job name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("job_costs").insert({ ...values, created_by: user?.id ?? null });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/costs");
  revalidatePath("/dashboard");
  redirect("/dashboard/costs");
}

export async function deleteCostAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("job_costs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/costs");
  revalidatePath("/dashboard");
}
