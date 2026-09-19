"use client";

import { useI18n } from "@/components/i18n-provider";
import { DownloadPdfButton, PrintNowButton } from "@/components/print-now-button";

/**
 * Print and Download for one challan. Both use the clean PDF of this very
 * page, so the printout and the saved file are identical to the screen, in
 * English or Tamil, with no browser URL, date or page number on them.
 */
export function DcPrintActions() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <PrintNowButton label={t("dcPrint.print")} />
      <DownloadPdfButton label={t("dcPrint.downloadPdf")} />
    </div>
  );
}
