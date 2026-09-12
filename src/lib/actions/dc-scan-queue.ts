"use server";

import { createClient } from "@/lib/supabase/server";
import type { DcScanResult, ScannedItemSelection } from "@/components/dc-scan-dialog";

// The queue of reviewed scans waiting to fill a delivery challan.
//
// Held on the server so a challan photographed on the phone can be entered at
// the desk. In the browser it never crossed devices, and before that it did not
// survive closing the tab.

export type PendingScan = { id: string; scannedAt: string } & DcScanResult;

/** Adds a reviewed scan. Returns how many are now waiting, or an error. */
export async function queuePendingScan(
  scan: DcScanResult
): Promise<{ id: string | null; waiting: number; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("pending_dc_scans")
    .insert({
      customer_id: scan.customerId,
      customer_dc_number: scan.customerDcNumber,
      customer_dc_date: scan.customerDcDate,
      items: scan.items,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { id: null, waiting: 0, error: error.message };

  return { id: data?.id ?? null, waiting: await countPendingScans(), error: null };
}

/** Everything waiting, oldest first, so several scans apply in the order taken. */
export async function listPendingScans(): Promise<PendingScan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    scannedAt: row.created_at,
    customerId: row.customer_id,
    customerDcNumber: row.customer_dc_number,
    customerDcDate: row.customer_dc_date,
    items: Array.isArray(row.items) ? (row.items as ScannedItemSelection[]) : [],
  }));
}

export async function countPendingScans(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pending_dc_scans")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

/**
 * Removes waiting scans: the given ones, or all of them.
 *
 * Called when a challan is saved, and from the scanner when the operator
 * decides the queue is stale.
 */
export async function discardPendingScans(
  ids?: string[]
): Promise<{ removed: number; error: string | null }> {
  const supabase = await createClient();
  const query = supabase.from("pending_dc_scans").delete();
  const { data, error } = ids?.length
    ? await query.in("id", ids).select("id")
    : await query.not("id", "is", null).select("id");

  if (error) return { removed: 0, error: error.message };
  return { removed: data?.length ?? 0, error: null };
}
