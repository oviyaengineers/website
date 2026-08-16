import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm, type DcOption } from "@/components/invoice-form";
import { createInvoiceAction } from "@/lib/actions/invoices";

export const metadata: Metadata = { title: "New Invoice | Oviya Engineers" };

export default async function NewInvoicePage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: nextInvoiceNumber }, { data: dcs }] = await Promise.all([
    supabase.from("customers").select("id, name").order("name"),
    supabase.rpc("generate_invoice_number"),
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
        .map((i) => ({
          description: [i.component, i.material].filter(Boolean).join(" - "),
          quantity: i.sent_qty,
          unit: "nos",
          unit_price: 0,
        })),
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Invoice</h1>
        <p className="text-sm text-muted-foreground">Fill in the details below.</p>
      </div>
      <InvoiceForm
        customers={customers ?? []}
        dcs={dcOptions}
        nextInvoiceNumber={typeof nextInvoiceNumber === "string" ? nextInvoiceNumber : null}
        action={createInvoiceAction}
      />
    </div>
  );
}
