"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PrintActions } from "@/components/print/print-preview";
import { useI18n } from "@/components/i18n-provider";

/** Set on <html> while a sheet overflows, so print shows a warning instead. */
const OVERFLOW_FLAG = "dcPrintOverflow";

/** True when anything inside any copy reaches past the bottom of its page or half. */
function sheetOverflows(): boolean {
  const sheets = document.querySelectorAll<HTMLElement>(".dc-print-page .dc-print-sheet");
  return [...sheets].some((sheet) => {
    const bottom = sheet.getBoundingClientRect().bottom;
    return [...sheet.children].some((child) => child.getBoundingClientRect().bottom > bottom + 0.5);
  });
}

/**
 * Measures the printed sheets as the browser actually lays them out, and
 * offers Print only when every copy fits its page. When one does not, printing
 * is blocked with a clear warning, and a better layout is offered when there
 * is one — nothing is ever cut off. Pressing Ctrl+P anyway prints the warning.
 */
export function DcPrintFitCheck({
  backHref,
  alternative,
  fullPages = false,
}: {
  backHref: string;
  /** A layout that can hold the content, offered when this one overflows. */
  alternative?: { href: string; label: string };
  /** The sheet is ORIGINAL and DUPLICATE on separate full pages. */
  fullPages?: boolean;
}) {
  const { t } = useI18n();
  const [overflow, setOverflow] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const over = sheetOverflows();
      if (over) root.dataset[OVERFLOW_FLAG] = "1";
      else delete root.dataset[OVERFLOW_FLAG];
      setOverflow(over);
    };
    const raf = requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    document
      .querySelectorAll(".dc-print-page .dc-print-sheet, .dc-print-page tbody")
      .forEach((el) => observer.observe(el));
    window.addEventListener("beforeprint", measure);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("beforeprint", measure);
      delete root.dataset[OVERFLOW_FLAG];
    };
  }, []);

  if (overflow === null) return null;

  if (overflow) {
    return (
      <div
        role="alert"
        className="max-w-xl rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fullPages ? t("dcCombined.overflowFullTitle") : t("dcCombined.overflowTitle")}
        </p>
        <p className="mt-1">
          {fullPages ? t("dcCombined.overflowFullBody") : t("dcCombined.overflowBody")}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {alternative && (
            <Link href={alternative.href} className="font-medium underline">
              {alternative.label}
            </Link>
          )}
          <Link href={backHref} className="font-medium underline">
            {t("dcCombined.back")}
          </Link>
        </div>
      </div>
    );
  }

  return <PrintActions />;
}
