"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findOverDelivered } from "@/lib/dc-balance";
import { findDuplicateCustomerDcNumbers } from "@/lib/dc-refs";
import { storedStatusFor } from "@/lib/dc-lifecycle";

export type DcItemInput = {
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
};

export type DcFormValues = {
  customer_id: string;
  dc_date: string;
  customer_dc_number: string[] | null;
  customer_dc_date: (string | null)[] | null;
  authorized_by: string | null;
  items: DcItemInput[];
  /** Set once the operator has seen the duplicate warning and meant it. */
  allow_duplicate: boolean;
};

export type DcFormState = {
  error: string | null;
  /**
   * A duplicate the operator has to confirm rather than an outright refusal.
   *
   * The same customer reference genuinely does appear on two of our challans
   * sometimes, when one inward lot is returned in two despatches, so this
   * cannot simply be blocked. It must not pass silently either: entering the
   * same challan twice is the easiest mistake to make here.
   */
  duplicateWarning?: string | null;
};

/**
 * Challans already on file citing any of these customer references.
 *
 * Only the same customer is considered: two customers numbering their own
 * challans "001" is ordinary and means nothing.
 */
async function findExistingRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string,
  refs: string[] | null,
  excludeDcId?: string
): Promise<{ ref: string; dcNumber: string }[]> {
  const wanted = (refs ?? []).map((ref) => ref.trim()).filter(Boolean);
  if (wanted.length === 0) return [];

  let query = supabase
    .from("delivery_challans")
    .select("dc_number, customer_dc_number")
    .eq("customer_id", customerId)
    .overlaps("customer_dc_number", wanted);
  if (excludeDcId) query = query.neq("id", excludeDcId);

  const { data } = await query;
  const found: { ref: string; dcNumber: string }[] = [];
  for (const dc of data ?? []) {
    for (const ref of wanted) {
      if ((dc.customer_dc_number ?? []).includes(ref)) found.push({ ref, dcNumber: dc.dc_number });
    }
  }
  return found;
}

function parseDcForm(formData: FormData): DcFormValues {
  const customer_id = String(formData.get("customer_id") ?? "");
  const dc_date = String(formData.get("dc_date") ?? "");

  const customerDcNumbers = formData.getAll("customer_dc_number") as string[];
  const customerDcDates = formData.getAll("customer_dc_date") as string[];
  const customerDcRefs = customerDcNumbers
    .map((num, i) => ({ num: num?.trim() ?? "", date: customerDcDates[i]?.trim() ?? "" }))
    .filter((ref) => ref.num.length > 0 || ref.date.length > 0);
  const customer_dc_number = customerDcRefs.length > 0 ? customerDcRefs.map((r) => r.num) : null;
  const customer_dc_date =
    customerDcRefs.length > 0 ? customerDcRefs.map((r) => r.date || null) : null;

  const authorized_by = (formData.get("authorized_by") as string) || null;
  const allow_duplicate = formData.get("allow_duplicate") === "yes";

  const components = formData.getAll("item_component") as string[];
  const materials = formData.getAll("item_material") as string[];
  const receivedQtys = formData.getAll("item_received_qty") as string[];
  const sentQtys = formData.getAll("item_sent_qty") as string[];
  const materialProblemQtys = formData.getAll("item_material_problem_qty") as string[];
  const rejectionQtys = formData.getAll("item_rejection_qty") as string[];

  const items: DcItemInput[] = components
    .map((component, i) => ({
      component: component?.trim() ?? "",
      material: materials[i]?.trim() || null,
      received_qty: Number(receivedQtys[i] ?? 0) || 0,
      sent_qty: Number(sentQtys[i] ?? 0) || 0,
      material_problem_qty: Number(materialProblemQtys[i] ?? 0) || 0,
      rejection_qty: Number(rejectionQtys[i] ?? 0) || 0,
    }))
    .filter((item) => item.component.length > 0);

  return {
    customer_id,
    dc_date,
    customer_dc_number,
    customer_dc_date,
    authorized_by,
    items,
    allow_duplicate,
  };
}

/** PostgREST's code for "that column is not in my schema". */
const UNKNOWN_COLUMN = "PGRST204";

/**
 * The component master list, keyed by name for looking up a part's id.
 *
 * Matched without regard to case or surrounding space, the same way the
 * backfill in migration 0018 matched.
 */
async function componentIdsByName(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("dc_picklist_items")
    .select("id, name")
    .eq("kind", "component");
  return new Map((data ?? []).map((row) => [row.name.trim().toLowerCase(), row.id]));
}

/**
 * Writes the item rows for a challan, with and then without component_id.
 *
 * The id is what makes a part stable under renaming, but migration 0018 adds
 * the column and migrations in this project have a history of reporting
 * success without landing. Saving a challan must not depend on one having
 * been applied, so a rejection naming the unknown column is retried with the
 * name alone. Any other error is the caller's to report.
 */
async function insertDcItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dcId: string,
  items: DcItemInput[]
): Promise<{ error: string | null }> {
  const idByName = await componentIdsByName(supabase);
  const rows = items.map((item, index) => ({
    dc_id: dcId,
    component: item.component,
    material: item.material,
    received_qty: item.received_qty,
    sent_qty: item.sent_qty,
    material_problem_qty: item.material_problem_qty,
    rejection_qty: item.rejection_qty,
    sort_order: index,
  }));

  const withIds = rows.map((row) => ({
    ...row,
    component_id: idByName.get(row.component.trim().toLowerCase()) ?? null,
  }));

  const { error } = await supabase.from("delivery_challan_items").insert(withIds);
  if (!error) return { error: null };
  if (error.code !== UNKNOWN_COLUMN) return { error: error.message };

  const retry = await supabase.from("delivery_challan_items").insert(rows);
  return { error: retry.error?.message ?? null };
}

export async function createDcAction(
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one item." };

  const duplicateRefs = findDuplicateCustomerDcNumbers(values.customer_dc_number ?? []);
  if (duplicateRefs.length > 0) {
    return {
      error: `The same customer DC number appears more than once: ${duplicateRefs.join(
        ", "
      )}. Each reference may only be listed once.`,
    };
  }

  const overDelivered = findOverDelivered(values.items);
  if (overDelivered.length > 0) {
    return {
      error: `More pieces go out than came in on: ${overDelivered
        .map((row) => `${row.component} (${row.extra} extra)`)
        .join("; ")}.`,
    };
  }

  const supabase = await createClient();

  if (!values.allow_duplicate) {
    const clashes = await findExistingRefs(supabase, values.customer_id, values.customer_dc_number);
    if (clashes.length > 0) {
      const listed = clashes.map((c) => `${c.ref} (on ${c.dcNumber})`).join(", ");
      return {
        error: null,
        duplicateWarning: `This customer reference is already recorded: ${listed}. Tick the box below and save again if that is correct.`,
      };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: dc, error: dcError } = await supabase
    .from("delivery_challans")
    .insert({
      customer_id: values.customer_id,
      dc_date: values.dc_date || undefined,
      customer_dc_number: values.customer_dc_number,
      customer_dc_date: values.customer_dc_date,
      authorized_by: values.authorized_by,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (dcError || !dc) {
    return { error: dcError?.message ?? "Failed to create delivery challan." };
  }

  const { error: itemsError } = await insertDcItems(supabase, dc.id, values.items);

  if (itemsError) {
    // Partial failure: remove the orphaned DC header so we don't leave a
    // delivery challan with no items behind.
    await supabase.from("delivery_challans").delete().eq("id", dc.id);
    return { error: itemsError };
  }

  revalidatePath("/dashboard/dc");
  redirect(`/dashboard/dc/${dc.id}`);
}

export async function updateDcAction(
  id: string,
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);

  if (!values.customer_id) return { error: "Please select a customer." };
  if (values.items.length === 0) return { error: "Add at least one item." };

  const duplicateRefs = findDuplicateCustomerDcNumbers(values.customer_dc_number ?? []);
  if (duplicateRefs.length > 0) {
    return {
      error: `The same customer DC number appears more than once: ${duplicateRefs.join(
        ", "
      )}. Each reference may only be listed once.`,
    };
  }

  const overDelivered = findOverDelivered(values.items);
  if (overDelivered.length > 0) {
    return {
      error: `More pieces go out than came in on: ${overDelivered
        .map((row) => `${row.component} (${row.extra} extra)`)
        .join("; ")}.`,
    };
  }

  const supabase = await createClient();

  if (!values.allow_duplicate) {
    const clashes = await findExistingRefs(
      supabase,
      values.customer_id,
      values.customer_dc_number,
      id
    );
    if (clashes.length > 0) {
      const listed = clashes.map((c) => `${c.ref} (on ${c.dcNumber})`).join(", ");
      return {
        error: null,
        duplicateWarning: `This customer reference is already recorded: ${listed}. Tick the box below and save again if that is correct.`,
      };
    }
  }

  const { error: dcError } = await supabase
    .from("delivery_challans")
    .update({
      customer_id: values.customer_id,
      dc_date: values.dc_date || undefined,
      customer_dc_number: values.customer_dc_number,
      customer_dc_date: values.customer_dc_date,
      authorized_by: values.authorized_by,
    })
    .eq("id", id);

  if (dcError) return { error: dcError.message };

  const { error: deleteError } = await supabase
    .from("delivery_challan_items")
    .delete()
    .eq("dc_id", id);

  if (deleteError) return { error: deleteError.message };

  const { error: itemsError } = await insertDcItems(supabase, id, values.items);

  if (itemsError) return { error: itemsError };

  revalidatePath("/dashboard/dc");
  revalidatePath(`/dashboard/dc/${id}`);
  redirect(`/dashboard/dc/${id}`);
}

/**
 * Move a challan between Draft and Active.
 *
 * Completed is not offered: it is read off the item rows, not stored. The
 * caller names the lifecycle and storedStatusFor decides the spelling, so the
 * one place that knows about the old status names stays in dc-lifecycle.
 */
export async function updateDcStatusAction(id: string, lifecycle: "draft" | "active") {
  const supabase = await createClient();
  const status = storedStatusFor(lifecycle);
  const { error } = await supabase.from("delivery_challans").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/dc/${id}`);
  revalidatePath("/dashboard/dc");
}

export async function deleteDcAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_challans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/dc");
}
