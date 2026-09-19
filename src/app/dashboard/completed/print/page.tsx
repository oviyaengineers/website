import type { Metadata } from "next";
import { DcRowPrintTable } from "@/components/dc-row-print-table";
import { PrintPreview, ReportLetterhead } from "@/components/print/print-preview";
import { fetchDcRows } from "@/lib/dc-rows";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcViews.completedPrintTitle")} | Oviya Engineers` };
}

/** Finished lines on paper, for filing against the customer's own records. */
export default async function CompletedPrintPage() {
  const [rows, { t, lang }] = await Promise.all([fetchDcRows(), getTranslator()]);
  const completed = rows.filter((row) => row.received > 0 && row.pending === 0);
  const challans = new Set(completed.map((row) => row.dcId)).size;

  return (
    <PrintPreview back={{ href: "/dashboard/completed", label: t("common.back") }}>
      <div className="report-print-stage">
        <div className="dc-list-print space-y-4 bg-white p-4 text-black">
          <ReportLetterhead
            title={t("nav.completedDcs")}
            details={<p className="text-xs text-neutral-600">{t("dcViews.completedIntro")}</p>}
            aside={
              <>
                <p>
                  {t("dcPrintList.printed", {
                    when: formatDate(new Date(), "dd MMM yyyy HH:mm", lang),
                  })}
                </p>
                <p>{t("dcViews.linesChallans", { lines: completed.length, challans })}</p>
              </>
            }
          />
          <DcRowPrintTable rows={completed} showBalance={false} />
        </div>
      </div>
    </PrintPreview>
  );
}
