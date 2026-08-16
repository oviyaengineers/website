import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DcForm } from "@/components/dc-form";
import { createDcAction } from "@/lib/actions/dc";

export const metadata: Metadata = { title: "New Delivery Challan | Oviya Engineers" };

export default async function NewDcPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: nextDcNumber }, { data: picklistItems }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.rpc("generate_dc_number"),
    supabase.from("dc_picklist_items").select("*").order("name"),
  ]);
  const components = (picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name);
  const materials = (picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Delivery Challan</h1>
        <p className="text-sm text-muted-foreground">Fill in the details below.</p>
      </div>
      <DcForm
        customers={customers ?? []}
        nextDcNumber={typeof nextDcNumber === "string" ? nextDcNumber : null}
        action={createDcAction}
        components={components}
        materials={materials}
      />
    </div>
  );
}
