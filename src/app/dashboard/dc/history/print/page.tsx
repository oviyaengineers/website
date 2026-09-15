import type { Metadata } from "next";
import { PrintNowButton } from "@/components/print-now-button";
import { HISTORY_KIND_KEYS, parseHistoryFilters, type HistoryFilters } from "@/lib/dc-history";
import { fetchDcHistory } from "@/lib/dc-history-data";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcHistory.printButton")} | Oviya Engineers` };
}

/** The filters in words, printed with the sheet so it can be trusted later. */
function describeFilters(filters: HistoryFilters, t: Translate, lang: Lang): string {
  const day = (date: string) => formatDate(date, "dd MMM yyyy", lang);
  const parts: string[] = [];
  if (filters.from || filters.to) {
    parts.push(
      t("dcHistory.rangeLower", {
        from: filters.from ? day(filters.from) : t("dcHistory.earliestLower"),
        to: filters.to ? day(filters.to) : t("dcHistory.latest"),
      })
    );
  } else {
    parts.push(t("dcHistory.allDatesShort"));
  }
  if (filters.customer) parts.push(filters.customer);
  if (filters.component) parts.push(filters.component);
  if (filters.q) parts.push(t("dcHistory.matching", { q: filters.q }));
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
  const [{ records, summary, error }, { t, lang }] = await Promise.all([
    fetchDcHistory(filters),
    getTranslator(),
  ]);
  const day = (date: string) => formatDate(date, "dd MMM yyyy", lang);
  const summaryParams = {
    count: summary.totalRecords,
    scanned: summary.scannedPending,
    dispatched: summary.dispatchedPending,
    completed: summary.completed,
  };

  return (
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">{t("dcHistory.printTitle")}</p>
          <p className="text-xs text-neutral-600">{describeFilters(filters, t, lang)}</p>
          <p className="text-xs text-neutral-600">{t("dcHistory.datedBy")}</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>
            {t("dcHistory.printed", { when: formatDate(new Date(), "dd MMM yyyy HH:mm", lang) })}
          </p>
          <p>
            {summary.totalRecords === 1
              ? t("dcHistory.summaryLineOne", summaryParams)
              : t("dcHistory.summaryLine", summaryParams)}
          </p>
        </div>
      </div>

      <PrintNowButton label={t("dcHistory.printButton")} />

      {error ? <p className="text-sm">{t("dcHistory.fromAfterTo")}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>{t("dcHistory.dcNumber")}</th>
              <th>{t("common.customer")}</th>
              <th>{t("dcHistory.customerDcNumber")}</th>
              <th>{t("common.component")}</th>
              <th>{t("common.material")}</th>
              <th className="text-right">{t("dc.qty.received")}</th>
              <th className="text-right">{t("dc.qty.sent")}</th>
              <th className="text-right">{t("dc.qty.matProblem")}</th>
              <th className="text-right">{t("dc.qty.rejection")}</th>
              <th className="text-right">{t("dc.qty.balance")}</th>
              <th>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.key}>
                <td>{day(record.date)}</td>
                <td>
                  {record.dcNumber ?? "-"}
                  {record.followUpOf
                    ? ` ${t("dcHistory.followUpOfInline", { dc: record.followUpOf.dcNumber })}`
                    : ""}
                </td>
                <td>{record.customerName}</td>
                <td>{record.customerDcNumbers.join(", ") || "-"}</td>
                <td>{record.component ?? "-"}</td>
                <td>{record.material ?? "-"}</td>
                <td className="text-right">
                  {record.received ??
                    (record.pending !== null
                      ? t("dcHistory.pendingCount", { count: record.pending })
                      : "-")}
                </td>
                <td className="text-right">{record.sent}</td>
                <td className="text-right">{record.materialProblem}</td>
                <td className="text-right">{record.rejection}</td>
                <td className="text-right">{record.balance ?? "-"}</td>
                <td>{t(HISTORY_KIND_KEYS[record.kind])}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 text-center">
                  {t("dcHistory.noMatch")}
                </td>
              </tr>
            )}
            {records.length > 0 && (
              <tr className="font-semibold">
                <td colSpan={6}>{t("dcHistory.totalCountedOnce")}</td>
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
