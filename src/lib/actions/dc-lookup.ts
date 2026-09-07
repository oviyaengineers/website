"use server";

import { createClient } from "@/lib/supabase/server";
import { correctScannedDcRef } from "@/lib/dc-refs";

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

  const [{ data: items }, { data: customer }] = await Promise.all([
    supabase
      .from("delivery_challan_items")
      .select("*")
      .in("dc_id", dcs.map((d) => d.id))
      .order("sort_order"),
    supabase.from("customers").select("id, name").eq("id", customerId).single(),
  ]);

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
          component: i.component,
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

  const [{ data: items }, { data: customers }] = await Promise.all([
    supabase
      .from("delivery_challan_items")
      .select("*")
      .in("dc_id", dcIds)
      .order("sort_order"),
    supabase.from("customers").select("id, name").in("id", customerIds),
  ]);

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

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
        component: i.component,
        material: i.material,
        received_qty: i.received_qty,
        sent_qty: i.sent_qty,
        material_problem_qty: i.material_problem_qty,
        rejection_qty: i.rejection_qty,
        total_qty: i.total_qty,
      })),
  }));
}
