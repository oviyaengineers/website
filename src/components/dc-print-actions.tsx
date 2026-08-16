"use client";

import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { DcPdfDocument, type DcPdfData } from "@/lib/pdf/dc-pdf";

export function DcPrintActions({ dc }: { dc: DcPdfData }) {
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

  return (
    <div className="flex gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print
      </Button>
      <Button onClick={handleDownload} disabled={downloading}>
        <Download className="h-4 w-4" /> {downloading ? "Preparing..." : "Download PDF"}
      </Button>
    </div>
  );
}
