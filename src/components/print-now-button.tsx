"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

/**
 * The address of the clean PDF of the print page this is shown on.
 *
 * Every ERP printout goes through /api/print/pdf rather than the browser's own
 * print, which stamps the page URL, the date and "Page 1 of 2" on the paper
 * (and on iPhone and iPad cannot be told not to).
 */
export function usePrintPdfHref(download = false): string {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const path = search ? `${pathname}?${search}` : pathname;
  return `/api/print/pdf?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

/**
 * Opens the page as a clean PDF in a new tab, ready to print or share. Hidden
 * on the printed sheet itself.
 */
export function PrintNowButton({ label }: { label?: string }) {
  const { t } = useI18n();
  const href = usePrintPdfHref();
  return (
    <div className="print:hidden">
      <Button
        render={<a href={href} target="_blank" rel="noopener" />}
        variant="outline"
        className="h-11 sm:h-9"
      >
        <Printer className="h-4 w-4" /> {label ?? t("dcForm.printThisList")}
      </Button>
    </div>
  );
}

/** Saves the same clean PDF as a file. */
export function DownloadPdfButton({ label }: { label: string }) {
  const href = usePrintPdfHref(true);
  return (
    <div className="print:hidden">
      <Button render={<a href={href} />} className="h-11 sm:h-9">
        <Download className="h-4 w-4" /> {label}
      </Button>
    </div>
  );
}
