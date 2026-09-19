import type { Metadata } from "next";
import { DC_LIFECYCLE_KEYS, type DcLifecycle } from "@/lib/dc-lifecycle";
import { fetchDcSummaries, totalDcSummaries } from "@/lib/dc-list";
import { PrintPreview, ReportLetterhead } from "@/components/print/print-preview";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";
import type { Lang } from "@/lib/i18n/config";
import type { Translate } from "@/lib/i18n/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcPrintList.pageTitle")} | Oviya Engineers` };
}

type Search = {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  component?: string;
  customer?: string;
  material?: string;
};

/**
 * Says in words which challans are on the sheet.
 *
 * A printed list with no statement of its filters is a list nobody can trust
 * a week later, so the criteria are printed with it rather than only living
 * in the URL that produced it.
 */
function describeFilters(filters: Search, t: Translate, lang: Lang): string {
  const day = (value: string) => formatDate(value, "dd MMM yyyy", lang);
  const parts: string[] = [];
  if (filters.from && filters.to) {
    parts.push(t("dcPrintList.range", { from: day(filters.from), to: day(filters.to) }));
  } else if (filters.from) {
    parts.push(t("dcPrintList.fromOnly", { from: day(filters.from) }));
  } else if (filters.to) {
    parts.push(t("dcPrintList.upTo", { to: day(filters.to) }));
  }
  if (filters.status) {
    parts.push(
      filters.status in DC_LIFECYCLE_KEYS
        ? t(DC_LIFECYCLE_KEYS[filters.status as DcLifecycle])
        : filters.status
    );
  }
  if (filters.customer) parts.push(filters.customer);
  if (filters.component) parts.push(filters.component);
  if (filters.material) parts.push(filters.material);
  if (filters.q) parts.push(t("dcPrintList.matching", { q: filters.q }));
  return parts.length > 0 ? parts.join(" · ") : t("dcPrintList.allChallans");
}

export default async function DcPrintListPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const [summaries, { t, lang }] = await Promise.all([fetchDcSummaries(filters), getTranslator()]);
  const totals = totalDcSummaries(summaries);
  // Back to the challan list with the same filters.
  const backQuery = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();

  return (
    <PrintPreview
      back={{ href: `/dashboard/dc${backQuery ? `?${backQuery}` : ""}`, label: t("common.back") }}
    >
      <div className="report-print-stage">
        <div className="dc-list-print space-y-4 bg-white p-4 text-black">
          <ReportLetterhead
            title={t("dcPrintList.title")}
            details={
              <p className="text-xs text-neutral-600">{describeFilters(filters, t, lang)}</p>
            }
            aside={
              <>
                <p>
                  {t("dcPrintList.printed", {
                    when: formatDate(new Date(), "dd MMM yyyy HH:mm", lang),
                  })}
                </p>
                <p>
                  {summaries.length === 1
                    ? t("dc.list.countOne")
                    : t("dc.list.count", { count: summaries.length })}
                </p>
              </>
            }
          />

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
                  <th className="text-right">{t("dc.qty.balance")}</th>
                  <th>{t("common.status")}</th>
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
                          <td rowSpan={rows.length}>
                            {formatDate(dc.dcDate, "dd MMM yyyy", lang)}
                          </td>
                          <td rowSpan={rows.length}>{dc.customerName}</td>
                          <td rowSpan={rows.length}>
                            {dc.customerDcNumbers.length > 0
                              ? dc.customerDcNumbers.join(", ")
                              : "-"}
                          </td>
                        </>
                      ) : null}
                      <td>{item?.component ?? "-"}</td>
                      <td>{item?.material ?? "-"}</td>
                      {/* The same chain figures as the screen, so the printed list
                      agrees with it: an original line carries its confirmed
                      follow-ups, and a follow-up line owes nothing itself. */}
                      <td className="text-right">{item ? dc.lines[index].received : 0}</td>
                      <td className="text-right">{item ? dc.lines[index].sent : 0}</td>
                      <td className="text-right">{item ? dc.lines[index].materialProblem : 0}</td>
                      <td className="text-right">{item ? dc.lines[index].rejection : 0}</td>
                      <td className="text-right">{item ? (dc.lines[index].balance ?? "—") : 0}</td>
                      {index === 0 ? (
                        <td rowSpan={rows.length}>{t(DC_LIFECYCLE_KEYS[dc.lifecycle])}</td>
                      ) : null}
                    </tr>
                  ));
                })}
                {summaries.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-6 text-center">
                      {t("dc.list.empty")}
                    </td>
                  </tr>
                )}
                {summaries.length > 0 && (
                  <tr className="font-semibold">
                    <td colSpan={6}>{t("dc.qty.total")}</td>
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
      </div>
    </PrintPreview>
  );
}
