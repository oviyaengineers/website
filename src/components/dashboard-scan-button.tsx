"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DcScanDialog, type DcScanResult } from "@/components/dc-scan-dialog";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import { countPendingScans, queuePendingScan } from "@/lib/actions/dc-scan-queue";
import { PENDING_SCAN_CHANGED, PENDING_SCAN_EVENT } from "@/lib/dc-scan-handoff";

/**
 * Scan action in the dashboard header, so an inward challan can be
 * photographed from any page at any moment.
 *
 * Scanning never navigates: several challans are often photographed in a row,
 * and the operator may not be ready to raise the DC yet. Each reviewed scan
 * joins a queue held on the server, so a challan photographed on the phone can
 * be entered at the desk. The new-DC form drains that queue when it opens, or
 * picks a scan up immediately, via the event, if it is already open.
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
  // The queue is invisible otherwise, which leaves no way to tell a scan that
  // is waiting from one that was never held. Refreshed when the window regains
  // focus as well, since that is when another device's scan is most likely to
  // have arrived.
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void countPendingScans()
        .then((count) => {
          if (!cancelled) setPending(count);
        })
        .catch(() => {});
    };
    const raf = requestAnimationFrame(refresh);
    window.addEventListener(PENDING_SCAN_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener(PENDING_SCAN_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function handleApply(result: DcScanResult): Promise<boolean> {
    const { waiting, error } = await queuePendingScan(result);

    if (error) {
      // Saying "captured" here would lose the challan silently.
      toast.error(
        "This challan could not be held for the delivery challan form. Enter it by hand, or try again."
      );
      return false;
    }

    // Tells an open new-DC form to pick it up, and refreshes the count here.
    window.dispatchEvent(new Event(PENDING_SCAN_EVENT));
    window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));

    toast.success(
      waiting > 1
        ? `${waiting} challans are waiting under Scanned DCs.`
        : "Challan captured. It is waiting under Scanned DCs."
    );
    return true;
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
          aria-label={`${pending} scanned challan${pending === 1 ? "" : "s"} not yet saved to a delivery challan`}
          title={`${pending} scanned challan${pending === 1 ? "" : "s"} not yet saved`}
        >
          {pending}
        </span>
      )}
    </div>
  );
}
