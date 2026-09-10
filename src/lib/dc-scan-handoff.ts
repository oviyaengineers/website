import type { DcScanResult } from "@/components/dc-scan-dialog";

// Carries reviewed scans from the header scanner to the new-DC form.
//
// A queue rather than a single value: several inward challans are often
// photographed in one go, and each one adds its references and items to the
// same new challan. Stored rather than passed in a query string, because the
// payload includes item rows.
//
// localStorage, not sessionStorage. The queue has to outlive the tab: challans
// get photographed on the shop floor and the challan is raised later, and with
// session storage closing the tab in between silently threw the scans away —
// which happened repeatedly in practice. It still outlives the new-DC form too:
// reading it does not empty it, so opening the form and leaving without saving
// no longer destroys them.
//
// The trade-off is that nothing clears them automatically any more, so a scan
// that is never used would linger. Hence the expiry below, and the count on the
// scan button so the queue is never invisible.

const KEY = "oviya:pending-dc-scans";

/** How long an unused scan is kept before it is treated as abandoned. */
const KEEP_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/** A queued scan, when it was taken, and the id used to apply it exactly once. */
export type PendingScan = { id: string; scan: DcScanResult; storedAt?: number };

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
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerates an entry written before ids existed, so a queue held across a
    // deploy is applied rather than dropped.
    const entries: PendingScan[] = parsed.map((entry) =>
      entry && typeof entry === "object" && "scan" in entry
        ? (entry as PendingScan)
        : { id: newId(), scan: entry as DcScanResult }
    );

    // Now that the queue outlives the tab, a scan nobody used would sit there
    // for good and keep filling every new challan. Anything older than a week
    // is treated as abandoned. An entry written before stamps existed has no
    // date and is kept, since guessing its age would be worse.
    const cutoff = Date.now() - KEEP_FOR_MS;
    const live = entries.filter((entry) => !entry.storedAt || entry.storedAt >= cutoff);
    if (live.length !== entries.length) write(live);
    return live;
  } catch {
    return [];
  }
}

function write(entries: PendingScan[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/**
 * Appends a scan to the queue. Returns how many are now waiting, or 0 when the
 * scan could not be held at all — the caller must say so rather than reporting
 * a capture that will never arrive.
 */
export function storePendingScan(result: DcScanResult): number {
  try {
    const queued = [...read(), { id: newId(), scan: result, storedAt: Date.now() }];
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
    localStorage.removeItem(KEY);
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
