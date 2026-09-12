"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FilePlus2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { discardPendingScans, type PendingScan } from "@/lib/actions/dc-scan-queue";
import { PENDING_SCAN_CHANGED } from "@/lib/dc-scan-handoff";

/**
 * Scans waiting to become delivery challans.
 *
 * A scan is not a challan and does not become one on its own. It sits here
 * until somebody opens it, checks the figures against the paper, and creates
 * the challan — which is the point at which a DC number is issued and the
 * record exists. Until then nothing has been committed to the books.
 */
export function ScannedDcList({ scans }: { scans: PendingScan[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);

  function discard(id: string, label: string) {
    setWorking(id);
    startTransition(async () => {
      const { error } = await discardPendingScans([id]);
      setWorking(null);
      if (error) {
        toast.error(`Could not discard that scan: ${error}`);
        return;
      }
      window.dispatchEvent(new Event(PENDING_SCAN_CHANGED));
      toast.success(`Discarded the scan of ${label}.`);
      router.refresh();
    });
  }

  if (scans.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing is waiting. A challan you scan and keep appears here until you turn it into a
          delivery challan.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {scans.map((scan) => {
        const label = scan.customerDcNumber || "this challan";
        const received = scan.items.reduce((total, item) => total + (item.received_qty || 0), 0);
        return (
          <Card key={scan.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{scan.customerDcNumber || "No customer DC number"}</p>
                  <p className="text-sm text-muted-foreground">
                    {scan.customerDcDate
                      ? format(new Date(scan.customerDcDate), "dd MMM yyyy")
                      : "No date read"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Scanned {format(new Date(scan.scannedAt), "dd MMM yyyy HH:mm")}
                </p>
              </div>

              {scan.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items were read from this scan.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="py-1 text-left font-medium">Description</th>
                        <th className="py-1 text-left font-medium">Material</th>
                        <th className="py-1 text-right font-medium">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scan.items.map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1.5 pr-3">{item.component}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">
                            {item.material ?? "-"}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{item.received_qty}</td>
                        </tr>
                      ))}
                      <tr className="border-t font-medium">
                        <td className="py-1.5" colSpan={2}>
                          Total received
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{received}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {/* The scan id travels in the URL, so the form fills itself
                    from this one rather than from everything waiting. */}
                <Button render={<Link href={`/dashboard/dc/new?scan=${scan.id}`} />}>
                  <FilePlus2 className="h-4 w-4" /> Create delivery challan
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending && working === scan.id}
                  onClick={() => discard(scan.id, label)}
                >
                  <Trash2 className="h-4 w-4" />
                  {pending && working === scan.id ? "Discarding..." : "Discard"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
