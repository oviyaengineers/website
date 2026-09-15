"use client";

import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n/dates";
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
  const { t, lang } = useI18n();
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
            <th>{t("dc.cols.dcNo")}</th>
            <th>{t("common.date")}</th>
            <th>{t("common.customer")}</th>
            <th>{t("dc.cols.theirDcNo")}</th>
            <th>{t("dc.cols.description")}</th>
            <th>{t("common.material")}</th>
            <th className="text-right">{t("dc.qty.received")}</th>
            <th className="text-right">{t("dc.qty.sent")}</th>
            <th className="text-right">{t("dc.qty.matProblem")}</th>
            <th className="text-right">{t("dc.qty.rejection")}</th>
            {showBalance && <th className="text-right">{t("dc.qty.balance")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium">{row.dcNumber}</td>
              <td>{formatDate(row.dcDate, "dd MMM yyyy", lang)}</td>
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
                {t("dcViews.nothingToList")}
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="font-semibold">
              <td colSpan={6}>{t("dc.qty.total")}</td>
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
