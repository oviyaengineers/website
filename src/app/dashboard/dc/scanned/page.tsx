import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScannedDcList } from "@/components/scanned-dc-list";
import { listPendingScans } from "@/lib/actions/dc-scan-queue";

export const metadata: Metadata = { title: "Scanned DCs | Oviya Engineers" };

/**
 * Challans that have been read from a photograph but not yet entered.
 *
 * They are held on the server, so one scanned on the shop floor is here when
 * the desk opens this page. Nothing on this screen is a delivery challan yet:
 * no number has been issued and nothing is on the books until one is created.
 */
export default async function ScannedDcsPage() {
  const scans = await listPendingScans();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scanned DCs</h1>
          <p className="text-sm text-muted-foreground">
            {scans.length === 0
              ? "Challans read from a photograph, waiting to be entered."
              : `${scans.length} scanned challan${scans.length === 1 ? "" : "s"} waiting to be entered.`}
          </p>
        </div>
        <Button render={<Link href="/dashboard/dc/scan" />} variant="outline">
          <ScanLine className="h-4 w-4" /> Scan another
        </Button>
      </div>

      <ScannedDcList scans={scans} />
    </div>
  );
}
