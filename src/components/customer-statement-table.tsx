import { formatRupees } from "@/lib/billing";
import { formatDate } from "@/lib/i18n/dates";
import type { Statement } from "@/lib/customer-statement";

/**
 * The Customer Statement table, the same on screen and on paper. English
 * only, like every Billing screen: it carries rates and values.
 */

const day = (value: string | null) => (value ? formatDate(value, "dd MMM yyyy", "en") : "—");
const qty = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function CustomerStatementTable({ statement }: { statement: Statement }) {
  const { rows } = statement;
  return (
    <table className="customer-statement-table w-full border-collapse text-sm">
      {/* Widths that fit the 190mm of an A4 portrait page; the description wraps. */}
      <colgroup>
        {[11, 9, 22, 9, 10, 9, 9, 9, 12].map((width, i) => (
          <col key={i} style={{ width: `${width}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th>Customer DC No.</th>
          <th>Customer DC Date</th>
          <th>Component / Description</th>
          <th className="num">Received Qty</th>
          <th>Our DC No.</th>
          <th>Our DC Date</th>
          <th className="num">Completed DC Qty</th>
          <th className="num">Cost / Rate (₹)</th>
          <th className="num">Total Value (₹)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>
              {row.customerDcs.length ? row.customerDcs.map((ref) => ref.number).join(", ") : "—"}
            </td>
            <td>
              {row.customerDcs.length
                ? row.customerDcs.map((ref) => day(ref.date)).join(", ")
                : "—"}
            </td>
            <td>
              {row.component}
              {row.material ? ` (${row.material})` : ""}
            </td>
            <td className="num">
              {row.received === null ? (
                <span className="text-xs">
                  — follow-up of <span className="whitespace-nowrap">{row.followUpOf}</span>
                </span>
              ) : (
                qty(row.received)
              )}
            </td>
            <td>{row.dcNumber}</td>
            <td>{day(row.dcDate)}</td>
            <td className="num">{qty(row.completed)}</td>
            <td className="num">{row.rate === null ? "Not Available" : formatRupees(row.rate)}</td>
            <td className="num">{row.value === null ? "—" : formatRupees(row.value)}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="py-6 text-center">
              No issued DCs for this customer in this period.
            </td>
          </tr>
        ) : null}
      </tbody>
      {rows.length > 0 ? (
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={6}>Total Completed Quantity</td>
            <td className="num">{qty(statement.totalCompleted)}</td>
            <td className="num">Grand Total Value</td>
            <td className="num">{formatRupees(statement.grandTotal)}</td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/** Said under the table when some completed lines have no rate, so the total is read correctly. */
export function StatementRateNote({ statement }: { statement: Statement }) {
  if (statement.withoutRate === 0) return null;
  return (
    <p className="text-xs">
      {statement.withoutRate === 1 ? "1 line has" : `${statement.withoutRate} lines have`} no rate
      in the Rate List, shown as Not Available and not included in the Grand Total Value.
    </p>
  );
}
