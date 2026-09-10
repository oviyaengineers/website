// Events that keep the scanner, the header badge and the new-DC form in step.
//
// The queue itself lives on the server — see src/lib/actions/dc-scan-queue.ts.
// It was held in the browser twice before: sessionStorage, which died with the
// tab, then localStorage, which survived that but never left the device.
// Challans are photographed on the shop floor and the delivery challan is
// raised at a desk, so the scan has to travel between devices to be any use.
//
// What has to stay in the browser is the nudge: a scan queued in this tab
// should reach a new-DC form already open in it, without waiting for a poll.

/** Fired when a scan is queued, so an open new-DC form can pick it up. */
export const PENDING_SCAN_EVENT = "oviya:dc-scan-stored";

/**
 * Fired whenever the queue length changes, in either direction.
 *
 * Deliberately separate from PENDING_SCAN_EVENT: the new-DC form applies scans
 * in response to that one, so reusing it to announce a change would re-enter
 * the form's own handler.
 */
export const PENDING_SCAN_CHANGED = "oviya:dc-scan-queue-changed";
