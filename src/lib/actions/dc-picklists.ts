"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { foldOcrConfusables } from "@/lib/ocr/parse-inward-dc";
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

/**
 * Names used on stored challans that the picklist does not offer.
 *
 * The Description and Material fields are strict selects, so a part recorded
 * before it reached the picklist becomes unpickable — it exists on challans but
 * cannot be chosen on a new one. Read-only; the caller decides whether to add
 * them.
 */
export async function findUnlistedDcNames(): Promise<{
  components: string[];
  materials: string[];
}> {
  const supabase = await createClient();

  const [{ data: items }, { data: picklist }] = await Promise.all([
    supabase.from("delivery_challan_items").select("component, material"),
    supabase.from("dc_picklist_items").select("kind, name"),
  ]);

  // Compared case-insensitively so a difference of capitals is not treated as
  // a new part. The unique index is case-sensitive, so without this a second
  // spelling would insert happily and show as a duplicate in the dropdown.
  const listed = new Set(
    (picklist ?? []).map((row) => `${row.kind}:${row.name.trim().toLowerCase()}`)
  );

  const missing = { components: new Map<string, string>(), materials: new Map<string, string>() };
  for (const item of items ?? []) {
    const pairs: [string, string | null, Map<string, string>][] = [
      ["component", item.component, missing.components],
      ["material", item.material, missing.materials],
    ];
    for (const [kind, raw, into] of pairs) {
      const name = raw?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (listed.has(`${kind}:${key}`) || into.has(key)) continue;
      into.set(key, name);
    }
  }

  return {
    components: [...missing.components.values()].sort(),
    materials: [...missing.materials.values()].sort(),
  };
}

/**
 * Adds every description and material used on a challan but missing from the
 * picklist. Existing entries are left untouched and nothing is ever duplicated.
 */
export async function addUnlistedDcNamesAction(): Promise<{
  added: number;
  error: string | null;
}> {
  const { components, materials } = await findUnlistedDcNames();
  const rows = [
    ...components.map((name) => ({ kind: "component" as const, name })),
    ...materials.map((name) => ({ kind: "material" as const, name })),
  ];
  if (rows.length === 0) return { added: 0, error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("dc_picklist_items")
    .insert(rows.map((row) => ({ ...row, created_by: user?.id ?? null })));

  if (error) {
    return {
      added: 0,
      error: error.code === "42501" ? "Only an admin can add picklist entries." : error.message,
    };
  }

  revalidatePath("/dashboard/settings/components");
  return { added: rows.length, error: null };
}

/**
 * Stores component names read off a scanned challan.
 *
 * Anything already listed is skipped, compared without regard to case, so
 * scanning the same part on challan after challan never grows the dropdown.
 * Returns the names it actually added.
 */
export async function addScannedComponentNamesAction(
  names: string[]
): Promise<{ added: string[]; error: string | null }> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw?.trim();
    if (name) wanted.set(name.toLowerCase(), name);
  }
  if (wanted.size === 0) return { added: [], error: null };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("dc_picklist_items")
    .select("name")
    .eq("kind", "component");

  // Two passes: an exact match on case, then one that tolerates the characters
  // OCR swaps. Without the second, a name misread as "DN8ORB" would insert
  // alongside the stored "DN80RB" and the dropdown would carry both.
  const listedFolded = new Set((existing ?? []).map((row) => foldOcrConfusables(row.name)));
  for (const row of existing ?? []) wanted.delete(row.name.trim().toLowerCase());
  for (const [key, name] of [...wanted]) {
    if (listedFolded.has(foldOcrConfusables(name))) wanted.delete(key);
  }
  if (wanted.size === 0) return { added: [], error: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const toAdd = [...wanted.values()];
  const { error } = await supabase
    .from("dc_picklist_items")
    .insert(
      toAdd.map((name) => ({ kind: "component" as const, name, created_by: user?.id ?? null }))
    );

  if (error) {
    return {
      added: [],
      error:
        error.code === "42501" ? "Only an admin can add to the component list." : error.message,
    };
  }

  revalidatePath("/dashboard/settings/components");
  revalidatePath("/dashboard/dc/new");
  return { added: toAdd, error: null };
}

/**
 * How many stored challan rows use this name.
 *
 * Deleting a name that challans use makes those parts unpickable on any new
 * challan while leaving the old rows referring to it, so the confirmation says
 * so before the fact rather than leaving it to be discovered later.
 */
export async function countPicklistNameUsage(kind: DcPicklistKind, name: string): Promise<number> {
  const wanted = name?.trim();
  if (!wanted) return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from("delivery_challan_items")
    .select("id", { count: "exact", head: true })
    .eq(kind === "component" ? "component" : "material", wanted);

  return count ?? 0;
}

export async function deletePicklistItemAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("dc_picklist_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/settings/components");
}
