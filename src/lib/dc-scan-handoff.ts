import type { DcScanResult } from "@/components/dc-scan-dialog";

// Carries reviewed scans from the header scanner to the new-DC form.
//
// A queue rather than a single value: several inward challans are often
// photographed in one go, and each one adds its references and items to the
// same new challan. sessionStorage rather than a query string, because the
// payload includes item rows.

const KEY = "oviya:pending-dc-scans";

/** Fired when a scan is queued, so an open new-DC form can pick it up. */
export const PENDING_SCAN_EVENT = "oviya:dc-scan-stored";

function read(): DcScanResult[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DcScanResult[]) : [];
  } catch {
    return [];
  }
}

/** Appends a scan to the queue. Returns how many are now waiting. */
export function storePendingScan(result: DcScanResult): number {
  try {
    const queued = [...read(), result];
    sessionStorage.setItem(KEY, JSON.stringify(queued));
    return queued.length;
  } catch {
    // Private-mode or storage-disabled browsers just lose the handoff.
    return 0;
  }
}

export function countPendingScans(): number {
  return read().length;
}

/** Returns every queued scan and clears them, so each is applied once. */
export function takePendingScans(): DcScanResult[] {
  const queued = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return queued;
}
