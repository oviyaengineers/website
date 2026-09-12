import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search-box";
import { ScannedDcList } from "@/components/scanned-dc-list";
import { listConvertedScans, listPendingScans } from "@/lib/actions/dc-scan-queue";
import { scannedDcMatches } from "@/lib/dc-search";

export const metadata: Metadata = { title: "Scanned DCs | Oviya Engineers" };

/**
 * Customer DCs received, and what has become of them.
 *
 * Nothing on this screen is a delivery challan of ours. Scanning records what
 * the customer sent in; no DC number is issued and no challan exists until
 * somebody raises one, which may be days later when the work is finished.
 */
export default async function ScannedDcsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [allPending, allConverted] = await Promise.all([listPendingScans(), listConvertedScans()]);
  // Searching only narrows what is shown. It never converts, edits or
  // discards anything.
  const pending = q ? allPending.filter((scan) => scannedDcMatches(scan, q)) : allPending;
  const converted = q ? allConverted.filter((scan) => scannedDcMatches(scan, q)) : allConverted;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scanned DCs</h1>
          <p className="text-sm text-muted-foreground">
            {q
              ? `${pending.length} of ${allPending.length} waiting match "${q}".`
              : "Customer DCs received and waiting for work completion. Our delivery challan is created only when you ask for it."}
          </p>
        </div>
        <Button
          render={<Link href="/dashboard/dc/scan" />}
          variant="outline"
          className="h-11 sm:h-8"
        >
          <ScanLine className="h-4 w-4" /> Scan another
        </Button>
      </div>

      <SearchBox placeholder="Customer DC number, customer, component, material or date..." />

      <ScannedDcList pending={pending} converted={converted} searchTerm={q} />
    </div>
  );
}
