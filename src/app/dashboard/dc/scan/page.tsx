import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ScanDcPanel } from "@/components/scan-dc-panel";

export const metadata: Metadata = { title: "Scan DC | Oviya Engineers" };

export default async function ScanDcPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: picklistItems }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("dc_picklist_items").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Scan DC</h1>
        <p className="text-sm text-muted-foreground">
          Read an inward challan from a photograph and check it before it fills the form.
        </p>
      </div>
      <ScanDcPanel
        customers={customers ?? []}
        components={(picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name)}
        materials={(picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name)}
      />
    </div>
  );
}
