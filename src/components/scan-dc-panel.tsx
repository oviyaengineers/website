"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { DcScanDialog, type DcScanResult } from "@/components/dc-scan-dialog";
import type { ComboboxCustomer } from "@/components/customer-combobox";
import { PENDING_SCAN_EVENT, storePendingScan } from "@/lib/dc-scan-handoff";

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

  function handleApply(result: DcScanResult): boolean {
    const queued = storePendingScan(result);
    if (queued === 0) {
      toast.error(
        "This challan could not be held for the delivery challan form. Enter it by hand, or try again outside private browsing."
      );
      return false;
    }
    window.dispatchEvent(new Event(PENDING_SCAN_EVENT));
    toast.success("Challan captured. Opening the new delivery challan.");
    router.push("/dashboard/dc/new");
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
