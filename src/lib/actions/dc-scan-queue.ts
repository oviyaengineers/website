"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DcScanResult, ScannedItemSelection } from "@/components/dc-scan-dialog";

// Customer DCs read from a photograph, before they are anything of ours.
//
// A scanned challan is an input record. It says what the customer sent in and
// when, and it sits here until the work is done and somebody raises our
// delivery challan from it. Scanning issues no DC number and creates no
// challan; that happens only when the operator asks for it.
//
// Held on the server so a challan photographed on the shop floor is here when
// the desk opens the list, and so the link between the customer's paper and
// our challan survives.

export type ScannedDcStatus = "pending" | "converted" | "discarded";

/** A scanned customer DC, with what became of it. */
export type ScannedDc = {
  id: string;
  status: ScannedDcStatus;
  scannedAt: string;
  convertedAt: string | null;
  /** Our challan, once one has been raised from this scan. */
  dcId: string | null;
  dcNumber: string | null;
} & DcScanResult;

type Row = {
  id: string;
  customer_id: string | null;
  customer_dc_number: string | null;
  customer_dc_date: string | null;
  items: unknown;
  status: string;
  created_at: string;
  converted_at: string | null;
  dc_id: string | null;
  delivery_challans?: { dc_number: string } | { dc_number: string }[] | null;
};

function toScannedDc(row: Row): ScannedDc {
  const joined = Array.isArray(row.delivery_challans)
    ? row.delivery_challans[0]
    : row.delivery_challans;
  return {
    id: row.id,
    status: (row.status as ScannedDcStatus) ?? "pending",
    scannedAt: row.created_at,
    convertedAt: row.converted_at,
    dcId: row.dc_id,
    dcNumber: joined?.dc_number ?? null,
    customerId: row.customer_id,
    customerDcNumber: row.customer_dc_number,
    customerDcDate: row.customer_dc_date,
    items: Array.isArray(row.items) ? (row.items as ScannedItemSelection[]) : [],
  };
}

const SELECT = "*, delivery_challans(dc_number)";

/** Adds a scanned customer DC. It is pending: no challan, no number, yet. */
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

  revalidatePath("/dashboard/dc/scanned");
  return { id: data?.id ?? null, waiting: await countPendingScans(), error: null };
}

/**
 * Everything still waiting for work to finish, oldest first.
 *
 * Oldest first because that is the order the work came in, and a challan
 * waiting three weeks should not sit below one scanned this morning.
 */
export async function listPendingScans(): Promise<ScannedDc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .select(SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toScannedDc);
}

/** Scans already turned into one of our challans, most recent first. */
export async function listConvertedScans(limit = 20): Promise<ScannedDc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .select(SELECT)
    .eq("status", "converted")
    .order("converted_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toScannedDc);
}

/** One scanned customer DC, whatever its status. */
export async function getScannedDc(id: string): Promise<ScannedDc | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return toScannedDc(data as unknown as Row);
}

/** How many customer DCs are waiting. Drives the count on the scan button. */
export async function countPendingScans(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pending_dc_scans")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

/**
 * Corrections to a scan before a challan is raised from it.
 *
 * OCR gets a digit wrong often enough that this is the difference between
 * fixing a reference and re-photographing the challan. A scan already
 * converted is left alone: its figures are on a challan now, and that is
 * where they are edited.
 */
export async function updateScannedDc(
  id: string,
  patch: {
    customerDcNumber?: string | null;
    customerDcDate?: string | null;
    items?: ScannedItemSelection[];
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .update({
      ...(patch.customerDcNumber !== undefined
        ? { customer_dc_number: patch.customerDcNumber || null }
        : {}),
      ...(patch.customerDcDate !== undefined
        ? { customer_dc_date: patch.customerDcDate || null }
        : {}),
      ...(patch.items !== undefined ? { items: patch.items } : {}),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That scan is no longer pending, so it cannot be edited." };
  }

  revalidatePath("/dashboard/dc/scanned");
  revalidatePath(`/dashboard/dc/scanned/${id}`);
  return { error: null };
}

/**
 * Marks scans as converted and records the challan they produced.
 *
 * Only scans that are still pending are moved, and the caller is told how
 * many were. That is what stops a second click, or a resubmitted form, from
 * raising a second challan for the same customer DC.
 */
export async function markScansConverted(
  ids: string[],
  dcId: string
): Promise<{ converted: number; error: string | null }> {
  if (ids.length === 0) return { converted: 0, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .update({ status: "converted", dc_id: dcId, converted_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending")
    .select("id");

  if (error) return { converted: 0, error: error.message };
  revalidatePath("/dashboard/dc/scanned");
  return { converted: data?.length ?? 0, error: null };
}

/**
 * Sets scans aside without deleting them.
 *
 * A discarded scan is still a record that the customer's paper was seen, so
 * it is marked rather than removed; it simply stops appearing in the list of
 * work waiting.
 */
export async function discardPendingScans(
  ids?: string[]
): Promise<{ removed: number; error: string | null }> {
  const supabase = await createClient();
  const query = supabase
    .from("pending_dc_scans")
    .update({ status: "discarded" })
    .eq("status", "pending");

  const { data, error } = ids?.length
    ? await query.in("id", ids).select("id")
    : await query.not("id", "is", null).select("id");

  if (error) return { removed: 0, error: error.message };
  revalidatePath("/dashboard/dc/scanned");
  return { removed: data?.length ?? 0, error: null };
}
