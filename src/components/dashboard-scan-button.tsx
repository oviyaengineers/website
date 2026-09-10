"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { DcScanDialog, type DcScanResult } from "@/components/dc-scan-dialog";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import {
  countPendingScans,
  PENDING_SCAN_CHANGED,
  PENDING_SCAN_EVENT,
  storePendingScan,
} from "@/lib/dc-scan-handoff";

function subscribeToQueue(onChange: () => void) {
  window.addEventListener(PENDING_SCAN_CHANGED, onChange);
  // Another tab of the same site changing storage does not fire our own event.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PENDING_SCAN_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Scan action in the dashboard header, so an inward challan can be
 * photographed from any page at any moment.
 *
 * Scanning never navigates: several challans are often photographed in a row,
 * and the operator may not be ready to raise the DC yet. Each reviewed scan
 * joins a queue that the new-DC form drains when it is next opened — or picks
 * up immediately, via the event, if it is already open.
 */
export function DashboardScanButton({
  customers,
  components,
  materials,
}: {
  customers: ComboboxCustomer[];
  components: string[];
  materials: string[];
}) {
  // The queue is invisible otherwise, which left no way to tell a scan that is
  // waiting from one that was never held. The server snapshot is 0 so the
  // first client render matches.
  const pending = useSyncExternalStore(
    subscribeToQueue,
    () => countPendingScans(),
    () => 0
  );

  function handleApply(result: DcScanResult) {
    const queued = storePendingScan(result);

    if (queued === 0) {
      // Storage refused the write, so nothing will reach the form. Saying
      // "captured" here would lose the challan silently.
      toast.error(
        "This challan could not be held for the delivery challan form. Enter it by hand, or try again outside private browsing."
      );
      return;
    }

    // An open new-DC form drains the queue at once; otherwise it waits there.
    window.dispatchEvent(new Event(PENDING_SCAN_EVENT));

    toast.success(
      queued > 1
        ? `${queued} challans captured. They will fill the next new delivery challan.`
        : "Challan captured. It will fill the next new delivery challan."
    );
  }

  return (
    <div className="relative">
      <DcScanDialog
        compact
        customers={customers}
        components={components}
        materials={materials}
        onApply={handleApply}
      />
      {pending > 0 && (
        <span
          // pointer-events-none so the badge never swallows a tap meant for
          // the button underneath it.
          className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#10233f] px-1 text-[11px] font-semibold text-white shadow ring-2 ring-background"
          aria-label={`${pending} scanned challan${pending === 1 ? "" : "s"} waiting for a delivery challan`}
        >
          {pending}
        </span>
      )}
    </div>
  );
}
