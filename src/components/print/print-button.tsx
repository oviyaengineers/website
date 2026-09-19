"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { createTranslator } from "@/lib/i18n/translate";

/**
 * The Print and Download PDF buttons shared by every ERP printout.
 *
 * Printing a web page lets the browser stamp the page URL, the date and time
 * and "Page 1 of 1" on the paper, and iPhone and iPad cannot be told not to.
 * So nothing here prints the web page itself: both buttons fetch the clean PDF
 * of the page on screen from /api/print/pdf, made with the browser header and
 * footer switched off, and print or save that. The PDF is the preview, exactly.
 *
 * - Desktop Chrome, Edge and Firefox: the PDF goes straight to the print dialog.
 * - iPhone, iPad, Android and Safari: the PDF opens in the phone's own viewer,
 *   to print from Share > Print. A PDF printed from there carries only its pages.
 */

/** The address of the clean PDF of the print page this is shown on. */
export function usePrintPdfHref(download = false): string {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const path = search ? `${pathname}?${search}` : pathname;
  return `/api/print/pdf?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

/**
 * Phones, tablets and Safari print a PDF best from their own viewer; printing
 * a PDF inside the page is dependable only in desktop Chrome, Edge and Firefox.
 */
function printsInViewer(): boolean {
  const ua = navigator.userAgent;
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
  return touchMac || safari || /iphone|ipad|ipod|android|mobile/i.test(ua);
}

/** The route's own message, from its small error page. */
async function failureText(response: Response): Promise<string> {
  const html = await response.text().catch(() => "");
  const text = new DOMParser().parseFromString(html, "text/html").querySelector("p")?.textContent;
  return text?.trim() ?? "";
}

type Status = { busy: boolean; error: string | null };

/**
 * True once per tap: a second call within a moment is ignored. One tap on a
 * link rendered as a button could reach the handler twice, which opened the
 * PDF in two tabs on a phone; a quick double tap would do the same.
 */
function useOncePerTap(): () => boolean {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < 1000) return false;
    last.current = now;
    return true;
  }, []);
}

function useStrings(english: boolean) {
  const { t } = useI18n();
  const englishT = useMemo(() => createTranslator("en"), []);
  return english ? englishT : t;
}

/** Fetches the PDF as a file, with its failures in words. */
function usePdfFetch(english: boolean) {
  const t = useStrings(english);
  const [status, setStatus] = useState<Status>({ busy: false, error: null });
  const run = useCallback(
    async (href: string, onPdf: (pdf: Blob, name: string) => void) => {
      setStatus({ busy: true, error: null });
      try {
        const response = await fetch(href, { credentials: "same-origin" });
        const type = response.headers.get("Content-Type") ?? "";
        if (!response.ok || !type.includes("application/pdf")) {
          setStatus({
            busy: false,
            error: (await failureText(response)) || t("dcPrint.pdfFailed"),
          });
          return;
        }
        const name = /filename="([^"]+)"/.exec(
          response.headers.get("Content-Disposition") ?? ""
        )?.[1];
        onPdf(await response.blob(), name ?? "document.pdf");
        setStatus({ busy: false, error: null });
      } catch {
        setStatus({ busy: false, error: t("dcPrint.pdfFailed") });
      }
    },
    [t]
  );
  return { status, run };
}

/** Prints a PDF through a hidden frame, so the print dialog shows the PDF itself. */
function printPdfInFrame(pdf: Blob, frameRef: React.RefObject<HTMLIFrameElement | null>) {
  frameRef.current?.remove();
  const url = URL.createObjectURL(pdf);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      // A browser that will not print a framed PDF shows it instead.
      window.open(url, "_blank", "noopener");
    }
  };
  document.body.appendChild(frame);
  frameRef.current = frame;
}

function StatusLine({ status, english }: { status: Status; english: boolean }) {
  const t = useStrings(english);
  if (status.error) {
    return (
      <p role="alert" className="basis-full text-sm text-destructive">
        {status.error}
      </p>
    );
  }
  if (status.busy) {
    return (
      <p role="status" className="basis-full text-xs text-muted-foreground">
        {t("dcPrint.preparingPdf")}
      </p>
    );
  }
  return null;
}

/**
 * 🖨 Print: the clean PDF of this page, to the printer. Ctrl+P / ⌘P on the page
 * does the same, so the browser's own print (with its URL and date) is not used
 * by accident. Hidden on the printed sheet itself.
 */
export function PrintButton({ label, english = false }: { label?: string; english?: boolean }) {
  const t = useStrings(english);
  const href = usePrintPdfHref();
  const { status, run } = usePdfFetch(english);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const busy = status.busy;
  const firstCall = useOncePerTap();

  const print = useCallback(() => {
    if (busy || !firstCall()) return;
    if (printsInViewer()) {
      // Opened straight from the tap, so it is never blocked as a pop-up.
      window.open(href, "_blank");
      return;
    }
    void run(href, (pdf) => printPdfInFrame(pdf, frameRef));
  }, [busy, firstCall, href, run]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [print]);

  // The hidden print frame goes when the preview is left.
  useEffect(() => {
    const frames = frameRef;
    return () => frames.current?.remove();
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        render={<a href={href} target="_blank" rel="noopener" />}
        onClick={(event) => {
          event.preventDefault();
          print();
        }}
        variant="outline"
        className="h-11 sm:h-9"
        aria-busy={status.busy}
      >
        {status.busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Printer className="h-4 w-4" />
        )}{" "}
        {label ?? t("dcPrint.print")}
      </Button>
      <StatusLine status={status} english={english} />
    </div>
  );
}

/** Saves the same clean PDF as a file. */
export function DownloadPdfButton({
  label,
  english = false,
}: {
  label?: string;
  english?: boolean;
}) {
  const t = useStrings(english);
  const href = usePrintPdfHref(true);
  const { status, run } = usePdfFetch(english);
  const firstCall = useOncePerTap();

  const save = () => {
    if (status.busy || !firstCall()) return;
    void run(href, (pdf, name) => {
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        render={<a href={href} />}
        onClick={(event) => {
          // Phones save through their own download handling of the link.
          if (printsInViewer()) return;
          event.preventDefault();
          save();
        }}
        className="h-11 sm:h-9"
        aria-busy={status.busy}
      >
        {status.busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}{" "}
        {label ?? t("dcPrint.downloadPdf")}
      </Button>
      <StatusLine status={status} english={english} />
    </div>
  );
}
