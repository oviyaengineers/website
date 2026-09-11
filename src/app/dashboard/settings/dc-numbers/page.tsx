import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DcNumberSettingsForm } from "@/components/dc-number-settings-form";
import { getDcNumberSeries } from "@/lib/actions/dc-numbering";

export const metadata: Metadata = { title: "DC Number Settings | Oviya Engineers" };

export default async function DcNumberSettingsPage() {
  const series = await getDcNumberSeries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">DC Number Settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose the financial year and the serial the next delivery challan takes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numbering series</CardTitle>
        </CardHeader>
        <CardContent>
          {series ? (
            <DcNumberSettingsForm series={series} />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-destructive">
                The numbering series is not set up in the database yet.
              </p>
              <p className="text-muted-foreground">
                Run migration 0015_dc_number_series.sql in Supabase, then reload this page. Challans
                can still be created in the meantime — they keep taking numbers from the old
                calendar-year series.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What a change does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Challans already issued keep the numbers they have. Nothing on this screen rewrites
            them.
          </p>
          <p>
            Moving the serial back over a number that was already used is allowed. The next challan
            steps past anything taken, so a run of numbers burned by mistake can be reclaimed
            without a clash.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
