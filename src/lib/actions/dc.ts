"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findOverDelivered, outwardTotal } from "@/lib/dc-balance";
import { bookableOnLine, isContinuationLine, remainingByLine } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { findDuplicateCustomerDcNumbers } from "@/lib/dc-refs";
import { storedStatusFor } from "@/lib/dc-lifecycle";
import { saveErrorMessage } from "@/lib/dc-save-errors";
import type { Lang } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/types";

export type DcItemInput = {
  /** The stored line, when editing. Kept so follow-ups stay attached to it. */
  id?: string | null;
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
  /** Generated once per form, so a repeated save cannot make a second challan. */
  request_key: string | null;
  /** Rows carrying a quantity but no component, which cannot be saved. */
  unnamed_rows: number;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * An early, friendly answer for the form. The save itself checks the same
 * thing again inside its transaction, under a lock on the line, which is what
 * actually stops two despatches saved at once from both getting through.
 */
async function findOverContinued(
  t: Translate,
  items: DcItemInput[],
  /** The challan being edited, whose current figures are about to be replaced. */
  editingDcId?: string | null
): Promise<string[]> {
  const continuations = items.filter((item) => item.parent_item_id);
  if (continuations.length === 0) return [];

  const supabase = await createClient();
  const chainRows = await fetchChainRows(supabase);
  const parentIds = [...new Set(continuations.map((item) => item.parent_item_id as string))];

  const problems: string[] = [];
  for (const parentId of parentIds) {
    const parent = chainRows.find((row) => row.id === parentId);
    if (!parent) {
      problems.push(t("dcErrors.parentLineMissing"));
      continue;
    }
    // Room left on the line: the balance after confirmed despatches, less what
    // other drafts have already booked. A challan being edited is left out
    // entirely, confirmed or not, because these rows replace its old ones.
    const pool = editingDcId
      ? chainRows.filter((row) => row.dc_id !== editingDcId || row.id === parentId)
      : chainRows;
    const room = bookableOnLine(parentId, pool);
    const asked = continuations
      .filter((item) => item.parent_item_id === parentId)
      .reduce((total, item) => total + outwardTotal(item), 0);
    if (asked > room) {
      problems.push(
        t("dcErrors.overContinuedLine", {
          component: parent.component,
          left: Math.max(0, room),
          entered: asked,
        })
      );
    }
  }
  return problems;
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
  const rawKey = String(formData.get("request_key") ?? "").trim();

  const ids = formData.getAll("item_id") as string[];
  const components = formData.getAll("item_component") as string[];
  const materials = formData.getAll("item_material") as string[];
  const receivedQtys = formData.getAll("item_received_qty") as string[];
  const sentQtys = formData.getAll("item_sent_qty") as string[];
  const materialProblemQtys = formData.getAll("item_material_problem_qty") as string[];
  const rejectionQtys = formData.getAll("item_rejection_qty") as string[];
  const parentItemIds = formData.getAll("item_parent_item_id") as string[];

  const allRows = components.map((component, i) => ({
    id: UUID.test(ids[i]?.trim() ?? "") ? ids[i].trim() : null,
    component: component?.trim() ?? "",
    material: materials[i]?.trim() || null,
    received_qty: Number(receivedQtys[i] ?? 0) || 0,
    sent_qty: Number(sentQtys[i] ?? 0) || 0,
    material_problem_qty: Number(materialProblemQtys[i] ?? 0) || 0,
    rejection_qty: Number(rejectionQtys[i] ?? 0) || 0,
    parent_item_id: parentItemIds[i]?.trim() || null,
  }));
  const items: DcItemInput[] = allRows.filter((item) => item.component.length > 0);
  const unnamed_rows = allRows.filter(
    (item) =>
      item.component.length === 0 &&
      item.received_qty + item.sent_qty + item.material_problem_qty + item.rejection_qty > 0
  ).length;

  return {
    customer_id,
    dc_date,
    customer_dc_number,
    customer_dc_date,
    authorized_by,
    items,
    allow_duplicate,
    request_key: UUID.test(rawKey) ? rawKey : null,
    unnamed_rows,
  };
}

/** Checks that need nothing but the form, shared by create and edit. */
function formProblems(t: Translate, values: DcFormValues): string | null {
  if (!values.customer_id) return t("dcErrors.noCustomer");
  if (values.unnamed_rows > 0) {
    return values.unnamed_rows === 1
      ? t("dcErrors.unnamedRowsOne")
      : t("dcErrors.unnamedRows", { count: values.unnamed_rows });
  }
  if (values.items.length === 0) return t("dcErrors.noItems");

  const negative = values.items.find(
    (item) =>
      item.received_qty < 0 ||
      item.sent_qty < 0 ||
      item.material_problem_qty < 0 ||
      item.rejection_qty < 0
  );
  if (negative) return t("dcErrors.negative", { component: negative.component });

  const duplicateRefs = findDuplicateCustomerDcNumbers(values.customer_dc_number ?? []);
  if (duplicateRefs.length > 0) {
    return t("dcErrors.duplicateRefs", { refs: duplicateRefs.join(", ") });
  }

  // Only original lines are judged this way. A continuation has no received
  // quantity, so this rule would refuse every one of them.
  const overDelivered = findOverDelivered(values.items.filter((item) => !item.parent_item_id));
  if (overDelivered.length > 0) {
    return t("dcErrors.overDelivered", {
      rows: overDelivered
        .map((row) => t("dcErrors.extraRow", { component: row.component, count: row.extra }))
        .join("; "),
    });
  }
  return null;
}

/**
 * Save through the database function, which writes the challan, its lines and
 * the scans it came from in one transaction. Either all of it is saved or none
 * of it is, and a failed save uses no DC number.
 */
async function saveChallan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dcId: string | null,
  values: DcFormValues,
  scanIds: string[],
  lang: Lang
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("save_delivery_challan", {
    p_dc_id: dcId,
    p_request_key: dcId ? null : values.request_key,
    p_header: {
      customer_id: values.customer_id,
      dc_date: values.dc_date,
      customer_dc_number: values.customer_dc_number ?? [],
      customer_dc_date: (values.customer_dc_date ?? []).map((date) => date ?? ""),
      authorized_by: values.authorized_by ?? "",
    },
    p_items: values.items.map((item) => ({
      id: item.id ?? null,
      parent_item_id: item.parent_item_id ?? null,
      component: item.component,
      material: item.material,
      received_qty: item.received_qty,
      sent_qty: item.sent_qty,
      material_problem_qty: item.material_problem_qty,
      rejection_qty: item.rejection_qty,
    })),
    p_scan_ids: scanIds,
  });

  if (error) return { id: null, error: saveErrorMessage(error.message, error.code, lang) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.dc_id) {
    return { id: null, error: saveErrorMessage("The save returned no challan.", null, lang) };
  }
  return { id: row.dc_id, error: null };
}

/** Every screen that lists challans or scans reads what a save changes. */
function revalidateDcScreens(dcId?: string) {
  for (const path of [
    "/dashboard/dc",
    "/dashboard/dc/dispatched",
    "/dashboard/dc/scanned",
    "/dashboard/dc/history",
    "/dashboard/stock",
    "/dashboard/completed",
    "/dashboard",
  ]) {
    revalidatePath(path);
  }
  if (dcId) revalidatePath(`/dashboard/dc/${dcId}`);
}

export async function createDcAction(
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);
  const { lang, t } = await getTranslator();

  const problem = formProblems(t, values);
  if (problem) return { error: problem };

  // A continuation row legitimately sends more than it received, because it
  // received nothing: the pieces came in on the line it continues. So it is
  // checked against that line's remaining balance instead, read from the
  // database rather than from anything the browser sent.
  const tooMuch = await findOverContinued(t, values.items);
  if (tooMuch.length > 0) {
    return { error: t("dcErrors.overContinued", { lines: tooMuch.join("; ") }) };
  }

  const supabase = await createClient();
  const scanIds = (formData.getAll("used_scan_id") as string[]).filter((id) => UUID.test(id));

  // A continuation cites the same customer reference as the challan it
  // continues, because it is the same inward lot. Warning about that would
  // fire on every one of them and teach the operator to tick past it, which
  // would then hide a real duplicate. What protects this path instead is the
  // remaining-balance check.
  const isContinuation = values.items.some((item) => item.parent_item_id);

  if (!values.allow_duplicate && !isContinuation) {
    const clashes = await findExistingRefs(supabase, values.customer_id, values.customer_dc_number);
    if (clashes.length > 0) {
      const listed = clashes
        .map((c) => t("dcErrors.refOnDc", { ref: c.ref, dc: c.dcNumber }))
        .join(", ");
      return { error: null, duplicateWarning: t("dcErrors.duplicateWarning", { listed }) };
    }
  }

  // Saving issues the challan: it is created Active, so it appears under
  // Dispatched straight away. The scans that filled the form are converted in
  // the same transaction, and only if they are still pending.
  const { id, error } = await saveChallan(supabase, null, values, scanIds, lang);
  if (error || !id) return { error: error ?? saveErrorMessage(null, null, lang) };

  revalidateDcScreens(id);
  redirect(`/dashboard/dc/${id}`);
}

export async function updateDcAction(
  id: string,
  _prevState: DcFormState,
  formData: FormData
): Promise<DcFormState> {
  const values = parseDcForm(formData);
  const { lang, t } = await getTranslator();

  const problem = formProblems(t, values);
  if (problem) return { error: problem };

  const tooMuch = await findOverContinued(t, values.items, id);
  if (tooMuch.length > 0) {
    return { error: t("dcErrors.overContinued", { lines: tooMuch.join("; ") }) };
  }

  const supabase = await createClient();

  if (!values.allow_duplicate && !values.items.some((item) => item.parent_item_id)) {
    const clashes = await findExistingRefs(
      supabase,
      values.customer_id,
      values.customer_dc_number,
      id
    );
    if (clashes.length > 0) {
      const listed = clashes
        .map((c) => t("dcErrors.refOnDc", { ref: c.ref, dc: c.dcNumber }))
        .join(", ");
      return { error: null, duplicateWarning: t("dcErrors.duplicateWarning", { listed }) };
    }
  }

  // Lines keep their ids, so follow-ups raised against them stay attached. The
  // DC number and status are never touched by an edit.
  const { error } = await saveChallan(supabase, id, values, [], lang);
  if (error) return { error };

  revalidateDcScreens(id);
  redirect(`/dashboard/dc/${id}`);
}

/**
 * Move a challan between Draft and Active.
 *
 * New challans are saved Active, so this is for drafts saved before that, and
 * for reopening one. Completed is not offered: it is read off the item rows,
 * not stored. The caller names the lifecycle and storedStatusFor decides the
 * spelling, so the one place that knows about the old status names stays in
 * dc-lifecycle.
 */
export async function updateDcStatusAction(id: string, lifecycle: "draft" | "active") {
  const supabase = await createClient();

  // Confirming a follow-up is the moment its quantity starts to count against
  // the line it continues. Another follow-up may have been confirmed against
  // the same line since this one was drafted, so check it still fits.
  if (lifecycle === "active") {
    const chainRows = await fetchChainRows(supabase);
    if (chainRows.some((row) => row.dc_id === id && isContinuationLine(row))) {
      const before = remainingByLine(chainRows);
      const after = remainingByLine(
        chainRows.map((row) => (row.dc_id === id ? { ...row, draft: false } : row))
      );
      const pushedOver = [...after].filter(
        ([lineId, left]) => left < 0 && left < (before.get(lineId) ?? 0)
      );
      if (pushedOver.length > 0) {
        const { t } = await getTranslator();
        const named = pushedOver.map(([lineId, left]) => {
          const line = chainRows.find((row) => row.id === lineId);
          return t("dcErrors.overLine", {
            component: line?.component ?? t("dcErrors.aLine"),
            count: -left,
          });
        });
        throw new Error(t("dcErrors.confirmOver", { lines: named.join("; ") }));
      }
    }
  }

  const status = storedStatusFor(lifecycle);
  const { error } = await supabase.from("delivery_challans").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateDcScreens(id);
}

export async function deleteDcAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("delivery_challans").delete().eq("id", id);
  if (error) {
    // A line with weight/scrap recorded keeps its DC (0029). Returned rather
    // than thrown: a production build hides a thrown action's message.
    if (error.message.includes("WEIGHED_LINE_REMOVED")) {
      const { lang } = await getTranslator();
      return { error: saveErrorMessage(error.message, error.code, lang) };
    }
    throw new Error(error.message);
  }
  revalidateDcScreens();
  return { error: null };
}
