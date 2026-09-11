import { format } from "date-fns";
import type { DcRow } from "@/lib/dc-rows";

/**
 * A list of item lines laid out for paper.
 *
 * Shared by the Stock and Completed sheets so the two cannot drift apart, and
 * deliberately plain: the print stylesheet owns the borders and sizing, and a
 * screen component with its own card chrome does not survive a page break.
 */
export function DcRowPrintTable({
  rows,
  showBalance,
}: {
  rows: DcRow[];
  /** Stock needs the outstanding column; a completed sheet is all zeros. */
  showBalance: boolean;
}) {
  const totals = rows.reduce(
    (sum, row) => ({
      received: sum.received + row.received,
      sent: sum.sent + row.sent,
      materialProblem: sum.materialProblem + row.materialProblem,
      rejection: sum.rejection + row.rejection,
      pending: sum.pending + row.pending,
    }),
    { received: 0, sent: 0, materialProblem: 0, rejection: 0, pending: 0 }
  );

  return (
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
            {showBalance && <th className="text-right">Balance</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium">{row.dcNumber}</td>
              <td>{format(new Date(row.dcDate), "dd MMM yyyy")}</td>
              <td>{row.customerName}</td>
              <td>{row.customerDcNumbers.length > 0 ? row.customerDcNumbers.join(", ") : "-"}</td>
              <td>{row.component}</td>
              <td>{row.material ?? "-"}</td>
              <td className="text-right">{row.received}</td>
              <td className="text-right">{row.sent}</td>
              <td className="text-right">{row.materialProblem}</td>
              <td className="text-right">{row.rejection}</td>
              {showBalance && <td className="text-right">{row.pending}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showBalance ? 11 : 10} className="py-6 text-center">
                Nothing to list.
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="font-semibold">
              <td colSpan={6}>Total</td>
              <td className="text-right">{totals.received}</td>
              <td className="text-right">{totals.sent}</td>
              <td className="text-right">{totals.materialProblem}</td>
              <td className="text-right">{totals.rejection}</td>
              {showBalance && <td className="text-right">{totals.pending}</td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
