import { format } from "date-fns";
import type { Metadata } from "next";
import { DcRowPrintTable } from "@/components/dc-row-print-table";
import { PrintNowButton } from "@/components/print-now-button";
import { fetchDcRows } from "@/lib/dc-rows";

export const metadata: Metadata = { title: "Print Completed DCs | Oviya Engineers" };

/** Finished lines on paper, for filing against the customer's own records. */
export default async function CompletedPrintPage() {
  const rows = await fetchDcRows();
  const completed = rows.filter((row) => row.received > 0 && row.pending === 0);
  const challans = new Set(completed.map((row) => row.dcId)).size;

  return (
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">Completed DCs</p>
          <p className="text-xs text-neutral-600">
            Lines where everything received has been accounted for back to the customer.
          </p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>Printed {format(new Date(), "dd MMM yyyy HH:mm")}</p>
          <p>
            {completed.length} line{completed.length === 1 ? "" : "s"} across {challans} challan
            {challans === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <PrintNowButton label="Print completed list" />
      <DcRowPrintTable rows={completed} showBalance={false} />
    </div>
  );
}
