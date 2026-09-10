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

/**
 * Fired whenever the queue length changes, in either direction.
 *
 * Deliberately separate from PENDING_SCAN_EVENT: the new-DC form drains the
 * queue in response to that one, so reusing it to announce the drain would
 * re-enter the form's own handler.
 */
export const PENDING_SCAN_CHANGED = "oviya:dc-scan-queue-changed";

function announceChange() {
  try {
    window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
  } catch {
    // No window (server render); nothing is listening anyway.
  }
}

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

/**
 * Appends a scan to the queue. Returns how many are now waiting, or 0 when the
 * scan could not be held at all — the caller must say so rather than reporting
 * a capture that will never arrive.
 */
export function storePendingScan(result: DcScanResult): number {
  try {
    const queued = [...read(), result];
    sessionStorage.setItem(KEY, JSON.stringify(queued));
    announceChange();
    return queued.length;
  } catch {
    // Private-mode or storage-disabled browsers cannot hold the handoff.
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
  if (queued.length > 0) announceChange();
  return queued;
}
