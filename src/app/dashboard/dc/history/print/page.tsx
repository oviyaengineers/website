import { format } from "date-fns";
import type { Metadata } from "next";
import { PrintNowButton } from "@/components/print-now-button";
import { HISTORY_KIND_LABELS, parseHistoryFilters, type HistoryFilters } from "@/lib/dc-history";
import { fetchDcHistory } from "@/lib/dc-history-data";

export const metadata: Metadata = { title: "Print DC History | Oviya Engineers" };

function day(date: string): string {
  return format(new Date(`${date}T00:00:00`), "dd MMM yyyy");
}

/** The filters in words, printed with the sheet so it can be trusted later. */
function describeFilters(filters: HistoryFilters): string {
  const parts: string[] = [];
  if (filters.from || filters.to) {
    parts.push(
      `${filters.from ? day(filters.from) : "earliest"} to ${filters.to ? day(filters.to) : "latest"}`
    );
  } else {
    parts.push("All dates");
  }
  if (filters.customer) parts.push(filters.customer);
  if (filters.component) parts.push(filters.component);
  if (filters.q) parts.push(`matching "${filters.q}"`);
  return parts.join(" · ");
}

/**
 * The DC history as an internal report.
 *
 * Balance is printed here because this sheet stays in the works. The challan
 * the customer receives is a different page and still carries no balance.
 */
export default async function DcHistoryPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const filters = parseHistoryFilters(await searchParams);
  const { records, summary, error } = await fetchDcHistory(filters);

  return (
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">DC History (internal)</p>
          <p className="text-xs text-neutral-600">{describeFilters(filters)}</p>
          <p className="text-xs text-neutral-600">
            Dated by our DC date, or the customer DC date for scanned DCs not yet raised.
          </p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>Printed {format(new Date(), "dd MMM yyyy HH:mm")}</p>
          <p>
            {summary.totalRecords} record{summary.totalRecords === 1 ? "" : "s"} · Scanned pending{" "}
            {summary.scannedPending} · Dispatched pending {summary.dispatchedPending} · Completed{" "}
            {summary.completed}
          </p>
        </div>
      </div>

      <PrintNowButton label="Print this history" />

      {error ? <p className="text-sm">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th>DC Number</th>
              <th>Customer</th>
              <th>Customer DC Number</th>
              <th>Component</th>
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
            {records.map((record) => (
              <tr key={record.key}>
                <td>{day(record.date)}</td>
                <td>
                  {record.dcNumber ?? "-"}
                  {record.followUpOf ? ` (follow-up of ${record.followUpOf.dcNumber})` : ""}
                </td>
                <td>{record.customerName}</td>
                <td>{record.customerDcNumbers.join(", ") || "-"}</td>
                <td>{record.component ?? "-"}</td>
                <td>{record.material ?? "-"}</td>
                <td className="text-right">
                  {record.received ?? (record.pending !== null ? `${record.pending} pending` : "-")}
                </td>
                <td className="text-right">{record.sent}</td>
                <td className="text-right">{record.materialProblem}</td>
                <td className="text-right">{record.rejection}</td>
                <td className="text-right">{record.balance ?? "-"}</td>
                <td>{HISTORY_KIND_LABELS[record.kind]}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center">
                  No DC record matches these filters.
                </td>
              </tr>
            )}
            {records.length > 0 && (
              <tr className="font-semibold">
                <td colSpan={6}>Total (each quantity counted once)</td>
                <td className="text-right">{summary.received}</td>
                <td className="text-right">{summary.sent}</td>
                <td className="text-right">{summary.materialProblem}</td>
                <td className="text-right">{summary.rejection}</td>
                <td className="text-right">{summary.balance}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
