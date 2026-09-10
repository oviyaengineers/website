"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { foldOcrConfusables, namesLookAlike } from "@/lib/ocr/parse-inward-dc";
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

/**
 * Renames one dropdown entry, and every challan row that used the old spelling.
 *
 * Challan rows store the name as text rather than a reference, so renaming the
 * entry alone would strand them: the rows would keep a name the dropdown no
 * longer offers, and the part would become unpickable. Both are changed
 * together, and the count of rows touched is reported back.
 */
export async function renamePicklistItemAction(
  id: string,
  kind: DcPicklistKind,
  rawName: string
): Promise<{ renamedRows: number; error: string | null }> {
  const name = rawName?.trim();
  if (!name) return { renamedRows: 0, error: "Name is required." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("dc_picklist_items")
    .select("name, kind")
    .eq("id", id)
    .single();
  if (!current) return { renamedRows: 0, error: "That entry no longer exists." };
  if (current.name === name) return { renamedRows: 0, error: null };

  const { data: updated, error } = await supabase
    .from("dc_picklist_items")
    .update({ name })
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      renamedRows: 0,
      error:
        error.code === "23505"
          ? "Another entry already has that name."
          : error.code === "42501"
            ? "Only an admin can rename picklist entries."
            : error.message,
    };
  }
  // Row-level security refuses a write by matching no rows rather than by
  // raising, so a silent no-op reads as success. Without this check the toast
  // said "Renamed" while the name stayed exactly as it was.
  if (!updated || updated.length === 0) {
    return {
      renamedRows: 0,
      error: "The database refused the rename. Migration 0012 may not be applied yet.",
    };
  }

  // Carry the challan rows across so nothing is left pointing at the old text.
  // Written out per column rather than with a computed key, which the generated
  // row types reject.
  const { data: moved } =
    kind === "component"
      ? await supabase
          .from("delivery_challan_items")
          .update({ component: name })
          .eq("component", current.name)
          .select("id")
      : await supabase
          .from("delivery_challan_items")
          .update({ material: name })
          .eq("material", current.name)
          .select("id");

  revalidatePath("/dashboard/settings/components");
  revalidatePath("/dashboard/dc");
  return { renamedRows: moved?.length ?? 0, error: null };
}

/** One entry in a set of names that look like the same part. */
export type DuplicateEntry = { id: string; name: string; usedOnRows: number };

/**
 * Sets of entries that look like the same part spelled differently.
 *
 * Scanning puts these there: a zero read as a letter O, "Flg" as "Fig", a
 * dropped letter in "Casting". Each variant is a separate dropdown entry, and
 * whoever picks from the list eventually chooses the wrong one. Read-only.
 */
export async function findDuplicatePicklistNames(
  kind: DcPicklistKind
): Promise<DuplicateEntry[][]> {
  const supabase = await createClient();
  const [{ data: entries }, { data: rows }] = await Promise.all([
    supabase.from("dc_picklist_items").select("id, name").eq("kind", kind).order("name"),
    supabase.from("delivery_challan_items").select("component, material"),
  ]);
  if (!entries || entries.length < 2) return [];

  const usage = new Map<string, number>();
  for (const row of rows ?? []) {
    const used = kind === "component" ? row.component : row.material;
    const name = used?.trim();
    if (name) usage.set(name, (usage.get(name) ?? 0) + 1);
  }

  // Union-find over the entries, joining any pair that looks alike, so three
  // spellings of one part end up in a single set rather than two pairs.
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (namesLookAlike(entries[i].name, entries[j].name)) parent[find(j)] = find(i);
    }
  }

  const sets = new Map<number, DuplicateEntry[]>();
  entries.forEach((entry, i) => {
    const root = find(i);
    const list = sets.get(root) ?? [];
    list.push({ id: entry.id, name: entry.name, usedOnRows: usage.get(entry.name) ?? 0 });
    sets.set(root, list);
  });

  // Most-used first inside each set: that is usually the correct spelling.
  return [...sets.values()]
    .filter((set) => set.length > 1)
    .map((set) =>
      [...set].sort((a, b) => b.usedOnRows - a.usedOnRows || a.name.localeCompare(b.name))
    );
}

/**
 * Keeps one spelling and removes the others, moving any challan rows across.
 *
 * A plain delete would strand those rows on a name the dropdown no longer
 * offers, so they are repointed at the kept spelling first.
 */
export async function mergePicklistItemsAction(
  kind: DcPicklistKind,
  keepId: string,
  dropIds: string[]
): Promise<{ movedRows: number; removed: number; error: string | null }> {
  if (dropIds.length === 0) return { movedRows: 0, removed: 0, error: null };

  const supabase = await createClient();
  const { data: keep } = await supabase
    .from("dc_picklist_items")
    .select("name")
    .eq("id", keepId)
    .single();
  if (!keep) return { movedRows: 0, removed: 0, error: "The entry to keep no longer exists." };

  const { data: drops } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .in("id", dropIds);
  if (!drops || drops.length === 0) {
    return { movedRows: 0, removed: 0, error: "Nothing to remove." };
  }

  let movedRows = 0;
  for (const drop of drops) {
    if (drop.name === keep.name) continue;
    const { data: moved, error } =
      kind === "component"
        ? await supabase
            .from("delivery_challan_items")
            .update({ component: keep.name })
            .eq("component", drop.name)
            .select("id")
        : await supabase
            .from("delivery_challan_items")
            .update({ material: keep.name })
            .eq("material", drop.name)
            .select("id");
    if (error) return { movedRows, removed: 0, error: error.message };
    movedRows += moved?.length ?? 0;
  }

  const { data: removed, error: deleteError } = await supabase
    .from("dc_picklist_items")
    .delete()
    .in(
      "id",
      drops.map((d) => d.id)
    )
    .select("id");
  if (deleteError) {
    return {
      movedRows,
      removed: 0,
      error:
        deleteError.code === "42501"
          ? "Only an admin can remove picklist entries."
          : deleteError.message,
    };
  }

  revalidatePath("/dashboard/settings/components");
  revalidatePath("/dashboard/dc");
  return { movedRows, removed: removed?.length ?? 0, error: null };
}

export async function deletePicklistItemAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("dc_picklist_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/settings/components");
}
