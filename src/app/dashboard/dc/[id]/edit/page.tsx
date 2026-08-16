import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DcForm } from "@/components/dc-form";
import { updateDcAction } from "@/lib/actions/dc";

export const metadata: Metadata = { title: "Edit Delivery Challan | Oviya Engineers" };

export default async function EditDcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: dc }, { data: items }, { data: customers }, { data: picklistItems }] =
    await Promise.all([
      supabase.from("delivery_challans").select("*").eq("id", id).single(),
      supabase.from("delivery_challan_items").select("*").eq("dc_id", id).order("sort_order"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("dc_picklist_items").select("*").order("name"),
    ]);

  if (!dc) notFound();

  const boundAction = updateDcAction.bind(null, id);
  const components = (picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name);
  const materials = (picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit {dc.dc_number}</h1>
        <p className="text-sm text-muted-foreground">Update delivery challan details.</p>
      </div>
      <DcForm
        customers={customers ?? []}
        dc={dc}
        items={(items ?? []).map((i) => ({
          component: i.component,
          material: i.material,
          received_qty: i.received_qty,
          sent_qty: i.sent_qty,
          material_problem_qty: i.material_problem_qty,
          rejection_qty: i.rejection_qty,
          remarks: i.remarks,
        }))}
        action={boundAction}
        components={components}
        materials={materials}
      />
    </div>
  );
}
