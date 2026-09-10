import type { DcScanResult } from "@/components/dc-scan-dialog";

// Carries reviewed scans from the header scanner to the new-DC form.
//
// A queue rather than a single value: several inward challans are often
// photographed in one go, and each one adds its references and items to the
// same new challan. sessionStorage rather than a query string, because the
// payload includes item rows.
//
// The queue survives until a challan is actually saved. Reading it used to
// empty it, so opening the new-DC form and leaving without saving destroyed
// the scans — the form had them on screen, but nothing had been recorded.

const KEY = "oviya:pending-dc-scans";

/** A queued scan and the id the form uses to apply it exactly once. */
export type PendingScan = { id: string; scan: DcScanResult };

/** Fired when a scan is queued, so an open new-DC form can pick it up. */
export const PENDING_SCAN_EVENT = "oviya:dc-scan-stored";

/**
 * Fired whenever the queue length changes, in either direction.
 *
 * Deliberately separate from PENDING_SCAN_EVENT: the new-DC form applies
 * scans in response to that one, so reusing it to announce a change would
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

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function read(): PendingScan[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerates an entry written before ids existed, so a queue held across a
    // deploy is applied rather than dropped.
    return parsed.map((entry) =>
      entry && typeof entry === "object" && "scan" in entry
        ? (entry as PendingScan)
        : { id: newId(), scan: entry as DcScanResult }
    );
  } catch {
    return [];
  }
}

function write(entries: PendingScan[]) {
  sessionStorage.setItem(KEY, JSON.stringify(entries));
}

/**
 * Appends a scan to the queue. Returns how many are now waiting, or 0 when the
 * scan could not be held at all — the caller must say so rather than reporting
 * a capture that will never arrive.
 */
export function storePendingScan(result: DcScanResult): number {
  try {
    const queued = [...read(), { id: newId(), scan: result }];
    write(queued);
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

/** Everything queued, left in place. The form applies these without consuming. */
export function peekPendingScans(): PendingScan[] {
  return read();
}

/**
 * Removes the queue and hands it back, for the caller to hold while a challan
 * is being saved. A save that fails puts it back via restorePendingScans.
 */
export function takePendingScans(): PendingScan[] {
  const queued = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  if (queued.length > 0) announceChange();
  return queued;
}

/** Puts a held queue back after a save failed. */
export function restorePendingScans(entries: PendingScan[]) {
  if (entries.length === 0) return;
  try {
    // Anything scanned while the save was in flight keeps its place at the end.
    write([...entries, ...read()]);
    announceChange();
  } catch {
    // Storage refused it; the operator still has the rows on the form.
  }
}
