import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceNumberSettingsForm } from "@/components/invoice-number-settings-form";
import { fetchInvoiceSeries } from "@/lib/billing-data";

export const metadata: Metadata = { title: "Invoice Numbers | Oviya Engineers" };

export default async function InvoiceNumberSettingsPage() {
  const series = await fetchInvoiceSeries();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Invoice Numbers</h1>
        <p className="text-sm text-muted-foreground">
          The invoice series, separate from DC numbering. A number is only used when an invoice is
          issued, and an issued or cancelled invoice keeps its number forever.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numbering series</CardTitle>
        </CardHeader>
        <CardContent>
          {series ? (
            <InvoiceNumberSettingsForm series={series} />
          ) : (
            <p className="text-sm text-destructive">
              The invoice number series is not set up. Apply migration 0025.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
