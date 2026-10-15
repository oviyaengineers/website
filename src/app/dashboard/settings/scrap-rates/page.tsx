import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrapRateManager } from "@/components/scrap-rate-manager";

export const metadata: Metadata = { title: "Scrap Rates | Oviya Engineers" };

export default async function ScrapRatesPage() {
  const supabase = await createClient();
  const [{ data: materials }, { data: periods }, { profile }] = await Promise.all([
    supabase.from("dc_picklist_items").select("id, name").eq("kind", "material").order("name"),
    supabase
      .from("scrap_rate_periods")
      .select("id, material_group, effective_from, effective_to, rate_per_kg, approved_at")
      .order("approved_at", { ascending: false })
      .order("id", { ascending: false }),
    getCurrentUserAndProfile(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scrap Rates</h1>
        <p className="text-sm text-muted-foreground">
          Scrap value uses each DC&apos;s recorded scrap weight and Sent Qty with the approved rate
          for its date. Older approved ranges and recorded rates are kept unchanged.
        </p>
        <p className="text-sm text-muted-foreground">
          To add a material to the list, use{" "}
          <Link className="underline underline-offset-2" href="/dashboard/settings/components">
            Components &amp; Materials
          </Link>
          .
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set date-based rates</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrapRateManager
            canEdit={profile?.role === "admin"}
            periods={(periods ?? []) as {
              id: string;
              material_group: string;
              effective_from: string;
              effective_to: string;
              rate_per_kg: number;
              approved_at: string;
            }[]}
            materials={(materials ?? []).map((material) => ({ id: material.id, name: material.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
