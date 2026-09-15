import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceNumberSettingsForm } from "@/components/invoice-number-settings-form";
import { fetchInvoiceSeries } from "@/lib/billing-data";

export const metadata: Metadata = { title: "Invoice Numbers | Oviya Engineers" };

const SERIES = [
  {
    kind: "gst",
    title: "GST tax invoices",
    note: "Used when GST Bill is ON.",
  },
  {
    kind: "non_gst",
    title: "Normal bills (no GST)",
    note: "Used when GST Bill is OFF.",
  },
] as const;

export default async function InvoiceNumberSettingsPage() {
  const series = await fetchInvoiceSeries();
  const byKind = new Map(series.map((row) => [row.kind, row]));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Numbers</h1>
        <p className="text-sm text-muted-foreground">
          Two independent series, both separate from DC numbering. A number is only used when an
          invoice or bill is issued, and an issued or cancelled one keeps its number forever.
        </p>
      </div>
      {SERIES.map(({ kind, title, note }) => {
        const row = byKind.get(kind);
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
              <p className="text-sm text-muted-foreground">{note}</p>
            </CardHeader>
            <CardContent>
              {row ? (
                <InvoiceNumberSettingsForm series={row} />
              ) : (
                <p className="text-sm text-destructive">
                  This number series is not set up. Apply migration 0027.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
