"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { DcScanDialog, type DcScanResult } from "@/components/dc-scan-dialog";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import { PENDING_SCAN_CHANGED, PENDING_SCAN_EVENT } from "@/lib/dc-scan-handoff";
import { queuePendingScan } from "@/lib/actions/dc-scan-queue";

/**
 * The Scan DC screen.
 *
 * Same scanner as the one in the header, given a page of its own because the
 * menu now offers scanning as a way of starting a challan rather than as an
 * action tucked into a toolbar. A kept challan sends the operator straight to
 * the new-DC form, which is what they were heading for.
 */
export function ScanDcPanel({
  customers,
  components,
  materials,
}: {
  customers: ComboboxCustomer[];
  components: string[];
  materials: string[];
}) {
  const router = useRouter();

  async function handleApply(result: DcScanResult): Promise<boolean> {
    const { error } = await queuePendingScan(result);
    if (error) {
      // Reporting a capture that did not happen is how scans were lost before.
      toast.error(`This challan could not be held: ${error}`);
      return false;
    }
    window.dispatchEvent(new Event(PENDING_SCAN_EVENT));
    window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
    // Held, not entered. It waits on Scanned DCs until somebody checks it
    // against the paper and raises the challan.
    toast.success("Challan captured. It is waiting under Scanned DCs.");
    router.push("/dashboard/dc/scanned");
    return true;
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          Photograph or upload the customer&apos;s inward challan. What is read is shown for
          checking before anything is filled in, and nothing is saved until you create the delivery
          challan.
        </p>
        <DcScanDialog
          customers={customers}
          components={components}
          materials={materials}
          onApply={handleApply}
        />
      </CardContent>
    </Card>
  );
}
