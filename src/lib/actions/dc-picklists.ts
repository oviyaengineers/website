"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DcPicklistKind } from "@/types/database";

export type PicklistFormState = { error: string | null };

export async function createPicklistItemAction(
  kind: DcPicklistKind,
  _prevState: PicklistFormState,
  formData: FormData
): Promise<PicklistFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("dc_picklist_items")
    .insert({ kind, name, created_by: user?.id ?? null });

  if (error) {
    return { error: error.code === "23505" ? "That name already exists." : error.message };
  }

  revalidatePath("/dashboard/settings/components");
  return { error: null };
}

export async function deletePicklistItemAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("dc_picklist_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/settings/components");
}
