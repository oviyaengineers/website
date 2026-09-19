import type { Metadata } from "next";
import { DcRowPrintTable } from "@/components/dc-row-print-table";
import { PrintPreview, ReportLetterhead } from "@/components/print/print-preview";
import { fetchDcRows } from "@/lib/dc-rows";
import { getTranslator } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/dates";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("dcViews.stockPrintTitle")} | Oviya Engineers` };
}

/** The stock list on paper: what should be countable on the floor today. */
export default async function StockPrintPage() {
  const [rows, { t, lang }] = await Promise.all([fetchDcRows(), getTranslator()]);
  const pending = rows.filter((row) => row.pending > 0);
  const total = pending.reduce((sum, row) => sum + row.pending, 0);

  return (
    <PrintPreview back={{ href: "/dashboard/stock", label: t("common.back") }}>
      <div className="report-print-stage">
        <div className="dc-list-print space-y-4 bg-white p-4 text-black">
          <ReportLetterhead
            title={t("nav.stockBalance")}
            details={<p className="text-xs text-neutral-600">{t("dcViews.stockPrintIntro")}</p>}
            aside={
              <>
                <p>
                  {t("dcPrintList.printed", {
                    when: formatDate(new Date(), "dd MMM yyyy HH:mm", lang),
                  })}
                </p>
                <p>{t("dcViews.piecesOnFloorCount", { count: total })}</p>
              </>
            }
          />
          <DcRowPrintTable rows={pending} showBalance />
        </div>
      </div>
    </PrintPreview>
  );
}
