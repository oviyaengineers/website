import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyBillingSettingsForm } from "@/components/company-billing-settings-form";
import { fetchCompanySettings, missingCompanyDetails } from "@/lib/billing-data";

export const metadata: Metadata = { title: "Billing Details | Oviya Engineers" };

export default async function BillingDetailsPage() {
  const settings = await fetchCompanySettings();
  const missing = missingCompanyDetails(settings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing Details</h1>
        <p className="text-sm text-muted-foreground">
          Your company&apos;s details as printed on every invoice. Each invoice keeps a copy of
          these as they were on the day it was issued.
        </p>
      </div>
      {missing.length > 0 ? (
        <p className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          Invoices cannot be issued until the {missing.join(", ")}{" "}
          {missing.length === 1 ? "is" : "are"} entered.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seller, bank and defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyBillingSettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
