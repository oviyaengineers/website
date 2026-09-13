import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DcForm } from "@/components/dc-form";
import { BreadcrumbRecordLabel } from "@/components/dashboard-breadcrumb";
import { updateDcAction } from "@/lib/actions/dc";
import { componentNameIndex, componentNameOf } from "@/lib/dc-components";
import { bookableOnLine, challanSettledIn, indexChain } from "@/lib/dc-chain";
import { fetchChainRows } from "@/lib/dc-chain-data";
import { dcLifecycle } from "@/lib/dc-lifecycle";

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

  // The Edit button is hidden on a completed challan, but the URL is still
  // reachable — from a bookmark, or from the address bar. A challan whose
  // quantities all reconcile is usually invoiced, so it has to be reopened
  // deliberately before it can be changed. Judged across the chain, the same
  // way the challan's own page judges it, so the two cannot disagree.
  const chainRows = await fetchChainRows(supabase);
  const chain = indexChain(chainRows);
  if (dcLifecycle(dc.status, items ?? [], challanSettledIn(items ?? [], chain)) === "completed") {
    return (
      <div className="space-y-6">
        <BreadcrumbRecordLabel value={dc.dc_number} />
        <div>
          <h1 className="text-2xl font-semibold">{dc.dc_number} is completed</h1>
          <p className="text-sm text-muted-foreground">
            Every piece received on this challan has been accounted for.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6 text-sm">
            <p>
              Completed challans are not edited in place, because the figures on them have usually
              been billed. Open the challan and choose Reopen to put it back into draft, make the
              correction, then confirm it again.
            </p>
            <Button render={<Link href={`/dashboard/dc/${dc.id}`} />}>Open the challan</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const boundAction = updateDcAction.bind(null, id);
  const components = (picklistItems ?? []).filter((i) => i.kind === "component").map((i) => i.name);
  const materials = (picklistItems ?? []).filter((i) => i.kind === "material").map((i) => i.name);

  // What each line this challan continues can still take, from the shared
  // chain calculation. This challan's own rows are left out of the count: the
  // form is about to replace them, so counting them would leave no room for
  // the very figures being edited.
  const others = chainRows.filter((row) => row.dc_id !== id);
  const parentIds = [
    ...new Set((items ?? []).map((i) => i.parent_item_id).filter((p): p is string => Boolean(p))),
  ];
  const followUpRoom = Object.fromEntries(
    parentIds.map((parentId) => [parentId, bookableOnLine(parentId, others)])
  );

  return (
    <div className="space-y-6">
      <BreadcrumbRecordLabel value={dc.dc_number} />
      <div>
        <h1 className="text-2xl font-semibold">Edit {dc.dc_number}</h1>
        <p className="text-sm text-muted-foreground">Update delivery challan details.</p>
      </div>
      {/* Keyed on the DC so switching to a different one remounts the form and
          re-seeds every field from props, rather than leaving stale state. */}
      <DcForm
        key={dc.id}
        customers={customers ?? []}
        dc={dc}
        items={(items ?? []).map((i) => ({
          // The current name, so the form's dropdown finds the part rather
          // than showing an empty select for a row written before a rename.
          component: componentNameOf(i, componentNameIndex(picklistItems ?? [])),
          material: i.material,
          received_qty: i.received_qty,
          sent_qty: i.sent_qty,
          material_problem_qty: i.material_problem_qty,
          rejection_qty: i.rejection_qty,
          // A follow-up row keeps its link to the line it continues. Without
          // it the form took the row for an ordinary line and asked what was
          // received, and saving would have cut it loose from the challan it
          // completes.
          parent_item_id: i.parent_item_id,
        }))}
        followUpRoom={followUpRoom}
        action={boundAction}
        components={components}
        materials={materials}
      />
    </div>
  );
}
