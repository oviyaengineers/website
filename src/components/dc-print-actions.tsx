"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { DcPdfDocument, type DcPdfData } from "@/lib/pdf/dc-pdf";

export function DcPrintActions({ dc }: { dc: DcPdfData }) {
  const { t, lang } = useI18n();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await pdf(<DcPdfDocument dc={dc} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dc.dc_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // The PDF library carries no Tamil font, so a Tamil challan is saved through
  // the browser's own print dialog, which renders the page exactly as shown.
  if (lang === "ta") {
    return (
      <div className="flex gap-2 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {t("dcPrint.printSavePdf")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> {t("dcPrint.print")}
      </Button>
      <Button onClick={handleDownload} disabled={downloading}>
        <Download className="h-4 w-4" />{" "}
        {downloading ? t("dcPrint.preparing") : t("dcPrint.downloadPdf")}
      </Button>
    </div>
  );
}
