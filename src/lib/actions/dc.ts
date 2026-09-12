"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findOverDelivered, outwardTotal } from "@/lib/dc-balance";
import { remainingOnLine } from "@/lib/dc-chain";
import { findDuplicateCustomerDcNumbers } from "@/lib/dc-refs";
import { getScannedDc, markScansConverted } from "@/lib/actions/dc-scan-queue";
import { storedStatusFor } from "@/lib/dc-lifecycle";

export type DcItemInput = {
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  /**
   * The pending line this row despatches against, when the challan is
   * continuing earlier work. The pieces were received on that line, so this
   * row carries no received quantity of its own.
   */
  parent_item_id?: string | null;
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

/**
 * Continuation rows despatching more than their line still owes.
 *
 * The remaining balance is read from the database every time. A figure the
 * form carried could be stale by the time the challan is saved, and two
 * people entering despatches against the same lot is exactly when that
 * matters.
 */
async function findOverContinued(items: DcItemInput[]): Promise<string[]> {
  const continuations = items.filter((item) => item.parent_item_id);
  if (continuations.length === 0) return [];

  const supabase = await createClient();
  const parentIds = [...new Set(continuations.map((item) => item.parent_item_id as string))];

  const { data: parents } = await supabase
    .from("delivery_challan_items")
    .select("id, component, received_qty, sent_qty, material_problem_qty, rejection_qty")
    .in("id", parentIds);

  const { data: siblings } = await supabase
    .from("delivery_challan_items")
    .select("id, parent_item_id, received_qty, sent_qty, material_problem_qty, rejection_qty")
    .in("parent_item_id", parentIds);

  const problems: string[] = [];
  for (const parentId of parentIds) {
    const parent = (parents ?? []).find((row) => row.id === parentId);
    if (!parent) {
      problems.push("one line no longer exists");
      continue;
    }
    const remaining = remainingOnLine(parentId, [
      { ...parent, parent_item_id: null },
      ...(siblings ?? []),
    ]);
    const asked = continuations
      .filter((item) => item.parent_item_id === parentId)
      .reduce((total, item) => total + outwardTotal(item), 0);
    if (asked > remaining) {
      problems.push(`${parent.component} has ${remaining} outstanding but ${asked} is entered`);
    }
  }
  return problems;
}

/** The challan the continued lines belong to, when they all share one. */
async function parentChallanFor(items: DcItemInput[]): Promise<string | null> {
  const parentIds = [...new Set(items.map((item) => item.parent_item_id).filter(Boolean))];
  if (parentIds.length === 0) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("delivery_challan_items")
    .select("dc_id")
    .in("id", parentIds as string[]);

  const challanIds = [...new Set((data ?? []).map((row) => row.dc_id))];
  // Continuing two different challans at once has no single parent, and the
  // per-line links still record the truth, so this is left null.
  return challanIds.length === 1 ? challanIds[0] : null;
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
  const parentItemIds = formData.getAll("item_parent_item_id") as string[];

  const items: DcItemInput[] = components
    .map((component, i) => ({
      component: component?.trim() ?? "",
      material: materials[i]?.trim() || null,
      received_qty: Number(receivedQtys[i] ?? 0) || 0,
      sent_qty: Number(sentQtys[i] ?? 0) || 0,
      material_problem_qty: Number(materialProblemQtys[i] ?? 0) || 0,
      rejection_qty: Number(rejectionQtys[i] ?? 0) || 0,
      parent_item_id: parentItemIds[i]?.trim() || null,
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
    parent_item_id: item.parent_item_id ?? null,
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

  // Only original lines are judged this way. A continuation has no received
  // quantity, so this rule would refuse every one of them.
  const overDelivered = findOverDelivered(values.items.filter((item) => !item.parent_item_id));
  if (overDelivered.length > 0) {
    return {
      error: `More pieces go out than came in on: ${overDelivered
        .map((row) => `${row.component} (${row.extra} extra)`)
        .join("; ")}.`,
    };
  }

  // A continuation row legitimately sends more than it received, because it
  // received nothing: the pieces came in on the line it continues. So it is
  // checked against that line's remaining balance instead, read from the
  // database rather than from anything the browser sent.
  const tooMuch = await findOverContinued(values.items);
  if (tooMuch.length > 0) {
    return {
      error: `More is being despatched than remains outstanding: ${tooMuch.join("; ")}.`,
    };
  }

  const supabase = await createClient();

  // A scan converts exactly once. Two clicks on Create delivery challan, a
  // resubmitted form, or the back button would otherwise each raise a
  // challan for the same customer DC, and only the arithmetic would say so.
  const scanIds = (formData.getAll("used_scan_id") as string[]).filter(Boolean);
  for (const scanId of scanIds) {
    const scan = await getScannedDc(scanId);
    if (scan?.status === "converted") {
      return {
        error:
          `A delivery challan has already been created from this scanned customer DC` +
          `${scan.dcNumber ? " (" + scan.dcNumber + ")" : ""}. Open it from Scanned DCs rather than creating another.`,
      };
    }
  }

  // A continuation cites the same customer reference as the challan it
  // continues, because it is the same inward lot. Warning about that would
  // fire on every one of them and teach the operator to tick past it, which
  // would then hide a real duplicate. What protects this path instead is the
  // remaining-balance check above.
  const isContinuation = values.items.some((item) => item.parent_item_id);

  if (!values.allow_duplicate && !isContinuation) {
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

  // Where every row continues the same challan, the new one records it, so the
  // chain is walkable from either end.
  const parentDcId = await parentChallanFor(values.items);

  const { data: dc, error: dcError } = await supabase
    .from("delivery_challans")
    .insert({
      parent_dc_id: parentDcId,
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

  // The scans that fed this challan have done their job. Cleared here rather
  // than in the browser because saving redirects, so no client code runs
  // afterwards, and the queue is shared across devices.
  //
  // Only the scans that actually filled this form: the rest are still waiting
  // on Scanned DCs for somebody to enter them, and clearing the whole queue
  // would silently throw those away.
  // The scanned customer DC is the input this challan came from, so it is
  // kept and linked rather than deleted. Losing it would lose the trail from
  // the customer's paper to our challan.
  if (scanIds.length > 0) {
    await markScansConverted(scanIds, dc.id);
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
