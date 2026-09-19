import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownloadPdfButton, PrintButton } from "@/components/print/print-button";
import { PrintLetterhead } from "@/components/dc-print-sheet";

/**
 * The print preview every ERP printout opens in: Open document > Print
 * preview > Print.
 *
 * The page covers the app with the document exactly as it will be printed,
 * under a toolbar that never prints: a way back, and the Print and Download
 * PDF buttons (or the page's own actions). Print makes a clean PDF of this
 * very page on the server, so the paper matches the preview and carries none
 * of the browser's URL, date or page number.
 *
 * A new printout needs only this shell around its document, and its page
 * listed in src/lib/print/allowed-print-paths.ts.
 */
export function PrintPreview({
  back,
  actions,
  notes,
  english = false,
  children,
}: {
  /** Where the toolbar's Back / Close goes. */
  back: { href: string; label: string; close?: boolean };
  /** Replaces the standard Print and Download PDF buttons. */
  actions?: React.ReactNode;
  /** Anything else for the toolbar, below the buttons: choices, hints. */
  notes?: React.ReactNode;
  /** The standard buttons in English whatever the language (Billing). */
  english?: boolean;
  /** The document itself, in its own print stage. */
  children: React.ReactNode;
}) {
  const BackIcon = back.close ? X : ArrowLeft;
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#f4f6f9] text-[#172033] print:static print:overflow-visible print:bg-white">
      <div className="sticky top-0 z-10 space-y-3 border-b bg-[#f4f6f9]/95 p-4 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Button render={<Link href={back.href} />} variant="outline">
            <BackIcon className="h-4 w-4" /> {back.label}
          </Button>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {actions ?? <PrintActions english={english} />}
          </div>
        </div>
        {notes}
      </div>
      {children}
    </div>
  );
}

/** The standard pair: 🖨 Print and Download PDF. */
export function PrintActions({
  english = false,
  printLabel,
}: {
  english?: boolean;
  printLabel?: string;
}) {
  return (
    <>
      <PrintButton english={english} label={printLabel} />
      <DownloadPdfButton english={english} />
    </>
  );
}

/**
 * The head of a printed report: the same letterhead as the challan and the
 * invoice, in the same ruled box, then the report's title and details on the
 * left and when it was printed on the right.
 */
export function ReportLetterhead({
  title,
  details,
  aside,
}: {
  title: string;
  details?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="report-print-head">
      <div className="border border-[#222] bg-white px-6 py-2 text-[#172033]">
        <PrintLetterhead />
      </div>
      <div className="flex items-start justify-between gap-4 border-x border-b border-[#222] px-3 py-2">
        <div>
          <p className="text-base font-bold text-[#10233f]">{title}</p>
          {details}
        </div>
        {aside ? <div className="text-right text-xs text-neutral-600">{aside}</div> : null}
      </div>
    </header>
  );
}
