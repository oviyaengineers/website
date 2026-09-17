"use client";

import { useI18n } from "@/components/i18n-provider";

/**
 * Page setup for printing a delivery challan, and the matching advice.
 *
 * The site-wide print rule gives every other document an A4 page with 12mm
 * margins, and the challan asks for a margin-free page by name. Some browsers
 * and phone print services ignore named pages, which put the margins back and
 * pushed the halves off the middle of the sheet. Setting the page directly on
 * the challan print screens, after the site rule, holds everywhere.
 *
 * The print dialog can still override it, so the settings that give exact
 * halves are shown above the sheet (and never printed).
 */
export function DcPrintPageSetup() {
  const { t } = useI18n();
  return (
    <>
      <style>{"@media print { @page { size: A4 portrait; margin: 0; } }"}</style>
      <p className="max-w-xl text-xs text-muted-foreground print:hidden">{t("dcPrint.printTip")}</p>
    </>
  );
}
