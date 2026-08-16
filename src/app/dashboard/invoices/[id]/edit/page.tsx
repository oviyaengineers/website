import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm, type DcOption } from "@/components/invoice-form";
import { updateInvoiceAction } from "@/lib/actions/invoices";

export const metadata: Metadata = { title: "Edit Invoice | Oviya Engineers" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (!invoice) notFound();

  const [{ data: items }, { data: customers }, { data: dcs }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("customers").select("id, name").order("name"),
    supabase
      .from("delivery_challans")
      .select("id, dc_number, customer_id")
      .order("dc_date", { ascending: false }),
  ]);

  let dcOptions: DcOption[] = [];
  if (dcs && dcs.length > 0) {
    const { data: allItems } = await supabase
      .from("delivery_challan_items")
      .select("*")
      .in(
        "dc_id",
        dcs.map((d) => d.id)
      )
      .order("sort_order");
    dcOptions = dcs.map((dc) => ({
      id: dc.id,
      dc_number: dc.dc_number,
      customer_id: dc.customer_id,
      items: (allItems ?? [])
        .filter((i) => i.dc_id === dc.id)
        .map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unit_price: 0 })),
    }));
  }

  const boundAction = updateInvoiceAction.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit {invoice.invoice_number}</h1>
        <p className="text-sm text-muted-foreground">Update invoice details.</p>
      </div>
      <InvoiceForm
        customers={customers ?? []}
        dcs={dcOptions}
        invoice={invoice}
        items={(items ?? []).map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        }))}
        action={boundAction}
      />
    </div>
  );
}
