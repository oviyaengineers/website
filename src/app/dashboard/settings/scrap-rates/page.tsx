import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrapRateManager } from "@/components/scrap-rate-manager";
import { sharedScrapRates } from "@/lib/scrap-rate-groups";

export const metadata: Metadata = { title: "Scrap Rates | Oviya Engineers" };

export default async function ScrapRatesPage() {
  const supabase = await createClient();
  const [{ data: materials }, { data: rates }, { data: periods }, { profile }] = await Promise.all([
    supabase.from("dc_picklist_items").select("id, name").eq("kind", "material").order("name"),
    supabase
      .from("scrap_material_rates")
      .select("material_id, rate_per_kg, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("scrap_rate_periods")
      .select("id, material_group, effective_from, effective_to, rate_per_kg, approved_at")
      .order("effective_from", { ascending: false }),
    getCurrentUserAndProfile(),
  ]);
  const sharedRates = sharedScrapRates(materials ?? [], rates ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scrap Rates</h1>
        <p className="text-sm text-muted-foreground">
          Approve a scrap rate for a DC date range. Scrap value uses each DC&apos;s sent quantity and
          the rate approved for its DC date. Date based approvals are retained as history.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a material and rate</CardTitle>
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
            materials={(materials ?? []).map((material) => ({
              id: material.id,
              name: material.name,
              ratePerKg: sharedRates.byMaterialId.get(material.id) ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
