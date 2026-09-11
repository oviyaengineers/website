"use server";

import { createClient } from "@/lib/supabase/server";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { correctScannedDcRef } from "@/lib/dc-refs";
import { balanceQty, outwardTotal } from "@/lib/dc-balance";

// Read-only lookup used by the DC form: given a customer DC number or date,
// find the delivery challans already stored against it so the operator can see
// what was recorded before. Nothing here writes.

export type StoredDcItem = {
  component: string;
  material: string | null;
  received_qty: number;
  sent_qty: number;
  material_problem_qty: number;
  rejection_qty: number;
  total_qty: number;
};

export type StoredDcMatch = {
  id: string;
  dc_number: string;
  dc_date: string;
  status: string;
  customer_name: string | null;
  customer_dc_number: string[] | null;
  customer_dc_date: (string | null)[] | null;
  items: StoredDcItem[];
};

/**
 * Reconcile a scanned customer DC number against the ones already on file.
 *
 * Returns the stored spelling when the scan differs only by characters OCR
 * confuses, so the challan ends up carrying the reference as printed on the
 * customer's paper. Read-only.
 */
export async function correctScannedCustomerDcNumber(scanned: string): Promise<string | null> {
  const raw = scanned?.trim();
  if (!raw) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_challans")
    .select("customer_dc_number")
    .not("customer_dc_number", "is", null)
    .limit(500);
  if (error || !data) return null;

  const stored = data.flatMap((row) => row.customer_dc_number ?? []).filter(Boolean) as string[];
  return correctScannedDcRef(raw, stored);
}

/** A challan still holding pieces of one component. */
export type PendingComponentDc = {
  id: string;
  dc_number: string;
  dc_date: string;
  customer_name: string | null;
  customer_dc_number: string[] | null;
  material: string | null;
  received_qty: number;
  outward_qty: number;
  /** Received minus outward: how many pieces are still with us. */
  pending_qty: number;
};

/**
 * Challans that still owe pieces of a component back to the customer.
 *
 * "Pending" is the balance, not the status: every challan sits at draft, so a
 * status filter would list all of them. A row counts as pending while received
 * exceeds what has gone out as sent, material problem and rejection combined —
 * the same reckoning the balance page uses. Read-only.
 */
export async function findPendingDcsForComponent({
  component,
  excludeDcId,
}: {
  component?: string | null;
  excludeDcId?: string | null;
}): Promise<PendingComponentDc[]> {
  const wanted = component?.trim();
  if (!wanted) return [];

  const supabase = await createClient();

  // Matched by id where the part is on the master list, so a challan raised
  // before a rename is still found. The stored text is the fallback, for rows
  // written before migration 0018 and for a part the list no longer holds.
  const { data: listed } = await supabase
    .from("dc_picklist_items")
    .select("id")
    .eq("kind", "component")
    .ilike("name", wanted)
    .maybeSingle();

  let query = supabase
    .from("delivery_challan_items")
    .select(
      "dc_id, component, material, received_qty, sent_qty, material_problem_qty, rejection_qty"
    );
  // The value is quoted because an or() filter treats a comma as its own
  // separator, and part names carry spaces, slashes and hashes.
  const quoted = `"${wanted.replace(/"/g, '\\"')}"`;
  query = listed?.id
    ? query.or(`component_id.eq.${listed.id},component.eq.${quoted}`)
    : query.eq("component", wanted);

  let { data: items, error } = await query;

  // Before migration 0018 there is no component_id to match on. Falling back
  // to the name keeps this panel working rather than emptying it, which would
  // read as "nothing outstanding" and be worse than a stale spelling.
  if (error?.code === "42703" || error?.code === "PGRST204") {
    const byName = await supabase
      .from("delivery_challan_items")
      .select(
        "dc_id, component, material, received_qty, sent_qty, material_problem_qty, rejection_qty"
      )
      .eq("component", wanted);
    items = byName.data;
    error = byName.error;
  }

  if (error || !items || items.length === 0) return [];

  const outstanding = items
    .map((item) => ({
      ...item,
      outward: outwardTotal(item),
      pending: balanceQty(item),
    }))
    .filter((item) => item.pending > 0 && item.dc_id !== excludeDcId);
  if (outstanding.length === 0) return [];

  const dcIds = [...new Set(outstanding.map((i) => i.dc_id))];
  const { data: dcs } = await supabase
    .from("delivery_challans")
    .select("id, dc_number, dc_date, customer_id, customer_dc_number")
    .in("id", dcIds)
    .order("dc_date", { ascending: false });
  if (!dcs || dcs.length === 0) return [];

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .in("id", [...new Set(dcs.map((d) => d.customer_id))]);
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // Ordered by the challans, so the newest challan is listed first.
  return dcs.flatMap((dc) =>
    outstanding
      .filter((item) => item.dc_id === dc.id)
      .map((item) => ({
        id: dc.id,
        dc_number: dc.dc_number,
        dc_date: dc.dc_date,
        customer_name: nameById.get(dc.customer_id) ?? null,
        customer_dc_number: dc.customer_dc_number,
        material: item.material,
        received_qty: item.received_qty,
        outward_qty: item.outward,
        pending_qty: item.pending,
      }))
  );
}

/** One stored customer DC reference, with the challan it belongs to. */
export type CustomerDcRefOption = {
  number: string;
  date: string | null;
  match: StoredDcMatch;
};

/**
 * List the customer DC references already on file for a customer, optionally
 * narrowed to one customer DC date.
 *
 * Used by the new-DC form to offer the numbers that actually exist for the
 * selected customer instead of leaving the operator to recall them. Read-only.
 */
export async function findCustomerDcRefs({
  customerId,
  date,
  excludeDcId,
}: {
  customerId?: string | null;
  date?: string | null;
  excludeDcId?: string | null;
}): Promise<CustomerDcRefOption[]> {
  if (!customerId) return [];

  const supabase = await createClient();

  let query = supabase
    .from("delivery_challans")
    .select("id, dc_number, dc_date, status, customer_id, customer_dc_number, customer_dc_date")
    .eq("customer_id", customerId)
    .order("dc_date", { ascending: false })
    .limit(50);
  if (excludeDcId) query = query.neq("id", excludeDcId);

  const { data: dcs, error } = await query;
  if (error || !dcs || dcs.length === 0) return [];

  const [{ data: items }, { data: customer }, { data: picklist }] = await Promise.all([
    supabase
      .from("delivery_challan_items")
      .select("*")
      .in(
        "dc_id",
        dcs.map((d) => d.id)
      )
      .order("sort_order"),
    supabase.from("customers").select("id, name").eq("id", customerId).single(),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);

  // Names handed to the new-DC form come from the master list, because the
  // form binds them to a dropdown built from that same list.
  const componentNames = componentNameIndex(picklist ?? []);
  const wanted = date?.trim() || null;
  const options: CustomerDcRefOption[] = [];
  const seen = new Set<string>();

  for (const dc of dcs) {
    const match: StoredDcMatch = {
      id: dc.id,
      dc_number: dc.dc_number,
      dc_date: dc.dc_date,
      status: dc.status,
      customer_name: customer?.name ?? null,
      customer_dc_number: dc.customer_dc_number,
      customer_dc_date: dc.customer_dc_date,
      items: (items ?? [])
        .filter((i) => i.dc_id === dc.id)
        .map((i) => ({
          component: componentNameOf(i, componentNames),
          material: i.material,
          received_qty: i.received_qty,
          sent_qty: i.sent_qty,
          material_problem_qty: i.material_problem_qty,
          rejection_qty: i.rejection_qty,
          total_qty: i.total_qty,
        })),
    };

    // The two columns are parallel arrays: entry i of one pairs with entry i
    // of the other.
    (dc.customer_dc_number ?? []).forEach((num, i) => {
      const refNumber = (num ?? "").trim();
      if (!refNumber) return;
      const refDate = dc.customer_dc_date?.[i] ?? null;
      if (wanted && refDate !== wanted) return;

      const key = `${refNumber}|${refDate}|${dc.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ number: refNumber, date: refDate, match });
    });
  }

  return options;
}

/**
 * Find stored DCs whose customer reference exactly matches.
 *
 * Both columns are Postgres arrays (a challan can cite several customer DC
 * numbers), so "exact match" means the array contains the value — not a
 * partial or fuzzy match. When both a number and a date are given, a challan
 * has to carry both to qualify.
 */
export async function findDcsByCustomerRef({
  number,
  date,
  excludeDcId,
}: {
  number?: string | null;
  date?: string | null;
  excludeDcId?: string | null;
}): Promise<StoredDcMatch[]> {
  const trimmedNumber = number?.trim() || null;
  const trimmedDate = date?.trim() || null;
  if (!trimmedNumber && !trimmedDate) return [];

  const supabase = await createClient();

  let query = supabase
    .from("delivery_challans")
    .select("id, dc_number, dc_date, status, customer_id, customer_dc_number, customer_dc_date")
    .order("dc_date", { ascending: false })
    .limit(10);

  if (trimmedNumber) query = query.contains("customer_dc_number", [trimmedNumber]);
  if (trimmedDate) query = query.contains("customer_dc_date", [trimmedDate]);
  // Editing a challan should not list the challan being edited.
  if (excludeDcId) query = query.neq("id", excludeDcId);

  const { data: dcs, error } = await query;
  if (error || !dcs || dcs.length === 0) return [];

  const dcIds = dcs.map((d) => d.id);
  const customerIds = [...new Set(dcs.map((d) => d.customer_id))];

  const [{ data: items }, { data: customers }, { data: picklist }] = await Promise.all([
    supabase.from("delivery_challan_items").select("*").in("dc_id", dcIds).order("sort_order"),
    supabase.from("customers").select("id, name").in("id", customerIds),
    supabase.from("dc_picklist_items").select("id, name, kind").eq("kind", "component"),
  ]);

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  // Copying a stored challan into a new one fills a dropdown bound to the
  // master list, so the name handed over has to be the list's current one or
  // the row arrives with nothing selected.
  const componentNames = componentNameIndex(picklist ?? []);

  return dcs.map((dc) => ({
    id: dc.id,
    dc_number: dc.dc_number,
    dc_date: dc.dc_date,
    status: dc.status,
    customer_name: nameById.get(dc.customer_id) ?? null,
    customer_dc_number: dc.customer_dc_number,
    customer_dc_date: dc.customer_dc_date,
    items: (items ?? [])
      .filter((i) => i.dc_id === dc.id)
      .map((i) => ({
        component: componentNameOf(i, componentNames),
        material: i.material,
        received_qty: i.received_qty,
        sent_qty: i.sent_qty,
        material_problem_qty: i.material_problem_qty,
        rejection_qty: i.rejection_qty,
        total_qty: i.total_qty,
      })),
  }));
}
