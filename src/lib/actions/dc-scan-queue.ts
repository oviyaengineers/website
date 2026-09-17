"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTranslator } from "@/lib/i18n/server";
import type { DcScanResult, ScannedItemSelection } from "@/components/dc-scan-dialog";

// Customer DCs read from a photograph, before they are anything of ours.
//
// A scanned challan is an input record. It says what the customer sent in and
// when, and it sits here until the work is done and somebody raises our
// delivery challan from it. Scanning issues no DC number and creates no
// challan; that happens only when the operator saves one.
//
// Three things are kept for each scan, and kept apart:
//   - the original photograph, in the private dc-scans bucket, never changed;
//   - what OCR read: its raw text and the values as first read;
//   - the working values (customer, reference, date, items), which are what
//     the operator corrects and what our challan is filled from.

export type ScannedDcStatus = "pending" | "converted" | "discarded";

/** The bucket holding original scan photographs (migration 0022). */
const SCAN_BUCKET = "dc-scans";

/** A scanned customer DC, with what became of it. */
export type ScannedDc = {
  id: string;
  status: ScannedDcStatus;
  scannedAt: string;
  convertedAt: string | null;
  /** Our challan, once one has been raised from this scan. */
  dcId: string | null;
  dcNumber: string | null;
  /** Where the original photograph is stored, or null for scans kept before 0022. */
  imagePath: string | null;
  /** The prepared image OCR read (0032), kept apart from the original. */
  processedImagePath: string | null;
  /** The raw text OCR returned. */
  ocrText: string | null;
  /** The values as OCR first read them, before any correction. */
  ocrResult: DcScanResult | null;
  /** When the working values were last corrected by hand. */
  correctedAt: string | null;
} & DcScanResult;

/** What the scanner hands over when a scan is kept. */
export type ScanCapture = DcScanResult & {
  imagePath?: string | null;
  processedImagePath?: string | null;
  ocrText?: string | null;
  ocrResult?: DcScanResult | null;
};

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
  image_path?: string | null;
  processed_image_path?: string | null;
  ocr_text?: string | null;
  ocr_result?: unknown;
  corrected_at?: string | null;
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
    imagePath: row.image_path ?? null,
    processedImagePath: row.processed_image_path ?? null,
    ocrText: row.ocr_text ?? null,
    ocrResult:
      row.ocr_result && typeof row.ocr_result === "object"
        ? (row.ocr_result as DcScanResult)
        : null,
    correctedAt: row.corrected_at ?? null,
    customerId: row.customer_id,
    customerDcNumber: row.customer_dc_number,
    customerDcDate: row.customer_dc_date,
    items: Array.isArray(row.items) ? (row.items as ScannedItemSelection[]) : [],
  };
}

const SELECT = "*, delivery_challans(dc_number)";

/**
 * Component names that are not in Settings → Components & Materials.
 *
 * A scan may only name parts from the master list. A misread name is left
 * blank for the operator to pick, never stored as a part of its own.
 */
async function unlistedComponents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: ScannedItemSelection[]
): Promise<string[]> {
  const named = items.map((item) => item.component?.trim()).filter(Boolean) as string[];
  if (named.length === 0) return [];
  const { data } = await supabase.from("dc_picklist_items").select("name").eq("kind", "component");
  const listed = new Set((data ?? []).map((row) => row.name.trim().toLowerCase()));
  return [...new Set(named.filter((name) => !listed.has(name.toLowerCase())))];
}

function cleanItems(items: ScannedItemSelection[]): ScannedItemSelection[] {
  return items.map((item) => ({
    component: item.component?.trim() ?? "",
    material: item.material?.trim() || null,
    received_qty: Math.max(0, Number(item.received_qty) || 0),
  }));
}

/** Adds a scanned customer DC. It is pending: no challan, no number, yet. */
export async function queuePendingScan(
  scan: ScanCapture
): Promise<{ id: string | null; waiting: number; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { t } = await getTranslator();
    return { id: null, waiting: 0, error: t("dcErrors.signedOutScan") };
  }

  const items = cleanItems(scan.items);
  const unlisted = await unlistedComponents(supabase, items);
  if (unlisted.length > 0) {
    return {
      id: null,
      waiting: 0,
      error: (await getTranslator()).t("dcErrors.notInSettings", { names: unlisted.join(", ") }),
    };
  }

  const { data, error } = await supabase
    .from("pending_dc_scans")
    .insert({
      customer_id: scan.customerId,
      customer_dc_number: scan.customerDcNumber,
      customer_dc_date: scan.customerDcDate,
      items,
      image_path: scan.imagePath ?? null,
      ...(scan.processedImagePath ? { processed_image_path: scan.processedImagePath } : {}),
      ocr_text: scan.ocrText ?? null,
      ocr_result: scan.ocrResult ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { id: null, waiting: 0, error: error.message };

  revalidatePath("/dashboard/dc/scanned");
  revalidatePath("/dashboard/dc/history");
  return { id: data?.id ?? null, waiting: await countPendingScans(), error: null };
}

async function listByStatus(
  status: ScannedDcStatus,
  order: { column: string; ascending: boolean }
): Promise<ScannedDc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pending_dc_scans")
    .select(SELECT)
    .eq("status", status)
    .order(order.column, { ascending: order.ascending });
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toScannedDc);
}

/**
 * Everything still waiting for work to finish, oldest first.
 *
 * Oldest first because that is the order the work came in, and a challan
 * waiting three weeks should not sit below one scanned this morning.
 */
export async function listPendingScans(): Promise<ScannedDc[]> {
  return listByStatus("pending", { column: "created_at", ascending: true });
}

/** Scans already turned into one of our challans, most recent first. */
export async function listConvertedScans(): Promise<ScannedDc[]> {
  return listByStatus("converted", { column: "converted_at", ascending: false });
}

/** Scans set aside, most recent first. Kept, so what was seen can be traced. */
export async function listDiscardedScans(): Promise<ScannedDc[]> {
  return listByStatus("discarded", { column: "created_at", ascending: false });
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

/**
 * A short-lived link to a scan's original photograph.
 *
 * Signed with the viewer's own session, so only a signed-in user can get one,
 * and it expires after ten minutes.
 */
export async function getScanImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(SCAN_BUCKET).createSignedUrl(path, 600);
  if (error || !data) return null;
  return data.signedUrl;
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
 * Only the working values change. The photograph and what OCR read stay as
 * they were, so a correction can always be checked against the paper. A scan
 * already converted is left alone: its figures are on a challan now, and that
 * is where they are edited.
 */
export async function updateScannedDc(
  id: string,
  patch: {
    customerId?: string | null;
    customerDcNumber?: string | null;
    customerDcDate?: string | null;
    items?: ScannedItemSelection[];
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const items = patch.items !== undefined ? cleanItems(patch.items) : undefined;
  if (items) {
    const unlisted = await unlistedComponents(supabase, items);
    if (unlisted.length > 0) {
      return {
        error: (await getTranslator()).t("dcErrors.notInSettingsList", {
          names: unlisted.join(", "),
        }),
      };
    }
  }

  const { data, error } = await supabase
    .from("pending_dc_scans")
    .update({
      ...(patch.customerId !== undefined ? { customer_id: patch.customerId || null } : {}),
      ...(patch.customerDcNumber !== undefined
        ? { customer_dc_number: patch.customerDcNumber?.trim() || null }
        : {}),
      ...(patch.customerDcDate !== undefined
        ? { customer_dc_date: patch.customerDcDate || null }
        : {}),
      ...(items !== undefined ? { items } : {}),
      corrected_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    const { t } = await getTranslator();
    return { error: t("dcErrors.correctionsNotSaved", { error: error.message }) };
  }
  if (!data || data.length === 0) {
    return { error: (await getTranslator()).t("dcErrors.scanNoLongerPending") };
  }

  revalidatePath("/dashboard/dc/scanned");
  revalidatePath(`/dashboard/dc/scanned/${id}`);
  revalidatePath("/dashboard/dc/history");
  return { error: null };
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
  revalidatePath("/dashboard/dc/history");
  return { removed: data?.length ?? 0, error: null };
}
