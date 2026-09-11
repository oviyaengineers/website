import { format } from "date-fns";
import type { Metadata } from "next";
import { balanceQty } from "@/lib/dc-balance";
import { DC_LIFECYCLE_LABELS } from "@/lib/dc-lifecycle";
import { fetchDcSummaries, totalDcSummaries } from "@/lib/dc-list";
import { PrintNowButton } from "@/components/print-now-button";

export const metadata: Metadata = { title: "Print DC List | Oviya Engineers" };

type Search = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
};

/**
 * Says in words which challans are on the sheet.
 *
 * A printed list with no statement of its filters is a list nobody can trust
 * a week later, so the criteria are printed with it rather than only living
 * in the URL that produced it.
 */
function describeFilters(filters: Search): string {
  const parts: string[] = [];
  if (filters.from && filters.to) {
    parts.push(
      `${format(new Date(filters.from), "dd MMM yyyy")} to ${format(new Date(filters.to), "dd MMM yyyy")}`
    );
  } else if (filters.from) {
    parts.push(`from ${format(new Date(filters.from), "dd MMM yyyy")}`);
  } else if (filters.to) {
    parts.push(`up to ${format(new Date(filters.to), "dd MMM yyyy")}`);
  }
  if (filters.status) {
    parts.push(
      DC_LIFECYCLE_LABELS[filters.status as keyof typeof DC_LIFECYCLE_LABELS] ?? filters.status
    );
  }
  if (filters.component) parts.push(filters.component);
  if (filters.q) parts.push(`matching "${filters.q}"`);
  return parts.length > 0 ? parts.join(" · ") : "All challans";
}

export default async function DcPrintListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const summaries = await fetchDcSummaries(filters);
  const totals = totalDcSummaries(summaries);

  return (
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">Delivery Challan List</p>
          <p className="text-xs text-neutral-600">{describeFilters(filters)}</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>Printed {format(new Date(), "dd MMM yyyy HH:mm")}</p>
          <p>
            {summaries.length} challan{summaries.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <PrintNowButton />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th>DC #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Their DC #</th>
              <th>Description</th>
              <th>Material</th>
              <th className="text-right">Received</th>
              <th className="text-right">Sent</th>
              <th className="text-right">Mat. Problem</th>
              <th className="text-right">Rejection</th>
              <th className="text-right">Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.flatMap((dc) => {
              // One line per item, with the challan details only on its first
              // line. A challan with no items still prints, so an empty one is
              // visible rather than silently missing from the sheet.
              const rows = dc.items.length > 0 ? dc.items : [null];
              return rows.map((item, index) => (
                <tr key={`${dc.id}-${item?.id ?? "empty"}`}>
                  {index === 0 ? (
                    <>
                      <td rowSpan={rows.length} className="font-medium">
                        {dc.dcNumber}
                      </td>
                      <td rowSpan={rows.length}>{format(new Date(dc.dcDate), "dd MMM yyyy")}</td>
                      <td rowSpan={rows.length}>{dc.customerName}</td>
                      <td rowSpan={rows.length}>
                        {dc.customerDcNumbers.length > 0 ? dc.customerDcNumbers.join(", ") : "-"}
                      </td>
                    </>
                  ) : null}
                  <td>{item?.component ?? "-"}</td>
                  <td>{item?.material ?? "-"}</td>
                  <td className="text-right">{item?.received_qty ?? 0}</td>
                  <td className="text-right">{item?.sent_qty ?? 0}</td>
                  <td className="text-right">{item?.material_problem_qty ?? 0}</td>
                  <td className="text-right">{item?.rejection_qty ?? 0}</td>
                  <td className="text-right">{item ? balanceQty(item) : 0}</td>
                  {index === 0 ? (
                    <td rowSpan={rows.length}>{DC_LIFECYCLE_LABELS[dc.lifecycle]}</td>
                  ) : null}
                </tr>
              ));
            })}
            {summaries.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center">
                  No delivery challans match these filters.
                </td>
              </tr>
            )}
            {summaries.length > 0 && (
              <tr className="font-semibold">
                <td colSpan={6}>Total</td>
                <td className="text-right">{totals.received}</td>
                <td className="text-right">{totals.sent}</td>
                <td className="text-right">{totals.materialProblem}</td>
                <td className="text-right">{totals.rejection}</td>
                <td className="text-right">{totals.balance}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
