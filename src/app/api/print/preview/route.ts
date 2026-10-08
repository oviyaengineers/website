import type { NextRequest } from "next/server";
import { allowedPrintPage } from "@/lib/print/allowed-print-paths";

export const dynamic = "force-dynamic";

/** A small mobile-friendly preview with an explicit Print control. */
export async function GET(request: NextRequest) {
  const page = allowedPrintPage(request.nextUrl.searchParams.get("path"));
  if (!page) {
    return new Response("This page cannot be printed.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const pdfParams = new URLSearchParams({ path: page.path });
  const pdfUrl = `/api/print/pdf?${pdfParams.toString()}`;
  const downloadUrl = `${pdfUrl}&download=1`;
  const title = page.kind === "DC" ? "Delivery Challan" : "Print Preview";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f4f6f9">
  <title>${title} | Oviya Engineers</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { display: grid; grid-template-rows: auto minmax(0, 1fr); background: #e9edf2; color: #172033; font: 16px system-ui, sans-serif; }
    header { display: flex; align-items: center; gap: 10px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; background: #f4f6f9; border-bottom: 1px solid #d5dbe3; }
    button, a { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #bcc5d0; border-radius: 8px; padding: 0 16px; background: #fff; color: #172033; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    button.primary { border-color: #10233f; background: #10233f; color: #fff; }
    iframe { width: 100%; height: 100%; border: 0; background: #41464d; }
    #status { margin: 0 0 0 auto; color: #526174; font-size: 12px; }
    @media (max-width: 420px) { header { gap: 8px; padding-inline: 8px; } button, a { padding-inline: 12px; font-size: 14px; } }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { width: 210mm; height: 297mm; overflow: hidden; }
      body { display: block; background: #fff; }
      header { display: none !important; }
      iframe { display: block; width: 210mm; height: 297mm; }
    }
  </style>
</head>
<body>
  <header>
    <button type="button" onclick="history.back()" aria-label="Go back">Back</button>
    <button class="primary" type="button" onclick="printDocument()">Print</button>
    <a href="${downloadUrl}" aria-label="Download PDF">Download PDF</a>
    <p id="status" role="status" aria-live="polite"></p>
  </header>
  <iframe id="print-document" name="print-document" title="${title} PDF preview" src="${pdfUrl}"></iframe>
  <script>
    function printDocument() {
      const frame = document.getElementById("print-document");
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        document.getElementById("status").textContent = "This browser cannot print the preview. Open the PDF and use its Print control.";
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
