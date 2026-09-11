import { format } from "date-fns";
import type { Metadata } from "next";
import { DcRowPrintTable } from "@/components/dc-row-print-table";
import { PrintNowButton } from "@/components/print-now-button";
import { fetchDcRows } from "@/lib/dc-rows";

export const metadata: Metadata = { title: "Print Stock | Oviya Engineers" };

/** The stock list on paper: what should be countable on the floor today. */
export default async function StockPrintPage() {
  const rows = await fetchDcRows();
  const pending = rows.filter((row) => row.pending > 0);
  const total = pending.reduce((sum, row) => sum + row.pending, 0);

  return (
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">Stock / Balance</p>
          <p className="text-xs text-neutral-600">
            Pieces received that have not yet gone back to the customer.
          </p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>Printed {format(new Date(), "dd MMM yyyy HH:mm")}</p>
          <p>{total} pieces on the floor</p>
        </div>
      </div>

      <PrintNowButton label="Print stock list" />
      <DcRowPrintTable rows={pending} showBalance />
    </div>
  );
}
