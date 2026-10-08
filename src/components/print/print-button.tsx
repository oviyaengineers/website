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
    async (href: string, onPdf: (pdf: Blob, name: string) => void | Promise<void>) => {
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
        await onPdf(await response.blob(), name ?? "document.pdf");
        setStatus({ busy: false, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus({ busy: false, error: null });
          return;
        }
        setStatus({ busy: false, error: t("dcPrint.pdfFailed") });
      }
    },
    [t]
  );
  return { status, run };
}

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveFileHandle>;
};

type FileShareNavigator = Navigator & {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title: string }) => Promise<void>;
};

function isMobileBrowser(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function suggestedPdfName(): string {
  const title = document.title.trim().replace(/[\\/:*?"<>|]/g, "-");
  return `${title || "document"}.pdf`;
}

/** Ask where to save when supported, otherwise use the browser's download setting. */
async function savePdf(pdf: Blob, name: string) {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker.call(window, { suggestedName: name });
    const writable = await handle.createWritable();
    await writable.write(pdf);
    await writable.close();
    return;
  }

  // On mobile, the system share sheet can save directly to Files or another
  // folder when that action is provided by the device.
  const file = new File([pdf], name, { type: "application/pdf" });
  const fileShare = navigator as FileShareNavigator;
  if (isMobileBrowser() && fileShare.share && fileShare.canShare?.({ files: [file] })) {
    try {
      await fileShare.share({ files: [file], title: name });
      return;
    } catch (error) {
      // Closing the share sheet is a normal cancel; other errors fall back to download.
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }

  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

/** Print the preview directly on phones; desktop printing uses the clean PDF. */
export function PrintButton({ label, english = false }: { label?: string; english?: boolean }) {
  const t = useStrings(english);
  const href = usePrintPdfHref();
  const firstCall = useOncePerTap();

  const print = useCallback(() => {
    if (!firstCall()) return;
    if (isMobileBrowser()) {
      // Print the visible preview through the phone's native print dialog.
      window.print();
      return;
    }
    // Desktop keeps the clean PDF flow, without browser-added headers/footers.
    window.open(href, "_blank", "noopener");
  }, [firstCall, href]);

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
      >
        <Printer className="h-4 w-4" />{" "}
        {label ?? t("dcPrint.print")}
      </Button>
      <p className="basis-full text-xs text-muted-foreground sm:hidden">
        {t("dcPrint.mobileDirectPrintHint")}
      </p>
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
    const savePicker = (window as SavePickerWindow).showSaveFilePicker;
    const pickerPromise = savePicker
      ? savePicker.call(window, { suggestedName: suggestedPdfName() })
      : null;
    void run(href, async (pdf, name) => {
      if (pickerPromise) {
        const handle = await pickerPromise;
        const writable = await handle.createWritable();
        await writable.write(pdf);
        await writable.close();
      } else {
        await savePdf(pdf, name);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button
        render={<a href={href} />}
        onClick={(event) => {
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
