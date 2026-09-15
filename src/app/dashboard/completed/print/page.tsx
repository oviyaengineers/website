import type { Metadata } from "next";
import { DcRowPrintTable } from "@/components/dc-row-print-table";
import { PrintNowButton } from "@/components/print-now-button";
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
    <div className="dc-list-print space-y-4 bg-white p-4 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#10233f]">Oviya Engineers</h1>
          <p className="text-sm font-medium">{t("nav.completedDcs")}</p>
          <p className="text-xs text-neutral-600">{t("dcViews.completedIntro")}</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <p>
            {t("dcPrintList.printed", { when: formatDate(new Date(), "dd MMM yyyy HH:mm", lang) })}
          </p>
          <p>{t("dcViews.linesChallans", { lines: completed.length, challans })}</p>
        </div>
      </div>

      <PrintNowButton label={t("dcViews.completedPrintButton")} />
      <DcRowPrintTable rows={completed} showBalance={false} />
    </div>
  );
}
