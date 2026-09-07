"use client";

import { toast } from "sonner";
import { DcScanDialog, type DcScanResult } from "@/components/dc-scan-dialog";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import { PENDING_SCAN_EVENT, storePendingScan } from "@/lib/dc-scan-handoff";

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
  function handleApply(result: DcScanResult) {
    const queued = storePendingScan(result);

    // An open new-DC form drains the queue at once; otherwise it waits there.
    window.dispatchEvent(new Event(PENDING_SCAN_EVENT));

    toast.success(
      queued > 1
        ? `${queued} challans captured. They will fill the next new delivery challan.`
        : "Challan captured. It will fill the next new delivery challan."
    );
  }

  return (
    <DcScanDialog
      compact
      customers={customers}
      components={components}
      materials={materials}
      onApply={handleApply}
    />
  );
}
